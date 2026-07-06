// Tiny server-side feature flag reader used inside other endpoints.
// Independent of the client library so it can run in a Vercel serverless
// function without pulling in React or the browser-only supabase.js file.
//
// Usage inside an endpoint:
//   import { isFlagEnabled } from './_flags-server.js'
//   const off = !(await isFlagEnabled('ai_notes_enabled', { default: true }))
//   if (off) return res.status(200).json({ skipped: true })
//
// Cached in-process for 60s to avoid a Supabase round-trip on every call.

import { createClient } from '@supabase/supabase-js'

const TTL_MS = 60 * 1000
let cache = null
let lastFetch = 0

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function loadAll() {
  if (cache && Date.now() - lastFetch < TTL_MS) return cache
  try {
    const { data, error } = await admin().from('feature_flags').select('*')
    if (error) return cache || new Map()
    cache = new Map((data || []).map(f => [f.key, f]))
    lastFetch = Date.now()
    return cache
  } catch {
    return cache || new Map()
  }
}

/**
 * Returns true iff the flag is enabled for the given provider (if any).
 * `default` is used when the flag doesn't exist in the table (fail-safe when
 * the caller can't reach Supabase). Explicit — no implicit "off" for unknown
 * keys, so a bug that renames a flag doesn't silently disable a feature.
 */
export async function isFlagEnabled(key, { providerId = null, default: def = false } = {}) {
  const map = await loadAll()
  const f = map.get(key)
  if (!f) return def
  if (Array.isArray(f.provider_allowlist) && f.provider_allowlist.length > 0) {
    return !!(providerId && f.provider_allowlist.includes(providerId))
  }
  return !!f.enabled
}
