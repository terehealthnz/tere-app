// _provider-reset-request.js — start a provider password reset.
//
// POST /api/provider-reset-request
//   Body: { email }
//
// Generates a 256-bit random token, stores SHA-256(token) in
// provider_password_resets with a 30-minute expiry, and emails the
// plaintext token as a reset link via Resend.
//
// Always returns 200 with a generic success message — never leaks
// whether the email exists (email-enumeration defence).
//
// Per-email throttle: max 3 reset requests per hour. Additional
// requests still return 200 but skip sending. IP-level rate-limits
// are already applied by handler.js.

import { createClient } from '@supabase/supabase-js'
import { randomBytes, createHash } from 'node:crypto'
import { Resend } from 'resend'

const TOKEN_TTL_MINUTES = 30
const MAX_REQUESTS_PER_HOUR = 3

function admin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function sha256(s) {
  return createHash('sha256').update(s).digest('hex')
}

function siteOrigin(req) {
  return process.env.PUBLIC_SITE_ORIGIN
    || (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host']
        ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
        : 'https://terehealth.co.nz')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const emailRaw = String(req.body?.email || '').trim().toLowerCase()
  if (!emailRaw || !emailRaw.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' })
  }

  const supabase = admin()

  const { data: provider } = await supabase
    .from('providers')
    .select('id, first_name, last_name, email, is_active')
    .ilike('email', emailRaw)
    .maybeSingle()

  const genericOk = { ok: true, message: 'If that email is registered, a reset link has been sent.' }

  if (!provider || !provider.is_active) {
    return res.status(200).json(genericOk)
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('provider_password_resets')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', provider.id)
    .gte('created_at', oneHourAgo)

  if ((count || 0) >= MAX_REQUESTS_PER_HOUR) {
    return res.status(200).json(genericOk)
  }

  const token = randomBytes(32).toString('base64url')
  const tokenHash = sha256(token)
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000).toISOString()

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null
  const ua = req.headers['user-agent'] || null

  const { error: insertErr } = await supabase.from('provider_password_resets').insert({
    provider_id: provider.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    ip_address: ip,
    user_agent: ua,
  })

  if (insertErr) {
    console.error('[provider-reset-request] insert failed:', insertErr.message)
    return res.status(500).json({ error: 'Reset request failed' })
  }

  const origin = siteOrigin(req)
  const resetUrl = `${origin}/clinician/reset-password?token=${encodeURIComponent(token)}`
  const firstName = provider.first_name || 'there'

  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: [provider.email],
        subject: 'Reset your Tere Health clinician password',
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px">
    <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
  </div>
  <div style="padding:24px 28px">
    <p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p>
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px">
      A password reset was requested for your Tere Health clinician account. Click the button below to set a new password. This link is valid for <strong>${TOKEN_TTL_MINUTES} minutes</strong> and can only be used once.
    </p>
    <div style="text-align:center;margin:28px 0">
      <a href="${resetUrl}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:14px 32px;border-radius:99px;font-size:15px;font-weight:700">Set a new password →</a>
    </div>
    <p style="font-size:13px;color:#6B7280;line-height:1.6;margin:0 0 8px">If the button doesn't work, paste this link into your browser:</p>
    <p style="font-size:12px;color:#0B6E76;word-break:break-all;margin:0 0 24px">${resetUrl}</p>
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:13px;color:#991B1B">
      Didn't request this? You can safely ignore this email — your current password will keep working. If you're worried someone else is trying to access your account, reply to this email straight away.
    </div>
  </div>
  <div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">
    Tere Health · terehealth.co.nz · Sent to ${provider.email}
  </div>
</body></html>`,
        text: `Kia ora ${firstName},\n\nA password reset was requested for your Tere Health clinician account. Set a new password (valid for ${TOKEN_TTL_MINUTES} minutes, single-use):\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email — your current password will keep working.\n\nTere Health\nterehealth.co.nz`,
      })
    } catch (e) {
      console.error('[provider-reset-request] Resend error:', e.message)
    }
  } else {
    console.warn('[provider-reset-request] RESEND_API_KEY not set — reset link not emailed')
  }

  try {
    await supabase.from('audit_log').insert({
      actor_id: provider.id,
      actor_role: 'system',
      action: 'provider_password_reset_requested',
      target_type: 'provider',
      target_id: provider.id,
      metadata: { email: provider.email, ip, user_agent: ua },
    })
  } catch (e) {
    console.warn('[provider-reset-request] audit-log write failed:', e.message)
  }

  return res.status(200).json(genericOk)
}
