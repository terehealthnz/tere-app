// _windcave-fprn.js — Fail Proof Result Notification receiver.
//
// POST /api/windcave-fprn
//
// Windcave POSTs here when a session transitions to a terminal state
// (approved / declined / cancelled). This is the reliable outcome signal
// — the browser return callback (/payment-return) is NOT guaranteed to
// fire if the patient closes the tab mid-flow. Always trust FPRN as
// authoritative.
//
// Windcave delivers either JSON (v1 REST) or form-encoded (legacy). We
// handle both — pull sessionId from the body, then Query Session against
// Windcave to get the canonical status. Do NOT trust the FPRN body's
// status field directly (it's a webhook that could be spoofed) — always
// re-query.
//
// This endpoint is anon (Windcave hits it without our auth). Security
// comes from re-querying with our own credentials — even if someone
// spoofed a POST here, they can't fake a real Windcave session status.

import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function basicAuth() {
  return 'Basic ' + Buffer.from(`${process.env.WINDCAVE_USERNAME}:${process.env.WINDCAVE_API_KEY}`).toString('base64')
}

function baseUrl() {
  return process.env.WINDCAVE_BASE_URL || 'https://uat.windcave.com/api/v1'
}

// Parse Windcave FPRN body — they send form-encoded, JSON, or bare query
// string depending on config. handler.js only parses JSON automatically;
// for other content-types req.body arrives as a raw string. Handle all
// three so we never miss an FPRN.
function extractSessionId(req) {
  const q = req.query || {}
  if (q.sessionId) return q.sessionId
  if (q.id)        return q.id

  const body = req.body
  if (!body) return null

  // Already-parsed object (JSON path in handler.js). Prefer `sessionId`
  // over `id` — Windcave's FPRN body uses `id` for the *transaction* id
  // and `sessionId` for the session id; we want the session id for our
  // Query Session follow-up call.
  if (typeof body === 'object') {
    return body.sessionId || body.SessionId || body.session_id || body.id || null
  }

  // Raw string — try to parse as JSON first, then form-encoded
  if (typeof body === 'string') {
    try {
      const j = JSON.parse(body)
      return j.sessionId || j.SessionId || j.session_id || j.id || null
    } catch { /* not JSON */ }
    try {
      const params = new URLSearchParams(body)
      return params.get('sessionId') || params.get('SessionId') || params.get('session_id') || params.get('id')
    } catch { /* not form */ }
  }
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Log raw body + headers unconditionally — helps diagnose Windcave FPRN
  // shape variations. Never store PHI here; sessionId is not PHI.
  console.log(JSON.stringify({
    ts: new Date().toISOString(), type: 'fprn_received',
    contentType: req.headers['content-type'] || null,
    bodyType: typeof req.body,
    bodyPreview: typeof req.body === 'string' ? req.body.slice(0, 500) : req.body,
    query: req.query || null,
  }))

  const sessionId = extractSessionId(req)

  if (!sessionId) {
    // Return 200 anyway — Windcave will otherwise retry endlessly. Log
    // for post-mortem so we can extend extractSessionId() if their
    // payload shape changes.
    console.error('[windcave-fprn] no sessionId in payload — returning 200 to stop retries')
    return res.status(200).json({ ok: true, warning: 'no sessionId found' })
  }

  // Query Windcave for the authoritative session state. Never trust the
  // FPRN body's status field directly — this endpoint is anon. Always
  // return 200 to Windcave regardless of our internal outcome so they
  // stop retrying; we log for post-mortem.
  let sessionData
  try {
    const r = await fetch(`${baseUrl()}/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'Authorization': basicAuth() },
    })
    sessionData = await r.json()
    if (!r.ok) {
      console.error('[windcave-fprn] query session failed:', r.status, sessionData)
      return res.status(200).json({ ok: true, warning: 'session query failed', windcave_status: r.status })
    }
  } catch (e) {
    console.error('[windcave-fprn] query error:', e.message)
    return res.status(200).json({ ok: true, warning: 'session query error', error: e.message })
  }

  const consultationId = sessionData.merchantReference
  const state = sessionData.state
  const approved = state === 'complete' && sessionData.transactions?.some(t => t.responseCode === '00' || t.authorised === true)

  if (!consultationId) {
    console.warn('[windcave-fprn] session has no merchantReference — nothing to update:', sessionId)
    return res.status(200).json({ ok: true, note: 'no consultation reference' })
  }

  const supabase = admin()
  const patch = { payment_intent_id: sessionId }
  if (approved) {
    patch.payment_status = 'authorised'
    patch.payment_authorised_at = new Date().toISOString()
  } else if (state === 'complete' || state === 'expired' || state === 'cancelled') {
    patch.payment_status = 'failed'
  }
  const { error } = await supabase.from('consultations').update(patch).eq('id', consultationId)
  if (error) console.error('[windcave-fprn] consultation update error:', error.message)

  // Always 200 to Windcave so they don't retry indefinitely.
  return res.status(200).json({ ok: true, state, approved, consultationId })
}
