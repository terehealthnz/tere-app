// POST /api/capture-payment  — provider captures an authorised Stripe hold.
//
// Called by ConsultView + ProviderNotes at sign-off. Auth: provider (via
// AUTH_REQUIRED_ROUTES → guardProvider at the router). Additional guard:
// verify the consultation exists and either belongs to the caller or the
// caller is an admin / supervisor. Prevents provider A from capturing
// arbitrary paymentIntents belonging to provider B's patients.

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY) }

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const auth = await guardProvider(req, res)
  if (!auth) return

  const { paymentIntentId, consultationId, amount_cents } = req.body || {}
  if (!paymentIntentId) return res.status(400).json({ error: 'paymentIntentId required' })
  if (!consultationId)  return res.status(400).json({ error: 'consultationId required' })

  const supabase = admin()

  // Verify consult exists AND the caller is entitled to capture on it.
  const { data: consult, error: cErr } = await supabase
    .from('consultations')
    .select('id, provider_id, payment_intent_id, status, payment_amount_nzd')
    .eq('id', consultationId)
    .maybeSingle()
  if (cErr) {
    console.error('[capture-payment] consult lookup failed:', cErr.message)
    return res.status(500).json({ error: 'Internal error' })
  }
  if (!consult) return res.status(404).json({ error: 'Consultation not found' })

  // Refuse if the consult is in a non-capturable state — no_show or cancelled
  // consults should not have their hold captured (blocks the race where
  // encounter-action flips status while capture is in flight).
  if (consult.status === 'no_show' || consult.status === 'cancelled') {
    return res.status(409).json({ error: `Payment cannot be captured on a ${consult.status} consultation.` })
  }
  // Idempotency guard — if payment_amount_nzd is already set, capture
  // has already run. Return the existing amount instead of double-billing.
  if (consult.payment_amount_nzd != null) {
    return res.status(200).json({ status: 'already_captured', amount_nzd: consult.payment_amount_nzd })
  }

  // Ownership: consult must be assigned to caller, unclaimed, or the caller
  // must be admin/supervisor. Admin/supervisor need to be able to capture
  // on any consult (e.g. covering for a provider mid-shift).
  const isPrivileged = auth.provider.is_admin || auth.provider.is_supervisor
  const owns = consult.provider_id === auth.provider.id || consult.provider_id == null
  if (!isPrivileged && !owns) {
    return res.status(403).json({ error: 'Not authorised to capture this consultation.' })
  }

  // Sanity: the paymentIntentId being captured must match the one attached
  // to the consult — blocks a legit provider from being tricked into
  // capturing an unrelated intent.
  if (consult.payment_intent_id && consult.payment_intent_id !== paymentIntentId) {
    return res.status(400).json({ error: 'paymentIntentId does not match this consultation.' })
  }

  try {
    // Idempotency key = paymentIntentId — Stripe returns the same result
    // for repeated calls with the same key rather than double-capturing.
    const captureOpts = amount_cents ? { amount_to_capture: amount_cents } : undefined
    const intent = await getStripe().paymentIntents.capture(
      paymentIntentId,
      captureOpts,
      { idempotencyKey: `capture:${paymentIntentId}` },
    )

    if (intent.amount_received > 0) {
      try {
        await supabase.from('consultations')
          .update({ payment_amount_nzd: intent.amount_received / 100 })
          .eq('id', consultationId)
      } catch {}
    }

    return res.status(200).json({ status: intent.status, amount_nzd: intent.amount_received / 100 })
  } catch (e) {
    console.error('[capture-payment]', e?.message || e)
    return res.status(500).json({ error: 'Payment capture failed.' })
  }
}
