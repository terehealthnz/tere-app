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

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
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
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
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
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: application.email,
        to: ['terehealthnz@gmail.com'],
        subject: `New applicant: ${fullName} · ${roleLine}`,
        html: internalHtml,
        text: internalText,
      }),
    })
  } catch (e) { console.error('[job-applications] internal alert failed:', e.message) }

  if (application.email) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: 'Tere Health <hello@terehealth.co.nz>',
          replyTo: 'terehealthnz@gmail.com',
          to: [application.email],
          subject: `We've received your application — Tere Health`,
          html: autoresponderHtml,
          text: autoresponderText,
        }),
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
    if (error) return res.status(500).json({ error: error.message })
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
      if (appErr) return res.status(500).json({ error: appErr.message })
      if (!app) return res.status(404).json({ error: 'Application not found' })
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
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ applications: data || [] })
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
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
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
    if (error) return res.status(500).json({ error: error.message })
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
    if (error) return res.status(500).json({ error: error.message })

    if (patch.status === 'hired') {
      await seedOnboardingIfNeeded(supabase, id)
    }
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'id required' })
    const { error } = await supabase.from('job_applications').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
