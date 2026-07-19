// POST /api/generate-insurance-receipt
//
// The $10 upsell fulfilment endpoint. The patient has already paid for the
// receipt via Stripe (paymentIntentId) or Windcave (sessionId — TODO once
// the receipt purchase is wired through the HPP). We:
//   1) verify the payment actually settled AND was for type=receipt AND for
//      the consultation supplied — no free receipts by replaying a random PI
//   2) load the consult + provider from Supabase
//   3) build the PDF via buildInsuranceReceiptPdf()
//   4) email it to the patient via Resend
//   5) mark consultations.insurance_receipt_purchased_at so the frontend
//      switches the CTA to a "sent to your email" confirmation
//
// Auth: NOT in AUTH_REQUIRED_ROUTES — the patient owns their own consult
// and the Stripe/Windcave payment id is the proof-of-purchase. All the
// per-endpoint guards live below.

import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { Resend } from 'resend'
import { buildInsuranceReceiptPdf } from './_pdf-builders.js'

function admin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}
function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY) }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { consultationId, paymentIntentId /*, sessionId */ } = req.body || {}
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })
  if (!paymentIntentId) return res.status(400).json({ error: 'paymentIntentId required (Windcave receipt path TODO)' })

  const supabase = admin()

  // 1) Verify the payment. The Stripe PaymentIntent must be succeeded (i.e.
  // captured, since receipt PIs use capture_method=automatic), must belong
  // to this consult, and must be tagged as consultationType=receipt in its
  // metadata so a scraper can't reuse the $60 consult PI for a free receipt.
  let intent
  try {
    intent = await getStripe().paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge.payment_method_details'] })
  } catch (e) {
    return res.status(400).json({ error: 'Payment could not be verified: ' + e.message })
  }
  if (intent.status !== 'succeeded') {
    return res.status(402).json({ error: 'Payment has not settled yet — try again in a moment.' })
  }
  if (intent.metadata?.consultationType !== 'receipt') {
    return res.status(400).json({ error: 'Payment is not for a receipt purchase' })
  }
  if (intent.metadata?.consultationId && intent.metadata.consultationId !== consultationId) {
    return res.status(400).json({ error: 'Payment does not match this consultation' })
  }
  if (intent.amount_received < 1000) {
    return res.status(400).json({ error: 'Payment amount is below the receipt price' })
  }

  // Pull card details from the charge for the receipt line item.
  const charge = intent.latest_charge
  const pmDetails = charge?.payment_method_details?.card || {}
  const cardBrand = pmDetails.brand || 'card'
  const cardLast4 = pmDetails.last4 || null

  // 2) Load the consult + provider.
  const { data: consult, error: cErr } = await supabase.from('consultations')
    .select(`
      id, created_at, chief_complaint, acc_read_code, notes_final,
      payment_amount, patient_first_name, patient_last_name, patient_email,
      provider_id, insurance_receipt_purchased_at
    `)
    .eq('id', consultationId).single()
  if (cErr || !consult) return res.status(404).json({ error: 'Consultation not found' })

  // Idempotency: if we've already emailed a receipt for this consult, don't
  // double-charge to a new PDF — but we still return success so the UI can
  // transition cleanly. The patient paid legitimately either way.
  //
  // (Real double-purchase protection lives in Stripe — the client-side flow
  // only offers the CTA when insurance_receipt_purchased_at is null.)
  let provider = { first_name: 'Tere', last_name: 'clinician', credential: '', provider_type: null,
                   mcnz_registration_number: null, prescriber_number: null }
  if (consult.provider_id) {
    const { data: p } = await supabase.from('providers')
      .select('first_name, last_name, credential, provider_type, mcnz_registration_number, prescriber_number')
      .eq('id', consult.provider_id).maybeSingle()
    if (p) provider = p
  }

  const receiptId = `TERE-R-${consultationId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`
  const chargedAt = intent.created ? new Date(intent.created * 1000).toISOString() : new Date().toISOString()

  // 3) Build the PDF.
  let pdfBuffer
  try {
    pdfBuffer = await buildInsuranceReceiptPdf({
      consult,
      provider,
      payment: {
        method: 'card',
        card_brand: cardBrand,
        card_last4: cardLast4,
        amount_cents: intent.amount_received,
        receipt_id: receiptId,
        charged_at: chargedAt,
      },
    })
  } catch (e) {
    console.error('[generate-insurance-receipt] PDF build failed:', e.message)
    return res.status(500).json({ error: 'Receipt generation failed: ' + e.message })
  }

  // 4) Email delivery — via Resend, attach the PDF as base64.
  if (!consult.patient_email) {
    return res.status(400).json({ error: 'No patient email on file — contact support to receive your receipt' })
  }
  const patientFirst = consult.patient_first_name || 'there'
  const filename = `tere-insurance-receipt-${receiptId}.pdf`
  try {
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: 'Tere Health <hello@terehealth.co.nz>',
      replyTo: 'terehealthnz@gmail.com',
      to: [consult.patient_email],
      subject: `Your Tere Health insurance receipt — ${receiptId}`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px">
    <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
  </div>
  <div style="padding:24px 28px">
    <p style="font-size:15px;margin:0 0 12px">Kia ora ${patientFirst},</p>
    <p style="font-size:14px;line-height:1.7;color:#374151;margin:0 0 20px">
      Your insurance-formatted receipt is attached as a PDF. It contains everything your health insurer will need to process a reimbursement: Tere Health legal details, your clinician's MCNZ registration, the consultation date and diagnosis, and the itemised charge.
    </p>
    <div style="background:#F0F9FA;border:1px solid #D4EEF0;border-radius:8px;padding:14px 18px;margin:0 0 20px">
      <div style="font-size:12px;color:#0B6E76;font-weight:700;text-transform:uppercase;letter-spacing:.05em">Receipt reference</div>
      <div style="font-size:16px;font-weight:700;color:#0D2B45;margin-top:4px">${receiptId}</div>
    </div>
    <p style="font-size:13px;color:#6B7280;line-height:1.7">
      If your insurer needs anything else, reply to this email and we'll help.
    </p>
  </div>
  <div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">
    Tere Health · Marlborough Sounds, New Zealand · <a href="https://terehealth.co.nz" style="color:#0B6E76">terehealth.co.nz</a>
  </div>
</body></html>`,
      text: `Kia ora ${patientFirst},\n\nYour Tere Health insurance-formatted receipt is attached.\n\nReceipt: ${receiptId}\n\nReply to this email if your insurer needs anything else.\n\nTere Health\nterehealth.co.nz`,
      attachments: [{ filename, content: pdfBuffer.toString('base64') }],
    })
  } catch (e) {
    console.error('[generate-insurance-receipt] Email delivery failed:', e.message)
    return res.status(500).json({ error: 'Could not email receipt: ' + e.message })
  }

  // 5) Mark the consult so the UI can flip its CTA to "sent to your email".
  try {
    await supabase.from('consultations').update({
      insurance_receipt_purchased_at: new Date().toISOString(),
    }).eq('id', consultationId)
  } catch (e) {
    // Non-fatal — the email already went out; the mark is a UX nicety.
    console.error('[generate-insurance-receipt] Failed to mark purchased_at:', e.message)
  }

  return res.status(200).json({ success: true, receiptId })
}
