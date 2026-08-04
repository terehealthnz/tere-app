// /api/patient-conditions — structured PMH conditions per patient.
// See _patient-allergens.js for the shared shape.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

const ALLOWLIST = new Set([
  'condition', 'icd10_code', 'status', 'onset_date', 'resolved_date', 'notes',
])

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function project(raw) {
  const patch = {}
  for (const [k, v] of Object.entries(raw || {})) if (ALLOWLIST.has(k)) patch[k] = v
  return patch
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  const supabase = admin()

  if (req.method === 'GET') {
    const { patientId } = req.query || {}
    if (!patientId) return res.status(400).json({ error: 'patientId query param required' })
    const { data, error } = await supabase
      .from('patient_conditions').select('*').eq('patient_id', patientId)
      .order('status', { ascending: true }).order('onset_date', { ascending: false, nullsFirst: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ conditions: data || [] })
  }

  if (req.method === 'POST') {
    const body = req.body || {}
    if (!body.patientId || !body.condition) return res.status(400).json({ error: 'patientId + condition required' })
    const row = { patient_id: body.patientId, ...project(body),
                  created_by: auth.provider?.id || null,
                  created_by_name: auth.provider?.display_name || auth.email || null }
    const { data, error } = await supabase.from('patient_conditions').insert(row).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ condition: data })
  }

  if (req.method === 'PATCH') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id query param required' })
    const patch = project(req.body || {})
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No allowed columns in patch' })
    patch.updated_at = new Date().toISOString()
    const { data, error } = await supabase.from('patient_conditions').update(patch).eq('id', id).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ condition: data })
  }

  if (req.method === 'DELETE') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id query param required' })
    const { error } = await supabase.from('patient_conditions').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
