// GET /api/hl7-audit — admin read of inbound_hl7_messages for the
// HL7 receive audit surface (task #390).
//
// Filters:
//   patient_nhi — normalises + matches on the extracted patient NHI
//   from / to   — ISO date bounds on received_at
//   limit       — default 200

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const provider = req.auth?.provider
  if (!provider?.is_admin && !provider?.is_billing_admin && !provider?.is_supervisor) {
    return res.status(403).json({ error: 'Admin, billing_admin, or supervisor role required' })
  }

  const { patient_nhi, from, to, limit } = req.query || {}
  const lim = Math.max(1, Math.min(2000, parseInt(limit) || 200))

  const supabase = admin()
  let q = supabase.from('inbound_hl7_messages')
    .select('id, received_at, msh_4_sending_facility, msh_9_message_type, msh_10_control_id, patient_nhi, patient_first_name, patient_last_name, matched_patient_id, filed_to_patient_id, filed_at, env')
    .order('received_at', { ascending: false }).limit(lim)
  if (patient_nhi) q = q.eq('patient_nhi', String(patient_nhi).trim().toUpperCase())
  if (from)        q = q.gte('received_at', from)
  if (to)          q = q.lte('received_at', to)

  const { data, error } = await q
  if (error) {
    if (error.message?.includes('does not exist')) return res.status(200).json({ files: [] })
    console.error('[hl7-audit] failed:', error)
    return res.status(500).json({ error: 'Server error' })
  }

  // Reshape a bit for the audit panel.
  const files = (data || []).map(r => ({
    id:                r.id,
    received_at:       r.received_at,
    sending_facility:  r.msh_4_sending_facility,
    message_type:      r.msh_9_message_type,
    patient_nhi:       r.patient_nhi,
    patient_name:      [r.patient_first_name, r.patient_last_name].filter(Boolean).join(' '),
    status:            r.filed_to_patient_id ? 'filed' : (r.matched_patient_id ? 'matched' : 'unmatched'),
    env:               r.env,
  }))
  return res.status(200).json({ files })
}
