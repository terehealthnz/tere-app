// Outbound PSTN dial for Chime consultations — the "patient didn't join
// the video call, ring their phone instead" fallback.
//
// Flow:
//   1. Provider's browser has been in the Chime meeting for ~10s with no
//      patient attendee. Client hits POST /api/chime-dial { consultationId }.
//   2. This endpoint mints a fresh patient Attendee against the existing
//      Chime meeting (each attendee has a single-use JoinToken).
//   3. Calls chime-sdk-voice:CreateSipMediaApplicationCall — Chime places
//      an outbound PSTN call from CHIME_SMA_FROM_NUMBER to the patient's
//      phone. MeetingId + JoinToken travel via Arguments (delivered to
//      lambda/chime-sma/handler.mjs as CallDetails.TransactionAttributes).
//   4. On CALL_ANSWERED the SMA Lambda returns JoinChimeMeeting, splicing
//      patient audio into the running meeting the provider is already in.
//
// Consultation row is stamped with the returned callId + timestamp so
// operations can retro-audit dial attempts and cost per consult.

import { createClient } from '@supabase/supabase-js'
import {
  ChimeSDKMeetingsClient,
  CreateAttendeeCommand,
} from '@aws-sdk/client-chime-sdk-meetings'
import {
  ChimeSDKVoiceClient,
  CreateSipMediaApplicationCallCommand,
} from '@aws-sdk/client-chime-sdk-voice'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Voice control-plane lives in a small number of regions and is the SAME
// region the SMA was created in. Meetings can be in ap-southeast-2 or
// us-east-1 (see _chime-meeting.js); voice is always ap-southeast-2 for
// now because that's where the SMA + NZ DID live. If we later add US
// PSTN dial we'll spin a second SMA in us-east-1.
const VOICE_REGION = process.env.CHIME_VOICE_REGION || 'ap-southeast-2'

let voiceCache = null
function voiceClient() {
  if (!voiceCache) voiceCache = new ChimeSDKVoiceClient({ region: VOICE_REGION })
  return voiceCache
}

const meetingsCache = new Map()
function meetingsClient(region) {
  if (!meetingsCache.has(region)) meetingsCache.set(region, new ChimeSDKMeetingsClient({ region }))
  return meetingsCache.get(region)
}

// E.164 validation is deliberately loose — patient_phone is already
// normalised on write (see _consultations.js). This is a belt-and-braces
// gate against garbage rows so we don't burn a PSTN attempt on obviously
// malformed numbers.
function looksLikeE164(s) {
  return typeof s === 'string' && /^\+[1-9]\d{6,14}$/.test(s)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await guardProvider(req, res)
  if (!auth) return

  const consultationId = String(req.body?.consultationId || '')
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  const smaId       = process.env.CHIME_SMA_ID
  const fromNumber  = process.env.CHIME_SMA_FROM_NUMBER
  if (!smaId || !fromNumber) {
    console.error('[chime-dial] CHIME_SMA_ID / CHIME_SMA_FROM_NUMBER not configured')
    return res.status(500).json({ error: 'Outbound dial not configured' })
  }

  const supabase = admin()
  const { data: consult, error: cErr } = await supabase
    .from('consultations')
    .select('id, provider_id, patient_phone, chime_meeting_id, chime_meeting_region, status')
    .eq('id', consultationId)
    .maybeSingle()
  if (cErr || !consult) return res.status(404).json({ error: 'Consultation not found' })

  if (!consult.chime_meeting_id) return res.status(409).json({ error: 'Meeting not started' })
  if (!looksLikeE164(consult.patient_phone)) {
    return res.status(400).json({ error: 'Patient phone missing or not E.164' })
  }

  // Mint a fresh attendee dedicated to the PSTN leg. Doing this server-side
  // (rather than reusing a browser attendee) means the JoinToken is single-
  // use and scoped to this dial attempt — a leaked token can't be replayed
  // into a new browser session.
  let attendee = null
  try {
    const region = consult.chime_meeting_region || 'ap-southeast-2'
    const att = await meetingsClient(region).send(new CreateAttendeeCommand({
      MeetingId: consult.chime_meeting_id,
      ExternalUserId: `patient-pstn-${consult.id}`.slice(0, 64),
    }))
    attendee = att.Attendee
  } catch (e) {
    console.error('[chime-dial] CreateAttendee failed:', e?.message)
    return res.status(500).json({ error: 'Failed to create patient attendee', detail: e?.message })
  }

  // Arguments is delivered to the SMA Lambda on every event via
  // CallDetails.TransactionAttributes. Values must be strings, keys/values
  // together under ~2KB — MeetingId + JoinToken fits comfortably.
  let callId = null
  try {
    const out = await voiceClient().send(new CreateSipMediaApplicationCallCommand({
      FromPhoneNumber: fromNumber,
      ToPhoneNumber:   consult.patient_phone,
      SipMediaApplicationId: smaId,
      Arguments: {
        meetingId: String(consult.chime_meeting_id),
        joinToken: String(attendee.JoinToken),
        consultationId: String(consult.id),
      },
    }))
    callId = out?.SipMediaApplicationCall?.TransactionId || null
  } catch (e) {
    console.error('[chime-dial] CreateSipMediaApplicationCall failed:', e?.message)
    return res.status(500).json({ error: 'Failed to place outbound call', detail: e?.message })
  }

  // Best-effort audit stamp — if this update fails we've still dialled, so
  // don't fail the request. Ops can reconcile from CloudWatch if needed.
  await supabase.from('consultations').update({
    chime_pstn_call_id:   callId,
    chime_pstn_dialed_at: new Date().toISOString(),
  }).eq('id', consult.id).then(({ error }) => {
    if (error) console.error('[chime-dial] audit stamp failed:', error.message)
  })

  return res.status(200).json({ ok: true, callId })
}
