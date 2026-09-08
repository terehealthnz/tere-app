// GET /api/billing-country?consultationId=... — returns the patient's
// card-billing country (ISO-2, e.g. "NZ", "AU", "US") for a consult.
//
// Purpose: auto-detect fee tier at Complete Encounter time so the provider
// doesn't have to make the NZ-resident-vs-International call themselves.
// Cached on the consultation row after first lookup.

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
  if (req.method !== 'GET') return res.status(405).end()
  const auth = await guardProvider(req, res)
  if (!auth) return

  const consultationId = req.query.consultationId
  if (!consultationId) return res.status(400).json({ error: 'consultationId required' })

  const supabase = admin()
  const { data: consult, error } = await supabase
    .from('consultations')
    .select('id, payment_intent_id, patient_billing_country')
    .eq('id', consultationId).maybeSingle()
  if (error) return res.status(500).json({ error: 'Internal error' })
  if (!consult) return res.status(404).json({ error: 'Consultation not found' })

  // Cache hit — no need to call Stripe.
  if (consult.patient_billing_country) {
    return res.status(200).json({ country: consult.patient_billing_country, source: 'cache' })
  }
  if (!consult.payment_intent_id) {
    return res.status(200).json({ country: null, source: 'no_payment_intent' })
  }

  try {
    const pi = await getStripe().paymentIntents.retrieve(consult.payment_intent_id, {
      expand: ['latest_charge', 'payment_method'],
    })
    // Prefer the settled charge's billing_details (most authoritative after
    // capture), fall back to the attached payment method's billing_details
    // (available pre-capture as soon as patient confirms the card).
    const country =
      pi.latest_charge?.billing_details?.address?.country ||
      pi.payment_method?.billing_details?.address?.country ||
      pi.payment_method?.card?.country ||
      null
    if (country) {
      try {
        await supabase.from('consultations')
          .update({ patient_billing_country: country })
          .eq('id', consultationId)
      } catch {}
    }
    return res.status(200).json({ country, source: country ? 'stripe' : 'missing' })
  } catch (e) {
    console.error('[billing-country]', e?.message || e)
    return res.status(500).json({ error: 'Stripe lookup failed' })
  }
}
