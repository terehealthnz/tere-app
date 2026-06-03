import React, { useState, useEffect } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const FF = 'Plus Jakarta Sans, sans-serif'

export default function BookingCancel() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const scheduleChange = searchParams.get('reason') === 'schedule_change'

  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState('review') // review | done
  const [cancelling, setCancelling] = useState(false)
  const [refunded, setRefunded] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch(`/api/bookings?action=detail&id=${id}`)
      .then(r => r.json())
      .then(d => { if (d.booking) setBooking(d.booking); else setError('Booking not found') })
      .catch(() => setError('Could not load booking'))
      .finally(() => setLoading(false))
  }, [id])

  const apptTime  = booking ? new Date(`${booking.appointment_date}T${booking.appointment_time}:00+13:00`) : null
  const hoursUntil = apptTime ? (apptTime - Date.now()) / 3600000 : 0
  const eligibleForRefund = scheduleChange || hoursUntil > 24

  const displayDate = booking ? new Date(booking.appointment_date + 'T12:00:00Z')
    .toLocaleDateString('en-NZ', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) : ''

  async function cancel() {
    setCancelling(true)
    setError('')
    try {
      const res = await apiFetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', id, reason: scheduleChange ? 'schedule_change_patient_refund' : 'patient_cancelled', cancelled_by: 'patient' }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); setCancelling(false); return }
      setRefunded(data.refunded)
      setStep('done')
    } catch { setError('Cancellation failed — please try again'); setCancelling(false) }
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F0F2F5', fontFamily: FF }}>
      <nav style={{ background: '#0D2B45', paddingTop: 'calc(.875rem + env(safe-area-inset-top))', paddingBottom: '.875rem', paddingLeft: '1.5rem', paddingRight: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <Link to="/" style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.3rem', textDecoration: 'none' }}>Tere</Link>
        <span style={{ color: 'rgba(255,255,255,.4)', fontSize: '.875rem' }}>Cancel appointment</span>
      </nav>

      <div style={{ maxWidth: 460, margin: '0 auto', padding: '2rem 1.25rem' }}>
        <div style={{ background: 'white', borderRadius: 16, padding: '1.75rem', border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}>
          {loading && <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF' }}>Loading…</div>}
          {error && !loading && <div style={{ color: '#DC2626', padding: '1rem', textAlign: 'center' }}>{error}</div>}

          {booking && step === 'review' && (
            <>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0D2B45', marginBottom: '1rem' }}>Cancel appointment</h2>
              <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '1rem', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {[
                  ['Date', displayDate],
                  ['Time', booking.appointment_time],
                  ['Type', booking.consultation_type === 'video' ? '📹 Video' : '📞 Phone'],
                  ['Provider', booking.provider_name || 'Your provider'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.9rem' }}>
                    <span style={{ color: '#9CA3AF', fontWeight: 600 }}>{k}</span>
                    <span style={{ fontWeight: 600, color: '#0D2B45' }}>{v}</span>
                  </div>
                ))}
              </div>

              {eligibleForRefund ? (
                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '.875rem', marginBottom: '1.25rem', fontSize: '.875rem', color: '#065F46' }}>
                  ✓ Your <strong>$15 reservation fee will be refunded</strong> within 5–10 business days.
                </div>
              ) : (
                <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '.875rem', marginBottom: '1.25rem', fontSize: '.875rem', color: '#92400E' }}>
                  ⚠ Less than 24 hours notice — the <strong>$15 reservation fee is non-refundable</strong>.
                </div>
              )}

              {error && <div style={{ background: '#FEF2F2', color: '#DC2626', borderRadius: 8, padding: '.75rem', fontSize: '.875rem', marginBottom: '.75rem' }}>{error}</div>}

              <div style={{ display: 'flex', gap: 8 }}>
                <Link to="/" style={{ flex: 1, padding: '11px', border: '1.5px solid #E2E8F0', borderRadius: 8, background: 'white', fontFamily: FF, fontWeight: 600, color: '#6B7280', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  Keep it
                </Link>
                <button onClick={cancel} disabled={cancelling}
                  style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 8, background: '#DC2626', color: 'white', fontFamily: FF, fontWeight: 700, cursor: cancelling ? 'default' : 'pointer' }}>
                  {cancelling ? 'Cancelling…' : 'Cancel appointment'}
                </button>
              </div>
            </>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '.75rem' }}>✓</div>
              <h2 style={{ fontWeight: 700, color: '#0D2B45', marginBottom: '.5rem' }}>Appointment cancelled</h2>
              {refunded ? (
                <p style={{ color: '#6B7280', lineHeight: 1.6 }}>Your <strong>$15 reservation fee has been refunded</strong> and should appear within 5–10 business days.</p>
              ) : (
                <p style={{ color: '#6B7280', lineHeight: 1.6 }}>Your appointment has been cancelled. As the appointment was within 24 hours, the $15 reservation fee has been retained.</p>
              )}
              <Link to="/book" style={{ display: 'inline-block', marginTop: '1.25rem', background: '#0B6E76', color: 'white', textDecoration: 'none', padding: '10px 24px', borderRadius: 8, fontWeight: 700, fontFamily: FF, fontSize: '.875rem' }}>
                Book a new appointment →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
