import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { scoreComplaint, CONSULT_PRICES } from '../../lib/consultationType'

const TYPE_CONFIG = {
  video: {
    icon: '📹',
    title: 'Video consultation',
    subtitle: 'Face to face with your doctor via video call',
    features: ['See and hear your doctor', 'Physical assessment', 'Prescriptions & referrals', 'ACC claims accepted'],
    recommended: true,
  },
  phone: {
    icon: '📞',
    title: 'Phone consultation',
    subtitle: 'Audio call only — no camera needed',
    features: ['Talk with your doctor', 'Prescriptions & referrals', 'ACC claims accepted', 'Good for low-bandwidth areas'],
    recommended: false,
  },
  message: {
    icon: '💬',
    title: 'Written response',
    subtitle: 'Send your query and receive a written response within 2 hours',
    features: ['Doctor reviews your notes', 'Written response to your email', 'Prescriptions if appropriate', 'No video or phone needed'],
    recommended: false,
  },
}

export default function ConsultationType() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)

  const complaint = sessionStorage.getItem('triage_complaint') || ''
  const isReturning = sessionStorage.getItem('triage_returning') === 'true'
  const isAcc = sessionStorage.getItem('accEligible') === 'yes'
  const consultationId = sessionStorage.getItem('consultationId')
  const employerPaid = sessionStorage.getItem('employer_paid') === 'true'
  const employerName = sessionStorage.getItem('employer_name') || ''

  const { allowVideo, allowPhone, allowMessage } = scoreComplaint(complaint, isReturning)

  const availableTypes = [
    allowVideo && 'video',
    allowPhone && 'phone',
    allowMessage && 'message',
  ].filter(Boolean)

  function getPrice(type) {
    const prices = CONSULT_PRICES[type]
    return isAcc && type !== 'message' ? prices.acc : prices.private
  }

  async function handleContinue() {
    if (!selected) return
    setLoading(true)
    try {
      const price = getPrice(selected)
      sessionStorage.setItem('consultationType', selected)
      sessionStorage.setItem('paymentAmount', String(price))
      const { supabase } = await import('../../lib/supabase')
      const updates = { consultation_type: selected }
      if (employerPaid) {
        updates.employer_paid = true
        updates.employer_id = sessionStorage.getItem('employer_id') || null
        updates.employer_name = employerName || null
        updates.payment_amount = 0
      }
      await supabase.from('consultations').update(updates).eq('id', consultationId)
      navigate(employerPaid ? '/waiting' : '/payment')
    } catch (e) {
      console.error(e)
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <nav className="navbar">
        <span className="navbar-brand">Tere</span>
        <span style={{ color: 'rgba(255,255,255,.5)', fontSize: '.875rem', fontStyle: 'italic' }}>He tere, he ora</span>
      </nav>

      <div className="container" style={{ paddingTop: '2rem', paddingBottom: '3rem', maxWidth: 520 }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ marginBottom: '.375rem' }}>How would you like to consult?</h1>
          <p style={{ fontSize: '.9375rem' }}>
            {allowMessage
              ? 'Based on your query, all three options are available.'
              : 'Based on your query, an in-person consultation is recommended.'}
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
            const cfg = TYPE_CONFIG[type]
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

        {selected === 'message' && (
          <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, padding: '1rem', marginBottom: '1.25rem', fontSize: '.875rem', lineHeight: 1.7, color: '#92400E' }}>
            <strong style={{ display: 'block', marginBottom: '.25rem' }}>About written consultations</strong>
            A clinician will read your triage notes and respond in writing within 2 hours. You'll receive the response to your email. If they determine you need urgent in-person care, they'll call you directly.
          </div>
        )}

        <button
          onClick={handleContinue}
          disabled={!selected || loading}
          className="btn btn-primary btn-full"
          style={{ fontSize: '1rem', padding: '.875rem' }}
        >
          {loading ? 'Setting up…' : selected ? (employerPaid ? `Continue with ${TYPE_CONFIG[selected].title} — Covered` : `Continue with ${TYPE_CONFIG[selected].title} — $${getPrice(selected)}`) : 'Select a consultation type'}
        </button>

        <p style={{ fontSize: '.8125rem', color: 'var(--muted)', marginTop: '1rem', textAlign: 'center' }}>
          Emergency? Call <strong>111</strong> immediately.
        </p>
      </div>
    </div>
  )
}
