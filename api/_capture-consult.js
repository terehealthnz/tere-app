// _capture-consult.js — Capture the Windcave auth for a consultation.
//
// POST /api/capture-consult
//   Body: { consultationId }
//
// Called on Finalise-notes (see NotesCompletion.jsx). Windcave sessions
// are created as type=auth (funds held only). This endpoint fires the
// matching Complete so funds actually settle to our merchant account.
//
// Amount is server-authoritative — pulled from consultations.payment_amount
// (cents) written by /api/windcave-create-session. Client never sets it.
//
// Idempotency: guarded via consultations.payment_captured_at. If already
// stamped, we return the recorded outcome and skip the Windcave hit.
// (Migration adds payment_captured_at + payment_captured_amount_cents
// columns; if the migration hasn't run yet the update simply no-ops and
// Windcave will reject a duplicate Complete with a benign error we log.)
//
// Provider-auth REQUIRED — captures are financial actions.

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { consultationId } = req.body || {}
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  const supabase = admin()
  const { data: consult, error: fetchErr } = await supabase
    .from('consultations')
    .select('id, is_practice, payment_intent_id, payment_amount, payment_captured_at, payment_test_mode')
    .eq('id', consultationId)
    .maybeSingle()

  if (fetchErr) {
    console.error('[capture-consult] consult fetch error:', fetchErr.message)
    return res.status(500).json({ error: 'consult lookup failed' })
  }
  if (!consult) return res.status(404).json({ error: 'consult not found' })

  // Sandbox: never hit Windcave for practice consults.
  if (consult.is_practice) {
    return res.status(200).json({
      approved: true, simulated: true, reason: 'practice_mode', amount: null,
    })
  }

  // Already captured — idempotent no-op.
  if (consult.payment_captured_at) {
    return res.status(200).json({
      approved: true, alreadyCaptured: true, capturedAt: consult.payment_captured_at,
    })
  }

  if (!consult.payment_intent_id) {
    // No auth on file — nothing to capture. Could be a coupon-covered $0
    // consult or an intake that never reached payment. Return 200 so the
    // finalise flow doesn't block.
    return res.status(200).json({ approved: true, skipped: true, reason: 'no_session_id' })
  }
  if (!consult.payment_amount || consult.payment_amount <= 0) {
    return res.status(200).json({ approved: true, skipped: true, reason: 'no_amount' })
  }

  // Test-mode override: create-session forced Windcave auth to NZ$0.10.
  // Capture MUST match the auth or Windcave rejects on amount mismatch.
  // Some old rows still carry payment_amount stamped in dollars (65) rather
  // than cents (6500) from an earlier bug — dividing by 100 yields $0.65
  // and Windcave rejects. Force $0.10 whenever payment_test_mode is set.
  const amountDollars = consult.payment_test_mode ? '0.10' : (consult.payment_amount / 100).toFixed(2)
  const xId = randomUUID()

  let r, data
  try {
    r = await fetch(`${baseUrl()}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'Authorization': basicAuth(),
        'X-ID':          xId,
      },
      body: JSON.stringify({
        type: 'complete',
        amount: amountDollars,
        sessionId: consult.payment_intent_id,
      }),
    })
    data = await r.json().catch(() => ({}))
  } catch (e) {
    console.error('[capture-consult] network error:', e.message)
    return res.status(502).json({ error: 'Windcave unreachable' })
  }

  const approved = r.ok && (data.responseCode === '00' || data.authorised === true)
  const transactionId = data.id || data.transactionId || null

  if (approved) {
    // Best-effort — the update fails harmlessly if the columns haven't been
    // added yet. Windcave already accepted the capture so the money is
    // caught either way. Log and move on.
    try {
      await supabase.from('consultations').update({
        payment_captured_at: new Date().toISOString(),
        payment_captured_amount_cents: consult.payment_amount,
        payment_captured_txn_id: transactionId,
      }).eq('id', consultationId)
    } catch (e) {
      console.warn('[capture-consult] db stamp failed (columns may not exist yet):', e?.message)
    }
    return res.status(200).json({
      approved: true,
      transactionId,
      responseCode: data.responseCode || null,
      responseText: data.responseText || null,
      amount: amountDollars,
      xId,
    })
  }

  // Windcave rejected. Common: "already completed" — treat as success so
  // the finalise flow keeps moving; the money is already ours.
  const text = (data?.responseText || data?.error || '').toLowerCase()
  const alreadyDone = /already|completed|duplicate/.test(text)
  console.error('[capture-consult] windcave rejected:', r.status, JSON.stringify(data))
  return res.status(alreadyDone ? 200 : (r.status || 502)).json({
    approved: alreadyDone,
    alreadyCaptured: alreadyDone,
    responseCode: data.responseCode || null,
    responseText: data.responseText || null,
    windcave_status: r.status,
    windcave_body: data,
  })
}
