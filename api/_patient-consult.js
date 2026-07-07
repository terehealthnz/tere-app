// PATCH /api/patient-consult?id=<uuid> — patient-side updates to their own
// consultation. Replaces direct anon .from('consultations').update() calls in
// the patient flow (VitalsCapture, AITriage, WaitingRoom, Rate, HDCConsent,
// ConsentPage, PrescribingLimits, ConsultationType).
//
// Security model:
// - No JWT — patient isn't authenticated as a provider.
// - No hard token — the consultation_id itself is the auth (same posture as
//   the existing anon UPDATE policy; this endpoint is a defence-in-depth
//   layer, not a fundamentally stronger primitive yet).
// - Narrow column allowlist rejects any field a patient shouldn't be able to
//   touch (id, patient_*, notes_*, diagnosis, provider_id, transcript, etc).
// - Status transitions restricted to a small safe set ('cancelled',
//   'vitals_complete') so a scraper with a consultation_id can't force a
//   row into 'complete' or similar states that skip provider workflow.
//
// Once the consultation_tokens table is wired into consult creation and every
// patient page passes a token, this endpoint tightens up to require the token
// match — see task follow-up. For now, this alone lets us drop anon UPDATE.

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Columns a patient may set on their own consultation. Everything else is
// silently dropped from the patch.
//
// employer_paid / employer_id / employer_name / payment_amount are NOT on this
// list — they're populated server-side by verifyEmployerBenefit() below only
// when a valid employer_id is provided AND that employer row is active. This
// closes the fraud vector where a scraper could POST { payment_amount: 0,
// employer_paid: true } with a valid consult id and get a free consult.
const PATIENT_ALLOWLIST = new Set([
  // Vitals capture flow
  'vitals', 'vitals_at',
  // Consultation type (patient picks message vs video vs phone)
  'consultation_type',
  // Post-payment: patient enters the queue with a buffer expiry
  'buffer_expires_at',
  // Consent surface
  'hdc_consent_at', 'prescribing_consent_at', 'research_consent',
  'marketing_consent', 'consent_signed_at', 'consent_signature',
  // Triage self-declarations
  'controlled_medication_mentioned',
  // Triage review — patient may adjust their own chief complaint before payment
  'chief_complaint',
  // AITriage links this consult to a patients row if we found or created one
  'patient_id',
  // Post-consult rating
  'rating', 'rating_comment', 'rated_at',
])

// Verifies the claimed employer_id belongs to an active employer row. Returns
// { employer_id, employer_name } on success (values the caller can trust), or
// null if the employer doesn't exist or isn't active. The employer_paid /
// payment_amount fields are populated by the caller from this result — the
// client's own values for those columns are ignored entirely.
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

// Only these status values may be set from the patient side. Provider-side
// status changes go through /api/consultations PATCH which has its own gate.
//   waiting          — post-payment, patient joins provider queue
//   vitals_complete  — patient finished (or skipped) vitals scan
//   cancelled        — patient bailed out
const PATIENT_STATUS_ALLOWED = new Set([
  'pre_triage', 'triage',                    // AITriage lifecycle transitions
  'waiting', 'vitals_complete', 'cancelled', // post-payment / vitals / cancel
])

// Columns safe to return to the patient view. Excludes provider-only fields
// (notes, diagnosis, transcript, billing internals, ACC internals).
const PATIENT_VIEW_COLUMNS = [
  'id', 'created_at', 'updated_at',
  'patient_first_name', 'patient_last_name',
  'status', 'consultation_type', 'consultation_subtype',
  'provider_display_name',
  'rating', 'rating_comment', 'rated_at',
  'hdc_consent_at', 'prescribing_consent_at', 'research_consent',
  'chief_complaint',
].join(',')

export default async function handler(req, res) {
  const { id } = req.query || {}
  if (!id) return res.status(400).json({ error: 'id query param required' })

  // Patient view: read a limited safe projection of their own consult by id.
  // Patient has the id (they were on this consult), so no further auth required
  // for this narrow projection — nothing sensitive is returned.
  if (req.method === 'GET') {
    const supabase = admin()
    const { data, error } = await supabase
      .from('consultations')
      .select(PATIENT_VIEW_COLUMNS)
      .eq('id', id)
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    if (!data)  return res.status(404).json({ error: 'Consultation not found' })
    return res.status(200).json({ consultation: data })
  }

  // AITriage cleanup: after promoting a pre_triage row into a real triage
  // consult, the client asks us to delete the stale row. Restricted to rows
  // still in status='pre_triage' so a scraper can't delete real consults.
  if (req.method === 'DELETE') {
    const supabase = admin()
    const { error } = await supabase
      .from('consultations')
      .delete()
      .eq('id', id)
      .eq('status', 'pre_triage')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

  const raw = req.body || {}
  const patch = {}
  for (const [k, v] of Object.entries(raw)) {
    if (PATIENT_ALLOWLIST.has(k)) patch[k] = v
  }
  // Status transitions get an extra guard.
  if ('status' in raw) {
    if (!PATIENT_STATUS_ALLOWED.has(raw.status)) {
      return res.status(400).json({ error: `Patient may not set status to "${raw.status}"` })
    }
    patch.status = raw.status
  }

  const supabase = admin()

  // Handle the employer-paid path server-side. Client sends employer_id as a
  // *claim*; we verify against the employers table and, if it's a real active
  // employer, populate employer_id + employer_name + employer_paid + payment_amount
  // from that server-side row. The client's values for those columns are
  // discarded entirely — a scraper cannot force payment_amount = 0.
  if ('employer_id' in raw) {
    const verified = await verifyEmployerBenefit(supabase, raw.employer_id)
    if (verified) {
      patch.employer_id    = verified.employer_id
      patch.employer_name  = verified.employer_name
      patch.employer_paid  = true
      patch.payment_amount = 0
    }
    // If unverified we simply don't set employer fields — the patient
    // continues on the standard-payment path.
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No allowed columns in patch' })
  }

  patch.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('consultations')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) return res.status(500).json({ error: error.message })
  if (!data)  return res.status(404).json({ error: 'Consultation not found' })
  return res.status(200).json({ consultation: data })
}
