// Trusted-device MFA bypass helpers. See supabase/2026-10-18_trusted_devices.sql.
//
// Flow:
//   1. Provider logs in with email + PIN; MFA enabled on their account.
//   2. If the request carries a tere_trust cookie that resolves to an
//      active trusted_devices row for this provider → skip the TOTP step.
//   3. Otherwise require mfaCode as usual. On success, if the client
//      posted trustDevice=true, mint a new trust token, store its hash,
//      and set the tere_trust cookie (30-day Max-Age).
//
// All helpers swallow their own errors. A failed trust-device check must
// never block login — worst case the provider is prompted for TOTP.

import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'
import { getClientIp } from './_client-ip.js'
import { TRUST_TTL_SECONDS } from './_cookie.js'

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

function sha256(raw) {
  return createHash('sha256').update(String(raw), 'utf8').digest()
}
function pgBytea(buf) {
  return '\\x' + buf.toString('hex')
}

/**
 * Look up an active trust row for (providerId, rawToken). Returns the
 * trusted_devices.id on match (so caller can touch last_used_at), or null.
 * Enforces: not revoked, not expired, matches the given provider.
 */
export async function resolveTrustedDevice(providerId, rawToken) {
  try {
    if (!providerId || !rawToken || typeof rawToken !== 'string') return null
    const hashHex = pgBytea(sha256(rawToken))
    const nowIso = new Date().toISOString()
    const { data, error } = await admin()
      .from('trusted_devices')
      .select('id, provider_id, expires_at, revoked_at')
      .eq('token_hash', hashHex)
      .eq('provider_id', providerId)
      .maybeSingle()
    if (error || !data) return null
    if (data.revoked_at) return null
    if (data.expires_at && data.expires_at < nowIso) return null
    // Fire-and-forget touch — don't block the login path on this update.
    admin()
      .from('trusted_devices')
      .update({ last_used_at: nowIso })
      .eq('id', data.id)
      .then(() => {}, () => {})
    return data.id
  } catch (e) {
    console.warn('[trusted-device] resolve failed:', e?.message || e)
    return null
  }
}

/**
 * Mint a fresh trust token for this provider + browser. Caller is
 * responsible for writing the raw token into the tere_trust cookie.
 * Returns null on failure (login still succeeds, just no trust persisted).
 */
export async function issueTrustedDevice(req, providerId) {
  try {
    if (!providerId) return null
    const token = randomBytes(32).toString('base64url')
    const tokenHash = pgBytea(sha256(token))
    const expiresAt = new Date(Date.now() + TRUST_TTL_SECONDS * 1000).toISOString()
    const ua = req.headers?.['user-agent'] ? String(req.headers['user-agent']).slice(0, 500) : null
    const { error } = await admin()
      .from('trusted_devices')
      .insert({
        provider_id: providerId,
        token_hash:  tokenHash,
        user_agent:  ua,
        ip_at_issue: getClientIp(req),
        expires_at:  expiresAt,
      })
    if (error) throw error
    return token
  } catch (e) {
    console.warn('[trusted-device] issue failed:', e?.message || e)
    return null
  }
}

/**
 * Revoke every active trust row for a provider — called when the user
 * clicks "sign out of all devices", when MFA secret is rotated, or from
 * admin break-glass. Idempotent.
 */
export async function revokeAllTrustedDevices(providerId, reason = 'user_revoke') {
  try {
    if (!providerId) return
    const nowIso = new Date().toISOString()
    await admin()
      .from('trusted_devices')
      .update({ revoked_at: nowIso, revoke_reason: reason })
      .eq('provider_id', providerId)
      .is('revoked_at', null)
  } catch (e) {
    console.warn('[trusted-device] revoke-all failed:', e?.message || e)
  }
}

/**
 * Revoke a single trust row by its raw cookie token (used by the "forget
 * this device" button in Settings, if we add one later).
 */
export async function revokeTrustedDeviceByCookie(rawToken, reason = 'user_revoke') {
  try {
    if (!rawToken) return
    const hashHex = pgBytea(sha256(rawToken))
    const nowIso = new Date().toISOString()
    await admin()
      .from('trusted_devices')
      .update({ revoked_at: nowIso, revoke_reason: reason })
      .eq('token_hash', hashHex)
      .is('revoked_at', null)
  } catch (e) {
    console.warn('[trusted-device] revoke-by-cookie failed:', e?.message || e)
  }
}
