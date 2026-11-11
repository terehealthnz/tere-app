// Provider self-serve rural GP shift manager.
//
// Purpose: a GP tells Tere "I'm available to cover Renwick on Tue
// 2026-11-18 from 10am to 12pm in 15-min slots." That creates a
// provider_rural_shifts row; the row encodes both availability AND
// PHO allocation to that practice (one shift = one practice).
//
// Flow:
//  - List upcoming shifts + last 7 days (for audit while booked
//    patients still hold the slot).
//  - "Add shift" opens an inline form: practice picker, start/end
//    datetime, slot length (15/20/30).
//  - Cancel per-row: soft-cancel; server blocks if any non-cancelled
//    bookings fall inside the shift window (provider must reschedule
//    those patients first).
//
// Patient booking flow (/gp/[slug]) and PHO coordinator dashboard
// consume these shifts through the public available_slots endpoint.

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const AMBER = '#B45309'
const FF   = 'Plus Jakarta Sans, sans-serif'

function fmtRange(startIso, endIso) {
  const s = new Date(startIso), e = new Date(endIso)
  const d = s.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })
  const st = s.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })
  const et = e.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })
  return `${d} · ${st} – ${et}`
}

function slotCount(startIso, endIso, slotMin) {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  return Math.floor(ms / (slotMin * 60 * 1000))
}

export default function MyRuralShifts() {
  const navigate = useNavigate()
  const [shifts, setShifts] = useState(null)
  const [practices, setPractices] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500) }

  const load = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([
        apiFetch('/api/pho-rural?action=my_shifts'),
        apiFetch('/api/pho-rural?action=practices'),
      ])
      const [j1, j2] = await Promise.all([r1.json(), r2.json()])
      if (r1.status === 401) { navigate('/clinician'); return }
      setShifts(j1.shifts || [])
      setPractices(j2.practices || [])
    } catch (e) { setShifts([]) }
  }, [navigate])

  useEffect(() => { load() }, [load])

  async function cancelShift(shift_id) {
    if (!confirm('Cancel this shift? Any booked patients will block the cancel.')) return
    const r = await apiFetch('/api/pho-rural', { method: 'POST', body: JSON.stringify({ action: 'cancel_shift', shift_id }) })
    const j = await r.json()
    if (!r.ok) { showToast(j.error || 'Cancel failed', false); return }
    showToast('Shift cancelled')
    load()
  }

  if (shifts === null) {
    return <div style={{ padding: '2rem', fontFamily: FF, color: '#6B7280' }}>Loading…</div>
  }

  const now = Date.now()
  const upcoming = shifts.filter(s => !s.cancelled_at && new Date(s.end_at).getTime() > now)
  const past     = shifts.filter(s =>  s.cancelled_at || new Date(s.end_at).getTime() <= now)

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0', fontFamily: FF, paddingBottom: '4rem' }}>
      <nav style={{ background: NAVY, color: 'white', padding: '.9rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.4rem', cursor: 'pointer', padding: 0 }}>←</button>
        <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>My Rural GP Shifts</div>
      </nav>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 1rem' }}>
        <div style={{ background: '#F0F9FA', border: '1px solid #C7EAEC', borderRadius: 10, padding: '.85rem 1rem', color: NAVY, fontSize: '.875rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
          Self-roster when you're available to cover a rural practice. Patients book into your shift via the practice's /gp/[slug] page or the PHO coordinator does it on their behalf. Each shift runs a single practice at a single slot length (15 / 20 / 30 min).
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: NAVY, fontWeight: 700 }}>Upcoming shifts ({upcoming.length})</h3>
          <button onClick={() => setShowAdd(true)}
            style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 8, padding: '.55rem 1rem', fontFamily: FF, fontWeight: 600, fontSize: '.8125rem', cursor: 'pointer' }}>
            + Add shift
          </button>
        </div>

        {upcoming.length === 0 && (
          <div style={{ background: 'white', border: '1px dashed #E2E8F0', borderRadius: 10, padding: '1.5rem', textAlign: 'center', color: '#9CA3AF', marginBottom: '1.5rem' }}>
            No upcoming shifts. Add one so PHO coordinators can book patients to you.
          </div>
        )}

        {upcoming.map(s => <ShiftCard key={s.id} shift={s} onCancel={() => cancelShift(s.id)} />)}

        {past.length > 0 && (
          <>
            <h3 style={{ margin: '2rem 0 .75rem', fontSize: '.9375rem', color: '#6B7280', fontWeight: 600 }}>Past / cancelled</h3>
            {past.slice(0, 10).map(s => <ShiftCard key={s.id} shift={s} muted />)}
          </>
        )}
      </div>

      {showAdd && <AddShiftModal practices={practices} onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); load(); showToast('Shift added') }} />}
      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  )
}

function ShiftCard({ shift, onCancel, muted }) {
  const slots = slotCount(shift.start_at, shift.end_at, shift.slot_minutes)
  const cancelled = !!shift.cancelled_at
  return (
    <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, padding: '1rem', marginBottom: '.75rem', opacity: muted || cancelled ? 0.65 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem' }}>{shift.rural_practices?.name || '—'}</div>
          <div style={{ fontSize: '.8125rem', color: '#4B5563', marginTop: 4 }}>{fmtRange(shift.start_at, shift.end_at)}</div>
          <div style={{ fontSize: '.75rem', color: '#6B7280', marginTop: 4 }}>
            {shift.slot_minutes} min slots · up to {slots} appointments
            {cancelled && <span style={{ color: '#DC2626', marginLeft: 8 }}>· cancelled {new Date(shift.cancelled_at).toLocaleDateString('en-NZ')}</span>}
          </div>
        </div>
        {!muted && !cancelled && (
          <button onClick={onCancel}
            style={{ background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: 6, padding: '4px 10px', fontSize: '.75rem', fontFamily: FF, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

function AddShiftModal({ practices, onClose, onDone }) {
  const [practiceId, setPracticeId] = useState(practices[0]?.id || '')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('12:00')
  const [slotMin, setSlotMin] = useState(15)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setError(''); setBusy(true)
    try {
      if (!practiceId || !date || !startTime || !endTime) throw new Error('All fields required')
      const start_at = new Date(`${date}T${startTime}:00`).toISOString()
      const end_at   = new Date(`${date}T${endTime}:00`).toISOString()
      const r = await apiFetch('/api/pho-rural', {
        method: 'POST',
        body: JSON.stringify({ action: 'create_shift', rural_practice_id: practiceId, start_at, end_at, slot_minutes: Number(slotMin) }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not add shift')
      onDone()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 12, padding: '1.5rem', maxWidth: 460, width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: NAVY, marginBottom: '1rem' }}>Add rural GP shift</div>

        <label style={{ display: 'block', fontSize: '.8125rem', color: '#4B5563', marginBottom: '.75rem' }}>
          <div style={{ marginBottom: '.3rem', fontWeight: 600 }}>Practice</div>
          <select value={practiceId} onChange={e => setPracticeId(e.target.value)}
            style={{ width: '100%', padding: '.55rem .65rem', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: '.875rem', fontFamily: FF, background: 'white' }}>
            {practices.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>

        <label style={{ display: 'block', fontSize: '.8125rem', color: '#4B5563', marginBottom: '.75rem' }}>
          <div style={{ marginBottom: '.3rem', fontWeight: 600 }}>Date</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            max={new Date(Date.now() + 28 * 86400 * 1000).toISOString().slice(0, 10)}
            style={{ width: '100%', padding: '.55rem .65rem', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: '.875rem', fontFamily: FF }} />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.75rem', marginBottom: '1rem' }}>
          <label style={{ fontSize: '.8125rem', color: '#4B5563' }}>
            <div style={{ marginBottom: '.3rem', fontWeight: 600 }}>Start</div>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              style={{ width: '100%', padding: '.55rem .4rem', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: '.875rem', fontFamily: FF }} />
          </label>
          <label style={{ fontSize: '.8125rem', color: '#4B5563' }}>
            <div style={{ marginBottom: '.3rem', fontWeight: 600 }}>End</div>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
              style={{ width: '100%', padding: '.55rem .4rem', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: '.875rem', fontFamily: FF }} />
          </label>
          <label style={{ fontSize: '.8125rem', color: '#4B5563' }}>
            <div style={{ marginBottom: '.3rem', fontWeight: 600 }}>Slot</div>
            <select value={slotMin} onChange={e => setSlotMin(e.target.value)}
              style={{ width: '100%', padding: '.55rem .4rem', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: '.875rem', fontFamily: FF, background: 'white' }}>
              <option value={15}>15 min</option>
              <option value={20}>20 min</option>
              <option value={30}>30 min</option>
            </select>
          </label>
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '.6rem .75rem', color: '#991B1B', fontSize: '.8125rem', marginBottom: '1rem' }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={busy}
            style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '.6rem 1rem', fontFamily: FF, fontWeight: 600, fontSize: '.875rem', cursor: 'pointer', color: '#4B5563' }}>
            Cancel
          </button>
          <button onClick={submit} disabled={busy}
            style={{ background: TEAL, border: 'none', borderRadius: 8, padding: '.6rem 1.2rem', fontFamily: FF, fontWeight: 700, fontSize: '.875rem', cursor: 'pointer', color: 'white', opacity: busy ? 0.5 : 1 }}>
            {busy ? 'Saving…' : 'Add shift'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Toast({ msg, ok }) {
  return (
    <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: ok ? '#065F46' : '#991B1B', color: 'white', padding: '.75rem 1.25rem', borderRadius: 10, fontSize: '.875rem', fontWeight: 600, fontFamily: FF, zIndex: 300, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
      {msg}
    </div>
  )
}
