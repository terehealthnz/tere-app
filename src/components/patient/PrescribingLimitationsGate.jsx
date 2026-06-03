import React, { useState } from 'react'
import { apiFetch } from '../../lib/api'
import { t } from '../../lib/i18n'

const CAN_PRESCRIBE = [
  'Antibiotics and antifungals for common infections',
  'Blood pressure, cholesterol, and thyroid medications (if previously diagnosed)',
  'Inhalers and asthma medications',
  'Skin treatments, antihistamines, and allergy medications',
  'Pain relief — e.g. ibuprofen, naproxen, paracetamol (non-controlled only)',
  'Contraceptives and hormone therapy',
  'Medical certificates, ACC claim forms, and specialist referrals',
]

const CANNOT_PRESCRIBE = [
  'Controlled drugs under the Misuse of Drugs Act — including opioids (codeine, tramadol, morphine, oxycodone, fentanyl), benzodiazepines (diazepam/Valium, temazepam, Xanax), and stimulants (Ritalin/methylphenidate, Adderall, dexamphetamine)',
  'GLP-1 weight loss injections — Ozempic, Wegovy, semaglutide — which require specialist oversight and ongoing clinical monitoring',
  'Any controlled substance requiring an in-person relationship under New Zealand law',
]

export default function PrescribingLimitationsGate({ onAccepted, lang = 'en', patientName, consultationId }) {
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
          consent_type: 'prescribing_limitations_acknowledged',
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
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#0B6E76', fontSize: '.875rem', marginBottom: '.5rem' }}>
            {t('prescribing_gate_intro', lang)}
          </div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0D2B45', marginBottom: '.5rem' }}>
            {t('prescribing_gate_title', lang)}
          </h2>
          <p style={{ fontSize: '.875rem', color: '#6B7280', lineHeight: 1.6, marginBottom: 0 }}>
            {t('prescribing_gate_body', lang)}
          </p>
        </div>

        {/* What we CAN prescribe */}
        <div style={{ background: '#F0FDF4', borderRadius: 10, border: '1px solid #BBF7D0', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, fontSize: '.875rem', color: '#065F46', marginBottom: '.625rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '1rem' }}>✅</span> What we can prescribe
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '.375rem' }}>
            {CAN_PRESCRIBE.map((item, i) => (
              <li key={i} style={{ fontSize: '.8125rem', color: '#374151', lineHeight: 1.5 }}>{item}</li>
            ))}
          </ul>
        </div>

        {/* What we CANNOT prescribe */}
        <div style={{ background: '#FEF3C7', borderRadius: 10, border: '1px solid #FDE68A', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, fontSize: '.875rem', color: '#92400E', marginBottom: '.625rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '1rem' }}>⚠️</span> What we cannot prescribe via telehealth
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {CANNOT_PRESCRIBE.map((item, i) => (
              <li key={i} style={{ fontSize: '.8125rem', color: '#78350F', lineHeight: 1.5 }}>{item}</li>
            ))}
          </ul>
          <div style={{ marginTop: '.75rem', fontSize: '.75rem', color: '#92400E', borderTop: '1px solid #FDE68A', paddingTop: '.625rem' }}>
            <strong>Why?</strong> New Zealand law (Misuse of Drugs Act 1975) requires an in-person clinical relationship before controlled drugs may be prescribed. If you need these medications, your GP or a specialist can assist.
          </div>
        </div>

        {/* Checkbox */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <div onClick={() => setAccepted(a => !a)} style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${accepted ? '#059669' : '#D1D5DB'}`, background: accepted ? '#059669' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
              {accepted && <span style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>✓</span>}
            </div>
            <span style={{ fontSize: '.9rem', color: '#374151', lineHeight: 1.5 }}>
              {t('prescribing_gate_checkbox', lang)}
            </span>
          </label>
        </div>

        <button onClick={handleAccept} disabled={!accepted || saving}
          style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: '1rem', cursor: accepted ? 'pointer' : 'default', background: accepted ? '#0B6E76' : '#E2E8F0', color: accepted ? 'white' : '#9CA3AF', marginBottom: '2rem' }}>
          {saving ? 'Saving…' : t('prescribing_gate_button', lang)}
        </button>
      </div>
    </div>
  )
}
