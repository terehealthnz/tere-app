// POST /api/patient-heartbeat?id=<consult-uuid>
//   Updates consultations.last_seen_at so the provider's Call button can
//   decide whether to route to LiveKit (patient online <30s ago) or fall
//   straight through to phone. Called by the patient client every ~15s
//   while on the waiting-room or call screen.
//
// Auth model matches /api/patient-consult — anon-facing, consult id is the
// only credential. No PHI in request or response; only side effect is a
// timestamp bump on the caller's own row.

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { id } = req.query || {}
  if (!id) return res.status(400).json({ error: 'id query param required' })

  const supabase = admin()
  // On the first heartbeat that arrives while the row still has a NULL
  // patient_joined_at, stamp it. This mirrors what LiveKit's
  // PatientPresenceStamp did (provider PATCHed the column when the
  // patient participant appeared) but drives it from the patient side —
  // so Chime works without a Chime-specific server hook.
  const now = new Date().toISOString()
  const { data: current } = await supabase
    .from('consultations')
    .select('patient_joined_at')
    .eq('id', id)
    .maybeSingle()
  const patch = { last_seen_at: now }
  if (current && !current.patient_joined_at) patch.patient_joined_at = now
  const { error } = await supabase
    .from('consultations')
    .update(patch)
    .eq('id', id)
  if (error) { console.error('[patient-heartbeat] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
  return res.status(200).json({ ok: true })
}
