// GET /api/patient-funnel — admin funnel analytics.
//
// Query params:
//   ?hours=<n>   Time window (default 24, max 720 / 30 days)
//   ?session_id= Drill down to a single session's event trail
//
// Returns:
//   {
//     window_hours,
//     event_counts:      [{ event_name, count }],
//     path_counts:       [{ path, count, unique_sessions }],
//     drop_off:          [{ from_path, to_path, sessions_at_from, sessions_at_to, drop_pct }],
//     session_events?:   [ ...raw events for session_id ]
//   }
//
// Admin-gated (see AUTH_REQUIRED_ROUTES in handler.js).

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Canonical patient-flow order — used to compute step-to-step drop-off.
// Anything not in this list is included in event/path counts but skipped
// in the ordered drop-off funnel.
const FUNNEL_ORDER = [
  '/triage',
  '/consent',
  '/consultation-type',
  '/payment',
  '/waiting',
  '/vitals',
  '/call',
  '/done',
]

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const hours = Math.min(720, Math.max(1, Number(req.query.hours) || 24))
  const sessionId = req.query.session_id ? String(req.query.session_id) : null
  const windowStart = new Date(Date.now() - hours * 3600 * 1000).toISOString()
  const supabase = admin()

  // Session drill-down — full event trail sorted oldest first, useful for
  // "why did this patient bail?" investigations.
  if (sessionId) {
    const { data, error } = await supabase.from('patient_funnel_events')
      .select('event_name, path, meta, consultation_id, created_at')
      .eq('session_id', sessionId)
      .gte('created_at', windowStart)
      .order('created_at', { ascending: true })
      .limit(500)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ window_hours: hours, session_events: data || [] })
  }

  const { data: rows, error } = await supabase.from('patient_funnel_events')
    .select('event_name, path, session_id')
    .gte('created_at', windowStart)
    .limit(20000)
  if (error) return res.status(500).json({ error: error.message })

  // Aggregate in-memory — dataset is small (thousands, not millions).
  const eventCounts = new Map()
  const pathCounts = new Map()          // path → { count, sessions:Set }
  const sessionPaths = new Map()        // session_id → Set(paths)
  for (const r of rows || []) {
    eventCounts.set(r.event_name, (eventCounts.get(r.event_name) || 0) + 1)
    if (r.path) {
      if (!pathCounts.has(r.path)) pathCounts.set(r.path, { count: 0, sessions: new Set() })
      const rec = pathCounts.get(r.path)
      rec.count += 1
      if (r.session_id) rec.sessions.add(r.session_id)
      if (r.session_id) {
        if (!sessionPaths.has(r.session_id)) sessionPaths.set(r.session_id, new Set())
        sessionPaths.get(r.session_id).add(r.path)
      }
    }
  }

  // Ordered funnel drop-off — count how many sessions hit each step, and
  // the % that fell off between adjacent steps in FUNNEL_ORDER.
  const dropOff = []
  for (let i = 0; i < FUNNEL_ORDER.length - 1; i++) {
    const from = FUNNEL_ORDER[i]
    const to = FUNNEL_ORDER[i + 1]
    let atFrom = 0, atTo = 0
    for (const paths of sessionPaths.values()) {
      if ([...paths].some(p => p === from || p.startsWith(`${from}/`))) atFrom++
      if ([...paths].some(p => p === to || p.startsWith(`${to}/`))) atTo++
    }
    const dropPct = atFrom > 0 ? Math.round(((atFrom - atTo) / atFrom) * 100) : 0
    dropOff.push({ from_path: from, to_path: to, sessions_at_from: atFrom, sessions_at_to: atTo, drop_pct: dropPct })
  }

  const event_counts = [...eventCounts.entries()]
    .map(([event_name, count]) => ({ event_name, count }))
    .sort((a, b) => b.count - a.count)

  const path_counts = [...pathCounts.entries()]
    .map(([path, rec]) => ({ path, count: rec.count, unique_sessions: rec.sessions.size }))
    .sort((a, b) => b.count - a.count)

  return res.status(200).json({
    window_hours: hours,
    total_events: rows?.length || 0,
    total_sessions: sessionPaths.size,
    event_counts,
    path_counts,
    drop_off: dropOff,
  })
}
