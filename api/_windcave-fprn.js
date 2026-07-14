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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Windcave FPRN body — session id lives in various places depending on
  // format. Try the common ones.
  const body = req.body || {}
  const sessionId = body.id || body.sessionId || body.SessionId
    || (req.query?.sessionId) || (req.query?.id)

  if (!sessionId) {
    console.error('[windcave-fprn] no sessionId in payload', { body, query: req.query })
    return res.status(400).json({ error: 'sessionId required' })
  }

  // Query Windcave for the authoritative session state. Never trust the
  // FPRN body's status field directly — this endpoint is anon.
  let sessionData
  try {
    const r = await fetch(`${baseUrl()}/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'Authorization': basicAuth() },
    })
    sessionData = await r.json()
    if (!r.ok) {
      console.error('[windcave-fprn] query session failed:', r.status, sessionData)
      return res.status(502).json({ error: 'Session query failed' })
    }
  } catch (e) {
    console.error('[windcave-fprn] query error:', e.message)
    return res.status(502).json({ error: 'Session query error' })
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
