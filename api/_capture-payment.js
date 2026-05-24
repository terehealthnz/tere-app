import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { paymentIntentId, consultationId } = req.body
  try {
    const intent = await stripe.paymentIntents.capture(paymentIntentId)

    // Store the captured amount in the consultation for revenue reporting
    if (consultationId && intent.amount_received > 0) {
      try {
        const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
        await supabase.from('consultations')
          .update({ payment_amount_nzd: intent.amount_received / 100 })
          .eq('id', consultationId)
      } catch {}
    }

    res.status(200).json({ status: intent.status, amount_nzd: intent.amount_received / 100 })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
