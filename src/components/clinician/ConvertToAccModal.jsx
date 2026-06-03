import React, { useState } from 'react'
import { apiFetch } from '../../lib/api'

const ACC_READ_CODES = [
  { code: 'S30', label: 'Ankle sprain' },
  { code: 'S39', label: 'Other ankle injury' },
  { code: 'M13', label: 'Laceration' },
  { code: 'M10', label: 'Contusion / bruise' },
  { code: 'S20', label: 'Wrist sprain' },
  { code: 'A84', label: 'Back pain' },
  { code: 'S60', label: 'Finger injury' },
  { code: 'F29', label: 'Eye injury' },
  { code: 'T14', label: 'Burn' },
  { code: 'K22', label: 'Chest pain' },
  { code: 'A09', label: 'Headache' },
  { code: 'N17', label: 'UTI' },
]

const BODY_PARTS = [
  'Head', 'Face / skull', 'Eye', 'Ear', 'Jaw / dental',
  'Neck / cervical spine', 'Shoulder', 'Upper arm', 'Elbow',
  'Forearm', 'Wrist', 'Hand / fingers / thumb',
  'Chest / ribs / sternum', 'Thoracic spine', 'Abdomen',
  'Lumbar spine / lower back', 'Pelvis / hip',
  'Thigh', 'Knee', 'Lower leg / shin', 'Ankle',
  'Foot / heel / toes', 'Skin / superficial tissue',
  'Multiple body parts',
]

const inp = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.875rem', outline: 'none' }
const lbl = { display: 'block', fontSize: '.75rem', fontWeight: 600, color: '#6B7280', marginBottom: 4 }

export default function ConvertToAccModal({ consult, onClose, onSuccess }) {
  const today = new Date().toISOString().slice(0, 10)
  const [injuryDate, setInjuryDate]   = useState(today)
  const [mechanism, setMechanism]     = useState('')
  const [bodyPart, setBodyPart]       = useState('')
  const [workRelated, setWorkRelated] = useState('no')
  const [employer, setEmployer]       = useState(consult?.acc_employer || '')
  const [readCode, setReadCode]       = useState('')
  const [converting, setConverting]   = useState(false)
  const [done, setDone]               = useState(false)
  const [paymentNote, setPaymentNote] = useState('')

  async function handleConvert() {
    if (!mechanism.trim() || !bodyPart || !readCode) return
    setConverting(true)
    try {
      const res = await apiFetch('/api/convert-to-acc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultationId: consult.id,
          injuryDate,
          mechanism: mechanism.trim(),
          bodyPart,
          workRelated,
          employer: workRelated === 'yes' ? employer.trim() : '',
          readCode,
          readCodeLabel: ACC_READ_CODES.find(c => c.code === readCode)?.label || '',
          providerId: sessionStorage.getItem('providerId') || '',
          providerName: sessionStorage.getItem('providerDisplayName') || '',
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setDone(true)
        setPaymentNote(data.paymentNote || '')
        onSuccess?.({ injuryDate, mechanism, bodyPart, workRelated, employer, readCode })
      } else {
        alert('Conversion failed: ' + (data.error || 'Unknown error'))
      }
    } catch (e) {
      alert('Error: ' + e.message)
    }
    setConverting(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,.25)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0D2B45' }}>⚡ Convert to ACC claim</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: '#9CA3AF' }}>✕</button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem' }}>
          {done ? (
            <div>
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1rem' }}>
                <div style={{ fontWeight: 700, color: '#059669', fontSize: '.9375rem', marginBottom: 6 }}>✓ Consultation converted to ACC</div>
                <div style={{ fontSize: '.8125rem', color: '#065F46', lineHeight: 1.6 }}>
                  ACC documentation generated<br />
                  Patient notified by email<br />
                  Flagged for admin lodgement with ProviderHub
                </div>
              </div>
              {paymentNote && (
                <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '.75rem 1rem', marginBottom: '1rem', fontSize: '.8125rem', color: '#92400E' }}>
                  ⚠ {paymentNote}
                </div>
              )}
              <button onClick={onClose} style={{ width: '100%', padding: '10px', background: '#0B6E76', color: 'white', border: 'none', borderRadius: 8, fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, cursor: 'pointer' }}>
                Close
              </button>
            </div>
          ) : (
            <>
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '.75rem 1rem', marginBottom: '1.25rem', fontSize: '.8125rem', color: '#92400E', lineHeight: 1.5 }}>
                ⚠ Converting to ACC updates billing, generates an ACC45 claim, and notifies the patient. This action is recorded in the audit log.
              </div>

              <div style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <label style={lbl}>Injury date <span style={{ color: '#DC2626' }}>*</span></label>
                  <input type="date" value={injuryDate} onChange={e => setInjuryDate(e.target.value)} style={inp} />
                </div>

                <div>
                  <label style={lbl}>Injury mechanism — how did it happen? <span style={{ color: '#DC2626' }}>*</span></label>
                  <input value={mechanism} onChange={e => setMechanism(e.target.value)}
                    placeholder="e.g. Twisted ankle stepping off kerb"
                    style={inp} />
                </div>

                <div>
                  <label style={lbl}>Body part injured <span style={{ color: '#DC2626' }}>*</span></label>
                  <select value={bodyPart} onChange={e => setBodyPart(e.target.value)} style={{ ...inp, color: bodyPart ? '#1A2A33' : '#9CA3AF' }}>
                    <option value="">Select body part…</option>
                    {BODY_PARTS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div>
                  <label style={lbl}>ACC Read code <span style={{ color: '#DC2626' }}>*</span></label>
                  <select value={readCode} onChange={e => setReadCode(e.target.value)} style={{ ...inp, color: readCode ? '#1A2A33' : '#9CA3AF' }}>
                    <option value="">Select read code…</option>
                    {ACC_READ_CODES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
                  </select>
                </div>

                <div>
                  <label style={lbl}>Work related?</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['no', 'yes'].map(v => (
                      <button key={v} onClick={() => setWorkRelated(v)}
                        style={{ flex: 1, padding: '8px', borderRadius: 8, border: `1.5px solid ${workRelated === v ? '#0B6E76' : '#E2E8F0'}`, background: workRelated === v ? '#F0FDFA' : 'white', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: workRelated === v ? 700 : 400, cursor: 'pointer', fontSize: '.875rem', color: workRelated === v ? '#0B6E76' : '#6B7280' }}>
                        {v === 'yes' ? 'Yes' : 'No'}
                      </button>
                    ))}
                  </div>
                </div>

                {workRelated === 'yes' && (
                  <div>
                    <label style={lbl}>Employer</label>
                    <input value={employer} onChange={e => setEmployer(e.target.value)} placeholder="Employer name" style={inp} />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem' }}>
                <button onClick={onClose}
                  style={{ flex: 1, padding: '10px', border: '1px solid #E2E8F0', borderRadius: 8, background: 'white', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600, color: '#6B7280' }}>
                  Cancel
                </button>
                <button onClick={handleConvert} disabled={converting || !mechanism.trim() || !bodyPart || !readCode}
                  style={{ flex: 2, padding: '10px', border: 'none', borderRadius: 8, background: (!mechanism.trim() || !bodyPart || !readCode) ? '#E2E8F0' : '#D97706', color: (!mechanism.trim() || !bodyPart || !readCode) ? '#9CA3AF' : 'white', cursor: (!mechanism.trim() || !bodyPart || !readCode) ? 'default' : 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700 }}>
                  {converting ? 'Converting…' : '⚡ Convert to ACC'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
