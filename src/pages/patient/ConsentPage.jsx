import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, patientUpdateConsultation } from '../../lib/supabase'

export default function ConsentPage() {
  const navigate = useNavigate()
  const [hdcChecked, setHdcChecked]           = useState(false)
  const [prescribingChecked, setPrescribingChecked] = useState(false)
  const [researchConsent, setResearchConsent] = useState(null) // null | true | false
  const [saving, setSaving]                   = useState(false)

  const canContinue = hdcChecked && prescribingChecked && !saving

  async function handleContinue() {
    if (!canContinue) return
    setSaving(true)
    const granted = researchConsent === true
    sessionStorage.setItem('research_consent', granted ? 'yes' : 'no')
    sessionStorage.setItem('bg_rppg_consent', '1')
    const consultationId = sessionStorage.getItem('consultation_id')
    const now = new Date().toISOString()
    try {
      const rows = [
        { consultation_id: consultationId || null, consent_type: 'hdc_code_of_rights',                  granted: true,    timestamp: now },
        { consultation_id: consultationId || null, consent_type: 'prescribing_limitations_acknowledged', granted: true,    timestamp: now },
        { consultation_id: consultationId || null, consent_type: 'research_consent',                    granted,          timestamp: now },
      ]
      await supabase.from('consents').insert(rows)
      if (consultationId) {
        await patientUpdateConsultation(consultationId, {
          research_consent:        granted,
          hdc_consent_at:          now,
          prescribing_consent_at:  now,
        })
      }
    } catch {}
    navigate('/triage')
  }

  function Checkbox({ checked, onChange, label, testId }) {
    return (
      <label onClick={onChange} data-testid={testId}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${checked ? '#059669' : '#D1D5DB'}`, background: checked ? '#059669' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, transition: 'all .15s' }}>
          {checked && <span style={{ color: 'white', fontSize: 13, fontWeight: 700, lineHeight: 1 }}>✓</span>}
        </div>
        <span style={{ fontSize: '.875rem', color: '#374151', lineHeight: 1.5 }}>{label}</span>
      </label>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F0F2F5', fontFamily: 'Plus Jakarta Sans, sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <nav style={{ background: '#0D2B45', padding: '.875rem 1.5rem', paddingTop: 'calc(.875rem + env(safe-area-inset-top, 0px))', flexShrink: 0 }}>
        <span onClick={() => navigate('/')} style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.3rem', cursor: 'pointer', userSelect: 'none' }} role="link" aria-label="Tere Health — home">Tere</span>
      </nav>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1rem 2rem', maxWidth: 600, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {/* Header */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0D2B45', marginBottom: '.25rem' }}>Before we begin</h2>
          <p style={{ fontSize: '.875rem', color: '#6B7280', margin: 0 }}>Please read and agree to the following</p>
        </div>

        {/* Section 1 — HDC rights */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.75rem' }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0D2B45', marginBottom: '.625rem' }}>Your rights as a patient</div>
          <p style={{ fontSize: '.875rem', color: '#6B7280', lineHeight: 1.6, margin: '0 0 .875rem' }}>
            As a patient using Tere Health you have the following rights under the NZ Health and Disability Commissioner Code of Rights:
          </p>
          <ul style={{ margin: '0 0 .875rem', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.375rem' }}>
            {[
              'Right to be treated with respect',
              'Right to receive information',
              'Right to make an informed choice',
              'Right to give informed consent',
              'Right to complain',
            ].map(r => (
              <li key={r} style={{ fontSize: '.875rem', color: '#374151', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#059669', fontWeight: 700, flexShrink: 0 }}>✓</span>
                {r}
              </li>
            ))}
          </ul>
          <a href="https://www.hdc.org.nz/your-rights/about-the-code/code-of-health-and-disability-services-consumers-rights/" target="_blank" rel="noreferrer"
            style={{ display: 'inline-block', fontSize: '.8125rem', color: '#0B6E76', fontWeight: 600, marginBottom: '1rem', textDecoration: 'none' }}>
            Read the full HDC Code of Rights →
          </a>
          <Checkbox
            checked={hdcChecked}
            onChange={() => setHdcChecked(c => !c)}
            label="I understand my rights as a patient"
            testId="hdc-consent-checkbox"
          />
        </div>

        {/* Section 2 — Prescribing limitations */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.75rem' }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0D2B45', marginBottom: '.625rem' }}>Prescribing limitations</div>
          <p style={{ fontSize: '.875rem', color: '#6B7280', lineHeight: 1.6, margin: '0 0 .875rem' }}>
            Tere Health providers can prescribe many medications for acute conditions. However we are unable to prescribe via telehealth:
          </p>
          <ul style={{ margin: '0 0 .875rem', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {[
              ['Opioid pain medications', 'codeine, tramadol, morphine, oxycodone'],
              ['Benzodiazepines', 'diazepam, lorazepam, temazepam'],
              ['GLP-1 medications', 'Ozempic, Wegovy, semaglutide'],
              ['Controlled drugs of any kind', ''],
              ['Stimulant medications', 'Ritalin, Adderall, dexamphetamine'],
              ['Sleeping medications', 'zopiclone, zolpidem'],
            ].map(([name, examples]) => (
              <li key={name} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#F59E0B', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>—</span>
                <span style={{ fontSize: '.875rem', color: '#374151' }}>
                  {name}{examples ? <span style={{ color: '#9CA3AF' }}> ({examples})</span> : ''}
                </span>
              </li>
            ))}
          </ul>
          <p style={{ fontSize: '.8125rem', color: '#6B7280', lineHeight: 1.6, margin: '0 0 1rem' }}>
            For these medications please contact your regular GP or visit an in-person clinic.
          </p>
          <Checkbox
            checked={prescribingChecked}
            onChange={() => setPrescribingChecked(c => !c)}
            label="I understand these prescribing limitations"
            testId="prescribing-acknowledge"
          />
        </div>

        {/* Section 3 — Research (optional) */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', padding: '1.25rem', marginBottom: '.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '.5rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🌿</span>
            <div>
              <span style={{ fontWeight: 700, fontSize: '1rem', color: '#0D2B45' }}>Help improve rural healthcare </span>
              <span style={{ fontSize: '.8125rem', color: '#9CA3AF', fontWeight: 400 }}>(optional)</span>
            </div>
          </div>
          <p style={{ fontSize: '.875rem', color: '#6B7280', lineHeight: 1.6, margin: '0 0 1rem' }}>
            Would you be willing for your <strong>de-identified data</strong> (no name, no contact details, no NHI) to contribute to NZ rural health research? This helps improve healthcare for rural communities across Aotearoa.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginBottom: '.75rem' }}>
            <button
              data-testid="research-yes"
              onClick={() => setResearchConsent(true)}
              style={{ padding: '.75rem 1rem', borderRadius: 10, border: `2px solid ${researchConsent === true ? '#0B6E76' : '#E2E8F0'}`, background: researchConsent === true ? '#EFF9F9' : 'white', color: researchConsent === true ? '#0B6E76' : '#374151', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600, fontSize: '.9375rem', cursor: 'pointer', textAlign: 'left', transition: 'all .15s' }}>
              ✓ Yes, I'm happy to contribute
            </button>
            <button
              data-testid="research-no"
              onClick={() => setResearchConsent(false)}
              style={{ padding: '.5rem', background: 'none', border: 'none', color: researchConsent === false ? '#374151' : '#9CA3AF', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 500, fontSize: '.875rem', cursor: 'pointer', textDecoration: researchConsent === false ? 'underline' : 'none' }}>
              Skip →
            </button>
          </div>
          <p style={{ fontSize: '.75rem', color: '#9CA3AF', margin: 0, lineHeight: 1.5 }}>
            Your decision won't affect your care. You can withdraw consent at any time by contacting{' '}
            <a href="mailto:terehealthnz@gmail.com" style={{ color: '#9CA3AF' }}>terehealthnz@gmail.com</a>
          </p>
        </div>

        {/* Section 4 — Camera / vitals notice */}
        <div style={{ background: '#EFF6FF', borderRadius: 12, border: '1px solid #BFDBFE', padding: '1rem 1.25rem', marginBottom: '.75rem', display: 'flex', gap: '.75rem', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '1.25rem', flexShrink: 0, marginTop: 1 }}>📷</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '.9375rem', color: '#1E40AF', marginBottom: '.25rem' }}>Camera used for vitals</div>
            <p style={{ fontSize: '.875rem', color: '#1D4ED8', lineHeight: 1.5, margin: 0 }}>
              For accurate vitals, Tere may use your camera during the consultation. <strong>No video is recorded</strong> — only anonymised colour measurements are used to estimate heart rate and blood oxygen.
            </p>
          </div>
        </div>

        {/* Emergency links */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <p style={{ fontSize: '.8125rem', color: '#9CA3AF', margin: 0 }}>Emergency? Call <strong>111</strong></p>
          <p style={{ fontSize: '.8125rem', color: '#9CA3AF', margin: 0 }}>Mental health crisis? Call or text <strong>1737</strong></p>
        </div>

        {/* Continue button */}
        <button
          data-testid="consent-continue"
          onClick={handleContinue}
          disabled={!canContinue}
          style={{ width: '100%', height: 56, borderRadius: 12, border: 'none', background: canContinue ? '#0B6E76' : '#E2E8F0', color: canContinue ? 'white' : '#9CA3AF', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: '1rem', cursor: canContinue ? 'pointer' : 'default', transition: 'background .2s, color .2s' }}>
          {saving ? 'Saving…' : 'Continue →'}
        </button>

        {!hdcChecked || !prescribingChecked ? (
          <p style={{ fontSize: '.8125rem', color: '#9CA3AF', textAlign: 'center', margin: '.75rem 0 0', lineHeight: 1.4 }}>
            Tick both required boxes above to continue
          </p>
        ) : null}
      </div>
    </div>
  )
}
