// POST /api/employer-employees — admin adds employees to an employer.
// Locks down the second half of the fraud vector: an employee record in this
// table is what /api/employer-check matches against when a patient enters
// their name/DOB during triage. Anon writes would let a scraper add fake
// employees under a valid employer_id and bypass verification.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
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
    // "N employees" badge.
    if (counts === '1') {
      const { data, error } = await supabase.from('employer_employees').select('employer_id')
      if (error) { console.error('[employer-employees] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      const map = {}
      for (const r of (data || [])) map[r.employer_id] = (map[r.employer_id] || 0) + 1
      return res.status(200).json({ counts: map })
    }

    let q = supabase.from('employer_employees').select('*').order('last_name')
    if (employerId) q = q.eq('employer_id', String(employerId))
    const { data, error } = await q
    if (error) { console.error('[employer-employees] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ employees: data || [] })
  }

  if (req.method === 'POST') {
    // Accepts either a single employee object or an array (bulk CSV import).
    const raw = req.body
    const rows = Array.isArray(raw) ? raw : [raw]
    // Only whitelisted columns from each row.
    const clean = rows.map(r => ({
      employer_id: r?.employer_id || null,
      first_name:  r?.first_name || null,
      last_name:   r?.last_name || null,
      dob:         r?.dob || null,
      email:       r?.email || null,
      phone:       r?.phone || null,
      address:     r?.address || null,
      nhi:         r?.nhi ? String(r.nhi).toUpperCase().trim() : null,
      employee_id: r?.employee_id || null,
    })).filter(r => r.employer_id && r.first_name && r.last_name)
    if (clean.length === 0) return res.status(400).json({ error: 'No valid rows (need employer_id + first_name + last_name)' })
    const { data, error } = await supabase.from('employer_employees').insert(clean).select()
    if (error) { console.error('[employer-employees] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ employees: data || [], inserted: clean.length })
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
