// GET /api/cron-interview-reminders — hourly Vercel Cron.
//
// Finds scheduled interviews landing between ~24h and ~25h from now (a 1h
// firing window matching the hourly cron cadence) that haven't already had
// their T-24h reminder sent, and emails both applicant + interviewer.
//
// Uses reminder_24h_sent_at as the idempotency latch — set the moment we
// enqueue the email, so a re-run within the hour skips already-sent rows.
// Partial index idx_job_interviews_reminder_due keeps this cheap.

import { createClient } from '@supabase/supabase-js'
import { sendEmail, hasEmailProvider } from './_email-client.js'
import { buildInterviewIcs } from './_ics.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function fmtNz(iso) {
  return new Date(iso).toLocaleString('en-NZ', {
    timeZone: 'Pacific/Auckland', dateStyle: 'full', timeStyle: 'short',
  })
}

function shell(bodyHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px"><div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div></div>
  <div style="padding:24px 28px">${bodyHtml}</div>
  <div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">Tere Health · terehealth.co.nz</div>
</body></html>`
}

function siteOrigin() {
  return process.env.PUBLIC_SITE_ORIGIN || 'https://terehealth.co.nz'
}

async function sendReminder({ to, name, joinUrl, scheduledAt, durationMin, interviewId, subject, intro }) {
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
    from:    'Tere Health <hello@terehealth.co.nz>',
    replyTo: 'terehealthnz@gmail.com',
    to:      [to],
    subject,
    html: shell(`
      <p style="font-size:15px;margin:0 0 16px">Kia ora ${firstName},</p>
      <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">${intro}</p>
      <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 20px"><strong>${fmtNz(scheduledAt)}</strong> (NZ time)</p>
      <div style="text-align:center;margin:28px 0"><a href="${joinUrl}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:14px 32px;border-radius:99px;font-size:15px;font-weight:700">Join interview →</a></div>
      <p style="font-size:12px;color:#0B6E76;word-break:break-all;margin:12px 0 24px">${joinUrl}</p>
      <p style="font-size:15px;line-height:1.7;color:#374151;margin:24px 0 0">Ngā mihi,<br>The Tere Health team</p>`),
    text: [
      `Kia ora ${firstName},`, '', intro,
      `${fmtNz(scheduledAt)} (NZ time)`, '',
      `Join: ${joinUrl}`, '',
      'Ngā mihi,', 'The Tere Health team',
    ].join('\n'),
    attachments: [{
      filename:    'tere-health-interview.ics',
      contentType: 'text/calendar; charset=utf-8; method=REQUEST',
      content:     Buffer.from(ics, 'utf8'),
    }],
  })
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const { verifyCronSecret } = await import('./_cron-auth.js')
  if (!verifyCronSecret(req)) return res.status(404).end()

  if (!hasEmailProvider()) {
    return res.status(200).json({ ok: true, skipped: 'no email provider' })
  }

  const supabase = admin()
  const now = new Date()
  // Window: interviews scheduled between 24h and 25h from now. Cron runs
  // hourly so this 1h window is exactly one cron tick — no double-sends,
  // no gaps, provided cron doesn't skip a run.
  const winStart = new Date(now.getTime() + 24 * 60 * 60_000).toISOString()
  const winEnd   = new Date(now.getTime() + 25 * 60 * 60_000).toISOString()

  const { data: due, error: findErr } = await supabase
    .from('job_interviews')
    .select('id, application_id, applicant_join_token, scheduled_at, duration_minutes, interviewer_provider_id, status')
    .in('status', ['scheduled', 'instant'])
    .is('reminder_24h_sent_at', null)
    .gte('scheduled_at', winStart)
    .lt('scheduled_at', winEnd)

  if (findErr) {
    console.error('[cron-interview-reminders] find failed:', findErr.message)
    return res.status(500).json({ error: 'Server error' })
  }

  if (!due || due.length === 0) {
    return res.status(200).json({ ok: true, sent: 0 })
  }

  const origin = siteOrigin()
  let sent = 0
  for (const iv of due) {
    // Fetch applicant + interviewer per interview. Small N (bounded by
    // interviews-per-hour), so no batching needed.
    const [{ data: app }, { data: interviewer }] = await Promise.all([
      supabase.from('job_applications').select('first_name, last_name, email').eq('id', iv.application_id).maybeSingle(),
      iv.interviewer_provider_id
        ? supabase.from('providers').select('first_name, last_name, email').eq('id', iv.interviewer_provider_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const joinUrl = `${origin}/interview/${iv.applicant_join_token}`
    const durationMin = iv.duration_minutes || 30
    const applicantName = [app?.first_name, app?.last_name].filter(Boolean).join(' ') || 'Applicant'

    // Set the latch FIRST so a crash between sends doesn't re-email the
    // side that already got it. Downside: on send failure the row still
    // flips, so the reminder is silently missed. Acceptable trade-off —
    // the confirmation email at schedule time already carried the .ics.
    const { error: latchErr } = await supabase
      .from('job_interviews')
      .update({ reminder_24h_sent_at: new Date().toISOString() })
      .eq('id', iv.id)
      .is('reminder_24h_sent_at', null)
    if (latchErr) {
      console.error('[cron-interview-reminders] latch failed:', iv.id, latchErr.message)
      continue
    }

    const jobs = []
    if (app?.email) {
      jobs.push(sendReminder({
        to: app.email,
        name: applicantName,
        joinUrl,
        scheduledAt: iv.scheduled_at,
        durationMin,
        interviewId: iv.id,
        subject: 'Reminder: your Tere Health interview tomorrow',
        intro:   "Just a heads-up — your Tere Health interview is 24 hours away.",
      }))
    }
    if (interviewer?.email) {
      jobs.push(sendReminder({
        to: interviewer.email,
        name: [interviewer.first_name, interviewer.last_name].filter(Boolean).join(' '),
        joinUrl,
        scheduledAt: iv.scheduled_at,
        durationMin,
        interviewId: iv.id,
        subject: `Reminder: interview with ${applicantName} tomorrow`,
        intro:   `Your interview with ${applicantName} is scheduled in 24 hours.`,
      }))
    }
    const results = await Promise.allSettled(jobs)
    for (const r of results) {
      if (r.status === 'rejected') console.error('[cron-interview-reminders] send failed:', r.reason?.message || r.reason)
    }
    sent += jobs.length
  }

  return res.status(200).json({ ok: true, interviews: due.length, emails: sent })
}
