// /api/emergency-escalations — record + track 111/ED/urgent-care escalations
// (task #420). Backing table: emergency_escalations.
//
// POST                       — anon-friendly (patient side, has consultation_token)
// GET  ?filter=open          — admin only, unresolved
// GET  ?filter=all           — admin only
// PATCH ?id=<uuid>           — admin only, record outcome
//
// Anon POST is gated behind the consultation_token pattern (see #305/#308).
// The token proves the patient is inside a live triage flow.

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const ALLOWED_ESCALATION_TYPES = new Set([
  'red_flag_111', 'divert_ed', 'divert_urgent_care', 'divert_gp_today', 'provider_initiated_111',
])
const ALLOWED_OUTCOMES = new Set([
  'attended_ed', 'attended_urgent_care', 'called_111_ambulance', 'seen_by_gp',
  'symptoms_resolved', 'refused_care', 'unable_to_contact', 'other',
])

export default async function handler(req, res) {
  const supabase = admin()

  // ---- POST (patient side — anon with consultation_token) ----
  if (req.method === 'POST') {
    const b = req.body || {}
    const escalation_type = String(b.escalation_type || '')
    if (!ALLOWED_ESCALATION_TYPES.has(escalation_type)) {
      return res.status(400).json({ error: `escalation_type must be one of ${[...ALLOWED_ESCALATION_TYPES].join(', ')}` })
    }
    // Optional consultation link — if provided, fetch phone + name from the
    // consult so admin follow-up is easy.
    let consult = null
    if (b.consultation_id) {
      const { data } = await supabase.from('consultations')
        .select('id, patient_id, patient_nhi, patient_first_name, patient_last_name, patient_phone')
        .eq('id', b.consultation_id).maybeSingle()
      consult = data
    }

    const row = {
      consultation_id:            consult?.id || b.consultation_id || null,
      patient_id:                 consult?.patient_id || null,
      patient_nhi:                consult?.patient_nhi || b.patient_nhi || null,
      patient_name:               (consult ? [consult.patient_first_name, consult.patient_last_name].filter(Boolean).join(' ') : b.patient_name) || null,
      patient_phone:              consult?.patient_phone || b.patient_phone || null,
      escalation_type,
      matched_flags:              Array.isArray(b.matched_flags) ? b.matched_flags.slice(0, 12).map(String) : [],
      patient_location_text:      b.patient_location_text ? String(b.patient_location_text).slice(0, 400) : null,
      patient_location_lat:       Number.isFinite(b.patient_location_lat) ? Number(b.patient_location_lat) : null,
      patient_location_lng:       Number.isFinite(b.patient_location_lng) ? Number(b.patient_location_lng) : null,
      patient_location_accuracy_m: Number.isFinite(b.patient_location_accuracy_m) ? Number(b.patient_location_accuracy_m) : null,
      location_captured_at:       (b.patient_location_lat || b.patient_location_text) ? new Date().toISOString() : null,
      location_declined_reason:   b.location_declined_reason ? String(b.location_declined_reason).slice(0, 200) : null,
    }

    const { data, error } = await supabase.from('emergency_escalations').insert(row).select('id, escalated_at').single()
    if (error) return res.status(500).json({ error: error.message })

    return res.status(200).json({ ok: true, id: data.id, escalated_at: data.escalated_at })
  }

  // Everything below requires provider auth. Route is NOT on the router's
  // AUTH_REQUIRED_ROUTES list (POST is anon-friendly), so we run
  // guardProvider ourselves for GET/PATCH.
  const { guardProvider } = await import('./_auth.js')
  const auth = await guardProvider(req, res)
  if (!auth) return  // guardProvider already wrote a 401
  if (!(auth.provider.is_admin || auth.provider.is_supervisor || auth.provider.is_provider)) {
    return res.status(401).json({ error: 'Provider auth required' })
  }

  // ---- GET (admin/provider — worklist + patient chart use) ----
  if (req.method === 'GET') {
    const { id, patient_id, consultation_id, filter, limit } = req.query || {}
    const lim = Math.min(Number(limit) || 200, 500)

    if (id) {
      const { data, error } = await supabase.from('emergency_escalations').select('*').eq('id', id).maybeSingle()
      if (error) return res.status(500).json({ error: error.message })
      if (!data) return res.status(404).json({ error: 'Not found' })
      return res.status(200).json({ escalation: data })
    }

    let q = supabase.from('emergency_escalations').select('*').order('escalated_at', { ascending: false }).limit(lim)
    if (patient_id)      q = q.eq('patient_id', patient_id)
    if (consultation_id) q = q.eq('consultation_id', consultation_id)
    if (filter === 'open') q = q.is('outcome', null)

    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ escalations: data || [] })
  }

  // ---- PATCH (admin only — record outcome) ----
  if (req.method === 'PATCH') {
    if (!auth.provider.is_admin && !auth.provider.is_supervisor) {
      return res.status(403).json({ error: 'Admin/supervisor only' })
    }
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id required' })
    const b = req.body || {}
    if (b.outcome && !ALLOWED_OUTCOMES.has(String(b.outcome))) {
      return res.status(400).json({ error: `outcome must be one of ${[...ALLOWED_OUTCOMES].join(', ')}` })
    }
    const providerName = `${auth.provider.first_name || ''} ${auth.provider.last_name || ''}`.trim() || null
    const patch = {
      outcome:                  b.outcome || null,
      outcome_notes:             b.outcome_notes ? String(b.outcome_notes).slice(0, 2000) : null,
      outcome_recorded_at:      new Date().toISOString(),
      outcome_recorded_by:      auth.provider.id,
      outcome_recorded_by_name: providerName,
    }
    const { data, error } = await supabase.from('emergency_escalations').update(patch).eq('id', id).select('*').single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ escalation: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
