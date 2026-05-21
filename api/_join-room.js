import { AccessToken } from 'livekit-server-sdk'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { consultationId, identity } = req.body
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  const lkUrl    = process.env.LIVEKIT_URL
  const apiKey   = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET

  if (!apiKey || !apiSecret || !lkUrl) {
    return res.status(200).json({ token: null, serverUrl: null, roomName: 'tere-demo' })
  }

  const roomName = `tere-${consultationId.slice(0, 8)}`
  const participantIdentity = identity || `participant-${Date.now()}`

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    ttl: 7200, // 2 hours
  })
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })

  const token = await at.toJwt()
  res.status(200).json({ token, serverUrl: lkUrl, roomName })
}
