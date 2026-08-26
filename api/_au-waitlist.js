// _au-waitlist.js — AU pre-launch waitlist signup (tere.co.nz).
//
// POST /api/au-waitlist
//   Body: { email, state?, firstName?, phone? }
//
// Writes to waitlist_signups in the AU Supabase project (jkpyxyfqbscdeyxfpxnq).
// Because this endpoint only exists on the tere-app-au Vercel project, its
// VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY point at the AU DB — no
// region routing needed here.
//
// Distinct from _waitlist-signup.js (NZ) because the confirmation email is
// AU-flavoured (000, AHPRA, hello@tere.co.nz, Lifeline). Same DB schema,
// though — the schema-copy script mirrors waitlist_signups into every
// regional Supabase.
//
// Anon-friendly (no auth). Rate-limited by handler.js general 400/15min per IP.

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from './_email-client.js'

function admin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email, state, firstName, phone } = req.body || {}
  const cleanEmail = String(email || '').trim().toLowerCase()
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' })
  }

  const AU_STATES = new Set(['NSW','VIC','QLD','WA','SA','TAS','ACT','NT'])
  const cleanState = state && AU_STATES.has(String(state).toUpperCase())
    ? String(state).toUpperCase()
    : null

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null
  const ua = req.headers['user-agent'] || null

  const supabase = admin()

  const { data, error } = await supabase.from('waitlist_signups').insert({
    email: cleanEmail,
    phone: phone ? String(phone).trim() : null,
    first_name: firstName ? String(firstName).trim() : null,
    region: cleanState,             // reuse existing `region` column for AU state
    source: 'au-landing',
    interests: ['au-beta'],
    ip_address: ip,
    user_agent: ua,
  }).select().single()

  if (error) {
    console.error('[au-waitlist] insert failed:', error.message)
    return res.status(500).json({ error: 'Signup failed. Please try again.' })
  }

  // Confirmation email — best-effort, non-fatal. Skipped if RESEND_API_KEY
  // isn't set on the AU Vercel project yet (early days).
  if (process.env.RESEND_API_KEY) {
    try {
      const displayName = firstName ? String(firstName).trim() : 'there'
      const stateLine = cleanState ? ` in ${cleanState}` : ''
      await sendEmail({
        from: 'Tere Health Australia <hello@tere.co.nz>',
        replyTo: 'hello@tere.co.nz',
        to: [cleanEmail],
        subject: "You're on the Tere Health Australia waitlist",
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1B2A1F;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#2E5539;padding:20px 28px">
    <div style="font-family:Georgia,serif;font-style:italic;color:#B9D3B4;font-size:20px">Tere Health Australia</div>
  </div>
  <div style="padding:24px 28px">
    <p style="font-size:15px;margin:0 0 16px">G'day ${displayName},</p>
    <p style="font-size:14px;color:#3A4A3E;line-height:1.7;margin:0 0 20px">
      Thanks for joining the Tere Health Australia waitlist${stateLine}. We're a telehealth service being built for rural and remote Australia — same-day video consultations with AHPRA-registered clinicians, non-controlled e-prescriptions via eRx to your local pharmacy.
    </p>
    <p style="font-size:14px;color:#3A4A3E;line-height:1.7;margin:0 0 20px">
      We're still setting up the AU entity, AHPRA registration, and pharmacy integrations. We'll email you the moment we start accepting real patients — you'll be among the first.
    </p>
    <p style="font-size:14px;color:#3A4A3E;line-height:1.7;margin:0 0 20px">
      In the meantime, if you have an urgent medical need please see your regular GP or call Healthdirect on <strong>1800 022 222</strong>. In an emergency, call <strong>000</strong>. For mental-health crisis support, Lifeline is <strong>13 11 14</strong> (24/7).
    </p>
    <p style="font-size:14px;color:#3A4A3E;line-height:1.7;margin:0 0 4px">Cheers,</p>
    <p style="font-size:14px;color:#3A4A3E;line-height:1.7;margin:0"><strong>The Tere team</strong></p>
  </div>
  <div style="background:#F7F3EB;padding:16px 28px;border-top:1px solid #DFD6C4;font-size:11px;color:#8A9188">
    Tere Health Australia · tere.co.nz · Sent to ${cleanEmail}
  </div>
</body></html>`,
        text: `G'day ${displayName},\n\nThanks for joining the Tere Health Australia waitlist${stateLine}. We're a telehealth service being built for rural and remote Australia — same-day video consultations with AHPRA-registered clinicians, non-controlled e-prescriptions via eRx to your local pharmacy.\n\nWe're still setting up the AU entity, AHPRA registration, and pharmacy integrations. We'll email you the moment we start accepting real patients — you'll be among the first.\n\nIn the meantime, if you have an urgent medical need please see your regular GP or call Healthdirect on 1800 022 222. In an emergency, call 000. For mental-health crisis support, Lifeline is 13 11 14 (24/7).\n\nCheers,\nThe Tere team\n\ntere.co.nz`,
      })
    } catch (e) {
      console.error('[au-waitlist] Resend error:', e.message)
    }
  }

  return res.status(200).json({ ok: true, id: data?.id })
}
