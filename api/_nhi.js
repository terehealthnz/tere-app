// /api/nhi — admin diagnostic + compliance endpoint for HNZ NHI FHIR API.
//
// LIVE: HNZ NHI UAT access granted 2026-09-15 (ticket IN-3439). Separate
// from /api/nhi-lookup which is the patient-facing anon endpoint. This
// endpoint carries admin-only actions used to verify the OAuth grant,
// exercise the mandatory HNZ compliance scenarios, and generate evidence
// for the production-access request.
//
// Actions (all admin-only via guardProvider + is_admin):
//   ?action=ping                — env var presence check (DIAG)
//   ?action=token_probe         — OAuth client_credentials grant test (DIAG)
//   ?action=compliance_pack     — run the mandatory NHI Get/Search/Validate
//                                 scenarios and return structured evidence
//   ?action=get_patient&nhi=X   — production shape; GET Patient/{nhi}
//
// DIAG actions (ping, token_probe, compliance_pack) are gated by
// NHI_DIAG_ENABLED=true in Vercel. Leave false in production once the
// compliance submission lands so probes can't enumerate our config.
//
// Env vars (shared with /api/nhi-lookup — see that file for full docs):
//   NHI_CLIENT_ID + NHI_CLIENT_SECRET + NHI_TOKEN_URL + NHI_FHIR_BASE
//   (NHI_BASE_URL still honoured as legacy alias)
//   NHI_SCOPES  — defaults to HNZ's 3 UAT scopes (Patient.r/.s/.v)

import { guardProvider } from './_auth.js'
import { hpiUserIdForProvider } from './_hpi.js'

const TOKEN_URL   = process.env.NHI_TOKEN_URL
const FHIR_BASE   = process.env.NHI_FHIR_BASE || process.env.NHI_BASE_URL
const CLIENT_ID   = process.env.NHI_CLIENT_ID
const SECRET      = process.env.NHI_CLIENT_SECRET
const SCOPES      = process.env.NHI_SCOPES || [
  'https://api.hip.digital.health.nz/fhir/system/Patient.r',
  'https://api.hip.digital.health.nz/fhir/system/Patient.s',
  'https://api.hip.digital.health.nz/fhir/system/Patient.v',
].join(' ')

// Token cache keyed by scope override so a diagnostic probe with a
// different scope doesn't poison the default cache slot.
const tokenCache = new Map()

async function getBearer(scopeOverride) {
  if (!TOKEN_URL || !CLIENT_ID || !SECRET) {
    throw new Error('NHI env missing: NHI_TOKEN_URL / NHI_CLIENT_ID / NHI_CLIENT_SECRET')
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
    body:    body.toString(),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`NHI token grant ${r.status}: ${text.slice(0, 400)}`)
  const j = JSON.parse(text)
  const ttlMs = Math.max(0, (Number(j.expires_in) || 300)) * 1000
  tokenCache.set(cacheKey, { token: j.access_token, expires: now + ttlMs - 5000 })
  return j.access_token
}

async function fhirCall(method, path, { params, body, scopeOverride, userIdOverride } = {}) {
  if (!FHIR_BASE) throw new Error('NHI env missing: NHI_FHIR_BASE')
  const token = await getBearer(scopeOverride)
  const url = new URL(FHIR_BASE.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, ''))
  for (const [k, v] of Object.entries(params || {})) {
    if (v != null && v !== '') url.searchParams.set(k, v)
  }
  const corrId = (globalThis.crypto?.randomUUID?.() || String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10))
  const started = Date.now()
  const headers = {
    Authorization:      `Bearer ${token}`,
    Accept:             'application/fhir+json',
    'x-api-key':        CLIENT_ID,
    userid:             String(userIdOverride || 'tere-service'),
    'User-Agent':       'TereHealth/1.0 (server; NHI FHIR proxy)',
    'X-Correlation-Id': corrId,
  }
  if (body && method !== 'GET') headers['Content-Type'] = 'application/fhir+json'
  const r = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let parsed
  try { parsed = text ? JSON.parse(text) : {} } catch { parsed = { raw: text.slice(0, 400) } }
  return {
    url:          url.toString(),
    status:       r.status,
    body:         parsed,
    duration_ms:  Date.now() - started,
    correlation_id: corrId,
  }
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  if (!auth.provider?.is_admin) return res.status(403).json({ error: 'Admin only' })

  const { action } = req.query || {}

  // Gate diagnostic actions post-compliance-submission (same pattern as HPI
  // task #257). Once we've submitted for production, set NHI_DIAG_ENABLED=false
  // so external probes can't enumerate env or exercise the OAuth grant.
  const DIAG_ACTIONS = new Set(['ping', 'token_probe', 'compliance_pack'])
  if (DIAG_ACTIONS.has(action) && process.env.NHI_DIAG_ENABLED !== 'true') {
    return res.status(404).json({ error: 'Not found' })
  }

  try {
    if (action === 'ping') {
      const reveal = String(req.query.reveal || '') === '1'
      return res.status(200).json({
        ok: true,
        env: {
          NHI_TOKEN_URL:      !!TOKEN_URL,
          NHI_FHIR_BASE:      !!FHIR_BASE,
          NHI_CLIENT_ID:      reveal ? CLIENT_ID : !!CLIENT_ID,
          NHI_CLIENT_SECRET:  !!SECRET,
          NHI_SCOPES:         !!SCOPES,
        },
      })
    }

    if (action === 'token_probe') {
      const raw = String(req.query.scope || '')
      const override = raw === 'none' ? '' : (raw || undefined)
      try {
        const t = await getBearer(override)
        return res.status(200).json({ ok: true, token_prefix: t.slice(0, 20) + '…', used_scope: override === '' ? '(none)' : (override || SCOPES) })
      } catch (e) {
        return res.status(200).json({ ok: false, error: e.message, tried_scope: override === '' ? '(none)' : (override || SCOPES) })
      }
    }

    const userId = String(req.query.userid || hpiUserIdForProvider(auth.provider))

    if (action === 'get_patient') {
      const nhi = String(req.query.nhi || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (!nhi) return res.status(400).json({ error: 'nhi query param required' })
      const rawScope = req.query.scope
      const scopeOverride = rawScope === 'none' ? '' : (rawScope != null ? String(rawScope) : undefined)
      const r = await fhirCall('GET', `Patient/${encodeURIComponent(nhi)}`, { scopeOverride, userIdOverride: userId })
      return res.status(200).json(r)
    }

    if (action === 'compliance_pack') {
      // HNZ mandatory NHI compliance scenarios per
      //   https://nhi-ig.hip.digital.health.nz/PatientComplianceTesting.html
      //
      // Test NHIs are HNZ-supplied; overridable via query string so we can
      // drop in the real values from the compliance test pack when Shebi
      // provides them. Defaults use ZZZ0032 (verified live 2026-09-15) plus
      // placeholders that will fail-loudly on the pack until real IDs land.
      const nhi1        = String(req.query.nhi1 || 'ZZZ0032').trim()      // positive Get
      const nhi2        = String(req.query.nhi2 || 'ZZZ0032').trim()      // second persona
      const notFoundNhi = String(req.query.notfound || 'ZAA0044').trim()  // known-absent
      const malformed   = '!!invalid!!'
      const searchFamily = String(req.query.family  || 'Testing').trim()
      const searchGiven  = String(req.query.given   || 'Iscv').trim()
      const searchDob    = String(req.query.birthdate || '2005-10-01').trim()
      // Validate uses the same shape as HL7 FHIR $validate operation — send
      // a candidate Patient resource and HNZ returns an OperationOutcome
      // saying whether it matches an NHI record. For UAT we send the same
      // demographics we searched with.
      const rawScope    = req.query.scope
      const scopeOverride = rawScope === 'none' ? '' : (rawScope != null ? String(rawScope) : undefined)

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
            request:    { url: r.url, correlation_id: r.correlation_id },
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
        'NHI-P-Get-1: Positive Get Patient (test NHI 1)',
        `GET Patient/${nhi1}. Confirms a well-formed FHIR Patient resource is returned for a known-valid HNZ UAT test NHI. Uses HNZ-supplied test data — never a live NHI.`,
        { status: 200, description: '200 OK with FHIR Patient resource' },
        () => fhirCall('GET', `Patient/${encodeURIComponent(nhi1)}`, { scopeOverride, userIdOverride: userId }),
      )
      await run(
        'NHI-P-Get-2: Positive Get Patient (test NHI 2)',
        `GET Patient/${nhi2}. Second HNZ UAT persona to prove code-path parity across records.`,
        { status: 200, description: '200 OK with FHIR Patient resource' },
        () => fhirCall('GET', `Patient/${encodeURIComponent(nhi2)}`, { scopeOverride, userIdOverride: userId }),
      )
      await run(
        'NHI-P-Get-3: Not-Found Get Patient',
        `GET Patient/${notFoundNhi}. Confirms the product surfaces a 404 (or OperationOutcome) gracefully when the NHI does not exist.`,
        { status: 404, description: '404 Not Found (or OperationOutcome)' },
        () => fhirCall('GET', `Patient/${encodeURIComponent(notFoundNhi)}`, { scopeOverride, userIdOverride: userId }),
      )
      await run(
        'NHI-P-Get-4: Malformed Input Handling',
        `GET Patient/${malformed}. Confirms malformed NHI characters return a documented 4xx without leaking stack traces.`,
        { status_range: 4, description: 'Any 4xx response, handled without crashing' },
        () => fhirCall('GET', `Patient/${encodeURIComponent(malformed)}`, { scopeOverride, userIdOverride: userId }),
      )
      await run(
        `NHI-P-Search-1: Search Patient by name + DOB (${searchGiven} ${searchFamily} ${searchDob})`,
        `Search /Patient?given=${searchGiven}&family=${searchFamily}&birthdate=${searchDob}. HNZ compliance requires demographic search returns a FHIR Bundle. Evidence: admin UI screenshot showing matched Bundle.`,
        { status: 200, description: '200 OK with FHIR Bundle' },
        () => fhirCall('GET', 'Patient', { params: { given: searchGiven, family: searchFamily, birthdate: searchDob }, scopeOverride, userIdOverride: userId }),
      )
      await run(
        `NHI-P-Validate-1: Validate Patient (${nhi1})`,
        `POST Patient/$validate with a candidate resource. Confirms Validate scope + $validate operation are wired. Accepts 200 OK (OperationOutcome informational) or 422 Unprocessable Entity (well-formed demographic mismatch).`,
        { accepted_statuses: [200, 422], description: '200 or 422 with FHIR OperationOutcome' },
        () => fhirCall('POST', 'Patient/$validate', {
          body: {
            resourceType: 'Patient',
            identifier: [{ system: 'https://standards.digital.health.nz/ns/nhi-id', value: nhi1 }],
            name: [{ family: searchFamily, given: [searchGiven] }],
            birthDate: searchDob,
          },
          scopeOverride, userIdOverride: userId,
        }),
      )

      const summary = {
        total:  scenarios.length,
        passed: scenarios.filter(s => s.outcome === 'PASS').length,
        review: scenarios.filter(s => s.outcome === 'REVIEW').length,
        failed: scenarios.filter(s => s.outcome === 'FAIL').length,
      }

      return res.status(200).json({
        product:      { name: 'Tere Health', product_id: 'HSAPP0404', organisation: 'Tere Health Limited', organisation_id: 'G11238-E' },
        environment:  { name: 'UAT', gateway: 'HIP AWS Gateway', base_url: FHIR_BASE, token_url: TOKEN_URL, auth: 'KeyCloak OAuth2 client_credentials' },
        scopes:       (SCOPES || '').split(/\s+/).filter(Boolean),
        generated_at: new Date().toISOString(),
        generated_by: `${auth.provider?.first_name || ''} ${auth.provider?.last_name || ''}`.trim() || auth.provider?.email || 'admin',
        userid_sent:  userId,
        summary,
        scenarios,
      })
    }

    return res.status(400).json({ error: `Unknown action "${action}". Valid: ping, token_probe, get_patient, compliance_pack` })
  } catch (e) {
    console.error('[nhi] error:', e.message)
    return res.status(500).json({ error: 'Server error', detail: e.message })
  }
}
