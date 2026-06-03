import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// NZ business hours deadline (8am–6pm Mon–Fri)
// Pure UTC arithmetic — no string parsing, no Intl, works on any Node version
function calcDeadline() {
  const now = new Date()

  // NZ DST: UTC+13 Oct–Mar (NZDT), UTC+12 Apr–Sep (NZST)
  // Use UTC month to decide; transitions are within ±1 day of exact — good enough
  const utcMonth = now.getUTCMonth() // 0-indexed
  const nzOffsetMs = (utcMonth >= 9 || utcMonth <= 2) ? 13 * 3600000 : 12 * 3600000

  // NZ local time as fake-UTC so getUTC* methods work
  const nzMs   = now.getTime() + nzOffsetMs
  const nzDate = new Date(nzMs)
  const day  = nzDate.getUTCDay()     // 0=Sun … 6=Sat
  const h    = nzDate.getUTCHours()
  const min  = h * 60 + nzDate.getUTCMinutes()
  const inBH = day >= 1 && day <= 5 && min >= 480 && min < 1080

  const toUtc = ms => new Date(ms - nzOffsetMs).toISOString()

  if (inBH) {
    const dlMs   = nzMs + 4 * 60 * 60 * 1000
    const dlDate = new Date(dlMs)
    if (dlDate.getUTCHours() * 60 + dlDate.getUTCMinutes() < 1080) return toUtc(dlMs)
    // Cap at 18:00 NZ
    const capMs = Date.UTC(nzDate.getUTCFullYear(), nzDate.getUTCMonth(), nzDate.getUTCDate(), 18, 0, 0, 0)
    return toUtc(capMs)
  }
  // Next business day 10am NZ
  let next = new Date(Date.UTC(nzDate.getUTCFullYear(), nzDate.getUTCMonth(), nzDate.getUTCDate(), 10, 0, 0, 0))
  do { next = new Date(next.getTime() + 86400000) } while (next.getUTCDay() === 0 || next.getUTCDay() === 6)
  return toUtc(next.getTime())
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const supabase = getSupabase()
  const { action } = req.body || {}

  // ── Suitability check ──────────────────────────────────────────────────────
  if (action === 'check_suitability') {
    const { complaint } = req.body
    if (!complaint?.trim()) return res.status(200).json({ suitable: true })
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return res.status(200).json({ suitable: true })
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 5,
          messages: [{ role: 'user', content: `NZ patient health complaint: "${complaint.slice(0, 500)}"\n\nCan this be handled by async message consultation (provider replies within 4 hours, no live call)?\n\nSUITABLE (reply YES): cough, cold, flu, sore throat, runny nose, ear pain, eye infection, skin rash or condition, repeat or ongoing prescription, uncomplicated UTI (adult female), minor wound or injury, referral or imaging request, medical certificate, non-urgent advice, known condition follow-up, gastro symptoms without red flags, mild headache, mild back pain, minor sports injury.\n\nNOT SUITABLE (reply NO) — only if clearly urgent or emergency: chest pain or tightness, acute shortness of breath or inability to breathe, severe crushing pain, suspected stroke or sudden neurological deficit, severe allergic reaction or anaphylaxis, active mental health crisis or suicidal ideation, high fever with stiff neck or rash, major trauma or uncontrolled bleeding.\n\nWhen in doubt, reply YES. Only reply NO if the complaint is clearly an emergency.\n\nReply YES or NO only.` }],
        }),
      })
      const d = await r.json()
      const answer = (d.content?.[0]?.text || '').trim().toUpperCase()
      return res.status(200).json({ suitable: !answer.startsWith('NO') })
    } catch {
      return res.status(200).json({ suitable: true })
    }
  }

  // ── Create payment intent ($25, authorise only — captured on provider response) ──
  if (action === 'create_intent') {
    const { consultationId } = req.body
    if (!consultationId) return res.status(400).json({ error: 'consultationId required' })
    try {
      const pi = await stripe.paymentIntents.create({
        amount: 2500, currency: 'nzd', capture_method: 'manual',
        metadata: { consultationId, type: 'async_message' },
        description: 'Tere Health — message consultation ($25)',
      })
      return res.status(200).json({ clientSecret: pi.client_secret })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── Submit async message (after Stripe confirms payment) ───────────────────
  if (action === 'submit') {
    const { consultationId, paymentIntentId, symptomDetail, symptomProgression,
            previousTreatment, previousEpisodes, dailyImpact,
            photoUrls, requests, urgency } = req.body
    if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

    const { data: consult, error: cErr } = await supabase
      .from('consultations').select('*').eq('id', consultationId).single()
    if (cErr || !consult) return res.status(404).json({ error: 'Consultation not found' })

    const deadline = calcDeadline()
    const { error } = await supabase.from('consultations').update({
      consultation_type: 'message',
      consultation_subtype: 'async_message',
      status: 'waiting',
      async_symptom_detail: symptomDetail || null,
      async_symptom_progression: symptomProgression || null,
      async_previous_treatment: previousTreatment || null,
      async_previous_episodes: previousEpisodes || null,
      async_daily_impact: dailyImpact || null,
      async_photo_urls: photoUrls || [],
      async_requests: requests || [],
      async_urgency: urgency || null,
      async_deadline: deadline,
      payment_intent_id: paymentIntentId || null,
      payment_amount: 2500,
      updated_at: new Date().toISOString(),
    }).eq('id', consultationId)

    if (error) return res.status(500).json({ error: error.message })

    // Notify admin
    fetch(`${process.env.VITE_APP_URL || 'https://tere.co.nz'}/api/push-notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tere-api-key': process.env.TERE_API_KEY || '' },
      body: JSON.stringify({ type: 'new_message', title: 'New message consultation',
        body: `${consult.patient_first_name || ''} ${consult.patient_last_name || ''} — ${consult.chief_complaint || ''}` }),
    }).catch(() => {})

    // SMS patient
    if (consult.patient_phone) {
      const dlLabel = new Date(deadline).toLocaleString('en-NZ', {
        timeZone: 'Pacific/Auckland', weekday: 'short', hour: '2-digit', minute: '2-digit',
      })
      fetch(`${process.env.VITE_APP_URL || 'https://tere.co.nz'}/api/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tere-api-key': process.env.TERE_API_KEY || '' },
        body: JSON.stringify({ to: consult.patient_phone, type: 'async_submitted',
          message: `Tere Health: Your message has been received. Your provider will respond by ${dlLabel}. We'll text you when ready.` }),
      }).catch(() => {})
    }

    return res.status(200).json({ ok: true, deadline, consultationId })
  }

  // ── Provider sends response ────────────────────────────────────────────────
  if (action === 'respond') {
    const { consultationId, responseText, providerId, providerName,
            isAcc, accClaimRef, injuryDate, injuryDetails } = req.body
    if (!consultationId || !responseText?.trim())
      return res.status(400).json({ error: 'consultationId and responseText required' })

    const { data: consult, error: cErr } = await supabase
      .from('consultations').select('*').eq('id', consultationId).single()
    if (cErr || !consult) return res.status(404).json({ error: 'Not found' })

    const now = new Date().toISOString()
    const updateData = {
      status: 'complete',
      async_response: responseText,
      async_responded_at: now,
      async_responded_by: providerId || null,
      notes_finalised: true,
      notes_finalised_at: now,
      provider_display_name: providerName || null,
      outcome: 'async_response',
      completed_at: now,
      updated_at: now,
    }

    if (isAcc) {
      updateData.acc_eligible = 'yes'
      updateData.acc_injury_date = injuryDate || null
      updateData.acc_injury_details = injuryDetails || null
      updateData.acc_claims = {
        ref: accClaimRef || null,
        lodged_at: now,
        amount_cents: 3750,
        source: 'async_message',
      }
      // patient $25 already charged + ACC $37.50 = $62.50 total
      updateData.payment_amount = 6250
    }

    const { error } = await supabase.from('consultations').update(updateData).eq('id', consultationId)

    if (error) return res.status(500).json({ error: error.message })

    // Capture the authorised payment now that provider has responded
    if (consult.payment_intent_id) {
      try {
        await stripe.paymentIntents.capture(consult.payment_intent_id)
      } catch (e) {
        console.error('[async-consult] Stripe capture failed:', e.message)
        // Non-fatal — DB is already updated; flag for manual follow-up
      }
    }

    // Email patient
    if (consult.patient_email) {
      const firstName = consult.patient_first_name || 'there'
      const dateStr = new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
      const refId = consultationId.slice(0, 8).toUpperCase()
      const safeResponse = responseText.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
      const accClaimHtml = isAcc ? `
  <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:12px 16px;font-size:13px;color:#1D4ED8;margin-top:12px">
    <strong>ACC claim lodged</strong><br>
    Your ACC claim has been lodged. Your $25 message fee has been applied as your ACC co-payment.${accClaimRef ? `<br>ACC claim reference: <strong>${accClaimRef}</strong>` : ''}
  </div>` : ''
      const accClaimText = isAcc ? `\nACC CLAIM: Your ACC claim has been lodged. Your $25 message fee is your co-payment.${accClaimRef ? ` Claim ref: ${accClaimRef}` : ''}` : ''

      try {
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: 'Tere Health <hello@terehealth.co.nz>',
          replyTo: 'terehealthnz@gmail.com',
          to: [consult.patient_email],
          subject: `Your Tere Health provider has responded — ${firstName}`,
          html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
<div style="background:#0D2B45;padding:20px 28px">
  <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
  <div style="color:rgba(212,238,240,.5);font-size:10px;letter-spacing:2px;text-transform:uppercase;margin-top:2px">He tere, he ora</div>
</div>
<div style="padding:24px 28px">
  <p style="font-size:15px;margin:0 0 8px">Kia ora ${firstName},</p>
  <p style="font-size:14px;color:#6B7280;margin:0 0 20px">${providerName || 'Your Tere Health provider'} has reviewed your message and responded.</p>
  <div style="background:#F0F9FA;border-left:4px solid #0B6E76;border-radius:4px;padding:16px 18px;margin:0 0 20px">
    <div style="font-size:11px;font-weight:700;color:#0B6E76;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Provider response</div>
    <div style="font-size:15px;line-height:1.8;color:#1A2A33">${safeResponse}</div>
  </div>
  ${accClaimHtml}
  <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:13px;color:#991B1B;margin-top:20px">
    ⚠️ <strong>If your condition worsens or you have new symptoms — call 111 or go to your nearest emergency department straight away.</strong><br><br>
    You can start a new consultation anytime at <a href="https://terehealth.co.nz" style="color:#991B1B">terehealth.co.nz</a>
  </div>
  <div style="margin-top:24px;background:#F8FAFC;border-radius:8px;padding:14px 16px;font-size:12px;color:#9CA3AF">
    Provider: ${providerName || 'Tere Health'} &nbsp;·&nbsp; Date: ${dateStr} &nbsp;·&nbsp; Ref: ${refId} &nbsp;·&nbsp; Fee: ${isAcc ? '$62.50 (ACC $37.50 + co-payment $25)' : '$25'}
  </div>
</div>
<div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">
  He tere, he ora · Tere Health · <a href="https://terehealth.co.nz" style="color:#0B6E76">terehealth.co.nz</a><br>
  This response does not constitute ongoing medical advice. In an emergency, call 111.
</div>
</body></html>`,
          text: `Kia ora ${firstName},\n\n${providerName || 'Your provider'} has responded to your message.\n\nPROVIDER RESPONSE:\n${responseText}\n${accClaimText}\nIf your condition worsens, call 111 immediately.\n\nRef: ${refId} · Fee: ${isAcc ? '$62.50 (ACC + co-payment)' : '$25'}\n\nHe tere, he ora.\nTere Health`,
        })
      } catch (e) {
        console.error('[async-consult] Email failed:', e.message)
      }
    }

    // SMS patient
    if (consult.patient_phone) {
      fetch(`${process.env.VITE_APP_URL || 'https://tere.co.nz'}/api/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tere-api-key': process.env.TERE_API_KEY || '' },
        body: JSON.stringify({ to: consult.patient_phone, type: 'async_response',
          message: `Tere Health: Your provider has responded — check your email. If your condition worsens, call 111.` }),
      }).catch(() => {})
    }

    // Payroll: $5 private, $8 ACC (extra for claim paperwork)
    if (providerId) {
      supabase.from('payroll_events').insert({
        provider_id: providerId, consultation_id: consultationId,
        event_type: 'async_response', amount_cents: isAcc ? 800 : 500, created_at: now,
      }).then(() => {}).catch(() => {})
    }

    return res.status(200).json({ ok: true })
  }

  return res.status(400).json({ error: 'Invalid action' })
}
