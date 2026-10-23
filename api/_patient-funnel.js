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
// in the ordered drop-off funnel. Ordered as the real patient journey:
// landing → language → consent → triage → vitals → consult-type → payment
// → waiting → call → done. /work/[slug] bypasses /, /start, /consent for
// employer-rail patients so those sessions land directly at /triage or
// /vitals; they still appear in later steps' session counts.
const FUNNEL_ORDER = [
  '/',
  '/start',
  '/consent',
  '/triage',
  '/vitals',
  '/consultation-type',
  '/payment',
  '/waiting',
  '/call',
  '/done',
]
const FUNNEL_LABELS = {
  '/':                  'Landing',
  '/start':             'Language picker',
  '/consent':           'Consent',
  '/triage':            'Triage chat',
  '/vitals':            'Vitals',
  '/consultation-type': 'Consultation type',
  '/payment':           'Payment',
  '/waiting':           'Waiting room',
  '/call':              'In call',
  '/done':              'Done',
}

// NZT calendar date → UTC ISO at start/end of that day. Matches the
// convention used by /api/consult-funnel so both endpoints answer the
// same date-range picker consistently.
function nzDateRangeToUtc(fromYmd, toYmd) {
  // Pacific/Auckland is UTC+13 (NZDT) or UTC+12 (NZST). We don't track
  // DST ourselves — we construct the local-wall-clock midnight and let
  // Date normalise. Good enough for a 1-day boundary; off-by-one near
  // DST transitions is acceptable for funnel aggregation.
  const start = new Date(`${fromYmd}T00:00:00+13:00`).toISOString()
  const end   = new Date(`${toYmd}T23:59:59+13:00`).toISOString()
  return { start, end }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  // Two modes: ?from=YYYY-MM-DD&to=YYYY-MM-DD (NZT calendar range, matches
  // /api/consult-funnel) or legacy ?hours=N (rolling window). The date
  // range takes precedence when both are present.
  const fromYmd = req.query.from ? String(req.query.from) : null
  const toYmd   = req.query.to   ? String(req.query.to)   : null
  const hours = Math.min(720, Math.max(1, Number(req.query.hours) || 24))
  let windowStart, windowEnd
  if (fromYmd && toYmd && /^\d{4}-\d{2}-\d{2}$/.test(fromYmd) && /^\d{4}-\d{2}-\d{2}$/.test(toYmd)) {
    const r = nzDateRangeToUtc(fromYmd, toYmd)
    windowStart = r.start
    windowEnd   = r.end
  } else {
    windowStart = new Date(Date.now() - hours * 3600 * 1000).toISOString()
    windowEnd   = null
  }
  const sessionId = req.query.session_id ? String(req.query.session_id) : null
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

  let q = supabase.from('patient_funnel_events')
    .select('event_name, path, session_id')
    .gte('created_at', windowStart)
    .limit(20000)
  if (windowEnd) q = q.lte('created_at', windowEnd)
  const { data: rows, error } = await q
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

  // Shaped like /api/consult-funnel's `funnel` field so the admin FunnelPanel
  // can render both from the same component. `reached` = unique sessions that
  // hit this path. `completed_pct` = reached / top-of-funnel sessions. The
  // top of funnel is sessions that hit /, so an employer-rail session that
  // skipped landing won't inflate the top denominator.
  const totalByStep = FUNNEL_ORDER.map(path => {
    let n = 0
    for (const paths of sessionPaths.values()) {
      if ([...paths].some(p => p === path || p.startsWith(`${path}/`))) n++
    }
    return { path, reached: n }
  })
  const topTotal = totalByStep[0]?.reached || 0
  const funnel = totalByStep.map((row, i) => {
    const prev = i > 0 ? totalByStep[i - 1].reached : row.reached
    const dropPct = prev > 0 ? Math.round(((prev - row.reached) / prev) * 100) : 0
    return {
      step: row.path,
      label: FUNNEL_LABELS[row.path] || row.path,
      reached: row.reached,
      completed_pct: topTotal > 0 ? Math.round((row.reached / topTotal) * 100) : 0,
      drop_pct_vs_previous: Math.max(0, dropPct),
    }
  })

  return res.status(200).json({
    window_hours: hours,
    total_events: rows?.length || 0,
    total_sessions: sessionPaths.size,
    total: topTotal,
    event_counts,
    path_counts,
    funnel,
    drop_off: dropOff,
  })
}
