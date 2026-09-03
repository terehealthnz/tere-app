// Nightly results-reconciliation digest (task #418).
//
// THE audit half of the results-follow-up control. Scans investigation_orders
// for the three failure modes that cause telehealth patient harm:
//
//   1. status='ordered' AND now() > ordered_at + expected_by_days * 1 day
//      → order SLA breached, no result — did we send it? did it come back?
//   2. status='received' AND now() > received_at + 48h
//      → result came back but no clinician has reviewed it
//   3. status='reviewed' AND is_abnormal=true AND now() > reviewed_at + 24h
//      → abnormal result reviewed but not actioned — highest priority
//
// Silent when nothing actionable. Emails admin (and optionally the
// ordering provider) when findings exist. Auto-escalates category 3 as a
// warn-severity security_events row so it also fires the real-time alert.
//
// Manual invocation:
//   GET /api/cron-results-reconciliation?secret=<CRON_SECRET>&force=1

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from './_email-client.js'

const ADMIN_EMAIL = 'terehealthnz@gmail.com'

const REVIEW_SLA_HOURS   = 48
const ACTION_SLA_HOURS   = 24  // for abnormal

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const nzDate = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short' }) } catch { return String(iso) }
}
const hoursBetween = (fromIso, toIso) => Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / (60 * 60 * 1000))

export default async function handler(req, res) {
  const { verifyCronSecret } = await import('./_cron-auth.js')
  if (!verifyCronSecret(req)) return res.status(404).json({ error: 'Not found' })

  const supabase = admin()
  const now = new Date()
  const nowIso = now.toISOString()

  const findings = {
    orders_overdue:            [],  // ordered but past SLA
    results_unreviewed:        [],  // received but not reviewed in 48h
    abnormal_unactioned:       [],  // reviewed abnormal but not actioned in 24h
  }

  // 1. Orders overdue: status='ordered' AND now > ordered_at + expected_by_days
  const { data: orderedRows } = await supabase.from('investigation_orders')
    .select('id, ordered_at, expected_by_days, order_type, order_description, patient_name, patient_nhi, ordered_by_provider_name, consultation_id')
    .eq('status', 'ordered')
    .limit(1000)
  for (const o of orderedRows || []) {
    const dueMs = new Date(o.ordered_at).getTime() + (o.expected_by_days || 7) * 86400000
    if (now.getTime() > dueMs) {
      findings.orders_overdue.push({ ...o, overdue_days: Math.floor((now.getTime() - dueMs) / 86400000) })
    }
  }

  // 2. Results unreviewed >48h
  const cutoff48 = new Date(now.getTime() - REVIEW_SLA_HOURS * 3600 * 1000).toISOString()
  const { data: unreviewed } = await supabase.from('investigation_orders')
    .select('id, received_at, order_type, order_description, patient_name, patient_nhi, ordered_by_provider_name, is_abnormal, consultation_id')
    .eq('status', 'received')
    .lt('received_at', cutoff48)
    .limit(1000)
  for (const o of unreviewed || []) {
    findings.results_unreviewed.push({ ...o, unreviewed_hours: hoursBetween(o.received_at, nowIso) })
  }

  // 3. Abnormal + unactioned >24h — highest priority. These auto-escalate.
  const cutoff24 = new Date(now.getTime() - ACTION_SLA_HOURS * 3600 * 1000).toISOString()
  const { data: unactioned } = await supabase.from('investigation_orders')
    .select('id, reviewed_at, order_type, order_description, patient_name, patient_nhi, ordered_by_provider_name, reviewed_by_provider_name, received_summary, consultation_id')
    .eq('status', 'reviewed').eq('is_abnormal', true)
    .lt('reviewed_at', cutoff24)
    .limit(1000)
  for (const o of unactioned || []) {
    findings.abnormal_unactioned.push({ ...o, unactioned_hours: hoursBetween(o.reviewed_at, nowIso) })
  }

  // Auto-escalate category 3 — set escalated_at + escalated_to_admin flag
  // + write to security_events so the real-time alerter picks it up too.
  if (findings.abnormal_unactioned.length) {
    for (const o of findings.abnormal_unactioned) {
      await supabase.from('investigation_orders').update({
        escalated_at:       nowIso,
        escalation_reason:  `Abnormal result unactioned for ${o.unactioned_hours}h (SLA ${ACTION_SLA_HOURS}h)`,
        escalated_to_admin: true,
      }).eq('id', o.id).is('escalated_at', null)
    }
    // Best-effort security_events insert (table may or may not exist yet).
    try {
      await supabase.from('security_events').insert({
        event_type: 'abnormal_result_unactioned',
        severity:   'warn',
        summary:    `${findings.abnormal_unactioned.length} abnormal investigation result(s) unactioned >${ACTION_SLA_HOURS}h`,
        metadata:   { orders: findings.abnormal_unactioned.map(o => o.id) },
      })
    } catch {}
  }

  const total = findings.orders_overdue.length + findings.results_unreviewed.length + findings.abnormal_unactioned.length
  const force = req.query?.force === '1'
  if (!total && !force) {
    return res.status(200).json({ ok: true, message: 'Results reconciliation — everything current' })
  }

  const lines = [
    'Nightly results-reconciliation digest — Tere Health',
    `${nzDate(nowIso)} NZT`,
    '',
  ]

  const section = (title, items, formatter) => {
    if (!items.length) return
    lines.push(title)
    items.forEach(i => lines.push('  • ' + formatter(i)))
    lines.push('')
  }

  section('🚨 ABNORMAL RESULTS UNACTIONED (>24h) — highest priority:',
    findings.abnormal_unactioned,
    o => `${o.patient_name || o.patient_nhi || '(unknown)'} · ${o.order_description} — reviewed by ${o.reviewed_by_provider_name || '?'} ${o.unactioned_hours}h ago (${nzDate(o.reviewed_at)})`)

  section('⏰ RESULTS RECEIVED BUT NOT REVIEWED (>48h):',
    findings.results_unreviewed,
    o => `${o.patient_name || o.patient_nhi || '(unknown)'} · ${o.order_description}${o.is_abnormal ? ' [ABNORMAL]' : ''} — received ${o.unreviewed_hours}h ago (${nzDate(o.received_at)}) · ordered by ${o.ordered_by_provider_name || '?'}`)

  section('📋 ORDERS OVERDUE (past expected turnaround, no result):',
    findings.orders_overdue,
    o => `${o.patient_name || o.patient_nhi || '(unknown)'} · ${o.order_description} — ordered ${nzDate(o.ordered_at)} by ${o.ordered_by_provider_name || '?'} · ${o.overdue_days}d overdue`)

  lines.push('Actions:')
  lines.push('  • Abnormal unactioned: contact patient TODAY. Log action in the worklist.')
  lines.push('  • Unreviewed >48h: assign a reviewing clinician.')
  lines.push('  • Overdue orders: chase RHCNZ / lab / referred provider. Cancel if no longer needed.')
  lines.push('  • Worklist: Admin > Compliance > Results Follow-up.')
  lines.push('')
  lines.push('This email fires nightly only when something needs action. Silent when everything is current.')
  lines.push('Task #418 — results follow-up loop. #1 telehealth safety control per HDC/coronial findings.')

  try {
    await sendEmail({
      from:    'Tere Clinical Safety <hello@terehealth.co.nz>',
      to:      ADMIN_EMAIL,
      subject: `Results reconciliation — ${total} item(s) need action${findings.abnormal_unactioned.length ? ' (ABNORMAL UNACTIONED)' : ''}`,
      text:    lines.join('\n'),
    })
  } catch (e) { console.error('[cron-results-reconciliation] email failed:', e.message) }

  return res.status(200).json({
    ok: true,
    counts: {
      orders_overdue:      findings.orders_overdue.length,
      results_unreviewed:  findings.results_unreviewed.length,
      abnormal_unactioned: findings.abnormal_unactioned.length,
    },
  })
}
