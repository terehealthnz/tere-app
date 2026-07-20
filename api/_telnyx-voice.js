// Unified Telnyx Programmable Voice webhook. Telnyx uses a command/event model
// instead of TwiML: each call event (call.initiated, call.answered, call.hangup,
// call.machine.detection.ended, ...) POSTs to this endpoint, and we respond by
// making follow-up API calls back to Telnyx (answer, join, speak, hangup) to
// steer the call. We must ACK the webhook fast — the follow-up POSTs to Telnyx
// happen inline after we've decided what to do, then we return 200.
//
// The consultationId is round-tripped through Telnyx's `client_state` parameter
// (base64-JSON) which they echo back on every subsequent event for the same
// call leg. That's the only way to correlate a call_control_id back to a
// consultation without hitting Supabase on every event.
//
// TODO: verify the `telnyx-signature-ed25519-signature` + `-timestamp` headers
// against the Telnyx public key. It's Ed25519 over `timestamp|body` per
// https://developers.telnyx.com/docs/api/v2/overview#webhook-signature — not
// enabled yet because we're on the same-account API-key trust boundary as
// _send-fax.js. Add signature verification before opening the webhook URL to
// the wider internet or if we start acting on caller identity from events.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const TELNYX_API = 'https://api.telnyx.com/v2'

// Map Telnyx call.hangup + AMD results to the same status vocabulary the
// frontend already polls for (see ConsultView.jsx / ProviderConsult.jsx).
// Keeping the existing values means no frontend changes ship with the voice
// provider swap.
function mapHangupCause(cause) {
  // Telnyx hangup_cause values: normal_clearing, user_busy, no_answer,
  // call_rejected, unallocated_number, originator_cancel, ...
  switch (cause) {
    case 'normal_clearing':    return 'completed'
    case 'user_busy':          return 'busy'
    case 'no_answer':          return 'no_answer'
    case 'call_rejected':      return 'no_answer'
    case 'originator_cancel':  return 'canceled'
    case 'destination_out_of_order': return 'failed'
    case 'unallocated_number': return 'failed'
    default:                   return cause ? 'failed' : 'completed'
  }
}

function decodeClientState(clientState) {
  if (!clientState) return {}
  try {
    return JSON.parse(Buffer.from(clientState, 'base64').toString('utf-8'))
  } catch {
    return {}
  }
}

async function telnyxAction(callControlId, action, body = {}) {
  const key = process.env.TELNYX_API_KEY
  if (!key) throw new Error('TELNYX_API_KEY not configured')
  const url = `${TELNYX_API}/calls/${encodeURIComponent(callControlId)}/actions/${action}`
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const errText = await r.text().catch(() => '')
    console.error(`[telnyx-voice] action ${action} failed ${r.status}:`, errText)
  }
  return r
}

async function updateConsultStatus(callControlId, patch) {
  // Lookup by voice_call_id — we saved this at dial time in _make-call.js.
  // If not found, silently ignore (unknown call — could be from another env).
  const { data: consult } = await supabase
    .from('consultations')
    .select('id')
    .eq('voice_call_id', callControlId)
    .maybeSingle()
  if (!consult) return
  await supabase.from('consultations').update(patch).eq('id', consult.id)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // ACK immediately-ish. We still do the follow-up Telnyx API calls before
  // returning because Vercel serverless kills the process after res.end().
  const evt = req.body?.data
  if (!evt || !evt.event_type) {
    return res.status(200).send('OK')
  }

  const payload = evt.payload || {}
  const eventType = evt.event_type
  const callControlId = payload.call_control_id
  const state = decodeClientState(payload.client_state)
  const consultationId = state.consultationId

  try {
    switch (eventType) {
      case 'call.initiated': {
        // Outbound leg to patient — nothing to do. Telnyx auto-dials since we
        // used the /v2/calls create-and-dial endpoint. Log for debugging only.
        console.log(JSON.stringify({ ts: new Date().toISOString(), type: 'telnyx_voice', event: eventType, call: callControlId, consultationId }))
        break
      }

      case 'call.answered': {
        // Patient picked up. Bridge them into the conference room keyed by
        // consultationId — matches the old TwiML `<Dial><Conference>tere-{id}`.
        // Telnyx auto-creates the conference on first join, so no explicit
        // /v2/conferences POST needed.
        if (!callControlId) break
        if (!consultationId) {
          // No consultationId in client_state — can't route to a conference.
          // Play a message and hang up rather than leaving the patient in silence.
          await telnyxAction(callControlId, 'speak', {
            payload: 'Sorry, there was an error connecting your call. Please wait for the doctor to try again.',
            voice: 'female',
            language: 'en-US',
          })
          await telnyxAction(callControlId, 'hangup', {})
          break
        }
        await telnyxAction(callControlId, 'join_conference', {
          // Telnyx conference name — mirror the old tere-{id} pattern so any
          // dashboards/logs looking for conferences by name still match.
          conference_name: `tere-${consultationId}`,
          start_conference_on_enter: true,
          end_conference_on_exit: false,
        })
        await updateConsultStatus(callControlId, { twilio_call_status: 'answered' })
        break
      }

      case 'call.machine.detection.ended': {
        // AMD result — Telnyx returns `result: human | machine | fax | not_sure`.
        const result = payload.result
        if (result && result !== 'human') {
          // Voicemail / machine — play a "we'll call back" message and hang up
          // rather than dropping the patient into a silent conference.
          if (callControlId) {
            await telnyxAction(callControlId, 'speak', {
              payload: 'Sorry, we were unable to reach you. Your doctor will try again shortly.',
              voice: 'female',
              language: 'en-US',
            })
            await telnyxAction(callControlId, 'hangup', {})
          }
          await updateConsultStatus(callControlId, { twilio_call_status: 'no_answer' })
        }
        break
      }

      case 'call.hangup': {
        // Terminal event — write final status. Duration comes from `call_duration_secs`
        // on hangup payloads (Telnyx uses that field name).
        const cause = payload.hangup_cause
        const duration = typeof payload.call_duration_secs === 'number'
          ? payload.call_duration_secs
          : null
        const status = mapHangupCause(cause)
        const patch = {
          twilio_call_status: status,
          call_ended_at: new Date().toISOString(),
        }
        if (duration !== null) patch.call_duration_seconds = duration
        await updateConsultStatus(callControlId, patch)
        break
      }

      default: {
        // call.bridged, conference.participant.joined, etc. — log + move on.
        console.log(JSON.stringify({ ts: new Date().toISOString(), type: 'telnyx_voice', event: eventType, call: callControlId }))
      }
    }
  } catch (e) {
    console.error('[telnyx-voice] handler error:', e)
    // Still return 200 so Telnyx doesn't retry-storm us — the error is logged.
  }

  return res.status(200).send('OK')
}
