// /api/cgm-meetings — CGM + peer-review + M&M meeting minutes log (#427).
// Admin/supervisor only. Regulator-facing evidence-of-operation.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } })
}

const ALLOWED_TYPES = new Set(['clinical_governance','peer_review','morbidity_mortality','incident_review','audit_review','other'])
const CREATE_FIELDS = new Set(['meeting_type','meeting_at','duration_minutes','chair_name','attendees','agenda','minutes','actions_noted','related_incident_ids','next_meeting_due_at'])
const MIN_MINUTES_CHARS = 200

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  if (!auth.provider.is_admin && !auth.provider.is_supervisor) {
    return res.status(403).json({ error: 'Admin/supervisor only' })
  }
  const supabase = admin()

  if (req.method === 'GET') {
    const { meeting_type, limit } = req.query || {}
    let q = supabase.from('cgm_meetings').select('*').order('meeting_at', { ascending: false }).limit(Math.min(Number(limit) || 100, 500))
    if (meeting_type) q = q.eq('meeting_type', meeting_type)
    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })

    // Cadence status per meeting_type — days since last meeting, days until
    // next due. Frontend renders the "overdue" banner from these.
    const byType = {}
    for (const m of (data || [])) {
      if (!byType[m.meeting_type]) byType[m.meeting_type] = { last_at: m.meeting_at, next_due_at: m.next_meeting_due_at }
    }
    const cadence = {}
    for (const [t, s] of Object.entries(byType)) {
      const days_since = Math.floor((Date.now() - new Date(s.last_at).getTime()) / 86400000)
      const days_until_due = s.next_due_at ? Math.floor((new Date(s.next_due_at).getTime() - Date.now()) / 86400000) : null
      cadence[t] = { last_at: s.last_at, next_due_at: s.next_due_at, days_since, days_until_due, overdue: days_until_due != null && days_until_due < 0 }
    }
    return res.status(200).json({ meetings: data || [], cadence })
  }

  if (req.method === 'POST') {
    const b = req.body || {}
    const patch = {}
    for (const [k, v] of Object.entries(b)) if (CREATE_FIELDS.has(k)) patch[k] = v
    if (!ALLOWED_TYPES.has(patch.meeting_type)) return res.status(400).json({ error: `meeting_type must be one of ${[...ALLOWED_TYPES].join(', ')}` })
    if (!patch.meeting_at) return res.status(400).json({ error: 'meeting_at required' })
    if (!patch.minutes || String(patch.minutes).length < MIN_MINUTES_CHARS) return res.status(400).json({ error: `minutes required (≥ ${MIN_MINUTES_CHARS} chars)` })
    patch.chair_provider_id      = auth.provider.id
    patch.chair_name             = patch.chair_name || `${auth.provider.first_name || ''} ${auth.provider.last_name || ''}`.trim() || null
    patch.created_by_provider_id = auth.provider.id

    const { data, error } = await supabase.from('cgm_meetings').insert(patch).select('*').single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ meeting: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
