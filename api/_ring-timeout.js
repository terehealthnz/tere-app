// _ring-timeout.js — called when the 90s ring window elapses without the
// patient joining, OR called ~2 min into the cooldown to fire the "still
// trying to reach you" SMS.
//
// POST /api/ring-timeout
//   { consultationId, kind: 'ring' | 'mid_cooldown' }
//
// kind='ring':
//   • Marks status=cooldown, cooldown_until = now + 5min
//   • Appends { at, attempt, kind:'ring_timeout' } to join_attempt_history
//   • Sends "we tried to reach you — will try again shortly" SMS (attempt 1)
//     or holds until mid_cooldown for a softer nudge
//
// kind='mid_cooldown':
//   • Idempotent: only fires if mid_cooldown_reminder_sent_at is still null
//   • Sends the second SMS (neutral wording, doesn't claim provider is dialling
//     right now because they might be with another patient)
//   • Stamps mid_cooldown_reminder_sent_at

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await guardProvider(req, res)
  if (!auth) return

  const { consultationId, kind = 'ring' } = req.body || {}
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: consult, error: fetchErr } = await supabase
    .from('consultations').select('*').eq('id', consultationId).single()
  if (fetchErr || !consult) return res.status(404).json({ error: 'Consultation not found' })

  const now = new Date()
  const appUrl = process.env.VITE_APP_URL || 'https://terehealth.co.nz'
  const joinUrl = `${appUrl}/call?consultation=${consultationId}`
  const firstName = consult.patient_first_name || 'there'

  if (kind === 'ring') {
    // Push into cooldown for 5 minutes
    const cooldownMs = 5 * 60 * 1000
    const cooldownUntil = new Date(now.getTime() + cooldownMs).toISOString()
    const history = Array.isArray(consult.join_attempt_history) ? consult.join_attempt_history : []
    history.push({ at: now.toISOString(), attempt: consult.join_attempts, kind: 'ring_timeout' })

    const { error: upErr } = await supabase.from('consultations').update({
      status: 'waiting',
      cooldown_until: cooldownUntil,
      mid_cooldown_reminder_sent_at: null,
      join_attempt_history: history,
      // Release provider slot so the queue row goes back to "unclaimed"
      provider_id: null,
      provider_display_name: null,
    }).eq('id', consultationId)
    if (upErr) return res.status(500).json({ error: upErr.message })

    return res.status(200).json({ ok: true, cooldown_until: cooldownUntil })
  }

  if (kind === 'mid_cooldown') {
    // Idempotent — only fire once per cooldown cycle.
    if (consult.mid_cooldown_reminder_sent_at) {
      return res.status(200).json({ ok: true, already_sent: true })
    }
    // Neutral wording — don't claim the provider is dialling right this
    // second, because they may well be with another patient. This SMS just
    // keeps the patient warm and ready.
    const smsBody = `Kia ora ${firstName}, we're still trying to reach you for your Tere Health appointment. Please open the app and stay ready — we'll try again shortly. Join: ${joinUrl}. Emergency? Call 111.`

    if (consult.patient_phone) {
      fetch(`${appUrl}/api/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tere-api-key': process.env.TERE_API_KEY || '' },
        body: JSON.stringify({ to: consult.patient_phone, message: smsBody, type: 'mid_cooldown_reminder' }),
      }).catch(e => console.error('[ring-timeout] mid-cooldown sms failed:', e.message))
    }

    await supabase.from('consultations').update({
      mid_cooldown_reminder_sent_at: now.toISOString(),
    }).eq('id', consultationId)

    return res.status(200).json({ ok: true })
  }

  return res.status(400).json({ error: 'unknown kind' })
}
