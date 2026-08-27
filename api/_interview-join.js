// /api/interview-join — public applicant-side endpoint.
//
// POST { token } → resolves the applicant_join_token from job_interviews to
// a LiveKit access token so the applicant can join the interview room
// without needing a Tere account.
//
// Anti-abuse:
//   - Token is 24-byte random base64url (~192 bits), unguessable
//   - Room is unique per interview, no cross-interview leakage
//   - Rate-limited by handler.js general 400/15min per IP
//   - Interview status must be 'scheduled', 'instant', or 'in_progress' —
//     ended / cancelled / no_show interviews reject with 410 Gone

import { createClient } from '@supabase/supabase-js'
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const LK_URL    = process.env.LIVEKIT_URL
const LK_KEY    = process.env.LIVEKIT_API_KEY
const LK_SECRET = process.env.LIVEKIT_API_SECRET

const JOINABLE_STATUS = new Set(['scheduled', 'instant', 'in_progress'])

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { token } = req.body || {}
  const cleanToken = String(token || '').trim()
  if (!cleanToken || cleanToken.length < 20) {
    return res.status(400).json({ error: 'invalid token' })
  }

  const supabase = admin()
  const { data: iv, error: ivErr } = await supabase
    .from('job_interviews')
    .select('id, application_id, room_key, status, scheduled_at, applicant_join_token')
    .eq('applicant_join_token', cleanToken)
    .maybeSingle()

  if (ivErr) {
    console.error('[interview-join] lookup failed:', ivErr.message)
    return res.status(500).json({ error: 'Server error' })
  }
  if (!iv) return res.status(404).json({ error: 'Interview not found' })
  if (!JOINABLE_STATUS.has(iv.status)) {
    return res.status(410).json({ error: 'This interview has ended.', status: iv.status })
  }

  // Pull the applicant's name for display + LiveKit identity.
  const { data: app } = await supabase
    .from('job_applications')
    .select('first_name, last_name')
    .eq('id', iv.application_id)
    .maybeSingle()
  const displayName = [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Applicant'

  // Dev fallback — if LiveKit env not set, still return interview metadata
  // so the applicant page can render its pre-join screen for smoke-testing.
  if (!LK_URL || !LK_KEY || !LK_SECRET) {
    return res.status(200).json({
      token: null,
      serverUrl: null,
      roomName: iv.room_key,
      displayName,
      scheduledAt: iv.scheduled_at,
      mock: true,
    })
  }

  // Best-effort room create — no-op if already exists.
  try {
    const httpUrl = LK_URL.replace(/^wss?:\/\//, 'https://')
    const svc = new RoomServiceClient(httpUrl, LK_KEY, LK_SECRET)
    await svc.createRoom({ name: iv.room_key, emptyTimeout: 900, maxParticipants: 4 })
  } catch {}

  const at = new AccessToken(LK_KEY, LK_SECRET, {
    identity: `applicant-${iv.id.slice(0, 8)}`,
    name:     displayName,
    ttl:      7200,
  })
  at.addGrant({
    roomJoin: true,
    room: iv.room_key,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })
  const lkToken = await at.toJwt()

  return res.status(200).json({
    token:       lkToken,
    serverUrl:   LK_URL,
    roomName:    iv.room_key,
    displayName,
    scheduledAt: iv.scheduled_at,
  })
}
