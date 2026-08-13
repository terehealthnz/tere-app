// GET /api/geo-check — server-side country lookup for the NZ residency gate.
//
// Uses the real requester IP (X-Forwarded-For, since we're behind Vercel edge)
// and hits ipapi.co. Returns { country_code, allowed, ip_hash } — ip_hash is
// sha256(ip + INTAKE_IP_SALT) so the client can pass it back to
// /api/create-consultation as durable audit evidence without us handing raw
// IPs to the browser.
//
// Note: client-side blocks alone are trivially bypassable via devtools. The
// authoritative gate lives here on the server, and the true legal cover is
// the paired attestation checkbox the patient ticks — an IP mismatch is a
// polite front-door; the attestation turns bypass into patient fraud.

import crypto from 'node:crypto'

const ALLOWED_COUNTRY = 'NZ'

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  if (fwd) return fwd
  const raw = req.socket?.remoteAddress || ''
  return raw.replace(/^::ffff:/, '')
}

function hashIp(ip) {
  const salt = process.env.INTAKE_IP_SALT || 'tere-default-salt-please-set'
  return crypto.createHash('sha256').update(`${ip}|${salt}`).digest('hex').slice(0, 32)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const ip = clientIp(req)
  let country = null
  try {
    // 3s timeout — never let a stalled ipapi.co block intake for more than
    // a moment. If lookup fails we fall through to attested-only mode with
    // country=null so the UI can still gate on the checkbox.
    const ctl = new AbortController()
    const to = setTimeout(() => ctl.abort(), 3000)
    const r = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/country/`, { signal: ctl.signal })
    clearTimeout(to)
    if (r.ok) country = String(await r.text()).trim().toUpperCase() || null
  } catch { /* offline / rate-limited / bad IP */ }

  return res.status(200).json({
    country_code: country,
    allowed:      country === ALLOWED_COUNTRY,
    // null when lookup failed — client should then rely on attestation alone
    // and we'll still store the null country + hashed IP for audit.
    ip_hash:      hashIp(ip),
  })
}
