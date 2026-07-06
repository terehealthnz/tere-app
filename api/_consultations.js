// GET/PATCH /api/consultations — server-mediated gateway for provider-side
// consultation reads and writes. Runs with service_role, requires an
// authenticated provider (Supabase JWT via Authorization header).
//
// GET   /api/consultations?id=<uuid>            → single consultation row
// GET   /api/consultations?filter=active        → active queue rows
// GET   /api/consultations?filter=queue         → same as active, alias
// GET   /api/consultations?patientId=<uuid>     → recent consults for a patient
// PATCH /api/consultations?id=<uuid>            → arbitrary column update, with
//                                                 an allowlist to prevent
//                                                 tampering with billing /
//                                                 payment / auth columns
//
// Patient-facing consultation views (via consultation_tokens) go through a
// separate token-verified endpoint — this one is provider-only.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Columns the client is allowed to update via this endpoint. Anything not on
// the list is silently dropped from the patch to prevent providers (or a
// compromised client) from mutating auth / billing / audit columns directly.
const UPDATE_ALLOWLIST = new Set([
  // Notes & clinical documentation
  'notes_draft', 'notes_final', 'notes_flagged', 'note_generated_at',
  'transcript', 'summary', 'chief_complaint',
  'diagnosis', 'diagnosis_code', 'icd10_code', 'acc_read_code',
  'mdm_summary', 'plan_summary',
  // Workflow status
  'status', 'work_capacity',
  'provider_id', 'provider_display_name',
  // Vitals + measurements
  'vitals', 'measured_temperature',
  // Consultation output
  'prescription_issued', 'referral_issued', 'gp_letter_sent_at',
  // Room + logistics
  'daily_room_url', 'daily_room_name',
  // Approval / admin
  'acc_approval_status', 'acc_reviewed_at', 'acc_reviewer_id',
  'recall_completed', 'controlled_medication_mentioned',
  // Pharmacy
  'pharmacy_id',
])

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return

  const supabase = admin()

  if (req.method === 'GET') {
    const { id, filter, patientId } = req.query || {}

    if (id) {
      const { data, error } = await supabase.from('consultations').select('*').eq('id', id).maybeSingle()
      if (error) return res.status(500).json({ error: error.message })
      if (!data) return res.status(404).json({ error: 'Consultation not found' })
      return res.status(200).json({ consultation: data })
    }

    if (patientId) {
      const { data, error } = await supabase
        .from('consultations')
        .select('id, created_at, chief_complaint, notes_final, acc_read_code, icd10_code, work_capacity, status, consultation_type, provider_display_name, gp_letter_sent_at, prescription_issued, referral_issued')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ consultations: data || [] })
    }

    if (filter === 'active' || filter === 'queue') {
      const { data, error } = await supabase
        .from('consultations')
        .select('*')
        .in('status', ['waiting', 'vitals_requested', 'vitals_complete', 'ready', 'in_progress'])
        .order('created_at', { ascending: true })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ consultations: data || [] })
    }

    if (filter === 'waitlist') {
      const { data, error } = await supabase
        .from('consultations')
        .select('id, patient_first_name, patient_last_name, patient_email, patient_phone, created_at')
        .eq('status', 'waitlisted')
        .order('created_at', { ascending: true })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ consultations: data || [] })
    }

    return res.status(400).json({ error: 'Provide id, patientId, or filter=active|waitlist' })
  }

  if (req.method === 'POST') {
    const { action } = req.query || {}
    if (action === 'mark-waitlist-notified') {
      // Called by admin after emailing the entire waitlist to promote them into
      // the active queue. Bulk operation — no per-row body needed.
      const { error } = await supabase
        .from('consultations')
        .update({ status: 'waiting', updated_at: new Date().toISOString() })
        .eq('status', 'waitlisted')
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }
    return res.status(400).json({ error: 'Unknown POST action (supported: mark-waitlist-notified)' })
  }

  if (req.method === 'PATCH') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id query param is required' })

    const raw = req.body || {}
    const patch = {}
    for (const [k, v] of Object.entries(raw)) {
      if (UPDATE_ALLOWLIST.has(k)) patch[k] = v
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No allowed columns in patch. Allowed: ' + Array.from(UPDATE_ALLOWLIST).join(', ') })
    }
    patch.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('consultations')
      .update(patch)
      .eq('id', id)
      .select()
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ consultation: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
