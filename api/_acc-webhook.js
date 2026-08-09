import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { createHmac, timingSafeEqual } from 'node:crypto'

function supabaseAdmin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// HMAC-SHA256 signature verification with replay protection.
// Expected headers from ACC's webhook sender:
//   x-acc-timestamp: unix seconds when the request was signed
//   x-acc-signature: hex-encoded HMAC-SHA256(`${timestamp}.${rawBody}`, secret)
// If ACC's actual signing scheme differs when they finalise the contract,
// swap the message format below — the timing-safe compare + replay window
// pattern stay the same.
function verifyAccSignature({ signature, timestamp, rawBody, secret }) {
  if (!signature || !timestamp || !secret) return false
  // Reject stale requests > 5 min old to block replay.
  const skew = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(skew) || skew > 300) return false
  try {
    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`, 'utf8')
      .digest('hex')
    const a = Buffer.from(signature, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Signature verification is MANDATORY. If ACC_WEBHOOK_SECRET is not set
  // in Vercel env we reject every request — better to fail closed than
  // let an unsigned POST mark an ACC claim as paid.
  const secret = process.env.ACC_WEBHOOK_SECRET
  if (!secret) {
    console.warn('[acc-webhook] ACC_WEBHOOK_SECRET not configured — rejecting all requests')
    return res.status(503).json({ error: 'Webhook not configured' })
  }

  // handler.js delivers req.body already JSON-parsed. Reconstruct the raw
  // string for signature verification. ACC's canonical JSON round-trips
  // cleanly through JSON.stringify.
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)

  const signatureOk = verifyAccSignature({
    signature: req.headers['x-acc-signature'],
    timestamp: req.headers['x-acc-timestamp'],
    rawBody,
    secret,
  })
  if (!signatureOk) {
    console.warn('[acc-webhook] signature verification failed')
    return res.status(401).json({ error: 'Invalid signature' })
  }

  const parsed = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body) } catch { return {} } })() : (req.body || {})
  const { claimNumber, status, paymentAmount, paymentDate, reason, patientName, invoiceNumber } = parsed
  if (!claimNumber || !status) return res.status(400).json({ error: 'claimNumber and status required' })

  const supabase = supabaseAdmin()

  try {
    if (status === 'paid') {
      await supabase.from('acc_claims')
        .update({ status: 'paid', amount_paid: paymentAmount, paid_at: paymentDate, invoice_number: invoiceNumber || null })
        .eq('claim_number', claimNumber)

      await supabase.from('consultations')
        .update({ acc_payment_received: true, acc_payment_amount: paymentAmount, acc_paid_at: paymentDate })
        .eq('acc_claim_number', claimNumber)
    }

    if (status === 'invoiced') {
      await supabase.from('acc_claims')
        .update({ status: 'invoiced', invoice_number: invoiceNumber || null, invoice_submitted_at: new Date().toISOString() })
        .eq('claim_number', claimNumber)
    }

    if (status === 'declined') {
      await supabase.from('acc_claims')
        .update({ status: 'declined', decline_reason: reason || 'No reason provided' })
        .eq('claim_number', claimNumber)

      await supabase.from('consultations')
        .update({ acc_claim_status: 'declined' })
        .eq('acc_claim_number', claimNumber)

      // Notify admin
      if (process.env.RESEND_API_KEY) {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY)
          await resend.emails.send({
            from: 'Tere Health <hello@terehealth.co.nz>',
            to:   ['terehealthnz@gmail.com'],
            subject: `ACC claim declined — ${claimNumber}`,
            html: `
              <p style="font-family:Arial;max-width:600px">
                <strong>ACC Claim Declined</strong><br><br>
                Claim number: <strong>${claimNumber}</strong><br>
                Patient: ${patientName || 'Unknown'}<br>
                Reason: ${reason || 'No reason provided'}<br><br>
                <a href="https://terehealth.co.nz/clinician/admin">Review in admin dashboard →</a>
              </p>
            `,
          })
        } catch (emailErr) {
          console.error('Failed to send decline email:', emailErr.message)
        }
      }
    }

    res.json({ ok: true })
  } catch (e) {
    console.error('acc-webhook error:', e)
    res.status(500).json({ error: e.message })
  }
}
