// Nightly sweep of stale Chime SDK meetings.
//
// Why:
//   Provider's End Call fires DeleteMeeting server-side, but network
//   failures / browser crashes / provider closing the tab mid-call leave
//   zombie meetings alive. Chime bills per attendee-minute even for
//   idle meetings, so we clean them up.
//
// What counts as stale:
//   - consultations.chime_meeting_id IS NOT NULL
//   - consultations.chime_meeting_started_at older than 4h
//   - OR consultation status in a terminal state (complete, no_show, cancelled)
//
// Chime itself auto-deletes meetings after ~5min of no attendees, so this
// is belt-and-braces + protects against Chime keeping "empty but active"
// meetings alive if attendees never joined the meeting session.

import { createClient } from '@supabase/supabase-js'
import {
  ChimeSDKMeetingsClient,
  DeleteMeetingCommand,
} from '@aws-sdk/client-chime-sdk-meetings'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const meetingsCache = new Map()
function meetingsClient(region) {
  if (!meetingsCache.has(region)) meetingsCache.set(region, new ChimeSDKMeetingsClient({ region }))
  return meetingsCache.get(region)
}

export default async function handler(req, res) {
  // Vercel cron GETs; also allow POST for manual runs.
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end()

  const supabase = admin()
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()

  const { data: rows, error } = await supabase
    .from('consultations')
    .select('id, chime_meeting_id, chime_meeting_region, chime_meeting_started_at, status')
    .not('chime_meeting_id', 'is', null)
    .or(`chime_meeting_started_at.lt.${fourHoursAgo},status.in.(complete,no_show,cancelled,dismissed)`)
    .limit(100)

  if (error) { console.error('[cron-chime-cleanup] fetch failed:', error); return res.status(500).json({ error: 'Server error' }) }

  const results = { swept: 0, failed: 0 }
  for (const r of rows || []) {
    const region = r.chime_meeting_region || 'ap-southeast-2'
    try {
      await meetingsClient(region).send(new DeleteMeetingCommand({ MeetingId: r.chime_meeting_id }))
      results.swept++
    } catch (e) {
      // NotFoundException is fine — Chime already deleted it, we just
      // need to clear the row. Anything else counts as a real failure.
      const msg = String(e?.message || '')
      if (!/NotFound/i.test(msg)) { results.failed++; console.error('[cron-chime-cleanup]', r.id, msg); continue }
    }
    // Clear the pointer so subsequent runs don't re-sweep the same row.
    await supabase.from('consultations')
      .update({ chime_meeting_id: null, chime_meeting_region: null })
      .eq('id', r.id)
  }

  // ── Test meetings sweep ─────────────────────────────────────────────
  // Provider device-check flow (see ProviderTestCall.jsx). These have no
  // consultation row so the main sweep above misses them. Anything alive
  // >15min is zombified — the flow caps itself at 5min, so 15min gives a
  // clock-skew + retry buffer.
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { data: testRows, error: tErr } = await supabase
    .from('test_chime_meetings')
    .select('meeting_id, region, created_at')
    .lt('created_at', fifteenMinAgo)
    .limit(100)

  if (tErr) {
    console.error('[cron-chime-cleanup] test fetch failed:', tErr)
  } else {
    for (const r of testRows || []) {
      const region = r.region || 'ap-southeast-2'
      try {
        await meetingsClient(region).send(new DeleteMeetingCommand({ MeetingId: r.meeting_id }))
        results.swept++
      } catch (e) {
        const msg = String(e?.message || '')
        if (!/NotFound/i.test(msg)) { results.failed++; console.error('[cron-chime-cleanup] test', r.meeting_id, msg); continue }
      }
      await supabase.from('test_chime_meetings').delete().eq('meeting_id', r.meeting_id)
    }
  }

  return res.status(200).json({ ok: true, ...results })
}
