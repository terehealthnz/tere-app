// api/send-email.js — patient post-consultation summary email + waitlist open notification
import { aiCall, isConfigured } from './_ai.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { to, name, sections = {}, notes = {}, actions = [], consult = {}, consultationId, isOpenNotification, resumeId } = req.body
  const resendKey = process.env.RESEND_API_KEY

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
