// AWS Chime SDK Meetings — server-side lifecycle for real-time video/audio
// consultations. Replaces LiveKit room provisioning (task 2026-09-09).
//
// Why Chime SDK Meetings:
//   - Same AWS BAA umbrella as Bedrock + SES → single compliance story
//   - Region-pinned by construction (ap-southeast-2 for NZ patients,
//     us-east-1 for US patients) → satisfies data-residency for enterprise
//     health customers without paying LiveKit Scale's $500/mo
//   - Pay-per-attendee-minute (~$0.0017/min) → dramatically cheaper than
//     LiveKit at Tere's expected volume
//
// Actions (all POST):
//   action=create        (provider-authed) → creates Chime meeting + provider
//                                            attendee, persists meetingId/region
//                                            on consultations row, returns join info
//   action=join-patient  (patient-token)   → creates patient attendee for the
//                                            meeting the provider already opened
//   action=end           (provider-authed) → deletes the Chime meeting and clears
//                                            meetingId from the consult
//
// Design notes:
//   - Meeting state persisted on consultations.chime_meeting_id (migration
//     2026-09-09_chime_meeting_columns.sql). Provider create + patient join
//     both need to reference the same meeting.
//   - Region routing: patient_billing_country='us' → us-east-1, else
//     ap-southeast-2. Chime meetings are region-locked at creation and
//     attendees join whichever region the meeting was made in.
//   - LiveKit endpoints remain active during migration. Client feature-flag
//     (USE_CHIME_SDK env) decides which path a browser takes. Rollback is a
//     single env-var flip.

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import {
  ChimeSDKMeetingsClient,
  CreateMeetingCommand,
  CreateAttendeeCommand,
  GetMeetingCommand,
  DeleteMeetingCommand,
} from '@aws-sdk/client-chime-sdk-meetings'
import { guardProvider } from './_auth.js'
import { resolvePatientAuth } from './_patient-token.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Meeting-service endpoint lives in a small set of regions. NZ traffic goes
// to Sydney; US patient traffic goes to us-east-1 (Virginia — closest to
// existing US patient base). Both are HIPAA-eligible under the AWS BAA.
function regionForConsult(consult) {
  const country = String(consult?.patient_billing_country || '').toLowerCase()
  if (country === 'us' || country === 'usa' || country === 'united states') return 'us-east-1'
  return 'ap-southeast-2'
}

const clientCache = new Map()
function chimeClient(region) {
  if (!clientCache.has(region)) {
    clientCache.set(region, new ChimeSDKMeetingsClient({ region }))
  }
  return clientCache.get(region)
}

// Shape returned to browsers matches what amazon-chime-sdk-js's
// DefaultMeetingSession expects: { Meeting, Attendee }.
function joinInfo(meeting, attendee) {
  return {
    Meeting:  { ...meeting },
    Attendee: { ...attendee },
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const action = String(req.query?.action || req.body?.action || '')
  if (!action) return res.status(400).json({ error: 'action required' })

  const supabase = admin()

  // ── create ──────────────────────────────────────────────────────────────
  // Provider opens the video room. Idempotent: if the consult already has a
  // meetingId AND the meeting still exists in Chime, we reuse it. If the
  // meeting was auto-cleaned by Chime (24hr TTL), we mint a fresh one.
  if (action === 'create') {
    const auth = await guardProvider(req, res)
    if (!auth) return
    const consultationId = String(req.body?.consultationId || '')
    if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

    const { data: consult, error: cErr } = await supabase
      .from('consultations')
      .select('id, provider_id, chime_meeting_id, chime_meeting_region, patient_billing_country')
      .eq('id', consultationId)
      .maybeSingle()
    if (cErr || !consult) return res.status(404).json({ error: 'Consultation not found' })

    const region = consult.chime_meeting_region || regionForConsult(consult)
    const client = chimeClient(region)

    let meeting = null
    // Reuse existing meeting if still alive on the Chime side.
    if (consult.chime_meeting_id) {
      try {
        const got = await client.send(new GetMeetingCommand({ MeetingId: consult.chime_meeting_id }))
        meeting = got.Meeting
      } catch (e) {
        // NotFound = Chime already reaped it (24hr idle). Fall through to create fresh.
        if (e?.name !== 'NotFoundException') {
          console.error('[chime-meeting] GetMeeting failed:', e?.message)
        }
      }
    }
    if (!meeting) {
      try {
        const created = await client.send(new CreateMeetingCommand({
          ClientRequestToken: randomUUID(),
          MediaRegion: region,
          ExternalMeetingId: `tere-consult-${consultationId}`.slice(0, 64),
        }))
        meeting = created.Meeting
      } catch (e) {
        console.error('[chime-meeting] CreateMeeting failed:', e)
        return res.status(500).json({ error: 'Failed to create meeting', detail: e?.message })
      }
      await supabase.from('consultations').update({
        chime_meeting_id:         meeting.MeetingId,
        chime_meeting_region:     region,
        chime_meeting_started_at: new Date().toISOString(),
      }).eq('id', consultationId)
    }

    // Provider attendee — one per provider per meeting. If they refresh, we
    // just mint a new attendee for the same meeting (Chime supports many).
    let attendee = null
    try {
      const att = await client.send(new CreateAttendeeCommand({
        MeetingId: meeting.MeetingId,
        ExternalUserId: `provider-${auth.provider.id}`.slice(0, 64),
      }))
      attendee = att.Attendee
    } catch (e) {
      console.error('[chime-meeting] CreateAttendee (provider) failed:', e)
      return res.status(500).json({ error: 'Failed to create provider attendee', detail: e?.message })
    }

    return res.status(200).json({ ok: true, ...joinInfo(meeting, attendee), region })
  }

  // ── join-patient ────────────────────────────────────────────────────────
  // Patient side. Requires patient_access_token — server exchanges token for
  // consultation id, then looks up the meeting the provider already opened
  // and mints a patient attendee. Patient never sees the raw meetingId
  // before this call — it's server-brokered per token.
  if (action === 'join-patient') {
    const auth = await resolvePatientAuth(req)
    if (!auth?.consultationId) return res.status(401).json({ error: 'Patient token required' })

    const { data: consult } = await supabase
      .from('consultations')
      .select('id, chime_meeting_id, chime_meeting_region, patient_billing_country')
      .eq('id', auth.consultationId)
      .maybeSingle()
    if (!consult) return res.status(404).json({ error: 'Consultation not found' })
    if (!consult.chime_meeting_id) return res.status(409).json({ error: 'Provider has not started the call yet' })

    const region = consult.chime_meeting_region || regionForConsult(consult)
    const client = chimeClient(region)

    let meeting = null
    try {
      const got = await client.send(new GetMeetingCommand({ MeetingId: consult.chime_meeting_id }))
      meeting = got.Meeting
    } catch (e) {
      if (e?.name === 'NotFoundException') {
        // Meeting expired — clear stale id so next provider action mints fresh.
        await supabase.from('consultations').update({ chime_meeting_id: null }).eq('id', consult.id)
        return res.status(410).json({ error: 'Meeting expired, provider must restart' })
      }
      console.error('[chime-meeting] GetMeeting (patient join) failed:', e)
      return res.status(500).json({ error: 'Failed to load meeting', detail: e?.message })
    }

    let attendee = null
    try {
      const att = await client.send(new CreateAttendeeCommand({
        MeetingId: meeting.MeetingId,
        ExternalUserId: `patient-${consult.id}`.slice(0, 64),
      }))
      attendee = att.Attendee
    } catch (e) {
      console.error('[chime-meeting] CreateAttendee (patient) failed:', e)
      return res.status(500).json({ error: 'Failed to create patient attendee', detail: e?.message })
    }

    return res.status(200).json({ ok: true, ...joinInfo(meeting, attendee), region })
  }

  // ── end ─────────────────────────────────────────────────────────────────
  // Provider closes the call. Deletes the Chime meeting (any remaining
  // attendees are booted) and clears the meetingId from the consult row.
  if (action === 'end') {
    const auth = await guardProvider(req, res)
    if (!auth) return
    const consultationId = String(req.body?.consultationId || '')
    if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

    const { data: consult } = await supabase
      .from('consultations')
      .select('id, chime_meeting_id, chime_meeting_region')
      .eq('id', consultationId)
      .maybeSingle()
    if (!consult) return res.status(404).json({ error: 'Consultation not found' })
    if (!consult.chime_meeting_id) return res.status(200).json({ ok: true, note: 'no meeting to end' })

    const region = consult.chime_meeting_region || regionForConsult(consult)
    const client = chimeClient(region)

    try {
      await client.send(new DeleteMeetingCommand({ MeetingId: consult.chime_meeting_id }))
    } catch (e) {
      if (e?.name !== 'NotFoundException') {
        console.error('[chime-meeting] DeleteMeeting failed:', e)
        // Non-fatal — clear DB pointer anyway, meeting will TTL on Chime's side.
      }
    }
    await supabase.from('consultations').update({
      chime_meeting_id: null,
      chime_meeting_started_at: null,
    }).eq('id', consultationId)

    return res.status(200).json({ ok: true })
  }

  // ── create-test ─────────────────────────────────────────────────────────
  // Solo test meeting for provider device/network verification. No consult
  // row involved. Provider is the only attendee. Chime auto-reaps on last
  // attendee leaving; the cron in _cron-chime-cleanup.js sweeps zombies.
  //
  // TTL: capped at 15 minutes so a browser crash mid-test can't leak $$$
  // of idle attendee-minutes. Cron picks up anything the browser missed.
  if (action === 'create-test') {
    const auth = await guardProvider(req, res)
    if (!auth) return

    const region = 'ap-southeast-2'
    const client = chimeClient(region)
    const ttlMinutes = Math.min(15, Math.max(1, Number(req.body?.ttl_minutes) || 5))

    let meeting = null
    try {
      const created = await client.send(new CreateMeetingCommand({
        ClientRequestToken: randomUUID(),
        MediaRegion: region,
        ExternalMeetingId: `tere-test-${auth.provider.id}`.slice(0, 64),
      }))
      meeting = created.Meeting
    } catch (e) {
      console.error('[chime-meeting] CreateMeeting (test) failed:', e)
      return res.status(500).json({ error: 'Failed to create test meeting', detail: e?.message })
    }

    let attendee = null
    try {
      const att = await client.send(new CreateAttendeeCommand({
        MeetingId: meeting.MeetingId,
        ExternalUserId: `provider-test-${auth.provider.id}`.slice(0, 64),
      }))
      attendee = att.Attendee
    } catch (e) {
      console.error('[chime-meeting] CreateAttendee (test) failed:', e)
      return res.status(500).json({ error: 'Failed to create test attendee', detail: e?.message })
    }

    // Persist so the cron can sweep if the browser crashes before End Test
    // fires DeleteMeeting. Best-effort — a supabase outage shouldn't block
    // the test call itself, so we log-and-swallow.
    try {
      await supabase.from('test_chime_meetings').insert({
        meeting_id: meeting.MeetingId,
        region,
        provider_id: auth.provider.id,
        ttl_minutes: ttlMinutes,
      })
    } catch (e) {
      console.warn('[chime-meeting] test-meeting persist failed (non-fatal):', e?.message)
    }

    return res.status(200).json({ ok: true, ...joinInfo(meeting, attendee), region, ttl_minutes: ttlMinutes })
  }

  // ── end-test ─────────────────────────────────────────────────────────
  // Client calls this when the provider ends the test proactively. Cron
  // sweeps anything they leave behind.
  if (action === 'end-test') {
    const auth = await guardProvider(req, res)
    if (!auth) return
    const meetingId = String(req.body?.meetingId || '')
    if (!meetingId) return res.status(400).json({ error: 'meetingId required' })
    const region = String(req.body?.region || 'ap-southeast-2')
    try {
      await chimeClient(region).send(new DeleteMeetingCommand({ MeetingId: meetingId }))
    } catch (e) {
      if (e?.name !== 'NotFoundException') console.error('[chime-meeting] end-test failed:', e?.message)
    }
    try { await supabase.from('test_chime_meetings').delete().eq('meeting_id', meetingId) } catch {}
    return res.status(200).json({ ok: true })
  }

  return res.status(400).json({ error: 'Unknown action' })
}
