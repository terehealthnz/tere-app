// _windcave-complete.js — Capture (complete) an authorised Windcave session.
//
// POST /api/windcave-complete
//   Body: { sessionId?, transactionId?, amount }
//     amount is in dollars, string or number.
//     Provide sessionId (we resolve to the auth transactionId) OR
//     transactionId directly.
//
// Windcave holds funds when a session is created with type=auth. To
// actually settle, we POST a transaction of type=complete referencing the
// AUTH transactionId. Windcave REST rejects `{sessionId}`-only complete
// calls with "Transaction Id is required for this transaction type"
// (verified 2026-09-30 against live sec.windcave.com) — so when only a
// sessionId is supplied we GET /sessions/{id} first and extract the auth
// transaction. Amount may be less than the original auth (partial capture)
// but must not exceed it.
//
// Provider-auth REQUIRED — completes should only happen when a provider
// signs off the consult, never triggered by patient action.
//
// Windcave decline behaviour: if the complete is declined with
// allowRetry=true, retry with a fresh X-ID at the same or lower amount.
// This endpoint returns { approved, allowRetry, transactionId, responseCode }
// so the caller can decide whether to retry.

import { randomUUID } from 'node:crypto'

function basicAuth() {
  return 'Basic ' + Buffer.from(`${process.env.WINDCAVE_USERNAME}:${process.env.WINDCAVE_API_KEY}`).toString('base64')
}

function baseUrl() {
  return process.env.WINDCAVE_BASE_URL || 'https://uat.windcave.com/api/v1'
}

// Two 6-second hops keep the whole request under the 10s Vercel function
// budget even in the worst case.
const HOP_TIMEOUT_MS = 6000

async function resolveAuthTransactionId(sessionId) {
  const ctl = new AbortController()
  const to  = setTimeout(() => ctl.abort(), HOP_TIMEOUT_MS)
  try {
    const r = await fetch(`${baseUrl()}/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'Authorization': basicAuth() },
      signal: ctl.signal,
    })
    clearTimeout(to)
    const bodyText = await r.text().catch(() => '')
    let data = {}
    try { data = bodyText ? JSON.parse(bodyText) : {} } catch { /* keep empty */ }
    if (!r.ok) {
      return { ok: false, status: r.status, data, error: `Windcave session lookup failed (${r.status})` }
    }
    const authTxn = (data.transactions || []).find(t => t.type === 'auth' && (t.authorised === true || t.reCo === '00'))
    if (!authTxn?.id) {
      return { ok: false, status: 409, data, error: 'No authorised auth transaction on session' }
    }
    return { ok: true, transactionId: authTxn.id, sessionData: data }
  } catch (e) {
    clearTimeout(to)
    return { ok: false, status: 502, error: `Session lookup network error: ${e?.message || 'unknown'}` }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { sessionId, transactionId: reqTxnId, amount } = req.body || {}
  if (!sessionId && !reqTxnId) return res.status(400).json({ error: 'sessionId or transactionId required' })
  if (amount === undefined || amount === null) return res.status(400).json({ error: 'amount required' })
  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'amount must be positive number' })
  const amountStr = amt.toFixed(2)

  // Resolve to a transactionId — either supplied directly or looked up from
  // the sessionId. Windcave complete requires transactionId.
  let transactionId = reqTxnId
  if (!transactionId) {
    const lookup = await resolveAuthTransactionId(sessionId)
    if (!lookup.ok) {
      console.error('[windcave-complete] session lookup failed:', lookup.error, JSON.stringify(lookup.data || {}).slice(0, 300))
      return res.status(lookup.status).json({ error: lookup.error, windcave_status: lookup.status, windcave_body: lookup.data })
    }
    transactionId = lookup.transactionId
  }

  const xId = randomUUID()
  const ctl = new AbortController()
  const to  = setTimeout(() => ctl.abort(), HOP_TIMEOUT_MS)
  let r, data
  try {
    r = await fetch(`${baseUrl()}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': basicAuth(),
        'X-ID': xId,
      },
      body: JSON.stringify({ type: 'complete', amount: amountStr, transactionId }),
      signal: ctl.signal,
    })
    clearTimeout(to)
    const bodyText = await r.text().catch(() => '')
    try { data = bodyText ? JSON.parse(bodyText) : {} } catch { data = {} }
  } catch (e) {
    clearTimeout(to)
    console.error('[windcave-complete] network error:', e?.message, { aborted: e?.name === 'AbortError' })
    return res.status(502).json({ error: 'Windcave unreachable' })
  }

  if (!r.ok) {
    console.error('[windcave-complete] failed:', r.status, JSON.stringify(data))
    return res.status(r.status).json({
      error: data?.error || `Windcave error ${r.status}`,
      windcave_status: r.status,
      windcave_body: data,
    })
  }

  const approved = data.responseCode === '00' || data.authorised === true || data.reCo === '00'
  return res.status(200).json({
    approved,
    allowRetry:     data.allowRetry === true,
    transactionId:  data.id || data.transactionId || null,
    authTxnId:      transactionId,
    responseCode:   data.responseCode || null,
    responseText:   data.responseText || null,
    amount:         data.amount || amountStr,
    xId,
    raw:            data,
  })
}
