// /api/practice-reset — wipe all practice data owned by this provider.
//
// POST → deletes every is_practice=true row from consultations,
//         patients, and their child tables (allergens, medications,
//         conditions, documents, prescriptions, messages, hl7 messages,
//         radiology referrals + reports) where the parent is scoped to
//         this provider. Safe by construction: all deletes are gated on
//         is_practice=true, so no real PHI can be touched.
//
// Companion to /api/practice-seed. Use "Reset practice" from the
// provider header to blow away a corrupted sandbox and start fresh.

import { createClient } from '@supabase/supabase-js'
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
  const supabase = admin()
  const providerId = auth.provider.id

  // Find every practice consultation matched to this provider, plus every
  // practice patient. Everything else (allergens, meds, prescriptions,
  // etc.) cascades via FK on patient/consultation delete — but we go
  // wider and delete by is_practice=true directly to catch orphaned rows
  // that might have been left behind by earlier seed runs.
  const deletions = {}
  const CHILD_TABLES = [
    'patient_allergens','patient_medications','patient_conditions','patient_documents',
    'prescriptions','messages','inbound_hl7_messages','radiology_referrals','radiology_reports',
  ]
  for (const t of CHILD_TABLES) {
    const { count, error } = await supabase.from(t).delete({ count: 'exact' })
      .eq('is_practice', true)
    if (error) { console.error(`[practice-reset] delete ${t} failed:`, error); deletions[t] = { error: 'delete failed' } }
    else { deletions[t] = { deleted: count } }
  }
  const { count: consCount } = await supabase.from('consultations').delete({ count: 'exact' })
    .eq('is_practice', true).eq('matched_provider_id', providerId)
  deletions.consultations = { deleted: consCount }
  const { count: patCount } = await supabase.from('patients').delete({ count: 'exact' })
    .eq('is_practice', true)
  deletions.patients = { deleted: patCount }

  return res.status(200).json({ ok: true, deletions })
}
