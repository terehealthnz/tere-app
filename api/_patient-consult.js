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
const PATIENT_ALLOWLIST = new Set([
  // Vitals capture flow
  'vitals', 'vitals_at',
  // Consultation type + payment shape (see FRAUD note below)
  'consultation_type', 'employer_paid', 'employer_id', 'employer_name', 'payment_amount',
  // Consent surface
  'hdc_consent_at', 'prescribing_consent_at', 'research_consent',
  'marketing_consent', 'consent_signed_at', 'consent_signature',
  // Triage self-declarations
  'controlled_medication_mentioned',
  // Post-consult rating
  'rating', 'rating_comment', 'rated_at',
])

// Only these status values may be set from the patient side. Provider-side
// status changes go through /api/consultations PATCH which has its own gate.
const PATIENT_STATUS_ALLOWED = new Set(['cancelled', 'vitals_complete'])

export default async function handler(req, res) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

  const { id } = req.query || {}
  if (!id) return res.status(400).json({ error: 'id query param required' })

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

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No allowed columns in patch' })
  }

  // FRAUD NOTE: employer_paid + employer_id + payment_amount are patient-writable
  // to make the ConsultationType.jsx flow work today. That means a patient can
  // set payment_amount = 0 with employer_paid = true and get a free consult.
  // Fix in a follow-up: server-side verification that employer_id matches a
  // whitelisted employer with valid billing on file. Tracked in task list.

  patch.updated_at = new Date().toISOString()

  const supabase = admin()
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
