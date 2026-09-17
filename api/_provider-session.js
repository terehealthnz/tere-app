// Provider-session helpers. See supabase/2026-09-17_provider_sessions.sql.
//
// startSession   → called by /api/provider-auth on successful login.
// endSession     → called by /api/provider-logout, or by the retention
//                  cron for orphaned rows.
// touchSession   → bumps last_seen_at; called on privileged requests
//                  so orphan-close doesn't kill an actively-used session.
//
// All three swallow their own errors. Session tracking must never take
// down the calling flow — a failed session insert should not prevent
// the user from actually logging in.

import { createClient } from '@supabase/supabase-js'
import { getClientIp } from './_client-ip.js'

let cachedClient = null
function admin() {
  if (cachedClient) return cachedClient
  cachedClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  return cachedClient
}

/**
 * Create a provider_sessions row.
 * @returns {Promise<string|null>} session_id, or null on failure
 */
export async function startSession(req, providerId, { mfaUsed = false } = {}) {
  try {
    const ua = req.headers?.['user-agent'] || null
    const { data, error } = await admin()
      .from('provider_sessions')
      .insert({
        provider_id: providerId,
        ip:          getClientIp(req),
        user_agent:  ua ? String(ua).slice(0, 500) : null,
        mfa_used:    !!mfaUsed,
      })
      .select('id')
      .single()
    if (error) throw error
    return data?.id || null
  } catch (e) {
    console.warn('[provider-session] startSession failed:', e?.message || e)
    return null
  }
}

/**
 * Close a session. Idempotent — a second call is a no-op.
 * @param {string} sessionId
 * @param {'logout'|'idle_timeout'|'inferred_stale'|'admin_revoke'} endReason
 */
export async function endSession(sessionId, endReason = 'logout') {
  try {
    if (!sessionId) return
    await admin()
      .from('provider_sessions')
      .update({ ended_at: new Date().toISOString(), end_reason: endReason })
      .eq('id', sessionId)
      .is('ended_at', null)
  } catch (e) {
    console.warn('[provider-session] endSession failed:', e?.message || e)
  }
}

export async function touchSession(sessionId) {
  try {
    if (!sessionId) return
    await admin()
      .from('provider_sessions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', sessionId)
      .is('ended_at', null)
  } catch { /* best-effort */ }
}
