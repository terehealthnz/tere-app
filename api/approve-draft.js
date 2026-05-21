import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { buildPrescriptionPdf, buildReferralPdf } from './_pdf-builders.js'

function supabaseAdmin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  )
}

async function sendEmail(to, subject, html, attachments) {
  if (!process.env.RESEND_API_KEY || !to) return
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({ from: 'Tere Health <noreply@teremedicine.co.nz>', to, subject, html, attachments })
}

export default async function handler(req, res) {
  const {
    action,         // 'approve' | 'modify' | 'reject'
    type,           // 'prescription' | 'referral' | 'acc'
    id,             // uuid of prescription / referral / consultation
    supervisorId,
    supervisorName,
    modifications,  // partial overrides for 'modify'
    rejectionReason,
  } = req.body || {}

  if (!action || !type || !id || !supervisorId) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const supabase = supabaseAdmin()
  const now = new Date().toISOString()

  // ── PRESCRIPTION ─────────────────────────────────────────────────────
  if (type === 'prescription') {
    const { data: rx, error } = await supabase.from('prescriptions').select('*').eq('id', id).single()
    if (error || !rx) return res.status(404).json({ error: 'Prescription not found' })

    if (action === 'reject') {
      await supabase.from('prescriptions').update({
        approval_status: 'rejected',
        rejected_by: supervisorId,
        rejected_at: now,
        rejection_reason: rejectionReason,
      }).eq('id', id)

      // Notify drafting provider if they have email
      if (rx.drafted_by_id) {
        const { data: drafter } = await supabase.from('providers').select('email, first_name').eq('id', rx.drafted_by_id).single()
        if (drafter?.email) {
          await sendEmail(drafter.email,
            `Prescription rejected — ${rx.patient_name} (${rx.drug})`,
            `<p>Hi ${drafter.first_name},</p><p>Your prescription draft for <strong>${rx.patient_name}</strong> — <strong>${rx.drug}</strong> has been rejected by <strong>${supervisorName}</strong>.</p><p><strong>Reason:</strong> ${rejectionReason || 'No reason provided'}</p><p>Please review and re-submit if appropriate, or discuss with your supervisor.</p><p style="color:#6B7280;font-size:12px">Tere Health · teremedicine.co.nz</p>`
          )
        }
      }

      // Notify patient
      if (rx.patient_email) {
        await sendEmail(rx.patient_email,
          'Update on your Tere Health prescription',
          `<p>Kia ora ${rx.patient_name},</p><p>Your provider is reviewing your treatment plan. We'll be in touch shortly with next steps.</p><p>If you have any concerns, please contact us.</p><p>Tere Health Team</p>`
        )
      }

      return res.json({ ok: true })
    }

    // approve or modify
    const data = action === 'modify' ? { ...rx, ...modifications } : rx
    const logEntry = {
      action,
      by: supervisorName,
      at: now,
      ...(action === 'modify' ? { changes: modifications } : {}),
    }

    let pdfBuffer
    try {
      pdfBuffer = await buildPrescriptionPdf({
        providerName: data.drafted_by_name || data.provider_name,
        prescriberNumber: data.prescriber_number,
        approvedByName: supervisorName,
        patientName: data.patient_name,
        patientNhi: data.patient_nhi,
        patientDob: data.patient_dob,
        drug: data.drug,
        dose: data.dose,
        directions: data.directions,
        quantity: data.quantity,
        repeats: data.repeats,
        pharmacyName: data.pharmacy_name,
        pharmacyAddress: data.pharmacy_address,
      })
    } catch (e) {
      return res.status(500).json({ error: 'PDF generation failed: ' + e.message })
    }

    const pdfBase64 = pdfBuffer.toString('base64')
    const filename = `prescription-${data.patient_name.replace(/ /g, '-')}.pdf`

    // Email pharmacy
    if (data.pharmacy_email) {
      try {
        await sendEmail(
          data.pharmacy_email,
          `Prescription for ${data.patient_name} — Tere Health`,
          `<p>Please find attached a prescription for <strong>${data.patient_name}</strong> from Tere Health.</p><p>Prescriber: ${data.drafted_by_name || data.provider_name} (countersigned by ${supervisorName})<br>Medication: <strong>${data.drug}</strong><br>Directions: ${data.directions}<br>Quantity: ${data.quantity}, Repeats: ${data.repeats || 0}</p>`,
          [{ filename, content: pdfBase64 }]
        )
      } catch {}
    }

    // Email patient
    if (data.patient_email) {
      try {
        await sendEmail(
          data.patient_email,
          'Your prescription from Tere Health has been approved',
          `<p>Kia ora ${data.patient_name},</p><p>Your prescription for <strong>${data.drug}</strong> has been approved by ${supervisorName} and sent to <strong>${data.pharmacy_name || 'your pharmacy'}</strong>.</p><p>A copy is attached for your records.</p><p>Tere Health Team</p>`,
          [{ filename: 'prescription.pdf', content: pdfBase64 }]
        )
      } catch {}
    }

    // Notify drafting provider
    if (rx.drafted_by_id) {
      const { data: drafter } = await supabase.from('providers').select('email, first_name').eq('id', rx.drafted_by_id).single()
      if (drafter?.email) {
        await sendEmail(
          drafter.email,
          `Prescription approved — ${rx.patient_name} (${rx.drug})`,
          `<p>Hi ${drafter.first_name},</p><p>Your prescription draft for <strong>${rx.patient_name}</strong> — <strong>${rx.drug}</strong> has been ${action === 'modify' ? 'modified and ' : ''}approved by <strong>${supervisorName}</strong> and sent to ${data.pharmacy_name || 'the pharmacy'}.</p><p style="color:#6B7280;font-size:12px">Tere Health · teremedicine.co.nz</p>`
        )
      }
    }

    await supabase.from('prescriptions').update({
      approval_status: 'approved',
      approved_by: supervisorId,
      approved_at: now,
      delivery_status: 'sent',
      ...(action === 'modify' ? modifications : {}),
      modification_log: [...(rx.modification_log || []), logEntry],
    }).eq('id', id)

    return res.json({ ok: true, pdfBase64 })
  }

  // ── REFERRAL ─────────────────────────────────────────────────────────
  if (type === 'referral') {
    const { data: ref, error } = await supabase.from('radiology_referrals').select('*').eq('id', id).single()
    if (error || !ref) return res.status(404).json({ error: 'Referral not found' })

    if (action === 'reject') {
      await supabase.from('radiology_referrals').update({
        approval_status: 'rejected',
        rejected_by: supervisorId,
        rejected_at: now,
        rejection_reason: rejectionReason,
      }).eq('id', id)

      if (ref.drafted_by_id) {
        const { data: drafter } = await supabase.from('providers').select('email, first_name').eq('id', ref.drafted_by_id).single()
        if (drafter?.email) {
          await sendEmail(drafter.email,
            `Referral rejected — ${ref.patient_name} (${ref.investigation})`,
            `<p>Hi ${drafter.first_name},</p><p>Your referral draft for <strong>${ref.patient_name}</strong> — <strong>${ref.investigation}</strong> has been rejected by <strong>${supervisorName}</strong>.</p><p><strong>Reason:</strong> ${rejectionReason || 'No reason provided'}</p><p style="color:#6B7280;font-size:12px">Tere Health · teremedicine.co.nz</p>`
          )
        }
      }

      if (ref.patient_email) {
        await sendEmail(ref.patient_email,
          'Update on your Tere Health referral',
          `<p>Kia ora ${ref.patient_name},</p><p>Your provider is reviewing your treatment plan. We'll be in touch shortly with next steps.</p><p>Tere Health Team</p>`
        )
      }

      return res.json({ ok: true })
    }

    const data = action === 'modify' ? { ...ref, ...modifications } : ref
    const logEntry = { action, by: supervisorName, at: now, ...(action === 'modify' ? { changes: modifications } : {}) }

    let pdfBuffer
    try {
      pdfBuffer = await buildReferralPdf({
        providerName: data.drafted_by_name || data.provider_name,
        providerCpn: data.provider_cpn,
        approvedByName: supervisorName,
        patientName: data.patient_name,
        patientNhi: data.patient_nhi,
        patientDob: data.patient_dob,
        investigation: data.investigation,
        bodyPart: data.body_part,
        clinicalIndication: data.clinical_indication,
        urgency: data.urgency,
        history: data.history,
        accClaimNumber: data.acc_claim_number,
        facilityName: data.facility_name,
        facilityAddress: data.facility_address,
        facilityPhone: data.facility_phone,
      })
    } catch (e) {
      return res.status(500).json({ error: 'PDF generation failed: ' + e.message })
    }

    const pdfBase64 = pdfBuffer.toString('base64')
    const filename = `referral-${data.patient_name.replace(/ /g, '-')}.pdf`

    if (data.facility_email) {
      try {
        await sendEmail(
          data.facility_email,
          `Radiology Referral — ${data.patient_name} (${data.urgency || 'Routine'}) — Tere Health`,
          `<p>Please find attached a radiology referral from Tere Health.</p><p><strong>Patient:</strong> ${data.patient_name}<br><strong>Investigation:</strong> ${data.investigation}${data.body_part ? ' — ' + data.body_part : ''}<br><strong>Urgency:</strong> ${data.urgency || 'Routine'}<br><strong>Clinician:</strong> ${data.drafted_by_name || data.provider_name} (countersigned by ${supervisorName})</p>`,
          [{ filename, content: pdfBase64 }]
        )
      } catch {}
    }

    if (data.patient_email) {
      try {
        await sendEmail(
          data.patient_email,
          'Your radiology referral has been approved',
          `<p>Kia ora ${data.patient_name},</p><p>Your referral for <strong>${data.investigation}</strong> has been approved by ${supervisorName} and sent to <strong>${data.facility_name || 'the imaging centre'}</strong>.</p><p>Urgency: ${data.urgency || 'Routine'}</p><p>Tere Health Team</p>`,
          [{ filename: 'referral.pdf', content: pdfBase64 }]
        )
      } catch {}
    }

    if (ref.drafted_by_id) {
      const { data: drafter } = await supabase.from('providers').select('email, first_name').eq('id', ref.drafted_by_id).single()
      if (drafter?.email) {
        await sendEmail(
          drafter.email,
          `Referral approved — ${ref.patient_name} (${ref.investigation})`,
          `<p>Hi ${drafter.first_name},</p><p>Your referral for <strong>${ref.patient_name}</strong> — <strong>${ref.investigation}</strong> has been ${action === 'modify' ? 'modified and ' : ''}approved by <strong>${supervisorName}</strong>.</p><p style="color:#6B7280;font-size:12px">Tere Health · teremedicine.co.nz</p>`
        )
      }
    }

    await supabase.from('radiology_referrals').update({
      approval_status: 'approved',
      approved_by: supervisorId,
      approved_at: now,
      referral_status: 'pending',
      delivery_status: 'sent',
      ...(action === 'modify' ? modifications : {}),
      modification_log: [...(ref.modification_log || []), logEntry],
    }).eq('id', id)

    return res.json({ ok: true, pdfBase64 })
  }

  // ── ACC CLAIM ─────────────────────────────────────────────────────────
  if (type === 'acc') {
    // id is consultation_id for ACC
    const { data: consult, error } = await supabase.from('consultations')
      .select('id, patient_first_name, patient_last_name, patient_email, acc_draft, provider_id')
      .eq('id', id).single()
    if (error || !consult) return res.status(404).json({ error: 'Consultation not found' })

    if (action === 'reject') {
      await supabase.from('consultations').update({
        acc_approval_status: 'rejected',
        acc_rejected_at: now,
        acc_rejection_reason: rejectionReason,
      }).eq('id', id)

      if (consult.provider_id) {
        const { data: drafter } = await supabase.from('providers').select('email, first_name').eq('id', consult.provider_id).single()
        if (drafter?.email) {
          await sendEmail(drafter.email,
            `ACC claim rejected — ${consult.patient_first_name} ${consult.patient_last_name}`,
            `<p>Hi ${drafter.first_name},</p><p>Your ACC claim draft for <strong>${consult.patient_first_name} ${consult.patient_last_name}</strong> has been rejected by <strong>${supervisorName}</strong>.</p><p><strong>Reason:</strong> ${rejectionReason || 'No reason provided'}</p><p style="color:#6B7280;font-size:12px">Tere Health · teremedicine.co.nz</p>`
          )
        }
      }
      return res.json({ ok: true })
    }

    // approve
    await supabase.from('consultations').update({
      acc_approval_status: 'approved',
      acc_approved_by: supervisorId,
      acc_approved_at: now,
    }).eq('id', id)

    if (consult.provider_id) {
      const { data: drafter } = await supabase.from('providers').select('email, first_name').eq('id', consult.provider_id).single()
      if (drafter?.email) {
        await sendEmail(drafter.email,
          `ACC claim approved — ${consult.patient_first_name} ${consult.patient_last_name}`,
          `<p>Hi ${drafter.first_name},</p><p>Your ACC claim draft for <strong>${consult.patient_first_name} ${consult.patient_last_name}</strong> has been approved by <strong>${supervisorName}</strong>. The claim is ready to lodge via ProviderHub.</p><p style="color:#6B7280;font-size:12px">Tere Health · teremedicine.co.nz</p>`
        )
      }
    }

    return res.json({ ok: true })
  }

  return res.status(400).json({ error: 'Unknown type' })
}
