import React from 'react'
import { useNavigate } from 'react-router-dom'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'

export default function DemoLanding() {
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: '100vh', background: NAVY, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: '#D97706', color: 'white', textAlign: 'center', padding: '8px', fontSize: '.8125rem', fontWeight: 700, letterSpacing: '.05em', zIndex: 100 }}>
        DEMO MODE — No real data is used
      </div>

      <div style={{ textAlign: 'center', marginBottom: '3rem', marginTop: '2rem' }}>
        <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '2.8rem', marginBottom: '.75rem' }}>Tere Health</div>
        <div style={{ color: 'rgba(212,238,240,.6)', fontSize: '1rem' }}>Interactive product demonstration</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem', width: '100%', maxWidth: 880 }}>
        {[
          {
            title: 'Patient experience',
            desc: 'Book a consultation from your phone. Chat with Tere AI, complete a vital signs scan, and join your doctor — from anywhere in the Sounds.',
            icon: '🧑‍⚕️', path: '/demo/patient', color: TEAL, steps: 9,
          },
          {
            title: 'Provider experience',
            desc: 'View the patient queue, review vitals, admit patients to an encrypted video call, and let AI Scribe generate your clinical notes.',
            icon: '👨‍⚕️', path: '/demo/provider', color: '#7C3AED', steps: 8,
          },
          {
            title: 'Admin experience',
            desc: 'Manage provider availability, review the queue, complete and sign clinical notes, and manage employer accounts.',
            icon: '📊', path: '/demo/admin', color: '#065F46', steps: 5,
          },
        ].map(({ title, desc, icon, path, color, steps }) => (
          <button key={path} onClick={() => navigate(path)} style={{
            background: 'rgba(255,255,255,.05)', border: `2px solid ${color}40`,
            borderRadius: 16, padding: '2rem', cursor: 'pointer', textAlign: 'left',
            transition: 'all .2s', fontFamily: 'Plus Jakarta Sans, sans-serif', display: 'block',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = `${color}18`; e.currentTarget.style.borderColor = color; e.currentTarget.style.transform = 'translateY(-3px)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.05)'; e.currentTarget.style.borderColor = `${color}40`; e.currentTarget.style.transform = 'none' }}
          >
            <div style={{ fontSize: '2.25rem', marginBottom: '.875rem' }}>{icon}</div>
            <div style={{ color: '#D4EEF0', fontWeight: 700, fontSize: '1.125rem', marginBottom: '.625rem' }}>{title}</div>
            <div style={{ color: 'rgba(212,238,240,.6)', fontSize: '.875rem', lineHeight: 1.65, marginBottom: '1.25rem' }}>{desc}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ color: color, fontWeight: 700, fontSize: '.875rem' }}>Start demo →</div>
              <div style={{ color: 'rgba(212,238,240,.3)', fontSize: '.75rem' }}>{steps} steps</div>
            </div>
          </button>
        ))}
      </div>

      <div style={{ marginTop: '3rem', color: 'rgba(212,238,240,.25)', fontSize: '.75rem', textAlign: 'center', lineHeight: 1.7 }}>
        Tere Health Limited · Marlborough Sounds, New Zealand<br />
        terehealth.co.nz · Emergency: 111
      </div>
    </div>
  )
}
