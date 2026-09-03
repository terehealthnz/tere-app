// GET /api/disclosures — admin read of disclosure_events (task #391).
//
// Filters:
//   channel     — 'gp_letter_email' | 'hl7_outbound' | 'section_22f_export' | ...
//   patient_nhi — exact match
//   from / to   — ISO date bounds on disclosed_at
//   limit       — default 200, max 2000
//
// Admin/billing_admin/supervisor only.

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function roleSnapshot(p) {
  if (!p) return null
  if (p.is_billing_admin) return 'billing_admin'
  if (p.is_supervisor)    return 'supervisor'
  if (p.is_admin)         return 'admin'
  if (p.is_provider)      return 'provider'
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const provider = req.auth?.provider
  const role = roleSnapshot(provider)
  if (!['admin', 'billing_admin', 'supervisor'].includes(role)) {
    return res.status(403).json({ error: 'Admin, billing_admin, or supervisor role required' })
  }

  const { channel, patient_nhi, from, to, limit } = req.query || {}
  const lim = Math.max(1, Math.min(2000, parseInt(limit) || 200))

  const supabase = admin()
  let q = supabase.from('disclosure_events').select('*').order('disclosed_at', { ascending: false }).limit(lim)
  if (channel)     q = q.eq('channel', channel)
  if (patient_nhi) q = q.eq('patient_nhi', patient_nhi)
  if (from)        q = q.gte('disclosed_at', from)
  if (to)          q = q.lte('disclosed_at', to)

  const { data, error } = await q
  if (error) {
    if (error.message?.includes('does not exist')) return res.status(200).json({ disclosures: [] })
    console.error('[disclosures] failed:', error)
    return res.status(500).json({ error: 'Server error' })
  }
  return res.status(200).json({ disclosures: data || [] })
}
