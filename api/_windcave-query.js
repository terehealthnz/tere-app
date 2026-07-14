// _windcave-query.js — Query a Windcave session's canonical status.
//
// GET /api/windcave-query?sessionId=<id>[&wait=1]
//
// Returns:
//   { state, approved, transactions, merchantReference, amount, pending }
//
// Windcave semantics (per their exception-handling docs):
//   - 200 → session is finished; full Session Response returned
//   - 202 → session still pending; partial Session Response returned
//
// When wait=1 we poll every 10 seconds until we get 200 or hit the cap
// (default 60s = 6 attempts). Callers that just want a snapshot omit
// the flag and get whichever status Windcave returns right now.
//
// Used by:
//   - /payment-return page (top-level fallback flow)
//   - Payment.jsx WindcavePayment (post-postMessage verify)
//   - FPRN handler (authoritative re-query)
//   - Provider dashboard / diagnostics
//
// Provider-auth is NOT required — patients on the return page need to
// see their own outcome. Security relies on knowing the session id
// (only shared with the paying patient's browser + FPRN endpoint).

function basicAuth() {
  return 'Basic ' + Buffer.from(`${process.env.WINDCAVE_USERNAME}:${process.env.WINDCAVE_API_KEY}`).toString('base64')
}

function baseUrl() {
  return process.env.WINDCAVE_BASE_URL || 'https://uat.windcave.com/api/v1'
}

async function queryOnce(sessionId) {
  const r = await fetch(`${baseUrl()}/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json', 'Authorization': basicAuth() },
  })
  const data = await r.json().catch(() => ({}))
  return { status: r.status, data }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const sessionId = req.query?.sessionId
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' })
  const wait = req.query?.wait === '1' || req.query?.wait === 'true'

  try {
    let attempt = 0
    let last
    // Cap: 6 attempts × 10s = 60s. Beyond that, return the partial 202
    // response so the caller can decide (usually: try again in a minute).
    const MAX_ATTEMPTS = wait ? 6 : 1
    while (attempt < MAX_ATTEMPTS) {
      last = await queryOnce(sessionId)
      if (last.status === 200) break
      if (last.status === 202 && wait && attempt < MAX_ATTEMPTS - 1) {
        await sleep(10_000)
        attempt++
        continue
      }
      break
    }

    const { status, data } = last
    if (status !== 200 && status !== 202) {
      return res.status(status).json({ error: data?.error || `Windcave error ${status}` })
    }

    const approved = data.state === 'complete'
      && (data.transactions || []).some(t => t.responseCode === '00' || t.authorised === true)

    return res.status(200).json({
      state:              data.state,
      approved,
      pending:            status === 202,
      merchantReference:  data.merchantReference || null,
      amount:             data.amount || null,
      transactions:       data.transactions || [],
    })
  } catch (e) {
    console.error('[windcave-query] error:', e.message)
    return res.status(502).json({ error: 'Windcave unreachable' })
  }
}
