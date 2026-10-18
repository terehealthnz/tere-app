// POST /api/end-call
//
// Tear down the SIP leg (patient phone) for a consult. The provider's
// endCall() in ProviderConsult.jsx disconnects their own LiveKit session,
// but LiveKit does NOT auto-terminate a SIP participant when the human
// leaves — the patient's phone keeps ringing (or stays connected if they
// answered) until something kicks the sip-patient-* participant out of
// the room. This endpoint does that kick.
//
// Also removes the provider participant for completeness so the room is
// empty immediately. Fire-and-forget from the client — if LiveKit is slow
// or the room is already gone, we still return ok:true so the UI finishes
// closing the encounter.
import { RoomServiceClient } from 'livekit-server-sdk'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { consultationId } = req.body || {}
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  const lkUrl       = process.env.VITE_LIVEKIT_URL || process.env.LIVEKIT_URL
  const lkApiKey    = process.env.LIVEKIT_API_KEY
  const lkApiSecret = process.env.LIVEKIT_API_SECRET
  if (!lkUrl || !lkApiKey || !lkApiSecret) {
    return res.status(200).json({ ok: true, skipped: 'livekit_not_configured' })
  }

  const httpUrl   = lkUrl.replace(/^wss?:\/\//, 'https://')
  const roomName  = `tere-${consultationId.slice(0, 8)}`
  const svc       = new RoomServiceClient(httpUrl, lkApiKey, lkApiSecret)

  let kicked = []
  try {
    const participants = await svc.listParticipants(roomName)
    for (const p of (participants || [])) {
      const id = p.identity || ''
      if (id.startsWith('sip-patient-') || id.startsWith('provider-')) {
        try {
          await svc.removeParticipant(roomName, id)
          kicked.push(id)
        } catch (e) {
          console.warn(`[end-call] removeParticipant(${id}) failed:`, e.message)
        }
      }
    }
  } catch (e) {
    // listParticipants throws if the room doesn't exist — that just means
    // the call already ended, which is a success for this endpoint.
    console.log('[end-call] listParticipants:', e.message)
    return res.status(200).json({ ok: true, roomEmpty: true })
  }

  // Belt-and-braces: delete the room entirely. LiveKit auto-expires empty
  // rooms but on prod we've seen SIP participants linger for 30-60s after
  // the provider leaves. deleteRoom forces termination now.
  try { await svc.deleteRoom(roomName) } catch (e) { console.warn('[end-call] deleteRoom:', e.message) }

  return res.status(200).json({ ok: true, kicked })
}
