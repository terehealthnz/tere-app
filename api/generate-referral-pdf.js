import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { buildReferralPdf } from './_pdf-builders.js'

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
      await resend.emails.send({ from: 'Tere Health <noreply@teremedicine.co.nz>', to: sup.email, subject, html })
    } catch {}
  }
}

export default async function handler(req, res) {
  const {
    consultationId, providerId, providerName, providerCpn,
    patientName, patientNhi, patientDob, patientEmail,
    investigation, bodyPart, clinicalIndication, urgency, history, accClaimNumber,
    facilityName, facilityHpiId, facilityEmail, facilityPhone, facilityAddress,
    needsApproval, draftedByName,
  } = req.body || {}

  if (!patientName || !investigation) return res.status(400).json({ error: 'Missing required fields' })

  const supabase = supabaseAdmin()

  // ── Pending approval path ────────────────────────────────────────────
  if (needsApproval) {
    let referralId = null
    try {
      const { data } = await supabase.from('radiology_referrals').insert({
        consultation_id: consultationId || null,
        drafted_by_id: providerId || null,
        drafted_by_name: draftedByName || providerName,
        provider_id: providerId || null,
        provider_name: providerName,
        provider_cpn: providerCpn,
        patient_name: patientName,
        patient_nhi: patientNhi,
        patient_dob: patientDob,
        patient_email: patientEmail,
        investigation, body_part: bodyPart, clinical_indication: clinicalIndication,
        urgency, history, acc_claim_number: accClaimNumber,
        facility_name: facilityName,
        facility_hpi_id: facilityHpiId,
        facility_email: facilityEmail,
        facility_phone: facilityPhone,
        facility_address: facilityAddress,
        referral_status: 'pending',
        approval_status: 'pending_approval',
        delivery_status: 'pending',
      }).select('id').single()
      referralId = data?.id
    } catch (e) {
      return res.status(500).json({ error: 'Failed to save draft: ' + e.message })
    }

    await notifySupervisors(
      supabase,
      `Referral approval needed — ${patientName} (${investigation})`,
      `<p><strong>${draftedByName || providerName}</strong> has drafted a radiology referral requiring your approval.</p>
       <table style="border-collapse:collapse;margin:1rem 0">
         <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Patient</td><td style="font-weight:600">${patientName}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Investigation</td><td style="font-weight:600">${investigation}${bodyPart ? ' — ' + bodyPart : ''}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Urgency</td><td>${urgency || 'Routine'}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Indication</td><td>${clinicalIndication || '—'}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Facility</td><td>${facilityName || '—'}</td></tr>
       </table>
       <p>Please log in to the Tere dashboard to approve, modify, or reject this referral.</p>
       <p style="color:#6B7280;font-size:12px">Tere Health · teremedicine.co.nz</p>`
    )

    return res.json({ ok: true, referralId, pending: true })
  }

  // ── Direct send path ─────────────────────────────────────────────────
  const pdfData = { providerName, providerCpn, patientName, patientNhi, patientDob, investigation, bodyPart, clinicalIndication, urgency, history, accClaimNumber, facilityName, facilityAddress, facilityPhone }
  let pdfBuffer
  try {
    pdfBuffer = await buildReferralPdf(pdfData)
  } catch (e) {
    return res.status(500).json({ error: 'PDF generation failed', detail: e.message })
  }

  const pdfBase64 = pdfBuffer.toString('base64')
  const deliveryErrors = []

  if (facilityEmail && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Tere Health <noreply@teremedicine.co.nz>',
        to: facilityEmail,
        subject: `Radiology Referral — ${patientName} (${urgency || 'Routine'}) — Tere Health`,
        html: `<p>Please find attached a radiology referral from Tere Health.</p><p><strong>Patient:</strong> ${patientName}<br><strong>Investigation:</strong> ${investigation}${bodyPart ? ' — ' + bodyPart : ''}<br><strong>Urgency:</strong> ${urgency || 'Routine'}<br><strong>Clinician:</strong> ${providerName}</p>`,
        attachments: [{ filename: `referral-${patientName.replace(/ /g, '-')}.pdf`, content: pdfBase64 }],
      })
    } catch (e) { deliveryErrors.push(`Facility email failed: ${e.message}`) }
  }

  if (patientEmail && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Tere Health <noreply@teremedicine.co.nz>',
        to: patientEmail,
        subject: `Your radiology referral from Tere Health`,
        html: `<p>Hi ${patientName},</p><p>Your referral for <strong>${investigation}${bodyPart ? ' — ' + bodyPart : ''}</strong> has been sent to <strong>${facilityName || 'the imaging centre'}</strong>.</p><p>Urgency: ${urgency || 'Routine'}</p><p>Tere Health Team</p>`,
        attachments: [{ filename: 'referral.pdf', content: pdfBase64 }],
      })
    } catch (e) { deliveryErrors.push(`Patient email failed: ${e.message}`) }
  }

  let referralId = null
  try {
    const { data } = await supabase.from('radiology_referrals').insert({
      consultation_id: consultationId || null,
      provider_id: providerId || null,
      provider_name: providerName,
      provider_cpn: providerCpn,
      patient_name: patientName,
      patient_nhi: patientNhi,
      patient_dob: patientDob,
      patient_email: patientEmail,
      investigation, body_part: bodyPart, clinical_indication: clinicalIndication,
      urgency, history, acc_claim_number: accClaimNumber,
      facility_name: facilityName,
      facility_hpi_id: facilityHpiId,
      facility_email: facilityEmail,
      facility_phone: facilityPhone,
      facility_address: facilityAddress,
      referral_status: 'pending',
      approval_status: 'not_required',
      delivery_status: deliveryErrors.length ? 'error' : 'sent',
      delivery_error: deliveryErrors.join('; ') || null,
    }).select('id').single()
    referralId = data?.id
  } catch (e) { deliveryErrors.push(`DB save failed: ${e.message}`) }

  res.json({ ok: true, referralId, pdfBase64, deliveryErrors: deliveryErrors.length ? deliveryErrors : undefined })
}
