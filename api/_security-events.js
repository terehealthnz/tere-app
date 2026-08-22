// Helper to persist a row into the security_events table. Called from
// anywhere in the API that wants to record an alertable / auditable
// security event (auth failures, rate-limit breaches, anomaly hits, etc.).
//
// This is fire-and-forget by design — never throw. If Supabase is down
// or the table is missing, the calling endpoint must still return its
// normal response. Any failure is console-logged for later investigation.

import { createClient } from '@supabase/supabase-js'

let adminCache = null
function admin() {
  if (adminCache) return adminCache
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  adminCache = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  return adminCache
}

/**
 * Persist one security event. Returns nothing; errors are swallowed.
 *
 * @param {object} evt
 * @param {string} evt.event_type  short code, e.g. 'auth_failure', 'rate_limit_hit'
 * @param {'info'|'warn'|'alert'} [evt.severity]
 * @param {string} [evt.provider_id]  UUID
 * @param {string} [evt.ip]
 * @param {string} [evt.user_agent]
 * @param {object} [evt.metadata]  arbitrary JSON payload
 */
export async function recordSecurityEvent(evt) {
  try {
    const supabase = admin()
    if (!supabase) return
    await supabase.from('security_events').insert({
      event_type:  String(evt.event_type || 'unknown').slice(0, 64),
      severity:    (evt.severity && ['info', 'warn', 'alert'].includes(evt.severity)) ? evt.severity : 'info',
      provider_id: evt.provider_id || null,
      ip:          evt.ip ? String(evt.ip).slice(0, 64) : null,
      user_agent:  evt.user_agent ? String(evt.user_agent).slice(0, 512) : null,
      metadata:    evt.metadata || {},
    })
  } catch (e) {
    console.error('[security-events] insert failed:', e?.message || e)
  }
}
