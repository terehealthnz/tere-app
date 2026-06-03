import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const FF = 'Plus Jakarta Sans, sans-serif'

function SlotPicker({ bookingId, onRescheduled }) {
  const [calendar, setCalendar] = useState({})
  const [selectedDate, setSelectedDate] = useState('')
  const [slots, setSlots] = useState([])
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch('/api/bookings?action=calendar')
      .then(r => r.json())
      .then(d => setCalendar(d.dates || {}))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedDate) return
    setLoadingSlots(true)
    apiFetch(`/api/bookings?action=slots&date=${selectedDate}`)
      .then(r => r.json())
      .then(d => { setSlots(d.slots || []); setSelectedSlot(null) })
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false))
  }, [selectedDate])

  async function confirm() {
    if (!selectedSlot) return
    setSaving(true)
    setError('')
    try {
      const res = await apiFetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reschedule',
          id: bookingId,
          new_date: selectedDate,
          new_time: selectedSlot.time,
          provider_id: selectedSlot.providerId,
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); setSaving(false); return }
      onRescheduled(data.booking)
    } catch { setError('Reschedule failed — please try again'); setSaving(false) }
  }

  const dateKeys = Object.keys(calendar).sort()
  return (
    <div>
      <div style={{ fontSize: '.875rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.625rem' }}>Select a new date</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: '1rem' }}>
        {dateKeys.map(d => {
          const count = calendar[d]
          const label = new Date(d + 'T12:00:00Z')
          const dayName = label.toLocaleDateString('en-NZ', { weekday: 'short' })
          const dayNum  = label.getDate()
          return (
            <button key={d} onClick={() => count > 0 && setSelectedDate(d)} disabled={count === 0}
              style={{ padding: '6px 2px', border: `1.5px solid ${selectedDate === d ? '#0B6E76' : '#E2E8F0'}`, borderRadius: 8, background: selectedDate === d ? '#EFF9F9' : count === 0 ? '#F8FAFC' : 'white', cursor: count === 0 ? 'default' : 'pointer', opacity: count === 0 ? 0.4 : 1, textAlign: 'center', fontFamily: FF }}>
              <div style={{ fontSize: '.6rem', color: '#9CA3AF', textTransform: 'uppercase' }}>{dayName}</div>
              <div style={{ fontSize: '.9rem', fontWeight: 700, color: selectedDate === d ? '#0B6E76' : '#0D2B45' }}>{dayNum}</div>
              {count > 0 && <div style={{ fontSize: '.55rem', color: selectedDate === d ? '#0B6E76' : '#9CA3AF' }}>{count} slots</div>}
            </button>
          )
        })}
      </div>

      {selectedDate && (
        loadingSlots ? <div style={{ color: '#9CA3AF', textAlign: 'center', padding: '1rem' }}>Loading…</div> :
        slots.length === 0 ? <div style={{ color: '#9CA3AF', textAlign: 'center', padding: '1rem', background: '#F8FAFC', borderRadius: 8 }}>No slots available. Choose another date.</div> :
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: '1rem' }}>
          {slots.map((s, i) => (
            <button key={i} onClick={() => setSelectedSlot(s)}
              style={{ padding: '8px 4px', border: `1.5px solid ${selectedSlot === s ? '#0B6E76' : '#E2E8F0'}`, borderRadius: 8, background: selectedSlot === s ? '#EFF9F9' : 'white', color: selectedSlot === s ? '#0B6E76' : '#374151', fontFamily: FF, fontWeight: 600, fontSize: '.875rem', cursor: 'pointer' }}>
              {s.time}
            </button>
          ))}
        </div>
      )}

      {error && <div style={{ background: '#FEF2F2', color: '#DC2626', borderRadius: 8, padding: '.75rem', fontSize: '.875rem', marginBottom: '.75rem' }}>{error}</div>}

      <button onClick={confirm} disabled={!selectedSlot || saving}
        style={{ width: '100%', padding: '12px', border: 'none', borderRadius: 8, fontFamily: FF, fontWeight: 700, fontSize: '1rem', background: selectedSlot ? '#0B6E76' : '#E2E8F0', color: selectedSlot ? 'white' : '#9CA3AF', cursor: selectedSlot ? 'pointer' : 'default' }}>
        {saving ? 'Rescheduling…' : 'Confirm new time →'}
      </button>
    </div>
  )
}

export default function BookingChange() {
  const { id } = useParams()
  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('choice') // choice | reschedule | refund_confirm | done_reschedule | done_refund
  const [rescheduled, setRescheduled] = useState(null)
  const [refunding, setRefunding] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch(`/api/bookings?action=detail&id=${id}`)
      .then(r => r.json())
      .then(d => setBooking(d.booking))
      .catch(() => setError('Could not load booking'))
      .finally(() => setLoading(false))
  }, [id])

  async function requestRefund() {
    setRefunding(true)
    try {
      const res = await apiFetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', id, reason: 'schedule_change_patient_refund', cancelled_by: 'patient' }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); setRefunding(false); return }
      setView('done_refund')
    } catch { setError('Refund request failed — please try again'); setRefunding(false) }
  }

  const displayDate = booking ? new Date(booking.appointment_date + 'T12:00:00Z')
    .toLocaleDateString('en-NZ', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) : ''

  return (
    <div style={{ minHeight: '100dvh', background: '#F0F2F5', fontFamily: FF }}>
      <nav style={{ background: '#0D2B45', paddingTop: 'calc(.875rem + env(safe-area-inset-top))', paddingBottom: '.875rem', paddingLeft: '1.5rem', paddingRight: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <Link to="/" style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.3rem', textDecoration: 'none' }}>Tere</Link>
        <span style={{ color: 'rgba(255,255,255,.4)', fontSize: '.875rem' }}>Manage appointment</span>
      </nav>

      <div style={{ maxWidth: 500, margin: '0 auto', padding: '2rem 1.25rem' }}>
        <div style={{ background: 'white', borderRadius: 16, padding: '1.75rem', border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}>
          {loading && <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF' }}>Loading…</div>}
          {error && !loading && <div style={{ textAlign: 'center', padding: '2rem', color: '#DC2626' }}>{error}</div>}

          {booking && view === 'choice' && (
            <>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0D2B45', marginBottom: '.5rem' }}>Schedule change</h2>
              <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '.875rem', marginBottom: '1.25rem', fontSize: '.875rem', color: '#92400E' }}>
                Your appointment on <strong>{displayDate}</strong> at <strong>{booking.appointment_time}</strong> has been affected by a schedule change.
              </div>
              <p style={{ fontSize: '.9375rem', color: '#374151', marginBottom: '1.25rem', lineHeight: 1.6 }}>Please choose one of the following options. If you don't respond within 48 hours, your $15 reservation fee will be automatically refunded.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button onClick={() => setView('reschedule')}
                  style={{ padding: '14px', border: 'none', borderRadius: 10, background: '#0B6E76', color: 'white', fontFamily: FF, fontWeight: 700, fontSize: '1rem', cursor: 'pointer', textAlign: 'left' }}>
                  📅 Reschedule — choose a new available slot
                  <div style={{ fontWeight: 400, fontSize: '.8125rem', opacity: .85, marginTop: 2 }}>No extra charge — your $15 fee transfers</div>
                </button>
                <button onClick={() => setView('refund_confirm')}
                  style={{ padding: '14px', border: '2px solid #E2E8F0', borderRadius: 10, background: 'white', color: '#374151', fontFamily: FF, fontWeight: 700, fontSize: '1rem', cursor: 'pointer', textAlign: 'left' }}>
                  💳 Full refund — return my $15 reservation fee
                  <div style={{ fontWeight: 400, fontSize: '.8125rem', color: '#6B7280', marginTop: 2 }}>Appointment cancelled, refund in 5–10 business days</div>
                </button>
              </div>
            </>
          )}

          {booking && view === 'reschedule' && (
            <>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0D2B45', marginBottom: '1.25rem' }}>Choose a new time</h2>
              <SlotPicker bookingId={id} onRescheduled={(b) => { setRescheduled(b); setView('done_reschedule') }} />
              <button onClick={() => setView('choice')} style={{ marginTop: '.75rem', background: 'none', border: 'none', color: '#9CA3AF', fontSize: '.875rem', cursor: 'pointer', textDecoration: 'underline', fontFamily: FF }}>← Back</button>
            </>
          )}

          {booking && view === 'refund_confirm' && (
            <>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0D2B45', marginBottom: '1rem' }}>Confirm refund</h2>
              <p style={{ color: '#374151', fontSize: '.9375rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                Your appointment on <strong>{displayDate}</strong> will be cancelled and your <strong>$15 reservation fee will be refunded</strong> within 5–10 business days.
              </p>
              {error && <div style={{ background: '#FEF2F2', color: '#DC2626', borderRadius: 8, padding: '.75rem', fontSize: '.875rem', marginBottom: '.75rem' }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setView('choice')} style={{ flex: 1, padding: '11px', border: '1.5px solid #E2E8F0', borderRadius: 8, background: 'white', fontFamily: FF, fontWeight: 600, cursor: 'pointer', color: '#6B7280' }}>← Back</button>
                <button onClick={requestRefund} disabled={refunding}
                  style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 8, background: '#059669', color: 'white', fontFamily: FF, fontWeight: 700, cursor: refunding ? 'default' : 'pointer' }}>
                  {refunding ? 'Processing…' : 'Confirm refund'}
                </button>
              </div>
            </>
          )}

          {view === 'done_reschedule' && rescheduled && (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '.75rem' }}>✓</div>
              <h2 style={{ fontWeight: 700, color: '#059669', marginBottom: '.5rem' }}>Rescheduled!</h2>
              <p style={{ color: '#6B7280', lineHeight: 1.6 }}>
                Your appointment has been moved to <strong>{new Date(rescheduled.appointment_date + 'T12:00:00Z').toLocaleDateString('en-NZ', { weekday:'long', day:'numeric', month:'long' })}</strong> at <strong>{rescheduled.appointment_time}</strong>.
              </p>
              {rescheduled.patient_email && <p style={{ color: '#6B7280', fontSize: '.875rem' }}>A confirmation has been sent to your email.</p>}
            </div>
          )}

          {view === 'done_refund' && (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '.75rem' }}>✓</div>
              <h2 style={{ fontWeight: 700, color: '#059669', marginBottom: '.5rem' }}>Refund requested</h2>
              <p style={{ color: '#6B7280', lineHeight: 1.6 }}>Your $15 reservation fee will be refunded within 5–10 business days.</p>
              <Link to="/book" style={{ display: 'inline-block', marginTop: '1rem', background: '#0B6E76', color: 'white', textDecoration: 'none', padding: '10px 24px', borderRadius: 8, fontWeight: 700, fontFamily: FF, fontSize: '.875rem' }}>Book a new appointment →</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
