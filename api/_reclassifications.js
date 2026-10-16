// GET /api/reclassifications
//
// Lists all consults where the provider declined the triage-flagged ACC
// (acc_provider_declined_at IS NOT NULL). Powers the admin Reclassifications
// tab. Enriches each row with provider name + patient first name for the
// list view; everything else stays on the consult detail page.
//
// Query params:
//   status  — pending | paid | waived | deferred | all (default: all)
//   limit   — default 100, max 500

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const status = String(req.query.status || 'all').toLowerCase()
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100))

  const supabase = admin()

  const cols = [
    'id', 'created_at', 'completed_at',
    'patient_first_name', 'patient_name', 'patient_nhi', 'patient_email',
    'provider_id', 'provider_display_name',
    'acc_provider_declined_at', 'acc_provider_declined_by', 'acc_provider_decline_reason',
    'acc_decline_top_up_status', 'acc_decline_top_up_amount_cents',
    'acc_decline_top_up_session_id', 'acc_decline_top_up_sent_at',
    'acc_decline_top_up_paid_at',
    'payment_amount',
  ].join(',')

  let q = supabase.from('consultations')
    .select(cols)
    .not('acc_provider_declined_at', 'is', null)
    .order('acc_provider_declined_at', { ascending: false })
    .limit(limit)

  if (status === 'pending' || status === 'paid' || status === 'waived' || status === 'deferred') {
    q = q.eq('acc_decline_top_up_status', status)
  }

  const { data, error } = await q
  if (error) {
    console.error('[reclassifications] query failed:', error)
    return res.status(500).json({ error: 'Failed to load reclassifications' })
  }

  // Enrich with declining provider name (second query for the unique IDs
  // only — faster than a join when the list is small).
  const providerIds = [...new Set((data || []).map(r => r.acc_provider_declined_by).filter(Boolean))]
  let providerMap = {}
  if (providerIds.length) {
    const { data: provs } = await supabase.from('providers')
      .select('id, first_name, last_name').in('id', providerIds)
    providerMap = Object.fromEntries((provs || []).map(p => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.id]))
  }

  const rows = (data || []).map(r => ({
    ...r,
    declined_by_name: providerMap[r.acc_provider_declined_by] || null,
  }))

  return res.status(200).json({ ok: true, rows, count: rows.length })
}
