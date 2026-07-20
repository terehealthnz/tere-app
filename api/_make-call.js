// Provider clicks "call patient" → we dial the patient's phone via Telnyx
// Programmable Voice (Call Control API). Telnyx event webhooks land in
// _telnyx-voice.js, which is where the actual answer/join-conference/hangup
// steering happens. Here we just kick off the outbound leg and stash the
// call_control_id on the consultation so status updates can be correlated.
//
// Migrated from Twilio 2026-07-20 — kept the twilio_call_sid + twilio_call_status
// columns writing so the existing ConsultView.jsx / ProviderConsult.jsx frontend
// polling code keeps working without a coordinated release. New column
// voice_call_id (see supabase/2026-07-20_voice_call_id.sql) stores the actual
// Telnyx call_control_id used for webhook correlation.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function toE164NZ(phone) {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('640')) return `+64${digits.slice(3)}`  // +6402... → +642...
  if (digits.startsWith('64')) return `+${digits}`
  if (digits.startsWith('0')) return `+64${digits.slice(1)}`
  return `+64${digits}`
}

function encodeClientState(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf-8').toString('base64')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { consultationId } = req.body
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  const { data: consult, error: fetchError } = await supabase
    .from('consultations')
    .select('id, patient_phone, patient_first_name, call_attempts')
    .eq('id', consultationId)
    .single()

  if (fetchError || !consult) return res.status(404).json({ error: 'Consultation not found' })
  if (!consult.patient_phone) return res.status(400).json({ error: 'No phone number on record for this patient' })

  const apiKey = process.env.TELNYX_API_KEY
  const connectionId = process.env.TELNYX_VOICE_CONNECTION_ID
  const fromNumber = process.env.TELNYX_VOICE_FROM_NUMBER
  if (!apiKey || !connectionId || !fromNumber) {
    return res.status(500).json({ error: 'Telnyx voice not configured (TELNYX_API_KEY / TELNYX_VOICE_CONNECTION_ID / TELNYX_VOICE_FROM_NUMBER)' })
  }

  const to = toE164NZ(consult.patient_phone)
  const base = 'https://terehealth.co.nz'

  try {
    const r = await fetch('https://api.telnyx.com/v2/calls', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        connection_id: connectionId,
        to,
        from: fromNumber,
        webhook_url: `${base}/api/telnyx-voice`,
        webhook_url_method: 'POST',
        // AMD so we can bail to voicemail message instead of dropping a machine
        // into the conference. Result arrives via call.machine.detection.ended.
        answering_machine_detection: 'detect',
        // Consultation correlation — echoed back on every event for this leg.
        client_state: encodeClientState({ consultationId }),
        // Match old Twilio behaviour: ~30s dial timeout before we give up.
        timeout_secs: 30,
      }),
    })

    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      const detail = data?.errors?.[0]?.detail || data?.errors?.[0]?.title || `Telnyx ${r.status}`
      console.error('[make-call] Telnyx create-call failed:', detail, data)
      return res.status(502).json({ error: detail })
    }

    const callControlId = data?.data?.call_control_id
    const callLegId = data?.data?.call_leg_id
    if (!callControlId) {
      console.error('[make-call] Telnyx returned no call_control_id:', data)
      return res.status(502).json({ error: 'Telnyx accepted the call but returned no call_control_id' })
    }

    const attempts = (consult.call_attempts || 0) + 1
    await supabase
      .from('consultations')
      .update({
        voice_call_id: callControlId,
        // Preserve twilio_call_sid write for backward compat — we store the
        // Telnyx call_leg_id (or call_control_id if leg_id missing) here so any
        // audit UI still sees a non-null identifier. Drop this column once the
        // frontend is repointed to voice_call_id.
        twilio_call_sid: callLegId || callControlId,
        twilio_call_status: 'dialling',
        call_started_at: new Date().toISOString(),
        call_attempts: attempts,
      })
      .eq('id', consultationId)

    res.json({ success: true, callControlId })
  } catch (err) {
    console.error('Telnyx make-call error:', err)
    res.status(500).json({ error: err.message })
  }
}
