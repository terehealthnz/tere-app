// POST /api/create-consultation — server-mediated consult creation for the
// patient flow. Closes the CREATE-path employer fraud vector (task #71 covered
// the UPDATE path; this covers CREATE).
//
// Client sends the full form payload. Server:
//   1. Verifies employer_id (if present) against the employers table.
//   2. Sets employer_paid + employer_name from the verified row — the client's
//      values for those columns are discarded.
//   3. Silently drops payment_amount from any client input (never accepted at
//      create; payment happens after ConsultationType selection which now goes
//      through /api/patient-consult with its own server-side employer check).
//   4. INSERTs with service_role.
//
// Anon INSERT policy on consultations can be dropped once every caller of
// supabase.js createConsultation() goes through this endpoint (task follow-up).

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyEmployerBenefit(supabase, claimedEmployerId) {
  if (!claimedEmployerId) return null
  const { data, error } = await supabase
    .from('employers')
    .select('id, company_name, is_active')
    .eq('id', String(claimedEmployerId))
    .maybeSingle()
  if (error || !data || !data.is_active) return null
  return { employer_id: data.id, employer_name: data.company_name }
}

// Columns explicitly rejected at create time even if the client sends them.
// (patient_id / provider_id are set by later flows; timestamps are DB-generated;
//  payment_amount is server-derived from consultation_type below; notes /
//  diagnosis / transcript fields are provider-only.)
const CREATE_REJECT = new Set([
  'id', 'created_at', 'updated_at', 'completed_at',
  'patient_id', 'provider_id', 'provider_display_name',
  'payment_intent_id', 'payment_status', 'payment_amount',
  // notes_draft is NOT rejected — RepeatPrescription seeds it with the
  // patient's medication request. notes_final / flagged / transcript / etc.
  // are provider-only.
  'notes_final', 'notes_flagged',
  'transcript', 'clinical_notes', 'summary',
  'diagnosis', 'diagnosis_code', 'icd10_code',
  'acc_read_code', 'acc_claim_number',
  'consultation_token',
])

// Payment schedule for consult types that carry a fixed cost at creation
// (currently just the repeat-Rx shortcut path). All amounts in cents.
// Standard video/phone/message consultations get their amount set later on
// the ConsultationType selection, which routes through /api/patient-consult.
const CREATE_AMOUNTS_BY_TYPE = {
  repeat_rx: 2500,
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const payload = { ...(req.body || {}) }

  const supabase = admin()

  // Server-side employer verification — client-supplied employer_paid /
  // employer_name are always discarded and re-derived from the lookup.
  const claimedEmployerId = payload.employer_id ?? null
  delete payload.employer_paid
  delete payload.employer_name
  if (claimedEmployerId) {
    const verified = await verifyEmployerBenefit(supabase, claimedEmployerId)
    if (verified) {
      payload.employer_id   = verified.employer_id
      payload.employer_name = verified.employer_name
      payload.employer_paid = true
    } else {
      payload.employer_id = null
      // employer_paid stays absent → DB default (false)
    }
  }

  // Drop reserved / provider-only columns.
  for (const key of CREATE_REJECT) delete payload[key]

  // Server-derived payment_amount for consult types with a fixed cost at
  // creation (e.g. repeat_rx). Standard flows leave it null and set the
  // amount later during ConsultationType selection.
  if (payload.consultation_type && CREATE_AMOUNTS_BY_TYPE[payload.consultation_type] != null) {
    payload.payment_amount = CREATE_AMOUNTS_BY_TYPE[payload.consultation_type]
  }

  const { data, error } = await supabase.from('consultations').insert(payload).select().single()

  if (error) {
    // Retry without the newer research columns if the schema hasn't caught up
    // — same behaviour as the previous client-side createConsultation.
    if (error.code === '42703' || (error.message && error.message.includes('column'))) {
      const { patient_age_band, complaint_category, consultation_month,
              device_type, language_selected, patient_employment_sector,
              patient_region, ...core } = payload
      const retry = await supabase.from('consultations').insert(core).select().single()
      if (retry.error) return res.status(500).json({ error: retry.error.message })
      return res.status(200).json({ consultation: retry.data })
    }
    return res.status(500).json({ error: error.message })
  }
  return res.status(200).json({ consultation: data })
}
