// GET /api/imaging-reviews — list pending imaging reviews across all providers.
//
// Retrospective QI queue: reviewer receives the radiology report by email
// (outside Tere), then opens the panel here to log their assessment. Any active
// provider can review any referral (peer review, not restricted to the
// ordering clinician). Router applies guardProvider so callers are authed.

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const supabase = admin()
  const { filter } = req.query || {}

  // Default filter is pending; ?filter=all also returns reviewed rows for audit.
  let q = supabase
    .from('imaging_reviews')
    .select(`
      id, referral_id, consultation_id, reviewer_provider_id, reviewer_name,
      decision, comment, reviewed_at, patient_email_sent_at, created_at,
      referral:radiology_referrals!inner(
        id, patient_name, patient_dob, patient_email,
        investigation, body_part, clinical_indication, urgency, history,
        provider_id, provider_name, drafted_by_name,
        facility_name, referral_status, delivery_status, created_at
      )
    `)
    .order('created_at', { ascending: true })

  if (filter !== 'all') {
    q = q.is('reviewed_at', null)
  }

  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })

  // Fetch chief_complaint per consultation in one round trip so the panel can
  // show it without a separate client-side call.
  const consultIds = Array.from(new Set((data || []).map(r => r.consultation_id).filter(Boolean)))
  let complaints = {}
  if (consultIds.length) {
    const { data: consults } = await supabase
      .from('consultations')
      .select('id, chief_complaint, patient_first_name, patient_last_name')
      .in('id', consultIds)
    for (const c of consults || []) complaints[c.id] = c
  }

  const reviews = (data || []).map(r => ({
    ...r,
    consultation: complaints[r.consultation_id] || null,
  }))
  return res.status(200).json({ reviews })
}
