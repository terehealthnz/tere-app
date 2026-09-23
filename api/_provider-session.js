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
import { generateSessionToken, hashSessionToken, SESSION_TTL_SECONDS } from './_cookie.js'

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
 * Create a provider_sessions row + mint the cookie token.
 *
 * @returns {Promise<{sessionId: string|null, token: string|null}>}
 *   sessionId — the UUID row PK (used for audit joins and logout).
 *   token     — the RAW cookie token. Only this call ever sees it; the DB
 *               stores only its SHA-256 hash. Caller must set it as the
 *               HttpOnly cookie and never persist it anywhere else.
 *   Both null on failure — startSession is best-effort so a failed insert
 *   never blocks the login flow. Caller falls back to legacy behaviour
 *   (no cookie set → x-provider-id path continues to work during rollout).
 */
export async function startSession(req, providerId, { mfaUsed = false } = {}) {
  try {
    const ua = req.headers?.['user-agent'] || null
    const token = generateSessionToken()
    const tokenHash = hashSessionToken(token)
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()

    // Postgres stores bytea; Supabase serialises Buffers to hex-with-\\x
    // prefix over the wire. Convert to that form explicitly so we don't
    // depend on internal driver behaviour.
    const tokenHashPg = '\\x' + tokenHash.toString('hex')

    const { data, error } = await admin()
      .from('provider_sessions')
      .insert({
        provider_id:        providerId,
        ip:                 getClientIp(req),
        user_agent:         ua ? String(ua).slice(0, 500) : null,
        mfa_used:           !!mfaUsed,
        session_token_hash: tokenHashPg,
        expires_at:         expiresAt,
      })
      .select('id')
      .single()
    if (error) throw error
    return { sessionId: data?.id || null, token }
  } catch (e) {
    console.warn('[provider-session] startSession failed:', e?.message || e)
    return { sessionId: null, token: null }
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

/**
 * Look up an active session by the raw cookie token.
 *
 * Hashes the token, probes provider_sessions by the hash, and enforces:
 *   - not ended  (ended_at IS NULL)
 *   - not revoked (revoked_at IS NULL)
 *   - not expired (expires_at > now())
 *
 * Returns { sessionId, providerId } on match, or null.
 * Never throws — auth path treats null as "no session".
 */
export async function resolveSessionByCookie(rawToken) {
  try {
    if (!rawToken || typeof rawToken !== 'string') return null
    const hash = hashSessionToken(rawToken)
    const hashPg = '\\x' + hash.toString('hex')
    const nowIso = new Date().toISOString()
    const { data, error } = await admin()
      .from('provider_sessions')
      .select('id, provider_id, expires_at, revoked_at, ended_at')
      .eq('session_token_hash', hashPg)
      .maybeSingle()
    if (error || !data) return null
    if (data.ended_at)   return null
    if (data.revoked_at) return null
    if (data.expires_at && data.expires_at < nowIso) return null
    return { sessionId: data.id, providerId: data.provider_id }
  } catch (e) {
    console.warn('[provider-session] resolveSessionByCookie failed:', e?.message || e)
    return null
  }
}

/**
 * Revoke a session immediately (logout, admin action, password change).
 * Sets revoked_at and ended_at. Idempotent.
 */
export async function revokeSessionByCookie(rawToken, reason = 'logout') {
  try {
    if (!rawToken) return
    const hashPg = '\\x' + hashSessionToken(rawToken).toString('hex')
    const nowIso = new Date().toISOString()
    await admin()
      .from('provider_sessions')
      .update({ revoked_at: nowIso, ended_at: nowIso, end_reason: reason })
      .eq('session_token_hash', hashPg)
      .is('ended_at', null)
  } catch (e) {
    console.warn('[provider-session] revokeSessionByCookie failed:', e?.message || e)
  }
}
