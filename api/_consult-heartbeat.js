// POST /api/consult-heartbeat — provider signals "I'm still active on this consult".
//
// Called every ~60s from ConsultView / ProviderConsult / ClinicianPatient
// while the provider has one of those surfaces mounted. Bumps
// consultations.updated_at so the abandoned-consult cron sweep (see
// _cron-release-abandoned-consults.js, 30-min threshold) doesn't release
// a legitimately open consult while the provider is on a long call or
// mid-note-writing without a scribe/note write in the last 30 min.
//
// Belt-and-braces: only bumps updated_at if the row is currently pinned to
// the calling provider AND status is in ('in_progress','reviewing'). This
// means the heartbeat cannot be used to steal a consult from another
// provider or to keep an already-completed consult "warm".

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const consultationId = req.body?.consultationId || req.query?.consultationId
  if (!consultationId || typeof consultationId !== 'string') {
    return res.status(400).json({ error: 'consultationId required' })
  }
  const providerId = req.auth?.provider?.id
  if (!providerId) return res.status(401).json({ error: 'Unauthorised' })

  const supabase = admin()

  // Note: setting updated_at explicitly (rather than relying on a trigger)
  // so we don't need to assume trigger existence.
  const { data, error } = await supabase
    .from('consultations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', consultationId)
    .eq('provider_id', providerId)
    .in('status', ['in_progress', 'reviewing'])
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[consult-heartbeat] update failed:', error.message)
    return res.status(500).json({ error: 'update failed' })
  }

  // data is null when the WHERE clauses didn't match (consult was released,
  // reassigned, or completed). Signal that to the client so it can stop
  // heartbeating.
  return res.status(200).json({ ok: true, active: !!data })
}
