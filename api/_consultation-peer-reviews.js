// /api/consultation-peer-reviews — admin CRUD on consultation_peer_reviews (task #370).
//
// GET  ?consultation_id=X  → reviews for a consult
// GET  ?filter=sample&n=10 → pick N random ACC-billed consults for review
// GET  ?filter=all         → all reviews (admin dashboard)
// POST { consultation_id, agreement, notes, sample_reason }
// DELETE ?id=X

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const ALLOWED_AGREEMENT = new Set(['agree', 'agree_with_comments', 'disagree_minor', 'disagree_major'])

function roleSnapshot(p) {
  if (!p) return null
  if (p.is_billing_admin) return 'billing_admin'
  if (p.is_supervisor)    return 'supervisor'
  if (p.is_admin)         return 'admin'
  if (p.is_provider)      return 'provider'
  return null
}

export default async function handler(req, res) {
  const provider = req.auth?.provider
  if (!provider) return res.status(401).json({ error: 'Provider auth required' })
  const role = roleSnapshot(provider)
  const supabase = admin()

  if (req.method === 'GET') {
    const { consultation_id, filter, n } = req.query || {}

    // Sample N random ACC consults that have NOT been peer-reviewed yet.
    if (filter === 'sample') {
      const limit = Math.max(1, Math.min(100, parseInt(n) || 10))
      // Get consults with an acc_claim_number that don't have any peer_review yet.
      const { data: candidates } = await supabase.from('consultations')
        .select('id, created_at, patient_first_name, patient_last_name, patient_nhi, chief_complaint, acc_read_code, acc_body_part, acc_claim_number, provider_display_name, doctor_notes')
        .not('acc_claim_number', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200)
      const consultIds = (candidates || []).map(c => c.id)
      if (!consultIds.length) return res.status(200).json({ sample: [] })
      // Find which ones already have a review.
      const { data: reviewed } = await supabase.from('consultation_peer_reviews')
        .select('consultation_id').in('consultation_id', consultIds)
      const reviewedSet = new Set((reviewed || []).map(r => r.consultation_id))
      const unreviewed = (candidates || []).filter(c => !reviewedSet.has(c.id))
      // Random sample.
      const shuffled = [...unreviewed].sort(() => Math.random() - 0.5).slice(0, limit)
      return res.status(200).json({ sample: shuffled, unreviewed_pool_size: unreviewed.length })
    }

    if (filter === 'all') {
      const { data } = await supabase.from('consultation_peer_reviews')
        .select('*').order('reviewed_at', { ascending: false }).limit(200)
      return res.status(200).json({ reviews: data || [] })
    }

    if (consultation_id) {
      const { data } = await supabase.from('consultation_peer_reviews')
        .select('*').eq('consultation_id', consultation_id).order('reviewed_at', { ascending: false })
      return res.status(200).json({ reviews: data || [] })
    }
    return res.status(400).json({ error: 'filter=sample|all or consultation_id required' })
  }

  if (req.method === 'POST') {
    if (!['admin', 'supervisor'].includes(role)) return res.status(403).json({ error: 'Admin or supervisor role required' })
    const { consultation_id, agreement, notes, sample_reason } = req.body || {}
    if (!consultation_id) return res.status(400).json({ error: 'consultation_id required' })
    if (!agreement || !ALLOWED_AGREEMENT.has(agreement)) return res.status(400).json({ error: `agreement must be one of: ${[...ALLOWED_AGREEMENT].join(', ')}` })
    const { data, error } = await supabase.from('consultation_peer_reviews').insert({
      consultation_id,
      reviewer_id:   provider.id,
      reviewer_name: `${provider.first_name || ''} ${provider.last_name || ''}`.trim() || null,
      agreement,
      notes:         notes ? String(notes).slice(0, 4000) : null,
      sample_reason: sample_reason || 'random_sample',
    }).select('*').maybeSingle()
    if (error) { console.error('[consultation-peer-reviews] insert failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ review: data })
  }

  if (req.method === 'DELETE') {
    if (role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'id required' })
    const { error } = await supabase.from('consultation_peer_reviews').delete().eq('id', id)
    if (error) { console.error('[consultation-peer-reviews] delete failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
