// api/send-email.js — patient post-consultation summary email + waitlist open notification
import { aiCall, isConfigured } from './_ai.js'

// Fires the FREE plain HTML payment receipt email for a completed consult.
// Idempotent via consultations.basic_receipt_sent_at — safe to call from
// every finalise site (ProviderNotes, NotesCompletion, async-consult).
// Exported so server-side callers (like _async-consult.js) can reuse it
// without a self-HTTP round-trip.
export async function sendBasicReceipt(consultationId) {
  if (!consultationId) return { sent: false, skipped: 'no_id' }
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: row } = await supabase.from('consultations')
    .select('id, created_at, provider_display_name, payment_amount, patient_first_name, patient_email, basic_receipt_sent_at, payment_intent_id')
    .eq('id', consultationId).single()
  if (!row) return { sent: false, skipped: 'not_found' }
  if (row.basic_receipt_sent_at) return { sent: false, skipped: 'already_sent' }
  if (!row.patient_email) return { sent: false, skipped: 'no_email' }

  // Best-effort last-4 lookup — non-fatal if it fails. Stripe is our current
  // live gateway; Windcave last-4 lookup is TODO once the flag flips.
  let cardLast4 = null
  let cardBrand = null
  if (row.payment_intent_id && process.env.STRIPE_SECRET_KEY && row.payment_intent_id.startsWith('pi_')) {
    try {
      const Stripe = (await import('stripe')).default
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
      const pi = await stripe.paymentIntents.retrieve(row.payment_intent_id, { expand: ['latest_charge.payment_method_details'] })
      const pm = pi?.latest_charge?.payment_method_details?.card
      if (pm) { cardLast4 = pm.last4 || null; cardBrand = pm.brand || null }
    } catch { /* non-fatal */ }
  }

  const firstName = row.patient_first_name || 'there'
  const consultDate = new Date(row.created_at).toLocaleDateString('en-NZ', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Pacific/Auckland',
  })
  const amountDollars = ((Number(row.payment_amount) || 0) / 100).toFixed(2)
  const cardLine = cardLast4
    ? `${(cardBrand || 'Card').charAt(0).toUpperCase() + (cardBrand || 'card').slice(1)} ending ${cardLast4}`
    : 'Card'
  const providerName = row.provider_display_name || 'Tere clinician'

  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: [row.patient_email],
        subject: `Payment receipt — Tere Health consultation ${consultDate}`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px">
    <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
  </div>
  <div style="padding:24px 28px">
    <p style="font-size:15px;margin:0 0 12px">Kia ora ${firstName},</p>
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px">
      Here's your receipt for the telehealth consultation on <strong>${consultDate}</strong>.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 24px">
      <tr><td style="padding:8px 0;color:#6B7280">Consultation date</td><td style="padding:8px 0;text-align:right;color:#0D2B45">${consultDate}</td></tr>
      <tr><td style="padding:8px 0;color:#6B7280">Provider</td><td style="padding:8px 0;text-align:right;color:#0D2B45">${providerName}</td></tr>
      <tr><td style="padding:8px 0;color:#6B7280">Payment method</td><td style="padding:8px 0;text-align:right;color:#0D2B45">${cardLine}</td></tr>
      <tr><td style="padding:12px 0 8px;color:#0D2B45;font-weight:700;border-top:1px solid #E5E7EB">Amount paid</td><td style="padding:12px 0 8px;text-align:right;color:#0D2B45;font-weight:700;border-top:1px solid #E5E7EB">$${amountDollars} NZD</td></tr>
    </table>
    <div style="background:#F0F9FA;border:1px solid #D4EEF0;border-radius:8px;padding:14px 18px;font-size:13px;color:#0B4F5A;line-height:1.6">
      Need a receipt formatted for your health insurer? Tere can email you an itemised insurance-ready PDF (with GST/IRD details, diagnosis code, and clinician MCNZ registration) for $10 — visit your consultation summary link to purchase.
    </div>
  </div>
  <div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">
    Tere Health · Marlborough Sounds, New Zealand · <a href="https://terehealth.co.nz" style="color:#0B6E76">terehealth.co.nz</a>
  </div>
</body></html>`,
        text: `Kia ora ${firstName},\n\nReceipt for your Tere Health consultation on ${consultDate}.\n\nProvider: ${providerName}\nPayment method: ${cardLine}\nAmount paid: $${amountDollars} NZD\n\nNeed an insurance-formatted PDF receipt? Available for $10 from your consultation summary.\n\nTere Health\nterehealth.co.nz`,
      })
    } catch (e) {
      console.error('[send-email:basic_receipt] Resend error:', e.message)
      throw e
    }
  }

  // Mark as sent — critical for idempotency. Do this LAST so a Resend
  // failure re-runs on the next call rather than silently dropping.
  await supabase.from('consultations')
    .update({ basic_receipt_sent_at: new Date().toISOString() })
    .eq('id', consultationId)
  return { sent: true }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { to, name, sections = {}, notes = {}, actions = [], consult = {}, consultationId, isOpenNotification, resumeId, isBasicReceipt } = req.body
  const resendKey = process.env.RESEND_API_KEY

  // Basic receipt — the FREE plain HTML receipt auto-sent when the provider
  // signs off the consult. Idempotent via consultations.basic_receipt_sent_at.
  // The paid $10 insurance-formatted PDF receipt is a separate flow — see
  // /api/generate-insurance-receipt.
  if (isBasicReceipt) {
    if (!consultationId) return res.status(400).json({ error: 'consultationId required' })
    try {
      const result = await sendBasicReceipt(consultationId)
      return res.status(200).json(result)
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // Waitlist-open notification — short email with resume link
  if (isOpenNotification) {
    const firstName = (name || '').split(' ')[0] || 'there'
    const appUrl = process.env.VITE_APP_URL || 'https://tere.co.nz'
    const resumeUrl = resumeId ? `${appUrl}/resume/${resumeId}` : `${appUrl}/triage`
    if (resendKey && to) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: 'Tere Health <hello@terehealth.co.nz>',
            replyTo: 'terehealthnz@gmail.com',
            to: [to],
            subject: 'Tere Health is now open — claim your spot',
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff"><div style="background:#0D2B45;padding:20px 28px"><div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div></div><div style="padding:24px 28px"><p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p><p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 24px">The Tere Health clinic is now open. Click below to complete your payment and join the queue. <strong>You have 15 minutes.</strong></p><div style="text-align:center;margin:28px 0"><a href="${resumeUrl}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:14px 32px;border-radius:99px;font-size:16px;font-weight:700">Claim my spot →</a></div><div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:13px;color:#991B1B;margin-top:24px">⚠️ <strong>In an emergency, call 111.</strong></div></div><div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">Tere Health · terehealth.co.nz</div></body></html>`,
            text: `Kia ora ${firstName},\n\nThe Tere Health clinic is now open. Claim your spot (15 minutes):\n${resumeUrl}\n\nIn an emergency, call 111.\n\nTere Health`,
          }),
        })
      } catch (e) { console.error('Resend error:', e) }
    }
    return res.status(200).json({ sent: true })
  }

  // Support both old SOAP format and new 9-section format
  const assessment = sections.mdm     || notes.A || ''
  const plan       = sections.plan    || notes.P || ''
  const history    = sections.presentingHistory || notes.S || ''

  const rxList  = actions.filter(a => a.type === 'prescription').map(a =>
    `• ${a.drug}${a.dose ? ' ' + a.dose : ''}${a.frequency ? ' ' + a.frequency : ''}${a.pharmacy ? ' — ' + a.pharmacy : ''}`
  ).join('\n')

  const xrList  = actions.filter(a => a.type === 'radiology').map(a =>
    `• ${a.investigation}: ${a.bodyPart}${a.provider ? ' at ' + a.provider : ''}${a.urgency ? ' [' + a.urgency + ']' : ''}`
  ).join('\n')

  const accList = actions.filter(a => a.type === 'acc45').map(a =>
    `• ACC claim — ${a.injury || 'injury'}`
  ).join('\n')

  let summaryText = ''
  if (isConfigured()) {
    try {
      const prompt = `Write a warm, friendly summary of this telehealth consultation for a rural New Zealand patient.

Use plain English — no medical jargon. Address them by first name. Write in 3 short paragraphs:
1. What was discussed and what the doctor found
2. What's been arranged (prescriptions, tests, ACC)
3. What to do next, including when to seek further care

Always end with: "If your condition worsens, call 111 or visit your nearest emergency department straight away."

Patient: ${name}
Presenting complaint: ${consult.chief_complaint || history || 'not recorded'}
Assessment: ${assessment}
Plan: ${plan}
Prescriptions:\n${rxList || 'None prescribed'}
Imaging:\n${xrList || 'None ordered'}
ACC claim:\n${accList || 'Not applicable'}

Sign off warmly from Tere Health. Keep under 200 words total.`

      summaryText = await aiCall({ tier: 'sonnet', user: prompt, maxTokens: 500 })
    } catch (e) { console.error('[send-email] Bedrock error:', e.message) }
  }

  if (!summaryText) {
    summaryText = `Your telehealth consultation with Tere Health has been completed. The doctor has reviewed your presentation and a summary of your care is outlined above.\n\nIf your condition worsens, call 111 or visit your nearest emergency department straight away.`
  }

  const firstName = (name || '').split(' ')[0] || 'there'
  const dateStr   = new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })

  const rxHtml = rxList
    ? `<div style="background:#F0FDF4;border-left:3px solid #059669;border-radius:4px;padding:10px 14px;margin:8px 0;font-size:14px">
        <strong style="color:#059669">Prescriptions sent</strong><br>
        ${rxList.replace(/\n/g, '<br>')}
       </div>`
    : ''

  const xrHtml = xrList
    ? `<div style="background:#EFF6FF;border-left:3px solid #3B82F6;border-radius:4px;padding:10px 14px;margin:8px 0;font-size:14px">
        <strong style="color:#3B82F6">Imaging requested</strong><br>
        ${xrList.replace(/\n/g, '<br>')}
       </div>`
    : ''

  const accHtml = accList
    ? `<div style="background:#FFF7ED;border-left:3px solid #F59E0B;border-radius:4px;padding:10px 14px;margin:8px 0;font-size:14px">
        <strong style="color:#D97706">ACC claim</strong><br>
        ${accList.replace(/\n/g, '<br>')}
       </div>`
    : ''

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px">
    <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
  </div>

  <div style="padding:24px 28px">
    <p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p>
    <p style="font-size:13px;color:#6B7280;margin:0 0 20px">
      Your telehealth consultation on <strong>${dateStr}</strong>
    </p>

    ${rxHtml}${xrHtml}${accHtml}

    <div style="margin:20px 0;font-size:15px;line-height:1.8;color:#374151;white-space:pre-line">${summaryText.replace(/\n/g, '<br>')}</div>

    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:13px;color:#991B1B;margin-top:24px">
      ⚠️ <strong>If your condition worsens or you're concerned, call 111 or go to your nearest emergency department straight away.</strong>
    </div>

    ${consultationId ? `<div style="margin-top:28px;background:#F0F9FA;border:1px solid #D4EEF0;border-radius:8px;padding:16px;text-align:center">
      <div style="font-size:13px;color:#374151;margin-bottom:10px">How was your consultation today?</div>
      <a href="https://terehealth.co.nz/rate/${consultationId}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:8px 20px;border-radius:99px;font-size:13px;font-weight:700">Rate my consultation ★</a>
      <div style="font-size:11px;color:#9CA3AF;margin-top:8px">Takes 30 seconds. Your feedback helps us improve.</div>
    </div>` : ''}
  </div>

  <div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">
    Tere Health · Marlborough Sounds, New Zealand · <a href="https://terehealth.co.nz" style="color:#0B6E76">terehealth.co.nz</a><br>
    This email is for your records only and does not constitute ongoing medical advice.
    In an emergency, call 111.
  </div>
</body>
</html>`

  if (resendKey && to) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: 'Tere Health <hello@terehealth.co.nz>',
          replyTo: 'terehealthnz@gmail.com',
          to: [to],
          subject: `Your Tere Health consultation summary — ${dateStr}`,
          html,
          text: `Kia ora ${firstName},\n\n${summaryText}\n\nIn an emergency, call 111.\n\nTere Health\nterehealth.co.nz`,
        }),
      })
    } catch (e) { console.error('Resend error:', e) }
  }

  res.status(200).json({ summaryText })
}
