import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { apiFetch } from '../../lib/api'
import { patientUpdateConsultation } from '../../lib/supabase'
import { useFeatureFlag } from '../../lib/featureFlags'

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

// Flat $60 consult across every live-consult type. ACC-eligible consults
// charge only the $20 administrative fee — the consultation itself is
// billed direct to ACC (see docs/security-compliance.md and Terms §5).
// Message stays $25 (not ACC-billable).
const BASE_PRICES = { consult: { private: 60, acc: 20 }, video: { private: 60, acc: 20 }, phone: { private: 60, acc: 20 }, message: { private: 25, acc: 25 } }
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
      // Add patient to provider queue immediately; vitals scan happens in parallel
      try {
        const bufferExpires = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        await patientUpdateConsultation(consultationId, {
          status: 'waiting',
          buffer_expires_at: bufferExpires,
        })
      } catch {}
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
            <div style={{display:'flex',alignItems:'center',gap:'.625rem',marginBottom:'.5rem'}}>
              <span style={{fontSize:'1.1rem'}}>✓</span>
              <strong style={{color:'#065F46'}}>ACC covering — you only owe $25</strong>
            </div>
            <div style={{fontSize:'.8125rem',color:'#065F46'}}>ACC covers your consultation for injury presentations. The $25 co-payment is the regulated patient contribution under the ACC Act 2001. Tere lodges your claim during the consultation.</div>
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

// Windcave Hosted Payment Page — embedded iframe integration.
//
// Flow:
//   1. Component mounts → create Windcave session server-side
//   2. Render <iframe src={hppUrl}> on our page (Tere branding preserved)
//   3. Patient enters card details in Windcave's iframe (SAQ A — card
//      data never touches our origin)
//   4. Windcave redirects the iframe to callbackUrls.approved/declined/
//      cancelled — which points at /payment-return
//   5. PaymentReturn.jsx, running INSIDE the iframe, detects it's framed
//      and posts { type:'tere-windcave', status, consultationId } to the
//      parent (this component)
//   6. We re-query /api/windcave-query for authoritative approval, then
//      navigate to /waiting
//
// FPRN webhook remains the source of truth for the consultation's
// payment_status column — the postMessage/query dance is purely for
// smooth UX inside the browser.
function WindcavePayment({ consultationId, accEligible, consultationType }) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('loading')  // loading | ready | verifying | approved | declined
  const [session, setSession] = useState(null)
  const [error, setError]     = useState(null)
  const priceSet = BASE_PRICES[consultationType] || BASE_PRICES.consult
  const amount = accEligible === 'yes' ? priceSet.acc : priceSet.private

  async function startSession() {
    setPhase('loading'); setError(null)
    try {
      const r = await apiFetch('/api/windcave-create-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultationId, accEligible, consultationType }),
      })
      const data = await r.json()
      if (!r.ok || !data.hppUrl) {
        setError(data.error || 'Could not start payment. Please try again.')
        setPhase('declined')
        return
      }
      setSession(data)
      setPhase('ready')
    } catch (e) {
      setError('Could not reach payment service. Please try again.')
      setPhase('declined')
    }
  }

  useEffect(() => { startSession() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for postMessage from the iframe's callback page.
  useEffect(() => {
    if (phase !== 'ready' || !session) return
    async function onMessage(e) {
      if (e.origin !== window.location.origin) return
      if (e.data?.type !== 'tere-windcave') return
      const { status } = e.data
      if (status === 'approved') {
        setPhase('verifying')
        try {
          const r = await apiFetch(`/api/windcave-query?sessionId=${encodeURIComponent(session.sessionId)}`)
          const q = await r.json()
          if (q.approved) {
            setPhase('approved')
            setTimeout(() => navigate('/waiting', { replace: true }), 900)
          } else {
            setError('Payment could not be verified. Please try again.')
            setPhase('declined')
          }
        } catch {
          setError('Could not verify payment. If you were charged, please contact support.')
          setPhase('declined')
        }
      } else {
        setError(status === 'cancelled' ? 'Payment cancelled.' : 'Payment was not approved. Please try again with a different card.')
        setPhase('declined')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [phase, session, navigate])

  if (phase === 'loading') return (
    <div style={{ textAlign: 'center', padding: '2rem 0' }}>
      <div className="spinner" style={{ margin: '0 auto 1rem' }} />
      <div style={{ color: '#6B7280' }}>Preparing secure payment…</div>
    </div>
  )

  if (phase === 'approved') return (
    <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '.75rem' }}>✅</div>
      <h2 style={{ color: '#0D2B45', fontWeight: 700, marginBottom: '.5rem' }}>Payment confirmed</h2>
      <p style={{ color: '#374151' }}>Taking you to the waiting room…</p>
    </div>
  )

  if (phase === 'declined') return (
    <div>
      <h2 style={{ color: '#0D2B45', fontWeight: 700, marginBottom: '.5rem' }}>Payment not completed</h2>
      <p style={{ color: '#374151', marginBottom: '1.25rem' }}>{error || 'Please try again.'}</p>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        <button onClick={startSession}
          style={{ background: '#0B6E76', color: 'white', border: 'none', padding: '.75rem 1.25rem', borderRadius: 99, fontWeight: 700, cursor: 'pointer', fontSize: '.9375rem' }}>
          Try again
        </button>
        <button onClick={() => navigate('/contact?source=payment_failed')}
          style={{ background: 'white', color: '#0B6E76', border: '2px solid #0B6E76', padding: '.6875rem 1.125rem', borderRadius: 99, fontWeight: 700, cursor: 'pointer', fontSize: '.9375rem' }}>
          Contact support
        </button>
      </div>
    </div>
  )

  // phase === 'ready' or 'verifying'
  return (
    <div>
      <h2 style={{ color: '#0D2B45', fontWeight: 700, marginBottom: '.25rem' }}>Payment</h2>
      <p style={{ color: '#374151', marginBottom: '1rem', fontSize: '.9375rem' }}>
        <strong>${amount}.00 NZD</strong>{accEligible === 'yes' && consultationType !== 'message' ? ' — $20 administrative fee (ACC covers the consultation itself)' : ''}
      </p>
      {phase === 'verifying' && (
        <div style={{ background: '#F0F9FA', border: '1px solid #BAE6E9', borderRadius: 10, padding: '.75rem 1rem', marginBottom: '.75rem', fontSize: '.8125rem', color: '#0B4F5A', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2, margin: 0, flexShrink: 0 }} />
          Confirming payment with Windcave…
        </div>
      )}
      <iframe
        src={session?.hppUrl}
        title="Windcave secure payment"
        style={{ width: '100%', height: 720, border: '1px solid #E5E7EB', borderRadius: 12, background: 'white', display: 'block' }}
        scrolling="auto"
        allow="payment"
      />
      <p style={{ fontSize: '.75rem', color: '#9CA3AF', textAlign: 'center', marginTop: '.5rem' }}>
        🔒 Card entry is hosted securely by <strong>Windcave</strong> — Tere never sees your card details.
      </p>
    </div>
  )
}

export default function Payment() {
  const navigate = useNavigate()
  const consultationId   = sessionStorage.getItem('consultationId')
  const accEligible      = sessionStorage.getItem('accEligible') || 'no'
  const consultationType = sessionStorage.getItem('consultationType') || 'consult'
  const useWindcave      = useFeatureFlag('use_windcave')
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
      </nav>
      <div className="container" style={{paddingTop:'2rem',paddingBottom:'3rem',maxWidth:480}}>
        {useWindcave ? (
          <WindcavePayment consultationId={consultationId} accEligible={accEligible} consultationType={consultationType} />
        ) : (
          <Elements stripe={stripePromise} options={STRIPE_OPTIONS}>
            <PaymentForm consultationId={consultationId} accEligible={accEligible} consultationType={consultationType} />
          </Elements>
        )}
        <p style={{fontSize:'.8125rem',color:'var(--muted)',marginTop:'1.25rem',textAlign:'center'}}>
          Emergency? Call <strong>111</strong> immediately.
        </p>
      </div>
    </div>
  )
}
