// GET /api/consult-funnel — operations funnel over consultations.
//
// Unlike /api/patient-funnel (which aggregates patient_funnel_events — URL
// pageviews from anon triage sessions, keyed by session_id), this endpoint
// aggregates CONSULTATION rows: the authoritative record of what happened to
// each real patient visit. We use status + the five timestamp milestones to
// classify where each visit stopped.
//
// Query params (two modes — pick one):
//   ?days=<n>              Rolling window in NZT calendar days (default 7, max 90).
//                          Includes today-N+1 through today, each day 00:00-23:59 NZT.
//   ?from=YYYY-MM-DD       Explicit NZT calendar date range (inclusive both ends).
//   &to=YYYY-MM-DD         Max 90 days span. Both must be present if used.
//
// Returns:
//   {
//     window_days,
//     total,
//     funnel:    [{ step, label, reached, completed_pct, drop_pct_vs_previous }],
//     drop_offs: [{ consultation_id, patient_id, patient_name, patient_phone,
//                   patient_email, chief_complaint, created_at, last_step,
//                   hours_since, severity_flag }]
//   }
//
// Severity flag: a cheap keyword match on chief_complaint using the same
// physical-emergency + divert keyword lists as AITriage.jsx (duplicated here
// to keep the endpoint self-contained; small list, low maintenance cost).
// Marks drop-offs where the complaint hints at an acute presentation that
// warrants a rescue call.
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

// Mirror of AITriage.jsx PHYSICAL_EMERGENCY_KEYWORDS + a subset of DIVERT.
// Used to flag chief_complaints on abandoned consults so an admin knows which
// drop-offs need an urgent rescue call (e.g. Jeanne-type presentations where
// the patient had an acute problem, got through triage, bailed at payment).
const SEVERITY_KEYWORDS = [
  // physical
  'chest pain','chest tightness','cant breathe','cannot breathe','difficulty breathing',
  'stroke','face drooping','arm weakness','slurred speech','unconscious','passed out',
  'major bleeding','wont stop bleeding','severe allergic','allergic reaction',
  'throat swelling','anaphylaxis','not breathing','no pulse','seizing','seizure',
  'collapsed','paralysis','crushing','pressure in chest','severe bleeding',
  // divert / in-person
  'baby has a fever','my baby','newborn','infant with fever',
  'testicular pain','sudden severe pain','worst pain','severe abdominal','flank pain',
  'hit my head','concussion','head injury','pregnant and bleeding','reduced movements',
  'baby not moving','broken bone','deep cut','thunderclap','worst headache',
  'new confusion','new numbness','new weakness','new vision loss','sudden weakness',
  // dermatology / allergy severity words AITriage misses today — added here
  // as a flag-only heuristic so the ops dashboard surfaces them even though
  // triage didn't divert
  'blister','blistering','fluid coming out','rash spreading','scalp burn',
  'chemical burn','burn to',
]
function hasSeverityKeyword(text) {
  if (!text) return false
  const lower = String(text).toLowerCase()
  return SEVERITY_KEYWORDS.some(kw => lower.includes(kw))
}

// Which step did the consult reach? Match AdminPatients.jsx:buildJourney but
// server-side so we can aggregate quickly. Order: triage → payment → waiting
// → in_consult → completed. Returns the index of the last reached step.
const STEPS = ['triage', 'payment', 'waiting', 'in_consult', 'completed']
const STEP_LABELS = {
  triage:    'Triage started',
  payment:   'Reached payment',
  waiting:   'Entered waiting room',
  in_consult:'Call started',
  completed: 'Consult completed',
}
const POST_PAY_STATUSES = new Set([
  'waiting','vitals_requested','vitals_complete','ready','in_progress','completed',
])
const TERMINAL_ABANDON = new Set(['draft','payment_pending','abandoned','no_show','expired'])

function classify(c) {
  const status = String(c.status || '').toLowerCase()
  const reached = {
    triage:     !!c.created_at,
    payment:    !!c.payment_amount || POST_PAY_STATUSES.has(status),  // reached the payment screen OR already paid
    paid:       (c.payment_amount && c.payment_amount > 0) || POST_PAY_STATUSES.has(status),
    waiting:    !!c.patient_joined_at || POST_PAY_STATUSES.has(status),
    in_consult: !!c.started_at || status === 'in_progress' || status === 'completed',
    completed:  !!c.completed_at || !!c.notes_finalised_at || status === 'completed',
  }
  // Where did the patient stop?
  let lastReachedIdx = 0
  if (reached.triage)    lastReachedIdx = 0
  if (reached.payment && reached.paid) lastReachedIdx = 1 // paid = past payment
  if (reached.waiting)   lastReachedIdx = 2
  if (reached.in_consult)lastReachedIdx = 3
  if (reached.completed) lastReachedIdx = 4
  const isAbandoned = !reached.completed && TERMINAL_ABANDON.has(status)
  // Payment-page reach without paying = stopped AT payment (step 1)
  if (reached.payment && !reached.paid) lastReachedIdx = 1
  return { lastReachedIdx, isAbandoned, reached, status }
}

// Return "YYYY-MM-DDTHH:mm:ss+NN:00" where offset is Pacific/Auckland's
// current offset at the given UTC moment. Uses Intl API — DST-aware without
// hand-maintaining NZ's transition dates.
function nzIsoAt(ymd, hhmmss) {
  const [y, m, d] = ymd.split('-').map(Number)
  const probe = new Date(Date.UTC(y, m - 1, d, 12))
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Pacific/Auckland', timeZoneName: 'shortOffset',
  }).formatToParts(probe)
  const nameToken = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+12'
  const m2 = nameToken.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  const sign = m2 ? m2[1] : '+'
  const h = String(parseInt(m2?.[2] || '12', 10)).padStart(2, '0')
  const mn = String(parseInt(m2?.[3] || '0', 10)).padStart(2, '0')
  return `${ymd}T${hhmmss}${sign}${h}:${mn}`
}

// Today in NZT as YYYY-MM-DD. Uses Intl so DST transitions handled by Node.
function nzTodayYmd() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const y = parts.find(p => p.type === 'year').value
  const m = parts.find(p => p.type === 'month').value
  const d = parts.find(p => p.type === 'day').value
  return `${y}-${m}-${d}`
}

// Add N days to a YYYY-MM-DD string (N can be negative). Returns YYYY-MM-DD.
function ymdAdd(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + days * 86400 * 1000
  const nd = new Date(t)
  return `${nd.getUTCFullYear()}-${String(nd.getUTCMonth()+1).padStart(2,'0')}-${String(nd.getUTCDate()).padStart(2,'0')}`
}

export default async function handler(req, res) {
  // POST — dismiss (or re-flag) a severity-flagged abandoned consult after
  // an admin has acted on it (called the patient, confirmed outcome, etc.).
  // Body: { action: 'dismiss' | 'undismiss', consultation_id }
  if (req.method === 'POST') {
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {}
    const action = String(body.action || '').toLowerCase()
    const consultationId = String(body.consultation_id || '').trim()
    if (!['dismiss','undismiss'].includes(action)) {
      return res.status(400).json({ error: 'action must be dismiss or undismiss' })
    }
    if (!/^[0-9a-f-]{36}$/i.test(consultationId)) {
      return res.status(400).json({ error: 'valid consultation_id required' })
    }
    const providerId = req.auth?.provider?.id || null
    const patch = action === 'dismiss'
      ? { funnel_dismissed_at: new Date().toISOString(), funnel_dismissed_by: providerId }
      : { funnel_dismissed_at: null, funnel_dismissed_by: null }
    const { error: upErr } = await admin().from('consultations')
      .update(patch).eq('id', consultationId)
    if (upErr) return res.status(500).json({ error: upErr.message })
    return res.status(200).json({ ok: true, action, consultation_id: consultationId })
  }

  if (req.method !== 'GET') return res.status(405).end()

  // Resolve window — explicit from/to takes precedence, otherwise rolling days.
  let fromYmd, toYmd
  if (req.query.from && req.query.to) {
    fromYmd = String(req.query.from)
    toYmd   = String(req.query.to)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(toYmd)) {
      return res.status(400).json({ error: 'from/to must be YYYY-MM-DD' })
    }
    // Clamp span to 90 days to protect the query
    const spanDays = (new Date(toYmd) - new Date(fromYmd)) / 86400000
    if (spanDays < 0 || spanDays > 90) {
      return res.status(400).json({ error: 'from/to span must be 0-90 days with from<=to' })
    }
  } else {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7))
    toYmd   = nzTodayYmd()
    fromYmd = ymdAdd(toYmd, -(days - 1))
  }

  // Window: from 00:00 NZT on fromYmd through 24:00 NZT on toYmd (exclusive).
  const windowStartIso = nzIsoAt(fromYmd, '00:00:00')
  const windowEndIso   = nzIsoAt(ymdAdd(toYmd, 1), '00:00:00')

  const supabase = admin()

  // Pull all consultations in the window with the fields we need for both
  // classification and drop-off rescue contact. Exclude practice-mode rows —
  // they're training sandbox and would skew the numbers.
  const { data: rows, error } = await supabase.from('consultations')
    .select('id, patient_id, status, created_at, patient_joined_at, started_at, notes_finalised_at, completed_at, payment_amount, chief_complaint, is_practice, funnel_dismissed_at')
    .gte('created_at', windowStartIso)
    .lt('created_at', windowEndIso)
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) return res.status(500).json({ error: error.message })

  const real = (rows || []).filter(r => !r.is_practice)

  // Funnel: at each step, how many consults reached that step at all?
  // (Reached = either stopped there OR passed through to a later step.)
  const stepReachCount = STEPS.map(() => 0)
  const stopAtCount    = STEPS.map(() => 0)
  for (const c of real) {
    const { lastReachedIdx } = classify(c)
    for (let i = 0; i <= lastReachedIdx; i++) stepReachCount[i]++
    stopAtCount[lastReachedIdx]++
  }

  const total = real.length
  const funnel = STEPS.map((step, i) => {
    const reached = stepReachCount[i]
    const completed_pct = total > 0 ? Math.round((reached / total) * 100) : 0
    const prev = i > 0 ? stepReachCount[i - 1] : total
    const drop_pct_vs_previous = prev > 0 ? Math.round(((prev - reached) / prev) * 100) : 0
    return {
      step,
      label: STEP_LABELS[step],
      reached,
      stopped_here: stopAtCount[i],
      completed_pct,
      drop_pct_vs_previous: i === 0 ? 0 : drop_pct_vs_previous,
    }
  })

  // Drop-off list — abandoned consults, severity-flagged first, then most-
  // recent. Only pull patient contact fields for abandoned rows (keeps the
  // query cheap for the happy path).
  // Dismissed consults don't appear in the abandoned list unless the client
  // asks for them explicitly (toggle in the UI). They still count in the
  // funnel bars — the dismissal is only about the rescue action, not the
  // conversion metric.
  const showDismissed = req.query.show_dismissed === 'true'
  const abandonedRows = real.filter(c => classify(c).isAbandoned && (showDismissed || !c.funnel_dismissed_at))
  const patientIds = [...new Set(abandonedRows.map(c => c.patient_id).filter(Boolean))]
  let patientById = new Map()
  if (patientIds.length > 0) {
    const { data: pats } = await supabase.from('patients')
      .select('id, first_name, last_name, phone_mobile, email')
      .in('id', patientIds)
    patientById = new Map((pats || []).map(p => [p.id, p]))
  }

  const now = Date.now()
  const drop_offs = abandonedRows.map(c => {
    const p = c.patient_id ? patientById.get(c.patient_id) : null
    const { lastReachedIdx } = classify(c)
    const hours_since = Math.round((now - new Date(c.created_at).getTime()) / 3600000)
    return {
      consultation_id: c.id,
      patient_id: c.patient_id || null,
      dismissed: !!c.funnel_dismissed_at,
      patient_name: p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : null,
      patient_phone: p?.phone_mobile || null,
      patient_email: p?.email || null,
      chief_complaint: c.chief_complaint || null,
      created_at: c.created_at,
      last_step: STEPS[lastReachedIdx],
      last_step_label: STEP_LABELS[STEPS[lastReachedIdx]],
      hours_since,
      severity_flag: hasSeverityKeyword(c.chief_complaint),
    }
  }).sort((a, b) => {
    // Severity-flagged first, then most-recent
    if (a.severity_flag !== b.severity_flag) return a.severity_flag ? -1 : 1
    return new Date(b.created_at) - new Date(a.created_at)
  }).slice(0, 100)

  return res.status(200).json({
    from: fromYmd,
    to: toYmd,
    total,
    funnel,
    drop_offs,
  })
}
