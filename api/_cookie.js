// Cookie helpers for the provider auth cookies.
//
// Two cookies:
//   tere_session — the active login session. HttpOnly, Secure, SameSite=Strict,
//                  14-day Max-Age (bumped from 7d 2026-10-18).
//   tere_trust   — per-device MFA bypass. Set when the provider ticks
//                  "Trust this device for 30 days" on the MFA screen.
//                  Same attributes, 30-day Max-Age. Server validates the
//                  token hash against trusted_devices.
//
// Both are HttpOnly so JavaScript can't read them (XSS session theft block),
// Secure so they only ride HTTPS (prod is always HTTPS behind Cloudflare),
// SameSite=Strict so they're never sent on cross-site requests (CSRF block).
//
// The Vercel serverless runtime doesn't offer a cookie library out of the
// box for the native Node handler shape we use, so this file has a very
// small parse/serialize implementation instead of pulling in `cookie`.

import { createHash, randomBytes } from 'node:crypto'

export const SESSION_COOKIE_NAME = 'tere_session'

// 14 days — long enough that most providers only re-login every other
// week on a given device, short enough that a stolen laptop closes out
// within the fortnight if the user doesn't notice. Device-trust cookie
// (TRUST_TTL_SECONDS below) is the longer MFA-skip window; this one is
// just "stay logged in" convenience.
export const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60

// Trusted-device cookie — presented on login, lets the provider skip the
// TOTP step on this browser for 30 days. Server validates against
// trusted_devices table (see supabase/2026-10-18_trusted_devices.sql).
export const TRUST_COOKIE_NAME = 'tere_trust'
export const TRUST_TTL_SECONDS = 30 * 24 * 60 * 60

/** Generate a 32-byte URL-safe random token (43 chars base64url). */
export function generateSessionToken() {
  return randomBytes(32).toString('base64url')
}

/** SHA-256 hash the token — this is what we store in provider_sessions. */
export function hashSessionToken(rawToken) {
  return createHash('sha256').update(String(rawToken), 'utf8').digest()
}

/** Read a specific cookie value from the request. Returns null if absent. */
export function readCookie(req, name) {
  const header = req.headers?.cookie
  if (!header || typeof header !== 'string') return null
  // Cookie header shape: name1=val1; name2=val2
  const pairs = header.split(';')
  for (const raw of pairs) {
    const eq = raw.indexOf('=')
    if (eq < 0) continue
    const k = raw.slice(0, eq).trim()
    if (k !== name) continue
    const v = raw.slice(eq + 1).trim()
    try { return decodeURIComponent(v) } catch { return v }
  }
  return null
}

/** Attach a Set-Cookie header to the response. Overwrites any previous. */
export function writeSessionCookie(res, token, { maxAgeSeconds = SESSION_TTL_SECONDS } = {}) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${Math.floor(maxAgeSeconds)}`,
  ]
  appendSetCookie(res, parts.join('; '))
}

/** Clear the session cookie (used by logout). */
export function clearSessionCookie(res) {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Max-Age=0',
  ]
  appendSetCookie(res, parts.join('; '))
}

/** Write the trusted-device cookie — set on successful MFA when the
 *  provider ticks "Trust this device". Token hash is stored server-side
 *  in trusted_devices; this cookie just carries the raw token. */
export function writeTrustCookie(res, token, { maxAgeSeconds = TRUST_TTL_SECONDS } = {}) {
  const parts = [
    `${TRUST_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${Math.floor(maxAgeSeconds)}`,
  ]
  appendSetCookie(res, parts.join('; '))
}

/** Clear the trust cookie (admin revoke, "sign out of all devices", etc.). */
export function clearTrustCookie(res) {
  const parts = [
    `${TRUST_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Max-Age=0',
  ]
  appendSetCookie(res, parts.join('; '))
}

// Vercel's Node handler res.setHeader('Set-Cookie', ...) replaces any prior
// Set-Cookie. If we ever set multiple cookies in one response we'd need the
// array form. Today we only set one at a time, but write via array anyway
// for future-proofing.
function appendSetCookie(res, cookieStr) {
  const existing = res.getHeader?.('Set-Cookie')
  if (!existing) {
    res.setHeader('Set-Cookie', cookieStr)
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieStr])
  } else {
    res.setHeader('Set-Cookie', [existing, cookieStr])
  }
}
