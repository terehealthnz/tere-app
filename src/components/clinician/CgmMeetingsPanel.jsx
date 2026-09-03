// Admin > Compliance > Clinical Governance Meetings (task #427).
// Log meeting minutes with cadence enforcement banner. Regulator-facing
// evidence-of-operation for the Clinical Governance Framework.

import React, { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const RED  = '#DC2626'
const AMBER = '#D97706'
const FF   = 'Plus Jakarta Sans, sans-serif'

const TYPE_LABELS = {
  clinical_governance:    'Clinical Governance',
  peer_review:            'Peer Review',
  morbidity_mortality:    'M&M',
  incident_review:        'Incident Review',
  audit_review:           'Audit Review',
  safety_netting_review:  'Safety-Netting Review',
  other:                  'Other',
}

// Expected cadence (days) for the overdue banner. Not enforced server-side
// — provider sets next_meeting_due_at explicitly.
const EXPECTED_CADENCE_DAYS = {
  clinical_governance:    90,   // quarterly
  peer_review:            30,   // monthly sample review
  morbidity_mortality:    90,
  incident_review:         0,   // ad-hoc; only overdue if next_meeting_due_at set
  audit_review:           180,
  safety_netting_review:  30,   // monthly — turns min-40-chars gate into a real control
}

const nzDate = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'short', year: 'numeric' }) } catch { return '—' }
}

const card = { background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #E2E8F0', marginBottom: '1rem', fontFamily: FF }
const inp  = { padding: '.5rem .625rem', border: '1px solid #E2E8F0', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', width: '100%', boxSizing: 'border-box' }
const lbl  = { fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }

export default function CgmMeetingsPanel() {
  const [rows, setRows]         = useState([])
  const [cadence, setCadence]   = useState({})
  const [loading, setLoading]   = useState(false)
  const [addOpen, setAddOpen]   = useState(false)
  const [form, setForm]         = useState({
    meeting_type: 'clinical_governance', meeting_at: '', duration_minutes: 60,
    attendees: '', agenda: '', minutes: '', actions_noted: '', next_meeting_due_at: '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState(null)
  const [safetyNetSamples, setSafetyNetSamples] = useState([])
  const [loadingSamples, setLoadingSamples]     = useState(false)

  async function loadSafetyNetSamples() {
    setLoadingSamples(true)
    try {
      const r = await apiFetch('/api/cgm-meetings?action=safety_netting_samples&days=30')
      const j = await r.json()
      setSafetyNetSamples(j.samples || [])
    } catch { setSafetyNetSamples([]) }
    setLoadingSamples(false)
  }

  async function refresh() {
    setLoading(true)
    try {
      const r = await apiFetch('/api/cgm-meetings')
      const j = await r.json()
      setRows(j.meetings || []); setCadence(j.cadence || {})
    } catch { setRows([]); setCadence({}) }
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  // Overdue calculation combines the server-side next_meeting_due_at with
  // the frontend EXPECTED_CADENCE_DAYS when the server hasn't set one.
  function isOverdue(type, c) {
    if (!c) {
      const expect = EXPECTED_CADENCE_DAYS[type]
      return expect > 0 ? true : false  // no meetings logged AND cadence expected
    }
    if (c.overdue) return true
    const expect = EXPECTED_CADENCE_DAYS[type]
    if (!expect) return false
    return c.days_since > expect
  }

  async function save() {
    if (form.minutes.length < 200) { setErr('Minutes must be ≥ 200 chars'); return }
    if (!form.meeting_at) { setErr('Meeting date required'); return }
    setBusy(true); setErr(null)
    try {
      const payload = {
        ...form,
        attendees:            form.attendees ? form.attendees.split(',').map(s => s.trim()).filter(Boolean) : [],
        actions_noted:        form.actions_noted ? form.actions_noted.split('\n').map(s => s.trim()).filter(Boolean) : [],
        duration_minutes:     Number(form.duration_minutes) || null,
        next_meeting_due_at:  form.next_meeting_due_at || null,
        safety_netting_samples_reviewed_ids: safetyNetSamples.map(s => s.id),
      }
      const r = await apiFetch('/api/cgm-meetings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) { const j = await r.json(); throw new Error(j.error || 'save failed') }
      setForm({ meeting_type: 'clinical_governance', meeting_at: '', duration_minutes: 60, attendees: '', agenda: '', minutes: '', actions_noted: '', next_meeting_due_at: '' })
      setSafetyNetSamples([])
      setAddOpen(false)
      await refresh()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '1rem' }}>Clinical Governance Meetings</div>
          <div style={{ fontSize: '.75rem', color: '#6B7280' }}>Evidence-of-operation for the Clinical Governance Framework. Log minutes + set next-meeting date to keep the cadence banner green.</div>
        </div>
        <button onClick={() => setAddOpen(o => !o)} style={{ padding: '4px 12px', background: TEAL, color: 'white', border: 'none', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }}>+ Log meeting</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 10 }}>
        {Object.entries(TYPE_LABELS).map(([type, label]) => {
          const c = cadence[type]
          const overdue = isOverdue(type, c)
          const expect = EXPECTED_CADENCE_DAYS[type]
          return (
            <div key={type} style={{ padding: '.5rem .625rem', border: `1px solid ${overdue ? '#FECACA' : '#BBF7D0'}`, background: overdue ? '#FEF2F2' : '#F0FDF4', borderRadius: 6 }}>
              <div style={{ fontWeight: 700, color: NAVY, fontSize: '.75rem' }}>{label}</div>
              <div style={{ fontSize: '.6875rem', color: overdue ? RED : '#065F46', marginTop: 2 }}>
                {c ? `Last: ${nzDate(c.last_at)} · ${c.days_since}d ago` : 'No meetings logged'}
                {expect > 0 && <div>Cadence: every ~{expect}d</div>}
                {c?.next_due_at && <div>Next due: {nzDate(c.next_due_at)}{c.overdue ? ' ⏰ overdue' : ''}</div>}
              </div>
            </div>
          )
        })}
      </div>

      {addOpen && (
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '.875rem', marginBottom: '.75rem' }}>
          {err && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '.5rem .75rem', borderRadius: 6, fontSize: '.75rem', marginBottom: 8 }}>{err}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 1fr', gap: 8 }}>
            <div>
              <label style={lbl}>Type</label>
              <select value={form.meeting_type} onChange={e => setForm(f => ({ ...f, meeting_type: e.target.value }))} style={inp}>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Meeting date/time</label>
              <input type="datetime-local" value={form.meeting_at} onChange={e => setForm(f => ({ ...f, meeting_at: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={lbl}>Duration (min)</label>
              <input type="number" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={lbl}>Next meeting due</label>
              <input type="date" value={form.next_meeting_due_at} onChange={e => setForm(f => ({ ...f, next_meeting_due_at: e.target.value }))} style={inp} />
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <label style={lbl}>Attendees (comma-separated)</label>
            <input value={form.attendees} onChange={e => setForm(f => ({ ...f, attendees: e.target.value }))} placeholder="Dr Rachel Thomas, Dr Patrick Herling, …" style={inp} />
          </div>
          <div style={{ marginTop: 8 }}>
            <label style={lbl}>Agenda (optional)</label>
            <input value={form.agenda} onChange={e => setForm(f => ({ ...f, agenda: e.target.value }))} style={inp} />
          </div>
          {form.meeting_type === 'safety_netting_review' && (
            <div style={{ marginTop: 8, padding: '.625rem .75rem', background: 'white', border: '1px dashed #FDE68A', borderRadius: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#78350F' }}>Peer-review samples (from last 30 days)</div>
                <button type="button" onClick={loadSafetyNetSamples} disabled={loadingSamples}
                  style={{ padding: '3px 10px', background: '#D97706', color: 'white', border: 'none', borderRadius: 6, fontSize: '.6875rem', fontWeight: 700, cursor: 'pointer' }}>
                  {loadingSamples ? 'Loading…' : safetyNetSamples.length ? '↻ Reload 5 samples' : 'Load 5 random samples'}
                </button>
              </div>
              {safetyNetSamples.length === 0 && !loadingSamples && (
                <div style={{ fontSize: '.75rem', color: '#9CA3AF' }}>Click "Load 5 random samples" to pull the last 30d of finalised safety-netting text for peer review.</div>
              )}
              {safetyNetSamples.map((s, i) => (
                <div key={s.id} style={{ borderTop: i > 0 ? '1px solid #F1F5F9' : 'none', padding: '.5rem 0', fontSize: '.75rem' }}>
                  <div style={{ color: '#374151', fontWeight: 700 }}>
                    {(s.patient_first_name || '') + ' ' + (s.patient_last_name || '')} — {s.chief_complaint || '(no CC)'}
                    <span style={{ color: '#9CA3AF', fontWeight: 400, marginLeft: 8 }}>by {s.notes_finalised_by || '—'}</span>
                  </div>
                  <div style={{ color: '#374151', marginTop: 4, whiteSpace: 'pre-wrap', background: '#F8FAFC', padding: '.5rem .625rem', borderRadius: 4 }}>
                    {(s.safety_netting_text || '').slice(0, 400)}
                    {(s.safety_netting_text || '').length > 400 ? '…' : ''}
                  </div>
                </div>
              ))}
              {safetyNetSamples.length > 0 && (
                <div style={{ fontSize: '.6875rem', color: '#78350F', marginTop: 6 }}>
                  ✓ These {safetyNetSamples.length} consultation IDs will be linked to the meeting for audit.
                </div>
              )}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <label style={lbl}>Minutes <span style={{ color: form.minutes.length >= 200 ? '#059669' : '#D97706' }}>({form.minutes.length}/200 min)</span></label>
            <textarea value={form.minutes} onChange={e => setForm(f => ({ ...f, minutes: e.target.value }))} rows={8} style={{ ...inp, minHeight: 140 }} placeholder="Discussion, decisions, action-owners. Enough that a regulator can see what was reviewed." />
          </div>
          <div style={{ marginTop: 8 }}>
            <label style={lbl}>Actions noted (one per line)</label>
            <textarea value={form.actions_noted} onChange={e => setForm(f => ({ ...f, actions_noted: e.target.value }))} rows={3} style={{ ...inp, minHeight: 60 }} placeholder="Rachel to review prescribing surveillance monthly&#10;Patrick to update onboarding checklist" />
          </div>
          <button onClick={save} disabled={busy} style={{ marginTop: 10, padding: '6px 14px', background: TEAL, color: 'white', border: 'none', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }}>
            {busy ? 'Saving…' : 'Save meeting'}
          </button>
        </div>
      )}

      {loading ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>Loading…</div>
       : !rows.length ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>No meetings logged yet.</div>
       : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8125rem' }}>
          <thead><tr style={{ background: '#F8FAFC', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>When</th>
            <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Type</th>
            <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Chair</th>
            <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Attendees</th>
            <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Actions</th>
          </tr></thead>
          <tbody>
            {rows.map(m => (
              <tr key={m.id} style={{ borderTop: '1px solid #F1F5F9', verticalAlign: 'top' }}>
                <td style={{ padding: '6px 8px', color: '#374151', whiteSpace: 'nowrap' }}>{nzDate(m.meeting_at)}</td>
                <td style={{ padding: '6px 8px', color: TEAL, fontWeight: 700 }}>{TYPE_LABELS[m.meeting_type] || m.meeting_type}</td>
                <td style={{ padding: '6px 8px', color: NAVY, fontWeight: 600 }}>{m.chair_name || '—'}</td>
                <td style={{ padding: '6px 8px', color: '#6B7280' }}>{(m.attendees || []).join(', ')}</td>
                <td style={{ padding: '6px 8px', color: '#374151' }}>
                  {(m.actions_noted || []).length ? (
                    <ul style={{ margin: 0, paddingLeft: '1rem' }}>{m.actions_noted.slice(0, 3).map((a, i) => <li key={i} style={{ fontSize: '.75rem' }}>{a}</li>)}</ul>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
