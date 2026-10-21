// /api/meeting-join — public, anonymous guest-side resolver for business meetings.
//
// POST { token }           → first contact. Stamps guest_knocked_at and
//                            flips admission_status to 'knocking'. Returns
//                            202 { status: 'knocking' } so the client knows
//                            to poll.
// POST { token, poll:true } → polling. If admission_status='admitted',
//                            mints a LiveKit token and returns 200. If
//                            still 'knocking', returns 202. If 'denied' or
//                            meeting cancelled/completed, returns 410.
//
// Admin side admits via POST /api/business-meetings?action=admit.
//
// Anti-abuse: 24-byte random base64url token (~192 bits), unguessable.
// Rate-limited by handler.js general 400/15min per IP.

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { token, poll } = req.body || {}
  const cleanToken = String(token || '').trim()
  if (!cleanToken || cleanToken.length < 20) {
    return res.status(400).json({ error: 'invalid token' })
  }

  const supabase = admin()
  const { data: m, error } = await supabase.from('business_meetings')
    .select('id, title, guest_name, scheduled_at, duration_minutes, room_key, admission_status, status, host_provider_id, host:providers!business_meetings_host_provider_id_fkey (first_name, last_name)')
    .eq('guest_join_token', cleanToken)
    .maybeSingle()
  if (error) {
    console.error('[meeting-join] lookup failed:', error.message)
    return res.status(500).json({ error: 'Server error' })
  }
  if (!m) return res.status(404).json({ error: 'Meeting not found' })

  // Terminal states.
  if (m.status === 'cancelled' || m.status === 'completed') {
    return res.status(410).json({ error: 'This meeting has ended.', status: m.status })
  }
  if (m.admission_status === 'denied') {
    return res.status(410).json({ error: 'Entry declined.', status: 'denied' })
  }

  const meta = {
    title:       m.title,
    guestName:   m.guest_name,
    scheduledAt: m.scheduled_at,
    hostName:    m.host ? [m.host.first_name, m.host.last_name].filter(Boolean).join(' ') : null,
  }

  // First knock — stamp timestamp + flip to 'knocking', then tell client to poll.
  if (!poll && m.admission_status === 'awaiting_knock') {
    await supabase.from('business_meetings')
      .update({ admission_status: 'knocking', guest_knocked_at: new Date().toISOString() })
      .eq('id', m.id)
    return res.status(202).json({ status: 'knocking', ...meta })
  }

  // Still waiting on admin to admit.
  if (m.admission_status !== 'admitted') {
    return res.status(202).json({ status: 'knocking', ...meta })
  }

  // ── Admitted — mint LiveKit token ───────────────────────────────────────
  if (!LK_URL || !LK_KEY || !LK_SECRET) {
    return res.status(200).json({
      status: 'admitted', token: null, serverUrl: null, roomName: m.room_key, mock: true, ...meta,
    })
  }

  try {
    const httpUrl = LK_URL.replace(/^wss?:\/\//, 'https://')
    const svc = new RoomServiceClient(httpUrl, LK_KEY, LK_SECRET)
    await svc.createRoom({ name: m.room_key, emptyTimeout: 900, maxParticipants: 10 })
  } catch {}

  const at = new AccessToken(LK_KEY, LK_SECRET, {
    identity: `guest-${m.id.slice(0, 8)}`,
    name:     m.guest_name || 'Guest',
    ttl:      7200,
  })
  at.addGrant({
    roomJoin: true, room: m.room_key,
    canPublish: true, canSubscribe: true, canPublishData: true,
  })
  const lkToken = await at.toJwt()

  return res.status(200).json({
    status:    'admitted',
    token:     lkToken,
    serverUrl: LK_URL,
    roomName:  m.room_key,
    ...meta,
  })
}
