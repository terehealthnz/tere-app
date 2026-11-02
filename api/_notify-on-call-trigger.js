// Postgres-trigger-fired SMS notifier.
//
// Called by the AFTER UPDATE trigger on consultations (defined in
// supabase/2026-11-01_notify_on_call_trigger.sql) whenever in_waiting_room
// transitions false→true. The DB itself guarantees the trigger fires on
// every such transition — independent of whether the HTTP handler that
// did the UPDATE completed, whether the browser was still open, or
// whether the Vercel lambda was frozen mid-await.
//
// Auth: bearer token from Postgres settings must match env
// NOTIFY_TRIGGER_SECRET. The token lives in two places (vault setting on
// Supabase, env var on Vercel) and must match.
//
// Idempotency comes from notifyOnCallProviders' atomic claim on
// on_call_sms_sent_at. If the primary handler path already sent, this
// trigger call sees the claim and bails.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const expected = process.env.NOTIFY_TRIGGER_SECRET
  const supplied = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')
  if (!expected || supplied !== expected) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { consultationId } = req.body || {}
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  const { notifyOnCallProviders } = await import('./_notify-on-call.js')
  await notifyOnCallProviders({ consultationId, source: 'pg-trigger' })

  return res.status(200).json({ ok: true })
}
