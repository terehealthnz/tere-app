import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { apiFetch } from '../../lib/api'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

const CARD_STYLE = {
  style: {
    base: {
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      fontSize: '16px',
      color: '#1A2A33',
      '::placeholder': { color: '#9CA3AF' },
    },
    invalid: { color: '#DC2626' },
  },
  // NZ postcodes are 4 digits — set country so Stripe validates accordingly
  value: { postalCode: '' },
}

const STRIPE_OPTIONS = { locale: 'en-NZ' }

function PaymentForm({ consultationId, accEligible, consultationType }) {
  const navigate   = useNavigate()
  const stripe     = useStripe()
  const elements   = useElements()
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [clientSecret, setClientSecret] = useState(null)
  const storedAmount = parseInt(sessionStorage.getItem('paymentAmount') || '0', 10)
  const PRICES = { video: { private: 55, acc: 25 }, phone: { private: 55, acc: 25 } }
  const priceSet = PRICES[consultationType] || PRICES.video
  const amount = storedAmount || (accEligible === 'yes' ? priceSet.acc : priceSet.private)

  useEffect(() => {
    async function createIntent() {
      const res = await apiFetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultationId, accEligible, consultationType })
      })
      const data = await res.json()
      if (data.clientSecret) setClientSecret(data.clientSecret)
      else setError('Could not initialise payment. Please try again.')
    }
    if (consultationId) createIntent()
  }, [consultationId, accEligible])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!stripe || !elements || !clientSecret) return
    setLoading(true)
    setError('')
    const card = elements.getElement(CardElement)
    const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
      clientSecret,
      { payment_method: { card } }
    )
    if (stripeError) {
      setError(stripeError.message)
      setLoading(false)
      return
    }
    if (paymentIntent.status === 'requires_capture') {
      sessionStorage.setItem('paymentIntentId', paymentIntent.id)
      navigate(consultationType === 'message' ? '/message-sent' : '/waiting')
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="card" style={{marginBottom:'1rem'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.25rem'}}>
          <div>
            <h2 style={{marginBottom:'.25rem'}}>Consultation fee</h2>
            <p style={{fontSize:'.9375rem'}}>
              {consultationType === 'phone' ? 'Phone consultation' : consultationType === 'message' ? 'Written response within 2 hours' : 'Video consultation'}
              {accEligible === 'yes' && consultationType !== 'message' ? ' — ACC co-payment' : ''}
            </p>
          </div>
          <div style={{fontSize:'2rem',fontWeight:700,color:'var(--navy)'}}>
            ${amount}
          </div>
        </div>

{accEligible === 'yes' ? (
          <div style={{background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:'var(--radius-sm)',padding:'1rem',marginBottom:'1.25rem',fontSize:'.875rem',lineHeight:1.7}}>
            <strong style={{display:'block',marginBottom:'.5rem',color:'#065F46'}}>How ACC billing works</strong>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.5rem',marginBottom:'.75rem'}}>
              <div style={{background:'white',borderRadius:6,padding:'.625rem',textAlign:'center'}}>
                <div style={{fontSize:'1.25rem',fontWeight:700,color:'#065F46'}}>~$62</div>
                <div style={{fontSize:'.75rem',color:'#6B7280'}}>ACC pays directly to Tere</div>
              </div>
              <div style={{background:'white',borderRadius:6,padding:'.625rem',textAlign:'center'}}>
                <div style={{fontSize:'1.25rem',fontWeight:700,color:'#0D2B45'}}>$25</div>
                <div style={{fontSize:'.75rem',color:'#6B7280'}}>Your co-payment today</div>
              </div>
            </div>
            <div style={{fontSize:'.8125rem',color:'#065F46'}}>ACC covers the majority of your consultation fee for injury presentations. The $25 co-payment is the regulated patient contribution under the ACC Act 2001. Tere lodges your claim during the consultation.</div>
          </div>
        ) : (
          <div style={{background:'#F0F9FA',border:'1px solid #D4EEF0',borderRadius:'var(--radius-sm)',padding:'1rem',marginBottom:'1.25rem',fontSize:'.875rem',lineHeight:1.7}}>
            <strong style={{display:'block',marginBottom:'.5rem',color:'#0D2B45'}}>About this fee</strong>
            <div style={{fontSize:'.8125rem',color:'#6B7280',marginBottom:'.5rem'}}>This is a private acute telehealth consultation with an Emergency Medicine physician. The $65 fee covers your full consultation including any prescriptions and referrals.</div>
            <div style={{fontSize:'.8125rem',color:'#6B7280'}}>If your condition turns out to be ACC-eligible during the consultation, your clinician will lodge a claim and the difference will be refunded to your card.</div>
          </div>
        )}
        <div style={{background:'var(--bg)',borderRadius:'var(--radius-sm)',padding:'.875rem',marginBottom:'1.25rem',fontSize:'.8125rem',lineHeight:1.7,color:'#6B7280'}}>
          🔒 <strong>Card hold:</strong> Your card is held but <strong>not charged</strong> until your consultation begins. Cancel before it starts and the hold is released automatically.
        </div>

        <div style={{marginBottom:'1.25rem'}}>
          <label style={{display:'block',fontSize:'.8125rem',fontWeight:600,color:'var(--text)',marginBottom:'.5rem'}}>
            Card details
          </label>
          <div style={{border:'1.5px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'.875rem 1rem',background:'white'}}>
            <CardElement options={CARD_STYLE} />
          </div>
        </div>

        {error && (
          <div style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:'var(--radius-sm)',padding:'.875rem',marginBottom:'1rem',fontSize:'.9375rem',color:'#991B1B'}}>
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-full" disabled={loading || !clientSecret}>
          {loading ? 'Processing…' : consultationType === 'message' ? `Pay $${amount} and send message` : `Hold $${amount} and join waiting room`}
        </button>
      </div>

      <div style={{textAlign:'center'}}>
        <div style={{fontSize:'.75rem',color:'var(--muted)',marginBottom:'.5rem'}}>
          🔒 Secured by Stripe · Card details are never stored by Tere
        </div>
        <div style={{display:'flex',justifyContent:'center',gap:'1.25rem',flexWrap:'wrap'}}>
          <button type="button"
            onClick={() => navigate('/consultation-type')}
            style={{background:'none',border:'none',color:'var(--muted)',fontSize:'.8125rem',cursor:'pointer',textDecoration:'underline'}}>
            ← Change consultation type
          </button>
          <button type="button"
            onClick={() => navigate('/')}
            style={{background:'none',border:'none',color:'var(--muted)',fontSize:'.8125rem',cursor:'pointer',textDecoration:'underline'}}>
            Cancel and start over
          </button>
        </div>
      </div>
    </form>
  )
}

export default function Payment() {
  const navigate = useNavigate()
  const consultationId   = sessionStorage.getItem('consultationId')
  const accEligible      = sessionStorage.getItem('accEligible') || 'no'
  const consultationType = sessionStorage.getItem('consultationType') || 'video'

  useEffect(() => {
    if (!consultationId) navigate('/triage')
  }, [consultationId, navigate])

  return (
    <div className="page">
      <nav className="navbar">
        <div style={{display:'flex',alignItems:'center',gap:'1rem'}}>
          <button onClick={() => navigate('/consultation-type')} style={{background:'none',border:'none',color:'rgba(255,255,255,.7)',cursor:'pointer',fontSize:'1.1rem',padding:'0',lineHeight:1}} aria-label="Go back">←</button>
          <span className="navbar-brand" onClick={() => navigate('/')} style={{cursor:'pointer',userSelect:'none',transition:'opacity .15s'}} onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'} role="link" aria-label="Tere Health — go to home">Tere</span>
        </div>
        <span style={{color:'rgba(255,255,255,.5)',fontSize:'.875rem',fontStyle:'italic'}}>He tere, he ora</span>
      </nav>
      <div className="container" style={{paddingTop:'2rem',paddingBottom:'3rem',maxWidth:480}}>
        <Elements stripe={stripePromise} options={STRIPE_OPTIONS}>
          <PaymentForm consultationId={consultationId} accEligible={accEligible} consultationType={consultationType} />
        </Elements>
        <p style={{fontSize:'.8125rem',color:'var(--muted)',marginTop:'1.25rem',textAlign:'center'}}>
          Emergency? Call <strong>111</strong> immediately.
        </p>
      </div>
    </div>
  )
}
