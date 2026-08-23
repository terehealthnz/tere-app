// POST /api/cancel-payment — cancel an uncaptured Stripe hold.
//
// Called by patient WaitingRoom when the patient abandons the flow.
// Stays anonymous (patient may not have any credential mid-triage) but
// guards against random paymentIntentId spam by requiring the intent id
// be attached to an existing consultation. Prevents an attacker who
// somehow learns a paymentIntentId from cancelling arbitrary held funds.

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

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
  const { paymentIntentId } = req.body || {}
  if (!paymentIntentId) return res.status(400).json({ error: 'paymentIntentId required' })

  const supabase = admin()

  // Refuse to cancel intents that don't map to a consultation on this
  // system. Blocks blind cancel-spam against valid Stripe intents that
  // belong to a different tenant or that leaked from another integration.
  const { data: consult } = await supabase
    .from('consultations')
    .select('id, status, payment_intent_id')
    .eq('payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (!consult) return res.status(404).json({ error: 'No consultation found for this payment intent.' })

  // Once the encounter is underway or complete, only providers should be
  // cancelling — refuse the patient-flow anonymous cancel. In practice this
  // prevents a patient hitting back → cancel after the provider has picked
  // up the consult.
  const CANCELLABLE_STATUSES = new Set([
    'pre_triage', 'draft', 'waiting', 'waitlisted', 'vitals_requested', 'vitals_complete',
  ])
  if (!CANCELLABLE_STATUSES.has(consult.status)) {
    return res.status(409).json({ error: 'Payment cannot be cancelled at this stage of the consultation.' })
  }

  try {
    const intent = await getStripe().paymentIntents.cancel(paymentIntentId)
    return res.status(200).json({ status: intent.status })
  } catch (e) {
    console.error('[cancel-payment]', e?.message || e)
    return res.status(500).json({ error: 'Payment cancellation failed.' })
  }
}
