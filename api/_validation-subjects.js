// GET/POST /api/validation-subjects — server-side gateway that replaces direct
// Supabase reads/writes on validation_subjects. Runs with service_role so anon
// policies on the table can be dropped.
//
// GET  → list of subjects enriched with { last_scan_at, reading_count }
// POST → creates a subject from the shape used by saveValidationSubject()
//
// Anon-accessible (patient self-enrolment). The narrow POST allowlist prevents
// scrapers from setting fields the client doesn't collect.
//
// Public-input quarantine (2026-10-19): the POST handler determines `source`
// server-side from auth presence. Logged-in providers → 'authenticated'
// (auto-promoted, feeds training). Anon submissions → 'public_anonymous'
// (quarantined, admin must promote before any training query sees them).
// Clients cannot set source — any client-provided value is ignored.

import { createClient } from '@supabase/supabase-js'
import { requireProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function handler(req, res) {
  const supabase = admin()

  if (req.method === 'GET') {
    const [{ data: subjects, error: e1 }, { data: scans, error: e2 }] = await Promise.all([
      supabase.from('validation_subjects').select('*'),
      supabase.from('validation_readings').select('subject_id, recorded_at').order('recorded_at', { ascending: false }),
    ])
    if (e1) { console.error('[validation-subjects] e1 failed:', e1); return res.status(500).json({ error: 'Server error' }) }
    if (e2) console.warn('[validation-subjects] readings enrichment failed:', e2.message)

    const lastScanMap = {}
    const readingCountMap = {}
    for (const s of (scans || [])) {
      if (!s.subject_id) continue
      if (!lastScanMap[s.subject_id]) lastScanMap[s.subject_id] = s.recorded_at
      readingCountMap[s.subject_id] = (readingCountMap[s.subject_id] || 0) + 1
    }
    const enriched = (subjects || []).map(s => ({
      ...s,
      last_scan_at:  lastScanMap[s.id]    || null,
      reading_count: readingCountMap[s.id] || 0,
    })).sort((a, b) => {
      if (a.last_scan_at && b.last_scan_at) return new Date(b.last_scan_at) - new Date(a.last_scan_at)
      if (a.last_scan_at) return -1
      if (b.last_scan_at) return 1
      return new Date(b.created_at) - new Date(a.created_at)
    })
    return res.status(200).json({ subjects: enriched })
  }

  if (req.method === 'POST') {
    const p = req.body || {}
    if (!p.subjectCode || !p.firstName) {
      return res.status(400).json({ error: 'subjectCode and firstName are required' })
    }

    // Server-side source classification. requireProvider throws when the
    // request has no provider cookie — that's the signal for "anonymous
    // public submission." We swallow the throw and treat it as the normal
    // anon path (the endpoint is intentionally anon-accessible for patient
    // self-enrolment). Any client-set `p.source` is ignored.
    let authedProvider = null
    try {
      const auth = await requireProvider(req)
      authedProvider = auth?.provider || null
    } catch {
      // Normal anon path. Fall through to public_anonymous branch below.
    }

    const source = authedProvider ? 'authenticated' : 'public_anonymous'
    // Authenticated subjects (clinic staff, Patrick self-testing) are
    // auto-promoted so training continues to pick them up without a
    // manual click. Anon subjects stay NULL = pending review.
    const reviewDecision = authedProvider ? 'promoted' : null
    const reviewedAt     = authedProvider ? new Date().toISOString() : null
    const reviewedBy     = authedProvider ? authedProvider.id : null

    // Capture submitter network identifiers on anon submissions so admin
    // review can spot patterns (same IP spamming BP 300, same UA across
    // 50 subjects). Not stored for authenticated submissions — we already
    // know who the provider is from the join.
    const xff = req.headers['x-forwarded-for']
    const submittedIp = authedProvider
      ? null
      : (typeof xff === 'string' ? xff.split(',')[0].trim() : null) ||
        req.socket?.remoteAddress || null
    const submittedUa = authedProvider ? null : (req.headers['user-agent'] || null)

    const { data: subject, error } = await supabase.from('validation_subjects').insert({
      subject_code:            p.subjectCode,
      first_name:              p.firstName,
      age:                     p.age || null,
      sex:                     p.sex || null,
      height_cm:               p.heightCm || null,
      weight_kg:               p.weightKg || null,
      fitzpatrick_scale:       p.fitzpatrickScale || null,
      has_hypertension:        p.hasHypertension || 'unknown',
      has_diabetes:            p.hasDiabetes || 'unknown',
      has_regular_medications: p.hasRegularMedications || false,
      source,
      review_decision:         reviewDecision,
      reviewed_at:             reviewedAt,
      reviewed_by:             reviewedBy,
      submitted_ip:            submittedIp,
      submitted_ua:            submittedUa,
    }).select().single()
    if (error) { console.error('[validation-subjects] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ subject })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
