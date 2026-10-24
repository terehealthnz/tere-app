// Day-after thank-you email cron.
//
// Runs daily (09:00 NZT, 20:00 UTC during NZDT). Finds consults whose
// notes were finalised in the previous 23-25 hour window, hasn't already
// been thanked, isn't sandbox, has a patient email on file, and has no
// open HDC complaint attached. Sends a thank-you with two sentiment
// buttons that land on /feedback.
//
// Manual test: GET /api/cron-thank-you-emails?secret=<CRON_SECRET>&force=1
//   force=1 runs the scan with the full window still in effect but
//   returns {sent, errors} without 304'ing on empty.

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, hasEmailProvider } from './_email-client.js'

const ADMIN_EMAIL = 'terehealthnz@gmail.com'
const BATCH_LIMIT = 200
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function tokenSecret() {
  return process.env.FEEDBACK_TOKEN_SECRET || process.env.CRON_SECRET || ''
}

export function signFeedbackToken(consultationId, rating, expiryMs) {
  const secret = tokenSecret()
  const payload = `${consultationId}.${rating}.${expiryMs}`
  const mac = crypto.createHmac('sha256', secret).update(payload).digest()
  const macB64 = mac.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${expiryMs}.${macB64}`
}

export function verifyFeedbackToken(token, consultationId, rating) {
  if (!token || typeof token !== 'string') return { ok: false, error: 'missing token' }
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, error: 'malformed token' }
  const [expiryStr, macB64] = parts
  const expiryMs = Number(expiryStr)
  if (!Number.isFinite(expiryMs)) return { ok: false, error: 'bad expiry' }
  if (Date.now() > expiryMs) return { ok: false, error: 'token expired' }
  const expected = signFeedbackToken(consultationId, rating, expiryMs)
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return { ok: false, error: 'bad signature' }
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, error: 'bad signature' }
  return { ok: true, expiryMs }
}

function firstName(full) {
  if (!full) return ''
  const trimmed = String(full).trim()
  if (!trimmed) return ''
  const parts = trimmed.replace(/^Dr\.?\s+/i, '').split(/\s+/)
  return parts[0] || ''
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function buildEmail({ patientFirstName, providerDisplayName, consultId, token }) {
  const providerFirst = firstName(providerDisplayName) || 'our team'
  const greeting = patientFirstName ? `Kia ora ${escapeHtml(patientFirstName)},` : 'Kia ora,'
  const baseUrl = process.env.VITE_APP_URL || 'https://terehealth.co.nz'
  const upUrl = `${baseUrl}/feedback?c=${encodeURIComponent(consultId)}&r=positive&t=${encodeURIComponent(token.positive)}`
  const downUrl = `${baseUrl}/feedback?c=${encodeURIComponent(consultId)}&r=negative&t=${encodeURIComponent(token.negative)}`
  const safetyUrl = `${baseUrl}/`

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px">
    <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
  </div>
  <div style="padding:24px 28px">
    <p style="font-size:15px;margin:0 0 16px">${greeting}</p>
    <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">
      Thanks for seeing Dr ${escapeHtml(providerFirst)} with Tere Health yesterday. We hope you are feeling better.
    </p>
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:13px;color:#991B1B;margin:16px 0 20px;line-height:1.6">
      If your symptoms have worsened, or you are worried about something new, please <a href="${safetyUrl}" style="color:#991B1B;font-weight:700;text-decoration:underline">start another consult</a> or call 111 for an emergency.
    </div>
    <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 12px">
      Would you take a few seconds to tell us how it went?
    </p>
    <div style="text-align:center;margin:24px 0 8px">
      <a href="${upUrl}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:14px 24px;border-radius:99px;font-size:15px;font-weight:700;margin:0 6px 10px">&#128077; Great, happy to share</a>
      <a href="${downUrl}" style="display:inline-block;background:#F3F4F6;color:#374151;text-decoration:none;padding:14px 24px;border-radius:99px;font-size:15px;font-weight:700;margin:0 6px 10px;border:1px solid #D1D5DB">&#128078; Could have been better</a>
    </div>
    <p style="font-size:13px;line-height:1.6;color:#9CA3AF;margin:28px 0 0">
      Ngā mihi,<br>
      The Tere Health team
    </p>
  </div>
  <div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">
    Tere Health · Marlborough Sounds, New Zealand · <a href="https://terehealth.co.nz" style="color:#0B6E76">terehealth.co.nz</a>
  </div>
</body></html>`

  const text = [
    greeting.replace(/<[^>]+>/g, ''),
    '',
    `Thanks for seeing Dr ${providerFirst} with Tere Health yesterday. We hope you are feeling better.`,
    '',
    `If your symptoms have worsened, or you are worried about something new, start another consult at ${safetyUrl} or call 111 for an emergency.`,
    '',
    'Would you take a few seconds to tell us how it went?',
    '',
    `Yes, happy to share:    ${upUrl}`,
    `Could have been better: ${downUrl}`,
    '',
    'Ngā mihi,',
    'The Tere Health team',
  ].join('\n')

  return { html, text }
}

export default async function handler(req, res) {
  const { verifyCronSecret } = await import('./_cron-auth.js')
  if (!verifyCronSecret(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!hasEmailProvider()) {
    console.warn('[cron-thank-you-emails] email provider not configured, skipping')
    return res.status(200).json({ ok: false, reason: 'no email provider' })
  }
  if (!tokenSecret()) {
    console.error('[cron-thank-you-emails] no FEEDBACK_TOKEN_SECRET or CRON_SECRET; refusing to sign unverifiable tokens')
    return res.status(500).json({ error: 'token secret unavailable' })
  }

  const force = req.query?.force === '1'
  const supabase = admin()
  const now = Date.now()
  const windowStartIso = new Date(now - 25 * 60 * 60 * 1000).toISOString()
  const windowEndIso   = new Date(now - 23 * 60 * 60 * 1000).toISOString()

  const { data: candidates, error } = await supabase
    .from('consultations')
    .select('id, patient_first_name, patient_last_name, patient_email, provider_id, provider_display_name, notes_finalised_at, is_practice, thank_you_sent_at')
    .not('notes_finalised_at', 'is', null)
    .is('thank_you_sent_at', null)
    .eq('is_practice', false)
    .not('patient_email', 'is', null)
    .gt('notes_finalised_at', windowStartIso)
    .lt('notes_finalised_at', windowEndIso)
    .order('notes_finalised_at', { ascending: true })
    .limit(BATCH_LIMIT)

  if (error) {
    console.error('[cron-thank-you-emails] query failed:', error.message)
    return res.status(500).json({ error: 'query failed' })
  }

  const rows = candidates || []
  if (rows.length === 0 && !force) {
    return res.status(200).json({ ok: true, sent: 0, errors: 0, skipped: 0 })
  }

  let sent = 0
  let errors = 0
  let skipped = 0

  for (const c of rows) {
    try {
      if (!c.patient_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.patient_email)) {
        skipped++
        continue
      }

      // Suppress if there is an active HDC / clinical complaint attached to
      // this consult. We treat anything not resolved/closed as active.
      const { data: openComplaint, error: cxErr } = await supabase
        .from('complaints')
        .select('id, status')
        .eq('consultation_id', c.id)
        .not('status', 'in', '(resolved,closed)')
        .limit(1)
        .maybeSingle()
      if (cxErr) {
        console.warn('[cron-thank-you-emails] complaint lookup failed for', c.id, cxErr.message)
      }
      if (openComplaint) { skipped++; continue }

      const expiryMs = Date.now() + TOKEN_TTL_MS
      const tokens = {
        positive: signFeedbackToken(c.id, 'positive', expiryMs),
        negative: signFeedbackToken(c.id, 'negative', expiryMs),
      }
      const { html, text } = buildEmail({
        patientFirstName: c.patient_first_name,
        providerDisplayName: c.provider_display_name,
        consultId: c.id,
        token: tokens,
      })

      const result = await sendEmail({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: [c.patient_email],
        subject: 'How was your Tere Health consult?',
        html,
        text,
      })

      if (!result?.ok) {
        errors++
        console.error('[cron-thank-you-emails] send failed for', c.id, result?.error)
        continue
      }

      const { error: upErr } = await supabase
        .from('consultations')
        .update({ thank_you_sent_at: new Date().toISOString() })
        .eq('id', c.id)
      if (upErr) {
        errors++
        console.error('[cron-thank-you-emails] stamp failed for', c.id, upErr.message)
        continue
      }
      sent++
    } catch (e) {
      errors++
      console.error('[cron-thank-you-emails] unexpected error for', c?.id, e?.message || e)
    }
  }

  if (errors > 0) {
    try {
      await sendEmail({
        from: 'Tere Health <hello@terehealth.co.nz>',
        to: [ADMIN_EMAIL],
        subject: `[Tere] thank-you cron hit ${errors} error${errors === 1 ? '' : 's'}`,
        text: `thank-you cron: sent=${sent}, errors=${errors}, skipped=${skipped}, scanned=${rows.length}. Check logs for details.`,
      })
    } catch (e) {
      console.error('[cron-thank-you-emails] admin alert failed:', e.message)
    }
  }

  return res.status(200).json({ ok: true, sent, errors, skipped, scanned: rows.length })
}

// TODO(2026-10-24): no patient-level comms_opt_out / email_consent /
// unsubscribed field exists on consultations or patients today. When one
// is added, extend the WHERE above (plus a per-row re-check) to suppress
// opt-outs here.
