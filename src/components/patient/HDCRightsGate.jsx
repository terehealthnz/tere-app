import React, { useState } from 'react'
import { apiFetch } from '../../lib/api'

const RIGHTS = [
  { num: '1', title: 'Right to be treated with respect', desc: 'Every patient has the right to be treated with respect, including the right to have your dignity and privacy respected.' },
  { num: '2', title: 'Right to fair treatment', desc: 'You have the right to receive services without discrimination based on age, gender, ethnicity, disability, religion, or sexual orientation.' },
  { num: '3', title: 'Right to dignity and independence', desc: 'You have the right to have your cultural, religious, and ethical beliefs respected.' },
  { num: '4', title: 'Right to proper standards', desc: 'You have the right to services that meet professional and ethical standards.' },
  { num: '5', title: 'Right to information', desc: 'You have the right to receive information in a way you can understand — including your diagnosis, treatment options, and risks.' },
  { num: '6', title: 'Right to make an informed choice', desc: 'You have the right to make an informed decision about your care, and the right to refuse treatment or withdraw consent at any time.' },
  { num: '7', title: 'Right to support', desc: 'You have the right to have a support person present during consultations.' },
  { num: '8', title: 'Right to complain', desc: 'You have the right to complain about your care without it affecting your treatment. Complaints can be made to your provider, or to the HDC.' },
]

export default function HDCRightsGate({ onAccepted, lang = 'en', patientName, consultationId }) {
  const [accepted, setAccepted] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleAccept() {
    if (!accepted) return
    setSaving(true)
    try {
      await apiFetch('/api/consents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultation_id: consultationId || null,
          consent_type: 'hdc_code_of_rights',
          granted: true,
          patient_name: patientName || null,
        }),
      })
    } catch {}
    onAccepted()
    setSaving(false)
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F0F2F5', fontFamily: 'Plus Jakarta Sans, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <nav style={{ background: '#0D2B45', padding: '.875rem 1.5rem', flexShrink: 0 }}>
        <span style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.3rem' }}>Tere</span>
      </nav>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1rem', maxWidth: 600, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', padding: '1.5rem', marginBottom: '1rem' }}>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#0B6E76', fontSize: '.875rem', marginBottom: '.5rem' }}>Before we begin</div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0D2B45', marginBottom: '.5rem' }}>Your rights as a health consumer</h2>
          <p style={{ fontSize: '.875rem', color: '#6B7280', lineHeight: 1.6, marginBottom: 0 }}>
            Under the Health and Disability Commissioner Code of Rights, you have important rights as a patient. Please read these before proceeding.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginBottom: '1rem' }}>
          {RIGHTS.map(r => (
            <div key={r.num} style={{ background: 'white', borderRadius: 10, border: '1px solid #E2E8F0', padding: '.875rem 1rem' }}>
              <div style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-start' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#EFF9F9', color: '#0B6E76', fontWeight: 700, fontSize: '.8125rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{r.num}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '.875rem', color: '#0D2B45', marginBottom: 2 }}>{r.title}</div>
                  <div style={{ fontSize: '.8125rem', color: '#6B7280', lineHeight: 1.5 }}>{r.desc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '1rem' }}>
          <a href="https://hdc.org.nz/your-rights/the-code-and-your-rights/" target="_blank" rel="noreferrer"
            style={{ color: '#0B6E76', fontSize: '.875rem', fontWeight: 600 }}>
            📄 Read the full HDC Code of Rights at hdc.org.nz →
          </a>
          <div style={{ marginTop: '.875rem', fontSize: '.8125rem', color: '#6B7280', lineHeight: 1.5 }}>
            <strong>How to complain:</strong> Speak with your provider, or contact the HDC at{' '}
            <a href="https://hdc.org.nz/complaints" target="_blank" rel="noreferrer" style={{ color: '#0B6E76' }}>hdc.org.nz/complaints</a> or 0800 11 22 33.
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <div onClick={() => setAccepted(a => !a)} style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${accepted ? '#059669' : '#D1D5DB'}`, background: accepted ? '#059669' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
              {accepted && <span style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>✓</span>}
            </div>
            <span style={{ fontSize: '.9rem', color: '#374151', lineHeight: 1.5 }}>
              I have read and understand my rights as a health consumer under the Health and Disability Commissioner Code of Rights.
            </span>
          </label>
        </div>

        <button onClick={handleAccept} disabled={!accepted || saving}
          style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: '1rem', cursor: accepted ? 'pointer' : 'default', background: accepted ? '#0B6E76' : '#E2E8F0', color: accepted ? 'white' : '#9CA3AF', marginBottom: '2rem' }}>
          {saving ? 'Saving…' : 'I understand my rights — continue'}
        </button>
      </div>
    </div>
  )
}
