import { createClient } from '@supabase/supabase-js'
import { sendEmail , hasEmailProvider} from './_email-client.js'
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

  // Use the raw request bytes captured by handler.js on req.rawBody.
  // JSON.stringify(req.body) is NOT byte-identical to the sender's payload
  // (key ordering, whitespace, escaped characters all differ) so it cannot
  // substitute for the raw bytes when verifying an HMAC signature.
  // Pen-test P2 deferred item #316. Fall back to JSON.stringify only if
  // rawBody is somehow missing (e.g. non-JSON POST body already stringified).
  const rawBody = req.rawBody
    || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body))

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
  const { claimNumber, status, paymentAmount, paymentDate, reason, patientName, invoiceNumber, eventId } = parsed
  if (!claimNumber || !status) return res.status(400).json({ error: 'claimNumber and status required' })

  const supabase = supabaseAdmin()

  // Idempotency guard (pen-test #313-C2). ACC's retry policy fires the same
  // event up to 3× on transient timeouts. Without a dedup guard, every retry
  // re-runs the UPDATE (overwriting paid_at/amount_paid) and re-sends the
  // admin decline email. Insert into processed_webhook_events; if the
  // (source, event_id) pair already exists we NOOP and return the ack ACC
  // wants (200) without touching acc_claims or emailing again.
  //
  // If ACC doesn't include an eventId, fall back to a synthetic key from
  // (claim + status + timestamp-truncated-to-minute) so accidental double-
  // click at the ACC portal is still deduped even without an explicit id.
  const dedupKey = eventId
    || `${claimNumber}:${status}:${new Date().toISOString().slice(0, 16)}`
  const { error: dedupErr } = await supabase
    .from('processed_webhook_events')
    .insert({
      source: 'acc',
      event_id: dedupKey,
      metadata: { claim_number: claimNumber, status, has_native_event_id: !!eventId },
    })
  if (dedupErr) {
    if (dedupErr.code === '23505') {
      // Duplicate — already processed. Return 200 so ACC stops retrying.
      console.log('[acc-webhook] duplicate event ignored:', dedupKey)
      return res.status(200).json({ ok: true, duplicate: true })
    }
    // If the dedup table isn't present yet (migration not applied) fall
    // through and process the event — same behaviour as before this fix.
    // Comment out this fallback once 2026-08-26_webhook_event_dedup.sql
    // has landed in prod for a week.
    console.warn('[acc-webhook] dedup insert failed (proceeding):', dedupErr.message)
  }

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
      if (hasEmailProvider()) {
        try {
          await sendEmail({
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
    res.status(500).json({ error: 'Server error' })
  }
}
