import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { t } from '../../lib/i18n'

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
  'Controlled drugs — opioids (codeine, tramadol, morphine, oxycodone, fentanyl), benzodiazepines (Valium, Xanax, temazepam), stimulants (Ritalin, Adderall, dexamphetamine)',
  'GLP-1 weight loss injections — Ozempic, Wegovy, semaglutide (require specialist monitoring)',
]

function AccordionCard({ icon, title, summary, children, checked, onCheck, checkLabel }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: '.75rem' }}>
      <div style={{ padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: '.5rem' }}>
          <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '.9375rem', color: '#0D2B45', marginBottom: 2 }}>{title}</div>
            <div style={{ fontSize: '.8125rem', color: '#6B7280', lineHeight: 1.5 }}>{summary}</div>
          </div>
        </div>

        <button onClick={() => setOpen(o => !o)}
          style={{ background: 'none', border: 'none', padding: 0, color: '#0B6E76', fontSize: '.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', display: 'flex', alignItems: 'center', gap: 4, marginBottom: '.875rem' }}>
          {open ? 'Hide details ▲' : 'Show details ▼'}
        </button>

        {open && (
          <div style={{ marginBottom: '.875rem' }}>
            {children}
          </div>
        )}

        <label onClick={() => onCheck(c => !c)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <div
            style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${checked ? '#059669' : '#D1D5DB'}`, background: checked ? '#059669' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
            {checked && <span style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>✓</span>}
          </div>
          <span style={{ fontSize: '.875rem', color: '#374151', lineHeight: 1.5 }}>{checkLabel}</span>
        </label>
      </div>
    </div>
  )
}

export default function ConsentGate({ onAccepted, lang = 'en', patientName, consultationId }) {
  const navigate = useNavigate()
  const [hdcChecked, setHdcChecked] = useState(false)
  const [rxChecked, setRxChecked] = useState(false)
  const [researchChecked, setResearchChecked] = useState(false)
  const [saving, setSaving] = useState(false)
  const bothChecked = hdcChecked && rxChecked

  async function handleAccept() {
    if (!bothChecked) return
    setSaving(true)
    sessionStorage.setItem('research_consent', researchChecked ? 'yes' : 'no')
    try {
      await Promise.allSettled([
        apiFetch('/api/consents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consultation_id: consultationId || null, consent_type: 'hdc_code_of_rights', granted: true, patient_name: patientName || null }),
        }),
        apiFetch('/api/consents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consultation_id: consultationId || null, consent_type: 'prescribing_limitations_acknowledged', granted: true, patient_name: patientName || null }),
        }),
      ])
    } catch {}
    onAccepted()
    setSaving(false)
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F0F2F5', fontFamily: 'Plus Jakarta Sans, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <nav style={{ background: '#0D2B45', padding: '.875rem 1.5rem', paddingTop: 'calc(.875rem + env(safe-area-inset-top, 0px))', flexShrink: 0 }}>
        <span onClick={() => navigate('/')} style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.3rem', cursor: 'pointer', userSelect: 'none', transition: 'opacity .15s' }} onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'} role="link" aria-label="Tere Health — go to home">Tere</span>
      </nav>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1rem', maxWidth: 600, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#0B6E76', fontSize: '.875rem', marginBottom: '.25rem' }}>Before we begin</div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0D2B45', marginBottom: '.25rem' }}>A few things to confirm</h2>
          <p style={{ fontSize: '.8125rem', color: '#6B7280', lineHeight: 1.5 }}>Tick the first two boxes to continue — tap "Show details" if you'd like to read more.</p>
        </div>

        <AccordionCard
          icon="⚖️"
          title="Your rights as a health consumer"
          summary="Under the Health and Disability Commissioner Code of Rights, you have 8 important rights as a patient."
          checked={hdcChecked}
          onCheck={setHdcChecked}
          checkLabel="I have read and understand my rights as a health consumer under the HDC Code of Rights."
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.375rem' }}>
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
        </AccordionCard>

        <AccordionCard
          icon="💊"
          title="What Tere Health can and cannot prescribe"
          summary="We can prescribe most common medications, but controlled drugs and GLP-1 injections are not available via telehealth."
          checked={rxChecked}
          onCheck={setRxChecked}
          checkLabel="I understand that controlled drugs (opioids, benzodiazepines, stimulants) and GLP-1 injections (Ozempic/Wegovy) cannot be prescribed via telehealth."
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.625rem' }}>
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
        </AccordionCard>

        {/* Research consent — optional */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', padding: '1rem 1.25rem', marginBottom: '.75rem' }}>
          <label onClick={() => setResearchChecked(c => !c)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <div
              style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${researchChecked ? '#059669' : '#D1D5DB'}`, background: researchChecked ? '#059669' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
              {researchChecked && <span style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>✓</span>}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '.9375rem', color: '#0D2B45', marginBottom: 2 }}>🔬 Support NZ health research <span style={{ fontSize: '.75rem', color: '#6B7280', fontWeight: 400 }}>(optional)</span></div>
              <div style={{ fontSize: '.8125rem', color: '#6B7280', lineHeight: 1.5 }}>I'm willing for my de-identified data (no name, no contact details) to contribute to NZ rural health research. This is completely optional and will not affect my care.</div>
            </div>
          </label>
        </div>

        <button onClick={handleAccept} disabled={!bothChecked || saving}
          style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: '1rem', cursor: bothChecked ? 'pointer' : 'default', background: bothChecked ? '#0B6E76' : '#E2E8F0', color: bothChecked ? 'white' : '#9CA3AF', marginBottom: '2rem', transition: 'background .15s, color .15s' }}>
          {saving ? 'Saving…' : 'Continue →'}
        </button>
      </div>
    </div>
  )
}
