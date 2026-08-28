// Cloudflare Worker — Medical-Objects Capricorn → Vercel HL7 receive proxy.
//
// Replaces hl7-mtls-proxy/index.js (Fly.io). Flow:
//   1. MO's Capricorn POSTs HL7 v2 message to https://hl7.terehealth.co.nz/hl7
//      over TLS with a client cert.
//   2. Cloudflare edge validates the client cert against the mTLS CA uploaded
//      in Zero Trust > Client Certificates (see README for setup).
//   3. This Worker sees the request with request.cf.tlsClientAuth populated.
//   4. Worker checks CN allowlist, forwards raw body to Vercel with
//      X-Tere-Bridge-Secret + X-Tere-Env headers.
//   5. Worker returns Vercel's response (the HL7 ACK) to MO.
//
// mTLS strictness: relies on Cloudflare validating cert-chain trust at the
// edge. Additional defense-in-depth here: CN allowlist + cert-verified check.

export default {
  async fetch(request, env, ctx) {
    const rid = crypto.randomUUID().slice(0, 8)
    const url = new URL(request.url)

    // Health check for uptime monitors + Fly→CF cutover verification.
    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response('ok\n', { headers: { 'content-type': 'text/plain' } })
    }

    if (request.method !== 'POST') {
      log(rid, 'method_not_allowed', { method: request.method })
      return new Response('Method not allowed', { status: 405, headers: { 'Allow': 'POST' } })
    }

    // MO's Capricorn convention posts to /hl7. Accept / as a fallback.
    if (!url.pathname.startsWith('/hl7') && url.pathname !== '/') {
      log(rid, 'not_found', { path: url.pathname })
      return new Response('Not found', { status: 404 })
    }

    // ── mTLS validation ──────────────────────────────────────────────────────
    // request.cf.tlsClientAuth is populated only when the Zone has mTLS
    // configured for this hostname (Cloudflare Zero Trust > Client
    // Certificates > "Hosts required to use mTLS" includes this hostname).
    //
    // Cloudflare's field value convention (verified via live tail 2026-08-28):
    //   certPresented: '1' if a client cert was presented, '0' otherwise
    //   certVerified:  'SUCCESS' | 'FAILED:<reason>' | 'NONE'
    //   certRevoked:   '1' | '0'
    // Prior version of this check compared certPresented to 'SUCCESS' which
    // never matched (that's a certVerified value, not certPresented), causing
    // every real MO test message to bounce with 401. Rejected Tony's first
    // prod test 2026-08-28 14:06 NZ — that's how we found the bug.
    const auth = request.cf?.tlsClientAuth
    if (!auth || auth.certPresented !== '1') {
      log(rid, 'no_client_cert', {
        presented: auth?.certPresented ?? 'null',
        verified: auth?.certVerified ?? 'null',
      })
      return new Response('client certificate required', { status: 401 })
    }
    if (auth.certVerified !== 'SUCCESS') {
      log(rid, 'cert_verification_failed', {
        verified: auth.certVerified,
        revoked: auth.certRevoked,
      })
      return new Response('client certificate not trusted', { status: 401 })
    }
    if (auth.certRevoked === '1') {
      log(rid, 'cert_revoked', { serial: auth.certSerial })
      return new Response('client certificate revoked', { status: 401 })
    }

    // Extract CN from the RFC 2253 subject DN. Example:
    //   "CN=hd.d5ddb385-...id.test.medical-objects.com.au,O=...,C=..."
    const cn = extractCN(auth.certSubjectDN || '')
    const allowedCns = (env.ALLOWED_CNS || '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    if (allowedCns.length && !allowedCns.includes((cn || '').toLowerCase())) {
      log(rid, 'cn_not_allowlisted', { cn, allowed_count: allowedCns.length })
      return new Response('client CN not allowlisted', { status: 401 })
    }

    // ── Forward to Vercel ────────────────────────────────────────────────────
    // Read body as ArrayBuffer to preserve raw bytes (HL7 v2 is 7-bit ASCII
    // but we don't want to accidentally re-encode base64 PDF blobs in OBX
    // ED segments).
    let body
    try {
      body = await request.arrayBuffer()
    } catch (e) {
      log(rid, 'body_read_failed', { error: e.message })
      return new Response('Body read error: ' + e.message, { status: 400 })
    }

    const bodyLen = body.byteLength
    if (bodyLen === 0) {
      log(rid, 'empty_body', {})
      return new Response('Empty body', { status: 400 })
    }
    if (bodyLen > 6 * 1024 * 1024) {
      log(rid, 'body_too_large', { bytes: bodyLen })
      return new Response('Body too large', { status: 413 })
    }

    log(rid, 'received', {
      bytes: bodyLen,
      cn,
      cf_ray: request.headers.get('cf-ray'),
      cf_ipcountry: request.headers.get('cf-ipcountry'),
    })

    const upstreamUrl = env.UPSTREAM_URL || 'https://terehealth.co.nz/api/hl7-inbound'
    const tereEnv    = env.TERE_ENV || 'nz-prod'

    const t0 = Date.now()
    let upstreamRes
    try {
      // AbortController → 25s timeout. Vercel serverless functions have a
      // 60s wall-clock limit but the /api/hl7-inbound handler typically
      // returns in <2s. 25s here catches genuine hangs without eating the
      // full Worker 30s CPU budget.
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 25_000)
      try {
        upstreamRes = await fetch(upstreamUrl, {
          method: 'POST',
          headers: {
            'content-type':          'application/hl7-v2',
            'x-tere-bridge-secret':  env.HL7_BRIDGE_SECRET || '',
            'x-tere-env':            tereEnv,
            'x-tere-mtls-cn':        cn,       // for Vercel audit log
            'x-tere-mtls-serial':    auth.certSerial || '',
            'x-tere-rid':            rid,
          },
          body,
          signal: ac.signal,
        })
      } finally {
        clearTimeout(timer)
      }
    } catch (e) {
      const ms = Date.now() - t0
      log(rid, 'forward_failed', { ms, error: e.message, upstream: upstreamUrl })
      return new Response('Upstream error: ' + e.message, {
        status: 502,
        headers: { 'content-type': 'text/plain' },
      })
    }

    const upstreamBody = await upstreamRes.arrayBuffer()
    const ms = Date.now() - t0
    log(rid, 'forwarded', {
      ms,
      upstream_status: upstreamRes.status,
      response_bytes: upstreamBody.byteLength,
    })

    // Return upstream response verbatim — includes the HL7 ACK payload.
    return new Response(upstreamBody, {
      status: upstreamRes.status,
      headers: {
        'content-type': upstreamRes.headers.get('content-type') || 'application/hl7-v2',
        'x-tere-rid': rid,
      },
    })
  },
}

// Extract the CN attribute from an RFC 2253 subject DN. Handles the common
// case where CN is the first component. Case-insensitive attribute match.
// Doesn't handle escaped commas (\,) in CN — MO's certs don't use them.
function extractCN(subjectDN) {
  if (!subjectDN) return ''
  const parts = subjectDN.split(',')
  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const attr = part.slice(0, eq).trim().toUpperCase()
    if (attr === 'CN') return part.slice(eq + 1).trim()
  }
  return ''
}

// One-line JSON log. Cloudflare's `wrangler tail` and Workers Analytics both
// index these. Never log the raw HL7 body — PHI risk.
function log(rid, phase, extra) {
  const entry = { rid, phase, ...extra, ts: new Date().toISOString() }
  console.log(JSON.stringify(entry))
}
