// /api/practice-reset — wipe legacy practice rows + re-seed via idempotent
// deterministic upsert.
//
// The old flow used random NHIs + random UUIDs and tried to delete-then-
// insert. Any orphan (from a stale-reviewing auto-expire that nulled out
// provider_id, or from a failed cascade) survived reset and blocked the
// next seed by tripping consultations_one_open_per_patient_idx.
//
// New flow: seed uses deterministic UUIDs per (provider, patient) with
// upsert, so seed IS reset. This endpoint just clears the legacy orphan
// rows before delegating to seed.
//
// Companion to /api/practice-seed.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'
import { seedPracticePatientsForProvider } from './_practice-seed.js'

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
  const supabase = admin()

  const deletions = {}

  // Clear all is_practice rows so any legacy random-UUID orphans go away.
  // Safe by construction — is_practice=true rows are sandbox data only.
  const CHILD_TABLES = [
    'patient_allergens', 'patient_medications', 'patient_conditions', 'patient_documents',
    'prescriptions', 'messages', 'inbound_hl7_messages', 'radiology_referrals', 'radiology_reports',
  ]
  for (const t of CHILD_TABLES) {
    const { count, error } = await supabase.from(t).delete({ count: 'exact' }).eq('is_practice', true)
    if (error) { console.error(`[practice-reset] delete ${t} failed:`, error); deletions[t] = { error: error.message } }
    else { deletions[t] = { deleted: count } }
  }
  const { count: consCount, error: consErr } = await supabase.from('consultations').delete({ count: 'exact' }).eq('is_practice', true)
  if (consErr) { console.error('[practice-reset] delete consultations failed:', consErr); deletions.consultations = { error: consErr.message } }
  else { deletions.consultations = { deleted: consCount } }
  const { count: patCount, error: patErr } = await supabase.from('patients').delete({ count: 'exact' }).eq('is_practice', true)
  if (patErr) { console.error('[practice-reset] delete patients failed:', patErr); deletions.patients = { error: patErr.message } }
  else { deletions.patients = { deleted: patCount } }

  // Re-seed with deterministic upsert. From now on any subsequent reset
  // just re-seeds the same UUIDs — no more orphan drift.
  const seeded = await seedPracticePatientsForProvider(supabase, auth.provider)

  return res.status(200).json({ ok: true, deletions, seeded })
}
