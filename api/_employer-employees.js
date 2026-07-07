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
    const { employerId } = req.query || {}
    let q = supabase.from('employer_employees').select('*').order('last_name')
    if (employerId) q = q.eq('employer_id', String(employerId))
    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })
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
      employee_id: r?.employee_id || null,
    })).filter(r => r.employer_id && r.first_name && r.last_name)
    if (clean.length === 0) return res.status(400).json({ error: 'No valid rows (need employer_id + first_name + last_name)' })
    const { data, error } = await supabase.from('employer_employees').insert(clean).select()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ employees: data || [], inserted: clean.length })
  }

  if (req.method === 'DELETE') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id query param required' })
    const { error } = await supabase.from('employer_employees').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
