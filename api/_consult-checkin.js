// POST /api/consult-checkin — admin-triggered follow-up email (optional SMS
// backup) to a patient who abandoned a consult. See migration
// supabase/2026-10-19_consult_checkin.sql for the data shape.
//
// Body: { consultation_id }
//
// Guardrails:
//   - Admin-only (is_admin check inside, in addition to AUTH_REQUIRED_ROUTES).
//   - Idempotent: if consultations.check_in_sent_at is non-null, returns 409
//     and the UI will have already hidden the button. Second line of defence
//     against double-sends after audit-log race or stale UI state.
//   - Must have patient_email on the row — if not, 400 "no email". We don't
//     attempt SMS-only on the first pass because the admin should see the
//     "no email" state in the panel and make a judgment call.
//   - Sandbox + payment_test_mode rows refuse — no outbound sends from the
//     practice environment, same rule as the ACC autosend rip.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'
import { sendEmail } from './_email-client.js'
import { writeAuditEvent } from './_audit-write.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function buildEmail({ firstName, chiefComplaintPreview, appUrl }) {
  const name = firstName || 'there'
  // Clip the chief complaint tightly — this is going into a transactional
  // email, don't want to re-expose a long free-text clinical history.
  const preview = chiefComplaintPreview
    ? `about: "${chiefComplaintPreview}"`
    : 'with Tere Health'
  const subject = 'Checking in on your Tere Health visit'
  const text = `Kia ora ${name},

We noticed you started a consult ${preview} earlier today but didn't finish. Just wanted to check in and see how you're doing.

If you'd still like to speak to a doctor, you can start again at ${appUrl}. Takes a minute, no need to re-type everything.

If things have become urgent in the meantime — chest pain, severe shortness of breath, heavy bleeding, or thoughts of harming yourself — please call 111 or go to your nearest emergency department right away.

If you've already seen someone or you're feeling better, no action needed. Hope you're on the mend.

Ngā mihi,
The Tere Health team
terehealth.co.nz
`
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
<div style="background:#0D2B45;padding:20px 28px"><div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div></div>
<div style="padding:24px 28px">
<p style="font-size:15px;margin:0 0 16px">Kia ora ${name},</p>
<p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">We noticed you started a consult ${preview} earlier today but didn't finish. Just wanted to check in and see how you're doing.</p>
<p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 24px">If you'd still like to speak to a doctor, you can start again below. Takes a minute, no need to re-type everything.</p>
<div style="text-align:center;margin:28px 0"><a href="${appUrl}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:14px 32px;border-radius:99px;font-size:16px;font-weight:700">Pick up where you left off →</a></div>
<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:13px;color:#991B1B;margin-top:24px">⚠️ <strong>If this has become urgent</strong> (chest pain, severe shortness of breath, heavy bleeding, thoughts of harming yourself), please call <strong>111</strong> or go to your nearest emergency department now.</div>
<p style="font-size:14px;line-height:1.6;color:#6B7280;margin:24px 0 0">If you've already seen someone or you're feeling better, no action needed from your end. Hope you're on the mend.</p>
</div>
<div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">Tere Health · terehealth.co.nz</div>
</body></html>`
  return { subject, html, text }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const auth = await guardProvider(req, res)
  if (!auth) return
  if (!auth.provider?.is_admin) return res.status(403).json({ error: 'Admin only' })

  const { consultation_id } = req.body || {}
  if (!consultation_id || !UUID_RE.test(String(consultation_id))) {
    return res.status(400).json({ error: 'consultation_id (UUID) is required' })
  }

  const supabase = admin()

  const { data: consult, error: cErr } = await supabase
    .from('consultations')
    .select('id, patient_first_name, patient_email, chief_complaint, status, is_practice, payment_test_mode, check_in_sent_at')
    .eq('id', consultation_id)
    .maybeSingle()
  if (cErr) {
    console.error('[consult-checkin] lookup failed:', cErr)
    return res.status(500).json({ error: 'Server error' })
  }
  if (!consult) return res.status(404).json({ error: 'Consultation not found' })

  // Hard refusals before we touch the email provider.
  if (consult.is_practice) {
    return res.status(400).json({ error: 'Refusing to send: sandbox (is_practice) consult' })
  }
  if (consult.payment_test_mode) {
    return res.status(400).json({ error: 'Refusing to send: payment_test_mode consult' })
  }
  if (consult.check_in_sent_at) {
    return res.status(409).json({ error: `Check-in already sent at ${consult.check_in_sent_at}` })
  }
  if (!consult.patient_email) {
    return res.status(400).json({ error: 'No patient_email on this consult — cannot send' })
  }

  const appUrl = process.env.VITE_APP_URL || 'https://terehealth.co.nz'
  const chiefPreview = (consult.chief_complaint || '').slice(0, 100).trim()
  const { subject, html, text } = buildEmail({
    firstName: consult.patient_first_name,
    chiefComplaintPreview: chiefPreview,
    appUrl,
  })

  const emailRes = await sendEmail({
    from: 'Tere Health <hello@terehealth.co.nz>',
    replyTo: 'terehealthnz@gmail.com',
    to: [consult.patient_email],
    subject,
    html,
    text,
  })
  if (!emailRes?.ok) {
    return res.status(502).json({ error: `Email send failed: ${emailRes?.error || 'unknown'}` })
  }

  const nowIso = new Date().toISOString()
  const { error: uErr } = await supabase
    .from('consultations')
    .update({
      check_in_sent_at: nowIso,
      check_in_sent_by: auth.provider.id,
      check_in_channel: 'email',
    })
    .eq('id', consultation_id)
    .is('check_in_sent_at', null)  // TOCTOU guard
  if (uErr) {
    console.error('[consult-checkin] stamp failed:', uErr)
    // Email already went out — don't 500 the caller, just warn in audit log.
  }

  writeAuditEvent(req, auth, {
    event_type:    'consult.checkin_sent',
    consultation_id,
    resource_type: 'consultation',
    resource_id:   consultation_id,
    metadata: {
      channel:         'email',
      recipient_email: consult.patient_email,
      email_provider:  emailRes.provider,
      email_message_id: emailRes.id || null,
      cc_preview_len:  chiefPreview.length,
    },
  }).catch(() => {})

  return res.status(200).json({
    ok: true,
    channel: 'email',
    sent_at: nowIso,
    provider: emailRes.provider,
  })
}
