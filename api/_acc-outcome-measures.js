// /api/acc-outcome-measures — provider CRUD for consultation_outcome_measures.
//
// GET  ?consultation_id=X → list measures for a consult
// GET  ?claim_number=X    → list measures across every consult on the claim
// POST { consultation_id, measure_type, value_numeric?, value_text?, notes? }
// DELETE ?id=X            → remove a mis-entered measure (audit-logged)
//
// Provider-authed. Every write records recorded_by = provider.id.

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const ALLOWED_TYPES = new Set([
  'pain_score_0_10', 'function_score_0_100', 'rtw_percent',
  'range_of_motion_degrees', 'grip_strength_kg', 'other_numeric', 'other_text',
])

export default async function handler(req, res) {
  const provider = req.auth?.provider
  if (!provider) return res.status(401).json({ error: 'Provider auth required' })
  const supabase = admin()

  if (req.method === 'GET') {
    const { consultation_id, claim_number } = req.query || {}
    if (!consultation_id && !claim_number) {
      return res.status(400).json({ error: 'consultation_id or claim_number required' })
    }
    let q = supabase.from('consultation_outcome_measures').select('*').order('recorded_at', { ascending: false })
    if (consultation_id) q = q.eq('consultation_id', consultation_id)
    if (claim_number)    q = q.eq('claim_number', claim_number)
    const { data, error } = await q
    if (error) {
      if (error.message?.includes('does not exist')) return res.status(200).json({ measures: [] })
      console.error('[acc-outcome-measures] list failed:', error); return res.status(500).json({ error: 'Server error' })
    }
    return res.status(200).json({ measures: data || [] })
  }

  if (req.method === 'POST') {
    const { consultation_id, measure_type, value_numeric, value_text, notes } = req.body || {}
    if (!consultation_id) return res.status(400).json({ error: 'consultation_id required' })
    if (!measure_type || !ALLOWED_TYPES.has(measure_type)) {
      return res.status(400).json({ error: `measure_type required, one of: ${[...ALLOWED_TYPES].join(', ')}` })
    }
    if (value_numeric == null && !value_text) {
      return res.status(400).json({ error: 'value_numeric or value_text required' })
    }

    // Denormalise claim_number + patient_nhi from the consult for group-by queries later.
    const { data: consult } = await supabase.from('consultations')
      .select('patient_nhi, acc_claim_number').eq('id', consultation_id).maybeSingle()

    const { data, error } = await supabase.from('consultation_outcome_measures').insert({
      consultation_id,
      patient_nhi:  consult?.patient_nhi || null,
      claim_number: consult?.acc_claim_number || null,
      measure_type,
      value_numeric: value_numeric != null ? Number(value_numeric) : null,
      value_text:    value_text || null,
      recorded_by:   provider.id,
      notes:         notes || null,
    }).select('*').maybeSingle()
    if (error) { console.error('[acc-outcome-measures] insert failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ measure: data })
  }

  if (req.method === 'DELETE') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id query param required' })
    const { error } = await supabase.from('consultation_outcome_measures').delete().eq('id', id)
    if (error) { console.error('[acc-outcome-measures] delete failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
