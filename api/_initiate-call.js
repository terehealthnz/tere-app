import { AccessToken } from 'livekit-server-sdk'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { consultationId, providerId, providerName } = req.body
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: consult, error: fetchErr } = await supabase
    .from('consultations')
    .select('*')
    .eq('id', consultationId)
    .single()

  if (fetchErr || !consult) return res.status(404).json({ error: 'Consultation not found' })

  const startedAt = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('consultations')
    .update({
      status: 'in_progress',
      started_at: startedAt,
      ...(providerId ? { provider_id: providerId } : {}),
      ...(providerName ? { provider_display_name: providerName } : {}),
    })
    .eq('id', consultationId)

  if (updateErr) return res.status(500).json({ error: updateErr.message })

  // Payment is captured at note completion (not at call start) to allow method flexibility

  // Email patient — your doctor is ready
  const resendKey = process.env.RESEND_API_KEY
  const appUrl = process.env.VITE_APP_URL || 'https://terehealth.co.nz'
  const firstName = consult.patient_first_name || 'there'
  const doctorName = providerName || 'Dr Herling'
  const consultType = consult.consultation_type || 'video'
  const callJoinUrl = `${appUrl}/call`

  if (resendKey && consult.patient_email) {
    const subject = `${doctorName} is ready for your ${consultType === 'phone' ? 'phone call' : 'video consultation'}`
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px">
    <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
  </div>
  <div style="padding:24px 28px">
    <p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p>
    <p style="font-size:16px;font-weight:700;color:#0B6E76;margin:0 0 16px">
      ${doctorName} is ready for your consultation.
    </p>
    <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 24px">
      ${consultType === 'phone'
        ? 'Click the button below to join your audio consultation. If you have trouble connecting, we may also try calling your phone.'
        : 'Click the button below to join your video consultation now.'}
    </p>
    <div style="text-align:center;margin:28px 0">
      <a href="${callJoinUrl}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:14px 32px;border-radius:99px;font-size:16px;font-weight:700">
        ${consultType === 'phone' ? 'Join audio call →' : 'Join video call →'}
      </a>
    </div>
    <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:12px 16px;font-size:13px;color:#065F46;margin-top:24px">
      ✓ Your card hold is active. You'll be charged only for the method used, once your consultation is complete.
    </div>
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:13px;color:#991B1B;margin-top:12px">
      ⚠️ <strong>In an emergency, call 111.</strong>
    </div>
  </div>
  <div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">
    Tere Health · terehealth.co.nz
  </div>
</body></html>`

    const text = `Kia ora ${firstName},\n\n${doctorName} is ready for your consultation.\n\nJoin here: ${callJoinUrl}${consultType === 'phone' ? '\n\nIf you have trouble connecting, we may also try calling your phone.' : ''}\n\nIn an emergency, call 111.\n\nTere Health`

    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: [consult.patient_email],
        subject,
        html,
        text,
      }),
    }).catch(e => console.error('[initiate-call] email failed:', e.message))
  }

  // Push notification to patient (if they have the app installed)
  fetch(`${appUrl}/api/push-notify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tere-api-key': process.env.TERE_API_KEY,
    },
    body: JSON.stringify({
      type: 'patient_called',
      consultationId,
      ...(consult.user_id ? { userId: consult.user_id } : {}),
      providerName: providerName || 'Your doctor',
      consultUrl: '/call',
    }),
  }).catch(e => console.error('[initiate-call] push failed:', e.message))

  // Generate LiveKit token for provider
  const lkApiKey = process.env.LIVEKIT_API_KEY
  const lkApiSecret = process.env.LIVEKIT_API_SECRET
  const lkUrl = process.env.LIVEKIT_URL

  let token = null
  if (lkApiKey && lkApiSecret) {
    const at = new AccessToken(lkApiKey, lkApiSecret, {
      identity: `provider-${consultationId.slice(0, 8)}`,
      ttl: 7200,
    })
    at.addGrant({
      roomJoin: true,
      room: `tere-${consultationId.slice(0, 8)}`,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    })
    token = await at.toJwt()
  }

  return res.status(200).json({ ok: true, token, serverUrl: lkUrl })
}
