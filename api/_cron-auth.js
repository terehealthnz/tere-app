// Shared cron-endpoint auth. Used by all /api/cron-*.js handlers.
//
// Accepts either `Authorization: Bearer $CRON_SECRET` (Vercel's scheduler
// auto-attaches this) or `?secret=$CRON_SECRET` (manual CLI test).
// Comparison is constant-time to prevent timing side-channels leaking the
// secret one character at a time (prior code used `===`, which is a
// timing-attack surface — pen test 2026-08-23 P2 crypto finding).

import crypto from 'crypto'

export function verifyCronSecret(req) {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const supplied =
    req.query?.secret ||
    (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '') ||
    null
  if (!supplied) return false
  const a = Buffer.from(String(supplied))
  const b = Buffer.from(String(expected))
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
