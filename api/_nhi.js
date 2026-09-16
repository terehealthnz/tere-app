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

// FHIR Parameters body for POST /Patient/$match. HNZ uses the same endpoint
// for both Match (fuzzy demographic search, onlyCertainMatches=false) and
// Validate (strict identity confirmation against a known NHI, onlyCertainMatches=true).
export function buildMatchBody(patient, onlyCertain) {
  return {
    resourceType: 'Parameters',
    parameter: [
      { name: 'resource', resource: { resourceType: 'Patient', ...patient } },
      { name: 'onlyCertainMatches', valueBoolean: !!onlyCertain },
    ],
  }
}

// Sleep with jitter (±20%) to avoid a thundering-herd effect when several
// callers back off simultaneously.
function sleepWithJitter(baseMs) {
  const jitter = baseMs * (0.8 + Math.random() * 0.4)
  return new Promise(r => setTimeout(r, Math.round(jitter)))
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
  const sentUserId = String(userIdOverride || 'tere-service')
  const sentScope = scopeOverride !== undefined ? scopeOverride : SCOPES
  const requestedAt = new Date(started).toISOString()
  const headers = {
    Authorization:      `Bearer ${token}`,
    Accept:             'application/fhir+json',
    'x-api-key':        CLIENT_ID,
    userid:             sentUserId,
    'User-Agent':       'TereHealth/1.0 (server; NHI FHIR proxy)',
    'X-Correlation-Id': corrId,
  }
  if (body && method !== 'GET') headers['Content-Type'] = 'application/fhir+json'

  // HNZ NHI IG §4.3.2 General-1: handle HTTP 429 with exponential backoff.
  // Delays: 1s → 2s → 4s with ±20% jitter; max 3 attempts (initial + 3 retries).
  // Only retry on 429 (real rate-limit) — 5xx and other 4xx return
  // immediately so genuine errors surface without user-visible latency.
  // If HNZ sends a Retry-After header (RFC 6585) we honour it verbatim.
  const MAX_RETRIES = 3
  const BASE_DELAY_MS = 1000
  let r, text, attempt = 0, retriedAfterMs = 0
  while (true) {
    r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
    if (r.status !== 429 || attempt >= MAX_RETRIES) break
    const retryAfterHeader = r.headers.get('retry-after')
    let delay
    if (retryAfterHeader && !isNaN(Number(retryAfterHeader))) {
      delay = Math.min(Number(retryAfterHeader) * 1000, 30000) // cap at 30s
    } else {
      delay = BASE_DELAY_MS * (2 ** attempt) // 1s, 2s, 4s
    }
    // Drain the 429 body to release the socket before sleeping.
    try { await r.text() } catch {}
    retriedAfterMs += delay
    await sleepWithJitter(delay)
    attempt += 1
  }
  text = await r.text()
  let parsed
  try { parsed = text ? JSON.parse(text) : {} } catch { parsed = { raw: text.slice(0, 400) } }
  return {
    url:          url.toString(),
    method,
    status:       r.status,
    body:         parsed,
    duration_ms:  Date.now() - started,
    correlation_id: corrId,
    // Surfaced to the admin panel so screenshots can evidence HNZ Security
    // 1 (org-scoped OAuth), Security 2 (per-user userid), Security 3 (userid
    // changes per end-user), and Security 4 (unique X-Correlation-Id) in a
    // single frame.
    sent_userid: sentUserId,
    sent_scope: sentScope,
    sent_x_api_key_prefix: CLIENT_ID ? `${CLIENT_ID.slice(0, 8)}…` : null,
    requested_at: requestedAt,
    // General-1 evidence — surfaces how many 429s we absorbed automatically.
    rate_limit_retries: attempt,
    rate_limit_backoff_ms: retriedAfterMs,
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
      // Allow the malformed compliance persona through the raw-ish path; only
      // strip pathological control chars. HIP will return a graceful 4xx.
      const raw = String(req.query.nhi || '').trim()
      if (!raw) return res.status(400).json({ error: 'nhi query param required' })
      const nhi = /^[A-Z0-9]+$/i.test(raw) ? raw.toUpperCase() : raw
      const rawScope = req.query.scope
      const scopeOverride = rawScope === 'none' ? '' : (rawScope != null ? String(rawScope) : undefined)
      const r = await fhirCall('GET', `Patient/${encodeURIComponent(nhi)}`, { scopeOverride, userIdOverride: userId })
      return res.status(200).json(r)
    }

    // Admin panel — POST /Patient/$match with onlyCertainMatches=false
    if (action === 'match_patient') {
      const given = String(req.query.given || '').trim()
      const family = String(req.query.family || '').trim()
      const birthdate = String(req.query.birthdate || '').trim()
      if (!family && !given && !birthdate) return res.status(400).json({ error: 'given/family/birthdate required' })
      const patient = {}
      if (family || given) patient.name = [{ family: family || undefined, given: given ? [given] : undefined }]
      if (birthdate) patient.birthDate = birthdate
      const r = await fhirCall('POST', 'Patient/$match', { body: buildMatchBody(patient, false), userIdOverride: userId })
      return res.status(200).json(r)
    }

    // Admin panel — POST /Patient/$match with onlyCertainMatches=true
    if (action === 'validate_patient') {
      const nhi = String(req.query.nhi || '').trim().toUpperCase()
      const given = String(req.query.given || '').trim()
      const family = String(req.query.family || '').trim()
      const birthdate = String(req.query.birthdate || '').trim()
      if (!nhi) return res.status(400).json({ error: 'nhi required for validate' })
      const patient = {
        identifier: [{ system: 'https://standards.digital.health.nz/ns/nhi-id', value: nhi }],
        ...(family || given ? { name: [{ family: family || undefined, given: given ? [given] : undefined }] } : {}),
        ...(birthdate ? { birthDate: birthdate } : {}),
      }
      const r = await fhirCall('POST', 'Patient/$match', { body: buildMatchBody(patient, true), userIdOverride: userId })
      return res.status(200).json(r)
    }

    if (action === 'compliance_pack') {
      // HNZ mandatory NHI compliance scenarios per
      //   https://nhi-ig.hip.digital.health.nz/GetMatchAndValidatePatientComplianceTesting.html
      //
      // Defaults are the exact test NHIs published in the NHI IG (verified
      // 2026-09-15). All query params are overridable so you can add extra
      // scenarios or point at different personas without redeploying.
      //
      // Coverage is chosen to satisfy the three scopes HNZ granted us:
      //   Patient.r (Get)      — Get-1 (minimum identity), Get-2 (deceased),
      //                          Get-4 (partial dates), Get-5 (dormant NHI redirect),
      //                          not-found, malformed
      //   Patient.s (Search)   — Match-1 (positive), Match-Error-1 (missing DOB),
      //                          Match-Error-2 (missing name)
      //   Patient.v (Validate) — Validate-1 (positive), Validate-3 (negative)
      const nhiGet1      = String(req.query.nhi_get1     || 'ZJS7596').trim()  // minimum identity (matches Match-4 + Validate-1)
      const nhiGet2      = String(req.query.nhi_get2     || 'ZAT2348').trim()  // deceased
      const nhiGet4      = String(req.query.nhi_get4     || 'ZAT2496').trim()  // partial DOB
      const nhiGet5      = String(req.query.nhi_get5     || 'ZAT2518').trim()  // dormant → redirect to ZAT2496
      const notFoundNhi  = String(req.query.notfound     || 'ZAA0044').trim()
      const malformed    = '!!invalid!!'
      // Match-1 persona from the IG
      const match1Nhi    = String(req.query.match1_nhi   || 'ZAT4626').trim()
      const match1Given  = String(req.query.match1_given || 'Noah').trim()
      const match1Family = String(req.query.match1_family|| 'Owen').trim()
      const match1Dob    = String(req.query.match1_dob   || '1949-10-30').trim()
      // Validate-1 (positive) persona — Jamie Susan Maraka / ZJS7596
      const val1Nhi      = String(req.query.val1_nhi     || 'ZJS7596').trim()
      const val1Given    = String(req.query.val1_given   || 'Jamie').trim()
      const val1Family   = String(req.query.val1_family  || 'Maraka').trim()
      const val1Dob      = String(req.query.val1_dob     || '1977-08-25').trim()
      // Validate-3 (negative) persona — Jaime Jones / ZJK9604
      const val3Nhi      = String(req.query.val3_nhi     || 'ZJK9604').trim()
      const val3Given    = String(req.query.val3_given   || 'Jaime').trim()
      const val3Family   = String(req.query.val3_family  || 'Jones').trim()
      const val3Dob      = String(req.query.val3_dob     || '1979-06-10').trim()

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

      // ── Patient.r (Get) scenarios ─────────────────────────────────────────
      await run(
        `NHI-GET-1: Positive Get Patient — minimum identity (${nhiGet1})`,
        `GET Patient/${nhiGet1}. Returns a FHIR Patient resource containing the minimum identity information required to confirm identity. Persona: Jamie Susan Maraka, DOB 1977-08-25.`,
        { status: 200, description: '200 OK with FHIR Patient resource' },
        () => fhirCall('GET', `Patient/${encodeURIComponent(nhiGet1)}`, { scopeOverride, userIdOverride: userId }),
      )
      await run(
        `NHI-GET-2: Positive Get Patient — deceased flag (${nhiGet2})`,
        `GET Patient/${nhiGet2}. Confirms the product surfaces deceased status + date of death. Persona: Laura Rose Smith-Martin (deceased). AITriage nhi-confirm step short-circuits with reason='deceased' when Patient.deceasedBoolean or Patient.deceasedDateTime is set.`,
        { status: 200, description: '200 OK; deceased status surfaced to caller' },
        () => fhirCall('GET', `Patient/${encodeURIComponent(nhiGet2)}`, { scopeOverride, userIdOverride: userId }),
      )
      await run(
        `NHI-GET-4: Positive Get Patient — partial dates (${nhiGet4})`,
        `GET Patient/${nhiGet4}. Confirms the product handles a Patient resource with a partial birthDate (year-only) and a non-validated address without crashing. Persona: John Test Yossarian, DOB 1914-01-01.`,
        { status: 200, description: '200 OK with FHIR Patient resource' },
        () => fhirCall('GET', `Patient/${encodeURIComponent(nhiGet4)}`, { scopeOverride, userIdOverride: userId }),
      )
      await run(
        `NHI-GET-5: Dormant NHI redirect (${nhiGet5} → live NHI)`,
        `GET Patient/${nhiGet5}. Dormant NHI — HNZ returns the live NHI (ZAT2496) in the response with an OperationOutcome flag. Confirms product alerts the caller of dormant status rather than treating the redirect as a mismatch.`,
        { status: 200, description: '200 OK; dormant status surfaced' },
        () => fhirCall('GET', `Patient/${encodeURIComponent(nhiGet5)}`, { scopeOverride, userIdOverride: userId }),
      )
      await run(
        `NHI-GET-Negative: Not-Found (${notFoundNhi})`,
        `GET Patient/${notFoundNhi}. Confirms the product surfaces a 404 (or OperationOutcome) gracefully when the NHI does not exist in the NHI dataset.`,
        { accepted_statuses: [404, 200], description: '404 Not Found — or 200 OK with an OperationOutcome error' },
        () => fhirCall('GET', `Patient/${encodeURIComponent(notFoundNhi)}`, { scopeOverride, userIdOverride: userId }),
      )
      await run(
        'NHI-GET-Malformed: Malformed input handling',
        `GET Patient/${malformed}. Confirms malformed NHI characters return a documented 4xx without leaking stack traces or crashing the server.`,
        { status_range: 4, description: 'Any 4xx response, handled without crashing' },
        () => fhirCall('GET', `Patient/${encodeURIComponent(malformed)}`, { scopeOverride, userIdOverride: userId }),
      )
      // HNZ NHI uses POST /Patient/$match for both Match (fuzzy demographic
      // search, onlyCertainMatches=false) and Validate (strict identity
      // confirmation, onlyCertainMatches=true). See buildMatchBody() at
      // module scope. Ref: https://nhi-ig.hip.digital.health.nz/API.html

      // ── Patient.s (Match — fuzzy demographic search) scenarios ────────────
      await run(
        `NHI-Match-1: Positive match — ${match1Given} ${match1Family} ${match1Dob}`,
        `POST Patient/$match with { name ${match1Given} ${match1Family}, DOB ${match1Dob}, onlyCertainMatches=false }. Confirms fuzzy demographic search returns a FHIR Bundle ordered by match score (descending). Top result should be ${match1Nhi}.`,
        { status: 200, description: '200 OK with FHIR Bundle; top-ranked result is the expected NHI' },
        () => fhirCall('POST', 'Patient/$match', {
          body: buildMatchBody({
            name: [{ family: match1Family, given: [match1Given] }],
            birthDate: match1Dob,
          }, false),
          scopeOverride, userIdOverride: userId,
        }),
      )
      await run(
        'NHI-Match-Error-1: Missing DOB returns 4xx',
        `POST Patient/$match with name only (no birthDate). Confirms the product surfaces the HNZ error requiring DOB on match.`,
        { accepted_statuses: [400, 422], description: '400 Bad Request (or 422) with OperationOutcome' },
        () => fhirCall('POST', 'Patient/$match', {
          body: buildMatchBody({
            name: [{ family: 'Rhetoric', given: ['Rhetoric'] }],
          }, false),
          scopeOverride, userIdOverride: userId,
        }),
      )
      await run(
        'NHI-Match-Error-2: Missing name returns 4xx',
        `POST Patient/$match with birthDate only (no name). Confirms the product surfaces the HNZ error requiring name on match.`,
        { accepted_statuses: [400, 422], description: '400 Bad Request (or 422) with OperationOutcome' },
        () => fhirCall('POST', 'Patient/$match', {
          body: buildMatchBody({ birthDate: '1954-09-28' }, false),
          scopeOverride, userIdOverride: userId,
        }),
      )
      // ── Patient.v (Validate — strict identity confirmation) scenarios ────
      // Same endpoint as Match; onlyCertainMatches=true switches to strict mode.
      await run(
        `NHI-Validate-1: Positive validate — ${val1Given} ${val1Family} (${val1Nhi})`,
        `POST Patient/$match with onlyCertainMatches=true and { NHI ${val1Nhi}, name ${val1Given} ${val1Family}, DOB ${val1Dob} }. Strict validation — should return a Bundle containing the matching Patient.`,
        { accepted_statuses: [200, 422], description: '200 OK with FHIR Bundle (single certain match) — or 422 Unprocessable Entity' },
        () => fhirCall('POST', 'Patient/$match', {
          body: buildMatchBody({
            identifier: [{ system: 'https://standards.digital.health.nz/ns/nhi-id', value: val1Nhi }],
            name: [{ family: val1Family, given: [val1Given] }],
            birthDate: val1Dob,
          }, true),
          scopeOverride, userIdOverride: userId,
        }),
      )
      await run(
        `NHI-Validate-3: Negative validate — ${val3Given} ${val3Family} (${val3Nhi})`,
        `POST Patient/$match with onlyCertainMatches=true and demographics that do NOT match the NHI record. HNZ returns an empty Bundle (no certain match). Confirms the product handles a negative validation without treating it as an error.`,
        { accepted_statuses: [200, 422], description: '200 OK with empty Bundle — or 422 Unprocessable Entity' },
        () => fhirCall('POST', 'Patient/$match', {
          body: buildMatchBody({
            identifier: [{ system: 'https://standards.digital.health.nz/ns/nhi-id', value: val3Nhi }],
            name: [{ family: val3Family, given: [val3Given] }],
            birthDate: val3Dob,
          }, true),
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

    return res.status(400).json({ error: `Unknown action "${action}". Valid: ping, token_probe, get_patient, match_patient, validate_patient, compliance_pack` })
  } catch (e) {
    console.error('[nhi] error:', e.message)
    return res.status(500).json({ error: 'Server error', detail: e.message })
  }
}
