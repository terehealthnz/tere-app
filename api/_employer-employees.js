// POST /api/employer-employees — admin adds / updates roster rows for an
// employer or aged-residential-care facility.
//
// Locks down the second half of the fraud vector: an employee record in this
// table is what /api/employer-check matches against when a patient enters
// their name/DOB during triage. Anon writes would let a scraper add fake
// employees under a valid employer_id and bypass verification.
//
// ARC branch (2026-11-05):
// - Accepts ARC-specific columns (facility_resident_id, room_number,
//   resus_status, transfer_to_hospital, acp_summary, epoa_type,
//   epoa_activated, epoa_capacity_cert_date, epoa_name, epoa_phone,
//   epoa_email).
// - When the employer's org_type='aged_care' and incoming rows carry a
//   facility_resident_id, we UPSERT on (employer_id, facility_resident_id)
//   and SOFT-DELETE (set deleted_at=now) any roster row not in the upload.
//   Soft-delete only — these rows have consultations FK'd under 10y health-
//   record retention.
// - Validation: resus_status ∈ {for_resus, nfr, unknown},
//   epoa_type ∈ {none, property_only, personal_care_welfare, both}.
// - GET excludes soft-deleted rows by default. `?includeDeleted=1` surfaces
//   them for admin recovery.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const ALLOWED_RESUS = new Set(['for_resus', 'nfr', 'unknown'])
const ALLOWED_EPOA_TYPE = new Set(['none', 'property_only', 'personal_care_welfare', 'both'])

// Normalise one raw row (from JSON body or CSV upload) into the subset of
// columns the DB accepts. Returns an object with employer_id guaranteed if
// present on input. Does NOT validate semantics (that's the caller's
// problem); we just keep the column set clean.
function cleanRow(r, defaultEmployerId = null) {
  const out = {
    employer_id: r?.employer_id || defaultEmployerId || null,
    first_name:  r?.first_name || null,
    last_name:   r?.last_name || null,
    dob:         r?.dob || null,
    email:       r?.email || null,
    phone:       r?.phone || null,
    address:     r?.address || null,
    nhi:         r?.nhi ? String(r.nhi).toUpperCase().trim() : null,
    employee_id: r?.employee_id || null,
    // ARC-specific fields. All nullable at the DB level; only populated for
    // aged_care rows via the ARC CSV template.
    facility_resident_id: r?.facility_resident_id ? String(r.facility_resident_id).trim() : null,
    room_number:          r?.room_number || null,
    resus_status:         r?.resus_status || null,
    transfer_to_hospital: typeof r?.transfer_to_hospital === 'boolean'
      ? r.transfer_to_hospital
      : (r?.transfer_to_hospital === 'true' ? true
         : r?.transfer_to_hospital === 'false' ? false : null),
    acp_summary:                 r?.acp_summary || null,
    epoa_type:                   r?.epoa_type || null,
    epoa_activated: typeof r?.epoa_activated === 'boolean'
      ? r.epoa_activated
      : (r?.epoa_activated === 'true' ? true
         : r?.epoa_activated === 'false' ? false : null),
    epoa_capacity_cert_date:     r?.epoa_capacity_cert_date || null,
    epoa_name:                   r?.epoa_name || null,
    epoa_phone:                  r?.epoa_phone || null,
    epoa_email:                  r?.epoa_email || null,
  }
  return out
}

// Semantic validation on top of cleanRow. Returns error string or null.
function validateRow(r) {
  if (r.resus_status && !ALLOWED_RESUS.has(r.resus_status)) {
    return `resus_status must be one of: ${[...ALLOWED_RESUS].join(', ')}`
  }
  if (r.epoa_type && !ALLOWED_EPOA_TYPE.has(r.epoa_type)) {
    return `epoa_type must be one of: ${[...ALLOWED_EPOA_TYPE].join(', ')}`
  }
  return null
}

// Fetch the employer row so we know whether to run ARC merge semantics.
async function fetchEmployerOrgType(supabase, employerId) {
  const { data } = await supabase
    .from('employers')
    .select('id, org_type')
    .eq('id', String(employerId))
    .maybeSingle()
  return data || null
}

// Perform the ARC upsert + soft-delete merge for one employer in one call.
// Rows coming in with a facility_resident_id are UPSERTed; rows already in
// the DB whose facility_resident_id is NOT in the upload set are
// soft-deleted (deleted_at = now). Rows without a facility_resident_id are
// treated as INSERT only (facility identity isn't known so we can't merge).
// Returns breakdown { inserted, updated, soft_deleted, errors }.
async function mergeArcRoster(supabase, employerId, cleanedRows) {
  const result = { inserted: 0, updated: 0, soft_deleted: 0, errors: [] }

  // Partition inputs: with facility_resident_id vs. without.
  const withFrid = cleanedRows.filter(r => r.facility_resident_id)
  const withoutFrid = cleanedRows.filter(r => !r.facility_resident_id)

  // Semantic validation first — bad rows don't participate in the merge.
  for (const r of cleanedRows) {
    const err = validateRow(r)
    if (err) result.errors.push({ facility_resident_id: r.facility_resident_id || null, first_name: r.first_name, last_name: r.last_name, error: err })
  }
  const okWithFrid = withFrid.filter(r => !validateRow(r))
  const okWithoutFrid = withoutFrid.filter(r => !validateRow(r))

  // Look up existing active rows for this employer so we can distinguish
  // insert from update, and compute the soft-delete set (rows present in DB
  // but missing from upload).
  const { data: existing, error: exErr } = await supabase
    .from('employer_employees')
    .select('id, facility_resident_id')
    .eq('employer_id', employerId)
    .is('deleted_at', null)
  if (exErr) {
    result.errors.push({ error: `Failed to fetch existing roster: ${exErr.message}` })
    return result
  }

  const existingByFrid = new Map()
  for (const row of existing || []) {
    if (row.facility_resident_id) existingByFrid.set(row.facility_resident_id, row.id)
  }
  const incomingFridSet = new Set(okWithFrid.map(r => r.facility_resident_id))

  // Upsert each row-with-frid. We don't use Supabase .upsert() because we
  // want to know insert-vs-update counts (and guarantee employer_id scoping).
  for (const row of okWithFrid) {
    const existingId = existingByFrid.get(row.facility_resident_id)
    if (existingId) {
      const { error: uErr } = await supabase
        .from('employer_employees')
        .update(row)
        .eq('id', existingId)
      if (uErr) {
        result.errors.push({ facility_resident_id: row.facility_resident_id, error: uErr.message })
      } else {
        result.updated += 1
      }
    } else {
      const { error: iErr } = await supabase
        .from('employer_employees')
        .insert(row)
      if (iErr) {
        result.errors.push({ facility_resident_id: row.facility_resident_id, error: iErr.message })
      } else {
        result.inserted += 1
      }
    }
  }

  // Rows in the upload without a facility_resident_id — plain inserts, no
  // merge semantics (we can't match without a stable id).
  if (okWithoutFrid.length > 0) {
    const { data: ins, error: iErr } = await supabase
      .from('employer_employees')
      .insert(okWithoutFrid)
      .select('id')
    if (iErr) {
      result.errors.push({ error: `Insert without facility_resident_id failed: ${iErr.message}` })
    } else {
      result.inserted += (ins?.length || 0)
    }
  }

  // Soft-delete: anyone present in the current roster but not in this upload.
  // Only runs when the upload set is non-empty — an empty upload is treated
  // as "no change" so an admin can't wipe a facility by sending [] by
  // mistake. Rows carry a FK from consultations + 10y retention so we never
  // hard-delete.
  if (incomingFridSet.size > 0) {
    const missing = []
    for (const [frid, rowId] of existingByFrid.entries()) {
      if (!incomingFridSet.has(frid)) missing.push(rowId)
    }
    if (missing.length > 0) {
      const { error: dErr } = await supabase
        .from('employer_employees')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', missing)
      if (dErr) {
        result.errors.push({ error: `Soft-delete failed: ${dErr.message}` })
      } else {
        result.soft_deleted = missing.length
      }
    }
  }

  return result
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return

  if (!auth.provider?.is_admin) {
    return res.status(403).json({ error: 'Admin role required to manage employer employees' })
  }

  const supabase = admin()

  if (req.method === 'GET') {
    const { employerId, counts, includeDeleted } = req.query || {}

    // Grouped counts { employer_id: count } for the admin employer directory
    // "N employees" badge. Counts exclude soft-deleted rows (the badge is
    // meant to reflect the active roster).
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

    let q = supabase.from('employer_employees').select('*').order('last_name')
    if (employerId) q = q.eq('employer_id', String(employerId))
    // Exclude soft-deleted rows unless the caller explicitly asks for them
    // (admin recovery view).
    if (includeDeleted !== '1') q = q.is('deleted_at', null)
    const { data, error } = await q
    if (error) { console.error('[employer-employees] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ employees: data || [] })
  }

  if (req.method === 'POST') {
    // Accepts either a single object or an array (bulk CSV import).
    const raw = req.body
    const rows = Array.isArray(raw) ? raw : [raw]
    if (rows.length === 0) return res.status(400).json({ error: 'No rows supplied' })

    // All rows must carry the same employer_id. If they differ we refuse
    // rather than splitting the upload — the ARC merge semantics are scoped
    // per-employer, so mixing is almost certainly a bug on the caller side.
    const employerIds = new Set(rows.map(r => r?.employer_id).filter(Boolean))
    if (employerIds.size === 0) return res.status(400).json({ error: 'employer_id required on each row' })
    if (employerIds.size > 1) return res.status(400).json({ error: 'All rows must share the same employer_id' })
    const employerId = [...employerIds][0]

    const employer = await fetchEmployerOrgType(supabase, employerId)
    if (!employer) return res.status(400).json({ error: 'employer_id does not match any employer row' })

    const cleaned = rows.map(r => cleanRow(r, employerId))
      .filter(r => r.employer_id && r.first_name && r.last_name)
    if (cleaned.length === 0) return res.status(400).json({ error: 'No valid rows (need employer_id + first_name + last_name)' })

    // ARC branch — merge semantics (upsert + soft-delete).
    if (employer.org_type === 'aged_care') {
      const breakdown = await mergeArcRoster(supabase, employerId, cleaned)
      // Return the full breakdown so the admin UI can show
      // "3 residents added, 42 updated, 2 removed".
      const status = breakdown.errors.length > 0 && breakdown.inserted === 0 && breakdown.updated === 0
        ? 400
        : 200
      return res.status(status).json({
        inserted: breakdown.inserted,
        updated: breakdown.updated,
        soft_deleted: breakdown.soft_deleted,
        errors: breakdown.errors,
      })
    }

    // Employer branch — validate semantics (resus/epoa type values) but just
    // plain-insert. Employer rows don't carry facility_resident_id so merge
    // doesn't apply.
    const errors = []
    const okRows = []
    for (const r of cleaned) {
      const err = validateRow(r)
      if (err) {
        errors.push({ first_name: r.first_name, last_name: r.last_name, error: err })
      } else {
        okRows.push(r)
      }
    }
    if (okRows.length === 0) {
      return res.status(400).json({ error: 'All rows failed validation', errors })
    }
    const { data, error } = await supabase.from('employer_employees').insert(okRows).select()
    if (error) { console.error('[employer-employees] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({
      employees: data || [],
      inserted: okRows.length,
      updated: 0,
      soft_deleted: 0,
      errors,
    })
  }

  if (req.method === 'PATCH') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id query param required' })
    const body = req.body || {}
    // Explicit allowlist. employer_id is NOT patchable here — moving a
    // row between employers requires delete + re-add to avoid silently
    // cross-contaminating rosters. ARC columns added 2026-11-05.
    const patch = {}
    if ('first_name'  in body) patch.first_name  = body.first_name  || null
    if ('last_name'   in body) patch.last_name   = body.last_name   || null
    if ('dob'         in body) patch.dob         = body.dob         || null
    if ('email'       in body) patch.email       = body.email       || null
    if ('phone'       in body) patch.phone       = body.phone       || null
    if ('address'     in body) patch.address     = body.address     || null
    if ('nhi'         in body) patch.nhi         = body.nhi ? String(body.nhi).toUpperCase().trim() : null
    if ('employee_id' in body) patch.employee_id = body.employee_id || null
    // ARC allowlist additions.
    if ('facility_resident_id' in body) patch.facility_resident_id = body.facility_resident_id ? String(body.facility_resident_id).trim() : null
    if ('room_number'          in body) patch.room_number          = body.room_number || null
    if ('resus_status'         in body) patch.resus_status         = body.resus_status || null
    if ('transfer_to_hospital' in body) patch.transfer_to_hospital = typeof body.transfer_to_hospital === 'boolean' ? body.transfer_to_hospital : (body.transfer_to_hospital == null ? null : !!body.transfer_to_hospital)
    if ('acp_summary'          in body) patch.acp_summary          = body.acp_summary || null
    if ('epoa_type'            in body) patch.epoa_type            = body.epoa_type || null
    if ('epoa_activated'       in body) patch.epoa_activated       = typeof body.epoa_activated === 'boolean' ? body.epoa_activated : (body.epoa_activated == null ? null : !!body.epoa_activated)
    if ('epoa_capacity_cert_date' in body) patch.epoa_capacity_cert_date = body.epoa_capacity_cert_date || null
    if ('epoa_name'  in body) patch.epoa_name  = body.epoa_name  || null
    if ('epoa_phone' in body) patch.epoa_phone = body.epoa_phone || null
    if ('epoa_email' in body) patch.epoa_email = body.epoa_email || null
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No patchable fields in body' })

    // Validate enum values before writing so Postgres doesn't throw a 500.
    const vErr = validateRow(patch)
    if (vErr) return res.status(400).json({ error: vErr })

    const { data, error } = await supabase.from('employer_employees').update(patch).eq('id', id).select().single()
    if (error) { console.error('[employer-employees] patch failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ employee: data })
  }

  if (req.method === 'DELETE') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id query param required' })

    // For ARC rows (facility_resident_id present) we soft-delete to keep
    // the consultations FK intact; for legacy employer rows we preserve the
    // old hard-delete behaviour so nothing downstream breaks.
    const { data: existing } = await supabase
      .from('employer_employees')
      .select('id, facility_resident_id')
      .eq('id', id)
      .maybeSingle()
    if (!existing) return res.status(404).json({ error: 'Not found' })

    if (existing.facility_resident_id) {
      const { error } = await supabase
        .from('employer_employees')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) { console.error('[employer-employees] soft-delete failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ ok: true, soft_deleted: true })
    }

    const { error } = await supabase.from('employer_employees').delete().eq('id', id)
    if (error) { console.error('[employer-employees] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
