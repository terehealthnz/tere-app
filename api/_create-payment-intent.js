import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { consultationId, accEligible, consultationType, couponDiscount } = req.body
  const type = consultationType || 'video'
  const isAcc = accEligible === 'yes'
  const PRICES = {
    video:   { private: 6500, acc: 2500 },
    phone:   { private: 4500, acc: 2500 },
    message: { private: 2500, acc: 2500 },
  }
  const baseAmount = (PRICES[type] || PRICES.video)[isAcc && type !== 'message' ? 'acc' : 'private']
  const discountCents = Math.max(0, Math.min(Number(couponDiscount || 0) * 100, baseAmount - 100))
  const amount = baseAmount - discountCents
  const label = `$${amount / 100}.00`

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'nzd',
      capture_method: 'manual',
      metadata: { consultationId, accEligible, consultationType: type },
      description: `Tere Health — ${type} consultation ${isAcc ? `ACC co-payment (${label})` : `(${label})`}`,
    })

    // Save payment intent ID to Supabase
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    )
    await supabase.from('consultations')
      .update({ payment_intent_id: paymentIntent.id, payment_amount: amount })
      .eq('id', consultationId)

    res.status(200).json({ clientSecret: paymentIntent.client_secret, amount })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
