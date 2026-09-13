// _windcave-health.js — Windcave live-credentials smoke test.
//
// GET /api/windcave-health
//
// Admin-only. Verifies that the three WINDCAVE_* env vars are set AND that
// the credentials actually authenticate against the configured base URL.
// Runs a lookup against a deliberately non-existent session ID: a good
// response is 4xx (auth OK, session not found), a 401 means bad creds,
// and a network error means wrong URL / DNS.
//
// Returns { ok, base_url_host, has_username, has_api_key, http_status,
// interpretation, latency_ms, error? } — never leaks the raw credential.
//
// Used before flipping `use_windcave` (task #504) to confirm the live keys
// are wired up correctly without generating a real charge.

import { guardProvider } from './_auth.js'

function basicAuth() {
  return 'Basic ' + Buffer.from(`${process.env.WINDCAVE_USERNAME}:${process.env.WINDCAVE_API_KEY}`).toString('base64')
}

function baseUrl() {
  return process.env.WINDCAVE_BASE_URL || 'https://uat.windcave.com/api/v1'
}

function hostOf(url) {
  try { return new URL(url).host } catch { return null }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  let auth
  try {
    auth = await guardProvider(req, res)
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message || 'Unauthorized' })
  }
  if (!auth.provider?.is_admin) return res.status(403).json({ error: 'Admin only' })

  const hasUser = !!process.env.WINDCAVE_USERNAME
  const hasKey  = !!process.env.WINDCAVE_API_KEY
  const url     = baseUrl()
  const host    = hostOf(url)
  const isLive  = host === 'sec.windcave.com'

  if (!hasUser || !hasKey) {
    return res.status(200).json({
      ok:              false,
      base_url_host:   host,
      is_live_url:     isLive,
      has_username:    hasUser,
      has_api_key:     hasKey,
      interpretation:  'Missing WINDCAVE_USERNAME or WINDCAVE_API_KEY in env',
    })
  }

  // Probe with a session ID that definitely won't exist. Windcave returns
  // 4xx for "not found" (auth OK) vs 401 for "bad creds".
  const probeId = '00000000-0000-4000-8000-000000000000'
  const start = Date.now()
  let httpStatus = null
  let networkError = null
  try {
    const ctl = new AbortController()
    const to  = setTimeout(() => ctl.abort(), 5000)
    const r = await fetch(`${url}/sessions/${probeId}`, {
      method:  'GET',
      headers: { 'Accept': 'application/json', 'Authorization': basicAuth() },
      signal:  ctl.signal,
    })
    clearTimeout(to)
    httpStatus = r.status
  } catch (e) {
    networkError = e.message || 'network error'
  }
  const latencyMs = Date.now() - start

  let ok = false
  let interpretation = ''
  if (networkError) {
    interpretation = `Network error reaching ${host}: ${networkError}. Check WINDCAVE_BASE_URL.`
  } else if (httpStatus === 401 || httpStatus === 403) {
    interpretation = `Auth rejected (HTTP ${httpStatus}). WINDCAVE_USERNAME + WINDCAVE_API_KEY do not match ${host}. Check LIVE vs UAT keys.`
  } else if (httpStatus === 404 || httpStatus === 400) {
    ok = true
    interpretation = `Auth OK — Windcave responded HTTP ${httpStatus} for a non-existent probe session. Credentials work against ${host}.`
  } else if (httpStatus === 200 || httpStatus === 202) {
    // The probe UUID matched a real session (astronomical odds). Still healthy.
    ok = true
    interpretation = `Auth OK — Windcave responded HTTP ${httpStatus}. Credentials work against ${host}.`
  } else {
    interpretation = `Unexpected HTTP ${httpStatus} from Windcave. Check credentials + base URL.`
  }

  return res.status(200).json({
    ok,
    base_url_host:   host,
    is_live_url:     isLive,
    has_username:    hasUser,
    has_api_key:     hasKey,
    http_status:     httpStatus,
    latency_ms:      latencyMs,
    interpretation,
  })
}
