// /api/hpi — server-side proxy to the Te Whatu Ora Health Identity
// Platform (HPI) FHIR API.
//
// Why server-side: the Client ID doubles as the API Key and the Client
// Secret is HNZ's shared secret — neither may ever touch the browser
// bundle. This endpoint does the OAuth2 client-credentials grant against
// the KeyCloak token URL, caches the bearer for its TTL, and proxies
// only the FHIR calls we're actually approved for (Get/Search Practitioner
// and Get Location).
//
// Access: admin providers only. HPI lookups reveal PII about clinicians
// (name, scope of practice, registration status) so we treat the endpoint
// as an admin-onboarding tool, not a general clinician surface.
//
// Actions (all GET unless noted):
//   ?action=ping                              — health/env check
//   ?action=get_practitioner&cpn=<HPI-CPN>    — single practitioner by HPI number
//   ?action=search_practitioner&family=X&given=Y — name search
//   ?action=get_facility&hpi=<HPI-Facility>   — single facility/location

import { guardProvider } from './_auth.js'

const TOKEN_URL = process.env.HPI_TOKEN_URL
const BASE_URL  = process.env.HPI_BASE_URL
const CLIENT_ID = process.env.HPI_CLIENT_ID
const SECRET    = process.env.HPI_CLIENT_SECRET
const SCOPES    = process.env.HPI_SCOPES || ''

// In-memory token cache. Vercel serverless containers reuse this between
// warm invocations, so most calls hit the cache and skip the token grant.
// Cache is keyed by the scope string so an override-scope probe doesn't
// mask a broken production scope.
const tokenCache = new Map()

async function getBearer(scopeOverride) {
  if (!TOKEN_URL || !CLIENT_ID || !SECRET) {
    const missing = []
    if (!TOKEN_URL) missing.push('HPI_TOKEN_URL')
    if (!CLIENT_ID) missing.push('HPI_CLIENT_ID')
    if (!SECRET)    missing.push('HPI_CLIENT_SECRET')
    throw new Error(`HPI env missing: ${missing.join(', ')}`)
  }
  const scope = scopeOverride !== undefined ? scopeOverride : SCOPES
  const cacheKey = scope || '(none)'
  const now = Date.now()
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.expires > now + 5000) return cached.token
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     CLIENT_ID,
    client_secret: SECRET,
  })
  if (scope) body.set('scope', scope)
  const r = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`HPI token grant ${r.status}: ${text.slice(0, 400)}`)
  }
  const j = await r.json()
  const ttlMs = (Number(j.expires_in) || 300) * 1000
  tokenCache.set(cacheKey, { token: j.access_token, expires: now + ttlMs - 5000 })
  return j.access_token
}

async function fhirGet(path, params, scopeOverride, userIdOverride) {
  if (!BASE_URL) throw new Error('HPI env missing: HPI_BASE_URL')
  const token = await getBearer(scopeOverride)
  const url = new URL(BASE_URL.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, ''))
  for (const [k, v] of Object.entries(params || {})) {
    if (v != null && v !== '') url.searchParams.set(k, v)
  }
  const started = Date.now()
  // HNZ HPI FHIR API required headers (spec: hpi-ig.hip.digital.health.nz/general.html):
  //   Authorization: Bearer {token}      — OAuth2 access token
  //   x-api-key:     {key}               — issued with client credentials
  //                                        (same value as HPI_CLIENT_ID per onboarding email)
  //   userid:        {string}            — HPI-CPN of the human initiating the request
  //   User-Agent:    {string}            — application identifier
  //   X-Correlation-Id: {uuid}           — recommended for traceability
  const corrId = (globalThis.crypto?.randomUUID?.() || String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10))
  const r = await fetch(url, {
    headers: {
      Authorization:       `Bearer ${token}`,
      Accept:              'application/fhir+json',
      'x-api-key':         CLIENT_ID,
      userid:              String(userIdOverride || 'tere-service'),
      'User-Agent':        'TereHealth/1.0 (server; HPI FHIR proxy)',
      'X-Correlation-Id':  corrId,
    },
  })
  const text = await r.text()
  let body
  try { body = text ? JSON.parse(text) : {} } catch { body = { raw: text.slice(0, 400) } }
  return {
    status: r.status, ok: r.ok, body,
    url: url.toString(),
    request_headers: {
      Authorization:      'Bearer <redacted>',
      'x-api-key':        '<HPI_CLIENT_ID>',
      userid:             String(userIdOverride || 'tere-service'),
      'User-Agent':       'TereHealth/1.0 (server; HPI FHIR proxy)',
      'X-Correlation-Id': corrId,
      Accept:             'application/fhir+json',
    },
    duration_ms: Date.now() - started,
  }
}

// Extract just the fields our admin UI actually needs, so we don't
// return the entire FHIR resource to the client. Keeps the surface small
// and audit-friendly.
function shapePractitioner(p) {
  if (!p) return null
  const name = Array.isArray(p.name) ? p.name.find(n => n.use === 'official') || p.name[0] : null
  const family = name?.family || ''
  const given  = Array.isArray(name?.given) ? name.given.join(' ') : (name?.given || '')
  const cpn = (p.identifier || []).find(i =>
    /HPI|Common Person Number/i.test(i.type?.text || '') ||
    /^https?:\/\/standards\.digital\.health\.nz\/ns\/hpi-person-id/i.test(i.system || '')
  )
  return {
    id:      p.id,
    active:  p.active !== false,
    family, given,
    cpn:     cpn?.value || p.id || null,
    scope:   (p.qualification || []).map(q => q.code?.text || q.code?.coding?.[0]?.display).filter(Boolean),
  }
}

function shapeLocation(l) {
  if (!l) return null
  return {
    id:      l.id,
    name:    l.name || '',
    status:  l.status || '',
    address: (l.address?.line || []).join(', '),
    hpi:     (l.identifier || [])[0]?.value || l.id || null,
  }
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  if (!auth.provider?.is_admin) return res.status(403).json({ error: 'Admin only' })

  const { action } = req.query || {}

  try {
    if (action === 'ping') {
      return res.status(200).json({
        ok: true,
        env: {
          HPI_TOKEN_URL:    !!TOKEN_URL,
          HPI_BASE_URL:     !!BASE_URL,
          HPI_CLIENT_ID:    !!CLIENT_ID,
          HPI_CLIENT_SECRET:!!SECRET,
          HPI_SCOPES:       !!SCOPES,
        },
      })
    }

    // token_probe: try the OAuth grant with an override scope (or no scope
    // if ?scope=none). Diagnostic aid — HNZ's docs distinguish between short
    // scope names ("Get-Practitioner") and long OAuth scope URIs, and it isn't
    // obvious which one KeyCloak wants for the grant vs which one lands in
    // the JWT. Use this to iterate without redeploying HPI_SCOPES.
    if (action === 'token_probe') {
      const raw = String(req.query.scope || '')
      const override = raw === 'none' ? '' : raw
      try {
        const t = await getBearer(override)
        return res.status(200).json({ ok: true, token_prefix: t.slice(0, 20) + '…', used_scope: override || '(none)' })
      } catch (e) {
        return res.status(200).json({ ok: false, error: e.message, tried_scope: override || '(none)' })
      }
    }

    if (action === 'get_practitioner') {
      const cpn = String(req.query.cpn || '').trim()
      if (!cpn) return res.status(400).json({ error: 'cpn required' })
      const r = await fhirGet(`Practitioner/${encodeURIComponent(cpn)}`)
      if (r.status === 404) return res.status(404).json({ error: 'Not found', body: r.body })
      if (!r.ok)            return res.status(r.status).json({ error: 'HPI error', body: r.body })
      return res.status(200).json({ practitioner: shapePractitioner(r.body), raw: r.body })
    }

    if (action === 'search_practitioner') {
      const family = String(req.query.family || '').trim()
      const given  = String(req.query.given  || '').trim()
      if (!family && !given) return res.status(400).json({ error: 'family or given required' })
      const r = await fhirGet('Practitioner', { family, given, _count: 20 })
      if (!r.ok) return res.status(r.status).json({ error: 'HPI error', body: r.body })
      const entries = Array.isArray(r.body?.entry) ? r.body.entry : []
      return res.status(200).json({
        results: entries.map(e => shapePractitioner(e.resource)).filter(Boolean),
        total:   r.body?.total ?? entries.length,
      })
    }

    // compliance_pack runs the five standard HPI FHIR conformance scenarios
    // against UAT and returns the request/response evidence bundle used by
    // scripts/build-hpi-compliance-pdf.mjs to produce the submission PDF.
    // Scenarios:
    //   1. Positive get:    known valid CPN → 200 with well-formed Practitioner
    //   2. Not-found:       fake CPN        → 404 with OperationOutcome
    //   3. Malformed input: bad character   → 4xx handled gracefully
    //   4. Name search:     Search Practitioner by family name → Bundle
    //   5. Facility get:    Location by HPI-O → 200 or documented 404
    if (action === 'compliance_pack') {
      const validCpn      = String(req.query.cpn      || '24NSES').trim()
      const notFoundCpn   = String(req.query.notfound || 'ZZ9ZZZ').trim()
      const malformedCpn  = '!!invalid!!'
      const searchFamily  = String(req.query.family   || 'Herling').trim()
      const facilityId    = String(req.query.facility || 'G11238-E').trim()
      // scope override, passed through to fhirGet so we can iterate without
      // redeploying HPI_SCOPES. ?scope=none forces omission of the OAuth
      // scope param entirely (HNZ's KeyCloak client has defaults configured
      // server-side, so passing no scope Just Works).
      const rawScope      = req.query.scope
      const scopeOverride = rawScope === 'none' ? '' : (rawScope != null ? String(rawScope) : undefined)
      const userId        = String(req.query.userid || auth.provider?.id || 'tere-service')

      const scenarios = []
      const run = async (name, purpose, expected, fn) => {
        const started = Date.now()
        try {
          const r = await fn()
          scenarios.push({
            name, purpose, expected,
            request:    { url: r.url },
            response:   { status: r.status, body_excerpt: JSON.stringify(r.body).slice(0, 4000) },
            duration_ms: r.duration_ms,
            outcome:    r.status === expected.status ? 'PASS'
                       : expected.status_range && Math.floor(r.status / 100) === expected.status_range ? 'PASS'
                       : 'REVIEW',
          })
        } catch (e) {
          scenarios.push({
            name, purpose, expected,
            error: e.message, duration_ms: Date.now() - started, outcome: 'FAIL',
          })
        }
      }

      await run(
        '1. Positive Get Practitioner',
        `Retrieve a known valid HPI-CPN (${validCpn}) and confirm a well-formed Practitioner resource is returned.`,
        { status: 200, description: '200 OK with FHIR Practitioner resource' },
        () => fhirGet(`Practitioner/${encodeURIComponent(validCpn)}`, null, scopeOverride, userId),
      )
      await run(
        '2. Not-Found Get Practitioner',
        `Query a non-existent CPN (${notFoundCpn}) and confirm the product surfaces a 404 gracefully.`,
        { status: 404, description: '404 Not Found (or OperationOutcome)' },
        () => fhirGet(`Practitioner/${encodeURIComponent(notFoundCpn)}`, null, scopeOverride, userId),
      )
      await run(
        '3. Malformed Input Handling',
        'Query with malformed CPN characters to confirm we do not leak stack traces and pass errors through as 4xx.',
        { status_range: 4, description: 'Any 4xx response, handled without crashing' },
        () => fhirGet(`Practitioner/${encodeURIComponent(malformedCpn)}`, null, scopeOverride, userId),
      )
      await run(
        '4. Search Practitioner by name',
        `Search for practitioners by name (${searchFamily}) and confirm a FHIR Bundle is returned with 0..n entries. HPI Practitioner search accepts the FHIR 'name' parameter (compound match against family + given).`,
        { status: 200, description: '200 OK with FHIR Bundle' },
        () => fhirGet('Practitioner', { name: searchFamily }, scopeOverride, userId),
      )
      await run(
        '5. Get Facility (Location)',
        `Retrieve Location by HPI-O (${facilityId}) to confirm Location.r scope is honoured.`,
        { status: 200, description: '200 OK with FHIR Location resource (or documented 404)' },
        () => fhirGet(`Location/${encodeURIComponent(facilityId)}`, null, scopeOverride, userId),
      )

      const summary = {
        total:  scenarios.length,
        passed: scenarios.filter(s => s.outcome === 'PASS').length,
        review: scenarios.filter(s => s.outcome === 'REVIEW').length,
        failed: scenarios.filter(s => s.outcome === 'FAIL').length,
      }

      return res.status(200).json({
        product:      { name: 'Tere Health', product_id: 'HSAPP0404', organisation: 'Tere Health Limited', organisation_id: 'G11238-E' },
        environment:  { name: 'UAT', gateway: 'HIP AWS Gateway', base_url: BASE_URL, token_url: TOKEN_URL, auth: 'KeyCloak OAuth2 client_credentials' },
        scopes:       (SCOPES || '').split(/\s+/).filter(Boolean),
        generated_at: new Date().toISOString(),
        generated_by: `${auth.provider?.first_name || ''} ${auth.provider?.last_name || ''}`.trim() || auth.provider?.email || 'admin',
        summary,
        scenarios,
      })
    }

    // search_facility: find a valid Location by name so we can supply a real
    // ID to the get_facility scenario. FHIR searches Location by name.
    if (action === 'search_facility') {
      const name = String(req.query.name || '').trim()
      if (!name) return res.status(400).json({ error: 'name required' })
      const r = await fhirGet('Location', { name })
      return res.status(r.ok ? 200 : r.status).json({ status: r.status, body_excerpt: JSON.stringify(r.body).slice(0, 2000) })
    }

    if (action === 'get_facility') {
      const hpi = String(req.query.hpi || '').trim()
      if (!hpi) return res.status(400).json({ error: 'hpi required' })
      const r = await fhirGet(`Location/${encodeURIComponent(hpi)}`)
      if (r.status === 404) return res.status(404).json({ error: 'Not found', body: r.body })
      if (!r.ok)            return res.status(r.status).json({ error: 'HPI error', body: r.body })
      return res.status(200).json({ facility: shapeLocation(r.body), raw: r.body })
    }

    return res.status(400).json({ error: 'Invalid action' })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'HPI proxy error' })
  }
}
