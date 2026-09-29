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
// A short "we tried to reach you, we'll try again shortly" email fires
// on each ring-timeout (attempts 1-2 of 3), giving the patient explicit
// confirmation the call attempt happened and framing the retry cadence.
// Attempt 3 is handled by /api/mark-no-show which has its own dismissal
// email. No SMS is sent here — attempt 2's initiate-call SMS handles the
// urgency framing; a mid-cooldown SMS would just be duplication.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'
import { sendEmail, hasEmailProvider } from './_email-client.js'

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

  // Fire-and-forget "we tried to reach you" email. Practice consults skip.
  // Missing email address quietly no-ops (patient can still be re-tried
  // from the queue). Failure is logged but doesn't fail the request —
  // the queue state change is what matters.
  if (!consult.is_practice && hasEmailProvider() && consult.patient_email) {
    const firstName = consult.patient_first_name || 'there'
    const attemptNum = consult.join_attempts || 0
    const remaining = Math.max(0, 3 - attemptNum)
    const subject = `We tried to reach you — we'll try again shortly`
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px">
    <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
  </div>
  <div style="padding:24px 28px">
    <p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p>
    <p style="font-size:16px;font-weight:700;color:#0B6E76;margin:0 0 16px">
      Your provider tried to reach you and we couldn't get through.
    </p>
    <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">
      You're still in the queue. We'll try again shortly — please keep your phone nearby.
      ${remaining > 0 ? `You have ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before your appointment is released (no charge).` : ''}
    </p>
    <p style="font-size:14px;line-height:1.6;color:#6B7280;margin:0 0 8px">
      If you no longer need the consultation, you don't need to do anything — after 3 missed attempts the payment hold is released automatically.
    </p>
  </div>
  <div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">
    Tere Health · terehealth.co.nz
  </div>
</body></html>`
    const text = `Kia ora ${firstName},\n\nYour provider tried to reach you and we couldn't get through. You're still in the queue and we'll try again shortly — please keep your phone nearby.${remaining > 0 ? ` You have ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before your appointment is released (no charge).` : ''}\n\nIf you no longer need the consultation, you don't need to do anything — after 3 missed attempts the payment hold is released automatically.\n\nTere Health`
    sendEmail({
      from: 'Tere Health <hello@terehealth.co.nz>',
      replyTo: 'terehealthnz@gmail.com',
      to: [consult.patient_email],
      subject,
      html,
      text,
    }).catch(e => console.error('[ring-timeout] email failed:', e.message))
  }

  return res.status(200).json({ ok: true, cooldown_until: cooldownUntil })
}
