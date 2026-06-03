import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { apiFetch } from '../../lib/api'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
const FF = 'Plus Jakarta Sans, sans-serif'

const CARD_STYLE = {
  style: {
    base: { fontFamily: FF, fontSize: '16px', color: '#1A2A33', '::placeholder': { color: '#9CA3AF' } },
    invalid: { color: '#DC2626' },
  }
}

const REASONS = [
  'General consultation', 'Follow-up', 'Prescription renewal',
  'Medical certificate', 'ACC injury', 'Mental health check-in', 'Other',
]

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '10px 14px',
  border: '1.5px solid #E2E8F0', borderRadius: 8,
  fontFamily: FF, fontSize: '.9375rem', outline: 'none', color: '#1A2A33',
}
const labelStyle = {
  display: 'block', fontSize: '.75rem', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '.05em', color: '#6B7280', marginBottom: 4,
}

const CONSULTATION_FEE = { video: 65, phone: 45 }

function generateICS(date, time, providerName) {
  const start = new Date(`${date}T${time}:00+13:00`)
  const end = new Date(start.getTime() + 20 * 60000)
  const fmt = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tere Health//EN',
    'BEGIN:VEVENT',
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:Tere Health consultation${providerName ? ' with ' + providerName : ''}`,
    'DESCRIPTION:Your Tere Health appointment. Join at tere.co.nz.',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
  const blob = new Blob([ics], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'tere-appointment.ics'; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function ReservationPaymentForm({ name, consultationType, selectedDate, selectedSlot, reason, notes, phone, email, dob, onSuccess, onBack }) {
  const stripe = useStripe()
  const elements = useElements()
  const [clientSecret, setClientSecret] = useState(null)
  const [loadingIntent, setLoadingIntent] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fee = CONSULTATION_FEE[consultationType] || 65

  useEffect(() => {
    apiFetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_reservation_intent' }),
    })
      .then(r => r.json())
      .then(d => { if (d.clientSecret) setClientSecret(d.clientSecret); else setError('Could not initialise payment.') })
      .catch(() => setError('Could not initialise payment.'))
      .finally(() => setLoadingIntent(false))
  }, [])

  async function handlePay(e) {
    e.preventDefault()
    if (!stripe || !elements || !clientSecret) return
    setLoading(true)
    setError('')
    const card = elements.getElement(CardElement)
    const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
      clientSecret,
      { payment_method: { card, billing_details: { name } } }
    )
    if (stripeError) { setError(stripeError.message); setLoading(false); return }
    if (paymentIntent.status === 'succeeded') {
      try {
        const res = await apiFetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            patient_name: name,
            patient_phone: phone,
            patient_email: email || null,
            patient_dob: dob || null,
            appointment_date: selectedDate,
            appointment_time: selectedSlot.time,
            provider_id: selectedSlot.providerId || null,
            provider_name: selectedSlot.providerName || null,
            consultation_type: consultationType,
            reason: reason !== 'Other' ? reason : notes || 'Other',
            reservation_fee_payment_intent_id: paymentIntent.id,
          }),
        })
        const data = await res.json()
        if (data.error) { setError(data.error); setLoading(false); return }
        onSuccess(data)
      } catch { setError('Booking failed — please try again'); setLoading(false) }
    }
  }

  return (
    <form onSubmit={handlePay}>
      <div style={{ background: '#F0F9FA', border: '1.5px solid #D4EEF0', borderRadius: 12, padding: '1.25rem', marginBottom: '1.25rem' }}>
        <div style={{ fontWeight: 700, color: '#0D2B45', marginBottom: '.5rem' }}>Reserve your slot — $15 reservation fee</div>
        <div style={{ color: '#374151', fontSize: '.875rem', lineHeight: 1.6, marginBottom: '.75rem' }}>
          This guarantees your time slot. Your full consultation fee (${fee}) is charged separately on the day.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', fontSize: '.8125rem' }}>
          <div style={{ color: '#059669' }}>✓ Guaranteed time slot — skip the walk-in queue</div>
          <div style={{ color: '#059669' }}>✓ Free cancellation up to 24 hours before</div>
          <div style={{ color: '#DC2626' }}>✗ Non-refundable within 24 hours of appointment</div>
        </div>
      </div>

      <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '1rem', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        {[
          ['Name', name],
          ['Date', new Date(selectedDate + 'T12:00:00Z').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })],
          ['Time', selectedSlot?.time],
          ['Type', consultationType === 'video' ? '📹 Video' : '📞 Phone'],
          ['Reason', reason === 'Other' ? (notes || 'Other') : reason],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.9rem' }}>
            <span style={{ color: '#9CA3AF', fontWeight: 600 }}>{k}</span>
            <span style={{ fontWeight: 600, color: '#0D2B45', textAlign: 'right', maxWidth: '65%' }}>{v}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '.9rem' }}>
          <span style={{ color: '#9CA3AF', fontWeight: 600 }}>Reservation fee (now)</span>
          <span style={{ fontWeight: 700, color: '#0D2B45' }}>$15.00</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.9rem' }}>
          <span style={{ color: '#9CA3AF', fontWeight: 600 }}>Consultation fee (on the day)</span>
          <span style={{ fontWeight: 600, color: '#6B7280' }}>${fee}</span>
        </div>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ ...labelStyle, textTransform: 'none', fontSize: '.8125rem', fontWeight: 600, color: '#1A2A33' }}>Card details</label>
        <div style={{ border: '1.5px solid #E2E8F0', borderRadius: 8, padding: '.875rem 1rem', background: 'white', minHeight: 44 }}>
          {loadingIntent
            ? <div style={{ color: '#9CA3AF', fontSize: '.875rem' }}>Loading payment…</div>
            : <CardElement options={CARD_STYLE} />}
        </div>
      </div>

      {error && <div style={{ background: '#FEF2F2', color: '#DC2626', borderRadius: 8, padding: '.75rem', fontSize: '.875rem', marginBottom: '.875rem' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onBack} style={{ flex: 1, padding: '11px', border: '1.5px solid #E2E8F0', borderRadius: 8, background: 'white', fontFamily: FF, fontWeight: 600, cursor: 'pointer', color: '#6B7280' }}>← Back</button>
        <button type="submit" disabled={loading || loadingIntent || !clientSecret}
          style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 8, fontFamily: FF, fontWeight: 700, cursor: loading || loadingIntent ? 'default' : 'pointer', background: '#059669', color: 'white', opacity: loadingIntent ? 0.65 : 1 }}>
          {loading ? 'Processing…' : 'Pay $15 and confirm →'}
        </button>
      </div>
      <div style={{ textAlign: 'center', fontSize: '.75rem', color: '#9CA3AF', marginTop: '.625rem' }}>
        🔒 Secured by Stripe · Card details never stored by Tere
      </div>
    </form>
  )
}

export default function BookAppointment() {
  const [step, setStep] = useState(1) // 1:calendar+slot  2:type  3:details  4:pay  5:done
  const [calendar, setCalendar] = useState({})
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState('')
  const [slots, setSlots] = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [consultationType, setConsultationType] = useState('video')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [dob, setDob] = useState('')
  const [reason, setReason] = useState(REASONS[0])
  const [notes, setNotes] = useState('')
  const [confirmation, setConfirmation] = useState(null)

  useEffect(() => {
    apiFetch('/api/bookings?action=calendar')
      .then(r => r.json())
      .then(d => setCalendar(d.dates || {}))
      .catch(() => {})
      .finally(() => setCalendarLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedDate) return
    setLoadingSlots(true)
    setSlots([])
    setSelectedSlot(null)
    apiFetch(`/api/bookings?action=slots&date=${selectedDate}`)
      .then(r => r.json())
      .then(d => setSlots(d.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false))
  }, [selectedDate])

  const dateKeys = Object.keys(calendar).sort()
  const fee = CONSULTATION_FEE[consultationType] || 65
  const totalDisplay = `$${15 + fee} total ($15 now + $${fee} on the day)`

  const STEPS = ['Choose time', 'Consult type', 'Your details', 'Pay & confirm']

  return (
    <div style={{ minHeight: '100dvh', background: '#F0F2F5', fontFamily: FF }}>
      <nav style={{ background: '#0D2B45', paddingTop: 'calc(.875rem + env(safe-area-inset-top))', paddingBottom: '.875rem', paddingLeft: '1.5rem', paddingRight: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <Link to="/" style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.3rem', textDecoration: 'none' }}>Tere</Link>
        <span style={{ color: 'rgba(255,255,255,.4)', fontSize: '.875rem' }}>Book an appointment</span>
      </nav>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '2rem 1.25rem' }}>
        {step < 5 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: '1.5rem' }}>
            {STEPS.map((s, i) => (
              <React.Fragment key={s}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: step > i + 1 ? '#059669' : step === i + 1 ? '#0B6E76' : '#E2E8F0', color: step >= i + 1 ? 'white' : '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem', fontWeight: 700 }}>
                    {step > i + 1 ? '✓' : i + 1}
                  </div>
                  <span className="step-label" style={{ fontSize: '.75rem', fontWeight: 600, color: step === i + 1 ? '#0D2B45' : '#9CA3AF', whiteSpace: 'nowrap' }}>{s}</span>
                  <style>{`.step-label { display: block } @media (max-width: 400px) { .step-label { display: none } }`}</style>
                </div>
                {i < 3 && <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />}
              </React.Fragment>
            ))}
          </div>
        )}

        <div style={{ background: 'white', borderRadius: 16, padding: '1.75rem', border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}>

          {/* Step 1: Calendar + slot picker */}
          {step === 1 && (
            <>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0D2B45', marginBottom: '1.25rem' }}>Choose a date and time</h2>
              {calendarLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF' }}>Loading availability…</div>
              ) : !dateKeys.some(d => calendar[d] > 0) ? (
                <div style={{ textAlign: 'center', padding: '1.5rem', background: '#F8FAFC', borderRadius: 8, lineHeight: 1.6, fontSize: '.9rem', color: '#6B7280' }}>
                  No appointments currently available in the next 14 days.{' '}
                  <Link to="/triage" style={{ color: '#0B6E76', fontWeight: 700 }}>Start now</Link> to join the walk-in queue instead.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.625rem' }}>Select a date</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: '1.25rem' }}>
                    {dateKeys.map(d => {
                      const count = calendar[d]
                      const label = new Date(d + 'T12:00:00Z')
                      return (
                        <button key={d} onClick={() => count > 0 && setSelectedDate(d)} disabled={count === 0}
                          style={{ padding: '6px 2px', border: `1.5px solid ${selectedDate === d ? '#0B6E76' : '#E2E8F0'}`, borderRadius: 8, background: selectedDate === d ? '#EFF9F9' : count === 0 ? '#F8FAFC' : 'white', cursor: count === 0 ? 'default' : 'pointer', opacity: count === 0 ? 0.4 : 1, textAlign: 'center', fontFamily: FF }}>
                          <div style={{ fontSize: '.6rem', color: '#9CA3AF', textTransform: 'uppercase' }}>{label.toLocaleDateString('en-NZ', { weekday: 'short' })}</div>
                          <div style={{ fontSize: '.9rem', fontWeight: 700, color: selectedDate === d ? '#0B6E76' : '#0D2B45' }}>{label.getDate()}</div>
                          {count > 0 && <div style={{ fontSize: '.55rem', color: selectedDate === d ? '#0B6E76' : '#9CA3AF' }}>{count}</div>}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}

              {selectedDate && (
                loadingSlots ? (
                  <div style={{ textAlign: 'center', padding: '1rem', color: '#9CA3AF' }}>Loading slots…</div>
                ) : slots.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1rem', color: '#9CA3AF', background: '#F8FAFC', borderRadius: 8 }}>No slots on this date. Try another.</div>
                ) : (
                  <>
                    <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.625rem' }}>Available times</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.375rem', marginBottom: '1.25rem' }}>
                      {slots.map((s, i) => (
                        <button key={i} onClick={() => setSelectedSlot(s)}
                          style={{ padding: '8px 4px', border: `1.5px solid ${selectedSlot === s ? '#0B6E76' : '#E2E8F0'}`, borderRadius: 8, background: selectedSlot === s ? '#EFF9F9' : 'white', color: selectedSlot === s ? '#0B6E76' : '#374151', fontFamily: FF, fontWeight: 600, fontSize: '.875rem', cursor: 'pointer' }}>
                          {s.time}
                        </button>
                      ))}
                    </div>
                    {selectedSlot?.providerName && (
                      <div style={{ fontSize: '.8125rem', color: '#6B7280', marginBottom: '.875rem', background: '#F8FAFC', borderRadius: 8, padding: '.625rem .875rem' }}>
                        Provider: <strong style={{ color: '#0D2B45' }}>{selectedSlot.providerName}</strong>
                      </div>
                    )}
                  </>
                )
              )}

              <button onClick={() => selectedSlot && setStep(2)} disabled={!selectedSlot}
                style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', fontFamily: FF, fontWeight: 700, fontSize: '1rem', cursor: selectedSlot ? 'pointer' : 'default', background: selectedSlot ? '#0B6E76' : '#E2E8F0', color: selectedSlot ? 'white' : '#9CA3AF' }}>
                Choose consultation type →
              </button>
            </>
          )}

          {/* Step 2: Consultation type */}
          {step === 2 && (
            <>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0D2B45', marginBottom: '.375rem' }}>Consultation type</h2>
              <div style={{ fontSize: '.875rem', color: '#6B7280', marginBottom: '1.25rem' }}>
                {new Date(selectedDate + 'T12:00:00Z').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })} at {selectedSlot?.time}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', marginBottom: '1.25rem' }}>
                {[
                  { type: 'video', icon: '📹', label: 'Video consultation', desc: 'Face-to-face with your doctor', fee: 65 },
                  { type: 'phone', icon: '📞', label: 'Phone consultation', desc: 'Audio call — no camera needed', fee: 45 },
                ].map(opt => (
                  <button key={opt.type} onClick={() => setConsultationType(opt.type)}
                    style={{ padding: '1rem 1.25rem', border: `2px solid ${consultationType === opt.type ? '#0B6E76' : '#E2E8F0'}`, borderRadius: 12, background: consultationType === opt.type ? '#EFF9F9' : 'white', cursor: 'pointer', textAlign: 'left', fontFamily: FF }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#0D2B45', marginBottom: '.25rem' }}>{opt.icon} {opt.label}</div>
                        <div style={{ fontSize: '.875rem', color: '#6B7280' }}>{opt.desc}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 700, color: '#0D2B45' }}>${15 + opt.fee} total</div>
                        <div style={{ fontSize: '.75rem', color: '#9CA3AF' }}>$15 now + ${opt.fee} on day</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setStep(1)} style={{ flex: 1, padding: '11px', border: '1.5px solid #E2E8F0', borderRadius: 8, background: 'white', fontFamily: FF, fontWeight: 600, cursor: 'pointer', color: '#6B7280' }}>← Back</button>
                <button onClick={() => setStep(3)} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 8, fontFamily: FF, fontWeight: 700, cursor: 'pointer', background: '#0B6E76', color: 'white' }}>
                  Your details →
                </button>
              </div>
            </>
          )}

          {/* Step 3: Patient details */}
          {step === 3 && (
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
                  <label style={labelStyle}>Email <span style={{ color: '#6B7280', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(for confirmation)</span></label>
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
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Describe your reason…" style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                )}
              </div>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '.75rem 1rem', marginTop: '1rem', fontSize: '.8125rem', color: '#6B7280', lineHeight: 1.5 }}>
                <strong style={{ color: '#0D2B45' }}>$15 reservation fee</strong> charged now · {totalDisplay}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem' }}>
                <button onClick={() => setStep(2)} style={{ flex: 1, padding: '11px', border: '1.5px solid #E2E8F0', borderRadius: 8, background: 'white', fontFamily: FF, fontWeight: 600, cursor: 'pointer', color: '#6B7280' }}>← Back</button>
                <button onClick={() => { if (name.trim() && phone.trim()) setStep(4) }}
                  disabled={!name.trim() || !phone.trim()}
                  style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 8, fontFamily: FF, fontWeight: 700, cursor: name.trim() && phone.trim() ? 'pointer' : 'default', background: name.trim() && phone.trim() ? '#0B6E76' : '#E2E8F0', color: name.trim() && phone.trim() ? 'white' : '#9CA3AF' }}>
                  Pay & confirm →
                </button>
              </div>
            </>
          )}

          {/* Step 4: Pay $15 */}
          {step === 4 && (
            <Elements stripe={stripePromise}>
              <ReservationPaymentForm
                name={name} consultationType={consultationType}
                selectedDate={selectedDate} selectedSlot={selectedSlot}
                reason={reason} notes={notes} phone={phone} email={email} dob={dob}
                onSuccess={(data) => { setConfirmation(data); setStep(5) }}
                onBack={() => setStep(3)}
              />
            </Elements>
          )}

          {/* Step 5: Confirmation */}
          {step === 5 && (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '.75rem' }}>✓</div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#059669', marginBottom: '.5rem' }}>Appointment confirmed!</h2>
              <p style={{ fontSize: '.9375rem', color: '#6B7280', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                <strong>{new Date(selectedDate + 'T12:00:00Z').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}</strong> at <strong>{selectedSlot?.time}</strong>
                {selectedSlot?.providerName ? ` with ${selectedSlot.providerName}` : ''}.
                {phone && ' A confirmation SMS has been sent to your phone.'}
              </p>
              <div style={{ background: '#F0F9FA', border: '1px solid #D4EEF0', borderRadius: 10, padding: '1rem', fontSize: '.875rem', color: '#374151', marginBottom: '1rem', textAlign: 'left', lineHeight: 1.6 }}>
                <div style={{ fontWeight: 700, color: '#0D2B45', marginBottom: '.375rem' }}>What happens next</div>
                <div>Your <strong>$15 reservation fee</strong> has been charged.</div>
                <div style={{ marginTop: '.25rem' }}>On the day, click the join link in your SMS to start your <strong>{consultationType} consultation</strong>. Your <strong>${fee} consultation fee</strong> will be charged when you join.</div>
              </div>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '1rem', fontSize: '.875rem', color: '#374151', marginBottom: '1.25rem' }}>
                <strong>Reference:</strong> {confirmation?.booking?.id?.slice(0, 8).toUpperCase() || 'CONFIRMED'}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => generateICS(selectedDate, selectedSlot?.time, selectedSlot?.providerName)}
                  style={{ background: '#F0F9FA', color: '#0B6E76', border: '1px solid #0B6E76', padding: '10px 18px', borderRadius: 8, fontFamily: FF, fontWeight: 600, cursor: 'pointer', fontSize: '.875rem' }}>
                  Add to calendar (.ics)
                </button>
                <Link to="/" style={{ background: '#E2E8F0', color: '#374151', padding: '10px 18px', borderRadius: 8, fontFamily: FF, fontWeight: 600, textDecoration: 'none', fontSize: '.875rem', display: 'flex', alignItems: 'center' }}>
                  Done
                </Link>
              </div>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '.8125rem', color: '#9CA3AF' }}>
          Tere Health · New Zealand · <Link to="/terms" style={{ color: '#9CA3AF' }}>Terms</Link>
        </div>
      </div>
    </div>
  )
}
