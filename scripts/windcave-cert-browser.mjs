#!/usr/bin/env node
// Windcave certification — Playwright card-entry runner.
//
// Creates a Windcave session via the runner, opens the HPP URL in a real
// browser, enters the given test card, submits, waits for callback, then
// queries authoritative status. Records video for tests where evidence
// matters (3DS especially).
//
// Usage:
//   node scripts/windcave-cert-browser.mjs <test-name>
//
// test-name is one of:
//   3ds              — card 5588 8800 0007 7770, amount 5.00, challenge 123 (RECORDS VIDEO)
//   purchase         — card 4111 1111 1111 1111, amount 5.00, type=purchase
//   auth             — card 4111 1111 1111 1111, amount 60.00, type=auth
//                      (prints sessionId — pipe to complete-suite)
//   retry-auth       — card 4617 5505 5400 0068, amount 5.00, type=auth
//                      (prints sessionId — pipe to retry-complete)
//   response         — card 3711 1111 1111 114, amount 0.08, type=purchase
//   decline          — card 4111 1111 1111 1111, amount 0.76, type=purchase
//   all              — runs everything sequentially, prints session ID map
//
// Outputs (per test):
//   windcave-cert-logs/<test-name>-flow.json      → session + query + timings
//   windcave-cert-logs/<test-name>-screenshot.png → final iframe state
//   windcave-cert-logs/3ds-recording.webm         → video for 3DS only

import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

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
if (!USERNAME || !API_KEY) { console.error('❌ Set WINDCAVE_USERNAME + WINDCAVE_API_KEY (vercel env pull .env.local)'); process.exit(1) }

const LOGS_DIR = join(__dirname, '..', 'windcave-cert-logs')
mkdirSync(LOGS_DIR, { recursive: true })
const basicAuth = 'Basic ' + Buffer.from(`${USERNAME}:${API_KEY}`).toString('base64')

// ── Test matrix ──────────────────────────────────────────────────────────────
const TESTS = {
  '3ds': {
    card: '5588880000077770', cvv: '123', expMonth: '12', expYear: '30',
    amount: '5.00', type: 'purchase',
    challenge: '123',   // ACS challenge code for approved
    recordVideo: true,
    label: '3D Secure (challenge)',
  },
  'purchase': {
    card: '4111111111111111', cvv: '123', expMonth: '12', expYear: '30',
    amount: '5.00', type: 'purchase',
    label: 'Purchase (approved)',
  },
  'auth': {
    card: '4111111111111111', cvv: '123', expMonth: '12', expYear: '30',
    amount: '60.00', type: 'auth',
    label: 'Auth (approved) — sessionId used for Complete tests',
  },
  'retry-auth': {
    card: '4617550554000068', cvv: '123', expMonth: '12', expYear: '30',
    amount: '5.00', type: 'auth',
    label: 'Retry Auth $5 — sessionId used for retry-complete',
  },
  'response': {
    card: '371111111111114', cvv: '1234', expMonth: '12', expYear: '30',
    amount: '0.08', type: 'purchase',
    label: 'Response field check (Amex $0.08)',
  },
  'decline': {
    card: '4111111111111111', cvv: '123', expMonth: '12', expYear: '30',
    amount: '0.76', type: 'purchase',
    label: 'Decline ($0.76 triggers decline)',
  },
}

// ── Windcave helpers (identical to runner) ───────────────────────────────────
async function createSession({ type, amount, ref, testName }) {
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
  const r = await fetch(`${BASE_URL}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': basicAuth, 'X-ID': xId },
    body: JSON.stringify(payload),
  })
  const body = await r.json()
  const link = (body.links || []).find(l => l.rel === 'hpp')
  return { sessionId: body.id, hppUrl: link?.href, xId, request: payload, response: body }
}

async function querySession(sessionId) {
  const r = await fetch(`${BASE_URL}/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET', headers: { 'Accept': 'application/json', 'Authorization': basicAuth },
  })
  return { status: r.status, body: await r.json() }
}

// ── Playwright card-entry flow ───────────────────────────────────────────────
async function runOne(testName, cfg) {
  console.log(`\n🧪 [${testName}] ${cfg.label}`)
  const ref = `cert-${testName}-${Date.now()}`
  const session = await createSession({ type: cfg.type, amount: cfg.amount, ref, testName })
  if (!session.hppUrl) { console.error('❌ No HPP URL in response:', session.response); return null }
  console.log(`   sessionId: ${session.sessionId}`)
  console.log(`   hppUrl:    ${session.hppUrl}`)

  const contextOpts = cfg.recordVideo
    ? { recordVideo: { dir: LOGS_DIR, size: { width: 1280, height: 900 } } }
    : {}
  const browser = await chromium.launch({ headless: false })
  const ctx = await browser.newContext(contextOpts)
  const page = await ctx.newPage()

  const flowLog = { testName, sessionId: session.sessionId, hppUrl: session.hppUrl, ref, xId: session.xId, steps: [] }

  try {
    await page.goto(session.hppUrl, { waitUntil: 'domcontentloaded' })
    flowLog.steps.push({ ts: new Date().toISOString(), step: 'navigated to HPP' })
    await page.waitForTimeout(1500)

    // Windcave HPP field selectors vary — try common ones.
    // Card number input
    const cardField = page.locator('input[name*="card" i], input[name*="Card" i], input[placeholder*="card" i], input[id*="card" i]').first()
    await cardField.waitFor({ timeout: 15000 })
    await cardField.fill(cfg.card)
    flowLog.steps.push({ ts: new Date().toISOString(), step: 'entered card' })

    // Expiry (may be single "MM/YY" or split)
    const expSingle = page.locator('input[placeholder*="MM" i][placeholder*="YY" i], input[name*="expiry" i]:not([name*="Month" i]):not([name*="Year" i])').first()
    if (await expSingle.count() > 0 && await expSingle.isVisible().catch(() => false)) {
      await expSingle.fill(`${cfg.expMonth}/${cfg.expYear}`)
    } else {
      await page.locator('input[name*="Month" i], select[name*="Month" i]').first().fill(cfg.expMonth).catch(async () => {
        await page.locator('select[name*="Month" i]').first().selectOption(cfg.expMonth)
      })
      await page.locator('input[name*="Year" i], select[name*="Year" i]').first().fill(cfg.expYear).catch(async () => {
        await page.locator('select[name*="Year" i]').first().selectOption(cfg.expYear)
      })
    }
    flowLog.steps.push({ ts: new Date().toISOString(), step: 'entered expiry' })

    // CVV
    const cvvField = page.locator('input[name*="cvc" i], input[name*="cvv" i], input[name*="cv2" i], input[placeholder*="CVC" i], input[placeholder*="CVV" i]').first()
    await cvvField.fill(cfg.cvv)
    flowLog.steps.push({ ts: new Date().toISOString(), step: 'entered CVV' })

    // Submit
    const submit = page.locator('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Pay"), button:has-text("Continue")').first()
    await submit.click()
    flowLog.steps.push({ ts: new Date().toISOString(), step: 'submitted card form' })

    // Handle 3DS challenge if this test triggers it
    if (cfg.challenge) {
      console.log('   ⏳ Waiting for 3DS challenge…')
      const challengeField = page.locator('input[type="text"], input[type="password"], input[type="tel"]').first()
      await challengeField.waitFor({ timeout: 30000 })
      await page.waitForTimeout(1000)
      await challengeField.fill(cfg.challenge)
      flowLog.steps.push({ ts: new Date().toISOString(), step: 'entered 3DS challenge' })
      const chSubmit = page.locator('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Continue")').first()
      await chSubmit.click()
      flowLog.steps.push({ ts: new Date().toISOString(), step: 'submitted challenge' })
    }

    // Wait for callback redirect (Windcave → our callback URL)
    console.log('   ⏳ Waiting for callback…')
    await page.waitForURL(/\/payment-return/, { timeout: 60000 })
    flowLog.steps.push({ ts: new Date().toISOString(), step: 'reached callback', url: page.url() })
  } catch (e) {
    flowLog.error = e.message
    console.error(`   ❌ ${e.message}`)
    await page.screenshot({ path: join(LOGS_DIR, `${testName}-error.png`), fullPage: true }).catch(() => {})
  }

  // Screenshot final state
  await page.screenshot({ path: join(LOGS_DIR, `${testName}-screenshot.png`), fullPage: true }).catch(() => {})

  await ctx.close()
  await browser.close()

  if (cfg.recordVideo) {
    // Playwright saves videos to the context dir; rename for clarity
    // (we'll rename in a post-step outside the browser context)
    flowLog.videoDir = LOGS_DIR
  }

  // Query authoritative outcome
  const q = await querySession(session.sessionId)
  flowLog.query = q
  const tx = (q.body?.transactions || [])[0]
  flowLog.transactionId = tx?.id || null
  flowLog.responseCode = tx?.responseCode || null
  flowLog.authorised = tx?.authorised === true

  writeFileSync(join(LOGS_DIR, `${testName}-flow.json`), JSON.stringify(flowLog, null, 2))
  console.log(`   ✅ transactionId: ${flowLog.transactionId}  responseCode: ${flowLog.responseCode}  authorised: ${flowLog.authorised}`)
  console.log(`   📄 Log: windcave-cert-logs/${testName}-flow.json`)

  return flowLog
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const [,, name] = process.argv
if (!name) { console.error('usage: node scripts/windcave-cert-browser.mjs <' + Object.keys(TESTS).join('|') + '|all>'); process.exit(1) }

async function main() {
  if (name === 'all') {
    const results = {}
    for (const tn of Object.keys(TESTS)) {
      results[tn] = await runOne(tn, TESTS[tn])
    }
    console.log('\n\n══════ SUMMARY ══════')
    for (const [tn, r] of Object.entries(results)) {
      if (!r) { console.log(`  ${tn.padEnd(14)} FAILED`); continue }
      console.log(`  ${tn.padEnd(14)} sessionId=${r.sessionId}  transactionId=${r.transactionId}  code=${r.responseCode}`)
    }
    console.log('\n📌 For the cert form:')
    console.log('   auth sessionId       → pass to complete-suite:  node scripts/windcave-cert-runner.mjs complete-suite <sessionId>')
    console.log('   retry-auth sessionId → pass to retry-complete:   node scripts/windcave-cert-runner.mjs retry-complete <sessionId>')
    console.log('   For refund test — pick any approved purchase sessionId and: node scripts/windcave-cert-runner.mjs refund <sessionId> <amount>')
    return
  }

  const cfg = TESTS[name]
  if (!cfg) { console.error(`Unknown test: ${name}`); process.exit(1) }
  await runOne(name, cfg)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
