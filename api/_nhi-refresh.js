// POST /api/nhi-refresh?consultationId=<uuid>
//
// Pulls the current HNZ NHI Patient snapshot for the consult's patient_nhi,
// compares against the demographics stored on the consult row, and writes the
// snapshot + diff into consultations.patient_nhi_data (JSONB) +
// consultations.patient_nhi_fetched_at. The clinician UI then renders:
//   - deceased banner (blocks prescribe + referral)
//   - mismatch banner (name/dob/address differ from HNZ)
//   - stale banner (fetched_at > 24h ago; auto-refresh handles this)
//
// Called by:
//   - ClinicianPatient.jsx mount effect (auto-fire if cache missing or stale)
//   - PrescribeModal / Referral builder pre-check (fail-safe re-verify)
//
// Response shape:
//   { ok: true,
//     deceased: boolean,
//     deceasedDateTime: string|null,
//     mismatch: { fields: ['name', 'dob', 'address'], hnz: {...} } | null,
//     fetched_at: iso,
//     cached: boolean (true if returned fresh cache without re-fetching HNZ) }

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

const STALE_MS = 24 * 60 * 60 * 1000  // 24h

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Normalise strings for tolerant demographics comparison. Keeps the compare
// forgiving to case/whitespace differences (patient typed "Jamie SUSAN Maraka"
// vs HNZ "Jamie Susan Maraka") without hiding real mismatches ("Jaime" vs
// "Jamie" still differs).
function norm(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// Compares stored patient_* fields against the HNZ snapshot. Returns the list
// of fields that disagree. A disagreement on name is more serious than suburb
// drift so the UI banner caption varies by severity (not implemented here —
// UI decides based on the field list).
function diffFields(stored, hnz) {
  const out = []
  const storedName = norm(stored.patient_first_name + ' ' + (stored.patient_last_name || ''))
  const hnzName = norm(hnz.name)
  if (storedName && hnzName && storedName !== hnzName) {
    // Family-name match (patients often type full name, HNZ returns different
    // given-name ordering). Only flag if the last token differs — otherwise
    // treat as a soft "given names re-ordered" difference and skip.
    const storedLast = storedName.split(' ').slice(-1)[0]
    if (!hnzName.includes(storedLast)) out.push('name')
  }
  const storedDob = String(stored.patient_dob || '').slice(0, 10)
  const hnzDob = String(hnz.dob || '').slice(0, 10)
  if (storedDob && hnzDob && storedDob !== hnzDob) out.push('dob')
  // Address compare is lightweight — only flag if stored address exists AND
  // doesn't substring-match any HNZ address line. HNZ address can be partial.
  if (stored.patient_address && hnz.address_parts) {
    const typed = norm(stored.patient_address)
    const line = norm(hnz.address_parts.line)
    if (line && line.length > 4 && !typed.includes(line) && !line.includes(typed.slice(0, 20))) {
      out.push('address')
    }
  }
  return out
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await guardProvider(req, res)
  if (!auth) return

  const { consultationId } = req.query || {}
  if (!consultationId) return res.status(400).json({ error: 'consultationId query param required' })

  const force = String(req.query.force || '') === '1'
  const supabase = admin()

  const { data: consult, error: fetchErr } = await supabase
    .from('consultations')
    .select('id, patient_nhi, patient_first_name, patient_last_name, patient_dob, patient_address, patient_nhi_data, patient_nhi_fetched_at')
    .eq('id', consultationId)
    .maybeSingle()
  if (fetchErr) { console.error('[nhi-refresh] fetch failed:', fetchErr); return res.status(500).json({ error: 'Server error' }) }
  if (!consult) return res.status(404).json({ error: 'Consultation not found' })
  if (!consult.patient_nhi) return res.status(200).json({ ok: true, enabled: false, reason: 'no_nhi_on_consult' })

  // Serve cache if fresh (unless force=1). Keeps HNZ load off repeat consult-
  // detail navigation. The deceased + mismatch flags are derived values stored
  // alongside the raw snapshot so the client doesn't re-compute.
  const cachedAt = consult.patient_nhi_fetched_at ? new Date(consult.patient_nhi_fetched_at).getTime() : 0
  const age = Date.now() - cachedAt
  if (!force && consult.patient_nhi_data && age < STALE_MS) {
    return res.status(200).json({
      ok: true,
      cached: true,
      deceased: consult.patient_nhi_data.deceased === true,
      deceasedDateTime: consult.patient_nhi_data.deceasedDateTime || null,
      mismatch: consult.patient_nhi_data.mismatch || null,
      hnz: consult.patient_nhi_data.hnz || null,
      fetched_at: consult.patient_nhi_fetched_at,
    })
  }

  // Delegate to the existing /api/nhi-lookup Patient-fetch helpers. We reuse
  // the shared token cache + FHIR Patient parser rather than re-implementing.
  // Import lazily so this endpoint boots in environments where NHI isn't
  // enabled yet (no HNZ env vars set).
  const nhiModule = await import('./_nhi-lookup.js')
  // _nhi-lookup.js exports the handler as default but keeps helpers module-
  // scoped — we need to call the raw GET-by-NHI flow. Easiest path: hit the
  // existing /api/nhi?nhi_get action via internal fetch would add a hop, so
  // instead we re-use the token + FHIR parse here directly.
  // (Keeping this file dependency-free of callGetPatient's internals; if the
  // _nhi-lookup helpers get exported later we can swap this for a direct call.)
  const token = await _getToken()
  if (!token) return res.status(200).json({ ok: true, enabled: true, lookup_available: false })

  const base = process.env.NHI_FHIR_BASE
  const { randomUUID } = await import('node:crypto')
  const corrId = randomUUID()
  const r = await globalThis.fetch(`${base}/Patient/${encodeURIComponent(consult.patient_nhi)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/fhir+json',
      'X-Correlation-Id': corrId,
      userid: `tere-provider-${auth.providerId || 'unknown'}`,
    },
  })
  const bodyText = await r.text()
  let fhir = null; try { fhir = JSON.parse(bodyText) } catch {}
  if (!r.ok || !fhir) {
    console.error('[nhi-refresh] HNZ GET failed:', r.status, (bodyText || '').slice(0, 200))
    return res.status(200).json({ ok: false, enabled: true, status: r.status, error: 'hnz_lookup_failed' })
  }

  const parsed = _parseFhirPatient(fhir)
  if (!parsed) return res.status(200).json({ ok: false, enabled: true, error: 'hnz_patient_parse_failed' })

  const mismatchFields = diffFields(consult, parsed)
  const now = new Date().toISOString()
  const snapshot = {
    hnz: {
      name: parsed.name,
      dob: parsed.dob,
      gender: parsed.gender,
      address_parts: parsed.address_parts,
    },
    deceased: parsed.deceased,
    deceasedDateTime: fhir.deceasedDateTime || null,
    mismatch: mismatchFields.length > 0 ? { fields: mismatchFields, hnz: parsed } : null,
    corr_id: corrId,
    refreshed_by: auth.providerId || null,
  }

  const { error: updateErr } = await supabase
    .from('consultations')
    .update({ patient_nhi_data: snapshot, patient_nhi_fetched_at: now })
    .eq('id', consultationId)
  if (updateErr) { console.error('[nhi-refresh] update failed:', updateErr); return res.status(500).json({ error: 'Server error' }) }

  return res.status(200).json({
    ok: true,
    cached: false,
    deceased: snapshot.deceased,
    deceasedDateTime: snapshot.deceasedDateTime,
    mismatch: snapshot.mismatch,
    hnz: snapshot.hnz,
    fetched_at: now,
  })
}

// Local copies of the FHIR helpers to avoid depending on non-exported internals
// of _nhi-lookup.js. Keeps this handler self-contained.
let _cachedToken = null
let _tokenExpiry = 0
async function _getToken() {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken
  const url      = process.env.NHI_TOKEN_URL
  const clientId = process.env.NHI_CLIENT_ID
  const secret   = process.env.NHI_CLIENT_SECRET
  const scope    = process.env.NHI_SCOPE
  if (!url || !clientId || !secret || !scope) return null
  const params = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: secret, scope })
  try {
    const r = await globalThis.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    if (!r.ok) return null
    const body = await r.json()
    _cachedToken = body.access_token
    _tokenExpiry = Date.now() + Math.max(0, (Number(body.expires_in) || 300) - 30) * 1000
    return _cachedToken
  } catch { return null }
}
function _parseFhirPatient(r) {
  if (!r) return null
  const nameObj = (r.name || []).find(n => n.use === 'official') || r.name?.[0] || {}
  const given  = (nameObj.given || []).join(' ')
  const family = nameObj.family || ''
  const name   = [given, family].filter(Boolean).join(' ').trim()
  const home = (r.address || []).find(a => a.use === 'home') || (r.address || [])[0] || {}
  const line = Array.isArray(home.line) ? home.line.join(' ') : (home.line || null)
  return {
    name,
    dob:      r.birthDate || null,
    gender:   r.gender || null,
    deceased: r.deceasedBoolean === true || Boolean(r.deceasedDateTime),
    address_parts: { line, postalCode: home.postalCode || null, city: home.city || null, suburb: home.district || null },
  }
}
