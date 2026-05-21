import { RoomServiceClient } from 'livekit-server-sdk'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { consultationId } = req.body
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  const lkUrl    = process.env.LIVEKIT_URL
  const apiKey   = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET

  const roomName = `tere-${consultationId.slice(0, 8)}`

  if (!apiKey || !apiSecret || !lkUrl) {
    return res.status(200).json({ roomName: 'tere-demo' })
  }

  try {
    // RoomServiceClient expects an HTTP/HTTPS URL
    const httpUrl = lkUrl.replace(/^wss?:\/\//, 'https://')
    const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret)
    await svc.createRoom({
      name: roomName,
      emptyTimeout: 600,   // delete room after 10 min empty
      maxParticipants: 3,
    })
  } catch (e) {
    // Room may already exist — that's fine, continue
    console.log('LiveKit createRoom:', e.message)
  }

  res.status(200).json({ roomName })
}
