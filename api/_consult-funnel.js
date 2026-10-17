// GET /api/consult-funnel — operations funnel over consultations.
//
// Unlike /api/patient-funnel (which aggregates patient_funnel_events — URL
// pageviews from anon triage sessions, keyed by session_id), this endpoint
// aggregates CONSULTATION rows: the authoritative record of what happened to
// each real patient visit. We use status + the five timestamp milestones to
// classify where each visit stopped.
//
// Query params:
//   ?days=<n>   Window in days (default 7, max 90)
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

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const days = Math.min(90, Math.max(1, Number(req.query.days) || 7))
  const windowStart = new Date(Date.now() - days * 86400 * 1000).toISOString()
  const supabase = admin()

  // Pull all consultations in the window with the fields we need for both
  // classification and drop-off rescue contact. Exclude practice-mode rows —
  // they're training sandbox and would skew the numbers.
  const { data: rows, error } = await supabase.from('consultations')
    .select('id, patient_id, status, created_at, patient_joined_at, started_at, notes_finalised_at, completed_at, payment_amount, chief_complaint, is_practice')
    .gte('created_at', windowStart)
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
  const abandonedRows = real.filter(c => classify(c).isAbandoned)
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
    window_days: days,
    total,
    funnel,
    drop_offs,
  })
}
