import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { detectNzAddress } from '../../lib/nzAddress'

// Flat $65 consult across every live-consult type (video and phone are the
// same price — patient picks whichever suits them, provider decides on the
// call). ACC-eligible consults charge only the $25 administrative fee — the
// consultation itself is billed direct to ACC (see docs/security-compliance.md
// and Terms §5). International visitor rate is $100 (illness only; ACC still
// covers accidental-injury consults at the standard rate). `message` kept
// for backend repeat-Rx compat but not surfaced as a user-facing product.
// Must stay in sync with api/_windcave-create-session.js PRICES.
const BASE_PRICES = {
  consult: { private: 65, acc: 25, international: 100 },
  video:   { private: 65, acc: 25, international: 100 },
  phone:   { private: 65, acc: 25, international: 100 },
  message: { private: 25, acc: 25, international: 40 },
}
const COUPON_DISCOUNT = 10

// Billing-country dropdown. NZ = local rate. Anything else = international
// rate. Compact list covering top NZ visitor origins + a fallback. We don't
// display a full ISO country list because the price rule is binary
// (NZ vs. non-NZ); more granularity here just adds friction.
const BILLING_COUNTRIES = [
  { code: 'NZ', name: 'New Zealand' },
  { code: 'AU', name: 'Australia' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'CN', name: 'China' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'IN', name: 'India' },
  { code: 'SG', name: 'Singapore' },
  { code: 'OTHER', name: 'Other' },
]


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
//
// Restored 2026-08-27 after Windcave approval landed (task-scope reversal
// of 2026-08-04 rip). Gated behind use_windcave feature flag — stays OFF
// in prod until Vercel WINDCAVE_* live creds are set + flag flipped on.
function WindcavePayment({ consultationId, accEligible, consultationType }) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('billing')  // billing | loading | ready | verifying | approved | declined
  const [session, setSession] = useState(null)
  const [error, setError]     = useState(null)

  // Billing country — auto-detected from patient's triage address. Persisted
  // to sessionStorage so back/forward keeps the choice. NZ default when
  // triage address is ambiguous or clearly NZ. If the choice is already in
  // sessionStorage (e.g., user came back after a decline), skip the modal.
  const [billingCountry, setBillingCountry] = useState(() => {
    const stored = sessionStorage.getItem('billing_country')
    if (stored) return stored
    const address = sessionStorage.getItem('patient_address') || ''
    const detected = detectNzAddress(address)
    if (detected.nz === false) return 'OTHER'
    return 'NZ'
  })
  const isInternational = billingCountry !== 'NZ'
  const priceSet = BASE_PRICES[consultationType] || BASE_PRICES.video
  const amount = isInternational
    ? priceSet.international
    : (accEligible === 'yes' ? priceSet.acc : priceSet.private)

  async function startSession(intlOverride) {
    setPhase('loading'); setError(null)
    const intl = typeof intlOverride === 'boolean' ? intlOverride : isInternational
    try {
      const r = await apiFetch('/api/windcave-create-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultationId, accEligible, consultationType, isInternational: intl }),
      })
      const data = await r.json()
      if (!r.ok || !data.hppUrl) {
        setError(data.error || 'Could not start payment. Please try again.')
        setPhase('declined')
        return
      }
      setSession(data)
      setPhase('ready')
    } catch {
      setError('Could not reach payment service. Please try again.')
      setPhase('declined')
    }
  }

  function confirmBilling() {
    sessionStorage.setItem('billing_country', billingCountry)
    startSession(billingCountry !== 'NZ')
  }

  // If the country was already chosen in a prior visit (sessionStorage hit
  // in the initial state), skip straight to starting the session.
  useEffect(() => {
    if (sessionStorage.getItem('billing_country')) {
      startSession()
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for postMessage from the iframe's callback page.
  // MUST be declared before any conditional returns — React's Rules of Hooks
  // require the same number of hook calls on every render. Previously this
  // hook lived after `if (phase === 'billing') return ...` which caused
  // React error #310 when phase transitioned from 'billing' → 'ready'.
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

  if (phase === 'billing') return (
    <div>
      <div className="card" style={{padding:'1.5rem'}}>
        <h2 style={{marginBottom:'.5rem'}}>Where will you be paying from?</h2>
        <p style={{fontSize:'.9375rem',color:'#6B7280',marginBottom:'1.25rem'}}>
          This sets your consultation price. NZ residents pay the local rate; international
          visitors pay a flat NZ$100.
        </p>
        <label style={{ display:'block', fontSize:'.8125rem', fontWeight:700, color:'#0D2B45', marginBottom:'.4rem' }}>
          Billing country
        </label>
        <select value={billingCountry} onChange={e => setBillingCountry(e.target.value)}
          style={{ width:'100%', padding:'.65rem .7rem', fontSize:'.9375rem', fontFamily:'Plus Jakarta Sans, sans-serif', color:'#1A2A33', background:'white', border:'1.5px solid #E2E8F0', borderRadius:8, cursor:'pointer', marginBottom:'.75rem' }}>
          {BILLING_COUNTRIES.map(c => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
        {isInternational ? (
          <div style={{ fontSize:'.8125rem', color:'#6B7280', lineHeight:1.55, marginBottom:'.75rem' }}>
            International visitor rate: <strong>NZ${priceSet.international}</strong>. Includes an itemised receipt suitable for travel-insurance claims.
            {accEligible === 'yes' && (
              <div style={{ marginTop:'.5rem', fontSize:'.75rem', color:'#B45309', fontStyle:'italic' }}>
                * Full price applies — ACC is only available to NZ residents.
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize:'.8125rem', color:'#6B7280', marginBottom:'.75rem' }}>
            New Zealand resident rate: <strong>NZ${accEligible === 'yes' ? priceSet.acc : priceSet.private}</strong>
            {accEligible === 'yes' ? ' — ACC covers the consultation itself.' : '.'}
          </div>
        )}
        <button type="button" onClick={confirmBilling} className="btn btn-primary btn-full" style={{marginTop:'.5rem'}}>
          Continue — NZ${amount}
        </button>
      </div>
    </div>
  )

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
      <div className="card" style={{padding:'1.5rem',marginBottom:'1rem'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'1.25rem'}}>
          <div>
            <h2 style={{marginBottom:'.25rem'}}>Consultation fee</h2>
            <p style={{fontSize:'.9375rem'}}>
              Consultation with an Emergency Medicine physician
              {accEligible === 'yes' ? ' — ACC co-payment' : ''}
            </p>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:'2rem',fontWeight:700,color:'var(--navy)'}}>
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
              This is a private telehealth consultation with an Emergency Medicine physician. Prescriptions and referrals are included.
            </div>
            <div style={{fontSize:'.8125rem',color:'#6B7280'}}>If your condition turns out to be ACC-eligible during the consultation, your clinician will lodge a claim and the difference will be refunded to your card.</div>
          </div>
        )}

        <div style={{background:'var(--bg)',borderRadius:'var(--radius-sm)',padding:'.875rem',marginBottom:'1.25rem',fontSize:'.8125rem',lineHeight:1.7,color:'#6B7280'}}>
          🔒 <strong>Card hold:</strong> Your card is held at up to <strong>${amount}</strong> but <strong>not charged</strong> until your consultation is complete. Cancel before it starts and the hold is released automatically.
        </div>

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
      </div>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:'.75rem',color:'var(--muted)',marginBottom:'.5rem'}}>
          🔒 Card entry is hosted securely by <strong>Windcave</strong> — Tere never sees your card details.
        </div>
        <div style={{display:'flex',justifyContent:'center',gap:'1.25rem',flexWrap:'wrap'}}>
          <button type="button"
            onClick={() => navigate('/')}
            style={{background:'none',border:'none',color:'var(--muted)',fontSize:'.8125rem',cursor:'pointer',textDecoration:'underline'}}>
            Cancel and start over
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Payment() {
  const navigate = useNavigate()
  const consultationId   = sessionStorage.getItem('consultationId')
  const accEligible      = sessionStorage.getItem('accEligible') || 'no'
  const consultationType = sessionStorage.getItem('consultationType') || 'consult'
  useEffect(() => {
    if (!consultationId) { navigate('/start'); return }
    // Back-button guard: if the patient already paid for THIS
    // consultation, rendering the payment form again risks a duplicate
    // charge. Verify against the DB (not sessionStorage) so a stale
    // paymentIntentId from a previous completed visit doesn't
    // accidentally block a legitimate new payment.
    let cancelled = false
    ;(async () => {
      try {
        const { getConsultation } = await import('../../lib/supabase')
        const c = await getConsultation(consultationId)
        if (cancelled) return
        // 'pre_triage' and 'draft' → not yet paid, show form.
        // 'waiting' or beyond → already paid, forward to next step.
        const PAID_STATUSES = new Set(['waiting','vitals_requested','vitals_complete','ready','in_progress','waitlisted','complete','completed'])
        if (c && PAID_STATUSES.has(c.status)) {
          const forwardTo = consultationType === 'message'
            ? '/message-sent'
            : `/vitals/${consultationId}`
          navigate(forwardTo, { replace: true })
        }
      } catch { /* If lookup fails, show the form and let server-side + Windcave FPRN idempotency handle it. */ }
    })()
    return () => { cancelled = true }
  }, [consultationId, consultationType, navigate])

  return (
    <div className="page">
      <nav className="navbar">
        <div style={{display:'flex',alignItems:'center',gap:'1rem'}}>
          <button onClick={() => navigate('/consultation-type')} style={{background:'none',border:'none',color:'rgba(255,255,255,.7)',cursor:'pointer',fontSize:'1.1rem',padding:'0',lineHeight:1}} aria-label="Go back">←</button>
          <span className="navbar-brand" onClick={() => navigate('/')} style={{cursor:'pointer',userSelect:'none',transition:'opacity .15s'}} onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'} role="link" aria-label="Tere Health — go to home">Tere</span>
        </div>
      </nav>
      <div className="container" style={{paddingTop:'2rem',paddingBottom:'3rem',maxWidth:480}}>
        <WindcavePayment consultationId={consultationId} accEligible={accEligible} consultationType={consultationType} />
        <p style={{fontSize:'.8125rem',color:'var(--muted)',marginTop:'1.25rem',textAlign:'center'}}>
          Emergency? Call <strong>111</strong> immediately.
        </p>
      </div>
    </div>
  )
}
