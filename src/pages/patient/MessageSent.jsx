import React from 'react'
import { useNavigate } from 'react-router-dom'

export default function MessageSent() {
  const navigate = useNavigate()
  const email = sessionStorage.getItem('patientEmail') || 'your email'
  const name = sessionStorage.getItem('patientName') || ''

  return (
    <div className="page">
      <nav className="navbar">
        <span className="navbar-brand">Tere</span>
        <span style={{ color: 'rgba(255,255,255,.5)', fontSize: '.875rem', fontStyle: 'italic' }}>He tere, he ora</span>
      </nav>
      <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3rem', maxWidth: 480, textAlign: 'center' }}>
        <div className="card">
          <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>💬</div>
          <h2 style={{ marginBottom: '.5rem' }}>Message received{name ? `, ${name.split(' ')[0]}` : ''}</h2>
          <p style={{ marginBottom: '1.5rem', lineHeight: 1.7, fontSize: '.9375rem' }}>
            Your query has been sent to our clinical team. A clinician will review your triage notes and respond within <strong>2 hours</strong>.
          </p>

          <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
            <div style={{ fontSize: '.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: '.5rem' }}>What happens next</div>
            {[
              ['📧', 'Response sent to', email],
              ['⏱️', 'Response time', 'Within 2 hours during clinic hours'],
              ['📞', 'If urgent', 'The clinician will call you directly'],
              ['💊', 'Prescriptions', 'Sent to your pharmacy if appropriate'],
            ].map(([icon, label, val]) => (
              <div key={label} style={{ display: 'flex', gap: '.75rem', marginBottom: '.625rem', fontSize: '.875rem', lineHeight: 1.4 }}>
                <span style={{ flexShrink: 0 }}>{icon}</span>
                <div>
                  <span style={{ color: 'var(--muted)' }}>{label}: </span>
                  <span style={{ fontWeight: 600, color: 'var(--text)', wordBreak: 'break-all' }}>{val}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 'var(--radius-sm)', padding: '.875rem', marginBottom: '1.5rem', fontSize: '.875rem', color: '#92400E', lineHeight: 1.6 }}>
            If your symptoms get <strong>worse</strong> or you feel this needs urgent attention, please call your nearest urgent care or <strong>111</strong>.
          </div>

          <button
            onClick={() => { sessionStorage.clear(); navigate('/') }}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '.75rem 1.5rem', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.9375rem', color: 'var(--muted)', width: '100%' }}>
            Done
          </button>
        </div>

        <p style={{ fontSize: '.8125rem', color: 'var(--muted)', marginTop: '1.25rem' }}>
          Emergency? Call <strong>111</strong> immediately.
        </p>
      </div>
    </div>
  )
}
