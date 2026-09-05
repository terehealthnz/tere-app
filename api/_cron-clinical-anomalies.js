// Nightly clinical anomaly digest (tasks #422 + #425).
//
// Distinct from the security anomaly cron (task #292) — that cron watches
// audit_logs for access patterns. This one watches consultations for
// clinical patterns that suggest missed diagnosis or safety-eventful
// abandonment. Silent when nothing actionable.
//
// Detects:
//   1. Re-presentation within 72h — same patient (NHI/email/phone) with two
//      completed consults for a similar chief_complaint (token overlap)
//   2. Discharged-then-deteriorated — a completed consult followed within
//      7 days by a fresh consult that hit a red-flag divert
//   3. Abandonment after red-flag — patient answered YES to a triage red-
//      flag or divert, then never joined the call OR abandoned the waiting
//      room. Cross-checks emergency_escalations without a matching consult
//      completion.
//
// Manual invocation:
//   GET /api/cron-clinical-anomalies?secret=<CRON_SECRET>&force=1

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from './_email-client.js'

const ADMIN_EMAIL         = 'terehealthnz@gmail.com'
const REPRESENT_WINDOW_H  = 72
const DETERIORATE_WINDOW_DAYS = 7
const LOOKBACK_DAYS       = 30       // scan the last 30 days each night

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const nzDateTime = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short' }) } catch { return '—' }
}
const hoursBetween = (a, b) => Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 3600000)

// Loose complaint-similarity — token overlap after stopword removal.
const STOP = new Set(['a','an','the','and','or','of','in','on','with','my','me','i','for','to','have','had','has','feeling','feel','felt','not','no','some','been','being','is','was','were','it','this','that','these','those','pain','ache','sore'])
function complaintKey(text) {
  return new Set(String(text || '').toLowerCase()
    .split(/[^a-z]+/).filter(w => w && w.length > 2 && !STOP.has(w)))
}
function complaintOverlap(a, b) {
  if (!a.size || !b.size) return 0
  let n = 0
  for (const w of a) if (b.has(w)) n++
  return n / Math.min(a.size, b.size)
}

// Signal classifier — separates real clinical safety events from noise so
// the digest surfaces the 1-in-12 real finding at the top and buries the
// test/QA/no-complaint chatter at the bottom.
//
// A finding is "noise" when any of:
//   - triage never captured a chief complaint (patient bailed at consent)
//   - flagged from a test / smoke / QA trigger (matched_flags contains
//     test_smoke*, smoke_test*, *_post_deploy, ai_divert_kw_post_deploy)
//   - anonymous & no named patient tied to the event (usually a synthetic
//     probe from monitoring)
const NOISE_FLAG_PATTERNS = [
  /^test_/i, /_test$/i, /^smoke_/i, /_smoke$/i,
  /_post_deploy$/i, /^ai_divert_kw_post_deploy$/i,
  /^synthetic/i, /_probe$/i,
]
function isTestFlag(flag) {
  const s = String(flag || '')
  return NOISE_FLAG_PATTERNS.some(rx => rx.test(s))
}
function hasRealComplaint(text) {
  const t = String(text || '').toLowerCase().trim()
  if (!t) return false
  if (t === 'pending' || t.startsWith('pending —') || t.startsWith('pending -')) return false
  if (/^triage not started$/i.test(t)) return false
  return t.length >= 3
}
function classifyRepresentation(r) {
  // Real signal needs: both consults have a chief complaint the AI could read
  const both = hasRealComplaint(r.first_complaint) && hasRealComplaint(r.second_complaint)
  if (!both) return 'noise:no-complaint'
  if (!r.patient_name && !r.patient_key) return 'noise:anonymous'
  return 'signal'
}
function classifyAbandonment(a) {
  const flags = Array.isArray(a.matched_flags) ? a.matched_flags : []
  if (flags.length && flags.every(isTestFlag)) return 'noise:test'
  if (!a.patient_name && !a.patient_nhi) return 'noise:anonymous'
  return 'signal'
}

export default async function handler(req, res) {
  const { verifyCronSecret } = await import('./_cron-auth.js')
  if (!verifyCronSecret(req)) return res.status(404).json({ error: 'Not found' })

  const supabase = admin()
  const now = new Date()
  const lookback = new Date(now.getTime() - LOOKBACK_DAYS * 86400 * 1000).toISOString()

  const findings = {
    represent_72h:            [],
    deteriorated_after_close: [],
    red_flag_abandonment:     [],
  }

  // Pull the last 30d of consults so we can walk pairs.
  const { data: consults } = await supabase.from('consultations')
    .select('id, patient_id, patient_nhi, patient_email, patient_first_name, patient_last_name, chief_complaint, status, created_at, completed_at')
    .gte('created_at', lookback)
    .order('created_at', { ascending: true })
    .limit(5000)

  // Group by patient key.
  const byPatient = new Map()
  for (const c of consults || []) {
    const key = c.patient_nhi || c.patient_email || c.patient_id || `name:${c.patient_first_name}|${c.patient_last_name}`
    if (!byPatient.has(key)) byPatient.set(key, [])
    byPatient.get(key).push(c)
  }

  // 1 + 2 — walk each patient's consult timeline
  for (const [key, list] of byPatient) {
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i]
      const b = list[i + 1]
      const gapH = hoursBetween(a.created_at, b.created_at)
      if (gapH <= 0) continue

      // (1) Re-presentation within 72h with similar chief complaint
      if (gapH <= REPRESENT_WINDOW_H) {
        const ov = complaintOverlap(complaintKey(a.chief_complaint), complaintKey(b.chief_complaint))
        if (ov >= 0.5) {
          findings.represent_72h.push({
            patient_key: key,
            patient_name: [b.patient_first_name, b.patient_last_name].filter(Boolean).join(' '),
            first_consult_id: a.id,
            first_at: a.created_at,
            first_status: a.status,
            first_complaint: a.chief_complaint,
            second_consult_id: b.id,
            second_at: b.created_at,
            second_complaint: b.chief_complaint,
            gap_hours: gapH,
            overlap: Number(ov.toFixed(2)),
          })
        }
      }

      // (2) Discharged then deteriorated — a was 'complete', b hits an
      // emergency escalation within the window
      if (a.status === 'complete' && gapH <= DETERIORATE_WINDOW_DAYS * 24) {
        const { data: escs } = await supabase.from('emergency_escalations')
          .select('id, escalation_type, matched_flags, escalated_at')
          .eq('consultation_id', b.id).limit(1)
        if (escs && escs.length) {
          findings.deteriorated_after_close.push({
            patient_key: key,
            patient_name: [b.patient_first_name, b.patient_last_name].filter(Boolean).join(' '),
            closed_consult_id: a.id,
            closed_at: a.completed_at || a.created_at,
            re_consult_id: b.id,
            re_at: b.created_at,
            escalation_type: escs[0].escalation_type,
            matched: escs[0].matched_flags,
            gap_hours: gapH,
          })
        }
      }
    }
  }

  // 3 — red-flag abandonment. Every escalation in last 30d whose consult
  // never completed AND no follow-up outcome is recorded.
  const { data: escalations } = await supabase.from('emergency_escalations')
    .select('id, consultation_id, escalated_at, escalation_type, matched_flags, patient_name, patient_nhi, outcome')
    .gte('escalated_at', lookback)
    .is('outcome', null)
    .limit(1000)
  for (const e of escalations || []) {
    if (!e.consultation_id) {
      // No linked consult = definite abandonment
      findings.red_flag_abandonment.push({ ...e, reason: 'no_linked_consult' })
      continue
    }
    const { data: c } = await supabase.from('consultations')
      .select('status, completed_at, patient_joined_at')
      .eq('id', e.consultation_id).maybeSingle()
    if (!c) continue
    if (c.status === 'complete' || c.status === 'no_show') continue  // handled elsewhere
    if (!c.patient_joined_at && hoursBetween(e.escalated_at, new Date().toISOString()) > 2) {
      findings.red_flag_abandonment.push({ ...e, reason: 'patient_never_joined' })
    }
  }

  // Auto-classify — every finding gets a signal/noise label. Signals go
  // to the top with recommended actions; noise gets a single-line summary
  // at the bottom so we still know it fired but don't clutter the read.
  const signalRepresent   = findings.represent_72h.filter(r => classifyRepresentation(r) === 'signal')
  const noiseRepresent    = findings.represent_72h.filter(r => classifyRepresentation(r) !== 'signal')
  const signalAbandon     = findings.red_flag_abandonment.filter(a => classifyAbandonment(a) === 'signal')
  const noiseAbandon      = findings.red_flag_abandonment.filter(a => classifyAbandonment(a) !== 'signal')
  // Deterioration is always signal — it needs a real completed consult + a real escalation, hard to fake
  const signalDeteriorate = findings.deteriorated_after_close

  const totalRaw    = findings.represent_72h.length + findings.deteriorated_after_close.length + findings.red_flag_abandonment.length
  const totalSignal = signalRepresent.length + signalDeteriorate.length + signalAbandon.length
  const totalNoise  = totalRaw - totalSignal
  const force = req.query?.force === '1'

  // Send only when we have REAL signals, or a manual force. Pure-noise
  // nights stay silent (no email at all).
  if (!totalSignal && !force) {
    return res.status(200).json({ ok: true, message: 'Clinical anomalies — clean (no signals; noise filtered)', filtered_noise: totalNoise })
  }

  const lines = [
    'Nightly clinical anomaly digest — Tere Health',
    `${nzDateTime(now.toISOString())} NZT`,
    `Lookback: ${LOOKBACK_DAYS} days`,
    '',
    totalSignal
      ? `⚠️  ${totalSignal} real signal(s) worth reviewing (see below). ${totalNoise} noise event(s) filtered out.`
      : `No real signals detected — ${totalNoise} noise event(s) suppressed (see summary at bottom).`,
    '',
  ]
  const section = (title, items, formatter) => {
    if (!items.length) return
    lines.push(title); items.forEach(i => lines.push('  • ' + formatter(i))); lines.push('')
  }

  if (totalSignal > 0) {
    lines.push('=== REAL SIGNALS — please review today ===')
    lines.push('')

    section(`🔁 Re-presentation within ${REPRESENT_WINDOW_H}h (same/similar complaint):`,
      signalRepresent,
      r => `${r.patient_name || r.patient_key} — "${r.first_complaint}" ${nzDateTime(r.first_at)} → "${r.second_complaint}" ${r.gap_hours}h later (overlap ${r.overlap})`)

    section('🚨 Discharged then deteriorated (escalated within 7d of close):',
      signalDeteriorate,
      r => `${r.patient_name || r.patient_key} — closed ${nzDateTime(r.closed_at)}, then ${r.escalation_type} ${r.gap_hours}h later (${(r.matched || []).join(',')})`)

    section('👻 Red-flag/divert abandonment (no consult completion + no follow-up outcome):',
      signalAbandon,
      r => `${r.patient_name || r.patient_nhi || '(unknown)'} — ${r.escalation_type} at ${nzDateTime(r.escalated_at)} (${(r.matched_flags || []).join(',')}) · reason: ${r.reason}`)

    lines.push('Actions:')
    lines.push('  • Re-presentation: peer-review the second consult against the first — was the diagnosis missed?')
    lines.push('  • Deteriorated: peer-review + consider CGM incident report if severity threshold met.')
    lines.push('  • Abandonment: contact patient TODAY, record outcome under Admin > Emergency Escalations.')
    lines.push('')
  }

  if (totalNoise > 0) {
    lines.push('=== Filtered noise (no action needed — logged for audit) ===')
    lines.push(`  • ${noiseRepresent.length} re-presentation(s) where triage never captured a chief complaint`)
    lines.push(`  • ${noiseAbandon.filter(a => classifyAbandonment(a) === 'noise:test').length} escalation(s) triggered by test / smoke / post-deploy tags`)
    lines.push(`  • ${noiseAbandon.filter(a => classifyAbandonment(a) === 'noise:anonymous').length} anonymous escalation(s) with no linked patient`)
    lines.push('')
  }

  lines.push('Tasks #422 + #425 + #449 — clinical anomaly detection with automatic signal/noise classification.')

  try {
    await sendEmail({
      from:    'Tere Clinical Safety <hello@terehealth.co.nz>',
      to:      ADMIN_EMAIL,
      subject: totalSignal
        ? `⚠️ Clinical anomalies — ${totalSignal} real signal${totalSignal === 1 ? '' : 's'} to review`
        : `Clinical anomalies — ${totalNoise} noise event${totalNoise === 1 ? '' : 's'} filtered (no action)`,
      text:    lines.join('\n'),
    })
  } catch (e) { console.error('[cron-clinical-anomalies] email failed:', e.message) }

  return res.status(200).json({
    ok: true,
    counts: {
      signals: totalSignal,
      noise:   totalNoise,
      represent_72h:            { total: findings.represent_72h.length, signal: signalRepresent.length },
      deteriorated_after_close: { total: findings.deteriorated_after_close.length, signal: signalDeteriorate.length },
      red_flag_abandonment:     { total: findings.red_flag_abandonment.length, signal: signalAbandon.length },
    },
  })
}
