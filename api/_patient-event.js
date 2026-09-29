// POST /api/patient-event — anon patient-side funnel telemetry sink.
//
// Payload:
//   { session_id, event_name, path?, meta?, consultation_id? }
//
// No auth. Rate-limited per session_id (200 events/hour) to prevent a bad
// actor DoSing the table. session_id is a client-generated UUID stored in
// sessionStorage — resets per tab.
//
// Explicit "no PHI" policy: this endpoint's contract only stores the
// path, event name, and structured meta. Callers that pass free-form
// message text (or PHI-shaped fields like patient_email) are rejected at
// the shape layer. The proper channel for PHI messages is /api/patient-
// support (task #108).

import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const RATE_LIMIT_WINDOW_HOURS = 1
const RATE_LIMIT_MAX = 200

// Deny-list of meta keys that could smuggle PHI in. Callers should be
// sending event names + path only; meta is for lightweight structured
// context (e.g. { language: 'en', device: 'mobile' }).
const PHI_META_KEYS = new Set([
  'name', 'first_name', 'last_name', 'full_name',
  'email', 'patient_email',
  'phone', 'patient_phone',
  'nhi', 'patient_nhi',
  'address', 'patient_address',
  'dob', 'date_of_birth',
  'complaint', 'chief_complaint',
  'message', 'body', 'note',
])

function hashIp(ip) {
  if (!ip) return null
  const salt = process.env.IP_HASH_SALT || 'tere-funnel'
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { session_id, event_name, path, meta, consultation_id } = req.body || {}

  if (!session_id || typeof session_id !== 'string' || session_id.length > 128) {
    return res.status(400).json({ error: 'session_id required' })
  }
  if (!event_name || typeof event_name !== 'string' || event_name.length > 64) {
    return res.status(400).json({ error: 'event_name required' })
  }

  // Meta shape guard — reject known PHI keys. Callers who mistakenly try
  // to send name/email land here loudly instead of silently leaking PHI
  // into the telemetry table.
  if (meta && typeof meta === 'object') {
    for (const k of Object.keys(meta)) {
      if (PHI_META_KEYS.has(k.toLowerCase())) {
        return res.status(400).json({ error: `meta key "${k}" is not permitted on this channel — use /api/patient-support for PHI` })
      }
    }
  }

  const supabase = admin()

  // Rate limit — count recent events for this session_id, drop past the
  // ceiling. A normal patient session fires ~20 events. 200/hour is a
  // 10× safety margin.
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_HOURS * 3600 * 1000).toISOString()
  const { count } = await supabase.from('patient_funnel_events')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session_id)
    .gte('created_at', windowStart)
  if (typeof count === 'number' && count >= RATE_LIMIT_MAX) {
    // Silent success — don't tell the client they're rate-limited, don't
    // fail the fire-and-forget beacon. Just drop.
    return res.status(200).json({ ok: true, skipped: 'rate_limit' })
  }

  const ipHash = hashIp(
    req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
    req.headers['x-real-ip']?.toString() ||
    req.socket?.remoteAddress
  )
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 256)

  const { error } = await supabase.from('patient_funnel_events').insert({
    session_id,
    event_name: event_name.slice(0, 64),
    path: path ? String(path).slice(0, 256) : null,
    meta: (meta && typeof meta === 'object') ? meta : {},
    consultation_id: consultation_id || null,
    ip_hash: ipHash,
    user_agent: userAgent,
  })
  if (error) {
    console.warn('[patient-event] insert failed:', error.message)
    return res.status(500).json({ error: 'Server error' })
  }
  return res.status(200).json({ ok: true })
}
