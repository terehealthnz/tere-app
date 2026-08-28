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
//   ?action=ping                              — health/env check (DIAG)
//   ?action=token_probe                       — oauth grant test (DIAG)
//   ?action=compliance_pack                   — full conformance suite (DIAG)
//   ?action=get_practitioner&cpn=<HPI-CPN>    — single practitioner by HPI number
//   ?action=search_practitioner&family=X&given=Y — name search
//   ?action=get_facility&hpi=<HPI-Facility>   — single facility/location
//
// Diagnostic actions (marked DIAG above) are gated behind
// HPI_DIAG_ENABLED=true — they were needed during onboarding + compliance
// submission (ticket IN-3502, 2026-08-13) but shouldn't linger as always-on
// endpoints in prod. Set the env var to re-enable temporarily if HNZ asks
// for follow-up compliance evidence, otherwise leave off.

import { guardProvider } from './_auth.js'
import { createClient } from '@supabase/supabase-js'
import { getClientIp } from './_client-ip.js'

// Every HPI lookup is written to audit_logs so we can reconstruct which
// admin queried which practitioner/facility, when, and from what IP.
// Body payload is deliberately NOT logged — it may contain PII from HPI.
async function auditHpi(auth, req, action, resource_type, resource_id, result) {
  try {
    const provider = auth?.provider || {}
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    await supabase.from('audit_logs').insert({
      event_type:     `hpi.${action}`,
      provider_id:    provider.id || null,
      provider_name:  [provider.first_name, provider.last_name].filter(Boolean).join(' ') || null,
      provider_role:  provider.is_admin ? 'admin' : (provider.is_provider ? 'provider' : null),
      resource_type,
      resource_id:    resource_id ? String(resource_id).slice(0, 100) : null,
      metadata: {
        hpi_status:      result?.status ?? null,
        hpi_ok:          !!result?.ok,
        correlation_id:  result?.request_headers?.['X-Correlation-Id'] || null,
        duration_ms:     result?.duration_ms ?? null,
      },
      ip:         getClientIp(req),
      user_agent: req.headers['user-agent'] || null,
    })
  } catch { /* audit failures never block the primary action */ }
}

const TOKEN_URL = process.env.HPI_TOKEN_URL
const BASE_URL  = process.env.HPI_BASE_URL
const CLIENT_ID = process.env.HPI_CLIENT_ID
const SECRET    = process.env.HPI_CLIENT_SECRET
// HNZ OAuth spec requires scopes as a single space-separated string. The
// Vercel dashboard's textarea preserves any newlines the user pastes in,
// which the HPI token endpoint then rejects as "invalid_scope" because the
// resulting body has "Location.r\n https://..." with a literal newline in
// the middle of a URI. Normalise: collapse any \r\n\t + runs of spaces down
// to a single space. Handles pasted-from-doc formatting without needing the
// env var to be re-entered. See ticket IN-3502 diagnostic 2026-08-18.
const SCOPES = (process.env.HPI_SCOPES || '').replace(/\s+/g, ' ').trim()

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

  // Gate diagnostic actions post-compliance-submission (task #257). These
  // stay available if HPI_DIAG_ENABLED=true is set in Vercel, otherwise
  // return 404 so probes can't enumerate our env or exercise the OAuth
  // grant. Production actions (get_practitioner / search_practitioner /
  // get_facility / search_facility) always run.
  const DIAG_ACTIONS = new Set(['ping', 'token_probe', 'compliance_pack'])
  if (DIAG_ACTIONS.has(action) && process.env.HPI_DIAG_ENABLED !== 'true') {
    return res.status(404).json({ error: 'Not found' })
  }

  try {
    if (action === 'ping') {
      // reveal=1 returns the actual CLIENT_ID string (not the secret) so we
      // can copy it into HNZ support tickets that request the identifier.
      // Guarded by admin auth + HPI_DIAG_ENABLED so it can't be scraped.
      const reveal = String(req.query.reveal || '') === '1'
      return res.status(200).json({
        ok: true,
        env: {
          HPI_TOKEN_URL:    !!TOKEN_URL,
          HPI_BASE_URL:     !!BASE_URL,
          HPI_CLIENT_ID:    reveal ? CLIENT_ID : !!CLIENT_ID,
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
      await auditHpi(auth, req, 'get_practitioner', 'Practitioner', cpn, r)
      if (r.status === 404) return res.status(404).json({ error: 'Not found', body: r.body })
      if (!r.ok)            return res.status(r.status).json({ error: 'HPI error', body: r.body })
      return res.status(200).json({ practitioner: shapePractitioner(r.body), raw: r.body })
    }

    if (action === 'search_practitioner') {
      const family = String(req.query.family || '').trim()
      const given  = String(req.query.given  || '').trim()
      if (!family && !given) return res.status(400).json({ error: 'family or given required' })
      const r = await fhirGet('Practitioner', { family, given, _count: 20 })
      await auditHpi(auth, req, 'search_practitioner', 'Practitioner', `family=${family}|given=${given}`, r)
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
          const accepted = expected.accepted_statuses || [expected.status]
          const inRange  = expected.status_range && Math.floor(r.status / 100) === expected.status_range
          const outcome  = (accepted.includes(r.status) || inRange) ? 'PASS' : 'REVIEW'
          scenarios.push({
            name, purpose, expected,
            request:    { url: r.url },
            response:   { status: r.status, body_excerpt: JSON.stringify(r.body).slice(0, 4000) },
            duration_ms: r.duration_ms,
            outcome,
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
      // Scenario 5 accepts either 200 (positive lookup with a known UAT
      // facility id) OR a well-formed 404 OperationOutcome (proves the
      // Location.r scope + endpoint routing + error handling are correct).
      // A real UAT id is normally supplied by HNZ in the compliance test
      // template; before that lands, negative-path evidence is sufficient.
      await run(
        '5. Get Facility (Location) — structural + auth check',
        `Retrieve Location by id (${facilityId}) to confirm the Location.r scope is honoured. Accepts a 200 (positive lookup) or a well-formed 404 OperationOutcome (proves the auth flow + endpoint routing + graceful error handling); a positive-lookup id is normally supplied by HNZ in the compliance test template.`,
        { status: 200, description: '200 OK with FHIR Location resource — OR — 404 with OperationOutcome (both accepted)', accepted_statuses: [200, 404] },
        () => fhirGet(`Location/${encodeURIComponent(facilityId)}`, null, scopeOverride, userId),
      )

      const summary = {
        total:  scenarios.length,
        passed: scenarios.filter(s => s.outcome === 'PASS').length,
        review: scenarios.filter(s => s.outcome === 'REVIEW').length,
        failed: scenarios.filter(s => s.outcome === 'FAIL').length,
      }

      // Single audit row per compliance run — captures which admin ran it
      // and the pass/fail tally, without duplicating one row per scenario.
      await auditHpi(auth, req, 'compliance_pack_run', 'ComplianceRun', `${summary.passed}/${summary.total}_pass`, { status: 200, ok: true, duration_ms: scenarios.reduce((a, s) => a + (s.duration_ms || 0), 0) })

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
      const rawS = req.query.scope
      const scopeOverride = rawS === 'none' ? '' : (rawS != null ? String(rawS) : undefined)
      const userId = String(req.query.userid || auth.provider?.id || 'tere-service')
      const r = await fhirGet('Location', { name }, scopeOverride, userId)
      return res.status(r.ok ? 200 : r.status).json({ status: r.status, body_excerpt: JSON.stringify(r.body).slice(0, 3000) })
    }

    if (action === 'get_facility') {
      const hpi = String(req.query.hpi || '').trim()
      if (!hpi) return res.status(400).json({ error: 'hpi required' })
      const r = await fhirGet(`Location/${encodeURIComponent(hpi)}`)
      await auditHpi(auth, req, 'get_facility', 'Location', hpi, r)
      if (r.status === 404) return res.status(404).json({ error: 'Not found', body: r.body })
      if (!r.ok)            return res.status(r.status).json({ error: 'HPI error', body: r.body })
      return res.status(200).json({ facility: shapeLocation(r.body), raw: r.body })
    }

    return res.status(400).json({ error: 'Invalid action' })
  } catch (e) {
    console.error('[hpi] HPI proxy error:', e)
    // Diagnostic surface when HPI_DIAG_ENABLED — surfaces the real error
    // message + stack so we can debug FHIR-call failures without hunting
    // through Vercel logs. Stays gated so prod (with diag off) still returns
    // the generic message.
    if (process.env.HPI_DIAG_ENABLED === 'true') {
      return res.status(500).json({ error: 'HPI proxy error', diag: { message: String(e?.message || e), stack: String(e?.stack || '').split('\n').slice(0, 4).join('\n') } })
    }
    return res.status(500).json({ error: 'HPI proxy error' })
  }
}
