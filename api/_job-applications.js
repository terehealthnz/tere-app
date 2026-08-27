// /api/job-applications — careers pipeline.
//
// POST                          → anon submit (public apply form). Sender fills in
//                                 first/last/email/phone/cover_note/cv_url/cv_filename
//                                 optionally with job_listing_id + source. Status always
//                                 starts at 'new' regardless of client input.
// GET                           → provider-auth list (?status= to filter, ?archived=1)
// GET  ?id=<uuid>               → provider-auth single applicant + notes + onboarding
// PATCH ?id=<uuid>              → provider-auth status/archive transitions.
//                                 If status flips to 'hired' AND no onboarding rows
//                                 exist yet, seed the default onboarding checklist.
// DELETE ?id=<uuid>             → provider-auth hard delete (rare; prefer archive)
//
// POST ?action=note  { note }   → provider-auth append internal note
// PATCH ?action=step&id=<step>  → provider-auth toggle onboarding step done
//
// Interview actions (video interviews inside the platform, no Zoom):
// POST  ?action=schedule_interview&id=<application_id>
//                                → creates a job_interviews row, generates a
//                                   LiveKit room + applicant join token, emails
//                                   the applicant a join link. Body:
//                                     { scheduledAt?: ISO string,
//                                       mode: 'scheduled' | 'instant' }
//                                   Response: { interview: {...}, joinUrl }
// GET   ?action=interviews&id=<application_id>
//                                → list interviews for an application
// PATCH ?action=interview&id=<interview_id>
//                                → update notes/status. Body:
//                                   { status?, notes? }
// POST  ?action=start_interview&id=<interview_id>
//                                → interviewer joins: marks status=in_progress
//                                  and mints a LiveKit token for the interviewer.
//                                  Response: { token, serverUrl, roomName }

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'
import { guardProvider } from './_auth.js'
import { sendEmail , hasEmailProvider} from './_email-client.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Extract the storage key from a stored cv_url like
// https://xxx.supabase.co/storage/v1/object/{public|sign}/cvs/<key>
// Returns null if the string doesn't look like a `cvs` bucket URL — the
// caller then leaves the field alone (e.g. it might already be a signed
// URL from an earlier read, or an external URL from a data import).
function extractCvStorageKey(url) {
  if (!url || typeof url !== 'string') return null
  const marker = '/cvs/'
  const idx = url.indexOf(marker)
  if (idx < 0) return null
  return url.slice(idx + marker.length).split('?')[0]
}

// Re-sign a public-shape cv_url with a short-lived signed URL. Works
// whether the `cvs` bucket is currently public or private (Supabase
// createSignedUrl on a public bucket returns a valid signed link too).
// TTL is deliberately short — admins open CVs during active review,
// not for later record-keeping. Pen-test #322 (2026-08-27).
const CV_SIGNED_URL_TTL_SECONDS = 15 * 60
async function signCvUrl(supabase, cvUrl) {
  const key = extractCvStorageKey(cvUrl)
  if (!key) return cvUrl
  try {
    const { data, error } = await supabase.storage.from('cvs').createSignedUrl(key, CV_SIGNED_URL_TTL_SECONDS)
    if (error || !data?.signedUrl) return cvUrl
    return data.signedUrl
  } catch { return cvUrl }
}

const APPLY_ALLOWLIST = new Set([
  'first_name', 'last_name', 'email', 'phone', 'cover_note',
  'cv_url', 'cv_filename', 'job_listing_id', 'source',
])

const STATUS_ALLOWED = new Set([
  'new', 'reviewing', 'interview', 'offer', 'hired', 'rejected', 'withdrawn',
])

const DEFAULT_ONBOARDING = [
  { step_key: 'mcnz_apc',         label: 'MCNZ registration + current APC verified' },
  { step_key: 'references',       label: 'References checked' },
  { step_key: 'contract_signed',  label: 'Contract signed' },
  { step_key: 'provider_row',     label: 'Provider row created in DB (with PIN)' },
  { step_key: 'prescriber_no',    label: 'Prescriber number + CPN entered' },
  { step_key: 'bank_payroll',     label: 'Bank / payroll details on file' },
  { step_key: 'tech_setup',       label: 'LiveKit + push notification tested on device' },
  { step_key: 'shadow_shift',     label: 'Shadow shift with existing provider' },
  { step_key: 'first_shift',      label: 'First live shift scheduled' },
  { step_key: 'welcome_pack',     label: 'Welcome email sent (culture doc, key contacts)' },
]

async function seedOnboardingIfNeeded(supabase, applicationId) {
  const { count } = await supabase.from('onboarding_steps')
    .select('id', { count: 'exact', head: true })
    .eq('application_id', applicationId)
  if (count && count > 0) return
  const rows = DEFAULT_ONBOARDING.map((s, i) => ({
    application_id: applicationId, step_key: s.step_key, label: s.label, sort_order: i,
  }))
  await supabase.from('onboarding_steps').insert(rows)
}

// ── Notifications on new application ────────────────────────────────────────
// Fire-and-forget. Failures are logged but never block the applicant's 200.
async function notifyApplicationSubmitted(supabase, application) {
  const canEmail = hasEmailProvider()
  if (!canEmail) {
    console.warn('[job-applications] RESEND_API_KEY missing — skipping notifications')
    return
  }

  // Look up job listing details if the application references one.
  let listing = null
  if (application.job_listing_id) {
    const { data } = await supabase
      .from('job_listings')
      .select('title, location')
      .eq('id', application.job_listing_id)
      .maybeSingle()
    listing = data
  }
  const roleLine = listing?.title
    ? `${listing.title}${listing.location ? ' · ' + listing.location : ''}`
    : 'General application'

  const fullName = `${application.first_name || ''} ${application.last_name || ''}`.trim()
  const firstName = (application.first_name || '').trim() || 'there'
  const cover = (application.cover_note || '').trim()
  const coverShort = cover.length > 800 ? cover.slice(0, 800) + '…' : cover
  const cvLine = application.cv_url
    ? `<a href="${application.cv_url}" style="color:#0B6E76">${application.cv_filename || 'Download CV'}</a>`
    : 'No CV attached'
  const adminUrl = `${process.env.VITE_APP_URL || 'https://terehealth.co.nz'}/clinician/admin`

  // ── Internal alert to terehealthnz@gmail.com ─────────────────────────────
  const internalHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px">
    <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
    <div style="color:rgba(212,238,240,.6);font-size:12px;margin-top:2px">New job application</div>
  </div>
  <div style="padding:24px 28px">
    <p style="font-size:15px;margin:0 0 16px"><strong>${fullName}</strong> just applied.</p>
    <table style="width:100%;font-size:14px;color:#374151;border-collapse:collapse;margin-bottom:18px">
      <tr><td style="padding:4px 0;color:#6B7280;width:120px">Role</td><td>${roleLine}</td></tr>
      <tr><td style="padding:4px 0;color:#6B7280">Email</td><td><a href="mailto:${application.email}" style="color:#0B6E76">${application.email}</a></td></tr>
      ${application.phone ? `<tr><td style="padding:4px 0;color:#6B7280">Phone</td><td>${application.phone}</td></tr>` : ''}
      ${application.source ? `<tr><td style="padding:4px 0;color:#6B7280">Source</td><td>${application.source}</td></tr>` : ''}
      <tr><td style="padding:4px 0;color:#6B7280">CV</td><td>${cvLine}</td></tr>
    </table>
    ${coverShort ? `
      <div style="background:#F8FAFC;border-left:3px solid #0B6E76;padding:12px 14px;border-radius:4px;margin-bottom:20px">
        <div style="font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Cover note</div>
        <div style="font-size:14px;color:#374151;white-space:pre-wrap">${coverShort.replace(/</g, '&lt;')}</div>
      </div>` : ''}
    <div style="text-align:center;margin:28px 0">
      <a href="${adminUrl}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:12px 24px;border-radius:99px;font-size:14px;font-weight:700">Open in admin →</a>
    </div>
  </div>
</body></html>`

  const internalText = [
    `New job application`,
    ``,
    `Name: ${fullName}`,
    `Role: ${roleLine}`,
    `Email: ${application.email}`,
    application.phone ? `Phone: ${application.phone}` : null,
    application.source ? `Source: ${application.source}` : null,
    application.cv_url ? `CV: ${application.cv_url}` : `CV: not attached`,
    ``,
    coverShort ? `Cover note:\n${coverShort}\n` : null,
    `Open in admin: ${adminUrl}`,
  ].filter(Boolean).join('\n')

  // ── Autoresponder to applicant ────────────────────────────────────────────
  const autoresponderHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px">
    <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
  </div>
  <div style="padding:24px 28px">
    <p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p>
    <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">
      Thank you for applying to Tere Health${listing?.title ? ` for the <strong>${listing.title}</strong> role` : ''}.
    </p>
    <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">
      We have received your application and one of our team will be in touch within the next few working days. If you have any additional information you would like to share, feel free to reply to this email.
    </p>
    <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 24px">
      Ngā mihi,<br>
      The Tere Health team
    </p>
  </div>
  <div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">
    Tere Health · Marlborough Sounds, New Zealand · <a href="https://terehealth.co.nz" style="color:#0B6E76">terehealth.co.nz</a>
  </div>
</body></html>`

  const autoresponderText = `Kia ora ${firstName},\n\nThank you for applying to Tere Health${listing?.title ? ` for the ${listing.title} role` : ''}.\n\nWe have received your application and one of our team will be in touch within the next few working days. If you have any additional information you would like to share, feel free to reply to this email.\n\nNgā mihi,\nThe Tere Health team\nterehealth.co.nz`

  // Fire both emails. Log any failure but do not throw.
  try {
    await sendEmail({
      from: 'Tere Health <hello@terehealth.co.nz>',
      replyTo: application.email,
      to: ['terehealthnz@gmail.com'],
      subject: `New applicant: ${fullName} · ${roleLine}`,
      html: internalHtml,
      text: internalText,
    })
  } catch (e) { console.error('[job-applications] internal alert failed:', e.message) }

  if (application.email) {
    try {
      await sendEmail({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: [application.email],
        subject: `We've received your application — Tere Health`,
        html: autoresponderHtml,
        text: autoresponderText,
      })
    } catch (e) { console.error('[job-applications] autoresponder failed:', e.message) }
  }
}

export default async function handler(req, res) {
  const { action, id } = req.query || {}

  // Anon submit path.
  if (req.method === 'POST' && !action) {
    const supabase = admin()
    const raw = req.body || {}
    const payload = {}
    for (const [k, v] of Object.entries(raw)) {
      if (APPLY_ALLOWLIST.has(k)) payload[k] = v
    }
    if (!payload.first_name || !payload.last_name || !payload.email) {
      return res.status(400).json({ error: 'first_name, last_name, email required' })
    }
    // Status is always 'new' regardless of client claim.
    payload.status = 'new'
    const { data, error } = await supabase
      .from('job_applications')
      .insert(payload)
      .select('*')
      .maybeSingle()
    if (error) { console.error('[job-applications] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    // Fire notifications without awaiting — applicant sees fast 200 even if email is slow.
    notifyApplicationSubmitted(supabase, data).catch(e =>
      console.error('[job-applications] notify error:', e.message)
    )
    return res.status(200).json({ ok: true, id: data?.id })
  }

  // Everything below requires provider auth.
  const auth = await guardProvider(req, res)
  if (!auth) return
  const supabase = admin()

  if (req.method === 'GET') {
    if (id) {
      const [{ data: app, error: appErr }, { data: notes }, { data: steps }] = await Promise.all([
        supabase.from('job_applications').select('*, job_listing:job_listings(id, title, location)').eq('id', id).maybeSingle(),
        supabase.from('application_notes').select('*').eq('application_id', id).order('created_at', { ascending: false }),
        supabase.from('onboarding_steps').select('*').eq('application_id', id).order('sort_order'),
      ])
      if (appErr) { console.error('[job-applications] appErr failed:', appErr); return res.status(500).json({ error: 'Server error' }) }
      if (!app) return res.status(404).json({ error: 'Application not found' })
      // Re-sign cv_url so admin viewers get a working link whether the bucket
      // is currently public or private (pen-test #322).
      if (app.cv_url) app.cv_url = await signCvUrl(supabase, app.cv_url)
      return res.status(200).json({ application: app, notes: notes || [], onboarding: steps || [] })
    }

    const { status, archived } = req.query || {}
    let q = supabase
      .from('job_applications')
      .select('id, first_name, last_name, email, phone, status, source, applied_at, updated_at, hired_at, archived, cv_url, cv_filename, job_listing_id, job_listing:job_listings(id, title)')
      .order('applied_at', { ascending: false })
    if (archived === '1') q = q.eq('archived', true)
    else q = q.eq('archived', false)
    if (status) {
      if (!STATUS_ALLOWED.has(status)) return res.status(400).json({ error: 'invalid status filter' })
      q = q.eq('status', status)
    }
    const { data, error } = await q
    if (error) { console.error('[job-applications] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    // Batch-sign every cv_url. Small applicant lists so per-row signing is
    // fine; if the list ever grows to hundreds we can defer to on-open.
    const rows = data || []
    await Promise.all(rows.map(async r => {
      if (r.cv_url) r.cv_url = await signCvUrl(supabase, r.cv_url)
    }))
    return res.status(200).json({ applications: rows })
  }

  // Note append.
  if (req.method === 'POST' && action === 'note') {
    if (!id) return res.status(400).json({ error: 'id required' })
    const { note } = req.body || {}
    if (!note || typeof note !== 'string' || !note.trim()) {
      return res.status(400).json({ error: 'note (string) required' })
    }
    const provider = auth.provider || {}
    const author_name = [provider.first_name, provider.last_name].filter(Boolean).join(' ') || null
    const { error } = await supabase.from('application_notes').insert({
      application_id: id,
      author_id: provider.id || null,
      author_name,
      note: note.trim(),
    })
    if (error) { console.error('[job-applications] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  }

  // ─── Interview actions ──────────────────────────────────────────────
  //
  // Video interviews inside the platform. Reuses the LiveKit stack that
  // powers patient consults. Room name is a short random key; applicant
  // gets a URL-safe token they use to join without an account.

  const LK_URL    = process.env.LIVEKIT_URL
  const LK_KEY    = process.env.LIVEKIT_API_KEY
  const LK_SECRET = process.env.LIVEKIT_API_SECRET

  async function createInterviewRoom(roomKey) {
    if (!LK_URL || !LK_KEY || !LK_SECRET) return  // dev fallback — no-op
    try {
      const httpUrl = LK_URL.replace(/^wss?:\/\//, 'https://')
      const svc = new RoomServiceClient(httpUrl, LK_KEY, LK_SECRET)
      await svc.createRoom({
        name: roomKey,
        emptyTimeout: 900,          // 15 min empty → auto-delete
        maxParticipants: 4,          // interviewer + applicant + 2 headroom
      })
    } catch (e) {
      // Room already exists is fine.
      console.log('[interview] createRoom:', e.message)
    }
  }

  async function mintInterviewJoinToken(roomKey, identity, ttlSeconds = 7200) {
    if (!LK_URL || !LK_KEY || !LK_SECRET) return { token: null, serverUrl: null }
    const at = new AccessToken(LK_KEY, LK_SECRET, { identity, ttl: ttlSeconds })
    at.addGrant({
      roomJoin: true,
      room: roomKey,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    })
    return { token: await at.toJwt(), serverUrl: LK_URL }
  }

  // Schedule (or immediately create) an interview.
  if (req.method === 'POST' && action === 'schedule_interview') {
    if (!id) return res.status(400).json({ error: 'id (application_id) required' })
    const { scheduledAt, mode } = req.body || {}
    const isInstant = mode === 'instant' || !scheduledAt
    const provider = auth.provider || {}

    const { data: app, error: appErr } = await supabase
      .from('job_applications')
      .select('id, first_name, last_name, email')
      .eq('id', id)
      .maybeSingle()
    if (appErr || !app) return res.status(404).json({ error: 'Application not found' })

    const roomKey  = 'iv-' + randomBytes(6).toString('hex')       // e.g. iv-a1b2c3d4e5f6
    const joinTok  = randomBytes(24).toString('base64url')        // ~32 URL-safe chars

    const { data: iv, error: ivErr } = await supabase
      .from('job_interviews')
      .insert({
        application_id:         id,
        interviewer_provider_id: provider.id || null,
        room_key:               roomKey,
        applicant_join_token:   joinTok,
        scheduled_at:           isInstant ? null : scheduledAt,
        status:                 isInstant ? 'instant' : 'scheduled',
        created_by_provider_id: provider.id || null,
      })
      .select('*')
      .maybeSingle()
    if (ivErr) { console.error('[interview] insert failed:', ivErr); return res.status(500).json({ error: 'Server error' }) }

    // Best-effort: pre-create room so the first joiner isn't waiting on it.
    createInterviewRoom(roomKey).catch(() => {})

    // Also flip the application status to 'interview' unless already past it.
    supabase.from('job_applications')
      .update({ status: 'interview' })
      .eq('id', id)
      .in('status', ['new', 'reviewing'])
      .then(() => {}, () => {})

    // Email the applicant.
    const siteOrigin = process.env.PUBLIC_SITE_ORIGIN
      || (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host']
          ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
          : 'https://terehealth.co.nz')
    const joinUrl = `${siteOrigin}/interview/${joinTok}`
    const firstName = app.first_name || 'there'
    const whenLine = isInstant
      ? 'Your interviewer is ready now — the link below joins you straight to the video room.'
      : `Scheduled for <strong>${new Date(scheduledAt).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'full', timeStyle: 'short' })}</strong> (NZ time).`

    try {
      await sendEmail({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: [app.email],
        subject: 'Your Tere Health interview',
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px"><div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div></div>
  <div style="padding:24px 28px">
    <p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p>
    <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">Thanks for applying to Tere Health. We'd love to have a chat.</p>
    <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 20px">${whenLine}</p>
    <div style="text-align:center;margin:28px 0"><a href="${joinUrl}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:14px 32px;border-radius:99px;font-size:15px;font-weight:700">Join interview →</a></div>
    <p style="font-size:13px;color:#6B7280;line-height:1.6;margin:0 0 8px">If the button doesn't work, paste this link into your browser:</p>
    <p style="font-size:12px;color:#0B6E76;word-break:break-all;margin:0 0 24px">${joinUrl}</p>
    <div style="background:#F0F9FA;border-radius:8px;padding:12px 16px;font-size:13px;color:#0D2B45">
      <strong>Before you join:</strong> use a laptop or desktop if you can. You'll need a working camera + microphone. Chrome, Safari, and Edge all work.
    </div>
    <p style="font-size:15px;line-height:1.7;color:#374151;margin:24px 0 0">Ngā mihi,<br>The Tere Health team</p>
  </div>
  <div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">Tere Health · terehealth.co.nz</div>
</body></html>`,
        text: `Kia ora ${firstName},\n\nThanks for applying to Tere Health. We'd love to have a chat.\n\n${whenLine.replace(/<[^>]+>/g, '')}\n\nJoin your interview: ${joinUrl}\n\nBefore you join: use a laptop or desktop if you can. You'll need a working camera + microphone. Chrome, Safari, and Edge all work.\n\nNgā mihi,\nThe Tere Health team\nterehealth.co.nz`,
      })
    } catch (e) {
      console.error('[interview] email send failed:', e.message)
      // Don't fail the request — admin can copy the joinUrl from the response
      // and message the applicant manually.
    }

    return res.status(200).json({ interview: iv, joinUrl })
  }

  // List interviews for an application.
  if (req.method === 'GET' && action === 'interviews') {
    if (!id) return res.status(400).json({ error: 'id (application_id) required' })
    const { data, error } = await supabase
      .from('job_interviews')
      .select('*')
      .eq('application_id', id)
      .order('created_at', { ascending: false })
    if (error) { console.error('[interview] list failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ interviews: data || [] })
  }

  // Update interview notes / status (used to record outcome).
  if (req.method === 'PATCH' && action === 'interview') {
    if (!id) return res.status(400).json({ error: 'id (interview_id) required' })
    const { status, notes } = req.body || {}
    const patch = {}
    const ALLOWED = new Set(['scheduled', 'instant', 'in_progress', 'completed', 'cancelled', 'no_show'])
    if (status !== undefined) {
      if (!ALLOWED.has(status)) return res.status(400).json({ error: `invalid status "${status}"` })
      patch.status = status
      if (status === 'completed' || status === 'no_show' || status === 'cancelled') {
        patch.ended_at = new Date().toISOString()
      }
    }
    if (notes !== undefined) patch.notes = String(notes || '')
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'nothing to update' })
    const { error } = await supabase.from('job_interviews').update(patch).eq('id', id)
    if (error) { console.error('[interview] patch failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  }

  // Interviewer joins — mint LiveKit token + mark in_progress.
  if (req.method === 'POST' && action === 'start_interview') {
    if (!id) return res.status(400).json({ error: 'id (interview_id) required' })
    const { data: iv, error: ivErr } = await supabase
      .from('job_interviews').select('*').eq('id', id).maybeSingle()
    if (ivErr || !iv) return res.status(404).json({ error: 'Interview not found' })

    await createInterviewRoom(iv.room_key)
    const provider = auth.provider || {}
    const identity = `interviewer-${provider.id || 'unknown'}-${Date.now()}`
    const { token, serverUrl } = await mintInterviewJoinToken(iv.room_key, identity)

    // Mark started (idempotent: only overwrite if not already ended).
    await supabase.from('job_interviews')
      .update({ status: 'in_progress', started_at: iv.started_at || new Date().toISOString() })
      .eq('id', id)
      .is('ended_at', null)

    return res.status(200).json({ token, serverUrl, roomName: iv.room_key })
  }

  // Onboarding step toggle.
  if (req.method === 'PATCH' && action === 'step') {
    if (!id) return res.status(400).json({ error: 'id (step id) required' })
    const { done, notes } = req.body || {}
    const provider = auth.provider || {}
    const patch = {}
    if (typeof done === 'boolean') {
      patch.done = done
      patch.done_at = done ? new Date().toISOString() : null
      patch.done_by = done ? (provider.id || null) : null
      patch.done_by_name = done
        ? ([provider.first_name, provider.last_name].filter(Boolean).join(' ') || null)
        : null
    }
    if (notes !== undefined) patch.notes = notes || null
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'nothing to update' })
    const { error } = await supabase.from('onboarding_steps').update(patch).eq('id', id)
    if (error) { console.error('[job-applications] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  }

  // Application patch (status transition, archive).
  if (req.method === 'PATCH') {
    if (!id) return res.status(400).json({ error: 'id required' })
    const raw = req.body || {}
    const patch = {}
    if ('status' in raw) {
      if (!STATUS_ALLOWED.has(raw.status)) {
        return res.status(400).json({ error: `status "${raw.status}" not allowed` })
      }
      patch.status = raw.status
      if (raw.status === 'hired')    patch.hired_at    = new Date().toISOString()
      if (raw.status === 'rejected') patch.rejected_at = new Date().toISOString()
    }
    if ('archived' in raw) patch.archived = !!raw.archived
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'nothing to update' })
    patch.updated_at = new Date().toISOString()

    const { error } = await supabase.from('job_applications').update(patch).eq('id', id)
    if (error) { console.error('[job-applications] error failed:', error); return res.status(500).json({ error: 'Server error' }) }

    if (patch.status === 'hired') {
      await seedOnboardingIfNeeded(supabase, id)
    }
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'id required' })
    const { error } = await supabase.from('job_applications').delete().eq('id', id)
    if (error) { console.error('[job-applications] error failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
