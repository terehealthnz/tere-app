// POST /api/capture-payment  — provider captures an authorised card hold.
//
// Called by ConsultView + ProviderNotes at sign-off. Auth: provider (via
// AUTH_REQUIRED_ROUTES → guardProvider at the router). Additional guard:
// verify the consultation exists and either belongs to the caller or the
// caller is an admin / supervisor. Prevents provider A from capturing
// arbitrary paymentIntents belonging to provider B's patients.
//
// Windcave-only. Stripe was ripped 2026-09-10 (task #236 + #512). This
// endpoint POSTs a complete transaction against the auth session — settles
// the hold. Idempotent via consult.payment_captured_at guard below.

import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function windcaveBasicAuth() {
  return 'Basic ' + Buffer.from(`${process.env.WINDCAVE_USERNAME}:${process.env.WINDCAVE_API_KEY}`).toString('base64')
}
function windcaveBaseUrl() {
  return process.env.WINDCAVE_BASE_URL || 'https://uat.windcave.com/api/v1'
}

// Windcave complete against an auth session.
// Two-step: (1) GET the session so we can extract the AUTH transaction id;
// (2) POST /transactions type=complete with { transactionId }. Windcave
// rejects complete calls that reference only the sessionId with "Transaction
// Id is required for this transaction type" (verified 2026-09-30 against
// sec.windcave.com), so we always resolve to the txn id first.
// AbortController caps each hop at 6s so both together stay under the Vercel
// 10s function timeout budget. X-ID gives idempotency on the complete POST.
async function captureWindcave(sessionId, amountCents) {
  const amountStr = (amountCents / 100).toFixed(2)
  const started = Date.now()

  // Step 1 — look up the session's auth transactionId.
  const sessionCtl = new AbortController()
  const sessionTimeout = setTimeout(() => sessionCtl.abort(), 6000)
  let sessionData = null
  try {
    const sr = await fetch(`${windcaveBaseUrl()}/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: {
        'Accept':        'application/json',
        'Authorization': windcaveBasicAuth(),
      },
      signal: sessionCtl.signal,
    })
    clearTimeout(sessionTimeout)
    const bodyText = await sr.text().catch(() => '')
    try { sessionData = bodyText ? JSON.parse(bodyText) : {} } catch { sessionData = {} }
    if (!sr.ok) {
      console.error('[capture-payment] session lookup failed', { status: sr.status, bodyPreview: bodyText.slice(0, 300) })
      return { ok: false, approved: false, status: sr.status, data: sessionData, stage: 'session_lookup' }
    }
  } catch (e) {
    clearTimeout(sessionTimeout)
    console.error('[capture-payment] session lookup network error', { message: e?.message, aborted: e?.name === 'AbortError' })
    throw e
  }

  const authTxn = (sessionData.transactions || []).find(t => t.type === 'auth' && (t.authorised === true || t.reCo === '00'))
  const transactionId = authTxn?.id
  if (!transactionId) {
    console.error('[capture-payment] no auth transaction found on session', { sessionId, txns: sessionData.transactions?.length || 0 })
    return { ok: false, approved: false, status: 409, data: sessionData, stage: 'no_auth_txn' }
  }

  // Step 2 — complete against the auth txn.
  const xId = randomUUID()
  const completeCtl = new AbortController()
  const completeTimeout = setTimeout(() => completeCtl.abort(), 6000)
  console.log('[capture-payment] windcave complete →', { transactionId, sessionId, amountStr, xId })
  try {
    const r = await fetch(`${windcaveBaseUrl()}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'Authorization': windcaveBasicAuth(),
        'X-ID':          xId,
      },
      body: JSON.stringify({ type: 'complete', amount: amountStr, transactionId }),
      signal: completeCtl.signal,
    })
    clearTimeout(completeTimeout)
    const bodyText = await r.text().catch(() => '')
    let data = {}
    try { data = bodyText ? JSON.parse(bodyText) : {} } catch { /* keep as text */ }
    const approved = r.ok && (data.responseCode === '00' || data.authorised === true || data.reCo === '00')
    console.log('[capture-payment] windcave complete ←', { status: r.status, approved, durationMs: Date.now() - started, bodyPreview: bodyText.slice(0, 400) })
    return { ok: r.ok, approved, status: r.status, data, bodyText, transactionId }
  } catch (e) {
    clearTimeout(completeTimeout)
    const aborted = e?.name === 'AbortError'
    console.error('[capture-payment] windcave complete FAILED', { aborted, message: e?.message, durationMs: Date.now() - started })
    throw e
  }
}

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const auth = await guardProvider(req, res)
  if (!auth) return

  const { paymentIntentId, consultationId, amount_cents } = req.body || {}
  if (!paymentIntentId) return res.status(400).json({ error: 'paymentIntentId required' })
  if (!consultationId)  return res.status(400).json({ error: 'consultationId required' })

  const supabase = admin()

  // Verify consult exists AND the caller is entitled to capture on it.
  const { data: consult, error: cErr } = await supabase
    .from('consultations')
    .select('id, provider_id, payment_intent_id, status, payment_captured_at, payment_captured_amount_cents, is_practice, payment_authorised_amount_cents, payment_test_mode')
    .eq('id', consultationId)
    .maybeSingle()
  if (cErr) {
    console.error('[capture-payment] consult lookup failed:', cErr.message)
    return res.status(500).json({ error: 'Internal error' })
  }
  if (!consult) return res.status(404).json({ error: 'Consultation not found' })

  // Sandbox suppression — never capture a real Windcave hold for a
  // practice-mode consult. Return simulated:true so the UI treats it as
  // a successful capture without touching the payment provider.
  if (consult.is_practice) {
    return res.status(200).json({ status: 'simulated', simulated: true, reason: 'practice_mode', amount_cents: 0 })
  }

  // Refuse if the consult is in a non-capturable state — no_show or cancelled
  // consults should not have their hold captured (blocks the race where
  // encounter-action flips status while capture is in flight).
  if (consult.status === 'no_show' || consult.status === 'cancelled') {
    return res.status(409).json({ error: `Payment cannot be captured on a ${consult.status} consultation.` })
  }
  // Idempotency guard — if payment_captured_at is already set, capture
  // has already run. Return the existing amount instead of double-billing.
  if (consult.payment_captured_at != null) {
    return res.status(200).json({ status: 'already_captured', amount_cents: consult.payment_captured_amount_cents })
  }

  // Ownership: consult must be assigned to caller, unclaimed, or the caller
  // must be admin/supervisor. Admin/supervisor need to be able to capture
  // on any consult (e.g. covering for a provider mid-shift).
  const isPrivileged = auth.provider.is_admin || auth.provider.is_supervisor
  const owns = consult.provider_id === auth.provider.id || consult.provider_id == null
  if (!isPrivileged && !owns) {
    return res.status(403).json({ error: 'Not authorised to capture this consultation.' })
  }

  // Sanity: the paymentIntentId being captured must match the one attached
  // to the consult — blocks a legit provider from being tricked into
  // capturing an unrelated intent.
  if (consult.payment_intent_id && consult.payment_intent_id !== paymentIntentId) {
    return res.status(400).json({ error: 'paymentIntentId does not match this consultation.' })
  }

  // Amount ceiling — never try to capture more than was authorised. Windcave
  // (and Stripe) both reject over-capture; we'd get a 502 with a confusing
  // error. Cap explicitly so a test-mode $0.10 auth doesn't blow up when the
  // provider tries to capture $25 (real ACC price). Also protects prod from
  // any future drift where quoted price > authorised price.
  const authCeilingCents = consult.payment_authorised_amount_cents
  let effectiveAmountCents = amount_cents
  if (authCeilingCents != null && amount_cents > authCeilingCents) {
    console.warn('[capture-payment] amount capped to auth ceiling:', { requested: amount_cents, ceiling: authCeilingCents, testMode: consult.payment_test_mode })
    effectiveAmountCents = authCeilingCents
  }

  // Windcave-only. Stripe was ripped 2026-09-10.
  try {
    const result = await captureWindcave(paymentIntentId, effectiveAmountCents)
    if (!result.approved) {
      console.error('[capture-payment] windcave complete not approved:', result.status, JSON.stringify(result.data))
      return res.status(502).json({
        error: 'Windcave capture not approved',
        windcave_status: result.status,
        windcave_body:   result.data,
      })
    }
    const capturedTxnId = result.data?.id || result.data?.transactionId || null
    try {
      await supabase.from('consultations')
        .update({
          payment_captured_at:           new Date().toISOString(),
          payment_captured_amount_cents: effectiveAmountCents,
          payment_captured_txn_id:       capturedTxnId,
        })
        .eq('id', consultationId)
    } catch (e) {
      // Row update failure after a successful Windcave capture is a serious
      // reconciliation problem — surface it in logs (money moved, DB didn't).
      console.error('[capture-payment] DB update failed AFTER Windcave approved:', e?.message, { paymentIntentId, capturedTxnId, effectiveAmountCents })
    }
    return res.status(200).json({
      status: 'succeeded',
      amount_cents: effectiveAmountCents,
      txn_id: capturedTxnId,
      provider: 'windcave',
      capped: effectiveAmountCents !== amount_cents,
    })
  } catch (e) {
    console.error('[capture-payment] windcave error:', e?.message || e)
    return res.status(502).json({ error: 'Windcave unreachable' })
  }
}
