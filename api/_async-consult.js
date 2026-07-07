import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { aiCall, isConfigured } from './_ai.js'

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY) }

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
    if (!isConfigured()) return res.status(200).json({ suitable: true })
    try {
      const answer = (await aiCall({
        tier: 'haiku',
        maxTokens: 5,
        user: `NZ patient health complaint: "${complaint.slice(0, 500)}"\n\nCan this be handled by async message consultation (provider replies within business hours, no live call)?\n\nSUITABLE (reply YES): cough, cold, flu, sore throat, runny nose, ear pain, eye infection, skin rash or condition, repeat or ongoing prescription, uncomplicated UTI (adult female), minor wound or injury, referral or imaging request, medical certificate, non-urgent advice, known condition follow-up, gastro symptoms without red flags, mild headache, mild back pain, minor sports injury.\n\nNOT SUITABLE (reply NO) — only if clearly urgent or emergency: chest pain or tightness, acute shortness of breath or inability to breathe, severe crushing pain, suspected stroke or sudden neurological deficit, severe allergic reaction or anaphylaxis, active mental health crisis or suicidal ideation, high fever with stiff neck or rash, major trauma or uncontrolled bleeding.\n\nWhen in doubt, reply YES. Only reply NO if the complaint is clearly an emergency.\n\nReply YES or NO only.`,
      })).trim().toUpperCase()
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
      const pi = await getStripe().paymentIntents.create({
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
        await getStripe().paymentIntents.capture(consult.payment_intent_id)
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

  // ── AI polish of provider draft message ──────────────────────────────────────
  if (action === 'polish_response') {
    const { draft, consultationId } = req.body
    if (!draft?.trim()) return res.status(400).json({ error: 'draft required' })
    if (!isConfigured()) return res.status(200).json({ polished: draft })

    let context = ''
    let patientLanguage = 'en'
    if (consultationId) {
      const { data: consult } = await supabase.from('consultations')
        .select('chief_complaint, patient_first_name, patient_allergies, medications, preferred_language').eq('id', consultationId).single()
      if (consult) {
        context = `Patient: ${consult.patient_first_name || 'Patient'}\nComplaint: ${consult.chief_complaint || ''}`
        if (consult.patient_allergies && consult.patient_allergies !== 'None') context += `\nAllergies: ${consult.patient_allergies}`
        if (consult.medications) context += `\nCurrent medications: ${consult.medications}`
        patientLanguage = consult.preferred_language || 'en'
      }
    }

    const teReoBlock = patientLanguage === 'mi' ? `
- The patient has selected Te Reo Māori — rewrite in Te Reo Māori where possible; use English for medical terms lacking established Te Reo equivalents, with a brief Te Reo explanation.
- Any critical safety warning (e.g. call 111) must appear in both Te Reo AND English — e.g. "Waea atu ki te 111 ināianei — Call 111 immediately". Never render a safety warning in Te Reo only.
- Acknowledge whānau context if the patient mentioned whānau being present or involved in their care.` : ''

    const prompt = `You are a medical communications specialist helping a New Zealand telehealth provider polish their patient message.

Rewrite the following draft as a warm, professional, clear response. Rules:
- Warm and empathetic tone — not cold or overly formal
- Plain English (NZ English spelling) — explain medical terms if used
- Correct any grammar or spelling errors
- Preserve every clinical fact and instruction exactly — do not add or remove clinical content
- Keep appropriate length — do not pad or truncate meaning
- Do NOT add a greeting or sign-off — those are added automatically
- Return ONLY the rewritten message body, nothing else${teReoBlock}

${context ? `Context:\n${context}\n\n` : ''}Draft to polish:
${draft}`

    try {
      const polished = (await aiCall({ tier: 'haiku', user: prompt, maxTokens: 1000 })).trim() || draft
      return res.status(200).json({ polished })
    } catch {
      return res.status(200).json({ polished: draft })
    }
  }

  // ── Provider refers patient to GP or ER (no charge) ─────────────────────────
  if (action === 'in_person') {
    const { consultationId, referralType, notes, providerId, providerName } = req.body
    if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

    const { data: consult, error: cErr } = await supabase
      .from('consultations').select('*').eq('id', consultationId).single()
    if (cErr || !consult) return res.status(404).json({ error: 'Not found' })

    const now = new Date().toISOString()
    const venueLabel = referralType === 'er' ? 'nearest Emergency Department' : 'GP'
    const responseNote = `${providerName || 'Your provider'} recommends you be seen in person at your ${venueLabel}. No charge has been applied.${notes ? ' ' + notes : ''}`
    const { error } = await supabase.from('consultations').update({
      status: 'complete',
      outcome: 'in_person_referral',
      async_response: responseNote,
      async_responded_at: now,
      async_responded_by: providerId || null,
      provider_display_name: providerName || null,
      notes_finalised: true,
      notes_finalised_at: now,
      completed_at: now,
      updated_at: now,
    }).eq('id', consultationId)
    if (error) return res.status(500).json({ error: error.message })

    // Cancel payment — no charge for in-person referral
    if (consult.payment_intent_id) {
      try {
        await getStripe().paymentIntents.cancel(consult.payment_intent_id)
      } catch (e) {
        console.error('[async-consult] Stripe cancel failed:', e.message)
      }
    }

    // Email patient
    if (consult.patient_email) {
      const firstName = consult.patient_first_name || 'there'
      const dateStr = new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
      const notesHtml = notes ? `<div style="font-size:14px;line-height:1.7;color:#374151;margin-top:8px">${notes.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</div>` : ''
      const erWarning = referralType === 'er'
        ? '🚨 <strong>If you are feeling very unwell, call 111 or go directly to your nearest Emergency Department now.</strong>'
        : '⚠️ <strong>If your condition worsens before you can see your GP — call 111 or go to your nearest Emergency Department.</strong>'
      try {
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: 'Tere Health <hello@terehealth.co.nz>',
          replyTo: 'terehealthnz@gmail.com',
          to: [consult.patient_email],
          subject: `Action needed — your provider recommends in-person care`,
          html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
<div style="background:#0D2B45;padding:20px 28px">
  <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
  <div style="color:rgba(212,238,240,.5);font-size:10px;letter-spacing:2px;text-transform:uppercase;margin-top:2px">He tere, he ora</div>
</div>
<div style="padding:24px 28px">
  <p style="font-size:15px;margin:0 0 8px">Kia ora ${firstName},</p>
  <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px">${providerName || 'Your Tere Health provider'} has reviewed your message and recommends you be seen <strong>in person</strong>.</p>
  <div style="background:#FEF9EC;border-left:4px solid #D97706;border-radius:4px;padding:16px 18px;margin:0 0 20px">
    <div style="font-size:13px;font-weight:700;color:#92400E;margin-bottom:4px">Recommendation: visit your ${venueLabel}</div>
    ${notesHtml}
  </div>
  <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:12px 16px;font-size:13px;color:#065F46;margin-bottom:20px">
    ✅ <strong>No charge has been applied.</strong> Your payment authorisation has been released.
  </div>
  <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:13px;color:#991B1B">${erWarning}</div>
</div>
<div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">
  He tere, he ora · Tere Health · <a href="https://terehealth.co.nz" style="color:#0B6E76">terehealth.co.nz</a> · ${dateStr}<br>
  This message does not constitute ongoing medical advice. In an emergency, call 111.
</div>
</body></html>`,
          text: `Kia ora ${firstName},\n\n${providerName || 'Your provider'} recommends you be seen in person at your ${venueLabel}.\n${notes ? notes + '\n' : ''}\nNO CHARGE: Your payment authorisation has been released.\n\n${referralType === 'er' ? 'If very unwell, call 111 now.' : 'If condition worsens before seeing your GP, call 111.'}\n\nHe tere, he ora.\nTere Health`,
        })
      } catch (e) {
        console.error('[async-consult] in_person email failed:', e.message)
      }
    }

    // SMS patient
    if (consult.patient_phone) {
      fetch(`${process.env.VITE_APP_URL || 'https://tere.co.nz'}/api/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tere-api-key': process.env.TERE_API_KEY || '' },
        body: JSON.stringify({ to: consult.patient_phone, type: 'in_person',
          message: `Tere Health: Your provider recommends in-person care at your ${venueLabel}. No charge applied. Check your email.` }),
      }).catch(() => {})
    }

    return res.status(200).json({ ok: true })
  }

  // ── Upgrade message consultation to live video/phone ──────────────────────
  if (action === 'upgrade_to_live') {
    const { consultationId, consultationType, message, providerId, providerName } = req.body
    if (!consultationId || !consultationType) return res.status(400).json({ error: 'consultationId and consultationType required' })

    const { data: consult, error: cErr } = await supabase
      .from('consultations').select('*').eq('id', consultationId).single()
    if (cErr || !consult) return res.status(404).json({ error: 'Not found' })

    const { error } = await supabase.from('consultations').update({
      consultation_type: consultationType,
      consultation_subtype: 'live',
      status: 'waiting',
      updated_at: new Date().toISOString(),
    }).eq('id', consultationId)
    if (error) return res.status(500).json({ error: error.message })

    const typeLabel = consultationType === 'phone' ? 'phone call' : 'video call'
    const appUrl = process.env.VITE_APP_URL || 'https://tere.co.nz'

    // Email patient
    if (consult.patient_email) {
      const firstName = consult.patient_first_name || 'there'
      const dateStr = new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
      const messageHtml = message ? `<div style="background:#F0F9FA;border-left:4px solid #0B6E76;border-radius:4px;padding:16px 18px;margin:0 0 20px;font-size:14px;line-height:1.7;color:#1A2A33">${message.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</div>` : ''
      try {
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: 'Tere Health <hello@terehealth.co.nz>',
          replyTo: 'terehealthnz@gmail.com',
          to: [consult.patient_email],
          subject: `Your provider would like a ${typeLabel} with you`,
          html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
<div style="background:#0D2B45;padding:20px 28px">
  <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
  <div style="color:rgba(212,238,240,.5);font-size:10px;letter-spacing:2px;text-transform:uppercase;margin-top:2px">He tere, he ora</div>
</div>
<div style="padding:24px 28px">
  <p style="font-size:15px;margin:0 0 8px">Kia ora ${firstName},</p>
  <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px">${providerName || 'Your Tere Health provider'} would like to speak with you directly on a <strong>${typeLabel}</strong>.</p>
  ${messageHtml}
  <div style="text-align:center;margin:28px 0">
    <a href="${appUrl}/triage" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:14px 32px;border-radius:99px;font-size:16px;font-weight:700">Rejoin for ${typeLabel} →</a>
  </div>
  <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:13px;color:#991B1B">
    ⚠️ <strong>If your condition worsens before we connect — call 111 or go to your nearest Emergency Department.</strong>
  </div>
</div>
<div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">
  He tere, he ora · Tere Health · <a href="https://terehealth.co.nz" style="color:#0B6E76">terehealth.co.nz</a> · ${dateStr}<br>
  In an emergency, call 111.
</div>
</body></html>`,
          text: `Kia ora ${firstName},\n\n${providerName || 'Your provider'} would like a ${typeLabel} with you.\n\nPlease return to ${appUrl}/triage to join the queue.\n\n${message || ''}\n\nIf your condition worsens, call 111.\n\nHe tere, he ora.\nTere Health`,
        })
      } catch (e) {
        console.error('[async-consult] upgrade email failed:', e.message)
      }
    }

    // SMS patient
    if (consult.patient_phone) {
      fetch(`${process.env.VITE_APP_URL || 'https://tere.co.nz'}/api/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tere-api-key': process.env.TERE_API_KEY || '' },
        body: JSON.stringify({ to: consult.patient_phone, type: 'upgrade_to_live',
          message: `Tere Health: Your provider would like a ${typeLabel} with you. Please return to ${appUrl}/triage to join.` }),
      }).catch(() => {})
    }

    return res.status(200).json({ ok: true })
  }

  // ── Notify patient that provider has a question ───────────────────────────────
  if (action === 'notify_question') {
    const { consultationId, providerName, questionText } = req.body
    if (!consultationId) return res.status(400).json({ error: 'consultationId required' })
    const { data: consult } = await supabase.from('consultations').select('patient_email,patient_first_name,patient_phone').eq('id', consultationId).single()
    if (!consult) return res.status(404).json({ error: 'Not found' })

    const firstName = consult.patient_first_name || 'there'
    const appUrl = process.env.VITE_APP_URL || 'https://tere.co.nz'
    const safeQ = (questionText || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')

    if (consult.patient_email) {
      try {
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: 'Tere Health <hello@terehealth.co.nz>',
          replyTo: 'terehealthnz@gmail.com',
          to: [consult.patient_email],
          subject: `Your provider has a question — please reply`,
          html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
<div style="background:#0D2B45;padding:20px 28px">
  <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
</div>
<div style="padding:24px 28px">
  <p style="font-size:15px;margin:0 0 8px">Kia ora ${firstName},</p>
  <p style="font-size:14px;color:#6B7280;margin:0 0 20px">${providerName || 'Your Tere Health provider'} is reviewing your message and has a question for you.</p>
  <div style="background:#F0F9FA;border-left:4px solid #0B6E76;border-radius:4px;padding:16px 18px;margin:0 0 20px">
    <div style="font-size:11px;font-weight:700;color:#0B6E76;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Question from your provider</div>
    <div style="font-size:15px;line-height:1.8;color:#1A2A33">${safeQ}</div>
  </div>
  <div style="text-align:center;margin:24px 0">
    <a href="${appUrl}/async-message/${consultationId}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:14px 28px;border-radius:99px;font-size:15px;font-weight:700">Reply to your provider →</a>
  </div>
  <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:13px;color:#991B1B">
    ⚠️ If your condition worsens while waiting — call <strong>111</strong> or go to your nearest emergency department.
  </div>
</div>
<div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">
  He tere, he ora · Tere Health · <a href="https://terehealth.co.nz" style="color:#0B6E76">terehealth.co.nz</a>
</div>
</body></html>`,
          text: `Kia ora ${firstName},\n\n${providerName || 'Your provider'} has a question:\n\n${questionText || ''}\n\nReply at: ${appUrl}/async-message/${consultationId}\n\nIf condition worsens, call 111.\n\nHe tere, he ora.\nTere Health`,
        })
      } catch (e) {
        console.error('[async-consult] notify_question email failed:', e.message)
      }
    }

    if (consult.patient_phone) {
      fetch(`${process.env.VITE_APP_URL || 'https://tere.co.nz'}/api/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tere-api-key': process.env.TERE_API_KEY || '' },
        body: JSON.stringify({ to: consult.patient_phone, type: 'provider_question',
          message: `Tere Health: Your provider has a question about your message — check your email to reply.` }),
      }).catch(() => {})
    }

    return res.status(200).json({ ok: true })
  }

  // ── Auto-generate draft response from patient data + provider messages ───────
  if (action === 'generate_summary') {
    const { consultationId, providerMessages = [] } = req.body
    if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

    const { data: c } = await supabase.from('consultations')
      .select('chief_complaint,async_symptom_detail,async_urgency,async_requests,patient_first_name,patient_allergies,medications,medical_history,acc_eligible,preferred_language')
      .eq('id', consultationId).single()
    if (!c) return res.status(404).json({ error: 'Consultation not found' })

    const providerText = providerMessages
      .filter(m => m.sender === 'provider' && m.message?.trim())
      .map(m => m.message.trim())
      .join('\n\n')

    // No AI or no provider messages — return structured template
    if (!isConfigured() || !providerText) {
      const lines = []
      if (c.chief_complaint) lines.push(`Thank you for contacting us regarding your ${c.chief_complaint}.`)
      if (providerText) lines.push(providerText)
      return res.status(200).json({ summary: lines.join('\n\n') })
    }

    const patientLines = [
      `Chief complaint: ${c.chief_complaint || 'Not specified'}`,
      c.async_symptom_detail ? `Symptom detail: ${c.async_symptom_detail}` : null,
      c.async_urgency ? `Urgency: ${c.async_urgency}` : null,
      c.medical_history && c.medical_history !== 'None' ? `Medical history: ${c.medical_history}` : null,
      c.medications && c.medications !== 'None' ? `Current medications: ${c.medications}` : null,
      c.patient_allergies && c.patient_allergies !== 'None' && c.patient_allergies !== 'NKDA' ? `Allergies: ${c.patient_allergies}` : null,
      c.acc_eligible === 'yes' ? 'ACC: eligible injury' : null,
    ].filter(Boolean).join('\n')

    const teReoBlock = c.preferred_language === 'mi' ? `

Cultural + language context:
- The patient has selected Te Reo Māori as their preferred language.
- Write the response in Te Reo Māori where possible. For medical terms that do not have established Te Reo equivalents, use the English term with a brief Te Reo explanation alongside it.
- If the patient's message referred to whānau being present or involved in their care, acknowledge that whānau context.
- Any critical safety warning (e.g. call 111) must appear in both Te Reo AND English — e.g. "Waea atu ki te 111 ināianei — Call 111 immediately". Never render a safety warning in Te Reo only.
- If you are uncertain of the correct Te Reo medical term, use English with a brief Te Reo explanation.
` : ''

    const prompt = `You are a New Zealand GP writing a final response to a patient after an async message consultation.

Patient information:
${patientLines}

The provider sent the following messages to the patient during the consultation:
${providerText}
${teReoBlock}
Write a concise, warm, professional closing response (3–5 sentences) that:
1. Briefly states your assessment of what is going on
2. Summarises the management plan based on what the provider communicated
3. States clearly when to seek further care (use NZ-appropriate language)

Rules:
- Address the patient directly ("I" / "you") — do not use third person
- Plain English, NZ spelling${c.preferred_language === 'mi' ? ' (write in Te Reo Māori as directed above)' : ''}
- Do NOT add a greeting or sign-off — those are added separately
- Do NOT add information not already in the provider messages
- Return ONLY the response body, nothing else`

    try {
      const summary = (await aiCall({ tier: 'haiku', user: prompt, maxTokens: 500 })).trim() || providerText
      return res.status(200).json({ summary })
    } catch {
      return res.status(200).json({ summary: providerText })
    }
  }

  return res.status(400).json({ error: 'Invalid action' })
}
