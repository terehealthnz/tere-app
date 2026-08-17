import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import crypto from 'node:crypto'
import { buildReferralPdf } from './_pdf-builders.js'
import { RHCNZ_REGIONS, TERE_MO_SHORTCODE } from '../src/lib/rhcnzRegions.js'

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
      await resend.emails.send({ from: 'Tere Health <hello@terehealth.co.nz>', replyTo: 'terehealthnz@gmail.com', to: sup.email, subject, html })
    } catch {}
  }
}

// Server-side region → intake email lookup. Client never gets to name the
// destination directly for RHCNZ referrals — spoofing safeguard.
function rhcnzRegionServerSide(id) {
  return RHCNZ_REGIONS.find(r => r.id === id) || null
}

export default async function handler(req, res) {
  const {
    consultationId, providerId, providerName, providerCpn, providerMcnz, providerPhone,
    patientName, patientPreferredName, patientNhi, patientDob, patientGender,
    patientEthnicity, patientEmail, patientAddress,
    patientPhoneHome, patientPhoneMobile,
    cscNumber, otherFundingPathway, dateOfInjury, copyToDoctor,
    investigation, bodyPart, clinicalIndication, urgency, history, accClaimNumber,
    facilityName, facilityHpiId, facilityEmail, facilityPhone, facilityAddress,
    rhcnzRegionId,
    needsApproval, draftedByName,
  } = req.body || {}

  if (!patientName || !investigation) return res.status(400).json({ error: 'Missing required fields' })

  const supabase = supabaseAdmin()

  // RHCNZ region overrides facility name/email — server-side lookup so client
  // can't send a referral to an arbitrary address.
  const rhcnzRegion = rhcnzRegionId ? rhcnzRegionServerSide(rhcnzRegionId) : null
  const finalFacilityName  = rhcnzRegion ? `${rhcnzRegion.brand} — ${rhcnzRegion.region}` : facilityName
  const finalFacilityEmail = rhcnzRegion ? rhcnzRegion.email                              : facilityEmail
  const finalUrgency       = rhcnzRegion ? 'Urgent'                                       : urgency
  const referrerMoShortcode = TERE_MO_SHORTCODE

  const commonRow = {
    consultation_id: consultationId || null,
    provider_id: providerId || null,
    provider_name: providerName,
    provider_cpn: providerCpn,
    patient_name: patientName,
    patient_nhi: patientNhi,
    patient_dob: patientDob,
    patient_email: patientEmail,
    investigation, body_part: bodyPart, clinical_indication: clinicalIndication,
    urgency: finalUrgency, history, acc_claim_number: accClaimNumber,
    facility_name: finalFacilityName,
    facility_hpi_id: facilityHpiId,
    facility_email: finalFacilityEmail,
    facility_phone: facilityPhone,
    facility_address: facilityAddress,
    // RHCNZ / template-required fields (migration 2026-08-17)
    rhcnz_region_id: rhcnzRegion?.id || null,
    csc_number: cscNumber || null,
    patient_phone_home: patientPhoneHome || null,
    patient_phone_mobile: patientPhoneMobile || null,
    other_funding_pathway: otherFundingPathway || null,
    date_of_injury: dateOfInjury || null,
    copy_to_doctor: copyToDoctor || null,
    referrer_mo_shortcode: referrerMoShortcode,
    patient_preferred_name: patientPreferredName || null,
    patient_address: patientAddress || null,
  }

  // ── Pending approval path ────────────────────────────────────────────
  if (needsApproval) {
    let referralId = null
    try {
      const { data } = await supabase.from('radiology_referrals').insert({
        ...commonRow,
        drafted_by_id: providerId || null,
        drafted_by_name: draftedByName || providerName,
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
         <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Urgency</td><td>${finalUrgency || 'Routine'}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Indication</td><td>${clinicalIndication || '—'}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:#6B7280">Facility</td><td>${finalFacilityName || '—'}</td></tr>
       </table>
       <p>Please log in to the Tere dashboard to approve, modify, or reject this referral.</p>
       <p style="color:#6B7280;font-size:12px">Tere Health · terehealth.co.nz</p>`
    )

    return res.json({ ok: true, referralId, pending: true })
  }

  // ── Direct send path ─────────────────────────────────────────────────
  let signatureUrl = null
  if (providerId) {
    try {
      const { data: prov } = await supabase
        .from('providers').select('signature_url').eq('id', providerId).maybeSingle()
      if (prov?.signature_url) signatureUrl = prov.signature_url
    } catch {}
  }
  // Pre-generate the referral row UUID so it can render on the PDF (Holly
  // RHCNZ feedback 2026-08-17). We use it as the id on the subsequent insert
  // so PDF + DB row + email attachment all share the same reference.
  const referralId = crypto.randomUUID()
  const pdfData = {
    referralId,
    providerName, providerCpn, providerMcnz, providerPhone,
    patientName, patientPreferredName, patientNhi, patientDob, patientGender,
    patientEthnicity, patientAddress,
    patientPhoneHome, patientPhoneMobile,
    cscNumber, otherFundingPathway, dateOfInjury, copyToDoctor,
    investigation, bodyPart, clinicalIndication, urgency: finalUrgency, history, accClaimNumber,
    facilityName: finalFacilityName, facilityAddress, facilityPhone,
    referrerMoShortcode,
    signatureUrl,
  }

  let pdfBuffer
  try {
    pdfBuffer = await buildReferralPdf(pdfData)
  } catch (e) {
    return res.status(500).json({ error: 'PDF generation failed', detail: e.message })
  }

  const pdfBase64 = pdfBuffer.toString('base64')
  const deliveryErrors = []
  const subjectPrefix = rhcnzRegion ? 'URGENT — Tere Health eReferral' : 'Radiology Referral — Tere Health'
  const emailSubject  = `${subjectPrefix} — ${patientName} (${finalUrgency || 'Routine'})`

  if (finalFacilityEmail && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: finalFacilityEmail,
        subject: emailSubject,
        html: `<p>Please find attached an ${rhcnzRegion ? '<strong>urgent</strong> ' : ''}imaging referral from Tere Health.</p>
               <p><strong>Patient:</strong> ${patientName}<br>
                  <strong>Investigation:</strong> ${investigation}${bodyPart ? ' — ' + bodyPart : ''}<br>
                  <strong>Urgency:</strong> ${finalUrgency || 'Routine'}<br>
                  <strong>Clinician:</strong> ${providerName}${providerMcnz ? ` (MCNZ ${providerMcnz})` : ''}</p>
               <p style="color:#6B7280;font-size:12px">Tere Health Limited · HPI-O G11238-E · terehealth.co.nz</p>`,
        attachments: [{ filename: `referral-${patientName.replace(/ /g, '-')}.pdf`, content: pdfBase64 }],
      })
    } catch (e) { deliveryErrors.push(`Facility email failed: ${e.message}`) }
  }

  if (patientEmail && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: patientEmail,
        subject: `Your imaging referral from Tere Health`,
        html: `<p>Hi ${patientName},</p><p>Your referral for <strong>${investigation}${bodyPart ? ' — ' + bodyPart : ''}</strong> has been sent to <strong>${finalFacilityName || 'the imaging centre'}</strong>.</p>${rhcnzRegion ? `<p>${rhcnzRegion.brand} (${rhcnzRegion.region}) will contact you to book the appointment.</p>` : ''}<p>Urgency: ${finalUrgency || 'Routine'}</p><p>Tere Health Team</p>`,
        attachments: [{ filename: 'referral.pdf', content: pdfBase64 }],
      })
    } catch (e) { deliveryErrors.push(`Patient email failed: ${e.message}`) }
  }

  try {
    await supabase.from('radiology_referrals').insert({
      id: referralId,   // preserves PDF ↔ DB ↔ email match (pre-generated above)
      ...commonRow,
      referral_status: 'sent',
      approval_status: 'not_required',
      delivery_status: deliveryErrors.length ? 'error' : 'sent',
      delivery_error: deliveryErrors.join('; ') || null,
    })
  } catch (e) { deliveryErrors.push(`DB save failed: ${e.message}`) }

  res.json({ ok: true, referralId, pdfBase64, deliveryErrors: deliveryErrors.length ? deliveryErrors : undefined })
}
