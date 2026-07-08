// POST /api/deepgram-token
//
// Generates a short-lived Deepgram API token for client-side WebSocket use.
// The master DEEPGRAM_API_KEY never touches the browser bundle — that was
// the leak fixed in commit 569d8f2 on 2026-07-06 and must never regress.
//
// Callers: LiveKit call surfaces (PatientCall, ProviderConsult) that need to
// stream audio to Deepgram for live subtitle transcription. Provider-auth
// required so anons can't burn Deepgram quota.
//
// Response: { token: string, expires_in: number }

import { guardProvider } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Both providers and patients (during their own call) need this token.
  // For patients we identify by consultation_id — the audio path is only
  // useful during their own consult. For providers guardProvider handles it.
  //
  // Simplification for MVP: require provider auth. Patient-side subtitles
  // can be added later by exchanging the call token for a scoped Deepgram key.
  const auth = await guardProvider(req, res)
  if (!auth) return

  const master = process.env.DEEPGRAM_API_KEY || process.env.DEEPGRAM_API_SECRET_KEY
  if (!master) return res.status(500).json({ error: 'Deepgram key not configured' })

  // Deepgram's Projects API: create a temporary API key scoped to member (streaming).
  // TTL kept short (120s) — client opens the WS immediately after receiving.
  try {
    // First: look up the project ID (Deepgram requires it for key creation).
    const projRes = await fetch('https://api.deepgram.com/v1/projects', {
      headers: { Authorization: `Token ${master}` },
    })
    if (!projRes.ok) {
      const err = await projRes.text()
      return res.status(502).json({ error: 'Deepgram project lookup failed', detail: err })
    }
    const { projects } = await projRes.json()
    const projectId = projects?.[0]?.project_id
    if (!projectId) return res.status(500).json({ error: 'No Deepgram project found' })

    const keyRes = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/keys`, {
      method: 'POST',
      headers: { Authorization: `Token ${master}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comment: `tere-subtitle-${Date.now()}-${auth.provider?.id?.slice(0, 8) || 'anon'}`,
        scopes: ['usage:write'],
        time_to_live_in_seconds: 120,
        // No tags — Deepgram rejects unknown fields.
      }),
    })
    if (!keyRes.ok) {
      const err = await keyRes.text()
      return res.status(502).json({ error: 'Deepgram token creation failed', detail: err })
    }
    const data = await keyRes.json()
    return res.status(200).json({
      token: data.key,
      expires_in: 120,
      project_id: projectId,
    })
  } catch (e) {
    return res.status(500).json({ error: 'Deepgram token exception', detail: e.message })
  }
}
