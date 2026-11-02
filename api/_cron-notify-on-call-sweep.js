// Belt-and-braces for on-call SMS.
//
// Primary path: /api/patient-consult awaits notifyOnCallProviders() when the
// patient's browser PATCHes in_waiting_room=true from WaitingRoom.jsx.
// Secondary path: Postgres trigger (2026-11-01_notify_on_call_trigger.sql)
// fires pg_net.http_post to /api/notify-on-call-trigger on the same row flip.
//
// This cron is the braces. Every 2 min it looks for consults that:
//   - have in_waiting_room=true (patient reached the waiting room)
//   - have on_call_sms_sent_at IS NULL (notification was never claimed)
//   - entered the waiting room within the last 24h (bound the scan)
//   - is_practice=false
// and calls notifyOnCallProviders for each. The atomic claim in that
// function is the dedup — whichever path (primary / trigger / this sweep)
// wins the UPDATE first sends; the others see the claim and no-op.
//
// Context: Alexandra Rankin sat 5.5h in the queue on 2026-11-02 with no
// provider pinged because the primary path's fire-and-forget was being
// killed by Vercel's serverless freeze before notify could run. The
// handler is now awaited AND belt-and-braced AND trace-logged.

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export default async function handler(req, res) {
  const { verifyCronSecret } = await import('./_cron-auth.js')
  if (!verifyCronSecret(req)) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = admin()
  const cutoffIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  // status='waiting' is critical. A consult can have in_waiting_room=true
  // but have moved past 'waiting' (in_progress / complete / no_show) with
  // on_call_sms_sent_at still null from a prior missed send. Without this
  // filter the sweep pages providers for consults that are already done.
  // (Patrick got exactly that false-positive 2026-11-02 20:43 NZT from
  // Alexandra Rankin's completed row.)
  const { data: stuck, error } = await supabase
    .from('consultations')
    .select('id, in_waiting_room_at')
    .eq('in_waiting_room', true)
    .eq('status', 'waiting')
    .is('on_call_sms_sent_at', null)
    .eq('is_practice', false)
    .gt('in_waiting_room_at', cutoffIso)
    .limit(50)

  if (error) {
    console.error('[cron-notify-on-call-sweep] query failed:', error.message)
    return res.status(500).json({ error: 'query failed' })
  }

  const count = stuck?.length || 0
  if (count === 0) return res.status(200).json({ ok: true, swept: 0 })

  const { notifyOnCallProviders } = await import('./_notify-on-call.js')
  for (const row of stuck) {
    await notifyOnCallProviders({ consultationId: row.id, source: 'cron-sweep' })
  }

  return res.status(200).json({ ok: true, swept: count })
}
