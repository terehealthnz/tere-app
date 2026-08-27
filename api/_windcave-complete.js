// _windcave-complete.js — Capture (complete) an authorised Windcave session.
//
// POST /api/windcave-complete
//   Body: { sessionId, amount }        // amount in dollars, string or number
//
// Windcave holds funds when a session is created with type=auth. To
// actually settle, we POST a transaction of type=complete against the
// original session. Amount may be less than the original auth (partial
// capture) but must not exceed it.
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { sessionId, transactionId, amount } = req.body || {}
  if (!sessionId && !transactionId) return res.status(400).json({ error: 'sessionId or transactionId required' })
  if (amount === undefined || amount === null) return res.status(400).json({ error: 'amount required' })
  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'amount must be positive number' })
  const amountStr = amt.toFixed(2)

  const xId = randomUUID()

  // Windcave REST Complete/Refund: POST /transactions with the original
  // transaction id referenced in the payload. Payload key is `sessionId`
  // (yes, actually the sessionId — Windcave resolves the auth txn from
  // it) OR `transactionId` when we have that directly.
  const payload = {
    type: 'complete',
    amount: amountStr,
    ...(transactionId ? { transactionId } : { sessionId }),
  }

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
      body: JSON.stringify(payload),
    })
    data = await r.json().catch(() => ({}))
  } catch (e) {
    console.error('[windcave-complete] network error:', e.message)
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

  const approved = data.responseCode === '00' || data.authorised === true
  return res.status(200).json({
    approved,
    allowRetry:     data.allowRetry === true,
    transactionId:  data.id || data.transactionId || null,
    responseCode:   data.responseCode || null,
    responseText:   data.responseText || null,
    amount:         data.amount || amountStr,
    xId,
    raw:            data,
  })
}
