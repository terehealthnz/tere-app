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
import { resolveDataMode } from './_provider-access-gate.js'
import { getClientIp } from './_client-ip.js'

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
  // ACC regulatory extensions (migration 2026-09-03_acc_regulatory_extensions.sql)
  'rehab_plan', 'discharge_summary', 'rtw_status',
  // HDC Right 8 (migration 2026-09-03_hdc_privacy_extras.sql)
  'support_person_present', 'support_person_name',
  // HDC Rights 5(4), 7(2) (migration 2026-09-03_hdc_rights_extensions.sql).
  // interpreter_requested column pre-exists (big-migration.sql).
  'interpreter_requested', 'interpreter_language',
  'capacity_confirmed_at', 'capacity_confirmed_by_self',
])

// Fields to dual-write encrypted alongside their plaintext columns (task #381).
// Value must be serialisable to a text form for pgp_sym_encrypt.
const ENCRYPT_FIELDS = {
  rehab_plan:        { enc: 'rehab_plan_enc',        serialise: (v) => v == null ? null : JSON.stringify(v) },
  discharge_summary: { enc: 'discharge_summary_enc', serialise: (v) => v == null ? null : JSON.stringify(v) },
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return

  // Practice-mode / onboarding-gate scope for all consultation reads/writes.
  const { practice } = resolveDataMode(auth.provider, req)

  // Billing-only role — user has is_billing_admin but no clinical role
  // (not admin, supervisor, or provider). Their view of consultations
  // must have clinical notes / narrative fields redacted so they see
  // billing metadata only (task 119 established billing_admin sub-role;
  // the redaction path wasn't wired then — pen test 2026-08-23 caught it).
  const isBillingOnly = auth.provider.is_billing_admin && !auth.provider.is_admin
    && !auth.provider.is_supervisor && !auth.provider.is_provider
  const CLINICAL_FIELDS_TO_REDACT = [
    'notes_draft', 'notes_final', 'clinical_notes', 'chief_complaint',
    'transcript', 'summary', 'mdm_summary', 'plan_summary',
    'diagnosis', 'diagnosis_code', 'icd10_code',
    'async_response',
  ]
  function redactClinical(row) {
    if (!row || !isBillingOnly) return row
    const clean = { ...row }
    for (const k of CLINICAL_FIELDS_TO_REDACT) {
      if (k in clean) clean[k] = null
    }
    clean.__redacted_for = 'billing_admin'
    return clean
  }
  function redactList(rows) {
    if (!isBillingOnly || !Array.isArray(rows)) return rows
    return rows.map(redactClinical)
  }

  const supabase = admin()

  if (req.method === 'GET') {
    const { id, filter, patientId } = req.query || {}

    if (id) {
      const { data, error } = await supabase.from('consultations').select('*').eq('id', id).eq('is_practice', practice).maybeSingle()
      if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      if (!data) return res.status(404).json({ error: 'Consultation not found' })
      return res.status(200).json({ consultation: redactClinical(data) })
    }

    if (patientId) {
      const { data, error } = await supabase
        .from('consultations')
        .select('id, created_at, chief_complaint, notes_final, acc_read_code, icd10_code, work_capacity, status, consultation_type, provider_display_name, gp_letter_sent_at, prescription_issued, referral_issued, vitals')
        .eq('patient_id', patientId)
        .eq('is_practice', practice)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ consultations: redactList(data || []) })
    }

    if (filter === 'active' || filter === 'queue') {
      const { data, error } = await supabase
        .from('consultations')
        .select('*')
        .in('status', ['waiting', 'vitals_requested', 'vitals_complete', 'ready', 'in_progress'])
        .eq('is_practice', practice)
        .order('created_at', { ascending: true })
      if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ consultations: redactList(data || []) })
    }

    // Admin queue: consultations where the note has been finalised, a GP
    // email is on file, and no GP letter has yet been sent. Admin reviews +
    // approves each send (patient data + consent) before firing the email.
    if (filter === 'pending_gp_letter') {
      const { data, error } = await supabase
        .from('consultations')
        .select('id, created_at, notes_finalised_at, chief_complaint, patient_first_name, patient_last_name, patient_email, patient_nhi, patient_dob, gp_name, gp_clinic, gp_email, provider_display_name, provider_id, notes_final, status')
        .not('notes_finalised_at', 'is', null)
        .not('gp_email', 'is', null)
        .is('gp_letter_sent_at', null)
        .eq('is_practice', practice)
        .order('notes_finalised_at', { ascending: true })
      if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ consultations: redactList(data || []) })
    }

    if (filter === 'waitlist') {
      const { data, error } = await supabase
        .from('consultations')
        .select('id, patient_first_name, patient_last_name, patient_email, patient_phone, created_at')
        .eq('status', 'waitlisted')
        .eq('is_practice', practice)
        .order('created_at', { ascending: true })
      if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ consultations: redactList(data || []) })
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
        .eq('is_practice', practice)
        .order('created_at', { ascending: false })
      if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ consultations: redactList(data || []) })
    }

    // Recent consults (all statuses) — analytics panel.
    // Accepts ?since=<iso> for date-range analytics (VendorSlaMetrics),
    // otherwise defaults to a limit-based recent window.
    if (filter === 'recent') {
      // payment_amount_nzd is a planned column that was never migrated in;
      // drop from default projection. Client callers that reference it fall
      // back to payment_amount safely.
      const cols = projection || 'id, created_at, completed_at, patient_first_name, patient_last_name, patient_nhi, chief_complaint, status, payment_amount, acc_eligible, acc_read_code, consultation_duration_seconds'
      const limit = Math.max(1, Math.min(2000, parseInt(req.query?.limit) || 100))
      let q = supabase
        .from('consultations').select(cols)
        .eq('is_practice', practice)
        .order('created_at', { ascending: false }).limit(limit)
      if (req.query?.since) q = q.gte('created_at', String(req.query.since))
      const { data, error } = await q
      if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ consultations: redactList(data || []) })
    }

    // Consults with a payment_intent but not yet complete — billing follow-up panel.
    if (filter === 'payment_pending') {
      const cols = projection || 'id, created_at, patient_first_name, patient_last_name, payment_amount, payment_intent_id, status'
      const { data, error } = await supabase
        .from('consultations').select(cols)
        .not('payment_intent_id', 'is', null)
        .neq('status', 'complete')
        .eq('is_practice', practice)
        .order('created_at', { ascending: false })
      if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ consultations: redactList(data || []) })
    }

    // Rated consults — ratings panel.
    if (filter === 'rated') {
      const cols = projection || 'id, patient_first_name, patient_last_name, provider_display_name, rating, rating_comment, rated_at, created_at'
      const { data, error } = await supabase
        .from('consultations').select(cols)
        .not('rating', 'is', null)
        .eq('is_practice', practice)
        .order('rated_at', { ascending: false })
      if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ consultations: redactList(data || []) })
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
        .eq('is_practice', practice)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ consultations: redactList(data || []) })
    }

    // Message-type consults in queue (async workload panel).
    if (filter === 'message_pending') {
      const cols = projection || '*'
      const { data, error } = await supabase
        .from('consultations').select(cols)
        .eq('consultation_type', 'message')
        .in('status', ['waiting', 'in_progress'])
        .eq('is_practice', practice)
        .order('created_at', { ascending: true })
      if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ consultations: redactList(data || []) })
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
      let q = supabase.from('consultations').select(cols).eq('status', 'complete').eq('provider_id', wantId).eq('is_practice', practice)
      if (start) q = q.gte('created_at', String(start))
      if (end)   q = q.lte('created_at', String(end))
      q = q.order('created_at', { ascending: false })
      const { data, error } = await q
      if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ consultations: redactList(data || []) })
    }

    // Research-consented complete consults (AdminApp research panel).
    if (filter === 'research_consented') {
      const cols = projection || 'id, created_at, patient_dob, patient_location, acc_eligible, chief_complaint, consultation_type, consultation_duration_seconds, work_capacity'
      const { data, error } = await supabase
        .from('consultations')
        .select(cols)
        .eq('research_consent', true)
        .eq('status', 'complete')
        .eq('is_practice', practice)
        .order('created_at', { ascending: false })
      if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ consultations: redactList(data || []) })
    }

    // ACC provider conversions that were subsequently flagged (admin safety review).
    // Fail-soft: if any of the acc_converted_* columns aren't in the current
    // schema (migration not yet run), return an empty list rather than 500 —
    // the panel gracefully renders "no flagged conversions" instead of
    // crashing the admin overview.
    if (filter === 'acc_converted_flagged') {
      const cols = projection || 'id, patient_first_name, patient_last_name, acc_converted_at, acc_injury_details, acc_body_part, acc_read_code, notes_flagged, acc_converted_by'
      const limit = Math.max(1, Math.min(200, parseInt(req.query?.limit) || 20))
      try {
        const { data, error } = await supabase
          .from('consultations')
          .select(cols)
          .eq('acc_converted_by_provider', true)
          .eq('notes_flagged', true)
          .eq('is_practice', practice)
          .order('acc_converted_at', { ascending: false })
          .limit(limit)
        if (error) {
          console.warn('[acc_converted_flagged] query error, returning []:', error.message)
          return res.status(200).json({ consultations: [], warning: 'query failed' })
        }
        return res.status(200).json({ consultations: redactList(data || []) })
      } catch (e) {
        console.warn('[acc_converted_flagged] threw, returning []:', e.message)
        return res.status(200).json({ consultations: [], warning: 'query threw' })
      }
    }

    if (filter === 'notes_flagged_count') {
      const { count, error } = await supabase
        .from('consultations')
        .select('id', { count: 'exact', head: true })
        .eq('notes_flagged', true)
        .eq('is_practice', practice)
      if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ count: count || 0 })
    }

    if (filter === 'complete_count') {
      const { count, error } = await supabase
        .from('consultations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'complete')
        .eq('is_practice', practice)
      if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
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
        .eq('is_practice', practice)
        .gte('created_at', String(since))
        .order('created_at', { ascending: false })
      if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ consultations: redactList(data || []) })
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
        .eq('is_practice', practice)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ consultations: redactList(data || []) })
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
        .eq('is_practice', practice)
        .order('notes_finalised_at', { ascending: false })
        .limit(limit)
      if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ consultations: redactList(data || []) })
    }

    // Employer usage report: consults billed against a given employer within a
    // date range. Provider must be admin (enforced via the endpoint's guard).
    if (filter === 'by_employer') {
      const { employerId, since } = req.query || {}
      if (!employerId) return res.status(400).json({ error: 'employerId query param required' })
      const cols = projection || 'patient_first_name, patient_last_name, created_at, consultation_type, billing_code'
      let q = supabase.from('consultations').select(cols).eq('employer_id', String(employerId)).eq('is_practice', practice)
      if (since) q = q.gte('created_at', String(since))
      const { data, error } = await q
      if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ consultations: redactList(data || []) })
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
        .eq('is_practice', practice)
      if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
      return res.status(200).json({ ok: true })
    }

    // admin_send_to_queue — admin-initiated queue re-entry for a patient.
    // Two encounter modes: reopen (same encounter, no new charge) and waiver
    // (fresh consult, fee waived by admin — Tere absorbs the patient fee but
    // the provider still gets paid per-consult). Both write an audit_logs row.
    if (action === 'admin_send_to_queue') {
      if (!auth?.provider?.is_admin) return res.status(403).json({ error: 'Admin only' })

      const { patient_id, encounter_type, reason, waiver_reason, notify_patient } = req.body || {}
      if (!patient_id) return res.status(400).json({ error: 'patient_id required' })
      if (!['reopen', 'waiver'].includes(encounter_type)) return res.status(400).json({ error: 'encounter_type must be reopen or waiver' })
      if (!reason || String(reason).trim().length < 2) return res.status(400).json({ error: 'reason required' })

      // Load patient for downstream notification + audit.
      const { data: pt } = await supabase.from('patients').select('id, first_name, last_name, email, phone, nhi').eq('id', patient_id).eq('is_practice', practice).maybeSingle()
      if (!pt) return res.status(404).json({ error: 'Patient not found' })

      const nowIso = new Date().toISOString()
      let resultConsult = null

      if (encounter_type === 'reopen') {
        // 7-day cap: find the most recent completed consult for this patient
        // within the last 7 days. Older encounters cannot be reopened — admin
        // must use the waiver path (fresh consult) instead so clinical records
        // don't blur across episodes of care.
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const { data: recent } = await supabase.from('consultations')
          .select('id, status, completed_at, created_at, notes_final')
          .eq('patient_id', patient_id)
          .eq('is_practice', practice)
          .gte('completed_at', cutoff)
          .order('completed_at', { ascending: false })
          .limit(1)
        const target = (recent || [])[0]
        if (!target) return res.status(400).json({ error: 'No completed consult within the last 7 days — use the waiver (fresh consult) path instead.' })

        const { data: updated, error: uErr } = await supabase.from('consultations')
          .update({
            status:          'waiting',
            reopened_at:     nowIso,
            reopened_by:     auth.provider.id,
            admin_initiated_reason: String(reason).trim().slice(0, 500),
            updated_at:      nowIso,
          })
          .eq('id', target.id)
          .eq('is_practice', practice)
          .select('id, patient_id, patient_first_name, patient_email, patient_phone, patient_nhi')
          .single()
        if (uErr) { console.error('[consultations] uErr failed:', uErr); return res.status(500).json({ error: 'Server error' }) }
        resultConsult = updated
      } else {
        // waiver — fresh consult row with fee_waived=true, admin_initiated=true.
        const { data: created, error: cErr } = await supabase.from('consultations').insert({
          patient_id,
          patient_first_name: pt.first_name,
          patient_last_name:  pt.last_name,
          patient_email:      pt.email,
          patient_phone:      pt.phone,
          patient_nhi:        pt.nhi,
          status:             'waiting',
          chief_complaint:    String(reason).trim().slice(0, 500),
          fee_waived:         true,
          waiver_reason:      String(waiver_reason || reason).trim().slice(0, 200),
          waived_by_provider_id: auth.provider.id,
          waived_at:          nowIso,
          admin_initiated:    true,
          admin_initiated_by: auth.provider.id,
          admin_initiated_reason: String(reason).trim().slice(0, 500),
          payment_amount:     0,
          is_practice:        practice,
        }).select('id, patient_id, patient_first_name, patient_email, patient_phone, patient_nhi').single()
        if (cErr) { console.error('[consultations] cErr failed:', cErr); return res.status(500).json({ error: 'Server error' }) }
        resultConsult = created
      }

      // Audit log — one row per admin queue action.
      try {
        await supabase.from('audit_logs').insert({
          event_type:     'admin_sent_to_queue',
          provider_id:    auth.provider.id,
          provider_name:  [auth.provider.first_name, auth.provider.last_name].filter(Boolean).join(' ') || null,
          provider_role:  'admin',
          consultation_id: resultConsult.id,
          resource_type:  'Consultation',
          resource_id:    resultConsult.id,
          patient_ref:    pt.nhi || pt.id,
          metadata:       { encounter_type, reason: String(reason).trim().slice(0, 500), waiver_reason: waiver_reason || null, notify_patient: !!notify_patient },
          ip:            getClientIp(req),
          user_agent:     req.headers['user-agent'] || null,
        })
      } catch { /* audit failures never block */ }

      // Optional patient notification — email + SMS. Admin can uncheck per-encounter
      // when the follow-up is provider-internal (e.g., "clinician wants to reassess"
      // without patient prompt).
      if (notify_patient && (pt.email || pt.phone)) {
        const APP_URL = process.env.VITE_APP_URL || 'https://terehealth.co.nz'
        const shortReason = String(reason).trim().slice(0, 120)
        const bodyText = `Tere Health has queued you for a follow-up (${shortReason}). A doctor will call you shortly. ${APP_URL}`
        // Fire-and-forget — notification failure does not roll back the queue entry.
        if (pt.email) {
          fetch(`${APP_URL}/api/send-email`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'x-provider-id': auth.provider.id },
            body:    JSON.stringify({
              to:      pt.email,
              subject: `Tere Health — follow-up requested`,
              html:    `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1A2A33">
                <p style="font-size:1.4rem;font-family:Georgia,serif;font-style:italic;color:#0D2B45">Tere Health</p>
                <p>Kia ora ${pt.first_name || 'there'},</p>
                <p>Our team has queued you for a follow-up consultation regarding your recent visit.</p>
                <p><strong>Reason:</strong> ${shortReason}</p>
                <p>A doctor will call you shortly. No further action is needed from you unless we're unable to reach you.</p>
                <p style="color:#6B7280;font-size:.85rem;margin-top:1.5rem">Ngā mihi,<br><strong>Tere Health</strong></p>
              </div>`,
            }),
          }).catch(() => {})
        }
        if (pt.phone) {
          fetch(`${APP_URL}/api/sms`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'x-provider-id': auth.provider.id },
            body:    JSON.stringify({ to: pt.phone, message: bodyText, type: 'admin_followup' }),
          }).catch(() => {})
        }
      }

      return res.status(200).json({ ok: true, consultation_id: resultConsult.id, encounter_type })
    }

    return res.status(400).json({ error: 'Unknown POST action (supported: mark-waitlist-notified, admin_send_to_queue)' })
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

    // Dual-write encrypted variants for the highest-sensitivity ACC fields
    // (task #381). Best-effort — if the key isn't set or the RPC isn't there,
    // encryptPhi returns null and we just skip the enc column.
    for (const [field, { enc, serialise }] of Object.entries(ENCRYPT_FIELDS)) {
      if (field in patch) {
        try {
          const { encryptPhi } = await import('./_phi-crypto.js')
          const plaintext = serialise(patch[field])
          const cipher = plaintext ? await encryptPhi(plaintext) : null
          patch[enc] = cipher
        } catch (e) { console.warn('[consultations] enc field skip:', field, e.message) }
      }
    }
    patch.updated_at = new Date().toISOString()

    // Ownership check — the assigned provider on the consult can PATCH it,
    // admins and supervisors can PATCH any consult. Unclaimed consults
    // (provider_id null) are queue items any provider may pick up. Blocks
    // provider A from tampering with provider B's clinical notes / diagnosis.
    // Pure billing_admin (no clinical role) cannot PATCH anything.
    const isPrivileged = auth.provider.is_admin || auth.provider.is_supervisor
    const isBillingOnly = auth.provider.is_billing_admin && !auth.provider.is_admin
      && !auth.provider.is_supervisor && !auth.provider.is_provider
    if (isBillingOnly) {
      return res.status(403).json({ error: 'Billing role cannot modify clinical records.' })
    }
    if (!isPrivileged) {
      const { data: pre } = await supabase
        .from('consultations')
        .select('provider_id')
        .eq('id', id)
        .eq('is_practice', practice)
        .maybeSingle()
      if (!pre) return res.status(404).json({ error: 'Consultation not found' })
      const owns = pre.provider_id === auth.provider.id || pre.provider_id == null
      if (!owns) return res.status(403).json({ error: 'Not authorised for this consultation.' })
    }

    // Atomic claim guard — when the patch attempts to SET provider_id
    // (i.e. a provider claiming an unclaimed queue item), only allow the
    // UPDATE if the row is still unclaimed. Prevents two providers both
    // reading provider_id=null then both writing their own id — race
    // where the last-write-wins and the losing provider silently thinks
    // they claimed it.
    if (!isPrivileged && 'provider_id' in patch && patch.provider_id === auth.provider.id) {
      const { data: claimed } = await supabase
        .from('consultations')
        .update(patch)
        .eq('id', id)
        .eq('is_practice', practice)
        .or(`provider_id.is.null,provider_id.eq.${auth.provider.id}`)
        .select()
        .maybeSingle()
      if (!claimed) {
        return res.status(409).json({ error: 'Consultation already claimed by another provider.' })
      }
      return res.status(200).json({ consultation: claimed })
    }

    const { data, error } = await supabase
      .from('consultations')
      .update(patch)
      .eq('id', id)
      .eq('is_practice', practice)
      .select()
      .maybeSingle()
    if (error) { console.error('[consultations] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ consultation: redactClinical(data) })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
