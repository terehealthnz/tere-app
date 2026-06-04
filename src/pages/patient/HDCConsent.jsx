import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { supabase } from '../../lib/supabase'

const HDC_RIGHTS = [
  { num: '1', title: 'Right to be treated with respect', desc: 'Your dignity and privacy will be respected at all times.' },
  { num: '2', title: 'Right to fair treatment', desc: 'No discrimination based on age, gender, ethnicity, disability, religion, or sexual orientation.' },
  { num: '3', title: 'Right to dignity and independence', desc: 'Your cultural, religious, and ethical beliefs will be respected.' },
  { num: '4', title: 'Right to proper standards', desc: 'Services will meet professional and ethical standards.' },
  { num: '5', title: 'Right to information', desc: "You'll receive information in a way you can understand — including diagnosis, treatment options, and risks." },
  { num: '6', title: 'Right to informed choice', desc: 'You can make informed decisions and refuse or withdraw consent at any time.' },
  { num: '7', title: 'Right to support', desc: 'You may have a support person present during consultations.' },
  { num: '8', title: 'Right to complain', desc: 'You can complain without it affecting your care. Contact the HDC at hdc.org.nz or 0800 11 22 33.' },
]

export default function HDCConsent() {
  const navigate = useNavigate()
  const [checked, setChecked] = useState(false)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleContinue() {
    if (!checked) return
    setSaving(true)
    const consultationId = sessionStorage.getItem('consultation_id')
    const now = new Date().toISOString()
    try {
      await apiFetch('/api/consents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultation_id: consultationId || null, consent_type: 'hdc_code_of_rights', granted: true }),
      })
      if (consultationId) {
        await supabase.from('consultations').update({ hdc_consent_at: now }).eq('id', consultationId)
      }
    } catch {}
    navigate('/prescribing-limits')
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F0F2F5', fontFamily: 'Plus Jakarta Sans, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <nav style={{ background: '#0D2B45', padding: '.875rem 1.5rem', paddingTop: 'calc(.875rem + env(safe-area-inset-top, 0px))', flexShrink: 0 }}>
        <span onClick={() => navigate('/')} style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.3rem', cursor: 'pointer', userSelect: 'none', transition: 'opacity .15s' }} onMouseEnter={e => e.currentTarget.style.opacity = '.8'} onMouseLeave={e => e.currentTarget.style.opacity = '1'} role="link" aria-label="Tere Health — go to home">Tere</span>
      </nav>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1rem', maxWidth: 600, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#0B6E76', fontSize: '.875rem', marginBottom: '.25rem' }}>Step 1 of 2</div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0D2B45', marginBottom: '.25rem' }}>Your rights as a patient</h2>
          <p style={{ fontSize: '.8125rem', color: '#6B7280', lineHeight: 1.5, margin: 0 }}>Under the Health and Disability Commissioner Code of Rights, you have 8 important rights as a patient in New Zealand.</p>
        </div>

        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: '.75rem' }}>
          <div style={{ padding: '1rem 1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: '.5rem' }}>
              <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>⚖️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '.9375rem', color: '#0D2B45', marginBottom: 2 }}>HDC Code of Rights</div>
                <div style={{ fontSize: '.8125rem', color: '#6B7280', lineHeight: 1.5 }}>You have 8 important rights as a health consumer.</div>
              </div>
            </div>

            <button onClick={() => setOpen(o => !o)}
              style={{ background: 'none', border: 'none', padding: 0, color: '#0B6E76', fontSize: '.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', display: 'flex', alignItems: 'center', gap: 4, marginBottom: '.875rem' }}>
              {open ? 'Hide details ▲' : 'Show details ▼'}
            </button>

            {open && (
              <div style={{ marginBottom: '.875rem', display: 'flex', flexDirection: 'column', gap: '.375rem' }}>
                {HDC_RIGHTS.map(r => (
                  <div key={r.num} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#EFF9F9', color: '#0B6E76', fontWeight: 700, fontSize: '.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{r.num}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '.8125rem', color: '#0D2B45' }}>{r.title}</div>
                      <div style={{ fontSize: '.75rem', color: '#6B7280', lineHeight: 1.5 }}>{r.desc}</div>
                    </div>
                  </div>
                ))}
                <a href="https://hdc.org.nz/your-rights/the-code-and-your-rights/" target="_blank" rel="noreferrer"
                  style={{ color: '#0B6E76', fontSize: '.75rem', fontWeight: 600, marginTop: '.25rem', display: 'inline-block' }}>
                  Read full HDC Code of Rights →
                </a>
              </div>
            )}

            <label
              data-testid="hdc-consent-checkbox"
              onClick={() => setChecked(c => !c)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <div style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${checked ? '#059669' : '#D1D5DB'}`, background: checked ? '#059669' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                {checked && <span style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{ fontSize: '.875rem', color: '#374151', lineHeight: 1.5 }}>I have read and understand my rights as a health consumer under the HDC Code of Rights.</span>
            </label>
          </div>
        </div>

        <button
          data-testid="hdc-consent-continue"
          onClick={handleContinue}
          disabled={!checked || saving}
          style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: '1rem', cursor: checked ? 'pointer' : 'default', background: checked ? '#0B6E76' : '#E2E8F0', color: checked ? 'white' : '#9CA3AF', marginBottom: '2rem', transition: 'background .15s, color .15s' }}>
          {saving ? 'Saving…' : 'Continue →'}
        </button>

        <div style={{ marginTop: '.75rem', textAlign: 'center', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <p style={{ fontSize: '.8125rem', color: '#9CA3AF', margin: 0 }}>Emergency? Call <strong>111</strong></p>
          <p style={{ fontSize: '.8125rem', color: '#9CA3AF', margin: 0 }}>Mental health crisis? Call or text <strong>1737</strong></p>
        </div>
      </div>
    </div>
  )
}
