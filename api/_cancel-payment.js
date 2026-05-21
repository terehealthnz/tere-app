import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { paymentIntentId } = req.body
  try {
    const intent = await stripe.paymentIntents.cancel(paymentIntentId)
    res.status(200).json({ status: intent.status })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
