// _windcave-query.js — Query a Windcave session's canonical status.
//
// GET /api/windcave-query?sessionId=<id>
//
// Returns:
//   { state, approved, transactions, merchantReference, amount }
//
// Used by:
//   - /payment-return page to confirm outcome on redirect back from HPP
//   - Provider dashboard to check payment status post-consult
//   - Retry / diagnostic paths
//
// Provider-auth is NOT required — patients on the return page need to
// see their own outcome. Security relies on knowing the session id
// (which is only shared with the paying patient's browser + FPRN
// endpoint).

function basicAuth() {
  return 'Basic ' + Buffer.from(`${process.env.WINDCAVE_USERNAME}:${process.env.WINDCAVE_API_KEY}`).toString('base64')
}

function baseUrl() {
  return process.env.WINDCAVE_BASE_URL || 'https://uat.windcave.com/api/v1'
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const sessionId = req.query?.sessionId
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' })

  try {
    const r = await fetch(`${baseUrl()}/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'Authorization': basicAuth() },
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data?.error || `Windcave error ${r.status}` })

    const approved = data.state === 'complete'
      && (data.transactions || []).some(t => t.responseCode === '00' || t.authorised === true)

    return res.status(200).json({
      state:              data.state,
      approved,
      merchantReference:  data.merchantReference || null,
      amount:             data.amount || null,
      transactions:       data.transactions || [],
    })
  } catch (e) {
    console.error('[windcave-query] error:', e.message)
    return res.status(502).json({ error: 'Windcave unreachable' })
  }
}
