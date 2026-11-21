// POST /api/patient-call-event — patient-side diagnostic logger.
//
// Instrumented from PatientCall.jsx when the video call fails on the patient
// end: getUserMedia denied, LiveKit never connected, mid-call disconnect, etc.
// Goal: stop guessing. Next time Rachel says "the patient couldn't get video
// to work" we open audit_logs and see "iOS 17, NotAllowedError, consult X" so
// we can target the real failure mode instead of hardening in the dark.
//
// Body: { consultationId, event, detail?, userAgent? }
//   event ∈ 'permission_denied' | 'permission_error' | 'connect_timeout' |
//            'livekit_disconnected' | 'livekit_error' | 'patient_upload_fallback'
//   detail is a free-form string (error name / message), capped at 500 chars.
//
// Writes to audit_logs with event_type='patient_call_failure'. If audit_logs
// isn't present (fresh env) we 200 skip silently so patient flow is never
// blocked by telemetry.

import { createClient } from '@supabase/supabase-js'
import { resolvePatientAuth } from './_patient-token.js'

const ALLOWED_EVENTS = new Set([
  'permission_denied',
  'permission_error',
  'connect_timeout',
  'livekit_disconnected',
  'livekit_error',
  'patient_upload_fallback',
])

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function missingTable(err) {
  const msg = String(err?.message || err?.details || '')
  return /relation.*does not exist|does not exist/i.test(msg) || err?.code === '42P01'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Patient-token auth. Falls back to legacy consultation_id lookup during
  // the token rollout (matches patient-upload pattern).
  const auth = await resolvePatientAuth(req, { allowLegacyConsultId: true })
  if (auth.error) return res.status(auth.status).json({ error: auth.error })
  const { consultationId, patientId } = auth

  const { event, detail, userAgent } = req.body || {}
  if (!event || !ALLOWED_EVENTS.has(event)) {
    return res.status(400).json({ error: 'event required (one of allowed values)' })
  }

  const supabase = admin()
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || null
  const metadata = {
    event,
    detail: typeof detail === 'string' ? detail.slice(0, 500) : null,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 300) : null,
    patient_id: patientId || null,
  }

  try {
    const { error } = await supabase.from('audit_logs').insert({
      event_type:      'patient_call_failure',
      consultation_id: consultationId,
      metadata,
      ip,
    })
    if (error && missingTable(error)) return res.status(200).json({ ok: true, skipped: 'audit_logs table missing' })
    if (error) { console.error('[patient-call-event] insert failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[patient-call-event] unexpected:', e)
    return res.status(500).json({ error: 'Server error' })
  }
}
