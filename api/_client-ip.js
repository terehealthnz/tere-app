// Client IP resolution — mirrors the trusted logic in api/handler.js.
//
// Cloudflare fronts the app on every zone (terehealth.co.nz, tere.co.nz,
// terecare.com) so `cf-connecting-ip` is the authoritative single client
// IP added by Cloudflare after it sees the true TCP peer. Fall back to
// XFF; when using XFF, take the LAST entry — proxies APPEND to XFF, so
// the leftmost entry is user-controlled and can be spoofed to bypass
// per-IP rate limits or plant a false IP in audit logs.
//
// Pen-test #315-F10: previously ~10 endpoints did
//   const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
// which reads the LEFTMOST (spoofable) entry and pipes it into audit
// tables, security_events, breach reports, consent records. Attacker
// planting a false IP in the audit trail is a real compliance concern
// even if it doesn't grant elevation. This helper is the canonical
// resolver — new endpoints must import from here rather than
// hand-rolling the parse.

export function getClientIp(req) {
  const h = req.headers || {}
  const cfIp = h['cf-connecting-ip'] || h['true-client-ip'] || null
  if (typeof cfIp === 'string' && cfIp) return cfIp
  const xff = String(h['x-forwarded-for'] || '')
  const last = xff.split(',').map(s => s.trim()).filter(Boolean).slice(-1)[0]
  if (last) return last
  return req.socket?.remoteAddress || null
}
