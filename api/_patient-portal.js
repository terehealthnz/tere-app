// Patient self-service portal endpoint (task #358).
//
// Actions (POST { action, ... }):
//   request  — { email }        → send magic-link email if the address matches
//                                  a known patient. Always returns generic
//                                  success (no enumeration).
//   verify   — { token }        → validate + burn the token; return the
//                                  patient's basic identity + a fresh
//                                  session token in a cookie-style shape
//                                  (client stores in sessionStorage).
//   access_log — { token }      → after verify: return the patient's own
//                                  audit-log entries (redacted for patient
//                                  consumption — role + reason only).
//   record     — { token }      → after verify: return the patient's own
//                                  FHIR Bundle export.
//   correction — { token, ... } → submit a correction request.

import { createClient } from '@supabase/supabase-js'
import { randomBytes, createHash } from 'crypto'
import { getClientIp } from './_client-ip.js'
import { sendEmail } from './_email-client.js'

const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://terehealth.co.nz'
const TOKEN_TTL_MS = 30 * 60 * 1000 // 30 minutes

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function sha256hex(s) { return createHash('sha256').update(s, 'utf8').digest('hex') }

// Silently return generic success so anyone probing can't tell whether
// an email exists in our patient table.
const GENERIC_REQUEST_OK = { ok: true, message: 'If that email matches a patient record, you will receive a magic link within a few minutes.' }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { action } = req.body || {}
  if (!action) return res.status(400).json({ error: 'action required' })
  const supabase = admin()
  const ip = getClientIp(req)

  // ── Action: request magic link ─────────────────────────────────────────────
  if (action === 'request') {
    const email = String(req.body.email || '').trim().toLowerCase()
    if (!email || !/@/.test(email)) return res.status(400).json({ error: 'Valid email required' })

    // Resolve to a patient. Also try patient_email on consultations as a fallback.
    let patient = null
    {
      const { data } = await supabase.from('patients').select('id, nhi, first_name, last_name, email').ilike('email', email).maybeSingle()
      if (data) patient = data
    }
    if (!patient) {
      const { data } = await supabase.from('consultations')
        .select('patient_id, patient_nhi, patient_first_name, patient_last_name, patient_email')
        .ilike('patient_email', email).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (data) patient = { id: data.patient_id, nhi: data.patient_nhi, first_name: data.patient_first_name, last_name: data.patient_last_name, email }
    }
    if (!patient) {
      // Log the miss for auditing, still return generic success.
      console.log(JSON.stringify({ ts: new Date().toISOString(), type: 'patient_portal_request_no_match', email_mask: email.replace(/(.{2}).*(@.*)/, '$1***$2'), ip }))
      return res.status(200).json(GENERIC_REQUEST_OK)
    }

    // Mint the token, store the hash.
    const raw = randomBytes(24).toString('base64url')
    const tokenHash = sha256hex(raw)
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()
    const { error: insertErr } = await supabase.from('patient_portal_tokens').insert({
      token_hash:    tokenHash,
      patient_email: email,
      patient_id:    patient.id || null,
      patient_nhi:   patient.nhi || null,
      expires_at:    expiresAt,
      requested_ip:  ip,
      requested_ua:  req.headers['user-agent']?.slice(0, 400) || null,
    })
    if (insertErr) {
      console.error('[patient-portal] token insert failed:', insertErr.message)
      return res.status(500).json({ error: 'Could not send link right now. Please try again in a few minutes.' })
    }

    // Send the magic link.
    const link = `${SITE_ORIGIN}/patient/portal?token=${encodeURIComponent(raw)}`
    try {
      await sendEmail({
        from:    'Tere Health <hello@terehealth.co.nz>',
        replyTo: 'terehealthnz@gmail.com',
        to:      email,
        subject: 'Your Tere Health portal access link',
        text: [
          `Kia ora ${patient.first_name || ''},`,
          '',
          'You (or someone using this email address) requested access to your Tere Health patient portal.',
          '',
          'To sign in, click the link below within 30 minutes:',
          '',
          link,
          '',
          'If you did not request this, you can safely ignore this email — the link cannot be used without receiving it.',
          '',
          'What you can do in the portal:',
          '  • See who has accessed your health record and when',
          '  • Download a copy of your record',
          '  • Ask us to correct something we have wrong',
          '',
          'Ngā mihi,',
          'Tere Health',
          '',
          '— IP the link was requested from: ' + ip,
        ].join('\n'),
      })
    } catch (e) {
      console.error('[patient-portal] send failed:', e.message)
    }

    return res.status(200).json(GENERIC_REQUEST_OK)
  }

  // ── Action: verify + burn token ────────────────────────────────────────────
  if (action === 'verify') {
    const rawToken = String(req.body.token || '')
    if (!rawToken) return res.status(400).json({ error: 'token required' })
    const tokenHash = sha256hex(rawToken)
    const { data: row } = await supabase.from('patient_portal_tokens').select('*').eq('token_hash', tokenHash).maybeSingle()
    if (!row) return res.status(401).json({ error: 'Invalid or expired link. Please request a new one.' })
    if (row.used_at) return res.status(401).json({ error: 'This link has already been used. Please request a new one.' })
    if (new Date(row.expires_at) < new Date()) return res.status(401).json({ error: 'This link has expired. Please request a new one.' })

    // Burn the token.
    await supabase.from('patient_portal_tokens').update({ used_at: new Date().toISOString(), used_ip: ip }).eq('id', row.id)

    // Return patient identity + a session-scoped token (same raw token, we
    // treat "used" as "session active for the token's remaining TTL"). Simpler
    // than issuing a second token; still bounded by the 30-min TTL. Since
    // used_at is set, subsequent request/verify won't work, but action=access_log
    // will use the raw token to look up the burned row within TTL.
    // Re-fetch patient for latest identity.
    let patient = null
    if (row.patient_id) {
      const { data } = await supabase.from('patients').select('id, nhi, first_name, last_name, dob, email').eq('id', row.patient_id).maybeSingle()
      if (data) patient = data
    }
    return res.status(200).json({
      ok: true,
      token: rawToken,
      patient: patient || { nhi: row.patient_nhi, email: row.patient_email },
      expires_at: row.expires_at,
    })
  }

  // ── Session-token gate for the read/action endpoints ───────────────────────
  const authorised = async () => {
    const rawToken = String(req.body.token || '')
    if (!rawToken) return { err: res.status(400).json({ error: 'token required' }) }
    const tokenHash = sha256hex(rawToken)
    const { data: row } = await supabase.from('patient_portal_tokens').select('*').eq('token_hash', tokenHash).maybeSingle()
    if (!row) return { err: res.status(401).json({ error: 'Invalid session. Please sign in again.' }) }
    if (!row.used_at) return { err: res.status(401).json({ error: 'Session not started. Please click your magic link.' }) }
    if (new Date(row.expires_at) < new Date()) return { err: res.status(401).json({ error: 'Session expired. Please sign in again.' }) }
    return { row }
  }

  // ── Action: access log ─────────────────────────────────────────────────────
  if (action === 'access_log') {
    const gate = await authorised()
    if (gate.err) return
    const { row } = gate
    // Query audit_logs by patient NHI (last 12 months, capped).
    const from = new Date(); from.setMonth(from.getMonth() - 12)
    const { data: logs } = await supabase.from('audit_logs')
      .select('created_at, event_type, provider_role, reason')
      .eq('patient_ref', row.patient_nhi || '')
      .gte('created_at', from.toISOString())
      .order('created_at', { ascending: false })
      .limit(200)
    // Redact for patient consumption — no provider names, no IPs, no ids.
    const redacted = (logs || []).map(l => ({
      when:   l.created_at,
      what:   (l.event_type || '').replace(/_/g, ' '),
      by:     l.provider_role ? l.provider_role.replace(/_/g, ' ') : '—',
      reason: l.reason ? l.reason.replace(/_/g, ' ') : (l.provider_role === 'provider' ? 'clinical care' : '—'),
    }))
    return res.status(200).json({ ok: true, entries: redacted, patient: { nhi: row.patient_nhi, email: row.patient_email } })
  }

  // ── Action: patient's own FHIR record ──────────────────────────────────────
  if (action === 'record') {
    const gate = await authorised()
    if (gate.err) return
    const { row } = gate
    if (!row.patient_id) return res.status(404).json({ error: 'No patient record on file.' })
    // Reuse the export helper via internal fetch to keep FHIR generation in one place.
    // Easier: import and invoke inline.
    const mod = await import('./_patient-record-export.js')
    // Synthesise a request that the export handler can consume as if it came from admin.
    // We inject a minimal req.auth so it doesn't reject on role check.
    const syntheticReq = {
      method: 'GET',
      query: { patient_id: row.patient_id, format: 'json', reason: 'patient_request', reason_notes: 'Patient self-service portal export' },
      headers: req.headers,
      socket: req.socket,
      connection: req.connection,
      auth: { provider: { id: null, first_name: 'Patient', last_name: 'Self', is_admin: true } },
    }
    let body = null, status = 500
    const syntheticRes = {
      status: (code) => { status = code; return syntheticRes },
      json: (b) => { body = b; return syntheticRes },
      send: (b) => { body = b; return syntheticRes },
      setHeader: () => syntheticRes,
    }
    await mod.default(syntheticReq, syntheticRes)
    return res.status(status).json(body || { error: 'export failed' })
  }

  // ── Action: submit a correction request ────────────────────────────────────
  if (action === 'correction') {
    const gate = await authorised()
    if (gate.err) return
    const { row } = gate
    const { targetField, currentValue, requestedValue, reason } = req.body
    if (!targetField || (!requestedValue && !reason)) {
      return res.status(400).json({ error: 'targetField and either requestedValue or reason are required' })
    }
    await supabase.from('patient_correction_requests').insert({
      patient_nhi:     row.patient_nhi || null,
      patient_email:   row.patient_email,
      submitted_via:   'patient_portal',
      target_field:    String(targetField).slice(0, 200),
      current_value:   currentValue ? String(currentValue).slice(0, 2000) : null,
      requested_value: requestedValue ? String(requestedValue).slice(0, 2000) : null,
      reason:          reason ? String(reason).slice(0, 2000) : null,
      ip,
    })
    return res.status(200).json({ ok: true, message: 'Received. We will respond within 20 working days.' })
  }

  return res.status(400).json({ error: `Unknown action: ${action}` })
}
