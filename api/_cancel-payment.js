// POST /api/cancel-payment — cancel an uncaptured card hold.
//
// Called by patient WaitingRoom when the patient abandons the flow.
// Stays anonymous (patient may not have any credential mid-triage) but
// guards against random paymentIntentId spam by requiring the intent id
// be attached to an existing consultation. Prevents an attacker who
// somehow learns a paymentIntentId from cancelling arbitrary held funds.
//
// Dispatch: paymentIntentId shape decides processor.
//   - Stripe:   'pi_...'  → Stripe SDK cancel
//   - Windcave: UUID       → Windcave refund/void (releases the auth)
// See _payment-release.js for the shared helper.

import { createClient } from '@supabase/supabase-js'
import { releaseHold } from './_payment-release.js'

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
    .select('id, status, payment_intent_id, payment_amount, payment_amount_nzd')
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

  // Windcave voids need the original auth amount in cents. Stripe ignores.
  // payment_amount is stored in cents by _windcave-create-session.js.
  const amountCents = Number(consult.payment_amount) || null

  const result = await releaseHold(paymentIntentId, amountCents)
  if (!result.ok) {
    console.error('[cancel-payment]', result.provider, result.message)
    return res.status(500).json({ error: 'Payment cancellation failed.', detail: result.message })
  }
  return res.status(200).json({ status: 'cancelled', provider: result.provider })
}
