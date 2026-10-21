// /api/business-meetings — admin CRUD for Tere-branded business meetings.
//
// Actions (query ?action=...):
//   GET  list                → upcoming + recent past, grouped
//   POST create              → new meeting + mint guest token + email invite + .ics
//   POST host_token          → mint one-shot LiveKit token for admin host
//   POST admit               → let the knocking guest into the room
//   POST deny                → kick the knocking guest with a polite dead-end
//   POST cancel              → mark cancelled, invalidate guest token path
//
// Guest-side resolution lives in /api/meeting-join (public, polls for admission).
//
// Admin-only. Non-admin providers get 403 — business meetings are a
// corporate/leadership surface, not a clinician one.

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'
import { guardProvider } from './_auth.js'
import { sendEmail, hasEmailProvider } from './_email-client.js'
import { buildInterviewIcs } from './_ics.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const LK_URL    = process.env.LIVEKIT_URL
const LK_KEY    = process.env.LIVEKIT_API_KEY
const LK_SECRET = process.env.LIVEKIT_API_SECRET

function urlToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url')
}

function roomKey() {
  // Short, URL-safe, readable in LiveKit dashboards.
  return 'meet-' + randomBytes(6).toString('hex')
}

function getSiteOriginFor(req) {
  return process.env.PUBLIC_SITE_ORIGIN
    || (req?.headers?.['x-forwarded-proto'] && req?.headers?.['x-forwarded-host']
        ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
        : 'https://terehealth.co.nz')
}

function fmtNz(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-NZ', {
    timeZone: 'Pacific/Auckland', dateStyle: 'full', timeStyle: 'short',
  })
}

function emailShell(bodyHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px"><div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div></div>
  <div style="padding:24px 28px">${bodyHtml}</div>
  <div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">Tere Health Ltd · terehealth.co.nz</div>
</body></html>`
}

async function sendMeetingInvite({ meeting, joinUrl, hostName }) {
  if (!meeting.guest_email || !hasEmailProvider()) return
  const firstName = (meeting.guest_name || '').split(' ')[0] || 'there'
  const when = fmtNz(meeting.scheduled_at)
  const hostLine = hostName ? `with <strong>${hostName}</strong>` : 'with the Tere Health team'

  const attachments = []
  if (meeting.scheduled_at) {
    const ics = buildInterviewIcs({
      uid:            `meeting-${meeting.id}@terehealth.co.nz`,
      start:          new Date(meeting.scheduled_at),
      durationMin:    meeting.duration_minutes || 30,
      summary:        meeting.title || 'Tere Health meeting',
      description:    `Join link: ${joinUrl}\n\nYou'll land in a short waiting room — the host will admit you when they're ready.`,
      location:       joinUrl,
      organiserEmail: 'hello@terehealth.co.nz',
      organiserName:  'Tere Health',
    })
    attachments.push({
      filename:    'tere-health-meeting.ics',
      contentType: 'text/calendar; charset=utf-8; method=REQUEST',
      content:     Buffer.from(ics, 'utf8'),
    })
  }

  await sendEmail({
    from: 'Tere Health <hello@terehealth.co.nz>',
    replyTo: 'terehealthnz@gmail.com',
    to: [meeting.guest_email],
    subject: meeting.title ? `Meeting invite: ${meeting.title}` : 'Tere Health meeting invite',
    html: emailShell(`
      <p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p>
      <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 12px">You're invited to a video meeting ${hostLine}.</p>
      ${meeting.title ? `<p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 12px"><strong>${meeting.title}</strong></p>` : ''}
      ${when ? `<p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 20px">Scheduled for <strong>${when}</strong> (NZ time).</p>` : ''}
      <div style="text-align:center;margin:28px 0"><a href="${joinUrl}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:14px 32px;border-radius:99px;font-size:15px;font-weight:700">Join meeting →</a></div>
      <p style="font-size:13px;color:#6B7280;line-height:1.6;margin:0 0 8px">When you click Join you'll land in a brief waiting room — we'll let you in as soon as we're ready.</p>
      ${meeting.scheduled_at ? '<p style="font-size:13px;color:#6B7280;line-height:1.6;margin:0 0 8px">A calendar invite is attached — open it once and the event lands in Google Calendar / Outlook / iOS Calendar automatically.</p>' : ''}
      <p style="font-size:12px;color:#0B6E76;word-break:break-all;margin:12px 0 24px">${joinUrl}</p>
      <p style="font-size:15px;line-height:1.7;color:#374151;margin:24px 0 0">Ngā mihi,<br>The Tere Health team</p>`),
    text: [
      `Kia ora ${firstName},`, '',
      `You're invited to a video meeting ${hostName ? `with ${hostName}` : 'with the Tere Health team'}.`, '',
      meeting.title || '',
      when ? `Scheduled: ${when} (NZ time)` : '', '',
      `Join: ${joinUrl}`, '',
      "When you click Join you'll land in a brief waiting room — we'll let you in as soon as we're ready.",
      '',
      'Ngā mihi,', 'The Tere Health team',
    ].filter(Boolean).join('\n'),
    attachments,
  })
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  if (!auth.provider.is_admin) {
    return res.status(403).json({ error: 'Admin role required' })
  }
  const supabase = admin()
  const action = String(req.query?.action || '').toLowerCase()

  // ── GET list ──────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    // Last 30 days + anything scheduled or in-progress. Keeps the UI
    // scoped to "currently relevant" without pagination for v1.
    const since = new Date(Date.now() - 30 * 86400000).toISOString()
    const { data, error } = await supabase.from('business_meetings')
      .select(`
        id, title, guest_name, guest_email, guest_organisation, scheduled_at,
        duration_minutes, admission_status, guest_knocked_at, admitted_at,
        status, started_at, ended_at, created_at, host_provider_id,
        host:providers!business_meetings_host_provider_id_fkey (first_name, last_name)
      `)
      .or(`created_at.gte.${since},status.in.(scheduled,in_progress)`)
      .order('scheduled_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[business-meetings] list failed:', error.message)
      return res.status(500).json({ error: 'Server error' })
    }
    // Shape guest URL for each row.
    const origin = getSiteOriginFor(req)
    const rows = (data || []).map(m => ({ ...m, host_display_name: m.host ? [m.host.first_name, m.host.last_name].filter(Boolean).join(' ') : null }))
    return res.status(200).json({ meetings: rows, originForGuestLink: origin })
  }

  // ── POST actions ──────────────────────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Create
  if (action === 'create' || !action) {
    const {
      title, guestName, guestEmail, guestOrganisation,
      scheduledAt, durationMinutes, notes, sendInvite,
    } = req.body || {}
    if (!title || !guestName) {
      return res.status(400).json({ error: 'title and guestName are required' })
    }
    const row = {
      title:                String(title).trim(),
      guest_name:           String(guestName).trim(),
      guest_email:          guestEmail ? String(guestEmail).trim().toLowerCase() : null,
      guest_organisation:   guestOrganisation ? String(guestOrganisation).trim() : null,
      scheduled_at:         scheduledAt || null,
      duration_minutes:     Math.max(5, Math.min(240, parseInt(durationMinutes) || 30)),
      room_key:             roomKey(),
      guest_join_token:     urlToken(),
      notes:                notes ? String(notes).trim().slice(0, 2000) : '',
      host_provider_id:     auth.provider.id,
      created_by_provider_id: auth.provider.id,
    }
    const { data, error } = await supabase.from('business_meetings').insert(row).select('*').single()
    if (error) {
      console.error('[business-meetings] create failed:', error.message)
      return res.status(500).json({ error: 'Server error' })
    }
    const origin = getSiteOriginFor(req)
    const joinUrl = `${origin}/meet/${data.guest_join_token}`

    // Fire-and-forget invite (never blocks the create response).
    if (sendInvite !== false && data.guest_email) {
      try {
        const hostName = [auth.provider.first_name, auth.provider.last_name].filter(Boolean).join(' ') || null
        await sendMeetingInvite({ meeting: data, joinUrl, hostName })
      } catch (e) { console.error('[business-meetings] invite email failed:', e.message) }
    }
    return res.status(200).json({ meeting: data, guestJoinUrl: joinUrl })
  }

  // Admit
  if (action === 'admit') {
    const { id } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id required' })
    const { data, error } = await supabase.from('business_meetings')
      .update({ admission_status: 'admitted', admitted_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, admission_status')
      .single()
    if (error) {
      console.error('[business-meetings] admit failed:', error.message)
      return res.status(500).json({ error: 'Server error' })
    }
    return res.status(200).json({ meeting: data })
  }

  // Deny
  if (action === 'deny') {
    const { id } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id required' })
    const { data, error } = await supabase.from('business_meetings')
      .update({ admission_status: 'denied', denied_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, admission_status')
      .single()
    if (error) {
      console.error('[business-meetings] deny failed:', error.message)
      return res.status(500).json({ error: 'Server error' })
    }
    return res.status(200).json({ meeting: data })
  }

  // Cancel
  if (action === 'cancel') {
    const { id } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id required' })
    const { data, error } = await supabase.from('business_meetings')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select('id, status')
      .single()
    if (error) return res.status(500).json({ error: 'Server error' })
    return res.status(200).json({ meeting: data })
  }

  // Host LiveKit token — one-shot, 2hr TTL
  if (action === 'host_token') {
    const { id } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id required' })
    const { data: m, error } = await supabase.from('business_meetings')
      .select('id, room_key, status, title')
      .eq('id', id)
      .maybeSingle()
    if (error) return res.status(500).json({ error: 'Server error' })
    if (!m) return res.status(404).json({ error: 'Meeting not found' })
    if (m.status === 'cancelled') return res.status(410).json({ error: 'Meeting cancelled' })

    if (!LK_URL || !LK_KEY || !LK_SECRET) {
      return res.status(200).json({
        token: null, serverUrl: null, roomName: m.room_key, title: m.title, mock: true,
      })
    }
    try {
      const httpUrl = LK_URL.replace(/^wss?:\/\//, 'https://')
      const svc = new RoomServiceClient(httpUrl, LK_KEY, LK_SECRET)
      await svc.createRoom({ name: m.room_key, emptyTimeout: 900, maxParticipants: 10 })
    } catch {}

    const hostName = [auth.provider.first_name, auth.provider.last_name].filter(Boolean).join(' ') || 'Tere Health'
    const at = new AccessToken(LK_KEY, LK_SECRET, {
      identity: `host-${auth.provider.id.slice(0, 8)}`,
      name:     hostName,
      ttl:      7200,
    })
    at.addGrant({
      roomJoin: true, room: m.room_key,
      canPublish: true, canSubscribe: true, canPublishData: true,
    })
    const lkToken = await at.toJwt()

    // Stamp started_at on first host join.
    if (m.status === 'scheduled') {
      await supabase.from('business_meetings')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', id)
    }
    return res.status(200).json({
      token: lkToken, serverUrl: LK_URL, roomName: m.room_key, title: m.title,
    })
  }

  return res.status(400).json({ error: 'Unknown action' })
}
