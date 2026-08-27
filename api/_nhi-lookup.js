// /api/nhi-lookup — server-side stub for HNZ NHI (Patient) FHIR lookup.
//
// PENDING: HNZ NHI API access + UAT credentials (task #166). Until
// NHI_API_ENABLED=true is set in Vercel AND the NHI_* env vars are
// populated, this endpoint returns { enabled: false } and the caller
// (patient triage nhi step) falls back to the current typed-then-trust
// behaviour.
//
// Wire-up when access lands:
//   NHI_API_ENABLED=true
//   NHI_TOKEN_URL=<keycloak token endpoint>
//   NHI_BASE_URL=<https://api.hip-uat.digital.health.nz/fhir/nhi/v1>
//   NHI_CLIENT_ID=<client id>
//   NHI_CLIENT_SECRET=<secret>
//   NHI_SCOPES=<space-separated scopes if HNZ requires them>
//
// Request:  POST { nhi, patientName, patientDob } (all strings)
// Response: { enabled, matched, reason, display? }
//
// The endpoint deliberately does NOT return the full FHIR Patient
// resource to the browser — only match/no-match + a minimal display
// tuple. Rationale: the patient owns their own NHI, but the endpoint
// is server-anon (no provider auth), so a malicious caller who guessed
// a random NHI shouldn't get name/DOB/address back for free.

const NHI_ENABLED     = String(process.env.NHI_API_ENABLED || '').toLowerCase() === 'true'
const NHI_TOKEN_URL   = process.env.NHI_TOKEN_URL
const NHI_BASE_URL    = process.env.NHI_BASE_URL
const NHI_CLIENT_ID   = process.env.NHI_CLIENT_ID
const NHI_SECRET      = process.env.NHI_CLIENT_SECRET
const NHI_SCOPES      = process.env.NHI_SCOPES || ''

let cachedToken = null
let tokenExpiry = 0

async function getNhiToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken
  if (!NHI_TOKEN_URL || !NHI_CLIENT_ID || !NHI_SECRET) return null
  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     NHI_CLIENT_ID,
    client_secret: NHI_SECRET,
  })
  if (NHI_SCOPES) params.set('scope', NHI_SCOPES)
  try {
    const res = await globalThis.fetch(NHI_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    if (!res.ok) return null
    const body = await res.json()
    cachedToken = body.access_token
    tokenExpiry = Date.now() + Math.max(0, (Number(body.expires_in) || 300) - 30) * 1000
    return cachedToken
  } catch { return null }
}

// FHIR Patient → { name, dob, gender, deceased }
function parseFhirPatient(r) {
  if (!r) return null
  const nameObj = (r.name || []).find(n => n.use === 'official') || r.name?.[0] || {}
  const given  = (nameObj.given || []).join(' ')
  const family = nameObj.family || ''
  const name   = [given, family].filter(Boolean).join(' ').trim()
  return {
    name,
    dob:      r.birthDate || null,
    gender:   r.gender || null,
    deceased: r.deceasedBoolean === true || Boolean(r.deceasedDateTime),
  }
}

function norm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ') }

// Very forgiving DOB compare: accepts "14 March 1986" against "1986-03-14".
function dobMatches(patientTyped, fhirDob) {
  if (!patientTyped || !fhirDob) return false
  const [y, m, d] = String(fhirDob).split('-').map(Number)
  if (!y || !m || !d) return false
  const typed = String(patientTyped)
  const ts = new Date(typed).getTime()
  if (Number.isFinite(ts)) {
    const dt = new Date(ts)
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d) return true
  }
  // Fallback: substring match on year (blunt but catches "1986" typed loosely).
  return typed.includes(String(y))
}

function nameMatches(patientTyped, fhirName) {
  if (!patientTyped || !fhirName) return false
  const t = norm(patientTyped)
  const f = norm(fhirName)
  if (t === f) return true
  // Family-name substring match — patients often type first-last, HPI stores
  // official = family-only. Accept if the last token of typed appears in FHIR.
  const lastTyped = t.split(' ').slice(-1)[0]
  return lastTyped && f.includes(lastTyped)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Stub short-circuit — no access yet, no attempt.
  if (!NHI_ENABLED) return res.status(200).json({ enabled: false })

  const { nhi, patientName, patientDob } = req.body || {}
  const cleanNhi = String(nhi || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!cleanNhi) return res.status(400).json({ enabled: true, error: 'nhi required' })

  const token = await getNhiToken()
  if (!token || !NHI_BASE_URL) {
    return res.status(200).json({ enabled: true, matched: false, reason: 'lookup_unavailable' })
  }

  try {
    const base = NHI_BASE_URL.replace(/\/+$/, '')
    const url = `${base}/Patient/${encodeURIComponent(cleanNhi)}`
    const fhirRes = await globalThis.fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept:        'application/fhir+json',
        'x-api-key':   NHI_CLIENT_ID,
        userid:        'tere-triage',
        'User-Agent':  'TereHealth/1.0 (server; NHI FHIR proxy)',
      },
    })
    if (fhirRes.status === 404) {
      return res.status(200).json({ enabled: true, matched: false, reason: 'not_found' })
    }
    if (!fhirRes.ok) {
      return res.status(200).json({ enabled: true, matched: false, reason: 'lookup_failed' })
    }
    const patient = parseFhirPatient(await fhirRes.json())
    if (!patient) {
      return res.status(200).json({ enabled: true, matched: false, reason: 'lookup_failed' })
    }
    if (patient.deceased) {
      return res.status(200).json({ enabled: true, matched: false, reason: 'deceased' })
    }

    const nameOk = nameMatches(patientName, patient.name)
    const dobOk  = dobMatches(patientDob, patient.dob)
    if (!nameOk) return res.status(200).json({ enabled: true, matched: false, reason: 'name_mismatch' })
    if (!dobOk)  return res.status(200).json({ enabled: true, matched: false, reason: 'dob_mismatch' })

    // Success — return a minimal display tuple only. Never leak the raw
    // FHIR record to the browser.
    return res.status(200).json({
      enabled: true,
      matched: true,
      reason:  'match',
      display: { name: patient.name, dob: patient.dob },
    })
  } catch {
    return res.status(200).json({ enabled: true, matched: false, reason: 'lookup_failed' })
  }
}
