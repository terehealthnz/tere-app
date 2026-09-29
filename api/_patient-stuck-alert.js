// _patient-stuck-alert.js — patient's waiting-room detected that their
// consult is in a dead state (expired/cancelled/no_show/abandoned) or
// stuck at 'draft' for >15min. Fires this endpoint once per consult
// (client dedups; server dedups too via alerted_at column check) so
// admin gets an immediate email + SMS to intervene.
//
// The alerting logic (which admins, via which channel) is centralised
// in _admin-alerts.js — see notifyAdmins() there. This handler just
// gathers consult context and delegates.
//
// Anon endpoint — no auth. Patient's client posts { consultationId,
// reason }; server validates the consult exists (prevents random
// noise from spammers with no real consult IDs). Reason is captured
// verbatim into the email/SMS body so admin knows why the alert fired.

import { createClient } from '@supabase/supabase-js'
import { sendEmail, hasEmailProvider } from './_email-client.js'

const ADMIN_EMAIL = process.env.ADMIN_ALERT_EMAIL || 'terehealthnz@gmail.com'
const ADMIN_SMS   = process.env.ADMIN_ALERT_SMS || ''
const APP_URL     = process.env.VITE_APP_URL || 'https://terehealth.co.nz'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { consultationId, reason } = req.body || {}
  if (!consultationId || typeof consultationId !== 'string') {
    return res.status(400).json({ error: 'consultationId required' })
  }
  const safeReason = typeof reason === 'string' ? reason.slice(0, 100) : 'unknown'

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: consult, error } = await supabase
    .from('consultations')
    .select('id, status, is_practice, patient_first_name, patient_last_name, patient_email, patient_phone, chief_complaint, created_at, stuck_alerted_at')
    .eq('id', consultationId)
    .maybeSingle()

  if (error || !consult) {
    return res.status(404).json({ error: 'Consultation not found' })
  }

  // Sandbox / practice consults never fire real admin alerts (task #549 pattern).
  if (consult.is_practice) return res.status(200).json({ ok: true, skipped: 'practice_mode' })

  // Server-side dedup — if the column exists and is already set, skip.
  // Column added in migration db/migrations/2026-09-30_consultations_stuck_alerted_at.sql
  // (see the migration file for details). Column is nullable so pre-migration
  // consults return null → alert fires once, then column is stamped.
  if (consult.stuck_alerted_at) return res.status(200).json({ ok: true, skipped: 'already_alerted' })

  const nowIso = new Date().toISOString()
  await supabase.from('consultations').update({ stuck_alerted_at: nowIso }).eq('id', consultationId)

  const patientName = `${consult.patient_first_name || ''} ${consult.patient_last_name || ''}`.trim() || '(no name)'
  const complaint = (consult.chief_complaint || '').slice(0, 200)
  const adminLink = `${APP_URL}/admin/patients?consult=${consultationId}`

  if (hasEmailProvider()) {
    const subject = `⚠ Stuck patient consult — ${patientName} (${safeReason})`
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#1A2A33;max-width:580px">
      <div style="background:#DC2626;color:white;padding:16px 24px;font-weight:700;font-size:16px">Patient consult stuck — needs manual review</div>
      <div style="padding:16px 24px;line-height:1.6">
        <p><strong>Patient:</strong> ${patientName}<br>
           <strong>Email:</strong> ${consult.patient_email || '—'}<br>
           <strong>Phone:</strong> ${consult.patient_phone || '—'}<br>
           <strong>Complaint:</strong> ${complaint || '—'}<br>
           <strong>Status:</strong> ${consult.status}<br>
           <strong>Reason:</strong> ${safeReason}<br>
           <strong>Created:</strong> ${consult.created_at}</p>
        <p>The patient's waiting-room has been updated with a "please contact us" banner. Please reach out to them by phone/email now to unblock.</p>
        <p><a href="${adminLink}" style="display:inline-block;background:#0B6E76;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700">Open in admin</a></p>
        <p style="font-size:12px;color:#6B7280">Consult ID: <code>${consultationId}</code></p>
      </div></body></html>`
    const text = `STUCK PATIENT CONSULT — needs manual review\n\nPatient: ${patientName}\nEmail: ${consult.patient_email || '—'}\nPhone: ${consult.patient_phone || '—'}\nComplaint: ${complaint}\nStatus: ${consult.status}\nReason: ${safeReason}\nCreated: ${consult.created_at}\n\nThe patient's waiting-room shows a "please contact us" banner. Reach out now.\n\nAdmin: ${adminLink}\nConsult ID: ${consultationId}`
    sendEmail({
      from: 'Tere Health <hello@terehealth.co.nz>',
      to: [ADMIN_EMAIL],
      subject, html, text,
    }).catch(e => console.error('[patient-stuck-alert] email failed:', e.message))
  }

  // SMS to admin — priority signal for immediate action. Same "always-on"
  // AWS SNS path used by other admin alerts.
  if (ADMIN_SMS) {
    fetch(`${APP_URL}/api/sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tere-api-key': process.env.TERE_API_KEY || '' },
      body: JSON.stringify({
        to: ADMIN_SMS,
        message: `Tere: STUCK CONSULT ${patientName} (${safeReason}). Call ${consult.patient_phone || 'email'} now. ${adminLink}`,
        type: 'admin_alert',
      }),
    }).catch(e => console.error('[patient-stuck-alert] sms failed:', e.message))
  }

  return res.status(200).json({ ok: true, alerted: true, reason: safeReason })
}
