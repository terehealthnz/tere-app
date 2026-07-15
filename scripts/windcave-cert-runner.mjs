#!/usr/bin/env node
// Windcave certification test runner.
//
// Exercises our Windcave integration against their UAT sandbox and
// captures request/response logs for every call. Outputs land in
// `windcave-cert-logs/` — those files are what you upload to the cert
// form for "end-to-end API logs".
//
// Usage:
//   node scripts/windcave-cert-runner.mjs create-session <auth|purchase> <amount> [merchantRef]
//   node scripts/windcave-cert-runner.mjs complete <sessionId> <amount>
//   node scripts/windcave-cert-runner.mjs refund <sessionId> <amount>
//   node scripts/windcave-cert-runner.mjs query <sessionId>
//   node scripts/windcave-cert-runner.mjs decline-suite            # runs Complete #1-#4 sub-tests
//   node scripts/windcave-cert-runner.mjs help
//
// Env vars required (source from Vercel: `vercel env pull .env.local`):
//   WINDCAVE_USERNAME
//   WINDCAVE_API_KEY
//   WINDCAVE_BASE_URL    (defaults to https://uat.windcave.com/api/v1)
//   PUBLIC_SITE_ORIGIN   (defaults to https://terehealth.co.nz — used for callback URLs)

import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ── Load .env.local if present ────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const USERNAME = process.env.WINDCAVE_USERNAME
const API_KEY  = process.env.WINDCAVE_API_KEY
const BASE_URL = process.env.WINDCAVE_BASE_URL || 'https://uat.windcave.com/api/v1'
const ORIGIN   = process.env.PUBLIC_SITE_ORIGIN || 'https://terehealth.co.nz'

if (!USERNAME || !API_KEY) {
  console.error('❌ WINDCAVE_USERNAME and WINDCAVE_API_KEY required.')
  console.error('   Run: vercel env pull .env.local')
  process.exit(1)
}

const LOGS_DIR = join(__dirname, '..', 'windcave-cert-logs')
mkdirSync(LOGS_DIR, { recursive: true })

const basicAuth = 'Basic ' + Buffer.from(`${USERNAME}:${API_KEY}`).toString('base64')

// ── Logging: writes {req, res, meta} to per-test JSON files ───────────────────
function saveLog(name, entry) {
  const path = join(LOGS_DIR, `${name}.json`)
  const existing = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : []
  existing.push(entry)
  writeFileSync(path, JSON.stringify(existing, null, 2))
}

async function windcaveCall({ method, path, body, xId, testName }) {
  const url = `${BASE_URL}${path}`
  const headers = {
    'Accept': 'application/json',
    'Authorization': basicAuth,
  }
  if (body) headers['Content-Type'] = 'application/json'
  if (xId)  headers['X-ID'] = xId

  const started = Date.now()
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const took = Date.now() - started
  const responseText = await res.text()
  let responseBody
  try { responseBody = JSON.parse(responseText) } catch { responseBody = responseText }

  const entry = {
    ts: new Date().toISOString(),
    took_ms: took,
    request: {
      method, url,
      headers: { ...headers, Authorization: 'Basic [REDACTED]' },
      body: body || null,
    },
    response: {
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body: responseBody,
    },
  }
  saveLog(testName, entry)
  return { status: res.status, body: responseBody, entry }
}

// ── Windcave operations ──────────────────────────────────────────────────────
async function createSession({ type, amount, merchantRef, testName }) {
  const ref = merchantRef || `cert-${type}-${Date.now()}`
  const xId = randomUUID()
  const payload = {
    type,
    amount: Number(amount).toFixed(2),
    currency: 'NZD',
    merchantReference: ref,
    storeCard: false,
    callbackUrls: {
      approved:  `${ORIGIN}/payment-return?ref=${encodeURIComponent(ref)}&status=approved`,
      declined:  `${ORIGIN}/payment-return?ref=${encodeURIComponent(ref)}&status=declined`,
      cancelled: `${ORIGIN}/payment-return?ref=${encodeURIComponent(ref)}&status=cancelled`,
    },
    notificationUrl: `${ORIGIN}/api/windcave-fprn`,
    methods: ['card'],
  }
  const { status, body } = await windcaveCall({
    method: 'POST',
    path: '/sessions',
    body: payload,
    xId,
    testName,
  })
  if (status < 200 || status >= 300) throw new Error(`create-session failed: ${status} ${JSON.stringify(body)}`)
  const hppLink = (body.links || []).find(l => l.rel === 'hpp')
  return { sessionId: body.id, hppUrl: hppLink?.href, merchantRef: ref, xId, raw: body }
}

async function completeTx({ sessionId, amount, testName }) {
  const xId = randomUUID()
  const { status, body } = await windcaveCall({
    method: 'POST',
    path: `/sessions/${encodeURIComponent(sessionId)}/transactions`,
    body: { type: 'complete', amount: Number(amount).toFixed(2) },
    xId,
    testName,
  })
  return { status, body, xId, transactionId: body?.id || body?.transactionId || null }
}

async function refundTx({ sessionId, amount, testName }) {
  const xId = randomUUID()
  const { status, body } = await windcaveCall({
    method: 'POST',
    path: `/sessions/${encodeURIComponent(sessionId)}/transactions`,
    body: { type: 'refund', amount: Number(amount).toFixed(2) },
    xId,
    testName,
  })
  return { status, body, xId, transactionId: body?.id || body?.transactionId || null }
}

async function querySession({ sessionId, testName, wait }) {
  const MAX = wait ? 6 : 1
  let last
  for (let i = 0; i < MAX; i++) {
    last = await windcaveCall({
      method: 'GET',
      path: `/sessions/${encodeURIComponent(sessionId)}`,
      testName,
    })
    if (last.status === 200) break
    if (last.status === 202 && wait && i < MAX - 1) {
      await new Promise(r => setTimeout(r, 10_000))
      continue
    }
    break
  }
  return last
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function print(label, obj) {
  console.log(`\n── ${label} ──`)
  console.log(JSON.stringify(obj, null, 2))
}

const [,, cmd, ...args] = process.argv

async function main() {
  switch (cmd) {
    case 'create-session': {
      const [type, amount, ref] = args
      if (!type || !amount) { console.error('usage: create-session <auth|purchase> <amount> [ref]'); process.exit(1) }
      const testName = `create-session-${type}`
      const r = await createSession({ type, amount, merchantRef: ref, testName })
      print('Session created', { sessionId: r.sessionId, hppUrl: r.hppUrl, merchantRef: r.merchantRef, xId: r.xId })
      console.log(`\n📄 Log saved: windcave-cert-logs/${testName}.json`)
      console.log(`\n➡️  Open the HPP URL in a browser to enter a test card.`)
      break
    }
    case 'complete': {
      const [sessionId, amount] = args
      if (!sessionId || !amount) { console.error('usage: complete <sessionId> <amount>'); process.exit(1) }
      const testName = `complete-${amount.replace('.', '_')}`
      const r = await completeTx({ sessionId, amount, testName })
      print('Complete result', { status: r.status, transactionId: r.transactionId, xId: r.xId, body: r.body })
      console.log(`\n📄 Log saved: windcave-cert-logs/${testName}.json`)
      break
    }
    case 'refund': {
      const [sessionId, amount] = args
      if (!sessionId || !amount) { console.error('usage: refund <sessionId> <amount>'); process.exit(1) }
      const testName = `refund-${amount.replace('.', '_')}`
      const r = await refundTx({ sessionId, amount, testName })
      print('Refund result', { status: r.status, transactionId: r.transactionId, xId: r.xId, body: r.body })
      console.log(`\n📄 Log saved: windcave-cert-logs/${testName}.json`)
      break
    }
    case 'query': {
      const [sessionId, wait] = args
      if (!sessionId) { console.error('usage: query <sessionId> [wait]'); process.exit(1) }
      const r = await querySession({ sessionId, testName: `query-${sessionId.slice(0, 8)}`, wait: wait === 'wait' })
      print('Query result', { status: r.status, state: r.body?.state, transactions: r.body?.transactions })
      break
    }
    case 'complete-suite': {
      // Runs the four Complete sub-tests against a pre-existing auth sessionId.
      const [sessionId] = args
      if (!sessionId) { console.error('usage: complete-suite <sessionId>  (must be an auth session with an entered card)'); process.exit(1) }
      console.log(`\n🧪 Running Complete sub-tests against session ${sessionId}\n`)
      const r1 = await completeTx({ sessionId, amount: '0.76', testName: 'complete-1-partial-0_76' })
      print('#1 partial $0.76', { status: r1.status, transactionId: r1.transactionId, xId: r1.xId, responseCode: r1.body?.responseCode })
      const r2 = await completeTx({ sessionId, amount: '60.00', testName: 'complete-2-full-60' })
      print('#2 full $60', { status: r2.status, transactionId: r2.transactionId, xId: r2.xId, responseCode: r2.body?.responseCode })
      const r3 = await completeTx({ sessionId, amount: '999.00', testName: 'complete-3-exceed-999' })
      print('#3 exceed $999', { status: r3.status, transactionId: r3.transactionId, xId: r3.xId, responseCode: r3.body?.responseCode })
      const r4 = await completeTx({ sessionId, amount: '10.00', testName: 'complete-4-second' })
      print('#4 second complete $10', { status: r4.status, transactionId: r4.transactionId, xId: r4.xId, responseCode: r4.body?.responseCode })
      console.log(`\n📄 Logs saved in windcave-cert-logs/complete-*.json`)
      break
    }
    case 'retry-complete': {
      // Two-step: decline complete ($1-$4.99), then retry complete ($5).
      const [sessionId] = args
      if (!sessionId) { console.error('usage: retry-complete <sessionId>  (auth for $5 with card 4617 5505 5400 0068)'); process.exit(1) }
      console.log(`\n🧪 Running Retry Complete against session ${sessionId}\n`)
      const decline = await completeTx({ sessionId, amount: '3.00', testName: 'retry-decline-3' })
      print('Decline complete $3', { status: decline.status, transactionId: decline.transactionId, xId: decline.xId, allowRetry: decline.body?.allowRetry, responseCode: decline.body?.responseCode })
      const retry = await completeTx({ sessionId, amount: '5.00', testName: 'retry-approved-5' })
      print('Retry complete $5', { status: retry.status, transactionId: retry.transactionId, xId: retry.xId, responseCode: retry.body?.responseCode })
      console.log(`\n📄 Logs saved in windcave-cert-logs/retry-*.json`)
      break
    }
    case 'help':
    case undefined:
      console.log(`
Windcave cert test runner

  create-session <auth|purchase> <amount> [ref]
      Create a session. Returns sessionId + hppUrl.
      Open the hppUrl in a browser to enter a test card.

  query <sessionId> [wait]
      Query session state. Add "wait" to poll 202 responses every 10s.

  complete <sessionId> <amount>
      Send a complete transaction.

  refund <sessionId> <amount>
      Send a refund transaction.

  complete-suite <sessionId>
      Run the four Complete sub-tests (partial, full, exceed, second).
      Requires an auth session with card already entered on HPP.

  retry-complete <sessionId>
      Decline complete $3 → retry complete $5.
      Requires an auth session for $5 with card 4617 5505 5400 0068.

Logs land in windcave-cert-logs/<test-name>.json.
`)
      break
    default:
      console.error(`Unknown command: ${cmd}`)
      console.error('Run "help" for usage.')
      process.exit(1)
  }
}

main().catch(e => {
  console.error('\n❌ Error:', e.message)
  process.exit(1)
})
