// PATCH /api/radiology-referrals?id=<uuid> — provider-auth referral updates.
//
// Client (Admin.jsx radiology tracker) updates referral_status, result_notes,
// and result_received_at as results come back. Column allowlist rejects
// anything else (patient_id, provider_id, ordered_at, etc — those are set at
// creation and shouldn't be tampered with).

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const UPDATE_ALLOWLIST = new Set([
  'referral_status',
  'result_notes',
  'result_received_at',
])

const STATUS_ALLOWED = new Set([
  'pending', 'sent', 'result_received', 'dna', 'cancelled',
])

// Columns safe to select from the client. All are provider-visible fields;
// the point of the allowlist is to reject clever `columns=*` scraping and to
// let us evolve the schema without leaking new PHI columns automatically.
const READ_ALLOWLIST = new Set([
  'id', 'created_at', 'updated_at',
  'consultation_id', 'provider_id',
  'patient_name', 'patient_dob',
  'investigation', 'urgency',
  'clinical_details', 'clinical_indication',
  'referral_status', 'approval_status',
  'drafted_by_name', 'provider_name',
  'result_notes', 'result_received_at',
])

function projectColumns(raw) {
  if (!raw) return '*'
  const cols = String(raw).split(',').map(s => s.trim()).filter(Boolean)
  const safe = cols.filter(c => READ_ALLOWLIST.has(c))
  return safe.length ? safe.join(',') : 'id'
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { filter, provider_id, columns, count } = req.query || {}
    const admin_client = admin()
    const wantCount = count === '1' || count === 'true'

    let q = wantCount
      ? admin_client.from('radiology_referrals').select('id', { count: 'exact', head: true })
      : admin_client.from('radiology_referrals').select(projectColumns(columns))

    if (filter === 'active') {
      q = q.not('referral_status', 'eq', 'result_received').not('referral_status', 'eq', 'dna')
    } else if (filter === 'pending_approval') {
      q = q.eq('approval_status', 'pending_approval')
    } else if (filter) {
      return res.status(400).json({ error: `Unknown filter "${filter}"` })
    }

    if (provider_id) q = q.eq('provider_id', provider_id)
    if (!wantCount) q = q.order('created_at')

    const { data, count: countVal, error } = await q
    if (error) return res.status(500).json({ error: error.message })
    if (wantCount) return res.status(200).json({ count: countVal || 0 })
    return res.status(200).json({ referrals: data || [] })
  }

  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

  const { id } = req.query || {}
  if (!id) return res.status(400).json({ error: 'id query param required' })

  const raw = req.body || {}
  const patch = {}
  for (const [k, v] of Object.entries(raw)) {
    if (UPDATE_ALLOWLIST.has(k)) patch[k] = v
  }
  if ('referral_status' in patch && !STATUS_ALLOWED.has(patch.referral_status)) {
    return res.status(400).json({ error: `referral_status "${patch.referral_status}" not allowed` })
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No allowed columns in patch' })
  }

  const supabase = admin()
  const { error } = await supabase
    .from('radiology_referrals')
    .update(patch)
    .eq('id', id)
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true })
}
