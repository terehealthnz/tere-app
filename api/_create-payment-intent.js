import Stripe from 'stripe'

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY) }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { consultationId, accEligible, consultationType, couponDiscount } = req.body
  const type = consultationType || 'consult'
  const isAcc = accEligible === 'yes'
  // Flat pricing — 'consult' replaces the video/phone split. Legacy
  // 'video'/'phone' rows resolve to the same $60. Message stays $25 as an
  // async product.
  //
  // ACC-eligible consults: patient pays a $20 administrative co-payment
  // covering platform access, prescription/referral processing, and
  // after-hours availability — items outside the scope of the ACC MST1/
  // MST3 schedule fee. ACC is separately billed the full specialist rate
  // (MST1 $96.38 initial / MST3 $48.20 follow-up) via _acc-claims.js.
  //
  // Why a co-pay at all: ACC settles invoices on a 30-60 day cycle. The
  // $20 patient card charge settles in 1-2 business days, meaning every
  // consult generates immediate provider payment regardless of the ACC
  // clearing lag. Cash flow for the provider is the primary rationale;
  // the admin work being paid for is real and disclosed to the patient
  // at booking.
  const PRICES = {
    consult: { private: 6000, acc: 2000 },
    video:   { private: 6000, acc: 2000 },
    phone:   { private: 6000, acc: 2000 },
    message: { private: 2500, acc: 2500 },
    // Post-consult upsell: $10 for the insurance-formatted itemised PDF
    // receipt. Fulfilled by /api/generate-insurance-receipt after payment
    // settles. Not ACC-billable (a receipt isn't a health service).
    receipt: { private: 1000, acc: 1000 },
  }
  const baseAmount = (PRICES[type] || PRICES.consult)[isAcc && type !== 'message' ? 'acc' : 'private']
  const discountCents = Math.max(0, Math.min(Number(couponDiscount || 0) * 100, baseAmount - 100))
  const amount = baseAmount - discountCents
  const label = `$${amount / 100}.00`

  try {
    // Receipt upsell is captured immediately — no clinical workflow to gate
    // it behind. Every other consultation type is a manual hold that the
    // provider captures at sign-off after they know the actual method used.
    const isReceipt = type === 'receipt'
    const paymentIntent = await getStripe().paymentIntents.create({
      amount,
      currency: 'nzd',
      capture_method: isReceipt ? 'automatic' : 'manual',
      metadata: { consultationId, accEligible, consultationType: type },
      description: isReceipt
        ? `Tere Health — insurance receipt (${label})`
        : `Tere Health — ${type} consultation ${isAcc ? `ACC co-payment (${label})` : `(${label})`}`,
    })

    // Save payment intent ID to Supabase. For the receipt upsell we do NOT
    // overwrite payment_intent_id on the consultation — that column belongs
    // to the consult charge itself and would break capture at sign-off.
    if (!isReceipt) {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.VITE_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
      )
      await supabase.from('consultations')
        .update({ payment_intent_id: paymentIntent.id, payment_amount: amount })
        .eq('id', consultationId)
    }

    res.status(200).json({ clientSecret: paymentIntent.client_secret, amount, paymentIntentId: paymentIntent.id })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
