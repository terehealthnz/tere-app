// GET/POST /api/validation-subjects — server-side gateway that replaces direct
// Supabase reads/writes on validation_subjects. Requires an authenticated
// provider (Supabase JWT via Authorization header). Runs with service_role
// so the anon SELECT policy on validation_subjects can be dropped.
//
// GET  → list of subjects enriched with { last_scan_at, reading_count }
// POST → creates a subject from the shape used by saveValidationSubject()

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

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

  const supabase = admin()

  if (req.method === 'GET') {
    const [{ data: subjects, error: e1 }, { data: scans, error: e2 }] = await Promise.all([
      supabase.from('validation_subjects').select('*'),
      supabase.from('validation_readings').select('subject_id, recorded_at').order('recorded_at', { ascending: false }),
    ])
    if (e1) return res.status(500).json({ error: e1.message })
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
    }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ subject })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
