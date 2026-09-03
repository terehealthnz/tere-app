// /api/generate-acc-cert — provider-triggered ACC certificate generation.
//
// POST { certType, consultationId, ...typeSpecificFields }
// Returns { pdf_base64, filename } — client can display / download.
// Also emails patient (if patient_email) + admin (audit trail).

import { createClient } from '@supabase/supabase-js'
import { buildAccCertificatePdf } from './_pdf-builders.js'
import { sendEmail, hasEmailProvider } from './_email-client.js'
import { recordDisclosure } from './_disclosure.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const ALLOWED_TYPES = new Set(['weekly_compensation', 'return_to_work', 'acc46'])
const TYPE_LABEL = {
  weekly_compensation: 'Medical Certificate (Weekly Compensation)',
  return_to_work:      'Return-to-Work Certificate',
  acc46:               'ACC46 Injury Summary',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const provider = req.auth?.provider
  if (!provider) return res.status(401).json({ error: 'Provider auth required' })

  const {
    certType,
    consultationId,
    unfitFrom, unfitTo, unfitReason,
    rtwFrom, hoursPerWeek, restrictions, targetFullRtw,
    examination, assessment, plan,
    sendToPatient = true,
  } = req.body || {}

  if (!certType || !ALLOWED_TYPES.has(certType)) {
    return res.status(400).json({ error: `certType required, one of: ${[...ALLOWED_TYPES].join(', ')}` })
  }
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  const supabase = admin()

  // Fetch consultation + patient + outcome measures.
  const { data: consult, error: cErr } = await supabase.from('consultations').select('*').eq('id', consultationId).maybeSingle()
  if (cErr || !consult) return res.status(404).json({ error: 'Consultation not found' })

  let patient = null
  if (consult.patient_id) {
    const { data } = await supabase.from('patients').select('*').eq('id', consult.patient_id).maybeSingle()
    patient = data
  }

  // Outcome measures for ACC46.
  let outcomeMeasures = []
  if (certType === 'acc46') {
    const { data } = await supabase.from('consultation_outcome_measures')
      .select('*').eq('consultation_id', consultationId).order('recorded_at')
    outcomeMeasures = data || []
  }

  // Build the data blob for the PDF.
  const providerName = `${provider.first_name || ''} ${provider.last_name || ''}`.trim() || 'Tere Health provider'
  const data = {
    certType,
    patient: {
      first_name: patient?.first_name || consult.patient_first_name,
      last_name:  patient?.last_name  || consult.patient_last_name,
      dob:        patient?.dob        || consult.patient_dob,
      nhi:        patient?.nhi        || consult.patient_nhi,
      address:    patient?.address    || consult.patient_location,
      phone:      patient?.phone      || consult.patient_phone,
    },
    provider: {
      name:       providerName,
      credential: provider.credential || null,
      mcnz:       provider.mcnz_registration_number,
      hpi:        provider.hpi_number,
      email:      provider.email,
      phone:      provider.phone,
      // Signature buffer would come from fetchSignatureBuffer — kept simple for now.
      signatureBuffer: null,
    },
    claim: {
      number:       consult.acc_claim_number,
      service_code: null,
    },
    injury: {
      date:        consult.acc_injury_date,
      mechanism:   consult.acc_injury_details,
      body_part:   consult.acc_body_part,
      read_code:   consult.acc_read_code,
      employer:    consult.acc_employer,
    },
    // WC-specific
    unfitFrom, unfitTo, unfitReason,
    // RTW-specific
    rtwFrom, hoursPerWeek, restrictions, targetFullRtw,
    // ACC46-specific
    examination:     examination || (consult.clinical_notes?.O || null),
    assessment:      assessment  || (consult.clinical_notes?.A || null),
    plan:            plan        || (consult.clinical_notes?.P || null),
    outcomeMeasures,
  }

  let pdf
  try {
    pdf = await buildAccCertificatePdf(data)
  } catch (e) {
    console.error('[generate-acc-cert] PDF failed:', e)
    return res.status(500).json({ error: 'PDF generation failed', detail: e.message })
  }

  const patientNameForFile = `${data.patient.first_name || ''}-${data.patient.last_name || ''}`.replace(/\W+/g, '_').toLowerCase()
  const filename = `${certType}_${patientNameForFile}_${new Date().toISOString().slice(0, 10)}.pdf`

  // Optionally email to patient with copy to admin.
  let emailOutcome = null
  const patientEmail = data.patient?.first_name && (patient?.email || consult.patient_email)
  if (sendToPatient && patientEmail && hasEmailProvider()) {
    try {
      await sendEmail({
        from:    'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to:      patient?.email || consult.patient_email,
        cc:      'terehealthnz@gmail.com',
        subject: `Your ${TYPE_LABEL[certType]} — Tere Health`,
        text: [
          `Kia ora ${data.patient.first_name || ''},`,
          ``,
          `Please find attached your ${TYPE_LABEL[certType]} from your recent Tere Health consultation.`,
          ``,
          `If you have questions, reply to this email or contact us via terehealthnz@gmail.com.`,
          ``,
          `Ngā mihi,`,
          providerName,
          `Tere Health`,
        ].join('\n'),
        attachments: [{ filename, content: pdf.toString('base64') }],
      })
      recordDisclosure(req, {
        patientNhi:        data.patient.nhi,
        consultationId,
        channel:           'gp_letter_email',
        destination:       patient?.email || consult.patient_email,
        destinationLabel:  `${data.patient.first_name || ''} ${data.patient.last_name || ''}`.trim() || 'patient',
        consentSource:     'triage_tick',
        consentSourceRef:  consultationId,
        disclosurePurpose: 'clinical_care_certification',
        payloadSummary:    `${TYPE_LABEL[certType]} — ACC claim ${consult.acc_claim_number || 'pending'}`,
      }).catch(() => {})
      emailOutcome = { sent: true, to: patient?.email || consult.patient_email }
    } catch (e) {
      console.error('[generate-acc-cert] email failed:', e.message)
      emailOutcome = { sent: false, error: e.message }
    }
  }

  // Audit log
  try {
    await supabase.from('audit_logs').insert({
      event_type:      `acc_cert.${certType}`,
      provider_id:     provider.id,
      provider_name:   providerName,
      consultation_id: consultationId,
      patient_ref:     data.patient.nhi,
      resource_type:   'consultation',
      resource_id:     consultationId,
      metadata:        { cert_type: certType, filename, emailed: !!emailOutcome?.sent },
    })
  } catch {}

  return res.status(200).json({
    ok: true,
    filename,
    pdf_base64: pdf.toString('base64'),
    email: emailOutcome,
  })
}
