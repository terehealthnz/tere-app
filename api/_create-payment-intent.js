import Stripe from 'stripe'
import { detectNzAddress } from '../src/lib/nzAddress.js'

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
  // ACC-eligible consults: patient pays a $25 administrative co-payment
  // covering platform access, prescription/referral processing, and
  // after-hours availability — items outside the scope of the ACC MST1/
  // MST3 schedule fee. ACC is separately billed the full specialist rate
  // (MST1 $96.38 initial / MST3 $48.20 follow-up) via _acc-claims.js.
  //
  // Why a co-pay at all: ACC settles invoices on a 30-60 day cycle. The
  // $25 patient card charge settles in 1-2 business days, meaning every
  // consult generates immediate provider payment regardless of the ACC
  // clearing lag. Cash flow for the provider is the primary rationale;
  // the admin work being paid for is real and disclosed to the patient
  // at booking.
  const PRICES = {
    // international tier applies when the patient's billing address country
    // is not NZ (typically tourists / visitors physically in NZ). See
    // Payment.jsx — the country dropdown flips isInternational for us.
    // Without this tier the payment intent silently fails with an undefined
    // amount when isInternational=true.
    consult: { private: 6500, acc: 2500, international: 10000 },
    video:   { private: 6500, acc: 2500, international: 10000 },
    phone:   { private: 6500, acc: 2500, international: 10000 },
    message: { private: 2500, acc: 2500, international: 4000  },
    // Post-consult upsell: $10 for the insurance-formatted itemised PDF
    // receipt. Fulfilled by /api/generate-insurance-receipt after payment
    // settles. Not ACC-billable (a receipt isn't a health service).
    receipt: { private: 1000, acc: 1000, international: 1000 },
  }
  // Authoritative NZ-vs-international decision. Client sends isInternational
  // based on the billing-country dropdown, but a patient could pick 'NZ'
  // while their home address is Sydney → we'd otherwise silently apply
  // the local rate. Cross-check against consultations.patient_address:
  //   - address clearly NZ  → force NZ rate (ignore client isInternational=true)
  //   - address clearly non-NZ → force international rate (ignore client=false)
  //   - address ambiguous / missing → trust client's dropdown selection
  // ACC eligibility still applies where relevant (tourists injured in NZ
  // are ACC-covered at the standard rate — that's flagged at triage).
  let isIntl = req.body?.isInternational === true
  let priceOverrideReason = null
  if (consultationId) {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(
        process.env.VITE_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY,
      )
      const { data: consult } = await sb.from('consultations')
        .select('patient_address').eq('id', consultationId).maybeSingle()
      const detected = detectNzAddress(consult?.patient_address || '')
      if (detected.nz === true && isIntl) {
        isIntl = false
        priceOverrideReason = `address-nz:${detected.reason}${detected.hit ? ':' + detected.hit : ''}`
      } else if (detected.nz === false && !isIntl && !isAcc) {
        isIntl = true
        priceOverrideReason = `address-foreign:${detected.reason}${detected.hit ? ':' + detected.hit : ''}`
      }
    } catch (e) {
      console.error('[create-payment-intent] address-check failed (non-fatal):', e?.message || e)
    }
  }
  const tier = isIntl ? 'international' : (isAcc && type !== 'message' ? 'acc' : 'private')
  if (priceOverrideReason) {
    console.log(`[create-payment-intent] price override applied: ${priceOverrideReason}, final tier=${tier}, consult=${consultationId}`)
  }
  const baseAmount = (PRICES[type] || PRICES.consult)[tier]
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
      // Stripe metadata: consultationId retained for webhook lookup (needed
      // to reconcile paymentIntent → consult on the receive side). accEligible
      // dropped — PHI-adjacent signal (identifies work-injury / ACC claims)
      // and Stripe stores/exports metadata to their dashboard + retention
      // pipeline. Pen test 2026-08-23 M-7. consultationType kept because
      // it's a non-PHI product SKU indicator.
      metadata: { consultationId, consultationType: type },
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
    console.error('[create-payment-intent] failed:', e)
    res.status(500).json({ error: 'Server error' })
  }
}
