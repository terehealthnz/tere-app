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

export default async function handler(req, res) {
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
