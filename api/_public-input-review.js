// GET/POST /api/public-input-review — admin surface for the public-input
// quarantine (migration 2026-10-19_public_input_log.sql).
//
// Anonymous /vitals-validate submissions land in validation_subjects with
// source='public_anonymous' and review_decision=NULL. Nothing feeds the BP
// retrain cron until an admin here flips review_decision to 'promoted'.
//
// GET  → list pending subjects (one row per subject) enriched with their
//        readings so the reviewer can eyeball cuff BP + rPPG estimate +
//        subject demographics in one place.
//
// POST → body: { subjectId, action: 'promote' | 'reject', rejectionReason? }
//        promote: one-click, stamps reviewed_at/by + review_decision='promoted'
//        reject:  requires rejectionReason, stamps review_decision='rejected'
//
// Admin-only (is_admin flag). Non-admin providers get 403. Every decision
// writes an audit_log row so we can trace who approved which bad data.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'
import { writeAuditEvent } from './_audit-write.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  if (!auth.provider?.is_admin) {
    return res.status(403).json({ error: 'Admin only' })
  }

  const supabase = admin()

  if (req.method === 'GET') {
    // Pending-review public_anonymous subjects + the readings each has
    // produced. Readings pull is small (one row per subject on the current
    // one-reading-per-person flow) but we fetch them anyway for the UI to
    // show cuff BP, rPPG estimate, submitted_ip for pattern-spotting.
    const { data: subjects, error: sErr } = await supabase
      .from('validation_subjects')
      .select('*')
      .eq('source', 'public_anonymous')
      .is('review_decision', null)
      .order('created_at', { ascending: false })
      .limit(500)
    if (sErr) {
      console.error('[public-input-review] subjects load failed:', sErr)
      return res.status(500).json({ error: 'Server error' })
    }

    const subjectIds = (subjects || []).map(s => s.id)
    let readingsBySubject = {}
    if (subjectIds.length) {
      const { data: readings, error: rErr } = await supabase
        .from('validation_readings')
        .select('id, subject_id, recorded_at, manual_systolic, manual_diastolic, manual_hr, manual_spo2, tere_hr, tere_rr, tere_spo2, tere_systolic, tere_diastolic, hr_confidence, numeric_confidence, raw_rppg_signal')
        .in('subject_id', subjectIds)
        .order('recorded_at', { ascending: false })
      if (rErr) console.warn('[public-input-review] readings join failed:', rErr.message)
      for (const r of (readings || [])) {
        // Strip raw_rppg_signal from the response — it's megabytes per row,
        // not useful for a visual review, and the reviewer can click into
        // the subject in the main dashboard if they want the signal.
        const hasRawRppg = !!r.raw_rppg_signal
        const { raw_rppg_signal, ...slim } = r
        slim.has_raw_rppg = hasRawRppg
        if (!readingsBySubject[r.subject_id]) readingsBySubject[r.subject_id] = []
        readingsBySubject[r.subject_id].push(slim)
      }
    }

    const enriched = (subjects || []).map(s => ({
      ...s,
      readings: readingsBySubject[s.id] || [],
    }))

    return res.status(200).json({ subjects: enriched })
  }

  if (req.method === 'POST') {
    const { subjectId, action, rejectionReason } = req.body || {}
    if (!subjectId) return res.status(400).json({ error: 'subjectId is required' })
    if (!['promote', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'action must be promote or reject' })
    }
    if (action === 'reject') {
      const reason = String(rejectionReason || '').trim()
      if (reason.length < 3) {
        return res.status(400).json({ error: 'rejectionReason is required (≥3 chars) when rejecting' })
      }
    }

    // Pre-check: only decide pending-review public rows. Prevents replay
    // from flipping an already-promoted authenticated subject.
    const { data: current, error: cErr } = await supabase
      .from('validation_subjects')
      .select('id, source, review_decision, first_name, subject_code')
      .eq('id', subjectId)
      .maybeSingle()
    if (cErr) { console.error('[public-input-review] lookup failed:', cErr); return res.status(500).json({ error: 'Server error' }) }
    if (!current)                             return res.status(404).json({ error: 'Subject not found' })
    if (current.source !== 'public_anonymous') return res.status(400).json({ error: 'Subject is not a public submission' })
    if (current.review_decision)              return res.status(409).json({ error: `Subject already ${current.review_decision}` })

    const nowIso = new Date().toISOString()
    const patch = action === 'promote'
      ? { review_decision: 'promoted', reviewed_at: nowIso, reviewed_by: auth.provider.id, rejection_reason: null }
      : { review_decision: 'rejected', reviewed_at: nowIso, reviewed_by: auth.provider.id, rejection_reason: rejectionReason.trim() }

    const { data: updated, error: uErr } = await supabase
      .from('validation_subjects')
      .update(patch)
      .eq('id', subjectId)
      .eq('source', 'public_anonymous')
      .is('review_decision', null)   // double-guard against TOCTOU
      .select()
      .single()
    if (uErr) { console.error('[public-input-review] update failed:', uErr); return res.status(500).json({ error: 'Server error' }) }

    writeAuditEvent(req, auth, {
      event_type:    `public_input.${action}`,
      resource_type: 'validation_subject',
      resource_id:   subjectId,
      metadata: {
        subject_code: current.subject_code,
        first_name:   current.first_name,
        rejection_reason: action === 'reject' ? rejectionReason.trim() : null,
      },
    }).catch(() => {})

    return res.status(200).json({ subject: updated })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
