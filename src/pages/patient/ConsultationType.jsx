import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { scoreComplaint, CONSULT_PRICES } from '../../lib/consultationType'
import { patientUpdateConsultation } from '../../lib/supabase'

const TYPE_CONFIG = {
  consult: {
    icon: '📞',
    title: 'Consultation',
    subtitle: 'A doctor will call you within 2 hours',
    features: ['Talk with your doctor', 'Video optional — turn it on any time', 'Share photos of what you need seen', 'Prescriptions, referrals & ACC claims'],
    recommended: true,
  },
  message: {
    icon: '💬',
    title: 'Send a message',
    subtitle: 'Doctor reads your notes and replies within 2 hours',
    features: ['Written response to your query', 'Prescriptions & referrals included', 'No call needed', 'Lowest cost option'],
  },
}

export default function ConsultationType() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState(() => sessionStorage.getItem('consultationType') || null)
  const [loading, setLoading] = useState(false)
  const complaint = sessionStorage.getItem('triage_complaint') || ''
  const isReturning = sessionStorage.getItem('triage_returning') === 'true'
  const isAcc = sessionStorage.getItem('accEligible') === 'yes'
  const consultationId = sessionStorage.getItem('consultationId')
  const employerPaid = sessionStorage.getItem('employer_paid') === 'true'
  const employerName = sessionStorage.getItem('employer_name') || ''

  const { allowConsult, allowMessage } = scoreComplaint(complaint, isReturning, isAcc)

  const availableTypes = [
    allowConsult && 'consult',
    allowMessage && 'message',
  ].filter(Boolean)

  // Tele-emergency positioning — only Consultation is offered. Skip the
  // picker entirely and route straight to payment. Left as a fallback UI
  // in case scoreComplaint ever surfaces >1 option again (e.g. an internal
  // build with messaging re-enabled).
  useEffect(() => {
    if (availableTypes.length !== 1) return
    const only = availableTypes[0]
    const price = only === 'message'
      ? CONSULT_PRICES.message.private
      : (isAcc ? CONSULT_PRICES.consult.acc : CONSULT_PRICES.consult.private)
    sessionStorage.setItem('consultationType', only)
    sessionStorage.setItem('paymentAmount', String(price))
    const updates = { consultation_type: only }
    if (employerPaid) updates.employer_id = sessionStorage.getItem('employer_id') || null
    patientUpdateConsultation(consultationId, updates)
      .catch(err => console.error('consult type auto-set failed:', err))
      .finally(() => navigate(employerPaid ? '/waiting' : '/payment', { replace: true }))
  // Run once on mount — this page's job is now just to route through.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const typeConfig = TYPE_CONFIG

  function getPrice(type) {
    const prices = CONSULT_PRICES[type]
    if (type === 'message') return prices.private
    // ACC consults bill ACC direct at the specialist rate; patient sees $0.
    return isAcc ? prices.acc : prices.private
  }

  async function handleContinue() {
    if (!selected) return
    setLoading(true)
    try {
      const price = getPrice(selected)
      sessionStorage.setItem('consultationType', selected)
      sessionStorage.setItem('paymentAmount', String(price))
      const updates = { consultation_type: selected }
      // Server verifies employer_id against the employers table and, if it's
      // a real active employer, populates employer_paid + employer_name +
      // payment_amount server-side. The client can't force a free consult.
      if (employerPaid) {
        updates.employer_id = sessionStorage.getItem('employer_id') || null
      }
      await patientUpdateConsultation(consultationId, updates)
      navigate(employerPaid ? '/waiting' : '/payment')
    } catch (e) {
      console.error(e)
      setLoading(false)
    }
  }

  return (
    <div className="page" style={{ background: 'var(--bg)' }}>
      <nav className="navbar">
        <div style={{display:'flex',alignItems:'center',gap:'1rem'}}>
          <button onClick={() => navigate(-1)} style={{background:'none',border:'none',color:'rgba(255,255,255,.7)',cursor:'pointer',fontSize:'1.1rem',padding:'0',lineHeight:1,display:'flex',alignItems:'center'}} aria-label="Go back">←</button>
          <span className="navbar-brand" onClick={() => navigate('/')} style={{cursor:'pointer',userSelect:'none',transition:'opacity .15s'}} onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'} role="link" aria-label="Tere Health — go to home">Tere</span>
        </div>
      </nav>

      <div className="container" style={{ paddingTop: '2rem', paddingBottom: '3rem', maxWidth: 520 }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ marginBottom: '.375rem' }}>How would you like to be seen?</h1>
          <p style={{ fontSize: '.9375rem' }}>
            {isAcc
              ? 'ACC covers the cost of your consultation. A $20 administrative fee applies for platform access, prescription processing, and after-hours availability.'
              : "Book a consultation with a doctor, or send an async message for lower-urgency queries."}
          </p>
          {employerPaid && (
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '.75rem 1rem', marginTop: '.75rem', display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.9rem', color: '#065F46', fontWeight: 600 }}>
              <span style={{ fontSize: '1.1rem' }}>✓</span>
              Consultation covered by {employerName} — no payment required
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', marginBottom: '1.5rem' }}>
          {availableTypes.map(type => {
            const cfg = typeConfig[type]
            const price = getPrice(type)
            const isSelected = selected === type
            return (
              <button
                key={type}
                onClick={() => setSelected(type)}
                style={{
                  background: 'white',
                  border: `2px solid ${isSelected ? 'var(--teal)' : 'var(--border)'}`,
                  borderRadius: 12,
                  padding: '1rem 1.25rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                  transition: 'border-color .15s, box-shadow .15s',
                  boxShadow: isSelected ? '0 0 0 3px rgba(11,110,118,.15)' : 'none',
                  position: 'relative',
                }}
              >
                {cfg.recommended && availableTypes.length > 1 && (
                  <span style={{ position: 'absolute', top: -10, left: 16, background: 'var(--teal)', color: 'white', fontSize: '.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, letterSpacing: '.04em', textTransform: 'uppercase' }}>
                    Recommended
                  </span>
                )}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 10,
                    background: isSelected ? 'var(--teal-light)' : 'var(--bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.5rem', flexShrink: 0,
                  }}>
                    {cfg.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '.5rem', marginBottom: '.25rem' }}>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0D2B45' }}>{cfg.title}</div>
                      <div style={{ fontWeight: 700, fontSize: '1.25rem', color: isSelected ? 'var(--teal)' : '#0D2B45', flexShrink: 0 }}>
                        ${price}
                        {isAcc && type !== 'message' && (
                          <span style={{ fontSize: '.75rem', fontWeight: 400, color: '#6B7280', marginLeft: 4 }}>ACC</span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: '.875rem', color: '#6B7280', marginBottom: '.5rem', lineHeight: 1.4 }}>{cfg.subtitle}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {cfg.features.map(f => (
                        <span key={f} style={{ fontSize: '.75rem', background: isSelected ? '#E6F5F6' : '#F3F4F6', color: isSelected ? 'var(--teal)' : '#6B7280', padding: '2px 8px', borderRadius: 99 }}>
                          ✓ {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                    border: `2px solid ${isSelected ? 'var(--teal)' : '#D1D5DB'}`,
                    background: isSelected ? 'var(--teal)' : 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSelected && <span style={{ color: 'white', fontSize: 11, lineHeight: 1 }}>✓</span>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <button
          onClick={handleContinue}
          disabled={!selected || loading}
          className="btn btn-primary btn-full"
          style={{ fontSize: '1rem', padding: '.875rem' }}
        >
          {loading ? 'Setting up…' : selected ? (employerPaid ? `Confirm preference — ${TYPE_CONFIG[selected].title} — Covered` : `Confirm preference — ${TYPE_CONFIG[selected].title} — up to $${getPrice(selected)}`) : 'Select your preferred method'}
        </button>

        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '.875rem', marginTop: '1rem', fontSize: '.8125rem', color: '#6B7280', lineHeight: 1.6 }}>
          <strong style={{ color: '#374151', display: 'block', marginBottom: '.25rem' }}>Telehealth limitations — please note</strong>
          Your doctor cannot physically examine you. Some conditions require in-person assessment. Your doctor may refer you to an ED or GP if needed. Controlled drugs cannot be prescribed via telehealth. By continuing, you accept these limitations.{' '}
          <a href="/terms" style={{ color: '#0B6E76' }}>Full terms</a>
        </div>

        <div style={{ marginTop: '.75rem', textAlign: 'center', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <p style={{ fontSize: '.8125rem', color: 'var(--muted)', margin: 0 }}>
            Emergency? Call <strong>111</strong>
          </p>
          <p style={{ fontSize: '.8125rem', color: 'var(--muted)', margin: 0 }}>
            Mental health crisis? Call or text <strong>1737</strong>
          </p>
        </div>
      </div>
    </div>
  )
}
