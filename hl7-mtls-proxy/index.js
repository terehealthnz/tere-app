// mTLS termination proxy for Medical-Objects Capricorn → Vercel /api/hl7-inbound.
// Runs on Fly.io. Validates the client cert against a configured intermediate
// CA, forwards the raw body to Vercel with a shared secret, returns the ack.

import fs   from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'

// NOTE (2026-08-19): this Fly.io proxy is being retired. See hl7-cf-worker/
// for the Cloudflare Worker replacement. Reason: Fly edge silently dropped
// 9/13 messages in Tony's test burst — see docs/incidents/ if written up.
// Keep this file until CF Worker cutover is verified end-to-end.

const PORT = Number(process.env.PORT || 8443)
const HL7_BRIDGE_SECRET = process.env.HL7_BRIDGE_SECRET
const UPSTREAM_URL      = process.env.UPSTREAM_URL || 'https://terehealth.co.nz/api/hl7-inbound'
// '<country>-<prod|test>' — stamped on the outbound forward so the Vercel
// endpoint can tag the message row + prevent test messages ever hitting
// downstream auto-file logic. Naming pattern reserves room for AU/US
// expansion (au-prod, au-test, us-prod, us-test) without another rename.
// Two Fly apps exist today (see fly.toml + fly.test.toml):
//   tere-hl7-mtls       — hl7.terehealth.co.nz      — TERE_ENV=nz-prod
//   tere-hl7-mtls-test  — hl7-test.terehealth.co.nz — TERE_ENV=nz-test
const TERE_ENV = /^[a-z]{2,3}-(prod|test)$/.test(String(process.env.TERE_ENV || '').toLowerCase())
  ? String(process.env.TERE_ENV).toLowerCase()
  : 'nz-prod'
// CA chain used to validate the Medical-Objects Capricorn client cert.
// Test network: /certs/demo-client-chain-g3.pem (root + intermediate concat).
const CA_PATH           = process.env.CA_PATH || '/certs/demo-client-chain-g3.pem'
const SERVER_CERT_PATH  = process.env.SERVER_CERT_PATH || '/certs/server.pem'
const SERVER_KEY_PATH   = process.env.SERVER_KEY_PATH  || '/certs/server.key'
// Comma-separated allowlist of client cert CNs. Empty = accept any cert the CA
// chain trusts (dangerous — always set in prod). Case-insensitive match.
// Test network CN: hd.d5ddb385-8b7c-460f-a887-0dcaddf48b0e-guid.id.test.medical-objects.com.au
const ALLOWED_CNS = (process.env.ALLOWED_CNS || process.env.ALLOWED_CN || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

if (!HL7_BRIDGE_SECRET) { console.error('HL7_BRIDGE_SECRET missing'); process.exit(1) }

function loadCerts() {
  const ca   = fs.readFileSync(CA_PATH)
  const cert = fs.readFileSync(SERVER_CERT_PATH)
  const key  = fs.readFileSync(SERVER_KEY_PATH)
  return { ca, cert, key }
}

async function forward(body, replyHeaders) {
  const url = new URL(UPSTREAM_URL)
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      port:     url.port || 443,
      path:     url.pathname + url.search,
      method:   'POST',
      headers: {
        'Content-Type':          'application/hl7-v2',
        'Content-Length':        Buffer.byteLength(body),
        'X-Tere-Bridge-Secret':  HL7_BRIDGE_SECRET,
        'X-Tere-Env':            TERE_ENV,
        ...replyHeaders,
      },
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), contentType: res.headers['content-type'] || 'text/plain' }))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function acceptCert(socket) {
  const cert = socket.getPeerCertificate()
  if (!cert || !Object.keys(cert).length) return false
  if (!socket.authorized) {
    console.warn('[proxy] cert rejected by chain validation:', socket.authorizationError)
    return false
  }
  if (ALLOWED_CNS.length) {
    const cn = ((cert.subject && cert.subject.CN) || '').toLowerCase()
    if (!ALLOWED_CNS.includes(cn)) {
      console.warn(`[proxy] cert CN not allowlisted: ${cn}`)
      return false
    }
  }
  return true
}

async function handleRequest(req, res) {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    return res.end('ok\n')
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Allow': 'POST' })
    return res.end('Method not allowed')
  }
  // We accept POSTs to /hl7 (Capricorn convention) or / for flexibility.
  if (!req.url.startsWith('/hl7') && req.url !== '/') {
    res.writeHead(404); return res.end('Not found')
  }
  if (!acceptCert(req.socket)) {
    res.writeHead(401, { 'Content-Type': 'text/plain' })
    return res.end('client cert invalid or missing')
  }
  const chunks = []
  let total = 0
  req.on('data', c => {
    total += c.length
    if (total > 6 * 1024 * 1024) { res.writeHead(413); res.end('Body too large'); req.destroy() }
    chunks.push(c)
  })
  req.on('end', async () => {
    const body = Buffer.concat(chunks).toString('utf8')
    try {
      const upstream = await forward(body, {})
      res.writeHead(upstream.status, { 'Content-Type': upstream.contentType })
      res.end(upstream.body)
    } catch (e) {
      console.error('[proxy] forward failed:', e.message)
      res.writeHead(502, { 'Content-Type': 'text/plain' })
      res.end('Upstream error: ' + e.message)
    }
  })
}

const { ca, cert, key } = loadCerts()
const server = https.createServer({
  ca, cert, key,
  requestCert: true,
  rejectUnauthorized: false,   // we manually check acceptCert() so we can log the reason
  minVersion: 'TLSv1.2',
}, handleRequest)

server.listen(PORT, () => {
  console.log(`hl7-mtls-proxy [${TERE_ENV}] listening on :${PORT} → ${UPSTREAM_URL}`)
})
