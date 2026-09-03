// /api/elevation — mint a short-lived JIT elevation token after fresh
// MFA re-verify. Required for high-sensitivity endpoints (ACC bundle export,
// patient record export, controlled drugs register) even inside an active
// session. Also required for any PHI access during off-hours (22:00–06:00 NZT).
//
// POST { mfaCode, purpose }
//   → { token, expires_at }        on success
//   → 401 if MFA fails
//   → 400 if MFA not enrolled (fall back to a re-PIN check)
//
// The token is a 24-byte base64url string. Only the SHA-256 hash is stored.

import { createClient } from '@supabase/supabase-js'
import { randomBytes, createHash } from 'crypto'
import { getClientIp } from './_client-ip.js'
import { verifyTotp } from './_totp.js'

const TTL_MS = 5 * 60 * 1000  // 5 minutes

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function sha256hex(s) { return createHash('sha256').update(s, 'utf8').digest('hex') }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const provider = req.auth?.provider
  if (!provider) return res.status(401).json({ error: 'Provider auth required' })

  const { mfaCode, purpose = 'generic' } = req.body || {}

  const supabase = admin()

  // Verify MFA re-auth. Two paths:
  //   a) Provider has MFA enrolled → require a valid TOTP code
  //   b) Provider has NOT enrolled → require them to enrol first (no fallback)
  if (!provider.mfa_enabled || !provider.mfa_secret_encoded) {
    // Fetch the raw record because req.auth.provider strips mfa_secret_encoded.
    const { data: full } = await supabase.from('providers').select('mfa_enabled, mfa_secret_encoded').eq('id', provider.id).maybeSingle()
    if (!full?.mfa_enabled || !full?.mfa_secret_encoded) {
      return res.status(400).json({ error: 'MFA not enrolled. Please enrol MFA before using elevated actions.' })
    }
    if (!mfaCode || !verifyTotp(full.mfa_secret_encoded, String(mfaCode))) {
      return res.status(401).json({ error: 'Invalid MFA code' })
    }
  } else {
    // Provider row on req.auth included the secret only if not scrubbed; refetch to be safe.
    const { data: full } = await supabase.from('providers').select('mfa_secret_encoded').eq('id', provider.id).maybeSingle()
    if (!mfaCode || !verifyTotp(full?.mfa_secret_encoded, String(mfaCode))) {
      return res.status(401).json({ error: 'Invalid MFA code' })
    }
  }

  const raw = randomBytes(24).toString('base64url')
  const tokenHash = sha256hex(raw)
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString()

  const { error } = await supabase.from('provider_elevation_tokens').insert({
    provider_id: provider.id,
    token_hash:  tokenHash,
    expires_at:  expiresAt,
    purpose:     String(purpose).slice(0, 60),
    ip:          getClientIp(req),
    user_agent:  req.headers['user-agent']?.slice(0, 400) || null,
  })
  if (error) { console.error('[elevation] insert failed:', error.message); return res.status(500).json({ error: 'Could not mint token' }) }

  return res.status(200).json({ token: raw, expires_at: expiresAt })
}

// Helper for other endpoints — validates the X-Elevation-Token header.
// Returns { ok: true } or { ok: false, error, status }.
// Also enforces off-hours rule: if current NZT hour is outside 06–22 and
// this is a PHI-view action, elevation is REQUIRED regardless of purpose.
export async function checkElevation(req, { required = true, offHoursTrigger = false } = {}) {
  const rawToken = req.headers['x-elevation-token'] || req.headers['X-Elevation-Token']

  // Off-hours check overrides — if we're in the danger window and the action
  // is off-hours-triggered, we require elevation even if the endpoint would
  // otherwise be OK without it.
  const nzHour = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', hour12: false }).format(new Date())
  const nzHourNum = parseInt(nzHour, 10)
  const isOffHours = nzHourNum < 6 || nzHourNum >= 22
  const mustHaveElevation = required || (offHoursTrigger && isOffHours)

  if (!mustHaveElevation) return { ok: true }
  if (!rawToken) return { ok: false, status: 428, error: `Elevated access required${isOffHours ? ' (off-hours access)' : ''}. Re-verify your MFA to continue.` }

  const supabase = admin()
  const tokenHash = sha256hex(String(rawToken))
  const { data: row } = await supabase.from('provider_elevation_tokens').select('*').eq('token_hash', tokenHash).maybeSingle()
  if (!row) return { ok: false, status: 428, error: 'Elevation token invalid. Re-verify your MFA.' }
  if (row.provider_id !== req.auth?.provider?.id) return { ok: false, status: 428, error: 'Elevation token does not match your session.' }
  if (new Date(row.expires_at) < new Date()) return { ok: false, status: 428, error: 'Elevation token expired. Re-verify your MFA.' }

  // Bump the used counter for audit purposes.
  try { await supabase.from('provider_elevation_tokens').update({ used_count: (row.used_count || 0) + 1 }).eq('id', row.id) } catch { /* soft */ }

  return { ok: true }
}
