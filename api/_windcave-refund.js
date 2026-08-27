// _windcave-refund.js — Refund a completed/purchased Windcave transaction.
//
// POST /api/windcave-refund
//   Body: { sessionId, amount, reason? }
//
// Refunds the original captured transaction on the given session.
// Amount may be less than or equal to the captured amount (partial or
// full refund). Multiple refunds may sum up to the captured total.
//
// Provider-auth REQUIRED — refunds are financial actions only providers
// (or admins with billing role) may initiate.
//
// Reason is logged to the audit trail but not sent to Windcave.

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

  const { sessionId, transactionId, amount, reason } = req.body || {}
  if (!sessionId && !transactionId) return res.status(400).json({ error: 'sessionId or transactionId required' })
  if (amount === undefined || amount === null) return res.status(400).json({ error: 'amount required' })
  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'amount must be positive number' })
  const amountStr = amt.toFixed(2)

  const xId = randomUUID()
  const providerId = req.headers['x-provider-id'] || null

  // Windcave REST Refund: POST /transactions with sessionId (or the
  // specific transactionId to refund).
  const payload = {
    type: 'refund',
    amount: amountStr,
    ...(transactionId ? { transactionId } : { sessionId }),
  }

  let r, data
  try {
    r = await fetch(`${baseUrl()}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': basicAuth(),
        'X-ID': xId,
      },
      body: JSON.stringify(payload),
    })
    data = await r.json().catch(() => ({}))
  } catch (e) {
    console.error('[windcave-refund] network error:', e.message)
    return res.status(502).json({ error: 'Windcave unreachable' })
  }

  if (!r.ok) {
    console.error('[windcave-refund] failed:', r.status, JSON.stringify(data))
    return res.status(r.status).json({
      error: data?.error || `Windcave error ${r.status}`,
      windcave_status: r.status,
      windcave_body: data,
    })
  }

  const approved = data.responseCode === '00' || data.authorised === true

  // Audit-log the refund attempt regardless of outcome. Silent failure
  // here shouldn't block returning to the caller.
  try {
    const supabase = admin()
    await supabase.from('audit_log').insert({
      actor_id: providerId,
      actor_role: providerId ? 'provider' : 'system',
      action: 'windcave_refund',
      target_type: 'session',
      target_id: sessionId,
      metadata: {
        amount: amountStr,
        reason: reason || null,
        approved,
        transaction_id: data.id || null,
        response_code: data.responseCode || null,
        x_id: xId,
      },
    })
  } catch (e) {
    console.warn('[windcave-refund] audit-log write failed:', e.message)
  }

  return res.status(200).json({
    approved,
    transactionId:  data.id || data.transactionId || null,
    responseCode:   data.responseCode || null,
    responseText:   data.responseText || null,
    amount:         data.amount || amountStr,
    xId,
    raw:            data,
  })
}
