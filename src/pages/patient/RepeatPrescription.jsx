import React, { useState } from 'react'
import { apiFetch } from '../../lib/api'

export default function RepeatPrescription() {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [nhi, setNhi] = useState('')
  const [medication, setMedication] = useState('')
  const [dose, setDose] = useState('')
  const [pharmacy, setPharmacy] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '10px 14px',
    border: '1.5px solid #E2E8F0', borderRadius: 8,
    fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.9375rem', outline: 'none',
  }
  const labelStyle = {
    display: 'block', fontSize: '.75rem', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '.05em', color: '#6B7280', marginBottom: 4,
  }

  async function submit() {
    setSubmitting(true)
    setError('')
    try {
      // Create a message-type consultation for repeat Rx
      const { supabase } = await import('../../lib/supabase')
      const nameParts = name.trim().split(' ')
      const { data: consult, error: cErr } = await supabase.from('consultations').insert({
        patient_first_name: nameParts[0],
        patient_last_name: nameParts.slice(1).join(' ') || '',
        patient_dob: dob || null,
        patient_phone: phone,
        patient_email: email || null,
        patient_nhi: nhi || null,
        pharmacy: pharmacy || null,
        chief_complaint: `Repeat prescription request: ${medication} ${dose}`,
        consultation_type: 'repeat_rx',
        status: 'waiting',
        payment_amount: 2500, // $25 message consult
        notes_draft: { repeatRx: { medication, dose, pharmacy, patientNotes: notes } },
      }).select().single()
      if (cErr) throw cErr
      setDone(true)
    } catch (e) { setError('Submission failed — ' + e.message) }
    setSubmitting(false)
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F0F2F5', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <nav style={{ background: '#0D2B45', padding: '.875rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <span style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.3rem' }}>Tere</span>
        <span style={{ color: 'rgba(255,255,255,.4)', fontSize: '.875rem' }}>Repeat Prescription</span>
      </nav>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '2rem 1.25rem' }}>

        {done ? (
          <div style={{ background: 'white', borderRadius: 16, padding: '2rem', textAlign: 'center', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
            <h2 style={{ fontWeight: 700, color: '#059669', marginBottom: '.5rem' }}>Request received</h2>
            <p style={{ color: '#6B7280', lineHeight: 1.6, fontSize: '.9375rem' }}>
              Your repeat prescription request for <strong>{medication}</strong> has been sent to a Tere Health clinician.
              You'll be notified by email once it's been reviewed — usually within 2 hours during clinic hours.
            </p>
            <div style={{ background: '#F0FDF4', borderRadius: 8, padding: '.875rem', marginTop: '1.25rem', fontSize: '.875rem', color: '#374151' }}>
              A $25 message consultation fee applies. Payment link will be emailed to you.
            </div>
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: 16, padding: '1.75rem', border: '1px solid #E2E8F0' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0D2B45', marginBottom: '.375rem' }}>Repeat prescription request</h2>
            <p style={{ fontSize: '.875rem', color: '#6B7280', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              For medications you've been prescribed by Tere Health before. A clinician will review your history and approve if appropriate.
            </p>

            {error && <div style={{ background: '#FEF2F2', color: '#DC2626', borderRadius: 8, padding: '.75rem', marginBottom: '.875rem', fontSize: '.875rem' }}>{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '.875rem' }}>
              <div>
                <label style={labelStyle}>Full name *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
                <div>
                  <label style={labelStyle}>Date of birth *</label>
                  <input type="date" value={dob} onChange={e => setDob(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>NHI number</label>
                  <input value={nhi} onChange={e => setNhi(e.target.value)} placeholder="ABC1234" style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Phone *</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="021 123 4567" type="tel" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" type="email" style={inputStyle} />
              </div>
              <hr style={{ border: 'none', borderTop: '1px solid #E2E8F0', margin: '.25rem 0' }} />
              <div>
                <label style={labelStyle}>Medication name *</label>
                <input value={medication} onChange={e => setMedication(e.target.value)} placeholder="e.g. Amoxicillin" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Dose / strength</label>
                <input value={dose} onChange={e => setDose(e.target.value)} placeholder="e.g. 500mg TDS" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Preferred pharmacy</label>
                <input value={pharmacy} onChange={e => setPharmacy(e.target.value)} placeholder="e.g. Havelock Pharmacy" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Any notes for the clinician</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="e.g. Running low, have been taking for 2 weeks" style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            </div>

            <button
              onClick={submit}
              disabled={!name.trim() || !dob || !phone.trim() || !medication.trim() || submitting}
              style={{
                width: '100%', marginTop: '1.25rem', padding: '12px', borderRadius: 8, border: 'none',
                fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: '1rem',
                background: name.trim() && dob && phone.trim() && medication.trim() ? '#0B6E76' : '#E2E8F0',
                color: name.trim() && dob && phone.trim() && medication.trim() ? 'white' : '#9CA3AF',
                cursor: name.trim() && dob && phone.trim() && medication.trim() ? 'pointer' : 'default',
              }}>
              {submitting ? 'Sending…' : 'Submit request — $25'}
            </button>

            <div style={{ fontSize: '.75rem', color: '#9CA3AF', textAlign: 'center', marginTop: '.75rem' }}>
              Available to returning Tere Health patients only.<br />Prescriptions are issued at clinician discretion.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
