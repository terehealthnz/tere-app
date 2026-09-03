// GET /api/prescriptions — provider-side reads on the prescriptions table.
// Runs with service_role, requires an authenticated provider. Writes are still
// funnelled through /api/generate-prescription-pdf (creation), /api/approve-draft
// (approval) and /api/admin-patch (edge cases), so this endpoint is read-only.
//
// GET /api/prescriptions?filter=pending_approval → pending approval list
// GET /api/prescriptions?filter=pending_count    → head count only
// GET /api/prescriptions?consultationId=<uuid>   → all Rx for a consult
// GET /api/prescriptions?patientId=<uuid>        → all Rx across all consults
//                                                  for a patient (chart view)
// GET /api/prescriptions?id=<uuid>               → single Rx by id

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'
import { resolveDataMode } from './_provider-access-gate.js'

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

  // Practice-mode scope for prescription reads.
  const { practice } = resolveDataMode(auth.provider, req)

  const supabase = admin()
  const { filter, consultationId, patientId, id, columns } = req.query || {}

  // Columns referenced in client code but never migrated to the DB. Strip
  // them from any client-supplied projection so we return real data instead
  // of surfacing "column does not exist" errors.
  const MISSING_SCHEMA_COLUMNS = new Set(['urgency'])
  const normalizeCols = (raw) => {
    if (!raw) return null
    const cols = String(raw).split(',').map(c => c.trim())
      .filter(c => c && !MISSING_SCHEMA_COLUMNS.has(c))
    return cols.length ? cols.join(', ') : '*'
  }

  if (id) {
    const { data, error } = await supabase.from('prescriptions').select('*').eq('id', id).eq('is_practice', practice).maybeSingle()
    if (error) { console.error('[prescriptions] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    if (!data)  return res.status(404).json({ error: 'Prescription not found' })
    return res.status(200).json({ prescription: data })
  }

  if (filter === 'pending_count') {
    const { count, error } = await supabase
      .from('prescriptions')
      .select('id', { count: 'exact', head: true })
      .eq('approval_status', 'pending_approval')
      .eq('is_practice', practice)
    if (error) { console.error('[prescriptions] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ count: count || 0 })
  }

  if (filter === 'pending_approval') {
    // Default projection matches Admin.jsx approvals table + Dashboard supervisor panel.
    const cols = normalizeCols(columns) || '*'
    const { data, error } = await supabase
      .from('prescriptions')
      .select(cols)
      .eq('approval_status', 'pending_approval')
      .eq('is_practice', practice)
      .order('created_at', { ascending: true })
    if (error) { console.error('[prescriptions] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ prescriptions: data || [] })
  }

  // Recent prescriptions since <iso> — Admin.jsx "Recent prescriptions" panel.
  if (filter === 'recent') {
    const { since } = req.query
    const cols = normalizeCols(columns) || '*'
    const sinceIso = since || new Date(Date.now() - 30 * 86400000).toISOString()
    const { data, error } = await supabase
      .from('prescriptions')
      .select(cols)
      .gte('created_at', sinceIso)
      .eq('is_practice', practice)
      .order('created_at', { ascending: false })
    if (error) { console.error('[prescriptions] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ prescriptions: data || [] })
  }

  // Controlled Drugs Register — every prescription flagged controlled=true.
  // Meets NZ Misuse of Drugs Regulations 1977 reg 44 record-keeping expectations
  // (Medsafe audit). Date range + optional drug filter.
  // JIT elevation required (task #377).
  if (filter === 'controlled_register') {
    const { checkElevation } = await import('./_elevation.js')
    const elev = await checkElevation(req, { required: true })
    if (!elev.ok) return res.status(elev.status).json({ error: elev.error, requires_elevation: true })
    const { from, to, drug } = req.query
    let q = supabase.from('prescriptions')
      .select('id, drug_name, drug, strength, dose, dose_instructions, directions, quantity, refills, delivery_status, created_at, patient_name, patient_nhi, prescriber_number, consultation_id, provider_id, provider_name')
      .eq('controlled', true)
      .eq('is_practice', practice)
      .order('created_at', { ascending: false })
      .limit(2000)
    if (from) q = q.gte('created_at', from)
    if (to)   q = q.lte('created_at', to)
    if (drug) q = q.or(`drug_name.ilike.%${drug}%,drug.ilike.%${drug}%`)
    const { data, error } = await q
    if (error) { console.error('[prescriptions] cd register failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ prescriptions: data || [] })
  }

  // Recent list capped at limit — ProviderApp.jsx analytics panel.
  if (filter === 'recent_list') {
    const { limit: rawLimit } = req.query
    const cols = normalizeCols(columns) || 'id, drug_name, drug, dose, directions, delivery_status, created_at, patient_name, nzeps_token, consultation_id'
    const lim = Math.max(1, Math.min(200, parseInt(rawLimit) || 30))
    const { data, error } = await supabase
      .from('prescriptions')
      .select(cols)
      .eq('is_practice', practice)
      .order('created_at', { ascending: false })
      .limit(lim)
    if (error) { console.error('[prescriptions] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ prescriptions: data || [] })
  }

  if (consultationId) {
    const { data, error } = await supabase
      .from('prescriptions')
      .select('*')
      .eq('consultation_id', consultationId)
      .eq('is_practice', practice)
      .order('created_at', { ascending: false })
    if (error) { console.error('[prescriptions] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ prescriptions: data || [] })
  }

  if (patientId) {
    // All prescriptions across every consult for this patient. Two-step
    // (list consult IDs, then IN filter) is more portable than relying on
    // PostgREST's FK-join syntax and works even when the FK is nullable.
    const { data: consults, error: cErr } = await supabase
      .from('consultations')
      .select('id')
      .eq('patient_id', patientId)
      .eq('is_practice', practice)
    if (cErr) { console.error('[prescriptions] cErr failed:', cErr); return res.status(500).json({ error: 'Server error' }) }
    const ids = (consults || []).map(c => c.id)
    if (ids.length === 0) return res.status(200).json({ prescriptions: [] })
    const { data, error } = await supabase
      .from('prescriptions')
      .select('*')
      .in('consultation_id', ids)
      .eq('is_practice', practice)
      .order('created_at', { ascending: false })
    if (error) { console.error('[prescriptions] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ prescriptions: data || [] })
  }

  return res.status(400).json({ error: 'Provide id, consultationId, patientId, or filter=pending_approval|pending_count' })
}
