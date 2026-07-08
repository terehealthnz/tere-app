// POST /api/redirect-prescription
//   Body: { prescriptionId, pharmacyId, pharmacyName, pharmacyFax, pharmacyEmail,
//           pharmacyPhone, pharmacyAddress, pharmacyHpiId, deliveryChannel }
//
// Snapshots the original pharmacy, updates the prescription row with the new
// pharmacy, rebuilds the PDF from stored fields, and re-sends via the requested
// channel(s). Used by the "Change pharmacy" button on ProviderNotes.
//
// Provider auth via guardProvider. Only providers can redirect scripts.

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { buildPrescriptionPdf } from './_pdf-builders.js'
import { guardProvider } from './_auth.js'

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

  const {
    prescriptionId,
    pharmacyId, pharmacyName, pharmacyHpiId,
    pharmacyFax, pharmacyEmail, pharmacyPhone, pharmacyAddress,
    deliveryChannel,
  } = req.body || {}

  if (!prescriptionId) return res.status(400).json({ error: 'prescriptionId required' })
  if (!pharmacyName) return res.status(400).json({ error: 'pharmacyName required' })

  const supabase = admin()

  const { data: rx, error: rxErr } = await supabase
    .from('prescriptions').select('*').eq('id', prescriptionId).maybeSingle()
  if (rxErr) return res.status(500).json({ error: rxErr.message })
  if (!rx) return res.status(404).json({ error: 'Prescription not found' })

  // Snapshot the original pharmacy for audit trail.
  const originalSnapshot = {
    pharmacy_id: rx.pharmacy_id || null,
    pharmacy_name: rx.pharmacy_name || null,
    pharmacy_fax: rx.pharmacy_fax || null,
    pharmacy_email: rx.pharmacy_email || null,
    pharmacy_phone: rx.pharmacy_phone || null,
    pharmacy_address: rx.pharmacy_address || null,
    pharmacy_hpi_id: rx.pharmacy_hpi_id || null,
    snapshot_at: new Date().toISOString(),
  }

  // Look up provider signature for the rebuilt PDF.
  let signatureUrl = null
  if (rx.provider_id) {
    try {
      const { data: prov } = await supabase
        .from('providers').select('signature_url').eq('id', rx.provider_id).maybeSingle()
      if (prov?.signature_url) signatureUrl = prov.signature_url
    } catch {}
  }

  const pdfData = {
    providerName: rx.provider_name || '',
    prescriberNumber: rx.prescriber_number || '',
    patientName: rx.patient_name || '',
    patientNhi: rx.patient_nhi || '',
    patientDob: rx.patient_dob || '',
    drug: rx.drug || '',
    dose: rx.dose || '',
    directions: rx.directions || '',
    quantity: rx.quantity || '',
    repeats: rx.repeats || 0,
    pharmacyName,
    pharmacyAddress: pharmacyAddress || '',
    signatureUrl,
  }
  let pdfBuffer
  try {
    pdfBuffer = await buildPrescriptionPdf(pdfData)
  } catch (e) {
    return res.status(500).json({ error: 'PDF rebuild failed', detail: e.message })
  }

  const deliveryErrors = []
  let faxResult = null
  const channel = (deliveryChannel || (pharmacyFax ? 'fax' : pharmacyEmail ? 'email' : 'none')).toLowerCase()
  const wantsFax   = channel === 'fax'   || channel === 'both'
  const wantsEmail = channel === 'email' || channel === 'both'

  if (wantsFax && pharmacyFax) {
    try {
      const { sendFax } = await import('./_send-fax.js')
      faxResult = await sendFax({
        to: pharmacyFax,
        pdf: pdfBuffer,
        filename: `prescription-${(rx.patient_name || 'patient').replace(/ /g, '-')}.pdf`,
        subject: `Redirected prescription for ${rx.patient_name} — Tere Health`,
        tag: `redirect:${prescriptionId}`,
      })
      if (!faxResult.ok) deliveryErrors.push(`Fax to new pharmacy failed (${faxResult.provider}): ${faxResult.error}`)
    } catch (e) { deliveryErrors.push(`Fax exception: ${e.message}`) }
  }

  if (wantsEmail && pharmacyEmail && process.env.RESEND_API_KEY) {
    try {
      const pdfBase64 = pdfBuffer.toString('base64')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: pharmacyEmail,
        subject: `Redirected prescription for ${rx.patient_name} — Tere Health`,
        html: `<p>Please find attached a prescription for <strong>${rx.patient_name}</strong> — this script was previously sent to <em>${originalSnapshot.pharmacy_name || 'another pharmacy'}</em> and has been redirected to you at the patient's request.</p><p>Prescriber: ${rx.provider_name}<br>Prescriber No: ${rx.prescriber_number || '—'}</p><p>Medication: <strong>${rx.drug}</strong><br>Directions: ${rx.directions}<br>Quantity: ${rx.quantity}, Repeats: ${rx.repeats || 0}</p>`,
        attachments: [{ filename: `prescription-${(rx.patient_name || 'patient').replace(/ /g, '-')}.pdf`, content: pdfBase64 }],
      })
    } catch (e) { deliveryErrors.push(`Email to new pharmacy failed: ${e.message}`) }
  }

  // Persist the update.
  const { error: upErr } = await supabase.from('prescriptions').update({
    pharmacy_id: pharmacyId || null,
    pharmacy_name: pharmacyName,
    pharmacy_hpi_id: pharmacyHpiId || null,
    pharmacy_fax: pharmacyFax || null,
    pharmacy_email: pharmacyEmail || null,
    pharmacy_phone: pharmacyPhone || null,
    pharmacy_address: pharmacyAddress || null,
    redirected_at: new Date().toISOString(),
    redirected_from_pharmacy: originalSnapshot,
    redirected_by_provider_id: auth.provider?.id || null,
  }).eq('id', prescriptionId)
  if (upErr) return res.status(500).json({ error: 'Update failed: ' + upErr.message })

  // Crowd-source pharmacy contacts (matches _generate-prescription-pdf pattern).
  if (pharmacyId && (pharmacyFax || pharmacyEmail || pharmacyPhone || pharmacyHpiId)) {
    try {
      await supabase.from('pharmacy_contacts').upsert({
        pharmacy_id: pharmacyId,
        premises_name: pharmacyName || null,
        fax: pharmacyFax || null,
        dispensary_email: pharmacyEmail || null,
        phone: pharmacyPhone || null,
        hpi_id: pharmacyHpiId || null,
        contributed_by: auth.provider?.id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'pharmacy_id' })
    } catch {}
  }

  return res.status(200).json({
    ok: true,
    faxResult,
    deliveryErrors,
    previousPharmacy: originalSnapshot.pharmacy_name,
    newPharmacy: pharmacyName,
  })
}
