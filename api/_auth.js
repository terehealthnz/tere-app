// Server-side auth helper — verifies a Supabase JWT from the Authorization
// header and resolves the caller to an active provider row. All PHI endpoints
// call requireProvider() as the first line of defence; the router-level
// TERE_API_KEY check is retained as an additional layer but is no longer the
// only auth mechanism.

import { createClient } from '@supabase/supabase-js'

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
 * Verifies the caller is an active provider. Accepts EITHER:
 *   (a) `Authorization: Bearer <jwt>` — a Supabase auth JWT (future path), or
 *   (b) `x-provider-id: <uuid>` — the provider row id from sessionStorage
 *       (current PIN-based clinician login system).
 *
 * The router-level `x-tere-api-key` check has already run before this — that's
 * the shared secret gate. `x-provider-id` on top of it identifies WHICH
 * provider is calling, and confirms the row is active. It's not stronger than
 * the TERE_API_KEY (which is baked into the client bundle) but it lets us at
 * least do per-provider audit/allowlist logic and matches the existing session
 * storage model. Full migration to Supabase-only auth is task #67.
 *
 * Throws an Error with a `.status` property (401 / 403 / 500) on failure.
 * On success returns { userId?, email?, provider }.
 */
export async function requireProvider(req) {
  const supabase = admin()
  const token = extractBearer(req)

  // Path A — Supabase JWT auth (preferred future direction)
  if (token) {
    const { data: userRes, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userRes?.user?.email) {
      const e = new Error('Invalid or expired token'); e.status = 401; throw e
    }
    const email = userRes.user.email.toLowerCase()
    const { data: provider, error: pErr } = await supabase
      .from('providers')
      .select('id, email, first_name, last_name, is_active, is_admin, is_provider, is_supervisor')
      .ilike('email', email)
      .maybeSingle()
    if (pErr) { const e = new Error('Provider lookup failed: ' + pErr.message); e.status = 500; throw e }
    if (!provider) { const e = new Error('No provider account linked to this email'); e.status = 403; throw e }
    if (!provider.is_active) { const e = new Error('Provider account is inactive'); e.status = 403; throw e }
    return { userId: userRes.user.id, email, provider }
  }

  // Path B — sessionStorage-based provider identity (current clinician login)
  const providerId = req.headers['x-provider-id'] || req.headers['X-Provider-Id']
  if (providerId) {
    const { data: provider, error: pErr } = await supabase
      .from('providers')
      .select('id, email, first_name, last_name, is_active, is_admin, is_provider, is_supervisor')
      .eq('id', String(providerId))
      .maybeSingle()
    if (pErr) { const e = new Error('Provider lookup failed: ' + pErr.message); e.status = 500; throw e }
    if (!provider) { const e = new Error('Provider not found'); e.status = 403; throw e }
    if (!provider.is_active) { const e = new Error('Provider account is inactive'); e.status = 403; throw e }
    return { userId: null, email: provider.email, provider }
  }

  const e = new Error('No provider credential (Authorization Bearer or x-provider-id header required)')
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
