// Region-aware Supabase client selection for serverless API handlers.
//
// Tere runs three surfaces from one codebase:
//   NZ prod → terehealth.co.nz  → NZ Supabase (xynwqfbnwpkyvovxdone)
//   US prod → terecare.com      → NZ Supabase (US shares NZ DB for now)
//   AU beta → tere.co.nz        → AU Supabase (jkpyxyfqbscdeyxfpxnq)
//
// Selection is driven by the incoming request's Host header. Callers pass
// `req` in and get back the correct project's client. AU beta was spun up
// 2026-08-19 for Shively partnership build-out — separate Supabase project
// in ap-southeast-2 (Sydney) so AU test data can't accidentally land in
// NZ production records. See [[project-tere-au-expansion]] +
// scripts/copy-schema-via-mgmt-api.mjs which seeded the AU schema.
//
// New handlers: import { adminClient } and call `const supabase = adminClient(req)`
// instead of `createClient(process.env.VITE_SUPABASE_URL, ...)`. Legacy
// handlers that use the raw env-var pattern will continue to hit the NZ
// project regardless of host — those need migration before real AU data
// flows through them.

import { createClient } from '@supabase/supabase-js'

// Hosts that route to the AU project. Must stay in sync with AU_HOSTS in
// src/lib/region.js — no shared module across api/src due to Vercel's
// serverless build boundary.
const AU_HOSTS = new Set([
  'tere.co.nz',
  'www.tere.co.nz',
])

function pickProject(req) {
  const host = String(req?.headers?.host || req?.headers?.['x-forwarded-host'] || '').toLowerCase()
  if (AU_HOSTS.has(host)) {
    return {
      region:     'au',
      url:        process.env.VITE_SUPABASE_URL_AU,
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY_AU,
      anonKey:    process.env.VITE_SUPABASE_ANON_KEY_AU,
    }
  }
  return {
    region:     'nz',
    url:        process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    anonKey:    process.env.VITE_SUPABASE_ANON_KEY,
  }
}

// Service-role client — bypasses RLS. Use for any server-side operation
// that needs to write on behalf of a user (99% of API handlers).
export function adminClient(req) {
  const p = pickProject(req)
  if (!p.url || !p.serviceKey) {
    throw new Error(`adminClient: missing ${p.region.toUpperCase()} Supabase env vars`)
  }
  return createClient(p.url, p.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Anon-key client — respects RLS. Rarely needed server-side.
export function anonClient(req) {
  const p = pickProject(req)
  if (!p.url || !p.anonKey) {
    throw new Error(`anonClient: missing ${p.region.toUpperCase()} Supabase env vars`)
  }
  return createClient(p.url, p.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Raw env-var accessor for handlers that pass URL/key strings into other
// libraries (e.g. storage-signed-URL helpers). Prefer adminClient() where
// possible.
export function supabaseEnv(req) {
  return pickProject(req)
}
