// POST /api/employer-employees — admin adds employees to an employer.
// Locks down the second half of the fraud vector: an employee record in this
// table is what /api/employer-check matches against when a patient enters
// their name/DOB during triage. Anon writes would let a scraper add fake
// employees under a valid employer_id and bypass verification.
//
// ARC extension (v1.1, 2026-11-05): when the parent employer has
// org_type='aged_care' and the incoming row carries a facility_resident_id,
// the POST path upserts on (employer_id, facility_resident_id) instead of a
// plain insert. This lets Patrick re-upload a corrected CSV for a given
// facility without creating duplicate resident rows. Rows without a
// facility_resident_id fall back to plain insert (the standard employer path).
// Soft-delete on re-upload is deliberately NOT in v1.1 - if a facility drops
// a resident off a later roster, the old row stays until admin manually
// deactivates. Soft-delete is a v1.2 thing.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Coerce resus_status free-text into the CHECK constraint values. Facility
// rosters come in mixed case / phrasing ("NFR", "Not for resus", "For
// resuscitation") so we normalise rather than reject. Unknown strings return
// null so the row still imports but the ACP banner shows "no status on file".
function coerceResusStatus(v) {
  if (v == null || v === '') return null
  const s = String(v).trim().toLowerCase()
  if (s === 'nfr' || s === 'not for resus' || s === 'not for resuscitation' || s === 'dnar' || s === 'dnr') return 'nfr'
  if (s === 'for_resus' || s === 'for resus' || s === 'for resuscitation' || s === 'full resus' || s === 'full code') return 'for_resus'
  if (s === 'unknown' || s === 'unspecified' || s === 'not recorded') return 'unknown'
  return null
}

// Coerce epoa_type free-text into CHECK values. Facility paperwork often
// writes "property EPOA" or "welfare EPOA" rather than the DB enum; we
// normalise so a typo doesn't nuke a whole roster import.
function coerceEpoaType(v) {
  if (v == null || v === '') return null
  const s = String(v).trim().toLowerCase().replace(/[-\s]+/g, '_')
  if (s === 'none' || s === 'no') return null
  if (s === 'property' || s === 'property_only' || s === 'property_epoa') return 'property_only'
  if (s === 'welfare' || s === 'personal_care_welfare' || s === 'personal_care_and_welfare' || s === 'pcw') return 'personal_care_welfare'
  if (s === 'both' || s === 'property_and_welfare') return 'both'
  return null
}

// Boolean coerce for transfer_to_hospital + epoa_activated. Accepts
// yes/no/true/false/1/0/native booleans. Blank/unrecognised returns null so
// the DB stores "not recorded" distinctly from an explicit false.
function coerceBool(v) {
  if (v === true || v === false) return v
  if (v == null || v === '') return null
  const s = String(v).trim().toLowerCase()
  if (s === 'yes' || s === 'y' || s === 'true' || s === '1') return true
  if (s === 'no'  || s === 'n' || s === 'false' || s === '0') return false
  return null
}

// Date coerce. Accepts ISO (YYYY-MM-DD), DD/MM/YYYY (NZ format on facility
// forms), or passes through null/empty. Invalid strings return null rather
// than crashing the import.
function coerceDate(v) {
  if (v == null || v === '') return null
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const nz = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (nz) {
    const [, d, m, y] = nz
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return null
}

// Build the clean row for insert/upsert. Pulled out of the POST handler so
// the ARC upsert branch and the plain-insert branch share a single
// definition of the column mapping + validation.
function buildCleanRow(r) {
  return {
    employer_id: r?.employer_id || null,
    first_name:  r?.first_name || null,
    last_name:   r?.last_name || null,
    dob:         r?.dob || null,
    email:       r?.email || null,
    phone:       r?.phone || null,
    address:     r?.address || null,
    nhi:         r?.nhi ? String(r.nhi).toUpperCase().trim() : null,
    employee_id: r?.employee_id || null,
    // ARC roster columns (v1.1). All optional - a non-ARC employer POST
    // just leaves these null and the row writes as a plain employee.
    facility_resident_id:    r?.facility_resident_id || null,
    room_number:             r?.room_number || null,
    resus_status:            coerceResusStatus(r?.resus_status),
    transfer_to_hospital:    coerceBool(r?.transfer_to_hospital),
    acp_summary:             r?.acp_summary || null,
    epoa_name:               r?.epoa_name || null,
    epoa_phone:              r?.epoa_phone || null,
    epoa_email:              r?.epoa_email || null,
    epoa_type:               coerceEpoaType(r?.epoa_type),
    epoa_activated:          coerceBool(r?.epoa_activated),
    epoa_capacity_cert_date: coerceDate(r?.epoa_capacity_cert_date),
  }
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return

  if (!auth.provider?.is_admin) {
    return res.status(403).json({ error: 'Admin role required to manage employer employees' })
  }

  const supabase = admin()

  if (req.method === 'GET') {
    const { employerId, counts } = req.query || {}

    // Grouped counts { employer_id: count } for the admin employer directory
    // "N employees" badge. Soft-deleted rows (deleted_at IS NOT NULL) are
    // excluded so the badge matches what the roster table shows.
    if (counts === '1') {
      const { data, error } = await supabase
        .from('employer_employees')
        .select('employer_id')
        .is('deleted_at', null)
      if (error) { console.error('[employer-employees] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      const map = {}
      for (const r of (data || [])) map[r.employer_id] = (map[r.employer_id] || 0) + 1
      return res.status(200).json({ counts: map })
    }

    // Default GET filters out soft-deleted rows so future v1.2 soft-delete
    // behaviour doesn't leak retired residents into the admin table or the
    // employer-check matcher. Admin can pass includeDeleted=1 later if the
    // audit view needs them.
    let q = supabase
      .from('employer_employees')
      .select('*')
      .is('deleted_at', null)
      .order('last_name')
    if (employerId) q = q.eq('employer_id', String(employerId))
    const { data, error } = await q
    if (error) { console.error('[employer-employees] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ employees: data || [] })
  }

  if (req.method === 'POST') {
    // Accepts either a single employee object or an array (bulk CSV import).
    const raw = req.body
    const rows = Array.isArray(raw) ? raw : [raw]
    const clean = rows.map(buildCleanRow).filter(r => r.employer_id && r.first_name && r.last_name)
    if (clean.length === 0) return res.status(400).json({ error: 'No valid rows (need employer_id + first_name + last_name)' })

    // All rows in a single POST are expected to share one employer_id (the
    // admin UI posts the current employer's roster). Fetch the parent
    // employer once to decide between plain-insert and ARC-upsert paths.
    const employerIds = Array.from(new Set(clean.map(r => r.employer_id)))
    let orgTypeByEmployer = {}
    if (employerIds.length > 0) {
      const { data: employers, error: empErr } = await supabase
        .from('employers')
        .select('id, org_type')
        .in('id', employerIds)
      if (empErr) { console.error('[employer-employees] employer lookup failed:', empErr); return res.status(500).json({ error: 'Server error' }) }
      for (const e of (employers || [])) orgTypeByEmployer[e.id] = e.org_type
    }

    // Split into two buckets. ARC rows (aged_care employer AND a
    // facility_resident_id present) go through upsert on
    // (employer_id, facility_resident_id). Everything else goes through
    // plain insert as before. Doing both in one request keeps the admin
    // import flow simple - a mixed CSV still works.
    const upsertRows = []
    const insertRows = []
    for (const row of clean) {
      const isArc = orgTypeByEmployer[row.employer_id] === 'aged_care'
      if (isArc && row.facility_resident_id) upsertRows.push(row)
      else insertRows.push(row)
    }

    const results = []
    if (upsertRows.length > 0) {
      const { data, error } = await supabase
        .from('employer_employees')
        .upsert(upsertRows, { onConflict: 'employer_id,facility_resident_id' })
        .select()
      if (error) { console.error('[employer-employees] upsert failed:', error); return res.status(500).json({ error: 'Server error' }) }
      if (data) results.push(...data)
    }
    if (insertRows.length > 0) {
      const { data, error } = await supabase
        .from('employer_employees')
        .insert(insertRows)
        .select()
      if (error) { console.error('[employer-employees] insert failed:', error); return res.status(500).json({ error: 'Server error' }) }
      if (data) results.push(...data)
    }

    return res.status(200).json({
      employees: results,
      inserted: insertRows.length,
      upserted: upsertRows.length,
    })
  }

  if (req.method === 'PATCH') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id query param required' })
    const body = req.body || {}
    // Explicit allowlist. employer_id is NOT patchable here — moving an
    // employee between employers requires delete + re-add to avoid
    // silently cross-contaminating rosters.
    const patch = {}
    if ('first_name'  in body) patch.first_name  = body.first_name  || null
    if ('last_name'   in body) patch.last_name   = body.last_name   || null
    if ('dob'         in body) patch.dob         = body.dob         || null
    if ('email'       in body) patch.email       = body.email       || null
    if ('phone'       in body) patch.phone       = body.phone       || null
    if ('address'     in body) patch.address     = body.address     || null
    if ('nhi'         in body) patch.nhi         = body.nhi ? String(body.nhi).toUpperCase().trim() : null
    if ('employee_id' in body) patch.employee_id = body.employee_id || null
    // ARC columns - admin edits individual resident rows from the Admin UI
    // after the initial CSV import (e.g. ACP summary changes at next MDT).
    if ('facility_resident_id'    in body) patch.facility_resident_id    = body.facility_resident_id || null
    if ('room_number'             in body) patch.room_number             = body.room_number || null
    if ('resus_status'            in body) patch.resus_status            = coerceResusStatus(body.resus_status)
    if ('transfer_to_hospital'    in body) patch.transfer_to_hospital    = coerceBool(body.transfer_to_hospital)
    if ('acp_summary'             in body) patch.acp_summary             = body.acp_summary || null
    if ('epoa_name'               in body) patch.epoa_name               = body.epoa_name || null
    if ('epoa_phone'              in body) patch.epoa_phone              = body.epoa_phone || null
    if ('epoa_email'              in body) patch.epoa_email              = body.epoa_email || null
    if ('epoa_type'               in body) patch.epoa_type               = coerceEpoaType(body.epoa_type)
    if ('epoa_activated'          in body) patch.epoa_activated          = coerceBool(body.epoa_activated)
    if ('epoa_capacity_cert_date' in body) patch.epoa_capacity_cert_date = coerceDate(body.epoa_capacity_cert_date)
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No patchable fields in body' })
    const { data, error } = await supabase.from('employer_employees').update(patch).eq('id', id).select().single()
    if (error) { console.error('[employer-employees] patch failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ employee: data })
  }

  if (req.method === 'DELETE') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id query param required' })
    const { error } = await supabase.from('employer_employees').delete().eq('id', id)
    if (error) { console.error('[employer-employees] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
