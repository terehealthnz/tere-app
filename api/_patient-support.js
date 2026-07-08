// /api/patient-support — patient support tickets.
//
// POST                            → anon submit. Fires internal alert + patient
//                                   autoresponder via Resend. Fire-and-forget.
// GET                             → provider-auth list (?status= to filter)
// GET  ?id=<uuid>                 → provider-auth single row
// PATCH ?id=<uuid>                → provider-auth update (status / handled_by /
//                                   admin_notes). Column allowlist.
// POST ?action=reply&id=<uuid>    → provider-auth send an email reply to the
//                                   patient and record the reply as an admin note
//
// Handler mirrors the careers job-applications endpoint pattern.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const CATEGORY_ALLOWED = new Set([
  'prescription', 'billing', 'follow_up', 'technical', 'complaint', 'other',
])

const CREATE_ALLOWLIST = new Set([
  'category', 'message', 'patient_name', 'patient_email', 'patient_phone',
  'consultation_id', 'source',
])

const PATCH_ALLOWLIST = new Set([
  'status', 'admin_notes', 'handled_by', 'handled_by_name',
])

const STATUS_ALLOWED = new Set(['new', 'in_progress', 'resolved', 'archived'])

// Human-friendly labels for email subjects.
const CATEGORY_LABEL = {
  prescription: 'Prescription',
  billing: 'Billing / payment',
  follow_up: 'Consultation follow-up',
  technical: 'Technical issue',
  complaint: 'Complaint',
  other: 'Other',
}

// Days after consultation sign-off within which a follow-up is treated as
// "reasonable courtesy" — routes to the original provider's Messages tab
// (no extra charge). After this window it becomes a new async consult in
// the queue (billable).
const FOLLOW_UP_WINDOW_DAYS = 7

// Categories that can be routed to the original provider (clinical follow-ups).
// Complaints go straight to admin regardless — HDC audit trail requirement.
const CLINICAL_CATEGORIES = new Set(['prescription', 'follow_up'])

async function sendNotifications(row) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    console.warn('[patient-support] RESEND_API_KEY missing — skipping notifications')
    return
  }
  const label = CATEGORY_LABEL[row.category] || row.category
  const firstName = (row.patient_name || '').split(' ')[0] || 'there'
  const cover = (row.message || '').trim()
  const coverShort = cover.length > 900 ? cover.slice(0, 900) + '…' : cover
  const adminUrl = `${process.env.VITE_APP_URL || 'https://terehealth.co.nz'}/clinician/admin`

  // ── Internal alert ────────────────────────────────────────────────────
  const internalHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px">
    <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
    <div style="color:rgba(212,238,240,.6);font-size:12px;margin-top:2px">New patient support request · ${label}</div>
  </div>
  <div style="padding:24px 28px">
    <p style="font-size:15px;margin:0 0 16px"><strong>${escapeHtml(row.patient_name || 'Anonymous patient')}</strong> submitted a support request.</p>
    <table style="width:100%;font-size:14px;color:#374151;border-collapse:collapse;margin-bottom:18px">
      <tr><td style="padding:4px 0;color:#6B7280;width:120px">Category</td><td>${label}</td></tr>
      <tr><td style="padding:4px 0;color:#6B7280">Email</td><td><a href="mailto:${escapeHtml(row.patient_email)}" style="color:#0B6E76">${escapeHtml(row.patient_email)}</a></td></tr>
      ${row.patient_phone ? `<tr><td style="padding:4px 0;color:#6B7280">Phone</td><td>${escapeHtml(row.patient_phone)}</td></tr>` : ''}
      ${row.consultation_id ? `<tr><td style="padding:4px 0;color:#6B7280">Consultation</td><td>${escapeHtml(row.consultation_id)}</td></tr>` : ''}
      ${row.source ? `<tr><td style="padding:4px 0;color:#6B7280">Source</td><td>${escapeHtml(row.source)}</td></tr>` : ''}
    </table>
    <div style="background:#F8FAFC;border-left:3px solid #0B6E76;padding:12px 14px;border-radius:4px;margin-bottom:20px">
      <div style="font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Message</div>
      <div style="font-size:14px;color:#374151;white-space:pre-wrap">${escapeHtml(coverShort)}</div>
    </div>
    <div style="text-align:center;margin:28px 0">
      <a href="${adminUrl}" style="display:inline-block;background:#0B6E76;color:white;text-decoration:none;padding:12px 24px;border-radius:99px;font-size:14px;font-weight:700">Open in admin →</a>
    </div>
  </div>
</body></html>`
  const internalText = [
    `New patient support request — ${label}`,
    ``,
    `Name: ${row.patient_name || '—'}`,
    `Email: ${row.patient_email}`,
    row.patient_phone ? `Phone: ${row.patient_phone}` : null,
    row.consultation_id ? `Consultation: ${row.consultation_id}` : null,
    row.source ? `Source: ${row.source}` : null,
    ``,
    `Message:`,
    coverShort,
    ``,
    `Open in admin: ${adminUrl}`,
  ].filter(Boolean).join('\n')

  // ── Autoresponder to patient ──────────────────────────────────────────
  const autoHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px">
    <div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div>
  </div>
  <div style="padding:24px 28px">
    <p style="font-size:15px;margin:0 0 16px">Kia ora ${escapeHtml(firstName)},</p>
    <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">
      Thank you for reaching out. We have received your message and one of our team will reply within <strong>1 business day</strong>.
    </p>
    <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">
      If you have any additional information you would like to share, feel free to reply to this email.
    </p>
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:13px;color:#991B1B;margin-top:20px">
      ⚠️ <strong>In an emergency, call 111 or visit your nearest emergency department — do not wait for a reply from us.</strong>
    </div>
    <p style="font-size:15px;line-height:1.7;color:#374151;margin:24px 0 0">
      Ngā mihi,<br>
      The Tere Health team
    </p>
  </div>
  <div style="background:#F8FAFC;padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#9CA3AF">
    Tere Health · Marlborough Sounds, New Zealand · <a href="https://terehealth.co.nz" style="color:#0B6E76">terehealth.co.nz</a>
  </div>
</body></html>`
  const autoText = `Kia ora ${firstName},\n\nThank you for reaching out. We have received your message and one of our team will reply within 1 business day.\n\nIf you have any additional information you would like to share, feel free to reply to this email.\n\nIn an emergency, call 111 or visit your nearest emergency department — do not wait for a reply from us.\n\nNgā mihi,\nThe Tere Health team\nterehealth.co.nz`

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: row.patient_email,
        to: ['terehealthnz@gmail.com'],
        subject: `[Patient Support: ${label}] ${row.patient_name || row.patient_email}`,
        html: internalHtml,
        text: internalText,
      }),
    })
  } catch (e) { console.error('[patient-support] internal alert failed:', e.message) }

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to: [row.patient_email],
        subject: `We've received your message — Tere Health`,
        html: autoHtml,
        text: autoText,
      }),
    })
  } catch (e) { console.error('[patient-support] autoresponder failed:', e.message) }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Route a support ticket to the right surface:
//   - clinical + linked to consult + within window → provider Messages tab
//   - clinical + linked to consult + outside window → new async consult in queue
//   - everything else → admin Support inbox (no extra routing, current behavior)
//
// Returns a routing summary that we write back to the ticket for observability.
async function routeTicket(supabase, ticket) {
  const isClinical = CLINICAL_CATEGORIES.has(ticket.category)
  if (!isClinical || !ticket.consultation_id) {
    return { routing: { routing_status: 'admin_inbox' }, debug: { reason: 'not_clinical_or_no_consult', isClinical, consultation_id: ticket.consultation_id } }
  }

  const { data: consult, error: cLookupErr } = await supabase
    .from('consultations')
    .select('id, provider_id, completed_at, notes_finalised_at, updated_at, patient_first_name, patient_last_name, patient_email, patient_phone, patient_dob, patient_id')
    .eq('id', ticket.consultation_id)
    .maybeSingle()

  if (cLookupErr) {
    return { routing: { routing_status: 'admin_inbox' }, debug: { reason: 'lookup_error', err: cLookupErr.message } }
  }
  if (!consult) return { routing: { routing_status: 'admin_inbox' }, debug: { reason: 'consult_not_found' } }
  const provider_id = consult.provider_id || null

  const refIso = consult.notes_finalised_at || consult.completed_at || consult.updated_at
  const ageDays = refIso ? (Date.now() - new Date(refIso).getTime()) / 86400000 : Infinity
  const withinWindow = provider_id && ageDays <= FOLLOW_UP_WINDOW_DAYS

  if (withinWindow) {
    const subject = ticket.category === 'prescription'
      ? '✏️ Prescription follow-up'
      : '✉️ Patient follow-up'
    const preview = String(ticket.message || '').trim().slice(0, 800)
    const patientName = ticket.patient_name || 'Patient'
    const { data: notif, error: nErr } = await supabase
      .from('provider_notifications')
      .insert({
        from_name: patientName,
        subject: `${subject} — ${patientName}`,
        body: preview,
        is_pinned: false,
        to_provider_id: provider_id,
        context_type: 'support_ticket',
        context_id: ticket.id,
        action_url: `/provider/notes/${consult.id}?ticket=${ticket.id}`,
      })
      .select('id')
      .maybeSingle()
    if (nErr) console.error('[patient-support] notify insert:', nErr.message)
    return {
      routing: { routing_status: 'provider_messages', routed_notification_id: notif?.id || null },
      debug: { reason: 'within_window', ageDays, provider_id, notif_err: nErr?.message || null },
    }
  }

  // Outside window (or no provider on file) → new async consult in queue.
  // No upfront payment: the queue item flags it as a support-ticket follow-up
  // and the reviewing provider decides whether to bill.
  const chief = String(ticket.message || '').trim().slice(0, 200)
  const { data: newConsult, error: cErr } = await supabase
    .from('consultations')
    .insert({
      consultation_type: 'message',
      consultation_subtype: 'async_message',
      status: 'waiting',
      chief_complaint: `Follow-up from support ticket: ${chief}`,
      async_symptom_detail: ticket.message || null,
      async_requests: [],
      async_deadline: calcAsyncDeadline(),
      patient_id: consult.patient_id || null,
      patient_first_name: consult.patient_first_name || (ticket.patient_name || '').split(' ')[0] || null,
      patient_last_name: consult.patient_last_name || (ticket.patient_name || '').split(' ').slice(1).join(' ') || null,
      patient_email: consult.patient_email || ticket.patient_email || null,
      patient_phone: consult.patient_phone || ticket.patient_phone || null,
      patient_dob: consult.patient_dob || null,
      // consult carries no `source` column; provenance is captured in
      // chief_complaint prefix ("Follow-up from support ticket: …") and the
      // support ticket row (patient_support_requests.routed_consultation_id).
    })
    .select('id')
    .maybeSingle()
  if (cErr) {
    console.error('[patient-support] queue consult insert:', cErr.message)
    return { routing: { routing_status: 'admin_inbox' }, debug: { reason: 'queue_insert_failed', err: cErr.message, ageDays, provider_id } }
  }
  return {
    routing: { routing_status: 'new_consult', routed_consultation_id: newConsult?.id || null },
    debug: { reason: 'outside_window', ageDays, provider_id, newConsultId: newConsult?.id || null },
  }
}

// NZ business hours deadline (mirrors _async-consult.calcDeadline).
// Duplicated here to avoid importing that module's side effects (Stripe, AI).
function calcAsyncDeadline() {
  const now = new Date()
  const utcMonth = now.getUTCMonth()
  const nzOffsetMs = (utcMonth >= 9 || utcMonth <= 2) ? 13 * 3600000 : 12 * 3600000
  const nzMs = now.getTime() + nzOffsetMs
  const nzDate = new Date(nzMs)
  const day = nzDate.getUTCDay()
  const h = nzDate.getUTCHours()
  const min = h * 60 + nzDate.getUTCMinutes()
  const inBH = day >= 1 && day <= 5 && min >= 480 && min < 1080
  const toUtc = ms => new Date(ms - nzOffsetMs).toISOString()
  if (inBH) {
    const dlMs = nzMs + 4 * 60 * 60 * 1000
    const dlDate = new Date(dlMs)
    if (dlDate.getUTCHours() * 60 + dlDate.getUTCMinutes() < 1080) return toUtc(dlMs)
    const capMs = Date.UTC(nzDate.getUTCFullYear(), nzDate.getUTCMonth(), nzDate.getUTCDate(), 18, 0, 0, 0)
    return toUtc(capMs)
  }
  let next = new Date(Date.UTC(nzDate.getUTCFullYear(), nzDate.getUTCMonth(), nzDate.getUTCDate(), 10, 0, 0, 0))
  do { next = new Date(next.getTime() + 86400000) } while (next.getUTCDay() === 0 || next.getUTCDay() === 6)
  return toUtc(next.getTime())
}

export default async function handler(req, res) {
  const { action, id } = req.query || {}

  // ── Anon submit ─────────────────────────────────────────────────────
  if (req.method === 'POST' && !action) {
    const supabase = admin()
    const raw = req.body || {}
    const payload = {}
    for (const [k, v] of Object.entries(raw)) {
      if (CREATE_ALLOWLIST.has(k)) payload[k] = v
    }
    if (!payload.category || !CATEGORY_ALLOWED.has(payload.category)) {
      return res.status(400).json({ error: 'valid category is required' })
    }
    if (!payload.message || !String(payload.message).trim()) {
      return res.status(400).json({ error: 'message is required' })
    }
    if (!payload.patient_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.patient_email)) {
      return res.status(400).json({ error: 'valid patient_email is required so we can reply' })
    }
    payload.patient_email = String(payload.patient_email).trim().toLowerCase()
    payload.status = 'new'

    const { data, error } = await supabase
      .from('patient_support_requests')
      .insert(payload)
      .select('*')
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })

    // Route the ticket: provider Messages tab, new queue consult, or admin inbox.
    let routing = { routing_status: 'admin_inbox' }
    let routingDebug = null
    try {
      const result = await routeTicket(supabase, data)
      routing = result.routing || result
      routingDebug = result.debug || null
      // Strip debug key before writing to the row
      const toWrite = { ...routing }
      delete toWrite.debug
      if (Object.keys(toWrite).length > 0) {
        await supabase.from('patient_support_requests').update(toWrite).eq('id', data.id)
      }
    } catch (e) {
      console.error('[patient-support] routing error:', e.message)
      routingDebug = { threw: e.message }
    }

    // Fire-and-forget email notifications. Admin still gets an alert on
    // every ticket for oversight; the patient always gets an autoresponder.
    sendNotifications(data).catch(e =>
      console.error('[patient-support] notify error:', e.message)
    )
    return res.status(200).json({ ok: true, id: data?.id, routing_status: routing.routing_status, debug: routingDebug })
  }

  // ── Everything else requires provider auth ───────────────────────────
  const auth = await guardProvider(req, res)
  if (!auth) return
  const supabase = admin()

  // ── Provider takes action on a routed ticket from their Messages tab ─────
  // action: 'handle_now' | 'convert_to_consult' | 'bounce_to_admin'
  if (req.method === 'POST' && action === 'ticket_action') {
    if (!id) return res.status(400).json({ error: 'id required' })
    const { kind } = req.body || {}
    if (!['handle_now', 'convert_to_consult', 'bounce_to_admin'].includes(kind)) {
      return res.status(400).json({ error: 'invalid kind' })
    }
    const { data: ticket, error: fErr } = await supabase
      .from('patient_support_requests').select('*').eq('id', id).maybeSingle()
    if (fErr || !ticket) return res.status(404).json({ error: 'Ticket not found' })
    const provider = auth.provider || {}
    const now = new Date().toISOString()

    let newConsultId = null
    if (kind === 'convert_to_consult') {
      // Spawn a new async consult in the queue — the provider (or any provider)
      // will pick it up like any other queued item and get paid on sign-off.
      const { data: originalConsult } = ticket.consultation_id
        ? await supabase.from('consultations')
            .select('patient_id, patient_first_name, patient_last_name, patient_email, patient_phone, patient_dob')
            .eq('id', ticket.consultation_id).maybeSingle()
        : { data: null }
      const chief = String(ticket.message || '').trim().slice(0, 200)
      const { data: nc, error: cErr } = await supabase.from('consultations').insert({
        consultation_type: 'message',
        consultation_subtype: 'async_message',
        status: 'waiting',
        chief_complaint: `Follow-up from support ticket: ${chief}`,
        async_symptom_detail: ticket.message || null,
        async_requests: [],
        async_deadline: calcAsyncDeadline(),
        patient_id: originalConsult?.patient_id || null,
        patient_first_name: originalConsult?.patient_first_name || (ticket.patient_name || '').split(' ')[0] || null,
        patient_last_name: originalConsult?.patient_last_name || (ticket.patient_name || '').split(' ').slice(1).join(' ') || null,
        patient_email: originalConsult?.patient_email || ticket.patient_email || null,
        patient_phone: originalConsult?.patient_phone || ticket.patient_phone || null,
        patient_dob: originalConsult?.patient_dob || null,
        // consult carries no `source` column; provenance is captured in
      // chief_complaint prefix ("Follow-up from support ticket: …") and the
      // support ticket row (patient_support_requests.routed_consultation_id).
      }).select('id').maybeSingle()
      if (cErr) return res.status(500).json({ error: 'Failed to create consult: ' + cErr.message })
      newConsultId = nc?.id || null
    }

    const patch = {
      handled_by_provider_id: provider.id || null,
      handled_at: now,
      handling_action: kind,
      handled_by: provider.id || null,
      handled_by_name: [provider.first_name, provider.last_name].filter(Boolean).join(' ') || null,
    }
    if (kind === 'handle_now') patch.status = 'resolved'
    if (kind === 'convert_to_consult') {
      patch.status = 'resolved'
      patch.routed_consultation_id = newConsultId
      patch.routing_status = 'new_consult'
    }
    if (kind === 'bounce_to_admin') {
      patch.status = 'new'
      patch.routing_status = 'admin_inbox'
    }
    if (kind === 'handle_now' || kind === 'convert_to_consult') {
      patch.resolved_at = now
      patch.resolved_by = provider.id || null
    }
    await supabase.from('patient_support_requests').update(patch).eq('id', id)

    // Close out the notification row so it disappears from the provider's Messages tab.
    if (ticket.routed_notification_id) {
      await supabase.from('provider_notifications').update({
        resolved_at: now,
        resolved_by: provider.id || null,
        resolution_note: kind,
      }).eq('id', ticket.routed_notification_id)
    }

    return res.status(200).json({ ok: true, kind, consultationId: newConsultId })
  }

  // Admin reply — record and email
  if (req.method === 'POST' && action === 'reply') {
    if (!id) return res.status(400).json({ error: 'id required' })
    const { body: replyBody } = req.body || {}
    if (!replyBody || !String(replyBody).trim()) {
      return res.status(400).json({ error: 'body (reply text) required' })
    }
    const { data: row, error: fetchErr } = await supabase
      .from('patient_support_requests').select('*').eq('id', id).maybeSingle()
    if (fetchErr || !row) return res.status(404).json({ error: 'Ticket not found' })

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return res.status(500).json({ error: 'Email not configured' })

    const provider = auth.provider || {}
    const authorName = [provider.first_name, provider.last_name].filter(Boolean).join(' ') || 'Tere Health'
    const firstName = (row.patient_name || '').split(' ')[0] || 'there'
    const bodyText = String(replyBody).trim()

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1A2A33;max-width:580px;margin:0 auto;background:#fff">
  <div style="background:#0D2B45;padding:20px 28px"><div style="font-family:Georgia,serif;font-style:italic;color:#D4EEF0;font-size:20px">Tere Health</div></div>
  <div style="padding:24px 28px">
    <p style="font-size:15px;margin:0 0 16px">Kia ora ${escapeHtml(firstName)},</p>
    <div style="font-size:15px;line-height:1.7;color:#374151;white-space:pre-wrap;margin:0 0 20px">${escapeHtml(bodyText)}</div>
    <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px">
      If you need anything else, just reply to this email.
    </p>
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:13px;color:#991B1B;margin-top:20px">
      ⚠️ <strong>In an emergency, call 111 immediately.</strong>
    </div>
    <p style="font-size:15px;line-height:1.7;color:#374151;margin:24px 0 0">Ngā mihi,<br>${escapeHtml(authorName)}<br>Tere Health</p>
  </div>
</body></html>`

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: 'Tere Health <hello@terehealth.co.nz>',
          replyTo: 'terehealthnz@gmail.com',
          to: [row.patient_email],
          subject: `Re: your Tere Health support request`,
          html,
          text: `Kia ora ${firstName},\n\n${bodyText}\n\nIf you need anything else, just reply to this email.\n\nIn an emergency, call 111 immediately.\n\nNgā mihi,\n${authorName}\nTere Health`,
        }),
      })
    } catch (e) {
      return res.status(502).json({ error: 'Email send failed: ' + e.message })
    }

    // Record the reply in admin_notes + auto-advance to in_progress if new
    const stamp = new Date().toISOString()
    const noteEntry = `[${stamp}] ${authorName}:\n${bodyText}`
    const newNotes = row.admin_notes ? `${row.admin_notes}\n\n---\n\n${noteEntry}` : noteEntry
    const patch = {
      admin_notes: newNotes,
      handled_by: provider.id || row.handled_by,
      handled_by_name: authorName,
    }
    if (row.status === 'new') patch.status = 'in_progress'

    await supabase.from('patient_support_requests').update(patch).eq('id', id)
    return res.status(200).json({ ok: true })
  }

  // List / single get
  if (req.method === 'GET') {
    if (id) {
      const { data, error } = await supabase
        .from('patient_support_requests').select('*').eq('id', id).maybeSingle()
      if (error) return res.status(500).json({ error: error.message })
      if (!data) return res.status(404).json({ error: 'Ticket not found' })
      return res.status(200).json({ ticket: data })
    }
    const { status } = req.query || {}
    let q = supabase
      .from('patient_support_requests')
      .select('id, created_at, updated_at, category, message, patient_name, patient_email, patient_phone, consultation_id, source, status, handled_by_name, resolved_at')
      .order('created_at', { ascending: false })
    if (status) {
      if (!STATUS_ALLOWED.has(status)) return res.status(400).json({ error: 'invalid status filter' })
      q = q.eq('status', status)
    }
    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ tickets: data || [] })
  }

  // Update
  if (req.method === 'PATCH') {
    if (!id) return res.status(400).json({ error: 'id required' })
    const raw = req.body || {}
    const patch = {}
    for (const [k, v] of Object.entries(raw)) {
      if (PATCH_ALLOWLIST.has(k)) patch[k] = v
    }
    if (patch.status && !STATUS_ALLOWED.has(patch.status)) {
      return res.status(400).json({ error: `status "${patch.status}" not allowed` })
    }
    if (patch.status === 'resolved') {
      patch.resolved_at = new Date().toISOString()
      patch.resolved_by = auth.provider?.id || null
    }
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'nothing to update' })
    const { error } = await supabase.from('patient_support_requests').update(patch).eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
