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
  hidePostalCode: true,
}

const STRIPE_OPTIONS = { locale: 'en-NZ' }

const BASE_PRICES = { video: { private: 65, acc: 25 }, phone: { private: 45, acc: 25 }, message: { private: 25, acc: 25 } }
const COUPON_DISCOUNT = 10

function PaymentForm({ consultationId, accEligible, consultationType }) {
  const navigate   = useNavigate()
  const stripe     = useStripe()
  const elements   = useElements()
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [clientSecret, setClientSecret] = useState(null)
  const [couponInput, setCouponInput]   = useState('')
  const [couponApplied, setCouponApplied] = useState(false)
  const [couponError, setCouponError]   = useState('')
  const [couponLoading, setCouponLoading] = useState(false)

  const priceSet = BASE_PRICES[consultationType] || BASE_PRICES.video
  const baseAmount = accEligible === 'yes' ? priceSet.acc : priceSet.private
  const discount = couponApplied ? COUPON_DISCOUNT : 0
  const amount = Math.max(baseAmount - discount, 0)

  // Create payment intent (re-create if coupon changes)
  useEffect(() => {
    if (!consultationId) return
    setClientSecret(null)
    async function createIntent() {
      try {
        const res = await apiFetch('/api/create-payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consultationId, accEligible, consultationType, couponDiscount: discount })
        })
        const data = await res.json()
        if (data.clientSecret) setClientSecret(data.clientSecret)
        else setError('Could not initialise payment. Please try again.')
      } catch { setError('Could not initialise payment. Please try again.') }
    }
    createIntent()
  }, [consultationId, accEligible, consultationType, discount])

  async function applyCoupon() {
    const code = couponInput.trim().toUpperCase()
    if (!code) return
    setCouponLoading(true)
    setCouponError('')
    try {
      const { supabase } = await import('../../lib/supabase')
      const now = new Date().toISOString()
      const { data, error: dbErr } = await supabase
        .from('coupons')
        .select('id, code, discount_amount, used_at, expires_at')
        .eq('code', code)
        .is('used_at', null)
        .single()
      if (dbErr || !data) {
        setCouponError('Invalid or expired coupon code.')
      } else if (data.expires_at && data.expires_at < now) {
        setCouponError('This coupon has expired.')
      } else {
        setCouponApplied(true)
        sessionStorage.setItem('couponCode', code)
      }
    } catch {
      setCouponError('Invalid or expired coupon code.')
    } finally {
      setCouponLoading(false)
    }
  }

  function removeCoupon() {
    setCouponApplied(false)
    setCouponInput('')
    setCouponError('')
    sessionStorage.removeItem('couponCode')
  }

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
      navigate(consultationType === 'message' ? '/message-sent' : `/vitals/${consultationId}`)
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
          <div style={{textAlign:'right'}}>
            {couponApplied && (
              <div style={{fontSize:'.875rem',color:'#6B7280',textDecoration:'line-through'}}>
                ${baseAmount}
              </div>
            )}
            <div style={{fontSize:'2rem',fontWeight:700,color: couponApplied ? '#059669' : 'var(--navy)'}}>
              ${amount}
            </div>
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
            <div style={{fontSize:'.8125rem',color:'#6B7280',marginBottom:'.5rem'}}>
              This is a private telehealth consultation with an Emergency Medicine physician. You're charged only for the method your doctor actually uses — video $65, phone $45, or message $25. Prescriptions and referrals are included.
            </div>
            <div style={{fontSize:'.8125rem',color:'#6B7280'}}>If your condition turns out to be ACC-eligible during the consultation, your clinician will lodge a claim and the difference will be refunded to your card.</div>
          </div>
        )}

        {/* Coupon code */}
        {accEligible !== 'yes' && (
          <div style={{marginBottom:'1.25rem'}}>
            {!couponApplied ? (
              <div>
                <label style={{display:'block',fontSize:'.8125rem',fontWeight:600,color:'var(--text)',marginBottom:'.5rem'}}>
                  Have a coupon code?
                </label>
                <div style={{display:'flex',gap:'.5rem'}}>
                  <input
                    value={couponInput}
                    onChange={e => { setCouponInput(e.target.value); setCouponError('') }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon() } }}
                    placeholder="Enter code"
                    style={{flex:1,border:'1.5px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'.625rem .875rem',fontFamily:'Plus Jakarta Sans, sans-serif',fontSize:'.9375rem',outline:'none'}}
                    autoCapitalize="characters"
                  />
                  <button
                    type="button"
                    onClick={applyCoupon}
                    disabled={couponLoading || !couponInput.trim()}
                    style={{background:'var(--navy)',color:'white',border:'none',borderRadius:'var(--radius-sm)',padding:'.625rem 1rem',fontWeight:700,fontSize:'.875rem',cursor:'pointer',whiteSpace:'nowrap',opacity: couponInput.trim() ? 1 : 0.5}}
                  >
                    {couponLoading ? '…' : 'Apply'}
                  </button>
                </div>
                {couponError && (
                  <div style={{fontSize:'.8125rem',color:'#DC2626',marginTop:'.375rem'}}>{couponError}</div>
                )}
              </div>
            ) : (
              <div style={{background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:'var(--radius-sm)',padding:'.75rem 1rem',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:'.8125rem',fontWeight:700,color:'#065F46'}}>✓ Coupon applied — ${COUPON_DISCOUNT} off</div>
                  <div style={{fontSize:'.75rem',color:'#6B7280',marginTop:'.125rem'}}>{couponInput.toUpperCase()}</div>
                </div>
                <button type="button" onClick={removeCoupon} style={{background:'none',border:'none',color:'#9CA3AF',cursor:'pointer',fontSize:'.8125rem',textDecoration:'underline'}}>
                  Remove
                </button>
              </div>
            )}
          </div>
        )}

        <div style={{background:'var(--bg)',borderRadius:'var(--radius-sm)',padding:'.875rem',marginBottom:'1.25rem',fontSize:'.8125rem',lineHeight:1.7,color:'#6B7280'}}>
          🔒 <strong>Card hold:</strong> Your card is held at up to <strong>${amount}</strong> but <strong>not charged</strong> until your consultation is complete. You're only charged for the method your doctor uses. Cancel before it starts and the hold is released automatically.
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
          {loading ? 'Processing…' : `Join queue — hold up to $${amount}`}
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
