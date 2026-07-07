// GET /api/prescriptions — provider-side reads on the prescriptions table.
// Runs with service_role, requires an authenticated provider. Writes are still
// funnelled through /api/generate-prescription-pdf (creation), /api/approve-draft
// (approval) and /api/admin-patch (edge cases), so this endpoint is read-only.
//
// GET /api/prescriptions?filter=pending_approval → pending approval list
// GET /api/prescriptions?filter=pending_count    → head count only
// GET /api/prescriptions?consultationId=<uuid>   → all Rx for a consult
// GET /api/prescriptions?id=<uuid>               → single Rx by id

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

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const supabase = admin()
  const { filter, consultationId, id, columns } = req.query || {}

  if (id) {
    const { data, error } = await supabase.from('prescriptions').select('*').eq('id', id).maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    if (!data)  return res.status(404).json({ error: 'Prescription not found' })
    return res.status(200).json({ prescription: data })
  }

  if (filter === 'pending_count') {
    const { count, error } = await supabase
      .from('prescriptions')
      .select('id', { count: 'exact', head: true })
      .eq('approval_status', 'pending_approval')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ count: count || 0 })
  }

  if (filter === 'pending_approval') {
    // Default projection matches Admin.jsx approvals table + Dashboard supervisor panel.
    const cols = columns
      ? String(columns).split(',').map(c => c.trim()).filter(Boolean).join(', ')
      : '*'
    const { data, error } = await supabase
      .from('prescriptions')
      .select(cols)
      .eq('approval_status', 'pending_approval')
      .order('created_at', { ascending: true })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ prescriptions: data || [] })
  }

  // Recent prescriptions since <iso> — Admin.jsx "Recent prescriptions" panel.
  if (filter === 'recent') {
    const { since } = req.query
    const cols = columns
      ? String(columns).split(',').map(c => c.trim()).filter(Boolean).join(', ')
      : '*'
    const sinceIso = since || new Date(Date.now() - 30 * 86400000).toISOString()
    const { data, error } = await supabase
      .from('prescriptions')
      .select(cols)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ prescriptions: data || [] })
  }

  // Recent list capped at limit — ProviderApp.jsx analytics panel.
  if (filter === 'recent_list') {
    const { limit: rawLimit } = req.query
    const cols = columns
      ? String(columns).split(',').map(c => c.trim()).filter(Boolean).join(', ')
      : 'id, drug_name, drug, dose, directions, delivery_status, created_at, patient_name, nzeps_token, consultation_id'
    const lim = Math.max(1, Math.min(200, parseInt(rawLimit) || 30))
    const { data, error } = await supabase
      .from('prescriptions')
      .select(cols)
      .order('created_at', { ascending: false })
      .limit(lim)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ prescriptions: data || [] })
  }

  if (consultationId) {
    const { data, error } = await supabase
      .from('prescriptions')
      .select('*')
      .eq('consultation_id', consultationId)
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ prescriptions: data || [] })
  }

  return res.status(400).json({ error: 'Provide id, consultationId, or filter=pending_approval|pending_count' })
}
