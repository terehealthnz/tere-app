// Cookie helpers for the provider session cookie.
//
// Cookie name is `tere_session`. Attributes:
//   - HttpOnly: JavaScript can't read it (blocks XSS-based session theft)
//   - Secure: only sent on HTTPS (prod is always HTTPS behind Cloudflare)
//   - SameSite=Strict: not sent on cross-site requests (blocks CSRF)
//   - Path=/: valid across the whole /api surface
//   - Max-Age: 7 days rolling
//
// The Vercel serverless runtime doesn't offer a cookie library out of the
// box for the native Node handler shape we use, so this file has a very
// small parse/serialize implementation instead of pulling in `cookie`.

import { createHash, randomBytes } from 'node:crypto'

export const SESSION_COOKIE_NAME = 'tere_session'

// 7 days matches the "check back weekly" cadence for provider tools without
// forcing daily re-auth for people who close and reopen tabs. Adjust if
// clinical governance wants tighter idle timeout.
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

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
