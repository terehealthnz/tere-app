// Provider's day-of-shift queue for rural GP scheduled patients.
//
// Why a separate page (not the main Dashboard acute queue): rural
// patients are time-slotted, not queue-based — showing them mixed
// with acute walk-ins would confuse both flows. GP opens this page
// at the start of their shift and sees their calendar for the day.
//
// Shows scheduled consultations where assigned_provider_id = me and
// scheduled_for is within the next 12h. Each row = one appointment
// with patient, time, reason, status, and a Join button that opens
// the existing ClinicianPatient surface where video + notes already
// live.

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })
}
function fmtDay(iso) {
  return new Date(iso).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })
}
function minutesUntil(iso) {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000)
}

export default function MyRuralQueue() {
  const navigate = useNavigate()
  const [consults, setConsults] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      // Reuse the same /api/consultations filter — but constrained to
      // assigned_provider_id = me AND scheduled_for within next 12h.
      // Server-side filter: GET /api/consultations?provider_id=me&booking_type=scheduled&scheduled_from=now&scheduled_to=+12h
      const from = new Date().toISOString()
      const to   = new Date(Date.now() + 12 * 3600 * 1000).toISOString()
      const r = await apiFetch(`/api/consultations?scope=rural_queue&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      if (r.status === 401) { navigate('/clinician'); return }
      const j = await r.json()
      setConsults(j.consultations || j.data || [])
    } catch (e) { setError(e.message); setConsults([]) }
  }, [navigate])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000) // refresh every minute so the Join button lights up at the right moment
    return () => clearInterval(t)
  }, [load])

  if (consults === null) return <div style={{ padding: '2rem', fontFamily: FF, color: '#6B7280' }}>Loading…</div>

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0', fontFamily: FF, paddingBottom: '4rem' }}>
      <nav style={{ background: NAVY, color: 'white', padding: '.9rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.4rem', cursor: 'pointer', padding: 0 }}>←</button>
        <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Rural GP Queue</div>
        <div style={{ marginLeft: 'auto', fontSize: '.8125rem', color: 'rgba(212,238,240,0.7)' }}>Next 12h</div>
      </nav>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 1rem' }}>
        {error && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '.75rem 1rem', borderRadius: 8, marginBottom: '1rem', fontSize: '.875rem' }}>{error}</div>}

        {consults.length === 0 ? (
          <div style={{ background: 'white', border: '1px dashed #E2E8F0', borderRadius: 10, padding: '2rem', textAlign: 'center', color: '#6B7280' }}>
            No scheduled rural GP appointments in the next 12 hours.
            <div style={{ marginTop: '.75rem' }}>
              <button onClick={() => navigate('/clinician/rural-shifts')}
                style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 8, padding: '.55rem 1rem', fontFamily: FF, fontWeight: 600, fontSize: '.8125rem', cursor: 'pointer' }}>
                Manage my shifts →
              </button>
            </div>
          </div>
        ) : consults.map(c => <AppointmentCard key={c.id} c={c} onJoin={() => navigate(`/clinician/patient/${c.id}`)} />)}
      </div>
    </div>
  )
}

function AppointmentCard({ c, onJoin }) {
  const minsUntil = minutesUntil(c.scheduled_for)
  const joinable  = minsUntil <= 15 && minsUntil >= -60  // 15 min before through 1h after
  const isLive    = c.status === 'in_progress' || c.status === 'waiting'
  const chip = (() => {
    if (c.status === 'completed') return { bg: '#D1FAE5', color: '#065F46', label: 'Done' }
    if (c.status === 'in_progress') return { bg: '#FEF3C7', color: '#92400E', label: 'In call' }
    if (c.status === 'waiting') return { bg: '#DBEAFE', color: '#1E40AF', label: 'Patient joined' }
    if (c.status === 'cancelled') return { bg: '#FEE2E2', color: '#991B1B', label: 'Cancelled' }
    if (minsUntil < 0) return { bg: '#FEF3C7', color: '#92400E', label: `${Math.abs(minsUntil)} min overdue` }
    if (minsUntil <= 15) return { bg: '#D1FAE5', color: '#065F46', label: `in ${minsUntil} min` }
    return { bg: '#F3F4F6', color: '#4B5563', label: `in ${Math.round(minsUntil / 60)}h` }
  })()

  return (
    <div style={{ background: 'white', border: `1px solid ${joinable ? '#D4EEF0' : '#E2E8F0'}`, borderLeft: joinable ? `4px solid ${TEAL}` : '1px solid #E2E8F0', borderRadius: 10, padding: '1rem', marginBottom: '.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ fontWeight: 700, color: NAVY, fontSize: '1.0625rem' }}>{fmtTime(c.scheduled_for)}</div>
            <span style={{ background: chip.bg, color: chip.color, padding: '2px 8px', borderRadius: 99, fontSize: '.6875rem', fontWeight: 700 }}>{chip.label}</span>
          </div>
          <div style={{ fontSize: '.9375rem', color: NAVY, fontWeight: 600 }}>
            {c.patient_first_name} {c.patient_last_name}
          </div>
          <div style={{ fontSize: '.75rem', color: '#6B7280', marginTop: 2 }}>
            {c.rural_practices?.name || 'Rural practice'}{c.chief_complaint ? ` · ${c.chief_complaint}` : ''}
          </div>
        </div>
        <button onClick={onJoin} disabled={!joinable && !isLive}
          style={{ background: (joinable || isLive) ? TEAL : '#E5E7EB', color: (joinable || isLive) ? 'white' : '#9CA3AF', border: 'none', borderRadius: 8, padding: '.6rem 1.1rem', fontFamily: FF, fontWeight: 700, fontSize: '.875rem', cursor: (joinable || isLive) ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
          Open
        </button>
      </div>
    </div>
  )
}
