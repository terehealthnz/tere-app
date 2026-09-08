// api/record-forward — patient-driven GP record-forward flow.
//
// POST action=create — patient submits form from /portal/forward-records/:id.
//   Ownership check: consultation_id from URL must exist and belong to a
//   patient whose email matches an active consult record. This is looser
//   than a signed token but the risk surface is limited — attacker gains
//   the ability to send that patient's records to an attacker-controlled
//   GP email, so we email the PATIENT a confirmation of what was sent
//   (belt-and-braces).
//
// POST action=list  — admin queue of pending requests (guardProvider + admin).
// POST action=fulfil — admin marks a request as sent; triggers
//   /api/send-to-gp with the compiled consult data.
// POST action=decline — admin rejects (with note).

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'
import { sendEmail, hasEmailProvider } from './_email-client.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { action } = req.body || {}
  const supabase = admin()

  // ── Patient submission (no auth; ownership via consultation_id + email) ──
  if (action === 'create') {
    const { consultationId, gpName, gpPractice, gpEmail, patientNote, confirmEmail } = req.body || {}
    if (!consultationId || !gpName?.trim() || !gpEmail?.trim() || !confirmEmail?.trim()) {
      return res.status(400).json({ error: 'consultationId, gpName, gpEmail, confirmEmail required' })
    }
    // Lookup consult + patient. Ownership: confirmEmail must match the
    // patient_email on the consult row. Case-insensitive.
    const { data: consult, error } = await supabase
      .from('consultations')
      .select('id, patient_id, patient_email, patient_first_name, patient_last_name, patient_nhi')
      .eq('id', consultationId).maybeSingle()
    if (error || !consult) return res.status(404).json({ error: 'Consultation not found' })
    const patientEmailLc = (consult.patient_email || '').toLowerCase().trim()
    const confirmLc = confirmEmail.toLowerCase().trim()
    if (!patientEmailLc || patientEmailLc !== confirmLc) {
      return res.status(403).json({ error: 'Email does not match the consultation record' })
    }
    // Insert the request. Duplicate submissions land as separate rows —
    // admin can decline dupes. Keeps the flow simple + auditable.
    const { data: created, error: iErr } = await supabase.from('record_forward_requests').insert({
      consultation_id: consultationId,
      patient_id:      consult.patient_id,
      patient_name:    `${consult.patient_first_name || ''} ${consult.patient_last_name || ''}`.trim() || null,
      patient_email:   consult.patient_email,
      patient_nhi:     consult.patient_nhi || null,
      gp_name:         gpName.trim(),
      gp_practice:     (gpPractice || '').trim() || null,
      gp_email:        gpEmail.trim(),
      patient_note:    (patientNote || '').trim() || null,
    }).select().single()
    if (iErr) { console.error('[record-forward] insert failed:', iErr); return res.status(500).json({ error: 'Server error' }) }

    // Confirmation email to the PATIENT (not the GP) — tells them what
    // they just requested + gives them a way to flag it if it wasn't them.
    if (hasEmailProvider() && consult.patient_email) {
      try {
        await sendEmail({
          from: 'Tere Health <hello@terehealth.co.nz>',
          replyTo: 'terehealthnz@gmail.com',
          to: [consult.patient_email],
          subject: 'Record-forward request received — Tere Health',
          text: `Kia ora ${consult.patient_first_name || ''},\n\nWe've received your request to forward your Tere Health records to:\n\n${gpName}${gpPractice ? ' — ' + gpPractice : ''}\n${gpEmail}\n\nOur admin team will action this within 1-2 working days. You'll get another email once it's sent.\n\nIf this wasn't you, please reply to this email or call 0800 TERE HEALTH straight away.\n\nTere Health\nterehealth.co.nz`,
        })
      } catch (e) { console.error('[record-forward] confirmation email failed:', e.message) }
    }

    return res.status(200).json({ ok: true, requestId: created.id })
  }

  // ── Admin surfaces (guardProvider) ──
  const auth = await guardProvider(req, res)
  if (!auth) return

  if (action === 'list') {
    const { status = 'pending' } = req.body || {}
    const { data, error } = await supabase.from('record_forward_requests')
      .select('*').eq('status', status).order('created_at', { ascending: true })
    if (error) { console.error('[record-forward] list failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ requests: data || [] })
  }

  if (action === 'fulfil') {
    const { requestId, adminNotes } = req.body || {}
    if (!requestId) return res.status(400).json({ error: 'requestId required' })
    const { data: reqRow, error: rErr } = await supabase.from('record_forward_requests')
      .select('*').eq('id', requestId).maybeSingle()
    if (rErr || !reqRow) return res.status(404).json({ error: 'Request not found' })
    if (reqRow.status !== 'pending') return res.status(409).json({ error: `Already ${reqRow.status}` })

    // Compile the record from the consult + fire /api/send-to-gp via
    // internal helper (same email path used for finalise auto-send).
    // We keep it simple: forward the most recent consult tied to this
    // patient; admin can extend to bundle multiple in a follow-up.
    let noteContent = {}
    let consultationDate = reqRow.created_at
    let providerName = ''
    let chiefComplaint = ''
    if (reqRow.consultation_id) {
      const { data: c } = await supabase.from('consultations')
        .select('created_at, started_at, provider_display_name, chief_complaint, notes_final')
        .eq('id', reqRow.consultation_id).maybeSingle()
      if (c) {
        consultationDate = c.started_at || c.created_at
        providerName = c.provider_display_name || ''
        chiefComplaint = c.chief_complaint || ''
        try { noteContent = JSON.parse(c.notes_final || '{}') } catch {}
      }
    }

    // Fire /api/send-to-gp via internal fetch — reuses the same GP letter
    // template + audit + disclosure logging as the finalise auto-send.
    const APP_URL = process.env.VITE_APP_URL || 'https://terehealth.co.nz'
    let sendOk = false
    let sendError = null
    try {
      const r = await fetch(`${APP_URL}/api/send-to-gp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-token': process.env.INTERNAL_API_TOKEN || '' },
        body: JSON.stringify({
          consultationId: reqRow.consultation_id,
          gpName: reqRow.gp_name,
          gpEmail: reqRow.gp_email,
          patientName: reqRow.patient_name,
          patientNhi: reqRow.patient_nhi,
          consultationDate,
          providerName,
          providerCredentials: '',
          chiefComplaint,
          noteContent,
        }),
      })
      sendOk = r.ok
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        sendError = j.error || `status ${r.status}`
      }
    } catch (e) {
      sendError = e.message
    }

    if (!sendOk) {
      return res.status(500).json({ error: `Send failed: ${sendError}` })
    }

    const { error: uErr } = await supabase.from('record_forward_requests').update({
      status: 'sent',
      fulfilled_at: new Date().toISOString(),
      fulfilled_by: auth.provider.id,
      admin_notes: (adminNotes || '').trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', requestId)
    if (uErr) { console.error('[record-forward] update failed:', uErr); return res.status(500).json({ error: 'Update failed after send' }) }
    return res.status(200).json({ ok: true })
  }

  if (action === 'decline') {
    const { requestId, adminNotes } = req.body || {}
    if (!requestId) return res.status(400).json({ error: 'requestId required' })
    const { error } = await supabase.from('record_forward_requests').update({
      status: 'declined',
      fulfilled_at: new Date().toISOString(),
      fulfilled_by: auth.provider.id,
      admin_notes: (adminNotes || '').trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', requestId).eq('status', 'pending')
    if (error) { console.error('[record-forward] decline failed:', error); return res.status(500).json({ error: 'Server error' }) }
    return res.status(200).json({ ok: true })
  }

  return res.status(400).json({ error: 'Invalid action' })
}
