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
// Columns the client is allowed to PATCH via this endpoint. Anything not on
// this list is silently dropped from the patch. The list captures every
// column legitimately written by provider-side flows (Dashboard, ConsultView,
// NotesCompletion, ProviderNotes, ProviderConsult, ClinicalActionModals,
// Admin, AdminApp). Deliberately excluded: id, created_at, patient_id,
// patient_name/email/phone (identity), payment_intent_id / payment_status
// (billing), acc_claim_number (external identity), consultation_token.
const UPDATE_ALLOWLIST = new Set([
  // Notes & clinical documentation
  'notes_draft', 'notes_final', 'notes_flagged', 'note_generated_at',
  'notes_finalised', 'notes_finalised_at', 'notes_finalised_by', 'note_finalised_by',
  'notes_completed_seconds', 'clinical_notes',
  'transcript', 'summary', 'chief_complaint',
  'diagnosis', 'diagnosis_code', 'icd10_code', 'acc_read_code',
  'mdm_summary', 'plan_summary',
  // Async consult response
  'async_response', 'async_responded_at',
  // Workflow status
  'status', 'work_capacity', 'outcome',
  'provider_id', 'provider_display_name',
  'started_at', 'completed_at', 'consultation_duration_seconds',
  // Vitals + measurements
  'vitals', 'measured_temperature', 'vitals_requested_at',
  // Consultation type (provider may correct e.g. video→phone)
  'consultation_type',
  // Consultation output
  'prescription_issued', 'referral_issued', 'gp_letter_sent_at',
  'return_to_work_date',
  // Room + logistics
  'daily_room_url', 'daily_room_name',
  // Approval / admin
  'acc_approval_status', 'acc_draft', 'acc_reviewed_at', 'acc_reviewer_id',
  'is_acc', 'billing_code', 'payment_amount',
  'recall_completed', 'controlled_medication_mentioned',
  // Pharmacy
  'pharmacy', 'pharmacy_id',
  // Language / accessibility
  'patient_language', 'preferred_language',
  // Two-attempt no-show flow (see supabase-no-show-migration.sql)
  'ring_started_at', 'patient_joined_at', 'cooldown_until',
  'join_attempts', 'join_attempt_history', 'no_show_at',
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

    // ── Supervisor / admin approval + review filters ──────────────────────────
    // Each of these takes optional ?columns=a,b,c so the client can request a
    // narrower projection matching whatever it displays. If omitted the server
    // sends a sensible default that matches the callers currently on prod.
    // Columns that were referenced in code but never migrated into the deployed
    // schema. Strip them from any client-supplied projection so we return
    // meaningful data instead of a 500. Client callers null-coalesce them
    // (`row.payment_amount_nzd || row.payment_amount / 100`) so absence is safe.
    const MISSING_SCHEMA_COLUMNS = new Set([
      'payment_amount_nzd', 'is_acc', 'notes_finalised',
      'acc_draft', 'acc_approval_status',
      'recall_date', 'recall_completed', 'recall_note',
    ])
    const projection = req.query?.columns
      ? String(req.query.columns).split(',').map(c => c.trim())
          .filter(c => c && !MISSING_SCHEMA_COLUMNS.has(c)).join(', ')
      : null

    // NOTE: acc_pending / acc_pending_count filter on `acc_approval_status`
    // and default-project `acc_draft` — both columns do not exist in the
    // deployed schema (the ACC approval flow was planned but never migrated
    // in). Return empty gracefully instead of surfacing a Postgres error;
    // switch to a real query if/when acc_approval_status ships.
    if (filter === 'acc_pending') {
      return res.status(200).json({ consultations: [] })
    }

    if (filter === 'acc_pending_count') {
      return res.status(200).json({ count: 0 })
    }

    if (filter === 'notes_flagged') {
      const cols = projection || '*'
      const { data, error } = await supabase
        .from('consultations')
        .select(cols)
        .eq('notes_flagged', true)
        .order('created_at', { ascending: false })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ consultations: data || [] })
    }

    // Recent consults (all statuses) — analytics panel.
    if (filter === 'recent') {
      // payment_amount_nzd is a planned column that was never migrated in;
      // drop from default projection. Client callers that reference it fall
      // back to payment_amount safely.
      const cols = projection || 'id, created_at, completed_at, patient_first_name, patient_last_name, patient_nhi, chief_complaint, status, payment_amount, acc_eligible, acc_read_code, consultation_duration_seconds'
      const limit = Math.max(1, Math.min(500, parseInt(req.query?.limit) || 100))
      const { data, error } = await supabase
        .from('consultations').select(cols)
        .order('created_at', { ascending: false }).limit(limit)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ consultations: data || [] })
    }

    // Consults with a payment_intent but not yet complete — billing follow-up panel.
    if (filter === 'payment_pending') {
      const cols = projection || 'id, created_at, patient_first_name, patient_last_name, payment_amount, payment_intent_id, status'
      const { data, error } = await supabase
        .from('consultations').select(cols)
        .not('payment_intent_id', 'is', null)
        .neq('status', 'complete')
        .order('created_at', { ascending: false })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ consultations: data || [] })
    }

    // Rated consults — ratings panel.
    if (filter === 'rated') {
      const cols = projection || 'id, patient_first_name, patient_last_name, provider_display_name, rating, rating_comment, rated_at, created_at'
      const { data, error } = await supabase
        .from('consultations').select(cols)
        .not('rating', 'is', null)
        .order('rated_at', { ascending: false })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ consultations: data || [] })
    }

    // Recalls waiting for follow-up. recall_date / recall_completed / recall_note
    // are planned columns that were never migrated in — return empty gracefully.
    if (filter === 'recall_pending') {
      return res.status(200).json({ consultations: [] })
    }

    // All complete consults — supervisor review of closed consults.
    if (filter === 'all_complete') {
      const cols = projection || 'id, created_at, patient_first_name, patient_last_name, chief_complaint, acc_eligible, notes_flagged, notes_finalised, notes_finalised_at, notes_draft, clinical_notes, outcome, follow_up_days'
      const limit = Math.max(1, Math.min(500, parseInt(req.query?.limit) || 200))
      const { data, error } = await supabase
        .from('consultations').select(cols)
        .eq('status', 'complete')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ consultations: data || [] })
    }

    // Message-type consults in queue (async workload panel).
    if (filter === 'message_pending') {
      const cols = projection || '*'
      const { data, error } = await supabase
        .from('consultations').select(cols)
        .eq('consultation_type', 'message')
        .in('status', ['waiting', 'in_progress'])
        .order('created_at', { ascending: true })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ consultations: data || [] })
    }

    // Provider's own completed consults in a date range (ProviderEarnings).
    // Non-admin callers can only see their own; admins may pass ?providerId=<uuid>.
    if (filter === 'provider_period') {
      const wantId = req.query?.providerId || auth.provider.id
      if (wantId !== auth.provider.id && !auth.provider.is_admin) {
        return res.status(403).json({ error: 'Cannot query another provider\'s consults' })
      }
      const start = req.query?.start
      const end   = req.query?.end
      const cols = projection || 'id, created_at, patient_first_name, patient_last_name, consultation_type'
      let q = supabase.from('consultations').select(cols).eq('status', 'complete').eq('provider_id', wantId)
      if (start) q = q.gte('created_at', String(start))
      if (end)   q = q.lte('created_at', String(end))
      q = q.order('created_at', { ascending: false })
      const { data, error } = await q
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ consultations: data || [] })
    }

    // Research-consented complete consults (AdminApp research panel).
    if (filter === 'research_consented') {
      const cols = projection || 'id, created_at, patient_dob, patient_location, acc_eligible, chief_complaint, consultation_type, consultation_duration_seconds, work_capacity'
      const { data, error } = await supabase
        .from('consultations')
        .select(cols)
        .eq('research_consent', true)
        .eq('status', 'complete')
        .order('created_at', { ascending: false })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ consultations: data || [] })
    }

    // ACC provider conversions that were subsequently flagged (admin safety review)
    if (filter === 'acc_converted_flagged') {
      const cols = projection || 'id, patient_first_name, patient_last_name, acc_converted_at, acc_injury_details, acc_body_part, acc_read_code, notes_flagged, acc_converted_by'
      const limit = Math.max(1, Math.min(200, parseInt(req.query?.limit) || 20))
      const { data, error } = await supabase
        .from('consultations')
        .select(cols)
        .eq('acc_converted_by_provider', true)
        .eq('notes_flagged', true)
        .order('acc_converted_at', { ascending: false })
        .limit(limit)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ consultations: data || [] })
    }

    if (filter === 'notes_flagged_count') {
      const { count, error } = await supabase
        .from('consultations')
        .select('id', { count: 'exact', head: true })
        .eq('notes_flagged', true)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ count: count || 0 })
    }

    if (filter === 'complete_count') {
      const { count, error } = await supabase
        .from('consultations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'complete')
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ count: count || 0 })
    }

    // Today's complete consults for the provider dashboard summary.
    // ?since=<iso> lets the caller pick the day-start (usually midnight local).
    if (filter === 'complete_today' || filter === 'complete_since') {
      const since = req.query?.since || new Date(new Date().setHours(0,0,0,0)).toISOString()
      const cols = projection || 'id, status, consultation_type, payment_amount, created_at, patient_first_name, patient_last_name, chief_complaint, acc_claim_number, acc_claim_status, outcome'
      const { data, error } = await supabase
        .from('consultations')
        .select(cols)
        .eq('status', 'complete')
        .gte('created_at', String(since))
        .order('created_at', { ascending: false })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ consultations: data || [] })
    }

    // Notes work: consults that finished the video but need clinical note completion.
    if (filter === 'pending_notes') {
      const cols = projection || 'id, created_at, patient_first_name, patient_last_name, chief_complaint, acc_eligible'
      const limit = Math.max(1, Math.min(200, parseInt(req.query?.limit) || 50))
      const { data, error } = await supabase
        .from('consultations')
        .select(cols)
        .eq('status', 'complete')
        .eq('notes_finalised', false)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ consultations: data || [] })
    }

    // Notes work: consults that are fully closed out (for the dashboard history).
    if (filter === 'completed_notes') {
      const cols = projection || 'id, created_at, patient_first_name, patient_last_name, chief_complaint, notes_finalised_at, outcome, note_finalised_by, prescription_issued, referral_issued'
      const limit = Math.max(1, Math.min(200, parseInt(req.query?.limit) || 50))
      const { data, error } = await supabase
        .from('consultations')
        .select(cols)
        .eq('status', 'complete')
        .eq('notes_finalised', true)
        .order('notes_finalised_at', { ascending: false })
        .limit(limit)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ consultations: data || [] })
    }

    // Employer usage report: consults billed against a given employer within a
    // date range. Provider must be admin (enforced via the endpoint's guard).
    if (filter === 'by_employer') {
      const { employerId, since } = req.query || {}
      if (!employerId) return res.status(400).json({ error: 'employerId query param required' })
      const cols = projection || 'patient_first_name, patient_last_name, created_at, consultation_type, billing_code'
      let q = supabase.from('consultations').select(cols).eq('employer_id', String(employerId))
      if (since) q = q.gte('created_at', String(since))
      const { data, error } = await q
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ consultations: data || [] })
    }

    return res.status(400).json({ error: 'Provide id, patientId, or filter=active|waitlist|acc_pending|acc_pending_count|notes_flagged|notes_flagged_count|complete_count|complete_today|complete_since|pending_notes|completed_notes|by_employer' })
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
