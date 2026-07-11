import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const FF = 'Plus Jakarta Sans, sans-serif'
const PRICES = { consult: 60, video: 60, phone: 60 }

export default function BookingJoin() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch(`/api/bookings?action=detail&id=${id}`)
      .then(r => r.json())
      .then(d => { if (d.booking) setBooking(d.booking); else setError('Booking not found') })
      .catch(() => setError('Could not load booking'))
      .finally(() => setLoading(false))
  }, [id])

  async function startConsultation() {
    if (!booking) return
    setStarting(true)
    setError('')
    try {
      const { createConsultation } = await import('../../lib/supabase')
      const nameParts = booking.patient_name.trim().split(' ')
      const consultation = await createConsultation({
        firstName: nameParts[0],
        lastName: nameParts.slice(1).join(' ') || '',
        dob: booking.patient_dob || '',
        phone: booking.patient_phone,
        email: booking.patient_email || '',
        complaint: booking.reason || 'Scheduled appointment',
        pharmacy: '',
        accEligible: 'no',
        recordingConsent: true,
        patientLanguage: 'en',
        employerPaid: false,
        hdcRightsAccepted: true,
        status: 'waiting',
      })
      sessionStorage.setItem('consultationId', consultation.id)
      sessionStorage.setItem('consultationType', booking.consultation_type)
      sessionStorage.setItem('accEligible', 'no')
      sessionStorage.setItem('bookingId', booking.id)
      sessionStorage.setItem('patientName', booking.patient_name)
      sessionStorage.setItem('patientEmail', booking.patient_email || '')
      sessionStorage.setItem('patient_language', 'en')
      navigate('/payment')
    } catch (e) {
      setError('Could not start consultation — please try again')
      setStarting(false)
    }
  }

  const fee = booking ? PRICES[booking.consultation_type] || 60 : 60
  const displayDate = booking ? new Date(booking.appointment_date + 'T12:00:00Z')
    .toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' }) : ''

  const isToday = booking ? booking.appointment_date === new Date().toISOString().slice(0, 10) : false
  const apptTime = booking ? new Date(`${booking.appointment_date}T${booking.appointment_time}:00+13:00`) : null
  const minsUntil = apptTime ? Math.round((apptTime - Date.now()) / 60000) : 0
  const canJoin = isToday && minsUntil <= 30

  return (
    <div style={{ minHeight: '100dvh', background: '#F0F2F5', fontFamily: FF }}>
      <nav style={{ background: '#0D2B45', paddingTop: 'calc(.875rem + env(safe-area-inset-top))', paddingBottom: '.875rem', paddingLeft: '1.5rem', paddingRight: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <Link to="/" style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.3rem', textDecoration: 'none' }}>Tere</Link>
        <span style={{ color: 'rgba(255,255,255,.4)', fontSize: '.875rem' }}>Join appointment</span>
      </nav>

      <div style={{ maxWidth: 460, margin: '0 auto', padding: '2rem 1.25rem' }}>
        <div style={{ background: 'white', borderRadius: 16, padding: '1.75rem', border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}>
          {loading && <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF' }}>Loading…</div>}
          {error && !loading && <div style={{ color: '#DC2626', textAlign: 'center', padding: '1rem' }}>{error}</div>}

          {booking && (
            <>
              <div style={{ textAlign: 'center', fontSize: '3rem', marginBottom: '.75rem' }}>
                {booking.consultation_type === 'video' ? '📹' : '📞'}
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0D2B45', textAlign: 'center', marginBottom: '.25rem' }}>
                {booking.consultation_type === 'video' ? 'Video' : 'Phone'} consultation
              </h2>
              <div style={{ textAlign: 'center', color: '#6B7280', fontSize: '.9375rem', marginBottom: '1.5rem' }}>
                with {booking.provider_name || 'your provider'}
              </div>

              <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '1rem', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {[
                  ['Date', displayDate],
                  ['Time', booking.appointment_time],
                  ['Patient', booking.patient_name],
                  ['Reason', booking.reason || 'General consultation'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.9rem' }}>
                    <span style={{ color: '#9CA3AF', fontWeight: 600 }}>{k}</span>
                    <span style={{ fontWeight: 600, color: '#0D2B45', maxWidth: '65%', textAlign: 'right' }}>{v}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: '#F0F9FA', border: '1px solid #D4EEF0', borderRadius: 8, padding: '.875rem', marginBottom: '1.25rem', fontSize: '.875rem', color: '#374151', lineHeight: 1.5 }}>
                <strong>Consultation fee: ${fee}</strong> — charged when you join.<br />
                <span style={{ color: '#6B7280' }}>Your $15 reservation fee was charged at booking and is separate.</span>
              </div>

              {!isToday && (
                <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '.875rem', marginBottom: '1.25rem', fontSize: '.875rem', color: '#92400E', textAlign: 'center' }}>
                  Your appointment is on <strong>{displayDate}</strong>. You can join up to 30 minutes before your scheduled time.
                </div>
              )}

              {isToday && !canJoin && minsUntil > 0 && (
                <div style={{ background: '#F0F9FA', border: '1px solid #D4EEF0', borderRadius: 8, padding: '.875rem', marginBottom: '1.25rem', fontSize: '.875rem', color: '#374151', textAlign: 'center' }}>
                  Your appointment starts in <strong>{minsUntil} minutes</strong>. Join opens 30 minutes before.
                </div>
              )}

              {error && <div style={{ background: '#FEF2F2', color: '#DC2626', borderRadius: 8, padding: '.75rem', fontSize: '.875rem', marginBottom: '.875rem' }}>{error}</div>}

              <button onClick={startConsultation} disabled={!canJoin || starting}
                style={{ width: '100%', padding: '14px', border: 'none', borderRadius: 10, fontFamily: FF, fontWeight: 700, fontSize: '1.0625rem', cursor: canJoin && !starting ? 'pointer' : 'default', background: canJoin ? '#059669' : '#E2E8F0', color: canJoin ? 'white' : '#9CA3AF', boxShadow: canJoin ? '0 4px 12px rgba(5,150,105,.3)' : 'none' }}>
                {starting ? 'Starting…' : canJoin ? `Start consultation — $${fee}` : 'Not yet time to join'}
              </button>

              <div style={{ marginTop: '1.25rem', textAlign: 'center', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <Link to={`/booking/change/${booking.id}`} style={{ color: '#6B7280', fontSize: '.8125rem', textDecoration: 'underline', fontFamily: FF }}>Reschedule</Link>
                <Link to={`/booking/cancel/${booking.id}`} style={{ color: '#6B7280', fontSize: '.8125rem', textDecoration: 'underline', fontFamily: FF }}>Cancel</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
