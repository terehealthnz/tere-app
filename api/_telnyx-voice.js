// Outbound wake-up phone call via Telnyx Call Control API.
//
// Flow:
//   1. POST /v2/calls → Telnyx dials the destination
//   2. On answer, Telnyx POSTs call.answered to webhook_url (our
//      /api/voice-webhook endpoint)
//   3. That webhook issues the Speak command back to Telnyx
//   4. Telnyx plays the TTS to the answered leg, then hangs up
//
// SMS still fires in parallel (see _notify-on-call.js) — this call is
// the belt-and-braces wake-up layer when a 3am rest home call needs a
// phone ring not just a silent iMessage.
//
// Env:
//   TELNYX_API_KEY                     — bearer for Call Control API
//   TELNYX_VOICE_FROM_NUMBER           — caller ID shown on Patrick's phone
//   TELNYX_CALL_CONTROL_CONNECTION_ID  — the outbound Call Control
//     Connection that TELNYX_VOICE_FROM_NUMBER is attached to. Look this
//     up in Telnyx Portal → Call Control → Applications.
//   PUBLIC_API_BASE  (optional, falls back to https://terehealth.co.nz)
//     — used to construct the webhook URL Telnyx hits on call events.

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

export async function placeWakeUpCall({ to, messageText, consultationId }) {
  const apiKey = process.env.TELNYX_API_KEY
  const from   = process.env.TELNYX_VOICE_FROM_NUMBER
  const connId = process.env.TELNYX_CALL_CONTROL_CONNECTION_ID
  if (!apiKey || !from || !connId) {
    return { ok: false, error: 'Telnyx voice not configured (TELNYX_API_KEY / TELNYX_VOICE_FROM_NUMBER / TELNYX_CALL_CONTROL_CONNECTION_ID)' }
  }
  const toE = toE164(to)
  if (!toE) return { ok: false, error: 'invalid destination' }

  const base = process.env.PUBLIC_API_BASE || 'https://terehealth.co.nz'
  const webhookUrl = `${base}/api/voice-webhook`

  // Pass the message text + consult id through client_state so the webhook
  // can recover them on the call.answered event. Telnyx requires base64 in
  // client_state and echoes it back verbatim on every event for the call.
  const clientState = Buffer.from(JSON.stringify({
    kind: 'wake_up',
    text: messageText || 'Tere after-hours. A rest home resident is waiting. Open your dashboard.',
    consultationId: consultationId || null,
  })).toString('base64')

  const body = {
    from,
    to: toE,
    connection_id: connId,
    answering_machine_detection: 'disabled',  // ring Patrick's phone, don't wait to detect voicemail
    webhook_url: webhookUrl,
    webhook_url_method: 'POST',
    client_state: clientState,
    timeout_secs: 25,                         // ~5 rings then give up
  }

  try {
    const r = await fetch('https://api.telnyx.com/v2/calls', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      return { ok: false, error: data?.errors?.[0]?.detail || data?.error || `Telnyx ${r.status}` }
    }
    return { ok: true, callControlId: data?.data?.call_control_id || null }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}
