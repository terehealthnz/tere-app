// Cloudflare Turnstile server-side verification.
//
// Public forms (contact, careers apply, patient intake if ever unauth'd)
// render the Turnstile widget with VITE_TURNSTILE_SITE_KEY and POST the
// user's token as `turnstile_token`. This helper verifies it against
// Cloudflare's siteverify endpoint before we do any real work.
//
// Env:
//   TURNSTILE_SECRET_KEY  — required at runtime; if missing, verifyTurnstile
//     returns { ok: true, skipped: true } and logs a warning so we don't
//     wedge deploys pre-configuration. Once set in Vercel, verification
//     becomes mandatory automatically.
//
// Usage:
//   import { verifyTurnstile } from './_turnstile.js'
//   const check = await verifyTurnstile(req.body?.turnstile_token, req)
//   if (!check.ok) return res.status(check.status).json({ error: check.error })
//
// Closes Blacklock WEB-0923-0637079391 (Lack of CAPTCHA on Public Forms).

import { getClientIp } from './_client-ip.js'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export async function verifyTurnstile(token, req) {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    // Fail-open until Patrick configures the env var. Emits a warning so
    // it shows up in logs and gets caught before we forget.
    console.warn('[turnstile] TURNSTILE_SECRET_KEY not set — skipping verification')
    return { ok: true, skipped: true }
  }
  if (!token || typeof token !== 'string') {
    return { ok: false, status: 400, error: 'Human-verification required. Please refresh and try again.' }
  }
  try {
    const body = new URLSearchParams()
    body.set('secret', secret)
    body.set('response', token)
    const ip = getClientIp(req)
    if (ip) body.set('remoteip', ip)
    const r = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const data = await r.json().catch(() => ({}))
    if (data?.success === true) return { ok: true }
    console.warn('[turnstile] verification rejected', {
      status: r.status,
      codes: data?.['error-codes'] || null,
    })
    return { ok: false, status: 403, error: 'Human-verification failed. Please refresh and try again.' }
  } catch (e) {
    // Network glitch or Cloudflare outage — fail open. Better to accept a
    // spam ticket than block a real patient reaching support.
    console.error('[turnstile] siteverify unreachable, failing open:', e?.message || e)
    return { ok: true, degraded: true }
  }
}
