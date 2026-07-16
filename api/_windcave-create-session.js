// _windcave-create-session.js — Windcave Hosted Payment Page session.
//
// POST /api/windcave-create-session
//   Body: { consultationId, accEligible, consultationType, couponDiscount }
//
// Creates a Windcave session and returns the HPP href for redirect.
// Mirrors _create-payment-intent.js semantics (same PRICES table, same
// $20 ACC admin fee) so the app can swap providers via feature flag
// without price drift.
//
// Auth: Basic {base64(WINDCAVE_USERNAME:WINDCAVE_API_KEY)}
// Base URL is env-configured — UAT for pre-cert, sec.windcave.com after.
//
// Session type "auth" — holds funds only. Provider capture happens later
// via /api/windcave-query (equivalent to Stripe capture_method:'manual').
//
// FPRN (Fail Proof Result Notification) delivered separately to
// /api/windcave-fprn — that's the reliable outcome signal even if the
// patient closes the browser mid-flow.

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

function admin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function windcaveBasicAuth() {
  const u = process.env.WINDCAVE_USERNAME
  const k = process.env.WINDCAVE_API_KEY
  if (!u || !k) throw new Error('Windcave credentials not configured (WINDCAVE_USERNAME / WINDCAVE_API_KEY)')
  return 'Basic ' + Buffer.from(`${u}:${k}`).toString('base64')
}

function baseUrl() {
  return process.env.WINDCAVE_BASE_URL || 'https://uat.windcave.com/api/v1'
}

function siteOrigin(req) {
  return process.env.PUBLIC_SITE_ORIGIN
      || (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host']
          ? `${req.headers['x-forwarded-proto']}:` + `//` + req.headers['x-forwarded-host']
          : 'https://terehealth.co.nz')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { consultationId, accEligible, consultationType, couponDiscount, sessionType, amountOverride } = req.body || {}
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  // Cert-test only: `amountOverride` (dollars, string or number) bypasses
  // the PRICES table so we can exercise Windcave test scenarios like the
  // Amex $0.08 response-field test. Guarded by the same cert header.
  const isCertMode = req.headers['x-cert-test-key'] && req.headers['x-cert-test-key'] === process.env.WINDCAVE_CERT_TEST_KEY

  // Session type: 'auth' (hold, then explicit complete/capture later — default)
  // or 'purchase' (immediate capture). Windcave cert requires we exercise both.
  const wcType = (sessionType === 'purchase') ? 'purchase' : 'auth'

  const type = consultationType || 'consult'
  const isAcc = accEligible === 'yes'
  // Mirrors _create-payment-intent.js — flat $60 consult, $20 ACC admin
  // fee, $25 message. Any change here must land there too.
  const PRICES = {
    consult: { private: 6000, acc: 2000 },
    video:   { private: 6000, acc: 2000 },
    phone:   { private: 6000, acc: 2000 },
    message: { private: 2500, acc: 2500 },
  }
  const baseAmount = (PRICES[type] || PRICES.consult)[isAcc && type !== 'message' ? 'acc' : 'private']
  const discountCents = Math.max(0, Math.min(Number(couponDiscount || 0) * 100, baseAmount - 100))
  let amountCents = baseAmount - discountCents
  if (isCertMode && amountOverride !== undefined && amountOverride !== null) {
    amountCents = Math.round(Number(amountOverride) * 100)
    if (!Number.isFinite(amountCents) || amountCents < 1) return res.status(400).json({ error: 'amountOverride must be positive' })
  }
  const amountDollars = (amountCents / 100).toFixed(2)

  const origin = siteOrigin(req)

  const payload = {
    type: wcType,
    amount: amountDollars,
    currency: 'NZD',
    merchantReference: consultationId,
    storeCard: false,
    callbackUrls: {
      approved: `${origin}/payment-return?consultationId=${encodeURIComponent(consultationId)}&status=approved`,
      declined: `${origin}/payment-return?consultationId=${encodeURIComponent(consultationId)}&status=declined`,
      cancelled: `${origin}/payment-return?consultationId=${encodeURIComponent(consultationId)}&status=cancelled`,
    },
    notificationUrl: `${origin}/api/windcave-fprn`,
    methods: ['card'],
  }

  // X-ID: idempotency key per authorisation attempt. Retries with the
  // same X-ID return the original response (Windcave sets X-Duplicate: 1).
  // A fresh session-create counts as a fresh attempt, so we generate one
  // here. Complete/refund calls get their own X-IDs.
  const xId = randomUUID()

  let sessionRes, sessionData
  try {
    sessionRes = await fetch(`${baseUrl()}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': windcaveBasicAuth(),
        'X-ID': xId,
      },
      body: JSON.stringify(payload),
    })
    sessionData = await sessionRes.json()
  } catch (e) {
    console.error('[windcave] session create network error:', e.message)
    return res.status(502).json({ error: 'Windcave unreachable: ' + e.message })
  }

  if (!sessionRes.ok) {
    console.error('[windcave] session create failed:', sessionRes.status, JSON.stringify(sessionData))
    return res.status(sessionRes.status).json({
      error: sessionData?.error || sessionData?.message || `Windcave error ${sessionRes.status}`,
      windcave_status: sessionRes.status,
      windcave_body: sessionData,
      base_url: baseUrl(),
    })
  }

  const hppLink = (sessionData.links || []).find(l => l.rel === 'hpp')
  if (!hppLink?.href) {
    console.error('[windcave] no hpp link in response:', sessionData)
    return res.status(502).json({ error: 'Windcave response missing HPP link' })
  }

  // Persist the Windcave session id on the consultation so the return
  // handler + FPRN webhook can correlate back to the row.
  const supabase = admin()
  await supabase.from('consultations').update({
    payment_intent_id: sessionData.id,   // reuse existing column; Windcave session id lives here
    payment_amount: amountCents,
  }).eq('id', consultationId)

  return res.status(200).json({
    sessionId: sessionData.id,
    hppUrl: hppLink.href,
    amount: amountCents,
  })
}
