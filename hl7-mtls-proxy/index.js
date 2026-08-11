// mTLS termination proxy for Medical-Objects Capricorn → Vercel /api/hl7-inbound.
// Runs on Fly.io. Validates the client cert against a configured intermediate
// CA, forwards the raw body to Vercel with a shared secret, returns the ack.

import fs   from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'

const PORT = Number(process.env.PORT || 8443)
const HL7_BRIDGE_SECRET = process.env.HL7_BRIDGE_SECRET
const UPSTREAM_URL      = process.env.UPSTREAM_URL || 'https://terehealth.co.nz/api/hl7-inbound'
const CA_PATH           = process.env.CA_PATH || '/certs/medobjects-intermediate.pem'
const SERVER_CERT_PATH  = process.env.SERVER_CERT_PATH || '/certs/server.pem'
const SERVER_KEY_PATH   = process.env.SERVER_KEY_PATH  || '/certs/server.key'
const ALLOWED_CN        = (process.env.ALLOWED_CN || '').trim()  // optional pin

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
  if (!socket.authorized) return false            // node's chain validation against `ca`
  if (ALLOWED_CN) {
    const cn = (cert.subject && cert.subject.CN) || ''
    if (cn !== ALLOWED_CN) return false
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
  console.log(`hl7-mtls-proxy listening on :${PORT} → ${UPSTREAM_URL}`)
})
