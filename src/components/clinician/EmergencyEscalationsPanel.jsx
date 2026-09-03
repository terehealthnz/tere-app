// Admin > Compliance > Emergency Escalations (task #420). Every 111/ED/UC
// divert fired at triage — with patient location if given, and admin logs
// the follow-up outcome (did they attend, what happened). Regulator-facing
// evidence that the red-flag system actually operates.

import React, { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'

const NAVY  = '#0D2B45'
const TEAL  = '#0B6E76'
const RED   = '#DC2626'
const AMBER = '#D97706'
const FF    = 'Plus Jakarta Sans, sans-serif'

const nzDateTime = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short' }) } catch { return '—' }
}

const TYPE_LABELS = {
  red_flag_111:           { label: '🚨 111', colour: RED },
  divert_ed:              { label: '🏥 ED same-day', colour: '#B45309' },
  divert_urgent_care:     { label: '🏥 Urgent care', colour: '#B45309' },
  divert_gp_today:        { label: '👨‍⚕️ GP today', colour: TEAL },
  provider_initiated_111: { label: '🚨 Provider→111', colour: RED },
}

const OUTCOME_OPTIONS = [
  { v: 'attended_ed',          l: 'Attended ED' },
  { v: 'attended_urgent_care', l: 'Attended urgent care' },
  { v: 'called_111_ambulance', l: 'Called 111 / ambulance dispatched' },
  { v: 'seen_by_gp',           l: 'Seen by GP' },
  { v: 'symptoms_resolved',    l: 'Symptoms resolved without care' },
  { v: 'refused_care',         l: 'Refused care after advice' },
  { v: 'unable_to_contact',    l: 'Unable to contact patient' },
  { v: 'other',                l: 'Other (explain)' },
]

const card = { background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #E2E8F0', marginBottom: '1rem', fontFamily: FF }

export default function EmergencyEscalationsPanel() {
  const [filter, setFilter]     = useState('open')
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(false)
  const [selected, setSelected] = useState(null)

  async function refresh() {
    setLoading(true)
    try {
      const res = await apiFetch('/api/emergency-escalations?filter=' + filter)
      const j = await res.json()
      setRows(j.escalations || [])
    } catch { setRows([]) }
    setLoading(false)
  }
  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [filter])

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '1rem' }}>Emergency Escalations</div>
          <div style={{ fontSize: '.75rem', color: '#6B7280' }}>Every 111/ED/UC divert fired at triage. Record follow-up outcome for regulator-facing evidence.</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['open', 'Open'], ['all', 'All']].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${filter === k ? TEAL : '#E2E8F0'}`, background: filter === k ? '#EFF9F9' : 'white', color: filter === k ? TEAL : '#374151', fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>Loading…</div>
       : !rows.length ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>No escalations under this filter.</div>
       : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8125rem' }}>
            <thead><tr style={{ background: '#F8FAFC', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>When</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Type</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Patient</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Location</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Matched</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Outcome</th>
              <th style={{ padding: '6px 8px' }}></th>
            </tr></thead>
            <tbody>
              {rows.map(e => {
                const t = TYPE_LABELS[e.escalation_type] || { label: e.escalation_type, colour: '#6B7280' }
                const hasLoc = e.patient_location_lat || e.patient_location_text
                return (
                  <tr key={e.id} style={{ borderTop: '1px solid #F1F5F9', background: !e.outcome ? '#FFFBEB' : 'white' }}>
                    <td style={{ padding: '6px 8px', color: '#374151', whiteSpace: 'nowrap' }}>{nzDateTime(e.escalated_at)}</td>
                    <td style={{ padding: '6px 8px', color: t.colour, fontWeight: 700 }}>{t.label}</td>
                    <td style={{ padding: '6px 8px', color: NAVY, fontWeight: 600 }}>{e.patient_name || e.patient_nhi || '—'}{e.patient_phone && <div style={{ fontSize: '.6875rem', color: '#6B7280', fontWeight: 400 }}>{e.patient_phone}</div>}</td>
                    <td style={{ padding: '6px 8px', color: hasLoc ? TEAL : '#9CA3AF', fontSize: '.75rem' }}>
                      {e.patient_location_lat
                        ? <a href={`https://www.google.com/maps?q=${e.patient_location_lat},${e.patient_location_lng}`} target="_blank" rel="noreferrer" style={{ color: TEAL }}>📍 map</a>
                        : e.location_declined_reason || '—'}
                    </td>
                    <td style={{ padding: '6px 8px', color: '#374151', fontSize: '.6875rem' }}>{(e.matched_flags || []).join(', ')}</td>
                    <td style={{ padding: '6px 8px', color: e.outcome ? '#065F46' : AMBER, fontWeight: 600 }}>
                      {e.outcome ? OUTCOME_OPTIONS.find(o => o.v === e.outcome)?.l || e.outcome : '⏳ open'}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                      <button onClick={() => setSelected(e)} style={{ background: 'white', border: '1px solid #E2E8F0', color: NAVY, padding: '3px 8px', borderRadius: 6, fontFamily: FF, fontSize: '.6875rem', fontWeight: 700, cursor: 'pointer' }}>
                        {e.outcome ? 'View' : 'Record outcome'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && <OutcomeModal esc={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); refresh() }} />}
    </div>
  )
}

function OutcomeModal({ esc, onClose, onSaved }) {
  const [outcome, setOutcome] = useState(esc.outcome || '')
  const [notes,   setNotes]   = useState(esc.outcome_notes || '')
  const [busy, setBusy]       = useState(false)
  const [err,  setErr]        = useState(null)

  async function save() {
    if (!outcome) { setErr('Pick an outcome'); return }
    setBusy(true); setErr(null)
    try {
      const res = await apiFetch(`/api/emergency-escalations?id=${esc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome, outcome_notes: notes.trim() || null }),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'save failed') }
      onSaved()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,43,69,.7)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, fontFamily: FF }}>
      <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem', width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <div style={{ fontWeight: 800, color: NAVY, fontSize: '1rem' }}>Escalation outcome</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: '1.25rem' }}>×</button>
        </div>
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '.5rem .75rem', borderRadius: 6, fontSize: '.8125rem', color: '#374151', marginBottom: 10 }}>
          <div><strong>Patient:</strong> {esc.patient_name || esc.patient_nhi || '—'} · {esc.patient_phone || 'no phone'}</div>
          <div><strong>Escalated:</strong> {nzDateTime(esc.escalated_at)}</div>
          <div><strong>Type:</strong> {esc.escalation_type} · <strong>Matched:</strong> {(esc.matched_flags || []).join(', ')}</div>
        </div>

        <div style={{ marginBottom: 8 }}>
          {OUTCOME_OPTIONS.map(o => (
            <label key={o.v} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '.375rem 0', cursor: 'pointer' }}>
              <input type="radio" name="oc" value={o.v} checked={outcome === o.v} onChange={() => setOutcome(o.v)} />
              <span style={{ fontSize: '.8125rem', color: '#374151' }}>{o.l}</span>
            </label>
          ))}
        </div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          placeholder="Notes — who contacted the patient, when, what they reported. Include reference numbers (ED, GP)."
          style={{ width: '100%', boxSizing: 'border-box', padding: '.5rem .75rem', border: '1px solid #E2E8F0', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', resize: 'vertical', minHeight: 80 }} />

        {err && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '.5rem .75rem', borderRadius: 6, fontSize: '.75rem', marginTop: 8 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={onClose} style={{ background: 'white', border: '1px solid #E2E8F0', color: '#374151', padding: '.5rem 1rem', borderRadius: 8, fontFamily: FF, fontSize: '.8125rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={busy || !outcome} style={{ background: outcome ? TEAL : '#CBD5E1', color: 'white', border: 'none', padding: '.5rem 1rem', borderRadius: 8, fontFamily: FF, fontSize: '.8125rem', fontWeight: 700, cursor: outcome ? 'pointer' : 'not-allowed' }}>
            {busy ? 'Saving…' : 'Record outcome'}
          </button>
        </div>
      </div>
    </div>
  )
}
