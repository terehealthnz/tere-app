// LiveKit room management (replaces Daily.co)
// Rooms are created server-side to keep API keys secret.

export async function createRoom(consultationId) {
  const res = await fetch('/api/create-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ consultationId }),
  })
  if (!res.ok) throw new Error('Failed to create video room')
  return res.json() // { roomName }
}

export async function getToken(consultationId, identity) {
  const res = await fetch('/api/join-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ consultationId, identity }),
  })
  if (!res.ok) throw new Error('Failed to get video token')
  return res.json() // { token, serverUrl, roomName }
}
