// Post-consult upsell: $10 insurance-formatted PDF receipt.
//
// Shown on PostConsult.jsx (right after the consult) and on
// ConsultationSummary.jsx (later access via /my-consultation/:token).
// Independent of sessionStorage — takes consult + consultationId as props
// so the token-authenticated summary view works too.
//
// Payment flow: reuses /api/create-payment-intent with consultationType:
// 'receipt'. Server sets capture_method=automatic for receipt PIs so the
// $10 charges immediately on confirmation (no manual capture step). On
// success we POST /api/generate-insurance-receipt with the paymentIntentId
// and show "sent to your email".
//
// Windcave path: TODO — see PRICES table comment in _windcave-create-session.js.
// For now the upsell always uses the inline Stripe card element regardless
// of the use_windcave flag, since the receipt is a separate one-off charge.

import React, { useState, useMemo } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { apiFetch } from '../../lib/api'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

const CARD_STYLE = {
  style: {
    base: {
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      fontSize: '15px',
      color: '#1A2A33',
      '::placeholder': { color: '#9CA3AF' },
    },
    invalid: { color: '#DC2626' },
  },
  hidePostalCode: true,
}

function InlinePaymentForm({ consultationId, onPurchased }) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle')  // idle | paying | fulfilling | done

  async function handlePay(e) {
    e.preventDefault()
    if (!stripe || !elements) return
    setLoading(true); setError(''); setStatus('paying')

    try {
      // 1) Create the receipt PaymentIntent server-side. This is a fresh $10
      // charge with capture_method=automatic — see _create-payment-intent.js.
      const piRes = await apiFetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultationId, consultationType: 'receipt', accEligible: 'no' }),
      })
      const piData = await piRes.json()
      if (!piData.clientSecret || !piData.paymentIntentId) {
        throw new Error(piData.error || 'Could not start receipt payment')
      }

      // 2) Confirm the card charge inline.
      const { error: sErr, paymentIntent } = await stripe.confirmCardPayment(
        piData.clientSecret,
        { payment_method: { card: elements.getElement(CardElement) } }
      )
      if (sErr) throw new Error(sErr.message)
      if (paymentIntent.status !== 'succeeded') {
        throw new Error('Payment did not complete — please try again')
      }

      // 3) Fulfil — server verifies the PI, builds the PDF, emails it.
      setStatus('fulfilling')
      const fRes = await apiFetch('/api/generate-insurance-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultationId, paymentIntentId: paymentIntent.id }),
      })
      const fData = await fRes.json()
      if (!fRes.ok || !fData.success) {
        throw new Error(fData.error || 'Receipt generation failed — support has been notified. You have been charged; please email hello@terehealth.co.nz and we will send the receipt manually.')
      }

      setStatus('done')
      onPurchased?.()
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.')
      setStatus('idle')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'done') {
    return (
      <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12, padding:'1rem 1.25rem', color:'#065F46', fontSize:'.9375rem', fontWeight:600 }}>
        Insurance receipt sent to your email — check your inbox in the next minute.
      </div>
    )
  }

  return (
    <form onSubmit={handlePay} style={{ marginTop:'.75rem' }}>
      <div style={{ border:'1.5px solid #E2E8F0', borderRadius:10, padding:'.75rem .875rem', background:'white', marginBottom:'.75rem' }}>
        <CardElement options={CARD_STYLE} />
      </div>
      {error && (
        <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'.625rem .875rem', color:'#991B1B', fontSize:'.8125rem', marginBottom:'.625rem' }}>
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={loading || !stripe}
        style={{
          width:'100%', background:'#0B6E76', color:'white', border:'none',
          padding:'.75rem 1rem', borderRadius:99, fontFamily:'Plus Jakarta Sans, sans-serif',
          fontWeight:700, fontSize:'.9375rem', cursor: loading ? 'default' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {status === 'paying' ? 'Processing payment…'
          : status === 'fulfilling' ? 'Preparing your receipt…'
          : 'Pay $10 and email me the receipt'}
      </button>
      <div style={{ fontSize:'.6875rem', color:'#9CA3AF', marginTop:'.5rem', textAlign:'center' }}>
        Secured by Stripe. Card details never touch Tere servers.
      </div>
    </form>
  )
}

export default function InsuranceReceiptUpsell({ consult, consultationId, onPurchased }) {
  const [showForm, setShowForm] = useState(false)
  const purchased = !!consult?.insurance_receipt_purchased_at

  const elementsOptions = useMemo(() => ({ locale: 'en-NZ' }), [])

  if (purchased) {
    return (
      <div style={{
        marginTop:'1.25rem',
        background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12,
        padding:'1rem 1.25rem', color:'#065F46', fontSize:'.9375rem', fontWeight:600,
        textAlign:'left',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:'.5rem' }}>
          <span style={{ fontSize:'1.125rem' }}>✓</span>
          <span>Insurance receipt sent to your email.</span>
        </div>
        <div style={{ fontSize:'.75rem', color:'#065F46', opacity:.8, marginTop:'.375rem' }}>
          Purchased {new Date(consult.insurance_receipt_purchased_at).toLocaleDateString('en-NZ', { day:'numeric', month:'short', year:'numeric' })}. Not received it? Check spam, then email hello@terehealth.co.nz.
        </div>
      </div>
    )
  }

  return (
    <div style={{
      marginTop:'1.25rem',
      background:'white', border:'1px solid #D4EEF0', borderTop:'4px solid #0B6E76',
      borderRadius:12, padding:'1.25rem 1.25rem', textAlign:'left',
    }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'.75rem', marginBottom:'.5rem' }}>
        <div>
          <div style={{ fontSize:'.9375rem', fontWeight:800, color:'#0D2B45', lineHeight:1.35 }}>
            Need a receipt for insurance?
          </div>
          <div style={{ fontSize:'.8125rem', color:'#374151', marginTop:'.25rem', lineHeight:1.55 }}>
            Get an itemised receipt formatted for your health insurer — emailed as a PDF within a minute.
          </div>
        </div>
        <div style={{ fontSize:'1.375rem', fontWeight:800, color:'#0B6E76', whiteSpace:'nowrap' }}>$10</div>
      </div>

      <ul style={{ margin:'.75rem 0', paddingLeft:'1.125rem', color:'#374151', fontSize:'.8125rem', lineHeight:1.7 }}>
        <li>Tere Health Ltd legal details, IRD and GST numbers</li>
        <li>Clinician name, MCNZ registration number and provider type</li>
        <li>Consultation date, time (NZ), and presenting complaint</li>
        <li>Diagnosis / Read code, itemised charge, payment method</li>
      </ul>

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{
            width:'100%', background:'#0B6E76', color:'white', border:'none',
            padding:'.75rem 1rem', borderRadius:99, fontFamily:'Plus Jakarta Sans, sans-serif',
            fontWeight:700, fontSize:'.9375rem', cursor:'pointer',
          }}
        >
          Get insurance receipt — $10
        </button>
      ) : (
        <Elements stripe={stripePromise} options={elementsOptions}>
          <InlinePaymentForm consultationId={consultationId} onPurchased={onPurchased} />
        </Elements>
      )}
    </div>
  )
}
