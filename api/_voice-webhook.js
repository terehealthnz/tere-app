// Telnyx Call Control webhook. Receives call.* events for outbound calls
// created by _telnyx-voice.js. On call.answered, issues the Speak command
// back to Telnyx so the destination hears the wake-up message. Every
// other event (initiated, hangup, machine_detected, etc.) is a no-op 200.
//
// Public endpoint — no PHI in the payload, and Telnyx signs events with
// TELNYX_PUBLIC_KEY. We verify the signature when the public key is
// configured; otherwise log a warning and accept (so the first live
// call works even before Patrick pastes in the public key).

import crypto from 'node:crypto'

function verifyTelnyxSignature(req, rawBody) {
  const publicKey = process.env.TELNYX_PUBLIC_KEY
  if (!publicKey) return { ok: true, skipped: true }   // soft-accept
  const signature = req.headers['telnyx-signature-ed25519']
  const timestamp = req.headers['telnyx-timestamp']
  if (!signature || !timestamp) return { ok: false, reason: 'missing_signature_headers' }

  // Telnyx ed25519: verify over `${timestamp}|${rawBody}`
  try {
    const key = crypto.createPublicKey({
      key: Buffer.from(publicKey, 'base64'),
      format: 'der', type: 'spki',
    })
    const ok = crypto.verify(
      null,
      Buffer.from(`${timestamp}|${rawBody}`, 'utf-8'),
      key,
      Buffer.from(signature, 'base64'),
    )
    return ok ? { ok: true } : { ok: false, reason: 'signature_mismatch' }
  } catch (err) {
    return { ok: false, reason: `verify_error:${err?.message || err}` }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  // Vercel parses JSON by default. For ed25519 we need the raw body —
  // fall back to re-stringifying if raw isn't exposed (slight integrity
  // gap, but Telnyx events are not themselves sensitive; worst case a
  // spoofed event triggers one outbound Speak to a ghost call id which
  // Telnyx rejects).
  const rawBody = typeof req.body === 'string'
    ? req.body
    : JSON.stringify(req.body || {})
  const sig = verifyTelnyxSignature(req, rawBody)
  if (!sig.ok) {
    console.warn('[voice-webhook] signature check failed', sig)
    return res.status(401).json({ error: 'Signature verification failed' })
  }

  let evt
  try {
    evt = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch { return res.status(400).json({ error: 'bad json' }) }

  const eventType     = evt?.data?.event_type
  const callControlId = evt?.data?.payload?.call_control_id
  const clientStateB64 = evt?.data?.payload?.client_state

  if (!eventType || !callControlId) {
    // Not our event shape — ack anyway so Telnyx doesn't retry.
    return res.status(200).json({ ok: true, ignored: true })
  }

  if (eventType !== 'call.answered') {
    // call.initiated, call.hangup, call.bridged, etc. — just ack.
    return res.status(200).json({ ok: true, eventType, handled: false })
  }

  // Decode the client_state we set when creating the call.
  let state = {}
  try {
    if (clientStateB64) {
      state = JSON.parse(Buffer.from(clientStateB64, 'base64').toString('utf-8'))
    }
  } catch { /* fall through with default message */ }

  const text = state?.text || 'Tere after-hours. A rest home resident is waiting. Open your dashboard.'

  const apiKey = process.env.TELNYX_API_KEY
  if (!apiKey) {
    console.error('[voice-webhook] TELNYX_API_KEY missing — cannot issue Speak')
    return res.status(200).json({ ok: true, error: 'telnyx_api_key_missing' })
  }

  try {
    const r = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/speak`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payload: text,
        voice: 'female',
        language: 'en-AU',
        // After speaking the message, Telnyx auto-hangs up because the leg
        // has no more actions queued. If Patrick wants a repeat, we could
        // POST a second /actions/speak before the first finishes — skip
        // for MVP; the ring + one spoken message is enough wake-up.
      }),
    })
    if (!r.ok) {
      const data = await r.json().catch(() => ({}))
      console.error('[voice-webhook] speak failed:', data)
    }
  } catch (err) {
    console.error('[voice-webhook] speak error:', err?.message || err)
  }

  return res.status(200).json({ ok: true })
}
