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
import { buildInterviewIcs } from './_ics.js'
import { buildOfferPdf } from './_pdf-builders.js'
import { encryptForStorage, decryptFromStorage, maskForSummary } from './_onboarding-crypto.js'

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

// ── Module-scope interview email helpers (used by anon pick_slot + authed
// schedule_interview) ───────────────────────────────────────────────────

function getSiteOriginFor(req) {
  return process.env.PUBLIC_SITE_ORIGIN
    || (req?.headers?.['x-forwarded-proto'] && req?.headers?.['x-forwarded-host']
        ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
        : 'https://terehealth.co.nz')
}

function fmtNz(iso) {
  return new Date(iso).toLocaleString('en-NZ', {
    timeZone: 'Pacific/Auckland', dateStyle: 'full', timeStyle: 'short',
  })
}

function emailShell(bodyHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px"><div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div></div>
  <div style="padding:24px 28px">${bodyHtml}</div>
  <div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">Tere Health · terehealth.co.nz</div>
</body></html>`
}

async function sendInterviewConfirmationEmail({ to, name, joinUrl, scheduledAt, durationMin, interviewId, subject, intro }) {
  const ics = buildInterviewIcs({
    uid:            `interview-${interviewId}@terehealth.co.nz`,
    start:          new Date(scheduledAt),
    durationMin,
    summary:        'Tere Health interview',
    description:    `Join link: ${joinUrl}\n\nUse a laptop/desktop with camera + microphone. Chrome, Safari, and Edge all work.`,
    location:       joinUrl,
    organiserEmail: 'hello@terehealth.co.nz',
    organiserName:  'Tere Health',
  })
  const firstName = (name || '').split(' ')[0] || 'there'
  await sendEmail({
    from: 'Tere Health <hello@terehealth.co.nz>',
    replyTo: 'terehealthnz@gmail.com',
    to: [to],
    subject,
    html: emailShell(`
      <p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p>
      <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">${intro}</p>
      <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 20px">Confirmed for <strong>${fmtNz(scheduledAt)}</strong> (NZ time).</p>
      <div style="text-align:center;margin:28px 0"><a href="${joinUrl}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:14px 32px;border-radius:99px;font-size:15px;font-weight:700">Join interview →</a></div>
      <p style="font-size:13px;color:#6B7280;line-height:1.6;margin:0 0 8px">A calendar invite is attached — open it once and the event lands in Google Calendar / Outlook / iOS Calendar automatically.</p>
      <p style="font-size:12px;color:#0B6E76;word-break:break-all;margin:12px 0 24px">${joinUrl}</p>
      <p style="font-size:15px;line-height:1.7;color:#374151;margin:24px 0 0">Ngā mihi,<br>The Tere Health team</p>`),
    text: [
      `Kia ora ${firstName},`, '', intro,
      `Confirmed for ${fmtNz(scheduledAt)} (NZ time).`, '',
      `Join: ${joinUrl}`, '',
      'A calendar invite is attached.', '',
      'Ngā mihi,', 'The Tere Health team',
    ].join('\n'),
    attachments: [{
      filename:    'tere-health-interview.ics',
      contentType: 'text/calendar; charset=utf-8; method=REQUEST',
      content:     Buffer.from(ics, 'utf8'),
    }],
  })
}

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

  // Anon applicant flow — pick a slot from the proposed_slots list.
  // Token-authed (applicant_join_token), no provider login required.
  if (req.method === 'POST' && action === 'pick_slot') {
    const supabase = admin()
    const { token, slot } = req.body || {}
    const cleanToken = String(token || '').trim()
    const cleanSlot  = String(slot || '').trim()
    if (!cleanToken || cleanToken.length < 20) return res.status(400).json({ error: 'invalid token' })
    if (!cleanSlot) return res.status(400).json({ error: 'slot required' })

    const { data: iv, error: ivErr } = await supabase
      .from('job_interviews')
      .select('id, application_id, room_key, status, proposed_slots, scheduled_at, duration_minutes, interviewer_provider_id')
      .eq('applicant_join_token', cleanToken)
      .maybeSingle()
    if (ivErr || !iv) return res.status(404).json({ error: 'Interview not found' })
    if (iv.status !== 'proposed') return res.status(409).json({ error: 'This interview is not awaiting a slot pick.', status: iv.status })

    const proposed = Array.isArray(iv.proposed_slots) ? iv.proposed_slots : []
    if (!proposed.includes(cleanSlot)) {
      return res.status(400).json({ error: 'Selected slot is not on the proposed list.' })
    }

    // CAS: only advance from status=proposed → scheduled if still proposed.
    const { data: updated, error: upErr } = await supabase
      .from('job_interviews')
      .update({ scheduled_at: cleanSlot, status: 'scheduled' })
      .eq('id', iv.id)
      .eq('status', 'proposed')
      .select('id, scheduled_at, duration_minutes')
      .maybeSingle()
    if (upErr) { console.error('[interview] pick_slot update failed:', upErr); return res.status(500).json({ error: 'Server error' }) }
    if (!updated) return res.status(409).json({ error: 'Slot pick lost race — refresh and try again.' })

    // Look up applicant + interviewer for confirmation emails.
    const [{ data: app }, { data: interviewer }] = await Promise.all([
      supabase.from('job_applications').select('first_name, last_name, email').eq('id', iv.application_id).maybeSingle(),
      iv.interviewer_provider_id
        ? supabase.from('providers').select('first_name, last_name, email').eq('id', iv.interviewer_provider_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const siteOrigin = getSiteOriginFor(req)
    const joinUrl = `${siteOrigin}/interview/${cleanToken}`
    try {
      const p = []
      if (app?.email) p.push(sendInterviewConfirmationEmail({
        to: app.email,
        name: [app.first_name, app.last_name].filter(Boolean).join(' '),
        joinUrl,
        scheduledAt: updated.scheduled_at,
        durationMin: updated.duration_minutes || 30,
        interviewId: iv.id,
        subject: 'Confirmed: your Tere Health interview',
        intro:   "Thanks for picking a time — you're booked in. Calendar invite attached.",
      }))
      if (interviewer?.email) p.push(sendInterviewConfirmationEmail({
        to: interviewer.email,
        name: [interviewer.first_name, interviewer.last_name].filter(Boolean).join(' '),
        joinUrl,
        scheduledAt: updated.scheduled_at,
        durationMin: updated.duration_minutes || 30,
        interviewId: iv.id,
        subject: `Interview booked: ${[app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Applicant'}`,
        intro:   `${[app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'The applicant'} picked a time from the slots you sent. Calendar invite attached.`,
      }))
      await Promise.allSettled(p)
    } catch (e) {
      console.error('[interview] pick_slot email failed:', e.message)
    }

    return res.status(200).json({ ok: true, scheduledAt: updated.scheduled_at, joinUrl })
  }

  // ── Anon offer flow ────────────────────────────────────────────────────
  //
  // GET  ?action=offer&token=<t>   → return offer + application details for
  //                                   the sign page. Only returns rows in
  //                                   status='sent' — signed / cancelled
  //                                   rows respond 410 so the page can show
  //                                   an "already signed" / "cancelled" state.
  // POST ?action=sign_offer        → applicant submits typed name + optional
  //                                   canvas PNG signature; server records
  //                                   ip/ua/timestamp, flips status, and
  //                                   emails the interviewer to countersign.

  if (req.method === 'GET' && action === 'offer') {
    const supabase = admin()
    const token = String(req.query?.token || '').trim()
    if (!token || token.length < 20) return res.status(400).json({ error: 'invalid token' })

    const { data: offer, error: oErr } = await supabase
      .from('job_offers')
      .select('id, application_id, role_title, compensation, start_date, contract_terms, status, applicant_signed_at, countersigned_at, created_at')
      .eq('applicant_sign_token', token)
      .maybeSingle()
    if (oErr) { console.error('[offer] get failed:', oErr); return res.status(500).json({ error: 'Server error' }) }
    if (!offer) return res.status(404).json({ error: 'Offer not found' })

    // Not showable to applicant if already signed or cancelled — return
    // a lightweight body so the page can render the right terminal state.
    if (offer.status !== 'sent') {
      return res.status(200).json({
        offer: {
          status: offer.status,
          role_title: offer.role_title,
          applicant_signed_at: offer.applicant_signed_at,
          countersigned_at:    offer.countersigned_at,
        },
        terminal: true,
      })
    }

    const { data: app } = await supabase
      .from('job_applications')
      .select('first_name, last_name, email')
      .eq('id', offer.application_id)
      .maybeSingle()
    return res.status(200).json({
      offer,
      applicant: app ? { first_name: app.first_name, last_name: app.last_name, email: app.email } : null,
    })
  }

  if (req.method === 'POST' && action === 'sign_offer') {
    const supabase = admin()
    const { token, typedName, signaturePng } = req.body || {}
    const cleanToken = String(token || '').trim()
    const cleanName  = String(typedName || '').trim()
    if (!cleanToken || cleanToken.length < 20) return res.status(400).json({ error: 'invalid token' })
    if (cleanName.length < 2 || cleanName.length > 120) {
      return res.status(400).json({ error: 'Please enter your full name.' })
    }

    // Cap the signature PNG at ~250 KB. Small canvas produces ~10-30 KB.
    let png = null
    if (typeof signaturePng === 'string' && signaturePng.startsWith('data:image/png;base64,')) {
      if (signaturePng.length > 350_000) return res.status(400).json({ error: 'Signature image too large.' })
      png = signaturePng
    }

    const { data: offer, error: oErr } = await supabase
      .from('job_offers')
      .select('id, application_id, status')
      .eq('applicant_sign_token', cleanToken)
      .maybeSingle()
    if (oErr) { console.error('[offer] sign lookup failed:', oErr); return res.status(500).json({ error: 'Server error' }) }
    if (!offer) return res.status(404).json({ error: 'Offer not found' })
    if (offer.status !== 'sent') {
      return res.status(409).json({ error: 'This offer is no longer awaiting your signature.', status: offer.status })
    }

    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64)
    const ua = String(req.headers['user-agent'] || '').slice(0, 400)

    // CAS: only advance if still 'sent'.
    const { data: updated, error: upErr } = await supabase
      .from('job_offers')
      .update({
        status:                      'applicant_signed',
        applicant_signed_name:       cleanName,
        applicant_signed_png:        png,
        applicant_signed_ip:         ip,
        applicant_signed_user_agent: ua,
        applicant_signed_at:         new Date().toISOString(),
      })
      .eq('id', offer.id)
      .eq('status', 'sent')
      .select('id, application_id, applicant_signed_at')
      .maybeSingle()
    if (upErr) { console.error('[offer] sign update failed:', upErr); return res.status(500).json({ error: 'Server error' }) }
    if (!updated) return res.status(409).json({ error: 'Offer state changed — please refresh.' })

    // Nudge the internal team to countersign. Best-effort; doesn't block the applicant's 200.
    try {
      const { data: app } = await supabase
        .from('job_applications')
        .select('first_name, last_name, email')
        .eq('id', updated.application_id)
        .maybeSingle()
      const applicantName = [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'the applicant'
      await sendEmail({
        from:    'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to:      ['terehealthnz@gmail.com'],
        subject: `Offer signed by ${applicantName} — needs countersign`,
        html: emailShell(`
          <p style="font-size:15px;margin:0 0 16px"><strong>${applicantName}</strong> has signed their offer letter.</p>
          <p style="font-size:15px;line-height:1.7;color:#374151">Open the applicant panel in Admin to countersign and finalise the PDF.</p>`),
        text: `${applicantName} signed their offer. Countersign in Admin to finalise the PDF.`,
      })
    } catch (e) {
      console.error('[offer] notify countersign email failed:', e.message)
    }

    return res.status(200).json({ ok: true, signedAt: updated.applicant_signed_at })
  }

  // ── Anon reference flow ────────────────────────────────────────────────
  //
  // GET  ?action=reference&token=<t>   → return referee context + candidate
  //                                       name + role so the form page can
  //                                       render "You've been asked to give
  //                                       a reference for Jane Cook applying
  //                                       for Nurse Practitioner at Tere."
  // POST ?action=submit_reference      → referee submits structured answers.

  if (req.method === 'GET' && action === 'reference') {
    const supabase = admin()
    const token = String(req.query?.token || '').trim()
    if (!token || token.length < 20) return res.status(400).json({ error: 'invalid token' })

    const { data: ref, error: rErr } = await supabase
      .from('job_references')
      .select('id, application_id, referee_name, referee_relationship, status, responded_at')
      .eq('request_token', token)
      .maybeSingle()
    if (rErr) { console.error('[reference] get failed:', rErr); return res.status(500).json({ error: 'Server error' }) }
    if (!ref) return res.status(404).json({ error: 'Reference not found' })

    if (ref.status !== 'pending') {
      return res.status(200).json({
        reference: { status: ref.status, referee_name: ref.referee_name, responded_at: ref.responded_at },
        terminal: true,
      })
    }

    const { data: app } = await supabase
      .from('job_applications')
      .select('first_name, last_name, job_listing_id')
      .eq('id', ref.application_id)
      .maybeSingle()
    let listing = null
    if (app?.job_listing_id) {
      const { data } = await supabase
        .from('job_listings')
        .select('title')
        .eq('id', app.job_listing_id)
        .maybeSingle()
      listing = data
    }
    return res.status(200).json({
      reference: ref,
      candidate: {
        first_name: app?.first_name,
        last_name:  app?.last_name,
        role:       listing?.title || null,
      },
    })
  }

  if (req.method === 'POST' && action === 'submit_reference') {
    const supabase = admin()
    const b = req.body || {}
    const token = String(b.token || '').trim()
    if (!token || token.length < 20) return res.status(400).json({ error: 'invalid token' })

    const REHIRE   = new Set(['yes', 'with_reservation', 'no', 'unable_to_say'])
    const OVERALL  = new Set(['strong', 'positive', 'neutral', 'negative'])
    const clean = (v, cap) => String(v || '').trim().slice(0, cap)
    const wouldRehire  = String(b.wouldRehire  || '').trim()
    const overallRec   = String(b.overallRecommendation || '').trim()
    if (!REHIRE.has(wouldRehire))    return res.status(400).json({ error: 'wouldRehire required' })
    if (!OVERALL.has(overallRec))    return res.status(400).json({ error: 'overallRecommendation required' })

    const patch = {
      status:                  'responded',
      responded_at:            new Date().toISOString(),
      responded_ip:            String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64),
      responded_user_agent:    String(req.headers['user-agent'] || '').slice(0, 400),
      confirmed_relationship:  clean(b.confirmedRelationship, 400),
      confirmed_dates:         clean(b.confirmedDates, 200),
      would_rehire:            wouldRehire,
      strengths:               clean(b.strengths, 4000),
      concerns:                clean(b.concerns, 4000),
      overall_recommendation:  overallRec,
      additional_comments:     clean(b.additionalComments, 4000),
    }

    const { data: updated, error: upErr } = await supabase
      .from('job_references')
      .update(patch)
      .eq('request_token', token)
      .eq('status', 'pending')
      .select('id, application_id, referee_name')
      .maybeSingle()
    if (upErr) { console.error('[reference] submit failed:', upErr); return res.status(500).json({ error: 'Server error' }) }
    if (!updated) return res.status(409).json({ error: 'This reference has already been submitted or was cancelled.' })

    // Notify the internal team. Best-effort — doesn't block the referee's 200.
    try {
      const { data: app } = await supabase
        .from('job_applications')
        .select('first_name, last_name')
        .eq('id', updated.application_id)
        .maybeSingle()
      const candidateName = [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'the candidate'
      await sendEmail({
        from:    'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to:      ['terehealthnz@gmail.com'],
        subject: `Reference in from ${updated.referee_name} for ${candidateName}`,
        html: emailShell(`
          <p style="font-size:15px;margin:0 0 16px"><strong>${updated.referee_name}</strong> has submitted a reference for <strong>${candidateName}</strong>.</p>
          <p style="font-size:15px;line-height:1.7;color:#374151">Open the applicant panel to review.</p>`),
        text: `${updated.referee_name} submitted a reference for ${candidateName}. Review in Admin.`,
      })
    } catch (e) {
      console.error('[reference] notify email failed:', e.message)
    }

    return res.status(200).json({ ok: true })
  }

  // ── Anon onboarding intake ─────────────────────────────────────────────
  //
  // GET  ?action=onboarding&token=<t>
  //         → returns section completion state + non-secret prefill values.
  //           Tax + bank fields are NEVER returned decrypted here — the
  //           applicant fills them once and can't re-view them (they should
  //           save/remember their own IRD + bank details).
  //
  // POST ?action=save_onboarding_section
  //         Body: { token, section: 1|2|3|4, data: { …fields… }, apcPngBase64?,
  //                 apcFilename?, signaturePngBase64? }
  //         → validates + persists that section, stamps its completed_at.
  //           When all four sections have a completed_at, status flips to
  //           'complete', completed_at is set, and admin gets notified.

  if (req.method === 'GET' && action === 'onboarding') {
    const supabase = admin()
    const token = String(req.query?.token || '').trim()
    if (!token || token.length < 20) return res.status(400).json({ error: 'invalid token' })

    const { data: row, error: rErr } = await supabase
      .from('job_onboarding_intake')
      .select('id, application_id, status, preferred_name, date_of_birth, home_address, mobile, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, kiwisaver_rate, mcnz_registration_number, apc_expiry_date, apc_storage_key, hpi_cpn, prescriber_number, scope_of_practice, signature_storage_key, section_1_completed_at, section_2_completed_at, section_3_completed_at, section_4_completed_at, completed_at')
      .eq('setup_token', token)
      .maybeSingle()
    if (rErr) { console.error('[onboarding] get failed:', rErr); return res.status(500).json({ error: 'Server error' }) }
    if (!row) return res.status(404).json({ error: 'Onboarding not found' })

    if (row.status === 'cancelled') {
      return res.status(200).json({ terminal: true, status: 'cancelled' })
    }

    const { data: app } = await supabase
      .from('job_applications')
      .select('first_name, last_name, email')
      .eq('id', row.application_id)
      .maybeSingle()

    // Never leak the encrypted-at-rest fields even in decrypted form here.
    // Applicant confirms what they typed via the section-2 completed timestamp.
    return res.status(200).json({
      intake: {
        id: row.id,
        status: row.status,
        completed_at: row.completed_at,
        section_1: {
          completed_at: row.section_1_completed_at,
          preferred_name: row.preferred_name,
          date_of_birth: row.date_of_birth,
          home_address: row.home_address,
          mobile: row.mobile,
          emergency_contact_name: row.emergency_contact_name,
          emergency_contact_relationship: row.emergency_contact_relationship,
          emergency_contact_phone: row.emergency_contact_phone,
        },
        section_2: {
          completed_at: row.section_2_completed_at,
          kiwisaver_rate: row.kiwisaver_rate,   // low-sensitivity, safe to prefill
        },
        section_3: {
          completed_at: row.section_3_completed_at,
          mcnz_registration_number: row.mcnz_registration_number,
          apc_expiry_date: row.apc_expiry_date,
          apc_uploaded: !!row.apc_storage_key,
          hpi_cpn: row.hpi_cpn,
          prescriber_number: row.prescriber_number,
          scope_of_practice: row.scope_of_practice,
        },
        section_4: {
          completed_at: row.section_4_completed_at,
          signature_uploaded: !!row.signature_storage_key,
        },
      },
      applicant: app ? { first_name: app.first_name, last_name: app.last_name } : null,
    })
  }

  if (req.method === 'POST' && action === 'save_onboarding_section') {
    const supabase = admin()
    const b = req.body || {}
    const token   = String(b.token || '').trim()
    const section = Number(b.section)
    if (!token || token.length < 20) return res.status(400).json({ error: 'invalid token' })
    if (![1, 2, 3, 4].includes(section)) return res.status(400).json({ error: 'section must be 1|2|3|4' })
    const data = b.data || {}

    const { data: row, error: rErr } = await supabase
      .from('job_onboarding_intake')
      .select('id, application_id, status, section_1_completed_at, section_2_completed_at, section_3_completed_at, section_4_completed_at')
      .eq('setup_token', token)
      .maybeSingle()
    if (rErr) { console.error('[onboarding] save lookup failed:', rErr); return res.status(500).json({ error: 'Server error' }) }
    if (!row) return res.status(404).json({ error: 'Onboarding not found' })
    if (['cancelled', 'processed'].includes(row.status)) {
      return res.status(409).json({ error: `Onboarding is ${row.status} — no further edits accepted.` })
    }

    const clean = (v, cap) => {
      const s = String(v == null ? '' : v).trim()
      return s.length > cap ? s.slice(0, cap) : s
    }
    const isoDate = (v) => {
      const s = String(v || '').trim()
      if (!s) return null
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
      return s
    }
    const now = new Date().toISOString()
    const patch = { status: 'in_progress' }

    if (section === 1) {
      if (clean(data.preferred_name, 200).length < 1)   return res.status(400).json({ error: 'preferred_name required' })
      if (clean(data.mobile, 40).length < 6)            return res.status(400).json({ error: 'mobile required' })
      if (clean(data.home_address, 400).length < 4)     return res.status(400).json({ error: 'home_address required' })
      if (clean(data.emergency_contact_name, 200).length < 1) return res.status(400).json({ error: 'emergency contact name required' })
      if (clean(data.emergency_contact_phone, 40).length < 6) return res.status(400).json({ error: 'emergency contact phone required' })
      Object.assign(patch, {
        preferred_name:                 clean(data.preferred_name, 200),
        date_of_birth:                  isoDate(data.date_of_birth),
        home_address:                   clean(data.home_address, 400),
        mobile:                         clean(data.mobile, 40),
        emergency_contact_name:         clean(data.emergency_contact_name, 200),
        emergency_contact_relationship: clean(data.emergency_contact_relationship, 120),
        emergency_contact_phone:        clean(data.emergency_contact_phone, 40),
        section_1_completed_at:         now,
      })
    }

    if (section === 2) {
      const ird  = clean(data.ird_number, 20)
      const bank = clean(data.bank_account, 40)
      const ks   = clean(data.kiwisaver_rate, 10)
      if (ird.length < 8)   return res.status(400).json({ error: 'IRD number required (8-9 digits)' })
      if (bank.length < 15) return res.status(400).json({ error: 'bank account required (NZ 16-17 digit format)' })
      if (!['3','4','6','8','10','opt_out'].includes(ks)) return res.status(400).json({ error: 'kiwisaver_rate must be 3|4|6|8|10|opt_out' })
      Object.assign(patch, {
        ird_number_enc:         encryptForStorage(ird),
        bank_account_enc:       encryptForStorage(bank),
        kiwisaver_rate:         ks,
        section_2_completed_at: now,
      })
    }

    if (section === 3) {
      const mcnz = clean(data.mcnz_registration_number, 30)
      if (mcnz.length < 3)  return res.status(400).json({ error: 'MCNZ registration number required' })
      if (!isoDate(data.apc_expiry_date)) return res.status(400).json({ error: 'APC expiry date required (YYYY-MM-DD)' })
      Object.assign(patch, {
        mcnz_registration_number: mcnz,
        apc_expiry_date:          isoDate(data.apc_expiry_date),
        hpi_cpn:                  clean(data.hpi_cpn, 30),
        prescriber_number:        clean(data.prescriber_number, 20),
        scope_of_practice:        clean(data.scope_of_practice, 200),
        section_3_completed_at:   now,
      })

      // Optional APC PDF upload — small file so accepting base64 is fine.
      if (typeof b.apcPngBase64 === 'string' && b.apcPngBase64.startsWith('data:application/pdf;base64,')) {
        if (b.apcPngBase64.length > 6_000_000) return res.status(400).json({ error: 'APC PDF too large (max ~4 MB)' })
        const raw = b.apcPngBase64.slice('data:application/pdf;base64,'.length)
        const buf = Buffer.from(raw, 'base64')
        const key = `${row.id}-apc.pdf`
        const { error: upErr } = await supabase.storage.from('onboarding')
          .upload(key, buf, { contentType: 'application/pdf', upsert: true, cacheControl: '0' })
        if (upErr) { console.error('[onboarding] APC upload failed:', upErr); return res.status(500).json({ error: 'APC upload failed' }) }
        patch.apc_storage_key = key
      }
    }

    if (section === 4) {
      if (typeof b.signaturePngBase64 !== 'string' || !b.signaturePngBase64.startsWith('data:image/png;base64,')) {
        return res.status(400).json({ error: 'signature PNG required' })
      }
      if (b.signaturePngBase64.length > 350_000) return res.status(400).json({ error: 'Signature image too large' })
      const raw = b.signaturePngBase64.slice('data:image/png;base64,'.length)
      const buf = Buffer.from(raw, 'base64')
      const key = `${row.id}-sig.png`
      const { error: upErr } = await supabase.storage.from('onboarding')
        .upload(key, buf, { contentType: 'image/png', upsert: true, cacheControl: '0' })
      if (upErr) { console.error('[onboarding] sig upload failed:', upErr); return res.status(500).json({ error: 'Signature upload failed' }) }
      patch.signature_storage_key = key
      patch.section_4_completed_at = now
    }

    // Compute whether all four sections are done AFTER this write.
    const oldFlags = [row.section_1_completed_at, row.section_2_completed_at, row.section_3_completed_at, row.section_4_completed_at]
    const flags = oldFlags.map((v, i) => (i + 1 === section) ? now : v)
    const wasComplete = row.status === 'complete' || row.status === 'processed'
    const nowComplete = flags.every(Boolean)
    if (nowComplete && !wasComplete) {
      patch.status = 'complete'
      patch.completed_at = now
    }

    const { data: updated, error: upErr2 } = await supabase
      .from('job_onboarding_intake')
      .update(patch)
      .eq('id', row.id)
      .select('id, application_id, status, completed_at')
      .maybeSingle()
    if (upErr2) { console.error('[onboarding] update failed:', upErr2); return res.status(500).json({ error: 'Server error' }) }

    // Only fire the notification on the first transition to complete.
    if (nowComplete && !wasComplete) {
      try {
        const { data: app } = await supabase
          .from('job_applications')
          .select('first_name, last_name')
          .eq('id', updated.application_id)
          .maybeSingle()
        const candidateName = [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'a new hire'
        await sendEmail({
          from:    'Tere Health <hello@terehealth.co.nz>',
          replyTo: 'terehealthnz@gmail.com',
          to:      ['terehealthnz@gmail.com'],
          subject: `Onboarding intake complete — ${candidateName}`,
          html: emailShell(`
            <p style="font-size:15px;margin:0 0 16px"><strong>${candidateName}</strong> has finished all four onboarding sections.</p>
            <p style="font-size:15px;line-height:1.7;color:#374151">Open the applicant panel in Admin to review and create their provider account.</p>`),
          text: `${candidateName} finished onboarding intake — review + create provider in Admin.`,
        })
      } catch (e) {
        console.error('[onboarding] complete notify email failed:', e.message)
      }
    }

    return res.status(200).json({ ok: true, status: updated?.status, completed_at: updated?.completed_at })
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

  // Invite email that either (a) joins straight to the video room (instant /
  // pre-scheduled), or (b) links to a picker page so the applicant chooses
  // from N proposed slots. Uses module-scope helpers (emailShell, fmtNz).
  async function sendInviteEmail({ app, joinUrl, pickerUrl, scheduledAt, isInstant, proposedSlots }) {
    const firstName = app.first_name || 'there'
    let bodyMain
    if (proposedSlots?.length) {
      const listHtml = proposedSlots.map(s => `<li>${fmtNz(s)}</li>`).join('')
      bodyMain = `
        <p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p>
        <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">Thanks for applying to Tere Health. We'd love to have a chat — please pick a time that suits from the options below.</p>
        <ul style="font-size:14px;color:#374151;line-height:1.8;margin:0 0 20px;padding-left:20px">${listHtml}</ul>
        <div style="text-align:center;margin:28px 0"><a href="${pickerUrl}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:14px 32px;border-radius:99px;font-size:15px;font-weight:700">Pick a time →</a></div>
        <p style="font-size:13px;color:#6B7280;line-height:1.6;margin:0 0 8px">If the button doesn't work, paste this link into your browser:</p>
        <p style="font-size:12px;color:#0B6E76;word-break:break-all;margin:0 0 24px">${pickerUrl}</p>`
    } else {
      const whenLine = isInstant
        ? 'Your interviewer is ready now — the link below joins you straight to the video room.'
        : `Scheduled for <strong>${fmtNz(scheduledAt)}</strong> (NZ time).`
      bodyMain = `
        <p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p>
        <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">Thanks for applying to Tere Health. We'd love to have a chat.</p>
        <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 20px">${whenLine}</p>
        <div style="text-align:center;margin:28px 0"><a href="${joinUrl}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:14px 32px;border-radius:99px;font-size:15px;font-weight:700">Join interview →</a></div>
        <p style="font-size:13px;color:#6B7280;line-height:1.6;margin:0 0 8px">If the button doesn't work, paste this link into your browser:</p>
        <p style="font-size:12px;color:#0B6E76;word-break:break-all;margin:0 0 24px">${joinUrl}</p>`
    }
    const html = emailShell(bodyMain + `
        <div style="background:#F0F9FA;border-radius:8px;padding:12px 16px;font-size:13px;color:#0D2B45">
          <strong>Before you join:</strong> use a laptop or desktop if you can. You'll need a working camera + microphone. Chrome, Safari, and Edge all work.
        </div>
        <p style="font-size:15px;line-height:1.7;color:#374151;margin:24px 0 0">Ngā mihi,<br>The Tere Health team</p>`)

    const textLines = proposedSlots?.length
      ? [
          `Kia ora ${firstName},`, '',
          "Thanks for applying to Tere Health. Please pick a time that suits:",
          ...proposedSlots.map(s => `  • ${fmtNz(s)}`), '',
          `Pick a time: ${pickerUrl}`, '',
        ]
      : [
          `Kia ora ${firstName},`, '',
          "Thanks for applying to Tere Health. We'd love to have a chat.",
          isInstant
            ? 'Your interviewer is ready now.'
            : `Scheduled for ${fmtNz(scheduledAt)} (NZ time).`, '',
          `Join your interview: ${joinUrl}`, '',
        ]
    textLines.push(
      "Before you join: use a laptop or desktop if you can. You'll need a working camera + microphone. Chrome, Safari, and Edge all work.",
      '', 'Ngā mihi,', 'The Tere Health team', 'terehealth.co.nz',
    )

    await sendEmail({
      from: 'Tere Health <hello@terehealth.co.nz>',
      replyTo: 'terehealthnz@gmail.com',
      to: [app.email],
      subject: proposedSlots?.length ? 'Pick a time for your Tere Health interview' : 'Your Tere Health interview',
      html,
      text: textLines.join('\n'),
    })
  }

  // Schedule (or immediately create) an interview.
  //
  // Body shape:
  //   { mode: 'instant' }                              → send join link now
  //   { scheduledAt: <ISO> }                           → single confirmed time
  //   { proposedSlots: [<ISO>, <ISO>, ...] }           → picker flow: applicant
  //                                                       picks one via /interview/pick/:token
  //   { durationMinutes: <int> }                       → default 30, used for .ics
  if (req.method === 'POST' && action === 'schedule_interview') {
    if (!id) return res.status(400).json({ error: 'id (application_id) required' })
    const { scheduledAt, mode, proposedSlots, durationMinutes } = req.body || {}
    const validSlots = Array.isArray(proposedSlots)
      ? proposedSlots.filter(s => typeof s === 'string' && !isNaN(new Date(s).getTime()))
      : []
    const isPicker  = validSlots.length > 0
    const isInstant = !isPicker && (mode === 'instant' || !scheduledAt)
    const duration  = Math.max(15, Math.min(240, Number(durationMinutes) || 30))
    const provider  = auth.provider || {}

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
        scheduled_at:           isPicker ? null : (isInstant ? null : scheduledAt),
        proposed_slots:         isPicker ? validSlots : null,
        duration_minutes:       duration,
        status:                 isPicker ? 'proposed' : (isInstant ? 'instant' : 'scheduled'),
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

    const siteOrigin = getSiteOriginFor(req)
    const joinUrl   = `${siteOrigin}/interview/${joinTok}`
    const pickerUrl = `${siteOrigin}/interview/pick/${joinTok}`
    try {
      await sendInviteEmail({ app, joinUrl, pickerUrl, scheduledAt, isInstant, proposedSlots: isPicker ? validSlots : null })
    } catch (e) {
      console.error('[interview] invite email send failed:', e.message)
      // Don't fail the request — admin can copy the URL from the response
      // and message the applicant manually.
    }

    return res.status(200).json({
      interview: iv,
      joinUrl,
      ...(isPicker ? { pickerUrl } : {}),
    })
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

  // Cross-applicant upcoming queue view. Powers the Careers → Interviews tab.
  // Returns rows in scheduled/instant/proposed/in_progress status with the
  // parent application + listing joined for display. Ordered by upcoming-ness:
  // rows with a concrete scheduled_at first (chronological), then proposed
  // rows waiting on applicant pick.
  if (req.method === 'GET' && action === 'all_interviews') {
    const { data, error } = await supabase
      .from('job_interviews')
      .select(`
        id, room_key, applicant_join_token, status, scheduled_at, proposed_slots,
        duration_minutes, interviewer_provider_id, created_at,
        application:job_applications(id, first_name, last_name, email,
          job_listing:job_listings(id, title))
      `)
      .in('status', ['scheduled', 'instant', 'proposed', 'in_progress'])
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(200)
    if (error) { console.error('[interview] all_interviews failed:', error); return res.status(500).json({ error: 'Server error' }) }
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

  // ── Authed offer flow ──────────────────────────────────────────────────
  //
  // POST  ?action=create_offer&id=<applicationId>
  //         Body: { roleTitle, compensation, startDate?, contractTerms }
  //         → creates a job_offers row (status='sent'), flips application
  //           status to 'offer', emails applicant a sign link.
  //
  // POST  ?action=countersign_offer&id=<offerId>
  //         Body: { signerName }   (uses signed-in provider's signature_url)
  //         → renders final dual-signed PDF, uploads to `offers` bucket,
  //           persists pdf_storage_key, flips status to 'countersigned',
  //           emails applicant the final signed PDF via signed URL.
  //
  // GET   ?action=offers&id=<applicationId>
  //         → list offers for an application (latest first)
  //
  // GET   ?action=offer_pdf&id=<offerId>
  //         → returns a short-lived signed URL to the countersigned PDF.
  //
  // POST  ?action=cancel_offer&id=<offerId>
  //         → status='cancelled'; used if offer is withdrawn before signing.

  if (req.method === 'POST' && action === 'create_offer') {
    if (!id) return res.status(400).json({ error: 'id (application_id) required' })
    const { roleTitle, compensation, startDate, contractTerms } = req.body || {}
    const rt = String(roleTitle    || '').trim()
    const cp = String(compensation || '').trim()
    const ct = String(contractTerms|| '').trim()
    if (rt.length < 2 || rt.length > 200) return res.status(400).json({ error: 'roleTitle 2-200 chars required' })
    if (cp.length < 2 || cp.length > 200) return res.status(400).json({ error: 'compensation 2-200 chars required' })
    if (ct.length < 20)                    return res.status(400).json({ error: 'contractTerms must be at least a short paragraph' })
    if (ct.length > 20_000)                return res.status(400).json({ error: 'contractTerms too large (max 20k chars)' })
    const sd = startDate ? String(startDate).trim() : null

    const { data: app, error: appErr } = await supabase
      .from('job_applications')
      .select('id, first_name, last_name, email')
      .eq('id', id)
      .maybeSingle()
    if (appErr || !app) return res.status(404).json({ error: 'Application not found' })

    const signToken = randomBytes(24).toString('base64url')
    const { data: offer, error: oErr } = await supabase
      .from('job_offers')
      .insert({
        application_id:          id,
        created_by_provider_id:  auth.provider?.id || null,
        role_title:              rt,
        compensation:            cp,
        start_date:              sd || null,
        contract_terms:          ct,
        applicant_sign_token:    signToken,
        status:                  'sent',
      })
      .select('*')
      .maybeSingle()
    if (oErr) { console.error('[offer] insert failed:', oErr); return res.status(500).json({ error: 'Server error' }) }

    // Move the application forward if it's not already at offer/hired.
    supabase.from('job_applications')
      .update({ status: 'offer' })
      .eq('id', id)
      .in('status', ['new', 'reviewing', 'interview'])
      .then(() => {}, () => {})

    const siteOrigin = getSiteOriginFor(req)
    const signUrl    = `${siteOrigin}/offer/sign/${signToken}`

    // Email applicant with the sign link.
    if (app.email) {
      try {
        const firstName = app.first_name || 'there'
        await sendEmail({
          from:    'Tere Health <hello@terehealth.co.nz>',
          replyTo: 'terehealthnz@gmail.com',
          to:      [app.email],
          subject: `Your Tere Health offer — ${rt}`,
          html: emailShell(`
            <p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p>
            <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">We'd love to have you join Tere Health. Your letter of offer is ready to review and sign online.</p>
            <div style="background:#F0F9FA;border-radius:8px;padding:14px 16px;margin:0 0 20px;font-size:14px;color:#0D2B45">
              <div><strong>Role:</strong> ${rt}</div>
              <div style="margin-top:4px"><strong>Compensation:</strong> ${cp}</div>
              ${sd ? `<div style="margin-top:4px"><strong>Start date:</strong> ${new Date(sd).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}</div>` : ''}
            </div>
            <div style="text-align:center;margin:28px 0"><a href="${signUrl}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:14px 32px;border-radius:99px;font-size:15px;font-weight:700">Review &amp; sign →</a></div>
            <p style="font-size:13px;color:#6B7280;line-height:1.6;margin:0 0 8px">Or open this link:</p>
            <p style="font-size:12px;color:#0B6E76;word-break:break-all;margin:0 0 24px">${signUrl}</p>
            <p style="font-size:15px;line-height:1.7;color:#374151;margin:24px 0 0">Ngā mihi,<br>The Tere Health team</p>`),
          text: [
            `Kia ora ${firstName},`, '',
            'Your Tere Health letter of offer is ready to review and sign online.', '',
            `Role: ${rt}`,
            `Compensation: ${cp}`,
            sd ? `Start date: ${new Date(sd).toLocaleDateString('en-NZ')}` : null,
            '',
            `Review & sign: ${signUrl}`,
            '', 'Ngā mihi,', 'The Tere Health team',
          ].filter(Boolean).join('\n'),
        })
      } catch (e) {
        console.error('[offer] applicant sign email failed:', e.message)
      }
    }

    return res.status(200).json({ offer, signUrl })
  }

  if (req.method === 'GET' && action === 'offers') {
    if (!id) return res.status(400).json({ error: 'id (application_id) required' })
    const { data, error } = await supabase
      .from('job_offers')
      .select('id, application_id, role_title, compensation, start_date, contract_terms, status, applicant_signed_name, applicant_signed_at, countersigned_name, countersigned_at, pdf_storage_key, created_at, applicant_sign_token')
      .eq('application_id', id)
      .order('created_at', { ascending: false })
    if (error) { console.error('[offer] list failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ offers: data || [] })
  }

  if (req.method === 'GET' && action === 'offer_pdf') {
    if (!id) return res.status(400).json({ error: 'id (offer_id) required' })
    const { data: offer } = await supabase
      .from('job_offers')
      .select('pdf_storage_key')
      .eq('id', id)
      .maybeSingle()
    if (!offer?.pdf_storage_key) return res.status(404).json({ error: 'PDF not generated yet' })
    const { data: signed, error: sErr } = await supabase.storage.from('offers')
      .createSignedUrl(offer.pdf_storage_key, 300)   // 5-min window; admin viewer only
    if (sErr || !signed?.signedUrl) { console.error('[offer] sign PDF failed:', sErr); return res.status(500).json({ error: 'Sign failed' }) }
    return res.status(200).json({ signedUrl: signed.signedUrl })
  }

  if (req.method === 'POST' && action === 'cancel_offer') {
    if (!id) return res.status(400).json({ error: 'id (offer_id) required' })
    const { error } = await supabase.from('job_offers')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .in('status', ['sent', 'applicant_signed'])
    if (error) { console.error('[offer] cancel failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'POST' && action === 'countersign_offer') {
    if (!id) return res.status(400).json({ error: 'id (offer_id) required' })
    const { signerName } = req.body || {}
    const clean = String(signerName || '').trim()
    if (clean.length < 2 || clean.length > 120) {
      return res.status(400).json({ error: 'signerName 2-120 chars required' })
    }

    // Load offer + application + Tere signer.
    const { data: offer, error: oErr } = await supabase
      .from('job_offers')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (oErr || !offer) return res.status(404).json({ error: 'Offer not found' })
    if (offer.status !== 'applicant_signed') {
      return res.status(409).json({ error: `Offer is ${offer.status} — countersign requires applicant_signed`, status: offer.status })
    }

    const [{ data: app }, { data: signer }] = await Promise.all([
      supabase.from('job_applications').select('first_name, last_name, email').eq('id', offer.application_id).maybeSingle(),
      supabase.from('providers').select('first_name, last_name, signature_url, specialty').eq('id', auth.provider?.id).maybeSingle(),
    ])

    // Build the final PDF.
    let pdfBuffer
    try {
      pdfBuffer = await buildOfferPdf({
        application: app || {},
        offer: { ...offer, countersigned_name: clean, countersigned_at: new Date().toISOString() },
        tereSigner: {
          first_name:    signer?.first_name,
          last_name:     signer?.last_name,
          title:         signer?.specialty || null,
          signature_url: signer?.signature_url || null,
        },
      })
    } catch (e) {
      console.error('[offer] PDF build failed:', e.message)
      return res.status(500).json({ error: 'PDF build failed' })
    }

    // Ensure bucket exists (idempotent — noop if declared via migration).
    try { await supabase.storage.createBucket('offers', { public: false }) } catch { /* exists */ }

    const path = `${offer.id}.pdf`
    const { error: upErr } = await supabase.storage.from('offers')
      .upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true, cacheControl: '0' })
    if (upErr) { console.error('[offer] upload failed:', upErr); return res.status(500).json({ error: 'Upload failed' }) }

    // Flip status + persist countersign metadata + PDF key.
    const { error: fErr } = await supabase.from('job_offers').update({
      status:                       'countersigned',
      countersigned_by_provider_id: auth.provider?.id || null,
      countersigned_name:           clean,
      countersigned_at:             new Date().toISOString(),
      pdf_storage_key:              path,
    }).eq('id', offer.id)
    if (fErr) { console.error('[offer] finalise failed:', fErr); return res.status(500).json({ error: 'Server error' }) }

    // Email applicant a signed URL of the final PDF. Non-blocking.
    try {
      const { data: signed } = await supabase.storage.from('offers')
        .createSignedUrl(path, 60 * 60 * 24 * 7)   // 7d window; enough to save/download
      if (signed?.signedUrl && app?.email) {
        const firstName = app.first_name || 'there'
        await sendEmail({
          from:    'Tere Health <hello@terehealth.co.nz>',
          replyTo: 'terehealthnz@gmail.com',
          to:      [app.email],
          subject: 'Your fully-signed Tere Health offer',
          html: emailShell(`
            <p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p>
            <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">Welcome aboard  Both signatures are now on the letter of offer. Please download and keep a copy for your records.</p>
            <div style="text-align:center;margin:28px 0"><a href="${signed.signedUrl}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:14px 32px;border-radius:99px;font-size:15px;font-weight:700">Download signed PDF →</a></div>
            <p style="font-size:12px;color:#9CA3AF;line-height:1.6">The link stays live for one week. If you need a fresh copy after that, reply to this email.</p>
            <p style="font-size:15px;line-height:1.7;color:#374151;margin:24px 0 0">Ngā mihi,<br>The Tere Health team</p>`),
          text: [
            `Kia ora ${firstName},`, '',
            'Both signatures are now on your letter of offer.',
            'Download it here (link expires in one week):', signed.signedUrl,
            '', 'Ngā mihi,', 'The Tere Health team',
          ].join('\n'),
        })
      }
    } catch (e) {
      console.error('[offer] final PDF email failed:', e.message)
    }

    return res.status(200).json({ ok: true, offerId: offer.id })
  }

  // ── Authed reference flow ──────────────────────────────────────────────
  //
  // POST ?action=request_reference&id=<applicationId>
  //         Body: { refereeName, refereeEmail, refereePhone?, refereeRelationship? }
  //         → creates job_references row, emails referee a token'd link.
  //
  // GET  ?action=references&id=<applicationId>
  //         → list references for an application (latest first).
  //
  // POST ?action=cancel_reference&id=<referenceId>
  //         → status='cancelled'. Referee link still works but shows terminal.

  if (req.method === 'POST' && action === 'request_reference') {
    if (!id) return res.status(400).json({ error: 'id (application_id) required' })
    const b = req.body || {}
    const name  = String(b.refereeName        || '').trim()
    const email = String(b.refereeEmail       || '').trim().toLowerCase()
    const phone = String(b.refereePhone       || '').trim()
    const rel   = String(b.refereeRelationship|| '').trim()
    if (name.length < 2 || name.length > 120)   return res.status(400).json({ error: 'refereeName 2-120 chars required' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'refereeEmail is not a valid email' })

    const { data: app, error: aErr } = await supabase
      .from('job_applications')
      .select('id, first_name, last_name, job_listing_id')
      .eq('id', id)
      .maybeSingle()
    if (aErr || !app) return res.status(404).json({ error: 'Application not found' })

    let roleTitle = 'a role at Tere Health'
    if (app.job_listing_id) {
      const { data: listing } = await supabase.from('job_listings').select('title').eq('id', app.job_listing_id).maybeSingle()
      if (listing?.title) roleTitle = listing.title
    }

    const requestToken = randomBytes(24).toString('base64url')
    const { data: ref, error: rErr } = await supabase
      .from('job_references')
      .insert({
        application_id:         id,
        created_by_provider_id: auth.provider?.id || null,
        referee_name:           name,
        referee_email:          email,
        referee_phone:          phone || null,
        referee_relationship:   rel || null,
        request_token:          requestToken,
        status:                 'pending',
      })
      .select('*')
      .maybeSingle()
    if (rErr) { console.error('[reference] insert failed:', rErr); return res.status(500).json({ error: 'Server error' }) }

    const candidateName = [app.first_name, app.last_name].filter(Boolean).join(' ') || 'a candidate'
    const siteOrigin    = getSiteOriginFor(req)
    const respondUrl    = `${siteOrigin}/reference/respond/${requestToken}`

    try {
      const firstName = name.split(' ')[0] || 'there'
      await sendEmail({
        from:    'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to:      [email],
        subject: `Reference request for ${candidateName} — Tere Health`,
        html: emailShell(`
          <p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p>
          <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">
            <strong>${candidateName}</strong> has applied for <strong>${roleTitle}</strong> at Tere Health and listed you as a referee.
            We'd be grateful if you could take five minutes to answer a few short questions about them.
          </p>
          ${rel ? `<p style="font-size:13px;color:#6B7280;margin:0 0 16px"><em>Noted relationship: ${rel}</em></p>` : ''}
          <div style="text-align:center;margin:28px 0"><a href="${respondUrl}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:14px 32px;border-radius:99px;font-size:15px;font-weight:700">Give a reference →</a></div>
          <p style="font-size:13px;color:#6B7280;line-height:1.6;margin:0 0 8px">Or paste this link into your browser:</p>
          <p style="font-size:12px;color:#0B6E76;word-break:break-all;margin:0 0 24px">${respondUrl}</p>
          <p style="font-size:13px;color:#6B7280;line-height:1.6">Your response is confidential and shared only with the Tere Health hiring team. If you'd rather not give a reference, you can safely ignore this email or reply directly.</p>
          <p style="font-size:15px;line-height:1.7;color:#374151;margin:24px 0 0">Ngā mihi,<br>The Tere Health team</p>`),
        text: [
          `Kia ora ${firstName},`, '',
          `${candidateName} has applied for ${roleTitle} at Tere Health and listed you as a referee.`,
          "Would you take five minutes to answer a few short questions?", '',
          `Give a reference: ${respondUrl}`, '',
          "Your response is confidential. If you'd rather not, ignore this email or reply.",
          '', 'Ngā mihi,', 'The Tere Health team',
        ].join('\n'),
      })
    } catch (e) {
      console.error('[reference] send request email failed:', e.message)
      // Don't fail the request — admin sees the URL in the response.
    }

    return res.status(200).json({ reference: ref, respondUrl })
  }

  if (req.method === 'GET' && action === 'references') {
    if (!id) return res.status(400).json({ error: 'id (application_id) required' })
    const { data, error } = await supabase
      .from('job_references')
      .select('*')
      .eq('application_id', id)
      .order('created_at', { ascending: false })
    if (error) { console.error('[reference] list failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ references: data || [] })
  }

  if (req.method === 'POST' && action === 'cancel_reference') {
    if (!id) return res.status(400).json({ error: 'id (reference_id) required' })
    const { error } = await supabase.from('job_references')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('status', 'pending')
    if (error) { console.error('[reference] cancel failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  }

  // ── Authed onboarding intake ───────────────────────────────────────────
  //
  // POST ?action=create_onboarding_intake&id=<applicationId>
  //         → create the intake row (or return existing), email applicant
  //           the setup link. Idempotent — safe to click twice.
  //
  // GET  ?action=onboarding_intake&id=<applicationId>
  //         → admin view of intake state. Secrets stay encrypted; caller
  //           gets last-4 masks for tax/bank. Use reveal_onboarding_secret
  //           to see the full value (audit-logged).
  //
  // POST ?action=reveal_onboarding_secret&id=<intakeId>
  //         Body: { field: 'ird_number' | 'bank_account' }
  //         → decrypts + returns the full value, writes an audit-log entry.
  //
  // GET  ?action=onboarding_file&id=<intakeId>&kind=apc|signature
  //         → short-lived signed URL for the private onboarding bucket file.
  //
  // POST ?action=cancel_onboarding&id=<applicationId>
  //         → status=cancelled. Applicant link shows cancelled state.

  if (req.method === 'POST' && action === 'create_onboarding_intake') {
    if (!id) return res.status(400).json({ error: 'id (application_id) required' })
    const { data: app, error: aErr } = await supabase
      .from('job_applications')
      .select('id, first_name, last_name, email')
      .eq('id', id)
      .maybeSingle()
    if (aErr || !app) return res.status(404).json({ error: 'Application not found' })
    if (!app.email) return res.status(400).json({ error: 'Applicant has no email on file' })

    // Idempotent — reuse if a row already exists.
    const { data: existing } = await supabase
      .from('job_onboarding_intake')
      .select('*')
      .eq('application_id', id)
      .maybeSingle()

    let row = existing
    if (!row) {
      const setupToken = randomBytes(24).toString('base64url')
      const { data: created, error: cErr } = await supabase
        .from('job_onboarding_intake')
        .insert({
          application_id:         id,
          created_by_provider_id: auth.provider?.id || null,
          setup_token:            setupToken,
          status:                 'pending',
        })
        .select('*')
        .maybeSingle()
      if (cErr) { console.error('[onboarding] create failed:', cErr); return res.status(500).json({ error: 'Server error' }) }
      row = created
    }

    const siteOrigin = getSiteOriginFor(req)
    const setupUrl   = `${siteOrigin}/onboarding/setup/${row.setup_token}`

    try {
      const firstName = app.first_name || 'there'
      await sendEmail({
        from:    'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to:      [app.email],
        subject: 'Welcome to Tere Health — a few details to get you set up',
        html: emailShell(`
          <p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p>
          <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">
            Welcome to the team  Before we can create your provider account and get you into training, we need a few details.
            The form takes about 10 minutes and has four short sections:
          </p>
          <ol style="font-size:14px;color:#374151;line-height:1.8;margin:0 0 20px;padding-left:22px">
            <li>Personal &amp; emergency contact</li>
            <li>Payroll (IRD, bank, KiwiSaver) — encrypted end-to-end</li>
            <li>Clinical credentials (MCNZ registration, APC PDF, HPI-CPN)</li>
            <li>Your signature</li>
          </ol>
          <div style="text-align:center;margin:28px 0"><a href="${setupUrl}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:14px 32px;border-radius:99px;font-size:15px;font-weight:700">Start onboarding →</a></div>
          <p style="font-size:13px;color:#6B7280;line-height:1.6;margin:0 0 8px">Or paste this link into your browser:</p>
          <p style="font-size:12px;color:#0B6E76;word-break:break-all;margin:0 0 24px">${setupUrl}</p>
          <p style="font-size:13px;color:#6B7280;line-height:1.6">You can save partway through each section and come back later using the same link.</p>
          <p style="font-size:15px;line-height:1.7;color:#374151;margin:24px 0 0">Ngā mihi,<br>The Tere Health team</p>`),
        text: [
          `Kia ora ${firstName},`, '',
          'Welcome  Before we can create your provider account we need a few details.',
          '',
          'Four short sections — personal, payroll, credentials, signature. About 10 minutes.',
          '',
          `Start onboarding: ${setupUrl}`, '',
          "You can save partway through each section and come back.",
          '', 'Ngā mihi,', 'The Tere Health team',
        ].join('\n'),
      })
    } catch (e) {
      console.error('[onboarding] setup email failed:', e.message)
      // Non-fatal — admin can copy the URL from the response.
    }

    return res.status(200).json({ intake: row, setupUrl })
  }

  if (req.method === 'GET' && action === 'onboarding_intake') {
    if (!id) return res.status(400).json({ error: 'id (application_id) required' })
    const { data: row, error: rErr } = await supabase
      .from('job_onboarding_intake')
      .select('*')
      .eq('application_id', id)
      .maybeSingle()
    if (rErr) { console.error('[onboarding] admin get failed:', rErr); return res.status(500).json({ error: 'Server error' }) }
    if (!row) return res.status(200).json({ intake: null })

    // Decrypt only for masking — never leak the full value here.
    let irdMask = '', bankMask = ''
    try {
      if (row.ird_number_enc)  irdMask  = maskForSummary(decryptFromStorage(row.ird_number_enc))
      if (row.bank_account_enc) bankMask = maskForSummary(decryptFromStorage(row.bank_account_enc))
    } catch (e) {
      console.error('[onboarding] decrypt for mask failed:', e.message)
    }

    const { ird_number_enc, bank_account_enc, ...safe } = row
    return res.status(200).json({
      intake: { ...safe, ird_number_mask: irdMask, bank_account_mask: bankMask },
    })
  }

  if (req.method === 'POST' && action === 'reveal_onboarding_secret') {
    if (!id) return res.status(400).json({ error: 'id (intake_id) required' })
    const field = String((req.body || {}).field || '').trim()
    if (!['ird_number', 'bank_account'].includes(field)) {
      return res.status(400).json({ error: 'field must be ird_number or bank_account' })
    }
    const column = field === 'ird_number' ? 'ird_number_enc' : 'bank_account_enc'
    const { data: row } = await supabase
      .from('job_onboarding_intake')
      .select(`id, application_id, ${column}`)
      .eq('id', id)
      .maybeSingle()
    if (!row) return res.status(404).json({ error: 'Intake not found' })
    let plain = ''
    try { plain = decryptFromStorage(row[column]) }
    catch (e) { console.error('[onboarding] decrypt failed:', e.message); return res.status(500).json({ error: 'Decrypt failed — key may have rotated' }) }

    // Audit-log the reveal. Best-effort — don't fail the reveal if the log
    // insert bombs (the reveal already happened in memory).
    try {
      await supabase.from('audit_log').insert({
        provider_id:   auth.provider?.id || null,
        provider_name: [auth.provider?.first_name, auth.provider?.last_name].filter(Boolean).join(' ') || null,
        action:        'reveal_onboarding_secret',
        entity_type:   'job_onboarding_intake',
        entity_id:     row.id,
        metadata:      { field, application_id: row.application_id },
      })
    } catch (e) { console.error('[onboarding] audit reveal failed:', e.message) }

    return res.status(200).json({ value: plain })
  }

  if (req.method === 'GET' && action === 'onboarding_file') {
    if (!id) return res.status(400).json({ error: 'id (intake_id) required' })
    const kind = String(req.query?.kind || '').trim()
    if (!['apc', 'signature'].includes(kind)) return res.status(400).json({ error: 'kind must be apc|signature' })
    const { data: row } = await supabase
      .from('job_onboarding_intake')
      .select('apc_storage_key, signature_storage_key')
      .eq('id', id)
      .maybeSingle()
    if (!row) return res.status(404).json({ error: 'Intake not found' })
    const key = kind === 'apc' ? row.apc_storage_key : row.signature_storage_key
    if (!key) return res.status(404).json({ error: 'file not uploaded' })
    const { data: signed, error: sErr } = await supabase.storage.from('onboarding').createSignedUrl(key, 300)
    if (sErr || !signed?.signedUrl) { console.error('[onboarding] sign file failed:', sErr); return res.status(500).json({ error: 'Sign failed' }) }
    return res.status(200).json({ signedUrl: signed.signedUrl })
  }

  if (req.method === 'POST' && action === 'cancel_onboarding') {
    if (!id) return res.status(400).json({ error: 'id (application_id) required' })
    const { error } = await supabase.from('job_onboarding_intake')
      .update({ status: 'cancelled' })
      .eq('application_id', id)
      .in('status', ['pending', 'in_progress', 'complete'])
    if (error) { console.error('[onboarding] cancel failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  }

  // ── Offer templates ────────────────────────────────────────────────────
  //
  // GET   ?action=offer_templates                      → any authed provider (used by Create Offer picker)
  // POST  ?action=create_offer_template                → admin only
  // PATCH ?action=update_offer_template&id=<uuid>      → admin only
  // POST  ?action=delete_offer_template&id=<uuid>      → admin only (soft: is_active=false)

  if (req.method === 'GET' && action === 'offer_templates') {
    const { data, error } = await supabase
      .from('offer_templates')
      .select('id, name, role_title_default, compensation_default, contract_terms, is_active, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (error) { console.error('[offer_templates] list failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ templates: data || [] })
  }

  if (req.method === 'POST' && action === 'create_offer_template') {
    if (!auth.provider?.is_admin) return res.status(403).json({ error: 'Admin role required' })
    const b = req.body || {}
    const name  = String(b.name || '').trim()
    const role  = String(b.roleTitleDefault || '').trim()
    const comp  = String(b.compensationDefault || '').trim()
    const terms = String(b.contractTerms || '').trim()
    if (name.length < 2 || name.length > 120)  return res.status(400).json({ error: 'name 2-120 chars required' })
    if (role.length < 2 || role.length > 200)  return res.status(400).json({ error: 'roleTitleDefault 2-200 chars required' })
    if (comp.length < 2 || comp.length > 200)  return res.status(400).json({ error: 'compensationDefault 2-200 chars required' })
    if (terms.length < 20 || terms.length > 20_000) return res.status(400).json({ error: 'contractTerms 20-20000 chars required' })

    const { data, error } = await supabase
      .from('offer_templates')
      .insert({
        name,
        role_title_default:     role,
        compensation_default:   comp,
        contract_terms:         terms,
        sort_order:             Number.isInteger(b.sortOrder) ? b.sortOrder : 0,
        created_by_provider_id: auth.provider?.id || null,
      })
      .select('*')
      .maybeSingle()
    if (error) { console.error('[offer_templates] insert failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ template: data })
  }

  if (req.method === 'PATCH' && action === 'update_offer_template') {
    if (!auth.provider?.is_admin) return res.status(403).json({ error: 'Admin role required' })
    if (!id) return res.status(400).json({ error: 'id required' })
    const b = req.body || {}
    const patch = {}
    if (typeof b.name === 'string')                  patch.name = b.name.trim().slice(0, 120)
    if (typeof b.roleTitleDefault === 'string')      patch.role_title_default = b.roleTitleDefault.trim().slice(0, 200)
    if (typeof b.compensationDefault === 'string')   patch.compensation_default = b.compensationDefault.trim().slice(0, 200)
    if (typeof b.contractTerms === 'string')         patch.contract_terms = b.contractTerms.trim().slice(0, 20_000)
    if (typeof b.isActive === 'boolean')             patch.is_active = b.isActive
    if (Number.isInteger(b.sortOrder))               patch.sort_order = b.sortOrder
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'nothing to update' })

    const { error } = await supabase.from('offer_templates').update(patch).eq('id', id)
    if (error) { console.error('[offer_templates] update failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'POST' && action === 'delete_offer_template') {
    if (!auth.provider?.is_admin) return res.status(403).json({ error: 'Admin role required' })
    if (!id) return res.status(400).json({ error: 'id required' })
    // Soft-delete — preserves historical offers that referenced the template's text.
    const { error } = await supabase.from('offer_templates').update({ is_active: false }).eq('id', id)
    if (error) { console.error('[offer_templates] delete failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
