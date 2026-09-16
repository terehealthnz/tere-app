// Sweep abandoned in-progress / reviewing consultations.
//
// Why:
//   Dashboard.jsx:476 derives the 🔒 provider-lock badge purely from
//   consultations.provider_id being set to another provider's UUID.
//   ConsultView.jsx:559 stamps provider_id + status='in_progress' when a
//   provider admits the patient, and ClinicianPatient.jsx:168 stamps
//   status='reviewing' + provider_id when they open the chart. Neither
//   flow has a release path — if the provider closes the tab, loses
//   network, or walks away, the consult stays pinned to them forever,
//   and no other provider can pick it up.
//
//   Observed 2026-09-15: Justin had three consults pinned to him for
//   21h / 20h / 3h with no scribe writes or notes activity.
//
// What this does:
//   Every 5 minutes, find any consultation with:
//     status IN ('in_progress', 'reviewing')
//     AND provider_id IS NOT NULL
//     AND updated_at < NOW() - 90 min
//   Reset it to status='waiting' + provider_id=NULL so the next
//   provider on the queue can pick it up. Write an audit_log row per
//   release. Email a daily-style summary to admin if any released.
//
// Why 90 min:
//   A legitimate active consult writes to consultations often (scribe
//   persist every ~30s per task #40, notes debounce on change, payment
//   capture on admit, status transitions) — updated_at moves naturally
//   under real use. 90 min is comfortably longer than any legitimate
//   in_progress phase (typical consult is 5-30 min) but short enough
//   that a patient re-entering the queue doesn't wait hours.

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from './_email-client.js'

const STALE_MINUTES = 90

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export default async function handler(req, res) {
  const { verifyCronSecret } = await import('./_cron-auth.js')
  if (!verifyCronSecret(req)) return res.status(404).json({ error: 'Not found' })

  const supabase = admin()
  const cutoffMs = Date.now() - STALE_MINUTES * 60 * 1000
  const cutoffIso = new Date(cutoffMs).toISOString()

  const { data: stale, error: selErr } = await supabase
    .from('consultations')
    .select('id, provider_id, provider_display_name, status, updated_at, patient_first_name, patient_last_name')
    .in('status', ['in_progress', 'reviewing'])
    .not('provider_id', 'is', null)
    .lt('updated_at', cutoffIso)
    .limit(200)

  if (selErr) {
    console.error('[cron-release-abandoned-consults] select failed:', selErr.message)
    return res.status(500).json({ error: 'select failed' })
  }

  if (!stale?.length) return res.status(200).json({ ok: true, released: 0 })

  const summaryLines = [`Released ${stale.length} abandoned consult(s) — locked > ${STALE_MINUTES} min with no updated_at movement:`, '']
  const released = []
  const failed = []

  for (const c of stale) {
    const mins = Math.round((Date.now() - new Date(c.updated_at).getTime()) / 60000)
    const { error: updErr } = await supabase
      .from('consultations')
      .update({
        provider_id: null,
        provider_display_name: null,
        status: 'waiting',
        // do NOT touch started_at — preserves whatever the previous provider stamped
      })
      .eq('id', c.id)
      // Belt-and-braces: only update if the row is still in the state we saw.
      .in('status', ['in_progress', 'reviewing'])
      .eq('provider_id', c.provider_id)

    if (updErr) {
      failed.push({ id: c.id, error: updErr.message })
      continue
    }

    released.push({ id: c.id, previous_provider_id: c.provider_id, previous_status: c.status, stale_minutes: mins })
    summaryLines.push(`  • ${c.patient_first_name || ''} ${c.patient_last_name || ''} — was ${c.status}, pinned to ${c.provider_display_name || c.provider_id?.slice(0, 8)} for ${mins} min → returned to waiting`)

    try {
      await supabase.from('audit_logs').insert({
        event_type: 'consult_lock_auto_released',
        provider_id: c.provider_id,
        provider_name: c.provider_display_name || null,
        resource_type: 'consultation',
        resource_id: c.id,
        metadata: {
          previous_status: c.status,
          previous_updated_at: c.updated_at,
          stale_minutes: mins,
          cutoff_minutes: STALE_MINUTES,
        },
      })
    } catch (e) {
      console.error('[cron-release-abandoned-consults] audit insert failed:', e.message)
    }
  }

  if (released.length > 0) {
    try {
      await sendEmail({
        from:    'Tere Ops <hello@terehealth.co.nz>',
        to:      'terehealthnz@gmail.com',
        subject: `Consult locks auto-released — ${released.length} consult(s) returned to queue`,
        text:    summaryLines.join('\n'),
      })
    } catch (e) {
      console.error('[cron-release-abandoned-consults] email failed:', e.message)
    }
  }

  return res.status(200).json({ ok: true, released: released.length, failed: failed.length, cutoff_minutes: STALE_MINUTES, cutoff_iso: cutoffIso })
}
