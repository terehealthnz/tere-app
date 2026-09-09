// Tere Chime SDK SIP Media Application (SMA) handler — outbound PSTN dial-in.
//
// Why this exists:
//   Replaces the previous LiveKit-SIP outbound-dial path. When a patient
//   fails to join the Chime video meeting within ~10s, /api/chime-dial hits
//   Chime SDK Voice → CreateSipMediaApplicationCall, which places a PSTN
//   call to the patient's phone. Chime invokes THIS Lambda at each stage of
//   the call's lifecycle to decide what to do next. On CALL_ANSWERED we
//   return a JoinChimeMeeting action, wiring the patient's phone audio
//   into the running Chime meeting the provider is already in.
//
// SMA event lifecycle (for future readers):
//   NEW_OUTBOUND_CALL   — SMA received the outbound-call request. No user
//                         audio yet. Return [] to let Chime keep dialling.
//   RINGING             — carrier is ringing the destination. Return [].
//   CALL_ANSWERED       — patient picked up. THIS is where we return
//                         JoinChimeMeeting to bridge their audio in.
//   ACTION_SUCCESSFUL   — the last action we returned completed. If it was
//                         JoinChimeMeeting, patient is now in the meeting.
//   ACTION_FAILED       — the last action errored (bad JoinToken, meeting
//                         gone, etc). Log + hang up so we don't burn PSTN.
//   HANGUP              — either side ended the call. Return [] to close.
//   CALL_UPDATE_REQUESTED — an out-of-band UpdateSipMediaApplicationCall
//                         invocation. We don't use it yet; treat as no-op.
//   INVALID_LAMBDA_RESPONSE — Chime is telling us WE returned malformed
//                         JSON on a prior event. Log loudly + hang up.
//
// Runtime: Node.js 22, ESM, zero external deps (uses only console + JSON).
// Anything more is dead weight — SMA handlers must return in <5s or Chime
// times out and hangs up on the caller.

const VERSION = '2026-09-08.1'

// Structured log: single JSON line per event, easy to CloudWatch-Insights.
function log(level, msg, extra = {}) {
  console.log(JSON.stringify({
    lvl: level, msg, v: VERSION, t: new Date().toISOString(), ...extra,
  }))
}

// SMA always expects { SchemaVersion: '1.0', Actions: [...] }. Empty
// Actions array = "do nothing, keep the call in its current state".
function respond(actions = []) {
  return { SchemaVersion: '1.0', Actions: actions }
}

// JoinChimeMeeting action shape. JoinToken carries the MeetingId internally
// (Chime validates + looks up server-side), so we don't need to pass it
// separately. CallId comes from CallDetails.Participants[0].CallId — that's
// the leg between Chime and the patient's phone.
function joinChimeMeetingAction(callId, joinToken) {
  return {
    Type: 'JoinChimeMeeting',
    Parameters: {
      CallId: callId,
      JoinToken: joinToken,
    },
  }
}

// Hangup action — used when we can't recover (missing JoinToken, etc).
// SipResponseCode 480 = "temporarily unavailable" (correct semantic for
// "we can't connect you right now"), not 500 which callers hear as a fault.
function hangupAction(callId) {
  return {
    Type: 'Hangup',
    Parameters: { CallId: callId, SipResponseCode: '480' },
  }
}

// TransactionAttributes are the AWS-recommended way to thread app-level
// state (our MeetingId + JoinToken) from CreateSipMediaApplicationCall
// through every subsequent event. Chime echoes them on every invocation.
// Fall back to SipHeaders for interop with call-flows started outside our
// API (e.g. manual retry via aws cli) that used the X-Meeting-* header path.
function extractMeetingCtx(event) {
  const attrs = event?.CallDetails?.TransactionAttributes || {}
  if (attrs.joinToken) return { meetingId: attrs.meetingId, joinToken: attrs.joinToken }

  const hdrs = event?.CallDetails?.Participants?.[0]?.SipHeaders || {}
  const joinToken = hdrs['X-Meeting-JoinToken'] || hdrs['x-meeting-jointoken']
  const meetingId = hdrs['X-Meeting-Id']        || hdrs['x-meeting-id']
  if (joinToken) return { meetingId, joinToken }

  return { meetingId: null, joinToken: null }
}

// Primary participant = the patient leg (the only leg on an outbound
// SMA-originated call until JoinChimeMeeting fans it into the meeting).
function primaryCallId(event) {
  return event?.CallDetails?.Participants?.[0]?.CallId || null
}

export const handler = async (event) => {
  const eventType = event?.InvocationEventType || 'UNKNOWN'
  const callId    = primaryCallId(event)
  const txId      = event?.CallDetails?.TransactionId

  log('info', 'sma-event', { eventType, callId, txId })

  try {
    switch (eventType) {
      // Outbound call was just accepted by Chime; carrier hasn't rung yet.
      // Nothing to do — return [] and wait for RINGING/CALL_ANSWERED.
      case 'NEW_OUTBOUND_CALL':
      case 'RINGING':
        return respond([])

      case 'CALL_ANSWERED': {
        const { meetingId, joinToken } = extractMeetingCtx(event)
        if (!joinToken || !callId) {
          // Hard fail — without JoinToken we can't bridge audio anywhere,
          // and letting the call sit open bills the caller for silence.
          log('error', 'call-answered-missing-context', { callId, meetingId, hasToken: !!joinToken })
          return respond(callId ? [hangupAction(callId)] : [])
        }
        log('info', 'joining-meeting', { callId, meetingId })
        return respond([joinChimeMeetingAction(callId, joinToken)])
      }

      case 'ACTION_SUCCESSFUL': {
        // Confirms our previous action landed. Nothing more to do until
        // hangup — Chime keeps the audio bridge open on its own.
        const actionType = event?.ActionData?.Type
        log('info', 'action-successful', { actionType, callId })
        return respond([])
      }

      case 'ACTION_FAILED': {
        // Common causes: JoinToken expired, MeetingId already deleted,
        // patient number rejected mid-call. Hang up cleanly.
        const actionType = event?.ActionData?.Type
        const errorType  = event?.ActionData?.ErrorType
        const errorMsg   = event?.ActionData?.ErrorMessage
        log('error', 'action-failed', { actionType, errorType, errorMsg, callId })
        return respond(callId ? [hangupAction(callId)] : [])
      }

      case 'HANGUP': {
        // Either side ended the call. Chime tears down automatically; our
        // only job is to acknowledge with an empty action list.
        const reason = event?.CallDetails?.Participants?.[0]?.Status || 'unknown'
        log('info', 'hangup', { callId, reason })
        return respond([])
      }

      case 'CALL_UPDATE_REQUESTED':
        // Reserved for future features (e.g. DTMF-triggered transfer).
        log('info', 'call-update-noop', { callId })
        return respond([])

      case 'INVALID_LAMBDA_RESPONSE':
        // Chime is telling us our previous response was malformed. Nothing
        // we can do at this point except log + let the call fall through.
        log('error', 'invalid-lambda-response', { callId, event })
        return respond(callId ? [hangupAction(callId)] : [])

      default:
        log('warn', 'unknown-event-type', { eventType })
        return respond([])
    }
  } catch (err) {
    // Never throw — Chime will retry AND hang up on the caller. Always
    // return a well-formed empty response and log for CloudWatch alarms.
    log('error', 'handler-exception', { err: String(err?.message || err), stack: err?.stack })
    return respond(callId ? [hangupAction(callId)] : [])
  }
}
