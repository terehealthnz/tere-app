import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { buildPrescriptionPdf } from './_pdf-builders.js'

function supabaseAdmin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  )
}

async function notifySupervisors(supabase, subject, html) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return
  const { data: supervisors } = await supabase
    .from('providers')
    .select('email, first_name, last_name')
    .eq('is_supervisor', true)
    .eq('is_active', true)
    .not('email', 'is', null)
  if (!supervisors?.length) return
  const resend = new Resend(resendKey)
  for (const sup of supervisors) {
    try {
      await resend.emails.send({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: sup.email,
        subject,
        html,
      })
    } catch {}
  }
}

export default async function handler(req, res) {
  const {
    consultationId, providerId, providerName, prescriberNumber,
    patientName, patientNhi, patientDob, patientEmail,
    drug, dose, directions, quantity, repeats,
    pharmacyName, pharmacyHpiId, pharmacyEmail, pharmacyPhone, pharmacyAddress,
    needsApproval, draftedByName,
  } = req.body || {}

  if (!patientName || !drug) return res.status(400).json({ error: 'Missing required fields' })

  const supabase = supabaseAdmin()

  // ── Pending approval path ────────────────────────────────────────────
  if (needsApproval) {
    let prescriptionId = null
    try {
      const { data } = await supabase.from('prescriptions').insert({
        consultation_id: consultationId || null,
        drafted_by_id: providerId || null,
        drafted_by_name: draftedByName || providerName,
        provider_id: providerId || null,
        provider_name: providerName,
        prescriber_number: prescriberNumber,
        patient_name: patientName,
        patient_nhi: patientNhi,
        patient_dob: patientDob,
        patient_email: patientEmail,
        drug, dose, directions, quantity,
        repeats: repeats || 0,
        pharmacy_name: pharmacyName,
        pharmacy_hpi_id: pharmacyHpiId,
        pharmacy_email: pharmacyEmail,
        pharmacy_phone: pharmacyPhone,
        pharmacy_address: pharmacyAddress,
        approval_status: 'pending_approval',
        delivery_status: 'pending',
      }).select('id').single()
      prescriptionId = data?.id
    } catch (e) {
      return res.status(500).json({ error: 'Failed to save draft: ' + e.message })
    }

    // Email all supervisors
    await notifySupervisors(
      supabase,
      `Prescription approval needed — ${patientName} (${drug})`,
      `<p><strong>${draftedByName || providerName}</strong> has drafted a prescription requiring your approval.</p>
       <table style="border-collapse:collapse;margin:1rem 0">
         <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Patient</td><td style="font-weight:600">${patientName}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Medication</td><td style="font-weight:600">${drug}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Dose</td><td>${dose || '—'}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Directions</td><td>${directions || '—'}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Quantity</td><td>${quantity || '—'}, Repeats: ${repeats || 0}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Pharmacy</td><td>${pharmacyName || '—'}</td></tr>
       </table>
       <p>Please log in to the Tere dashboard to approve, modify, or reject this prescription.</p>
       <p style="color:#6B7280;font-size:12px">Tere Health · terehealth.co.nz</p>`
    )

    return res.json({ ok: true, prescriptionId, pending: true })
  }

  // ── Direct send path ─────────────────────────────────────────────────
  const pdfData = { providerName, prescriberNumber, patientName, patientNhi, patientDob, drug, dose, directions, quantity, repeats, pharmacyName, pharmacyAddress }
  let pdfBuffer
  try {
    pdfBuffer = await buildPrescriptionPdf(pdfData)
  } catch (e) {
    return res.status(500).json({ error: 'PDF generation failed', detail: e.message })
  }

  const pdfBase64 = pdfBuffer.toString('base64')
  const deliveryErrors = []

  if (pharmacyEmail && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: pharmacyEmail,
        subject: `Prescription for ${patientName} — Tere Health`,
        html: `<p>Please find attached a prescription for <strong>${patientName}</strong> from Tere Health.</p><p>Prescriber: ${providerName}<br>Prescriber No: ${prescriberNumber || '—'}</p><p>Medication: <strong>${drug}</strong><br>Directions: ${directions}<br>Quantity: ${quantity}, Repeats: ${repeats || 0}</p>`,
        attachments: [{ filename: `prescription-${patientName.replace(/ /g, '-')}.pdf`, content: pdfBase64 }],
      })
    } catch (e) { deliveryErrors.push(`Pharmacy email failed: ${e.message}`) }
  }

  if (patientEmail && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: patientEmail,
        subject: `Your prescription from Tere Health`,
        html: `<p>Hi ${patientName},</p><p>Your prescription has been sent to <strong>${pharmacyName || 'your pharmacy'}</strong>. A copy is attached.</p><p>Medication: <strong>${drug}</strong><br>Directions: ${directions}</p><p>Tere Health Team</p>`,
        attachments: [{ filename: 'prescription.pdf', content: pdfBase64 }],
      })
    } catch (e) { deliveryErrors.push(`Patient email failed: ${e.message}`) }
  }

  let prescriptionId = null
  try {
    const { data } = await supabase.from('prescriptions').insert({
      consultation_id: consultationId || null,
      provider_id: providerId || null,
      provider_name: providerName,
      prescriber_number: prescriberNumber,
      patient_name: patientName,
      patient_nhi: patientNhi,
      patient_dob: patientDob,
      patient_email: patientEmail,
      drug, dose, directions, quantity,
      repeats: repeats || 0,
      pharmacy_name: pharmacyName,
      pharmacy_hpi_id: pharmacyHpiId,
      pharmacy_email: pharmacyEmail,
      pharmacy_phone: pharmacyPhone,
      pharmacy_address: pharmacyAddress,
      approval_status: 'not_required',
      delivery_status: deliveryErrors.length ? 'error' : 'sent',
      delivery_error: deliveryErrors.join('; ') || null,
    }).select('id').single()
    prescriptionId = data?.id
  } catch (e) { deliveryErrors.push(`DB save failed: ${e.message}`) }

  res.json({ ok: true, prescriptionId, pdfBase64, deliveryErrors: deliveryErrors.length ? deliveryErrors : undefined })
}
