import { createClient } from '@supabase/supabase-js'
import { sendEmail, hasEmailProvider } from './_email-client.js'
import crypto from 'node:crypto'
import { buildLabRequisitionPdf } from './_pdf-builders.js'
import { writeAuditEvent } from './_audit-write.js'

function supabaseAdmin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  )
}

export default async function handler(req, res) {
  const {
    consultationId, providerId, providerName, providerCpn, providerMcnz,
    patientId, patientName, patientNhi, patientDob,
    patientEmail, patientPhone, patientAddress,
    tests, testsFreetext, clinicalInfo,
    billingType, accClaimNumber, urgency,
  } = req.body || {}

  if (!patientName || !Array.isArray(tests) || tests.length === 0 || !clinicalInfo) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  if (!billingType || !['public', 'acc', 'private'].includes(billingType)) {
    return res.status(400).json({ error: 'billingType must be public, acc, or private' })
  }

  const supabase = supabaseAdmin()

  // Sandbox suppression - a lab order tied to a practice-mode consult must
  // never email a real patient. Matches _generate-referral-pdf.js guard.
  if (consultationId) {
    const { isPracticeConsult } = await import('./_practice-guard.js')
    if (await isPracticeConsult(supabase, consultationId)) {
      return res.status(200).json({
        ok: true,
        simulated: true,
        reason: 'practice_mode',
        pdf_url: null,
        order_id: null,
      })
    }
  }

  let signatureUrl = null
  if (providerId) {
    try {
      const { data: prov } = await supabase
        .from('providers').select('signature_url').eq('id', providerId).maybeSingle()
      if (prov?.signature_url) signatureUrl = prov.signature_url
    } catch {}
  }

  // Pre-generate the order UUID so it renders on the PDF + persists on the
  // DB row + is the filename seed for the patient email attachment.
  const orderId = crypto.randomUUID()

  const pdfData = {
    orderId,
    providerName, providerCpn, providerMcnz,
    patientName, patientNhi, patientDob,
    patientPhone, patientAddress,
    tests, testsFreetext, clinicalInfo,
    billingType, accClaimNumber, urgency: urgency || 'routine',
    signatureUrl,
  }

  let pdfBuffer
  try {
    pdfBuffer = await buildLabRequisitionPdf(pdfData)
  } catch (e) {
    console.error('[generate-lab-pdf] PDF generation failed:', e)
    return res.status(500).json({ error: 'PDF generation failed' })
  }

  const pdfBase64 = pdfBuffer.toString('base64')
  const deliveryErrors = []
  const sentAt = new Date().toISOString()

  if (patientEmail && hasEmailProvider()) {
    try {
      const testList = tests.map(t => `<li>${t}</li>`).join('') + (testsFreetext ? `<li>${testsFreetext}</li>` : '')
      await sendEmail({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: patientEmail,
        subject: 'Your lab tests from Tere Health',
        html: `<p>Hi ${patientName},</p>
<p>Your clinician has ordered the following tests:</p>
<ul>${testList}</ul>
<p><strong>What to do next:</strong> Take the attached PDF to any Awanui Labs collection centre near you. You can walk in, no appointment needed.</p>
<p><strong>Find a collection centre:</strong> <a href="https://www.awanuilabs.co.nz/patients/collection-centres">awanuilabs.co.nz/patients/collection-centres</a></p>
<p>Results will come back to your clinician within a few days. They'll contact you if anything needs a follow-up.</p>
<p>Any questions, reply to this email.</p>
<p>Tere Health Team<br>terehealth.co.nz</p>`,
        attachments: [{ filename: `lab-request-${patientName.replace(/ /g, '-')}.pdf`, content: pdfBase64 }],
      })
    } catch (e) { console.error('[generate-lab-pdf] patient email failed:', e); deliveryErrors.push('Patient email failed') }
  } else if (!patientEmail) {
    deliveryErrors.push('No patient email on file')
  }

  try {
    await supabase.from('lab_orders').insert({
      id: orderId,
      consultation_id: consultationId || null,
      provider_id: providerId || null,
      provider_name: providerName,
      provider_cpn: providerCpn,
      provider_mcnz: providerMcnz,
      patient_id: patientId || null,
      patient_name: patientName,
      patient_nhi: patientNhi || null,
      patient_dob: patientDob || null,
      patient_email: patientEmail || null,
      patient_phone: patientPhone || null,
      patient_address: patientAddress || null,
      tests,
      tests_freetext: testsFreetext || null,
      clinical_info: clinicalInfo,
      billing_type: billingType,
      acc_claim_number: accClaimNumber || null,
      urgency: urgency || 'routine',
      status: 'sent',
      sent_at: sentAt,
      delivery_status: deliveryErrors.length ? 'error' : 'sent',
      delivery_error: deliveryErrors.join('; ') || null,
    })
  } catch (e) { console.error('[generate-lab-pdf] DB save failed:', e); deliveryErrors.push('DB save failed') }

  writeAuditEvent(req, req.auth, {
    event_type:      'lab_order.issued',
    consultation_id: consultationId || null,
    resource_type:   'lab_order',
    resource_id:     orderId,
    metadata: {
      tests,
      tests_freetext:  testsFreetext || null,
      billing_type:    billingType,
      urgency:         urgency || 'routine',
      delivery_status: deliveryErrors.length ? 'error' : 'sent',
      delivery_errors: deliveryErrors.length ? deliveryErrors : undefined,
    },
  })

  res.json({ ok: true, orderId, pdfBase64, deliveryErrors: deliveryErrors.length ? deliveryErrors : undefined })
}
