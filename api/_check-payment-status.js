// _check-payment-status.js — pull-based fallback for lost Windcave FPRN.
//
// POST /api/check-payment-status { consultationId }
//
// Called every ~10s by WaitingRoom while a consult sits at status='draft'.
// Queries Windcave directly for the session state — if Windcave says the
// auth completed, we promote draft → waiting immediately (don't wait for
// the FPRN webhook which may have been lost). Closes the gap where an
// authorised patient stays invisible to the queue because the webhook
// never fired.
//
// Anon endpoint — no auth. Patient's client POSTs a consultationId, we
// look up the payment_intent_id on our side, then Query Session against
// Windcave with our own credentials. Server-side dedup: we only promote
// if the consult is still 'draft', so this is idempotent.

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

  const { consultationId } = req.body || {}
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  const supabase = admin()
  const { data: consult, error } = await supabase
    .from('consultations')
    .select('id, status, payment_intent_id, is_practice')
    .eq('id', consultationId)
    .maybeSingle()

  if (error || !consult) return res.status(404).json({ error: 'Consultation not found' })

  // Fast paths — nothing to do if the consult isn't waiting on Windcave.
  if (consult.is_practice) return res.status(200).json({ ok: true, skipped: 'practice_mode' })
  if (consult.status !== 'draft') return res.status(200).json({ ok: true, status: consult.status, promoted: false })
  if (!consult.payment_intent_id) return res.status(200).json({ ok: true, skipped: 'no_payment_intent' })

  // Query Windcave for the authoritative state. Same query the FPRN
  // handler runs — trust Windcave's response, never client claims.
  let sessionData
  try {
    const r = await fetch(`${baseUrl()}/sessions/${encodeURIComponent(consult.payment_intent_id)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'Authorization': basicAuth() },
    })
    sessionData = await r.json()
    if (!r.ok) {
      console.error('[check-payment-status] windcave query failed:', r.status, sessionData)
      return res.status(200).json({ ok: true, promoted: false, warning: 'windcave_query_failed' })
    }
  } catch (e) {
    console.error('[check-payment-status] windcave error:', e.message)
    return res.status(200).json({ ok: true, promoted: false, warning: 'windcave_error' })
  }

  const state = sessionData.state
  const approved = state === 'complete' && sessionData.transactions?.some(t => t.responseCode === '00' || t.authorised === true)

  if (!approved) {
    return res.status(200).json({ ok: true, promoted: false, state })
  }

  // Windcave confirms authorised — promote + stamp payment fields.
  // Filter on status='draft' so we never regress a consult that's already
  // progressed past waiting (idempotent under concurrent FPRN + this call).
  const nowIso = new Date().toISOString()
  const { error: promoteErr, data: updated } = await supabase
    .from('consultations')
    .update({
      status: 'waiting',
      payment_status: 'authorised',
      payment_authorised_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', consultationId)
    .eq('status', 'draft')
    .select('id')

  if (promoteErr) {
    console.error('[check-payment-status] promotion failed:', promoteErr.message)
    return res.status(500).json({ error: 'promotion_failed' })
  }

  const promoted = (updated || []).length > 0
  return res.status(200).json({ ok: true, promoted, state })
}
