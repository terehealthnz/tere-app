// Provider clicks "call patient" → we dial the patient's phone via LiveKit's
// SIP client, which bridges Telnyx's SIP trunk into the provider's existing
// LiveKit room as an ordinary participant. Full two-way audio: no separate
// conference, no webhook steering.
//
// Migrated from Telnyx Voice API (Call Control) 2026-07-20. The previous
// implementation created a Telnyx-side conference that only the patient joined,
// so the provider (already in a LiveKit room) never heard audio. LiveKit SIP
// participants join the same room the provider is in, so both hear each other
// natively.
//
// Column re-use: voice_call_id now stores the SIP call id returned by LiveKit
// (useful for future correlation with LiveKit room events). twilio_call_status
// remains the frontend polling contract (see ConsultView.jsx +
// ProviderConsult.jsx); we set it to 'answered' on dispatch so the polling loop
// exits (see TODO below re: real SIP status events).

import { createClient } from '@supabase/supabase-js'
import { SipClient } from 'livekit-server-sdk'

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

  const lkUrl = process.env.LIVEKIT_URL
  const lkApiKey = process.env.LIVEKIT_API_KEY
  const lkApiSecret = process.env.LIVEKIT_API_SECRET
  const sipTrunkId = process.env.LIVEKIT_SIP_TRUNK_ID
  const fromNumber = process.env.TELNYX_VOICE_FROM_NUMBER
  if (!lkUrl || !lkApiKey || !lkApiSecret || !sipTrunkId) {
    return res.status(500).json({ error: 'LiveKit SIP not configured (LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET / LIVEKIT_SIP_TRUNK_ID)' })
  }

  // Room name must match _create-room.js + _join-room.js + _initiate-call.js —
  // the provider is already in this room when they click "Call phone".
  const roomName = `tere-${consultationId.slice(0, 8)}`
  const to = toE164NZ(consult.patient_phone)

  try {
    // SipClient uses the LiveKit HTTP(S) API endpoint; convert wss:// if set.
    const httpUrl = lkUrl.replace(/^wss?:\/\//, 'https://')
    const sip = new SipClient(httpUrl, lkApiKey, lkApiSecret)

    const participant = await sip.createSipParticipant(
      sipTrunkId,
      to,
      roomName,
      {
        // fromNumber sets the SIP From: header (caller ID) — Telnyx uses this
        // as the number the patient sees. Falls back to the trunk's default
        // if the trunk enforces its own number.
        fromNumber,
        participantIdentity: `patient-${consultationId.slice(0, 8)}`,
        participantName: consult.patient_first_name || 'Patient',
        // Krisp noise-cancels the patient's mic — mobile/landline audio is
        // usually noisy compared to the provider's browser mic.
        krispEnabled: true,
        // Don't block the HTTP response until the phone is answered — return
        // immediately so the UI can update. Ringing/answer state comes through
        // LiveKit participant events client-side once real subscription lands.
        waitUntilAnswered: false,
      }
    )

    const attempts = (consult.call_attempts || 0) + 1
    await supabase
      .from('consultations')
      .update({
        // sipCallId is the SIP-level call identifier; more useful than the
        // LiveKit participantId for correlating with Telnyx call logs.
        voice_call_id: participant.sipCallId || participant.participantId,
        // TODO(option B): subscribe to LiveKit room events (server-side or via
        // a webhook) and update this column when the SIP participant actually
        // transitions ringing → answered → disconnected. For now we optimistic-
        // set 'answered' so the frontend polling loop (ConsultView.jsx +
        // ProviderConsult.jsx) stops spinning; the provider hears real ringing
        // audio via LiveKit so they know actual call state.
        twilio_call_status: 'answered',
        call_started_at: new Date().toISOString(),
        call_attempts: attempts,
      })
      .eq('id', consultationId)

    return res.json({
      ok: true,
      participantId: participant.participantId,
      participantIdentity: participant.participantIdentity,
      sipCallId: participant.sipCallId,
      roomName,
    })
  } catch (err) {
    console.error('[make-call] LiveKit SIP createSipParticipant failed:', err)
    return res.status(502).json({ error: err.message || 'LiveKit SIP dial failed' })
  }
}
