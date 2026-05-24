import React, { useState, useEffect } from 'react'
import { apiFetch } from '../../lib/api'

const REASONS = [
  'General consultation',
  'Follow-up',
  'Prescription renewal',
  'Medical certificate',
  'ACC injury',
  'Mental health check-in',
  'Other',
]

export default function BookAppointment() {
  const [step, setStep] = useState(1) // 1=details 2=slots 3=confirm 4=done
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [dob, setDob] = useState('')
  const [reason, setReason] = useState(REASONS[0])
  const [notes, setNotes] = useState('')
  const [booking, setBooking] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState(null)

  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    if (date) loadSlots()
  }, [date])

  async function loadSlots() {
    setLoadingSlots(true)
    setSlots([])
    setSelectedSlot(null)
    try {
      const res = await apiFetch(`/api/appointments?type=slots&date=${date}`)
      const data = await res.json()
      setSlots(data.slots || [])
    } catch { setSlots([]) }
    setLoadingSlots(false)
  }

  async function book() {
    if (!name.trim() || !phone.trim() || !selectedSlot) return
    setBooking(true)
    setError('')
    try {
      const res = await apiFetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'book',
          patient_name: name.trim(),
          patient_phone: phone.trim(),
          patient_email: email.trim() || null,
          patient_dob: dob || null,
          appointment_date: date,
          slot_time: selectedSlot.time,
          provider_id: selectedSlot.provider_id || null,
          reason: reason !== 'Other' ? reason : notes.trim() || 'Other',
          notes: notes.trim() || null,
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); setBooking(false); return }
      setConfirmation(data)
      setStep(4)
    } catch (e) { setError('Booking failed — please try again'); setBooking(false) }
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '10px 14px',
    border: '1.5px solid #E2E8F0', borderRadius: 8,
    fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.9375rem',
    outline: 'none', color: '#1A2A33',
  }
  const labelStyle = {
    display: 'block', fontSize: '.75rem', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '.05em', color: '#6B7280', marginBottom: 4,
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F0F2F5', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <nav style={{ background: '#0D2B45', padding: '.875rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <span style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.3rem' }}>Tere</span>
        <span style={{ color: 'rgba(255,255,255,.4)', fontSize: '.875rem' }}>Book an appointment</span>
      </nav>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '2rem 1.25rem' }}>

        {/* Progress */}
        {step < 4 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: '1.5rem' }}>
            {['Your details', 'Choose time', 'Confirm'].map((s, i) => (
              <React.Fragment key={s}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: step > i + 1 ? '#059669' : step === i + 1 ? '#0B6E76' : '#E2E8F0', color: step >= i + 1 ? 'white' : '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.75rem', fontWeight: 700, flexShrink: 0 }}>
                    {step > i + 1 ? '✓' : i + 1}
                  </div>
                  <span style={{ fontSize: '.8125rem', fontWeight: 600, color: step === i + 1 ? '#0D2B45' : '#9CA3AF', whiteSpace: 'nowrap' }}>{s}</span>
                </div>
                {i < 2 && <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />}
              </React.Fragment>
            ))}
          </div>
        )}

        <div style={{ background: 'white', borderRadius: 16, padding: '1.75rem', border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}>

          {/* Step 1: Patient details */}
          {step === 1 && (
            <>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0D2B45', marginBottom: '1.25rem' }}>Your details</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.875rem' }}>
                <div>
                  <label style={labelStyle}>Full name <span style={{ color: '#DC2626' }}>*</span></label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Phone <span style={{ color: '#DC2626' }}>*</span></label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="021 123 4567" type="tel" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" type="email" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Date of birth</label>
                  <input value={dob} onChange={e => setDob(e.target.value)} type="date" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Reason for visit</label>
                  <select value={reason} onChange={e => setReason(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    {REASONS.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                {reason === 'Other' && (
                  <div>
                    <label style={labelStyle}>Brief description</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Describe your reason for visiting…" style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                )}
              </div>
              <button
                onClick={() => { if (name.trim() && phone.trim()) setStep(2) }}
                disabled={!name.trim() || !phone.trim()}
                style={{ width: '100%', marginTop: '1.25rem', padding: '12px', borderRadius: 8, border: 'none', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: '1rem', cursor: name.trim() && phone.trim() ? 'pointer' : 'default', background: name.trim() && phone.trim() ? '#0B6E76' : '#E2E8F0', color: name.trim() && phone.trim() ? 'white' : '#9CA3AF' }}>
                Choose appointment time →
              </button>
            </>
          )}

          {/* Step 2: Date + slot picker */}
          {step === 2 && (
            <>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0D2B45', marginBottom: '1.25rem' }}>Choose a time</h2>
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Date <span style={{ color: '#DC2626' }}>*</span></label>
                <input type="date" value={date} min={today} onChange={e => setDate(e.target.value)} style={inputStyle} />
              </div>
              {date && (
                loadingSlots ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem', color: '#9CA3AF' }}>Loading available slots…</div>
                ) : slots.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem', color: '#9CA3AF', background: '#F8FAFC', borderRadius: 8 }}>
                    No slots available on this date.<br />Please try another day.
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#6B7280', marginBottom: '.625rem' }}>Available slots</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.375rem' }}>
                      {slots.map(s => (
                        <button key={s.time} onClick={() => setSelectedSlot(s)}
                          style={{ padding: '8px 4px', border: `1.5px solid ${selectedSlot?.time === s.time ? '#0B6E76' : '#E2E8F0'}`, borderRadius: 8, background: selectedSlot?.time === s.time ? '#EFF9F9' : 'white', color: selectedSlot?.time === s.time ? '#0B6E76' : '#374151', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600, fontSize: '.875rem', cursor: 'pointer', transition: 'all .1s' }}>
                          {s.time.slice(0, 5)}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem' }}>
                <button onClick={() => setStep(1)} style={{ flex: 1, padding: '11px', border: '1.5px solid #E2E8F0', borderRadius: 8, background: 'white', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600, cursor: 'pointer', color: '#6B7280' }}>← Back</button>
                <button onClick={() => selectedSlot && setStep(3)} disabled={!selectedSlot}
                  style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 8, fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, cursor: selectedSlot ? 'pointer' : 'default', background: selectedSlot ? '#0B6E76' : '#E2E8F0', color: selectedSlot ? 'white' : '#9CA3AF' }}>
                  Review booking →
                </button>
              </div>
            </>
          )}

          {/* Step 3: Confirm */}
          {step === 3 && (
            <>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0D2B45', marginBottom: '1.25rem' }}>Confirm your booking</h2>
              <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '1rem', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {[
                  ['Name', name],
                  ['Phone', phone],
                  ...(email ? [['Email', email]] : []),
                  ['Date', new Date(date).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })],
                  ['Time', selectedSlot?.time?.slice(0, 5)],
                  ['Reason', reason === 'Other' ? (notes || 'Other') : reason],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.9rem' }}>
                    <span style={{ color: '#9CA3AF', fontWeight: 600 }}>{k}</span>
                    <span style={{ fontWeight: 600, color: '#0D2B45', textAlign: 'right', maxWidth: '65%' }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '.8125rem', color: '#9CA3AF', marginBottom: '1rem', lineHeight: 1.5 }}>
                We'll send a confirmation to your phone. You can cancel by calling us.
              </div>
              {error && <div style={{ background: '#FEF2F2', color: '#DC2626', borderRadius: 8, padding: '.75rem', fontSize: '.875rem', marginBottom: '.875rem' }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setStep(2)} style={{ flex: 1, padding: '11px', border: '1.5px solid #E2E8F0', borderRadius: 8, background: 'white', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600, cursor: 'pointer', color: '#6B7280' }}>← Back</button>
                <button onClick={book} disabled={booking}
                  style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 8, fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, cursor: booking ? 'default' : 'pointer', background: '#059669', color: 'white' }}>
                  {booking ? 'Booking…' : '✓ Confirm booking'}
                </button>
              </div>
            </>
          )}

          {/* Step 4: Done */}
          {step === 4 && (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '.75rem' }}>✓</div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#059669', marginBottom: '.5rem' }}>Booking confirmed!</h2>
              <p style={{ fontSize: '.9375rem', color: '#6B7280', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                Your appointment is confirmed for <strong>{new Date(date).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}</strong> at <strong>{selectedSlot?.time?.slice(0, 5)}</strong>.
                {phone && ' A confirmation SMS has been sent to your phone.'}
              </p>
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '1rem', fontSize: '.875rem', color: '#374151', marginBottom: '1.25rem' }}>
                <strong>Reference:</strong> {confirmation?.id?.slice(0, 8).toUpperCase() || 'CONFIRMED'}
              </div>
              <button onClick={() => { setStep(1); setDate(''); setSelectedSlot(null); setName(''); setPhone(''); setEmail(''); setDob(''); setNotes(''); setConfirmation(null) }}
                style={{ background: '#F0F9FA', color: '#0B6E76', border: '1px solid #0B6E76', padding: '10px 24px', borderRadius: 8, fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600, cursor: 'pointer', fontSize: '.875rem' }}>
                Book another appointment
              </button>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '.8125rem', color: '#9CA3AF' }}>
          Tere Health · Telehealth & in-clinic appointments · New Zealand
        </div>
      </div>
    </div>
  )
}
