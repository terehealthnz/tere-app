// _mark-no-show.js — fires when the SECOND ring attempt times out without the
// patient joining. Cancels the Stripe hold so the patient is not charged, sets
// status=no_show, and emails the patient a friendly "we tried twice — no
// charge" note.
//
// POST /api/mark-no-show
//   { consultationId }

import Stripe from 'stripe'
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

  const now = new Date().toISOString()
  const history = Array.isArray(consult.join_attempt_history) ? consult.join_attempt_history : []
  history.push({ at: now, attempt: consult.join_attempts, kind: 'no_show' })

  await supabase.from('consultations').update({
    status: 'no_show',
    no_show_at: now,
    join_attempt_history: history,
    cooldown_until: null,
  }).eq('id', consultationId)

  // Release Stripe hold so patient is not charged
  if (consult.payment_intent_id) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
      await stripe.paymentIntents.cancel(consult.payment_intent_id)
    } catch (e) {
      console.error('[mark-no-show] Stripe cancel failed:', e.message)
    }
  }

  // Email patient — we tried twice, no charge
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey && consult.patient_email) {
    const firstName = (consult.patient_first_name || 'there')
    const appUrl = process.env.VITE_APP_URL || 'https://terehealth.co.nz'
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: [consult.patient_email],
        subject: 'Your Tere Health appointment — we tried to reach you',
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff"><div style="background:#0D2B45;padding:20px 28px"><div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div></div><div style="padding:24px 28px"><p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p><p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">We tried to reach you twice for your consultation today and weren't able to connect. <strong>No charge has been applied to your card.</strong></p><p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 24px">Your details are saved — please start a new consultation when you're ready.</p><div style="text-align:center;margin:28px 0"><a href="${appUrl}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:14px 32px;border-radius:99px;font-size:16px;font-weight:700">Start a new consultation →</a></div><div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:13px;color:#991B1B;margin-top:24px">⚠️ <strong>In an emergency, call 111.</strong></div></div><div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">Tere Health · terehealth.co.nz</div></body></html>`,
        text: `Kia ora ${firstName},\n\nWe tried to reach you twice for your consultation today and weren't able to connect. No charge has been applied.\n\nPlease start a new consultation when you're ready: ${appUrl}\n\nIn an emergency, call 111.\n\nTere Health`,
      }),
    }).catch(e => console.error('[mark-no-show] email failed:', e.message))

    // SMS as backup — patient may not check email
    if (consult.patient_phone) {
      const smsBody = `Kia ora ${firstName}, we tried to reach you twice for your Tere Health appointment. No charge has been applied. Please start a new consultation when you're ready: ${appUrl}`
      fetch(`${appUrl}/api/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tere-api-key': process.env.TERE_API_KEY || '' },
        body: JSON.stringify({ to: consult.patient_phone, message: smsBody, type: 'no_show' }),
      }).catch(e => console.error('[mark-no-show] sms failed:', e.message))
    }
  }

  return res.status(200).json({ ok: true, status: 'no_show' })
}
