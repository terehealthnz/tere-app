// GET /api/lab-orders - list outbound lab orders for the provider UI.
// PATCH /api/lab-orders?id=<uuid> - provider-auth updates to status,
// linked_hl7_message_id, and delivery metadata. Creation goes through
// /api/generate-lab-pdf (inserts the row + sends the PDF in one shot).

import { createClient } from '@supabase/supabase-js'
import { resolveDataMode } from './_provider-access-gate.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const UPDATE_ALLOWLIST = new Set([
  'status',
  'linked_hl7_message_id',
  'delivery_status',
  'delivery_error',
])

const STATUS_ALLOWED = new Set([
  'draft', 'sent', 'resulted', 'cancelled',
])

const READ_ALLOWLIST = new Set([
  'id', 'created_at', 'updated_at',
  'consultation_id', 'provider_id', 'patient_id',
  'patient_name', 'patient_nhi', 'patient_dob',
  'tests', 'tests_freetext', 'clinical_info',
  'billing_type', 'urgency',
  'status', 'pdf_url', 'sent_at', 'delivery_status',
  'provider_name', 'linked_hl7_message_id',
])

function projectColumns(raw) {
  if (!raw) return '*'
  const cols = String(raw).split(',').map(s => s.trim()).filter(Boolean)
  const safe = cols.filter(c => READ_ALLOWLIST.has(c))
  return safe.length ? safe.join(',') : 'id'
}

export default async function handler(req, res) {
  const { practice } = resolveDataMode(req.auth?.provider, req)

  if (req.method === 'GET') {
    const { filter, provider_id, patient_id, patient_nhi, consultation_id, status, columns, count } = req.query || {}
    const admin_client = admin()
    const wantCount = count === '1' || count === 'true'

    let q = wantCount
      ? admin_client.from('lab_orders').select('id', { count: 'exact', head: true })
      : admin_client.from('lab_orders').select(projectColumns(columns))

    q = q.eq('is_practice', practice)

    if (filter === 'active') {
      q = q.not('status', 'eq', 'resulted').not('status', 'eq', 'cancelled')
    } else if (filter) {
      return res.status(400).json({ error: `Unknown filter "${filter}"` })
    }

    if (provider_id)      q = q.eq('provider_id', provider_id)
    if (patient_id)       q = q.eq('patient_id', patient_id)
    if (patient_nhi)      q = q.eq('patient_nhi', patient_nhi)
    if (consultation_id)  q = q.eq('consultation_id', consultation_id)
    if (status)           q = q.eq('status', status)
    if (!wantCount)       q = q.order('created_at')

    const { data, count: countVal, error } = await q
    if (error) { console.error('[lab-orders] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    if (wantCount) return res.status(200).json({ count: countVal || 0 })
    return res.status(200).json({ orders: data || [] })
  }

  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

  const { id } = req.query || {}
  if (!id) return res.status(400).json({ error: 'id query param required' })

  const raw = req.body || {}
  const patch = {}
  for (const [k, v] of Object.entries(raw)) {
    if (UPDATE_ALLOWLIST.has(k)) patch[k] = v
  }
  if ('status' in patch && !STATUS_ALLOWED.has(patch.status)) {
    return res.status(400).json({ error: `status "${patch.status}" not allowed` })
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No allowed columns in patch' })
  }

  const supabase = admin()
  const { error } = await supabase
    .from('lab_orders')
    .update(patch)
    .eq('id', id)
    .eq('is_practice', practice)
  if (error) { console.error('[lab-orders] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
  return res.status(200).json({ ok: true })
}
