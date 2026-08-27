// _waitlist-signup.js — pre-launch waitlist signup.
//
// POST /api/waitlist-signup
//   Body: { email, phone?, firstName?, region?, source?, interests? }
//
// Inserts a row in waitlist_signups and sends a confirmation email via
// Resend. Distinct from the mid-session in-clinic waitlist (which lives on
// consultations rows via a different code path).
//
// This endpoint is deliberately anon-friendly — no auth, mild rate-limit
// (handler.js general 100/15min per IP already applies). Duplicate submissions
// from the same email are allowed to fall through so someone signing up
// twice doesn't error; we just insert both rows and dedup at notify time.

import { createClient } from '@supabase/supabase-js'
import { sendEmail , hasEmailProvider} from './_email-client.js'
import { getClientIp } from './_client-ip.js'

function admin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email, phone, firstName, region, source, interests } = req.body || {}
  const cleanEmail = String(email || '').trim().toLowerCase()
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' })
  }

  const ip = getClientIp(req)
  const ua = req.headers['user-agent'] || null

  const supabase = admin()

  const { data, error } = await supabase.from('waitlist_signups').insert({
    email: cleanEmail,
    phone: phone ? String(phone).trim() : null,
    first_name: firstName ? String(firstName).trim() : null,
    region: region ? String(region).trim() : null,
    source: source ? String(source).trim() : null,
    interests: Array.isArray(interests) ? interests.map(String).slice(0, 10) : null,
    ip_address: ip,
    user_agent: ua,
  }).select().single()

  if (error) {
    console.error('[waitlist-signup] insert failed:', error.message)
    return res.status(500).json({ error: 'Signup failed. Please try again.' })
  }

  // Confirmation email — best-effort, non-fatal.
  if (hasEmailProvider()) {
    try {
      const displayName = firstName ? String(firstName).trim() : 'there'
      await sendEmail({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: [cleanEmail],
        subject: 'You\'re on the Tere Health waitlist',
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px">
    <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
  </div>
  <div style="padding:24px 28px">
    <p style="font-size:15px;margin:0 0 16px">Kia ora ${displayName},</p>
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px">
      Thanks for joining the Tere Health waitlist. We're a New Zealand telehealth service in the final stages of pre-launch — same-day video, phone, and asynchronous consultations with MCNZ-registered Emergency Medicine physicians.
    </p>
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px">
      We'll email you in the coming weeks with a link to book your first consultation as soon as bookings open. You'll be among the first — the list is small.
    </p>
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px">
      In the meantime, if you have an urgent medical need, please see your usual GP or call Healthline on 0800 611 116. In an emergency, dial 111.
    </p>
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 4px">Ngā mihi,</p>
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0"><strong>The Tere Health team</strong></p>
  </div>
  <div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">
    Tere Health · terehealth.co.nz · Sent to ${cleanEmail}
  </div>
</body></html>`,
        text: `Kia ora ${displayName},\n\nThanks for joining the Tere Health waitlist. We're a New Zealand telehealth service in the final stages of pre-launch — same-day video, phone, and asynchronous consultations with MCNZ-registered Emergency Medicine physicians.\n\nWe'll email you in the coming weeks with a link to book your first consultation as soon as bookings open. You'll be among the first — the list is small.\n\nIn the meantime, if you have an urgent medical need, please see your usual GP or call Healthline on 0800 611 116. In an emergency, dial 111.\n\nNgā mihi,\nThe Tere Health team\n\nterehealth.co.nz`,
      })
    } catch (e) {
      console.error('[waitlist-signup] Resend error:', e.message)
    }
  }

  return res.status(200).json({ ok: true, id: data?.id })
}
