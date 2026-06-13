import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

function supabaseAdmin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Validate ACC webhook signature (add ACC_WEBHOOK_SECRET to env when live)
  const secret = process.env.ACC_WEBHOOK_SECRET
  if (secret) {
    const sig = req.headers['x-acc-signature']
    if (sig !== secret) return res.status(401).json({ error: 'Invalid signature' })
  }

  const { claimNumber, status, paymentAmount, paymentDate, reason, patientName, invoiceNumber } = req.body
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
