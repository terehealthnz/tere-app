// PHO coordinator dashboard — scoped to the coord's pho_contract_id.
//
// What the coord sees:
//   - Schedule grid: all scheduled consults across practices in their
//     PHO over the next 7 days (switchable to 28), with provider,
//     patient, time, status
//   - Patient search (by NHI / phone / name prefix) to pull up history
//     + jump to booking
//   - "Book new appointment" button opens a slot picker (practice →
//     time → patient details)
//
// What they do NOT see: acute queue, clinical notes, prescriptions,
// anything outside their PHO. Server-side gating enforces this.

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'

function fmtDayTime(iso) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })}`
}
function dayHeader(iso) {
  return new Date(iso).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })
}
function dayKey(iso) {
  return new Date(iso).toLocaleDateString('en-NZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function PhoCoordinator() {
  const navigate = useNavigate()
  const [schedule, setSchedule] = useState(null)
  const [practices, setPractices] = useState([])
  const [tab, setTab] = useState('schedule')  // schedule | search
  const [horizonDays, setHorizonDays] = useState(7)

  const loadSchedule = useCallback(async () => {
    try {
      const from = new Date().toISOString()
      const to   = new Date(Date.now() + horizonDays * 86400 * 1000).toISOString()
      const r = await apiFetch(`/api/pho-rural?action=coord_schedule&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      if (r.status === 401) { navigate('/clinician'); return }
      if (r.status === 403) { setSchedule([]); return }
      const j = await r.json()
      setSchedule(j.consultations || [])
      setPractices(j.practices || [])
    } catch { setSchedule([]) }
  }, [horizonDays, navigate])

  useEffect(() => { loadSchedule() }, [loadSchedule])

  if (schedule === null) return <div style={{ padding: '2rem', fontFamily: FF, color: '#6B7280' }}>Loading…</div>

  // Group by day
  const byDay = new Map()
  for (const c of schedule) {
    const k = dayKey(c.scheduled_for)
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k).push(c)
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0', fontFamily: FF, paddingBottom: '4rem' }}>
      <nav style={{ background: NAVY, color: 'white', padding: '.9rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button onClick={() => navigate('/clinician/dashboard')} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.4rem', cursor: 'pointer', padding: 0 }}>←</button>
        <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>PHO Coordinator</div>
      </nav>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '1.5rem 1rem' }}>
        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1.25rem', borderBottom: '1px solid #E2E8F0' }}>
          {['schedule', 'search'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ background: 'none', border: 'none', padding: '.6rem 1rem', fontFamily: FF, fontWeight: 600, fontSize: '.9375rem', cursor: 'pointer', color: tab === t ? TEAL : '#6B7280', borderBottom: tab === t ? `2px solid ${TEAL}` : '2px solid transparent', marginBottom: -1 }}>
              {t === 'schedule' ? 'Schedule' : 'Search patient'}
            </button>
          ))}
        </div>

        {tab === 'schedule' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ fontSize: '.875rem', color: '#6B7280' }}>
                {schedule.length} appointment{schedule.length === 1 ? '' : 's'} across {practices.length} practice{practices.length === 1 ? '' : 's'}
              </div>
              <select value={horizonDays} onChange={e => setHorizonDays(Number(e.target.value))}
                style={{ padding: '.4rem .55rem', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: '.8125rem', fontFamily: FF, background: 'white' }}>
                <option value={1}>Today</option>
                <option value={7}>Next 7 days</option>
                <option value={14}>Next 14 days</option>
                <option value={28}>Next 28 days</option>
              </select>
            </div>

            {byDay.size === 0 && (
              <div style={{ background: 'white', border: '1px dashed #E2E8F0', borderRadius: 10, padding: '2rem', textAlign: 'center', color: '#6B7280' }}>
                No appointments scheduled in this window.
              </div>
            )}

            {Array.from(byDay.entries()).map(([day, items]) => (
              <div key={day} style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '.875rem', fontWeight: 700, color: NAVY, marginBottom: '.5rem' }}>
                  {dayHeader(items[0].scheduled_for)}
                </div>
                {items.map(c => <ScheduleRow key={c.id} c={c} practices={practices} />)}
              </div>
            ))}
          </>
        )}

        {tab === 'search' && <PatientSearch practices={practices} />}
      </div>
    </div>
  )
}

function ScheduleRow({ c, practices }) {
  const practice = practices.find(p => p.id === c.rural_practice_id)
  const prov = c.providers
  return (
    <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '.85rem 1rem', marginBottom: '.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem' }}>{fmtDayTime(c.scheduled_for)}</div>
          <div style={{ fontSize: '.8125rem', color: '#4B5563', marginTop: 2 }}>
            {c.patient_first_name} {c.patient_last_name}
            {c.patient_phone && <span style={{ color: '#6B7280' }}> · {c.patient_phone}</span>}
          </div>
          <div style={{ fontSize: '.75rem', color: '#6B7280', marginTop: 2 }}>
            {practice?.name || '—'} · with Dr {prov?.first_name} {prov?.last_name}
            {c.chief_complaint ? ` · ${c.chief_complaint}` : ''}
          </div>
        </div>
        <StatusChip status={c.status} />
      </div>
    </div>
  )
}

function StatusChip({ status }) {
  const cfg = {
    scheduled:  { bg: '#F3F4F6', color: '#4B5563', label: 'Scheduled' },
    waiting:    { bg: '#DBEAFE', color: '#1E40AF', label: 'Patient waiting' },
    in_progress:{ bg: '#FEF3C7', color: '#92400E', label: 'In call' },
    completed:  { bg: '#D1FAE5', color: '#065F46', label: 'Done' },
    complete:   { bg: '#D1FAE5', color: '#065F46', label: 'Done' },
    cancelled:  { bg: '#FEE2E2', color: '#991B1B', label: 'Cancelled' },
  }[status] || { bg: '#F3F4F6', color: '#6B7280', label: status || '—' }
  return <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: 99, fontSize: '.6875rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{cfg.label}</span>
}

function PatientSearch({ practices }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState(null)
  const [history, setHistory] = useState(null)

  async function search() {
    if (!q.trim()) return
    setBusy(true); setResults(null); setHistory(null); setSelected(null)
    try {
      const r = await apiFetch(`/api/pho-rural?action=coord_patient_search&q=${encodeURIComponent(q.trim())}`)
      const j = await r.json()
      setResults(j.patients || [])
    } catch { setResults([]) }
    finally { setBusy(false) }
  }

  async function openPatient(p) {
    setSelected(p); setHistory(null)
    try {
      const r = await apiFetch(`/api/pho-rural?action=patient_history&patient_id=${p.id}`)
      const j = await r.json()
      setHistory(j.history || [])
    } catch { setHistory([]) }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem' }}>
        <input value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="NHI (ZZZ0032), phone, or surname"
          style={{ flex: 1, padding: '.55rem .75rem', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: '.9375rem', fontFamily: FF }} />
        <button onClick={search} disabled={busy || !q.trim()}
          style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 8, padding: '.55rem 1.2rem', fontFamily: FF, fontWeight: 700, fontSize: '.875rem', cursor: 'pointer', opacity: (busy || !q.trim()) ? 0.5 : 1 }}>
          {busy ? '…' : 'Search'}
        </button>
      </div>

      {results !== null && results.length === 0 && (
        <div style={{ color: '#6B7280', fontSize: '.875rem', padding: '1rem', textAlign: 'center' }}>
          No patients in your PHO scope match that search.
        </div>
      )}

      {results && results.length > 0 && !selected && (
        <div>
          {results.map(p => (
            <button key={p.id} onClick={() => openPatient(p)}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: '.75rem 1rem', marginBottom: '.5rem', cursor: 'pointer', fontFamily: FF }}>
              <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem' }}>{p.first_name} {p.last_name}</div>
              <div style={{ fontSize: '.75rem', color: '#6B7280', marginTop: 2 }}>
                {p.dob && `DOB ${p.dob}`}{p.nhi && ` · NHI ${p.nhi}`}{p.phone && ` · ${p.phone}`}
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, padding: '1.25rem' }}>
          <button onClick={() => { setSelected(null); setHistory(null) }}
            style={{ background: 'none', border: 'none', color: TEAL, fontSize: '.8125rem', cursor: 'pointer', padding: 0, marginBottom: '.75rem', fontFamily: FF }}>← back to search</button>
          <div style={{ fontSize: '1.125rem', fontWeight: 700, color: NAVY }}>{selected.first_name} {selected.last_name}</div>
          <div style={{ fontSize: '.8125rem', color: '#6B7280', marginTop: 4, marginBottom: '1rem' }}>
            {selected.dob && `DOB ${selected.dob}`}{selected.nhi && ` · NHI ${selected.nhi}`}{selected.phone && ` · ${selected.phone}`}
          </div>

          <div style={{ fontSize: '.8125rem', fontWeight: 700, color: NAVY, marginBottom: '.5rem' }}>Past consults in your PHO</div>
          {history === null ? <div style={{ color: '#6B7280', fontSize: '.8125rem' }}>Loading…</div>
            : history.length === 0 ? <div style={{ color: '#6B7280', fontSize: '.8125rem' }}>No prior consults.</div>
            : history.map(h => (
              <div key={h.id} style={{ borderLeft: '3px solid #D4EEF0', padding: '.5rem .75rem', marginBottom: '.5rem', fontSize: '.8125rem' }}>
                <div style={{ color: NAVY, fontWeight: 600 }}>{new Date(h.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })} — {h.rural_practices?.name || '—'}</div>
                <div style={{ color: '#6B7280', marginTop: 2 }}>
                  Dr {h.providers?.first_name} {h.providers?.last_name} · {h.chief_complaint || 'No reason recorded'} · <StatusChip status={h.status} />
                </div>
              </div>
            ))}
        </div>
      )}
    </>
  )
}
