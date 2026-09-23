// Server-side auth helper — verifies a Supabase JWT from the Authorization
// header and resolves the caller to an active provider row. All PHI endpoints
// call requireProvider() as the first line of defence; the router-level
// TERE_API_KEY check is retained as an additional layer but is no longer the
// only auth mechanism.

import { createClient } from '@supabase/supabase-js'
import { SESSION_COOKIE_NAME, readCookie } from './_cookie.js'
import { resolveSessionByCookie } from './_provider-session.js'

let adminCache = null
function admin() {
  if (adminCache) return adminCache
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase server env missing (VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  adminCache = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  return adminCache
}

/** Extracts a bearer token from a request. Returns null if missing. */
export function extractBearer(req) {
  const authz = req.headers['authorization'] || req.headers['Authorization'] || ''
  const match = String(authz).match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : null
}

/**
 * Verifies the caller is an active provider. Tries in order:
 *   (A) HttpOnly session cookie (`tere_session`) — the current path.
 *       Server hashes the cookie value and looks up an active session row.
 *   (B) `Authorization: Bearer <jwt>` — a Supabase auth JWT (future path,
 *       not currently used by the clinician login flow).
 *   (C) `x-provider-id: <uuid>` header — legacy path retained for the
 *       rollout window. To be removed once every deployed client has
 *       swapped to the cookie (task #562). Blacklock WEB-0923-0655443636
 *       flagged this as a bearer credential leaking into URLs and headers.
 *
 * Throws an Error with a `.status` property (401 / 403 / 500) on failure.
 * On success returns { userId?, email?, provider, sessionId? }.
 */
export async function requireProvider(req) {
  const supabase = admin()

  // Path A — session cookie (opaque token, HttpOnly). Preferred.
  const cookieToken = readCookie(req, SESSION_COOKIE_NAME)
  if (cookieToken) {
    const session = await resolveSessionByCookie(cookieToken)
    if (session) {
      const { data: provider, error: pErr } = await supabase
        .from('providers')
        .select('id, email, first_name, last_name, is_active, is_admin, is_provider, is_supervisor, is_billing_admin, patient_access_from, practice_only, mfa_enabled')
        .eq('id', session.providerId)
        .maybeSingle()
      if (pErr) { console.error('[auth] provider lookup (cookie) failed:', pErr.message); const e = new Error('Provider lookup failed'); e.status = 500; throw e }
      if (!provider) { const e = new Error('Session references a missing provider'); e.status = 403; throw e }
      if (!provider.is_active) { const e = new Error('Provider account is inactive'); e.status = 403; throw e }
      return { userId: null, email: provider.email, provider, sessionId: session.sessionId }
    }
    // Cookie present but not resolvable → fall through to legacy paths.
    // Old tabs with expired cookies + working x-provider-id can still
    // reach the app during the rollout window. Removed by task #562.
  }

  const token = extractBearer(req)

  // Path B — Supabase JWT auth (future direction; not used by clinician login today)
  if (token) {
    const { data: userRes, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userRes?.user?.email) {
      const e = new Error('Invalid or expired token'); e.status = 401; throw e
    }
    const email = userRes.user.email.toLowerCase()
    const { data: provider, error: pErr } = await supabase
      .from('providers')
      .select('id, email, first_name, last_name, is_active, is_admin, is_provider, is_supervisor, is_billing_admin, patient_access_from, practice_only, mfa_enabled')
      .ilike('email', email)
      .maybeSingle()
    if (pErr) { console.error('[auth] provider lookup (jwt) failed:', pErr.message); const e = new Error('Provider lookup failed'); e.status = 500; throw e }
    if (!provider) { const e = new Error('No provider account linked to this email'); e.status = 403; throw e }
    if (!provider.is_active) { const e = new Error('Provider account is inactive'); e.status = 403; throw e }
    return { userId: userRes.user.id, email, provider }
  }

  // Path C — legacy x-provider-id header. Removal tracked as task #562.
  const providerId = req.headers['x-provider-id'] || req.headers['X-Provider-Id']
  if (providerId) {
    const { data: provider, error: pErr } = await supabase
      .from('providers')
      .select('id, email, first_name, last_name, is_active, is_admin, is_provider, is_supervisor, is_billing_admin, patient_access_from, practice_only, mfa_enabled')
      .eq('id', String(providerId))
      .maybeSingle()
    if (pErr) { console.error('[auth] provider lookup (session) failed:', pErr.message); const e = new Error('Provider lookup failed'); e.status = 500; throw e }
    if (!provider) { const e = new Error('Provider not found'); e.status = 403; throw e }
    if (!provider.is_active) { const e = new Error('Provider account is inactive'); e.status = 403; throw e }
    return { userId: null, email: provider.email, provider }
  }

  const e = new Error('No provider credential (session cookie required)')
  e.status = 401; throw e
}

/**
 * Convenience wrapper for endpoint handlers — verifies auth and, on failure,
 * writes the appropriate response and returns null. On success returns the
 * auth result and the endpoint can proceed.
 */
export async function guardProvider(req, res) {
  try {
    return await requireProvider(req)
  } catch (e) {
    res.status(e.status || 401).json({ error: e.message })
    return null
  }
}
