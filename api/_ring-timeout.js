// _ring-timeout.js — called when the ring window elapses without the
// patient joining. Marks the consult into a 5-minute cooldown and releases
// the provider slot back to the queue.
//
// Why 5 min and not 2 min (which we briefly tried) or 15 min (Doctegrity's
// model): our patients are rural — fencer in the shed, farmer in the
// paddock, elderly with limited mobility — and often need time to actually
// reach their phone. 2 min is unrealistic. 15 min is fine for scheduled
// consults but too slow for urgent care where a patient is genuinely
// waiting. 5 min balances "phone is somewhere in the house" against
// "person is unwell and waiting for the doctor."
//
// POST /api/ring-timeout
//   { consultationId }
//
// No SMS is sent here — the patient already got the "provider is ready"
// SMS at ring start and (on the retry) will get a "second attempt" SMS
// when the provider re-initiates the call. Firing a third mid-cooldown
// SMS is extra cost with no benefit for a patient who's already ignoring
// their phone.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await guardProvider(req, res)
  if (!auth) return

  const { consultationId } = req.body || {}
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: consult, error: fetchErr } = await supabase
    .from('consultations').select('*').eq('id', consultationId).single()
  if (fetchErr || !consult) return res.status(404).json({ error: 'Consultation not found' })

  const now = new Date()
  const cooldownMs = 5 * 60 * 1000
  const cooldownUntil = new Date(now.getTime() + cooldownMs).toISOString()
  const history = Array.isArray(consult.join_attempt_history) ? consult.join_attempt_history : []
  history.push({ at: now.toISOString(), attempt: consult.join_attempts, kind: 'ring_timeout' })

  const { error: upErr } = await supabase.from('consultations').update({
    status: 'waiting',
    cooldown_until: cooldownUntil,
    join_attempt_history: history,
    // Release provider slot so the queue row goes back to "unclaimed"
    provider_id: null,
    provider_display_name: null,
  }).eq('id', consultationId)
  if (upErr) { console.error('[ring-timeout] upErr failed:', upErr); return res.status(500).json({ error: 'Server error' }) }

  return res.status(200).json({ ok: true, cooldown_until: cooldownUntil })
}
