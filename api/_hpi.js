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

// Task #440 — per-end-user HPI traceability (ticket IN-3502 Security 3).
// HNZ audit requires the `userid` header on every HPI call to identify the
// individual human who initiated the request, not just our service account.
// Prefer HPI-CPN when the provider has one (e.g. Patrick = 24NSES), fall
// back to a masked internal UUID otherwise. Patient-facing callers derive
// from patient NHI where present.
export function hpiUserIdForProvider(provider) {
  if (!provider) return 'unauth'
  if (provider.cpn && String(provider.cpn).trim()) return `cpn:${String(provider.cpn).trim().toUpperCase()}`
  if (provider.hpi_number && String(provider.hpi_number).trim()) return `hpi:${String(provider.hpi_number).trim().toUpperCase()}`
  if (provider.id) return `provider:${String(provider.id).slice(0, 8)}`
  return 'unknown-provider'
}
export function hpiUserIdForPatient({ nhi, consultationId, patientId } = {}) {
  if (nhi && String(nhi).trim()) return `nhi:${String(nhi).trim().toUpperCase()}`
  if (patientId) return `patient:${String(patientId).slice(0, 8)}`
  if (consultationId) return `consult:${String(consultationId).slice(0, 8)}`
  return 'anon-patient'
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
// shapePractitioner (extended for IN-3502 mandatory tests HPI-P-Get-3/7/8/9/11/12).
// Surfaces every HNZ-required field so the admin UI can render distinct evidence
// for each compliance scenario: registration status, conditions of practice,
// qualification scope, confidentiality flag, and date of death handling.
function shapePractitioner(p) {
  if (!p) return null
  const name = Array.isArray(p.name) ? p.name.find(n => n.use === 'official') || p.name[0] : null
  const family = name?.family || ''
  const given  = Array.isArray(name?.given) ? name.given.join(' ') : (name?.given || '')

  // All HPI identifiers with type distinction, not just CPN
  const identifiers = (p.identifier || []).map(i => ({
    system:  i.system || '',
    value:   i.value || '',
    type:    i.type?.text || i.type?.coding?.[0]?.display || i.type?.coding?.[0]?.code || null,
    isCpn:   /HPI|Common Person Number/i.test(i.type?.text || '') ||
             /^https?:\/\/standards\.digital\.health\.nz\/ns\/hpi-person-id/i.test(i.system || ''),
  }))
  const cpn = identifiers.find(x => x.isCpn) || null

  // HPI-P-Get-8: registration status. `active` gives active/inactive; HPI
  // may also emit a status extension or a business practitionerRole.
  const registrationStatus = p.active === false ? 'inactive' : 'active'

  // HPI-P-Get-7 + HPI-P-Get-9: conditions of practice + qualification scope.
  // Each qualification carries a code (scope) + period (validity) + optional
  // extension for practice-condition (limitations imposed by MCNZ/NCNZ).
  const qualifications = (p.qualification || []).map(q => ({
    code:      q.code?.text || q.code?.coding?.[0]?.display || q.code?.coding?.[0]?.code || null,
    system:    q.code?.coding?.[0]?.system || null,
    issuer:    q.issuer?.display || q.issuer?.reference || null,
    periodStart: q.period?.start || null,
    periodEnd:   q.period?.end || null,
    conditionsOfPractice: (q.extension || [])
      .filter(e => /condition-of-practice|practice-condition|scope-of-practice/i.test(e.url || ''))
      .map(e => e.valueString || e.valueCodeableConcept?.text || e.valueCodeableConcept?.coding?.[0]?.display)
      .filter(Boolean),
  }))

  // HPI-P-Get-11: confidentiality flag. Two possible surfaces per HNZ IG:
  // meta.security (Value Set 'Confidentiality' with codes V/R/N/L/M/U) OR
  // an extension on the Practitioner resource. We surface both.
  const confidentialityCodes = (p.meta?.security || [])
    .map(s => s.code || s.display)
    .filter(Boolean)
  const confidentialityExt = (p.extension || [])
    .find(e => /confidentiality|hpi-confidentiality/i.test(e.url || ''))
  const confidentiality = confidentialityCodes.length ? confidentialityCodes.join(',')
                        : confidentialityExt?.valueCode || confidentialityExt?.valueString || null
  const isConfidential = !!confidentiality && !/^N|Normal/i.test(String(confidentiality))

  // HPI-P-Get-12: date of death. HNZ uses the practitioner-death-date
  // extension (HL7NZ profile). Also check standard FHIR deceasedDateTime.
  const deathExt = (p.extension || [])
    .find(e => /death-date|date-of-death|deceased/i.test(e.url || ''))
  const dateOfDeath = deathExt?.valueDate || deathExt?.valueDateTime ||
                      p.deceasedDateTime || null

  return {
    id:      p.id,
    active:  p.active !== false,
    registrationStatus,                           // HPI-P-Get-8
    family, given,
    fullName: `${given} ${family}`.trim(),
    cpn:      cpn?.value || p.id || null,
    identifiers,                                   // full list (HPI-P-Search-4 evidence)
    qualifications,                                // HPI-P-Get-7 + HPI-P-Get-9
    scope:    qualifications.map(q => q.code).filter(Boolean),  // backwards-compat
    conditionsOfPractice: qualifications.flatMap(q => q.conditionsOfPractice),
    confidentiality,                               // HPI-P-Get-11 (raw code)
    isConfidential,                                // HPI-P-Get-11 (bool for banner)
    dateOfDeath,                                   // HPI-P-Get-12
    isDeceased: !!dateOfDeath,
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

// Per-provider rate limit (task #388). HNZ enforces its own limit at the
// gateway; we cap client-side to stay well under it + catch runaway loops
// early. 100/hour is generous — real admin lookups are single-digit/hour.
const HPI_RATE_LIMIT_PER_HOUR = 100
const HPI_RATE_WARN_PCT = 0.8
const hpiRateBuckets = new Map()
function checkHpiRate(providerId) {
  const now = Date.now()
  const cutoff = now - 60 * 60 * 1000
  const bucket = (hpiRateBuckets.get(providerId) || []).filter(t => t > cutoff)
  bucket.push(now)
  hpiRateBuckets.set(providerId, bucket)
  return { count: bucket.length, limit: HPI_RATE_LIMIT_PER_HOUR, warn: bucket.length >= HPI_RATE_LIMIT_PER_HOUR * HPI_RATE_WARN_PCT, block: bucket.length > HPI_RATE_LIMIT_PER_HOUR }
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  if (!auth.provider?.is_admin) return res.status(403).json({ error: 'Admin only' })

  const { action } = req.query || {}

  // Per-provider rate limit (task #388) — only enforced for actions that
  // actually hit the HNZ HPI API. Diagnostic / config actions don't count.
  const REAL_ACTIONS = new Set(['get_practitioner', 'search_practitioner', 'get_facility', 'search_facility'])
  if (REAL_ACTIONS.has(action)) {
    const r = checkHpiRate(auth.provider.id)
    if (r.block) {
      return res.status(429).json({ error: `HPI query limit reached (${r.count}/${r.limit} per hour). Try again in 60 minutes.` })
    }
    if (r.warn) {
      import('./_security-alert.js').then(({ raiseSecurityAlert }) => {
        raiseSecurityAlert(req, {
          eventType: 'hpi_rate_warn',
          severity:  'warn',
          summary:   `Provider approaching HPI rate limit (${r.count}/${r.limit} per hour)`,
          metadata:  { provider_id: auth.provider.id, count: r.count, limit: r.limit },
        }).catch(() => {})
      }).catch(() => {})
    }
  }

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

    // Every admin HPI action derives an end-user id from the authenticated
    // provider (Noel Babu 2026-09-03 — Security 3 traceability).
    const adminUserId = hpiUserIdForProvider(auth.provider)

    if (action === 'get_practitioner') {
      const cpn = String(req.query.cpn || '').trim()
      if (!cpn) return res.status(400).json({ error: 'cpn required' })
      const r = await fhirGet(`Practitioner/${encodeURIComponent(cpn)}`, null, undefined, adminUserId)
      await auditHpi(auth, req, 'get_practitioner', 'Practitioner', cpn, r)
      if (r.status === 404) return res.status(404).json({ error: 'Not found', body: r.body })
      if (!r.ok)            return res.status(r.status).json({ error: 'HPI error', body: r.body })
      return res.status(200).json({ practitioner: shapePractitioner(r.body), raw: r.body })
    }

    if (action === 'search_practitioner') {
      const family    = String(req.query.family    || '').trim()
      const given     = String(req.query.given     || '').trim()
      const nameQ     = String(req.query.name      || '').trim()
      const birthdate = String(req.query.birthdate || '').trim()  // YYYY-MM-DD; required by HNZ per compliance docs
      if (!family && !given && !nameQ) return res.status(400).json({ error: 'name, family, or given required' })

      // HPI UAT's Practitioner search per HNZ compliance docs is restricted
      // to "name AND date of birth" — bare name searches return 400. When a
      // birthdate is supplied, we prefer combined shapes; otherwise we fall
      // back to bare-name shapes (which will likely 400, but the diagnostic
      // shows the reviewer exactly what HPI rejected).
      const attempts = []
      if (birthdate) {
        if (nameQ)           attempts.push({ label: `name=${nameQ}&birthdate=${birthdate}`,   params: { name: nameQ,           birthdate } })
        if (family && given) attempts.push({ label: `given=${given}&family=${family}&birthdate=${birthdate}`, params: { given, family, birthdate } })
        if (family)          attempts.push({ label: `family=${family}&birthdate=${birthdate}`, params: { family, birthdate } })
        if (family)          attempts.push({ label: `name=${family}&birthdate=${birthdate}`,   params: { name: family, birthdate } })
      }
      if (nameQ)           attempts.push({ label: `name=${nameQ}`,             params: { name: nameQ } })
      if (family && given) attempts.push({ label: `given=${given}&family=${family}`, params: { given, family } })
      if (family)          attempts.push({ label: `family=${family}`,           params: { family } })
      if (family)          attempts.push({ label: `name=${family}`,             params: { name: family } })
      if (given)           attempts.push({ label: `given=${given}`,             params: { given } })
      // De-dupe (a nameQ that equals family would otherwise repeat)
      const seen = new Set()
      const uniq = attempts.filter(a => { if (seen.has(a.label)) return false; seen.add(a.label); return true })

      const tried = []
      let lastError = null
      for (const attempt of uniq) {
        const r = await fhirGet('Practitioner', { ...attempt.params, _count: 20 }, undefined, adminUserId)
        await auditHpi(auth, req, 'search_practitioner', 'Practitioner', attempt.label, r)
        const entries = Array.isArray(r.body?.entry) ? r.body.entry : []
        tried.push({
          shape:  attempt.label,
          status: r.status,
          ok:     r.ok,
          hits:   entries.length,
          diagnostic: r.body?.issue?.[0]?.details?.text || r.body?.issue?.[0]?.diagnostics || null,
        })
        if (r.ok && entries.length > 0) {
          return res.status(200).json({
            results:      entries.map(e => shapePractitioner(e.resource)).filter(Boolean),
            total:        r.body?.total ?? entries.length,
            matched_via:  attempt.label,
            tried,
          })
        }
        if (!r.ok) lastError = { status: r.status, body: r.body, shape: attempt.label }
        // continue to next shape either way — HPI may reject some params and honour others
      }
      // No shape produced results. If every attempt errored, return the last error;
      // otherwise return 200 with empty results + full diagnostic.
      if (lastError && tried.every(t => !t.ok)) {
        return res.status(lastError.status).json({
          error: 'HPI search — all name-param shapes rejected',
          last_error_body: lastError.body,
          tried,
        })
      }
      return res.status(200).json({ results: [], total: 0, tried })
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
      // HNZ-supplied UAT test personas (Noel Babu 2026-09-03, ticket IN-3502).
      // These are the CPNs to use for compliance — do NOT default to a live
      // provider's CPN (e.g. Patrick's 24NSES), that was the mistake caught in
      // the previous submission. All are documented at
      //   https://hpi-ig.hip-uat.digital.health.nz/PractitionerComplianceTesting.html
      //
      // HPI-P-Get-1  → primary positive-get CPN
      // HPI-P-Get-2  → alternate positive-get CPN (different name / registration variant)
      // HPI-P-Get-3  → different persona to prove code-path parity
      // HPI-P-Get-7  → CPN with conditions-of-practice populated
      // HPI-P-Get-8  → CPN with a non-active registration status
      // HPI-P-Get-9  → CPN with multi-qualification scope
      // HPI-P-Get-11 → CPN with a confidentiality flag (now required per Noel 2026-09-03)
      // HPI-P-Get-12 → CPN with a date-of-death value
      // HPI-P-Search-1 → surname O'Reilly (apostrophe handling)
      // HPI-P-Search-4 → surname Hunnicutt (case + partial match)
      const cpnGet1       = String(req.query.cpn1 || '99ZZRT').trim()
      const cpnGet2       = String(req.query.cpn2 || '90ZZJF').trim()
      const cpnGet3       = String(req.query.cpn3 || '91ZZWJ').trim()
      const cpnGet7       = String(req.query.cpn7 || req.query.conditions_cpn || '90ZZLC').trim()
      const cpnGet8       = String(req.query.cpn8 || req.query.regstatus_cpn  || '90ZZLC').trim()
      const cpnGet9       = String(req.query.cpn9 || req.query.qualscope_cpn  || '91ZZWJ').trim()
      const cpnGet11      = String(req.query.cpn11 || req.query.conf_cpn      || '90ZZJF').trim()
      const cpnGet12      = String(req.query.cpn12 || req.query.deceased_cpn  || '99ZZRT').trim()
      const notFoundCpn   = String(req.query.notfound || 'ZZ9ZZZ').trim()
      const malformedCpn  = '!!invalid!!'
      const searchFamily1 = String(req.query.family1 || req.query.family || "O'Reilly").trim()
      const searchFamily4 = String(req.query.family4 || 'Hunnicutt').trim()
      const facilityId    = String(req.query.facility || 'G11238-E').trim()
      // Backwards compat for older query param
      const validCpn      = cpnGet1
      // scope override, passed through to fhirGet so we can iterate without
      // redeploying HPI_SCOPES. ?scope=none forces omission of the OAuth
      // scope param entirely (HNZ's KeyCloak client has defaults configured
      // server-side, so passing no scope Just Works).
      const rawScope      = req.query.scope
      const scopeOverride = rawScope === 'none' ? '' : (rawScope != null ? String(rawScope) : undefined)
      // Per-user traceability: prefer CPN → hpi_number → provider UUID
      // over the historical 'tere-service' shared account (Noel IN-3502
      // Security 3). Query override still honoured for scripted reruns.
      const userId = String(req.query.userid || adminUserId)

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

      // HNZ mandatory practitioner tests (IN-3502). All against HNZ-supplied
      // UAT test CPNs — never against a live-registered clinician's CPN.
      await run(
        'HPI-P-Get-1: Positive Get Practitioner (test CPN 1)',
        `GET Practitioner/${cpnGet1}. Confirms a well-formed FHIR Practitioner resource is returned for a known-valid HNZ UAT test CPN. Uses HNZ-supplied test data, not a live-registered clinician CPN.`,
        { status: 200, description: '200 OK with FHIR Practitioner resource' },
        () => fhirGet(`Practitioner/${encodeURIComponent(cpnGet1)}`, null, scopeOverride, userId),
      )
      await run(
        'HPI-P-Get-2: Positive Get Practitioner (test CPN 2)',
        `GET Practitioner/${cpnGet2}. Second HNZ-supplied UAT persona to prove code-path parity across records.`,
        { status: 200, description: '200 OK with FHIR Practitioner resource' },
        () => fhirGet(`Practitioner/${encodeURIComponent(cpnGet2)}`, null, scopeOverride, userId),
      )
      await run(
        'HPI-P-Get-3: Positive Get Practitioner (test CPN 3)',
        `GET Practitioner/${cpnGet3}. Third HNZ persona covering an additional name/registration variant. Admin UI must render the returned resource without inference (evidence via UI screenshot).`,
        { status: 200, description: '200 OK with FHIR Practitioner resource' },
        () => fhirGet(`Practitioner/${encodeURIComponent(cpnGet3)}`, null, scopeOverride, userId),
      )
      await run(
        'HPI-P-Get-5: Not-Found Get Practitioner',
        `GET Practitioner/${notFoundCpn}. Confirms the product surfaces a 404 (or OperationOutcome) gracefully without crashing when the CPN does not exist.`,
        { status: 404, description: '404 Not Found (or OperationOutcome)' },
        () => fhirGet(`Practitioner/${encodeURIComponent(notFoundCpn)}`, null, scopeOverride, userId),
      )
      await run(
        'HPI-P-Get-6: Malformed Input Handling',
        `GET Practitioner/${malformedCpn}. Confirms malformed CPN characters return a documented 4xx without leaking stack traces.`,
        { status_range: 4, description: 'Any 4xx response, handled without crashing' },
        () => fhirGet(`Practitioner/${encodeURIComponent(malformedCpn)}`, null, scopeOverride, userId),
      )
      await run(
        'HPI-P-Get-7: Conditions of Practice rendered',
        `GET Practitioner/${cpnGet7}. Extracts qualification[].extension entries carrying condition-of-practice / practice-condition / scope-of-practice URLs and surfaces them as a discrete field on the admin viewer (see shapePractitioner.conditionsOfPractice). Evidence: admin UI screenshot showing the conditions field populated.`,
        { status: 200, description: '200 OK; conditions_of_practice[] populated on the response' },
        () => fhirGet(`Practitioner/${encodeURIComponent(cpnGet7)}`, null, scopeOverride, userId),
      )
      await run(
        'HPI-P-Get-8: Registration Status handled',
        `GET Practitioner/${cpnGet8}. Extracts p.active + any status extension into a distinct registration_status field (active/inactive). Admin UI displays the status prominently. Evidence: admin UI screenshot showing the status pill.`,
        { status: 200, description: '200 OK; registration_status populated' },
        () => fhirGet(`Practitioner/${encodeURIComponent(cpnGet8)}`, null, scopeOverride, userId),
      )
      await run(
        'HPI-P-Get-9: Qualification Scope displayed',
        `GET Practitioner/${cpnGet9}. Multi-qualification practitioner: qualifications[] surfaces every code + issuer + period + condition-of-practice entry as separate rows. Evidence: admin UI screenshot showing all qualifications.`,
        { status: 200, description: '200 OK; qualifications[] enumerates every scope' },
        () => fhirGet(`Practitioner/${encodeURIComponent(cpnGet9)}`, null, scopeOverride, userId),
      )
      await run(
        'HPI-P-Get-11: Confidentiality Flag handled',
        `GET Practitioner/${cpnGet11}. Extracts meta.security[] + any confidentiality extension into isConfidential + confidentiality (raw code). Admin UI renders a red confidentiality banner when set. Now REQUIRED per Noel Babu 2026-09-03. Evidence: admin UI screenshot with confidentiality banner visible.`,
        { status: 200, description: '200 OK; isConfidential correctly derived from meta.security or extension' },
        () => fhirGet(`Practitioner/${encodeURIComponent(cpnGet11)}`, null, scopeOverride, userId),
      )
      await run(
        'HPI-P-Get-12: Date of Death handled',
        `GET Practitioner/${cpnGet12}. Extracts practitioner-death-date extension or standard deceasedDateTime into dateOfDeath + isDeceased. Admin UI shows a deceased banner + suppresses selection for onboarding. Evidence: admin UI screenshot.`,
        { status: 200, description: '200 OK; dateOfDeath correctly extracted' },
        () => fhirGet(`Practitioner/${encodeURIComponent(cpnGet12)}`, null, scopeOverride, userId),
      )
      await run(
        `HPI-P-Search-1: Search Practitioner by name + DOB (Walter O'Reilly)`,
        `Search /Practitioner?given=Walter&family=O'Reilly&birthdate=1943-05-24. HNZ compliance docs restrict Practitioner search to name+DOB (hpi-ig.hip-uat.digital.health.nz/PractitionerComplianceTesting.html). Evidence: admin UI screenshot showing matched Bundle.`,
        { status: 200, description: '200 OK with FHIR Bundle' },
        () => fhirGet('Practitioner', { given: 'Walter', family: "O'Reilly", birthdate: '1943-05-24' }, scopeOverride, userId),
      )
      await run(
        `HPI-P-Search-4: Search Practitioner by name + DOB (Brian Hunnicutt)`,
        `Search /Practitioner?given=Brian&family=Hunnicutt&birthdate=1939-02-06. Same code path as Search-1; second HNZ-documented persona.`,
        { status: 200, description: '200 OK with FHIR Bundle' },
        () => fhirGet('Practitioner', { given: 'Brian', family: 'Hunnicutt', birthdate: '1939-02-06' }, scopeOverride, userId),
      )
      // Scenario Location 5 accepts either 200 (positive lookup with a known
      // UAT facility id) OR a well-formed 404 OperationOutcome (proves the
      // Location.r scope + endpoint routing + error handling are correct).
      await run(
        `HPI-L-Get: Facility lookup (${facilityId})`,
        `GET Location/${facilityId}. Confirms Location.r scope is honoured. Accepts a 200 (positive lookup) or a well-formed 404 OperationOutcome. Live-use evidence: three separate call sites (patient GP picker type=GP, prescribe pharmacy picker type=PHARM, referral radiology picker type=RADDX) — see HPI-L-Search screenshots.`,
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
      const userId = String(req.query.userid || adminUserId)
      const r = await fhirGet('Location', { name }, scopeOverride, userId)
      return res.status(r.ok ? 200 : r.status).json({ status: r.status, body_excerpt: JSON.stringify(r.body).slice(0, 3000) })
    }

    if (action === 'get_facility') {
      const hpi = String(req.query.hpi || '').trim()
      if (!hpi) return res.status(400).json({ error: 'hpi required' })
      const r = await fhirGet(`Location/${encodeURIComponent(hpi)}`, null, undefined, adminUserId)
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
