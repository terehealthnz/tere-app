// Wake-up phone call for ARC after-hours consults.
//
// Dials the on-call provider's mobile via LiveKit SIP (bridged through
// the existing Telnyx trunk). The provider's phone rings; the ring
// itself is the wake-up signal. If they answer they hear silence from
// an empty LiveKit room — fine for MVP, since the real "what do I do"
// lives on the dashboard which they open after waking up.
//
// Reuses the same mechanism as api/_make-call.js (provider→patient
// dial) so no new Telnyx Call Control Application / webhook needs to
// exist. Env vars already in place:
//   LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
//   LIVEKIT_SIP_TRUNK_ID
//   TELNYX_VOICE_FROM_NUMBER  (caller ID shown on Patrick's phone)

import { SipClient } from 'livekit-server-sdk'

function toE164(phone) {
  const raw = String(phone || '').trim()
  if (!raw) return ''
  if (raw.startsWith('+')) return '+' + raw.slice(1).replace(/\D/g, '')
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('640')) return `+64${digits.slice(3)}`
  if (digits.startsWith('64'))  return `+${digits}`
  if (digits.startsWith('0'))   return `+64${digits.slice(1)}`
  return `+64${digits}`
}

export async function placeWakeUpCall({ to, consultationId }) {
  const lkUrl       = process.env.LIVEKIT_URL
  const lkApiKey    = process.env.LIVEKIT_API_KEY
  const lkApiSecret = process.env.LIVEKIT_API_SECRET
  const sipTrunkId  = process.env.LIVEKIT_SIP_TRUNK_ID
  const fromNumber  = process.env.TELNYX_VOICE_FROM_NUMBER
  if (!lkUrl || !lkApiKey || !lkApiSecret || !sipTrunkId) {
    return { ok: false, error: 'LiveKit SIP not configured (LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET / LIVEKIT_SIP_TRUNK_ID)' }
  }
  const toE = toE164(to)
  if (!toE) return { ok: false, error: 'invalid destination' }

  // Dedicated room per wake-up attempt so the dial isn't accidentally
  // mixed into the patient's consult room. Short suffix = consult id
  // slice for log correlation; no real audio bridging is expected.
  const shortId  = String(consultationId || 'unknown').slice(0, 8)
  const roomName = `wakeup-${shortId}-${Date.now().toString(36).slice(-6)}`

  try {
    const httpUrl = lkUrl.replace(/^wss?:\/\//, 'https://')
    const sip = new SipClient(httpUrl, lkApiKey, lkApiSecret)
    const participant = await sip.createSipParticipant(
      sipTrunkId,
      toE,
      roomName,
      {
        fromNumber,
        participantIdentity: `wakeup-${shortId}`,
        participantName: 'Tere After-hours',
        krispEnabled: false,
        // Fire-and-forget. Don't block the HTTP response on dial state.
        waitUntilAnswered: false,
      }
    )
    return { ok: true, sipCallId: participant?.sipCallId || null, roomName }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}
