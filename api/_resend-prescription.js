// POST /api/resend-prescription
//   Body: { prescriptionId, deliveryChannel? }
//
// Rebuilds the Rx PDF from stored fields PLUS current patient/provider data
// (so an address correction in the patient record flows through on resend),
// and re-sends to the SAME pharmacy already on the prescription row. Audit
// event: prescription.resent (distinct from redirected — pharmacy unchanged).
//
// Use case: pharmacy flagged a missing/incorrect field (patient address,
// prescriber contact), admin updates the patient/provider record, then clicks
// "📧 Resend" on the Rx row to push the corrected PDF to the same pharmacy.

import { createClient } from '@supabase/supabase-js'
import { sendEmail, hasEmailProvider } from './_email-client.js'
import { buildPrescriptionPdf } from './_pdf-builders.js'
import { isSignatureExempt } from './_drug-classifications.js'
import { guardProvider } from './_auth.js'
import { writeAuditEvent } from './_audit-write.js'
import { isPracticeConsult } from './_practice-guard.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const auth = await guardProvider(req, res)
  if (!auth) return

  const { prescriptionId, deliveryChannel } = req.body || {}
  if (!prescriptionId) return res.status(400).json({ error: 'prescriptionId required' })

  const supabase = admin()

  const { data: rx, error: rxErr } = await supabase
    .from('prescriptions').select('*').eq('id', prescriptionId).maybeSingle()
  if (rxErr) { console.error('[resend-prescription] rxErr:', rxErr); return res.status(500).json({ error: 'Server error' }) }
  if (!rx) return res.status(404).json({ error: 'Prescription not found' })

  // Sandbox suppression — practice-mode Rx must never re-fax/re-email.
  if (rx.consultation_id && await isPracticeConsult(supabase, rx.consultation_id)) {
    return res.status(200).json({ sent: false, simulated: true, reason: 'practice_mode' })
  }

  // Must have a destination to resend to — the whole point is same pharmacy
  // as original. If both channels are empty, there's nothing to retry.
  if (!rx.pharmacy_email && !rx.pharmacy_fax) {
    return res.status(400).json({ error: 'Original pharmacy has no email or fax on file. Use Change pharmacy instead.' })
  }

  // Pull current prescriber contact (phone enforcement already blocks initial
  // prescribe; a resend from an existing row should still carry fresh values
  // if the provider updated their mobile between then and now).
  let signatureUrl = null
  let providerEmail = null
  let providerPhone = null
  if (rx.provider_id) {
    try {
      const { data: prov } = await supabase
        .from('providers').select('signature_url, email, mobile_phone').eq('id', rx.provider_id).maybeSingle()
      if (prov?.signature_url) signatureUrl = prov.signature_url
      if (prov?.email) providerEmail = prov.email
      if (prov?.mobile_phone) providerPhone = prov.mobile_phone
    } catch {}
  }

  // Pull patient_address fresh from the consult (then fall back to patients
  // table). This is the whole point of the resend — admin corrected the
  // address and wants the pharmacy to see the correction.
  let patientAddress = null
  if (rx.consultation_id) {
    try {
      const { data: consult } = await supabase
        .from('consultations').select('patient_address').eq('id', rx.consultation_id).maybeSingle()
      if (consult?.patient_address) patientAddress = consult.patient_address
    } catch {}
  }
  if (!patientAddress && rx.patient_nhi) {
    try {
      const { data: pat } = await supabase
        .from('patients').select('address').eq('nhi', rx.patient_nhi).maybeSingle()
      if (pat?.address) patientAddress = pat.address
    } catch {}
  }

  const signatureExempt = isSignatureExempt(rx.drug)

  const pdfData = {
    providerName:     rx.provider_name || '',
    providerEmail,
    providerPhone,
    prescriberNumber: rx.prescriber_number || '',
    patientName:      rx.patient_name || '',
    patientNhi:       rx.patient_nhi || '',
    patientDob:       rx.patient_dob || '',
    patientAddress,
    drug:             rx.drug || '',
    dose:             rx.dose || '',
    directions:       rx.directions || '',
    quantity:         rx.quantity || '',
    repeats:          rx.repeats || 0,
    pharmacyName:     rx.pharmacy_name || '',
    pharmacyAddress:  rx.pharmacy_address || '',
    signatureUrl,
    signatureExempt,
  }

  let pdfBuffer
  try {
    pdfBuffer = await buildPrescriptionPdf(pdfData)
  } catch (e) {
    console.error('[resend-prescription] PDF rebuild failed:', e)
    return res.status(500).json({ error: 'PDF rebuild failed' })
  }

  const deliveryErrors = []
  let faxResult = null
  const channel = (deliveryChannel || (rx.pharmacy_email ? 'email' : 'fax')).toLowerCase()
  const wantsFax   = channel === 'fax'   || channel === 'both'
  const wantsEmail = channel === 'email' || channel === 'both'

  if (wantsFax && rx.pharmacy_fax) {
    try {
      const { sendFax } = await import('./_send-fax.js')
      faxResult = await sendFax({
        to:       rx.pharmacy_fax,
        pdf:      pdfBuffer,
        filename: `prescription-${(rx.patient_name || 'patient').replace(/ /g, '-')}.pdf`,
        subject:  `Reissued prescription for ${rx.patient_name} — Tere Health`,
        tag:      `resend:${prescriptionId}`,
      })
      if (!faxResult.ok) { console.error('[resend-prescription] fax failed:', faxResult.provider, faxResult.error); deliveryErrors.push(`Fax failed (${faxResult.provider})`) }
    } catch (e) { console.error('[resend-prescription] fax exception:', e); deliveryErrors.push('Fax delivery failed') }
  }

  if (wantsEmail && rx.pharmacy_email && hasEmailProvider()) {
    try {
      const pdfBase64 = pdfBuffer.toString('base64')
      const fromName  = `Dr ${rx.provider_name || 'Prescriber'} via Tere Health`.replace(/"/g, "'")
      const replyTo   = providerEmail || 'terehealthnz@gmail.com'
      await sendEmail({
        from:        `${fromName} <hello@terehealth.co.nz>`,
        replyTo,
        to:          rx.pharmacy_email,
        subject:     `Reissued prescription for ${rx.patient_name} — Tere Health`,
        html: `<p>Please find attached the reissued prescription for <strong>${rx.patient_name}</strong>. This replaces the version previously sent and includes any corrected patient / prescriber details.</p><p>Prescriber: ${rx.provider_name}<br>Prescriber No: ${rx.prescriber_number || '—'}<br>Contact: ${replyTo}${providerPhone ? ` · ${providerPhone}` : ''}</p><p>Medication: <strong>${rx.drug}</strong><br>Directions: ${rx.directions}<br>Quantity: ${rx.quantity}, Repeats: ${rx.repeats || 0}</p>${signatureExempt ? '<p style="font-size:12px;color:#0B6E76;border-left:3px solid #0B6E76;padding-left:10px;margin-top:16px"><em>This prescription meets the requirement of the Director-General of Health\'s authorisation of August 2024 for prescriptions not signed personally by a prescriber with their usual signature.</em></p>' : ''}`,
        attachments: [{ filename: `prescription-${(rx.patient_name || 'patient').replace(/ /g, '-')}.pdf`, content: pdfBase64 }],
      })
    } catch (e) { console.error('[resend-prescription] email exception:', e); deliveryErrors.push('Email delivery failed') }
  }

  // Stamp the row with resend bookkeeping so admin / audit surfaces know the
  // Rx was reissued without changing pharmacy. Only updates the counter and
  // timestamp — pharmacy fields untouched.
  try {
    await supabase.from('prescriptions').update({
      last_resent_at:    new Date().toISOString(),
      last_resent_by_id: auth.provider?.id || null,
      resend_count:      (rx.resend_count || 0) + 1,
    }).eq('id', prescriptionId)
  } catch (e) {
    // Columns may not exist yet — resend still happened, don't fail the request.
    console.warn('[resend-prescription] resend bookkeeping fields may be missing:', e?.message)
  }

  writeAuditEvent(req, auth, {
    event_type:    'prescription.resent',
    resource_type: 'prescription',
    resource_id:   prescriptionId,
    metadata: {
      pharmacy_name:    rx.pharmacy_name,
      delivery_channel: channel,
      delivery_errors:  deliveryErrors.length ? deliveryErrors : undefined,
      had_patient_address: !!patientAddress,
      had_provider_phone:  !!providerPhone,
    },
  })

  return res.status(200).json({
    ok:              true,
    faxResult:       faxResult ? { ok: faxResult.ok, provider: faxResult.provider, providerId: faxResult.providerId, status: faxResult.status } : null,
    deliveryErrors,
    pharmacy:        rx.pharmacy_name,
    channel,
  })
}
