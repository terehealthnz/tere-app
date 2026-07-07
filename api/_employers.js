// GET/POST/PATCH /api/employers — admin-managed employer directory.
// Locks down the fraud vector where anon INSERT into `employers` let anyone
// create their own is_active=true row and then claim employer_paid at consult
// creation. See task #71 / commit e4365b5 for the create-consultation-side
// verifier this partners with.
//
// GET   /api/employers                → active employers, alpha-ordered
// GET   /api/employers?includeInactive=1  → all, inactive included
// POST  /api/employers                → admin creates an employer
// PATCH /api/employers?id=<uuid>      → admin updates is_active / details

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Columns admin can PATCH on an employer row.
const UPDATE_ALLOWLIST = new Set([
  'company_name', 'is_active', 'contact_name', 'contact_email', 'contact_phone',
  'notes', 'monthly_rate_per_employee', 'contract_start',
])

const CREATE_ALLOWLIST = new Set([
  'company_name', 'is_active', 'contact_name', 'contact_email', 'contact_phone',
  'notes', 'monthly_rate_per_employee', 'contract_start',
])

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return

  const supabase = admin()

  if (req.method === 'GET') {
    const includeInactive = req.query?.includeInactive === '1'
    let q = supabase.from('employers').select('*').order('company_name')
    if (!includeInactive) q = q.eq('is_active', true)
    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ employers: data || [] })
  }

  // Writes require admin role — this table drives whether a patient gets a
  // free consult, so mutations are more sensitive than provider clinical work.
  if (!auth.provider?.is_admin) {
    return res.status(403).json({ error: 'Admin role required to manage employers' })
  }

  if (req.method === 'POST') {
    const raw = req.body || {}
    if (!raw.company_name?.trim()) return res.status(400).json({ error: 'company_name required' })
    const payload = {}
    for (const [k, v] of Object.entries(raw)) {
      if (CREATE_ALLOWLIST.has(k)) payload[k] = v
    }
    payload.is_active = payload.is_active !== false  // default true
    const { data, error } = await supabase.from('employers').insert(payload).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ employer: data })
  }

  if (req.method === 'PATCH') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id query param required' })
    const raw = req.body || {}
    const patch = {}
    for (const [k, v] of Object.entries(raw)) {
      if (UPDATE_ALLOWLIST.has(k)) patch[k] = v
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No allowed columns in patch' })
    }
    patch.updated_at = new Date().toISOString()
    const { data, error } = await supabase.from('employers').update(patch).eq('id', id).select().maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ employer: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
