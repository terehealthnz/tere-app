// _cron-promote-stuck-drafts.js — server-side FPRN fallback.
//
// Every 60s (see vercel.json crons config). Finds consults where:
//   - status='draft' (never promoted to waiting)
//   - payment_intent_id is set (patient opened Windcave iframe)
//   - created_at > 2 min ago (long enough for the normal FPRN path)
//   - is_practice=false (never touch sandbox rows)
//
// For each, query Windcave for the authoritative session state. If
// Windcave says the auth completed, promote draft → waiting + stamp
// payment_status='authorised'. Same logic as /api/check-payment-status
// but server-driven — catches patients who closed their tab or lost
// connectivity before their client could poll.
//
// Filter on status='draft' at the UPDATE step so this is idempotent
// under concurrent FPRN + client-poll — whichever wins first, the
// others just no-op.
//
// GET /api/_cron-promote-stuck-drafts (via CRON_SECRET header)

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

async function queryWindcaveApproved(sessionId) {
  try {
    const r = await fetch(`${baseUrl()}/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'Authorization': basicAuth() },
    })
    if (!r.ok) return { approved: false, state: null, error: `windcave_${r.status}` }
    const data = await r.json()
    const state = data.state
    const approved = state === 'complete' && data.transactions?.some(t => t.responseCode === '00' || t.authorised === true)
    return { approved, state }
  } catch (e) {
    return { approved: false, state: null, error: e.message }
  }
}

export default async function handler(req, res) {
  const { verifyCronSecret } = await import('./_cron-auth.js')
  if (!verifyCronSecret(req)) return res.status(404).json({ error: 'Not found' })

  const supabase = admin()

  // 2-min lower bound gives the normal FPRN + client-poll paths first crack.
  // 30-min upper bound stops us wasting Windcave calls on genuinely dead
  // sessions (HPP timed out ~15min ago, patient walked away — the
  // client-side "stuck" alert has already fired for those).
  const now = Date.now()
  const cutoffLower = new Date(now - 2 * 60 * 1000).toISOString()
  const cutoffUpper = new Date(now - 30 * 60 * 1000).toISOString()

  const { data: drafts, error: selectErr } = await supabase
    .from('consultations')
    .select('id, payment_intent_id, created_at')
    .eq('status', 'draft')
    .eq('is_practice', false)
    .not('payment_intent_id', 'is', null)
    .lt('created_at', cutoffLower)
    .gt('created_at', cutoffUpper)
    .limit(50)

  if (selectErr) {
    console.error('[cron-promote-stuck-drafts] select failed:', selectErr.message)
    return res.status(500).json({ error: 'select_failed' })
  }
  if (!drafts?.length) return res.status(200).json({ ok: true, checked: 0, promoted: 0 })

  const results = []
  for (const consult of drafts) {
    const { approved, state, error } = await queryWindcaveApproved(consult.payment_intent_id)
    if (!approved) {
      results.push({ id: consult.id, promoted: false, state: state || 'unknown', error: error || null })
      continue
    }
    const nowIso = new Date().toISOString()
    const { error: promoteErr, data: updated } = await supabase
      .from('consultations')
      .update({
        status: 'waiting',
        payment_status: 'authorised',
        payment_authorised_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', consult.id)
      .eq('status', 'draft')
      .select('id')
    if (promoteErr) {
      console.error('[cron-promote-stuck-drafts] promote failed:', consult.id, promoteErr.message)
      results.push({ id: consult.id, promoted: false, error: promoteErr.message })
    } else {
      results.push({ id: consult.id, promoted: (updated || []).length > 0, state })
    }
  }

  const promotedCount = results.filter(r => r.promoted).length
  return res.status(200).json({ ok: true, checked: drafts.length, promoted: promotedCount, results })
}
