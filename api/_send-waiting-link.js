// POST /api/send-waiting-link
//
// Fires when a provider clicks "Send SMS with join link" inside the patient-
// presence gate modal. Looks up the consultation, composes a short SMS with
// the /call?consultation=<id> deep link, and sends via the existing sendSms
// helper (AWS SNS, same essentiality allowlist pattern as /api/sms).
//
// Auth: guardProvider at the router. We also enforce that the caller is
// either admin / supervisor OR the attending provider on the consult -
// otherwise any logged-in provider could ping any patient on any consult.
//
// Request body:
//   { consultation_id: '<uuid>' }
//
// Response:
//   { ok: true,  to: '+64...1234' (masked) }
//   { ok: false, error: '...' }  with 4xx/5xx status
//
// Audit: writes an audit_logs row with event_type='patient_sms_waiting_link_sent'
// including the SMS provider + message id for traceability. Fire-and-forget;
// an audit write failure must NOT block the SMS success response (append-only
// audit_logs triggers can refuse the write in edge cases; the primary
// patient-care action should still complete).

import { createClient } from '@supabase/supabase-js'
import { sendSms } from './_sms.js'
import { getClientIp } from './_client-ip.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Last-4-digits mask so the response + audit trail don't leak the full
// number. Matches the mask the modal shows pre-send so the toast reads
// consistently.
function maskPhone(phone) {
  const raw = String(phone || '').replace(/\s+/g, '')
  if (!raw) return 'unknown'
  if (raw.length <= 4) return raw
  const last4 = raw.slice(-4)
  const prefixLen = Math.max(0, raw.length - 4)
  return raw.slice(0, Math.min(3, prefixLen)) + 'X'.repeat(Math.max(0, prefixLen - 3)) + ' ' + last4
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { consultation_id } = req.body || {}
  if (!consultation_id || typeof consultation_id !== 'string' || !UUID_RE.test(consultation_id)) {
    return res.status(400).json({ ok: false, error: 'consultation_id (uuid) required' })
  }

  const supabase = admin()
  const { data: consult, error: fetchErr } = await supabase
    .from('consultations')
    .select('id, status, provider_id, patient_phone, patient_first_name, patient_email, is_practice')
    .eq('id', consultation_id)
    .maybeSingle()

  if (fetchErr) {
    console.error('[send-waiting-link] fetch failed:', fetchErr)
    return res.status(500).json({ ok: false, error: 'Server error' })
  }
  if (!consult) {
    return res.status(404).json({ ok: false, error: 'Consultation not found' })
  }

  // Ownership check - admin / supervisor can send on any consult, otherwise
  // only the attending provider on this consult. Mirrors the pattern used
  // in capture-payment / resend-prescription.
  const provider = req.auth?.provider || {}
  const isAdmin = !!(provider.is_admin || provider.is_supervisor)
  const isAttending = provider.id && consult.provider_id && provider.id === consult.provider_id
  if (!isAdmin && !isAttending) {
    return res.status(403).json({ ok: false, error: 'Not authorised to message this patient' })
  }

  if (!consult.patient_phone || !String(consult.patient_phone).trim()) {
    return res.status(400).json({ ok: false, error: 'No phone number on record for this patient' })
  }

  // Sandbox: practice consults never ping real patients. Return a simulated
  // success so the modal flow completes in training without an outbound SMS.
  if (consult.is_practice) {
    return res.status(200).json({
      ok: true,
      simulated: true,
      to: maskPhone(consult.patient_phone),
      reason: 'practice_mode',
    })
  }

  // SMS copy. Uses /call?consultation=<id> because that's the deep link the
  // existing initiate-call SMS uses - same resumable waiting-room / join
  // route the patient already knows from the first ring-start SMS. The
  // consultation_token / fragment-URL hardening on other patient routes
  // doesn't apply here because /call accepts the raw id and the server-side
  // resolvePatientAuth gate is the real security boundary (M-4/M-5 fix).
  const appUrl = process.env.VITE_APP_URL || 'https://terehealth.co.nz'
  const joinUrl = `${appUrl}/call?consultation=${consultation_id}`
  const firstName = consult.patient_first_name || 'there'
  const smsBody = `[Tere Health] Kia ora ${firstName}, your Tere doctor is ready to see you now. Join the video call: ${joinUrl}`

  const smsResult = await sendSms({ to: consult.patient_phone, body: smsBody })

  if (!smsResult || smsResult.ok !== true) {
    const reason = smsResult?.error || smsResult?.reason || 'SMS provider unavailable'
    console.error('[send-waiting-link] sms failed:', reason)
    return res.status(502).json({ ok: false, error: `SMS send failed: ${reason}` })
  }

  // Audit (fire-and-forget). Scope: patient_sms_waiting_link_sent event; keeps
  // the "who pinged which patient when" trail for compliance / dispute.
  try {
    const providerName = provider.first_name || provider.last_name
      ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
      : null
    const providerRole = provider.is_admin ? 'admin'
      : provider.is_supervisor ? 'supervisor'
      : provider.is_provider ? 'provider'
      : null
    await supabase.from('audit_logs').insert({
      event_type: 'patient_sms_waiting_link_sent',
      provider_id: provider.id || null,
      provider_name: providerName,
      provider_role: providerRole,
      consultation_id: consultation_id,
      resource_type: 'consultation',
      resource_id: consultation_id,
      metadata: {
        sms_provider: smsResult.provider || null,
        sms_message_id: smsResult.id || null,
        phone_last4: String(consult.patient_phone).replace(/\s+/g, '').slice(-4),
      },
      ip: getClientIp(req),
      user_agent: req.headers['user-agent'] || null,
    })
  } catch (e) {
    // Don't fail the response if the audit insert itself fails - the SMS has
    // already gone out and the provider UI expects success. Log loudly so
    // ops can backfill if the audit chain stays broken.
    console.error('[send-waiting-link] audit insert failed (sms already sent):', e?.message || e)
  }

  return res.status(200).json({
    ok: true,
    to: maskPhone(consult.patient_phone),
    provider: smsResult.provider || null,
  })
}
