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
 * Verifies the JWT and looks up the matching active provider row.
 * Throws an Error with a `.status` property (401 / 403 / 500) on failure.
 * On success returns { userId, email, provider }.
 */
export async function requireProvider(req) {
  const token = extractBearer(req)
  if (!token) { const e = new Error('Missing Authorization bearer token'); e.status = 401; throw e }

  const supabase = admin()
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
