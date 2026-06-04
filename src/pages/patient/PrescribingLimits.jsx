import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { supabase } from '../../lib/supabase'

const CAN_PRESCRIBE = [
  'Antibiotics, antifungals, antihistamines',
  'Blood pressure, cholesterol, and thyroid medications (if previously diagnosed)',
  'Inhalers and asthma medications',
  'Pain relief — ibuprofen, naproxen, paracetamol (non-controlled only)',
  'Contraceptives and hormone therapy',
  'Skin treatments and topical medications',
  'Medical certificates, ACC forms, and referrals',
]

const CANNOT_PRESCRIBE = [
  'Opioids — codeine, tramadol, morphine, oxycodone, fentanyl',
  'Benzodiazepines — Valium, Xanax, temazepam, zopiclone',
  'Stimulants — Ritalin, Adderall, dexamphetamine',
  'Sleeping medications — zopiclone, nitrazepam',
  'GLP-1 weight loss injections — Ozempic, Wegovy, semaglutide (require specialist monitoring)',
]

export default function PrescribingLimits() {
  const navigate = useNavigate()
  const [rxChecked, setRxChecked] = useState(false)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleResearch(granted) {
    if (!rxChecked) return
    setSaving(true)
    sessionStorage.setItem('research_consent', granted ? 'yes' : 'no')
    const consultationId = sessionStorage.getItem('consultation_id')
    const now = new Date().toISOString()
    try {
      await Promise.allSettled([
        apiFetch('/api/consents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consultation_id: consultationId || null, consent_type: 'prescribing_limitations_acknowledged', granted: true }),
        }),
        apiFetch('/api/consents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consultation_id: consultationId || null, consent_type: 'research_consent', granted }),
        }),
      ])
      if (consultationId) {
        await supabase.from('consultations').update({
          prescribing_consent_at: now,
          research_consent: granted,
        }).eq('id', consultationId)
      }
    } catch {}
    navigate('/triage')
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F0F2F5', fontFamily: 'Plus Jakarta Sans, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <nav style={{ background: '#0D2B45', padding: '.875rem 1.5rem', paddingTop: 'calc(.875rem + env(safe-area-inset-top, 0px))', flexShrink: 0 }}>
        <span onClick={() => navigate('/')} style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.3rem', cursor: 'pointer', userSelect: 'none', transition: 'opacity .15s' }} onMouseEnter={e => e.currentTarget.style.opacity = '.8'} onMouseLeave={e => e.currentTarget.style.opacity = '1'} role="link" aria-label="Tere Health — go to home">Tere</span>
      </nav>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1rem', maxWidth: 600, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#0B6E76', fontSize: '.875rem', marginBottom: '.25rem' }}>Step 2 of 2</div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0D2B45', marginBottom: '.25rem' }}>What we can and cannot prescribe</h2>
          <p style={{ fontSize: '.8125rem', color: '#6B7280', lineHeight: 1.5, margin: 0 }}>Telehealth cannot replace some prescribing that requires in-person assessment. Please read the limitations below.</p>
        </div>

        {/* Section A — Prescribing limitations */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: '.75rem' }}>
          <div style={{ padding: '1rem 1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: '.5rem' }}>
              <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>💊</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '.9375rem', color: '#0D2B45', marginBottom: 2 }}>Prescribing limitations</div>
                <div style={{ fontSize: '.8125rem', color: '#6B7280', lineHeight: 1.5 }}>We can prescribe most common medications, but controlled drugs and GLP-1 injections are not available via telehealth.</div>
              </div>
            </div>

            <button onClick={() => setOpen(o => !o)}
              style={{ background: 'none', border: 'none', padding: 0, color: '#0B6E76', fontSize: '.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', display: 'flex', alignItems: 'center', gap: 4, marginBottom: '.875rem' }}>
              {open ? 'Hide details ▲' : 'Show details ▼'}
            </button>

            {open && (
              <div style={{ marginBottom: '.875rem', display: 'flex', flexDirection: 'column', gap: '.625rem' }}>
                <div style={{ background: '#F0FDF4', borderRadius: 8, border: '1px solid #BBF7D0', padding: '.625rem .875rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '.75rem', color: '#065F46', marginBottom: '.375rem' }}>✅ We can prescribe</div>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                    {CAN_PRESCRIBE.map((item, i) => (
                      <li key={i} style={{ fontSize: '.75rem', color: '#374151', lineHeight: 1.5 }}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div style={{ background: '#FEF3C7', borderRadius: 8, border: '1px solid #FDE68A', padding: '.625rem .875rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '.75rem', color: '#92400E', marginBottom: '.375rem' }}>⚠️ We cannot prescribe via telehealth</div>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                    {CANNOT_PRESCRIBE.map((item, i) => (
                      <li key={i} style={{ fontSize: '.75rem', color: '#78350F', lineHeight: 1.5 }}>{item}</li>
                    ))}
                  </ul>
                  <div style={{ fontSize: '.6875rem', color: '#92400E', marginTop: '.375rem' }}>Required by the Misuse of Drugs Act 1975. See your GP or specialist for these medications.</div>
                </div>
              </div>
            )}

            <label
              data-testid="prescribing-acknowledge"
              onClick={() => setRxChecked(c => !c)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <div style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${rxChecked ? '#059669' : '#D1D5DB'}`, background: rxChecked ? '#059669' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                {rxChecked && <span style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{ fontSize: '.875rem', color: '#374151', lineHeight: 1.5 }}>I understand that controlled drugs (opioids, benzodiazepines, stimulants) and GLP-1 injections cannot be prescribed via telehealth.</span>
            </label>
          </div>
        </div>

        {/* Section B — Optional research consent */}
        <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${rxChecked ? '#BBF7D0' : '#E2E8F0'}`, padding: '1rem 1.25rem', marginBottom: '.75rem', transition: 'border-color .2s' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: '.75rem' }}>
            <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>🔬</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '.9375rem', color: '#0D2B45', marginBottom: 2 }}>
                Help improve rural healthcare{' '}
                <span style={{ fontSize: '.75rem', color: '#6B7280', fontWeight: 400 }}>(optional)</span>
              </div>
              <div style={{ fontSize: '.8125rem', color: '#6B7280', lineHeight: 1.5 }}>
                Would you be willing for your <strong>de-identified data</strong> (no name, no contact details) to contribute to NZ rural health research? This is completely optional and will not affect your care.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '.625rem' }}>
            <button
              onClick={() => handleResearch(true)}
              disabled={!rxChecked || saving}
              style={{ flex: 1, padding: '.875rem', borderRadius: 10, border: 'none', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: '.9375rem', cursor: rxChecked ? 'pointer' : 'default', background: rxChecked ? '#0B6E76' : '#E2E8F0', color: rxChecked ? 'white' : '#9CA3AF', transition: 'background .15s, color .15s' }}>
              {saving ? '…' : '✓ Yes, I\'m happy to contribute'}
            </button>
            <button
              onClick={() => handleResearch(false)}
              disabled={!rxChecked || saving}
              style={{ flex: 'none', padding: '.875rem 1.25rem', borderRadius: 10, border: `1.5px solid ${rxChecked ? '#D1D5DB' : '#E2E8F0'}`, fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600, fontSize: '.9375rem', cursor: rxChecked ? 'pointer' : 'default', background: 'white', color: rxChecked ? '#6B7280' : '#9CA3AF', transition: 'all .15s' }}>
              Skip →
            </button>
          </div>

          {!rxChecked && (
            <p style={{ fontSize: '.75rem', color: '#9CA3AF', textAlign: 'center', margin: '.625rem 0 0', lineHeight: 1.4 }}>
              Tick the prescribing limitations box above to continue
            </p>
          )}
        </div>

        <div style={{ marginTop: '.75rem', textAlign: 'center', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <p style={{ fontSize: '.8125rem', color: '#9CA3AF', margin: 0 }}>Emergency? Call <strong>111</strong></p>
          <p style={{ fontSize: '.8125rem', color: '#9CA3AF', margin: 0 }}>Mental health crisis? Call or text <strong>1737</strong></p>
        </div>
      </div>
    </div>
  )
}
