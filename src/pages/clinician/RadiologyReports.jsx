import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const BG = '#F0F2F5'

function StatusPill({ status }) {
  const map = {
    unmatched: { bg: '#FEF3C7', color: '#78350F', label: 'UNMATCHED' },
    matched:   { bg: '#DBEAFE', color: '#1E40AF', label: 'MATCHED' },
    reviewed:  { bg: '#DCFCE7', color: '#065F46', label: 'REVIEWED' },
    archived:  { bg: '#F1F5F9', color: '#475569', label: 'ARCHIVED' },
  }[status] || { bg: '#F1F5F9', color: '#475569', label: (status || '').toUpperCase() }
  return (
    <span style={{ background: map.bg, color: map.color, fontSize: '.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, letterSpacing: '.04em' }}>
      {map.label}
    </span>
  )
}

function List({ reports, activeId, onSelect }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      {reports.length === 0 && (
        <div style={{ color: '#6B7280', fontSize: '.875rem', textAlign: 'center', padding: '2rem 1rem' }}>
          No reports in this view.
        </div>
      )}
      {reports.map(r => (
        <button key={r.id} onClick={() => onSelect(r.id)}
          style={{
            textAlign: 'left', width: '100%',
            background: r.id === activeId ? '#EFF6FF' : 'white',
            border: r.id === activeId ? `1.5px solid ${TEAL}` : '1px solid #E2E8F0',
            borderRadius: 10, padding: '.875rem 1rem',
            cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem' }}>
              {r.sender_name || r.sender_number || 'Unknown sender'}
            </div>
            <StatusPill status={r.status} />
          </div>
          <div style={{ fontSize: '.75rem', color: '#6B7280' }}>
            {new Date(r.received_at).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            {r.page_count ? ` · ${r.page_count} page${r.page_count === 1 ? '' : 's'}` : ''}
          </div>
        </button>
      ))}
    </div>
  )
}

function Detail({ id, onChanged }) {
  const [state, setState] = useState({ loading: true })
  const [patientId, setPatientId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setState({ loading: true })
    setError('')
    apiFetch(`/api/radiology-reports?id=${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        setState({ loading: false, report: d.report, pdfUrl: d.pdf_url })
        setPatientId(d.report?.patient_id || '')
        setNotes(d.report?.provider_notes || '')
      })
      .catch(() => { if (!cancelled) setState({ loading: false, error: 'Failed to load' }) })
    return () => { cancelled = true }
  }, [id])

  async function save(action) {
    setSaving(true); setError('')
    try {
      const res = await apiFetch('/api/radiology-reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          patient_id: patientId.trim() || null,
          provider_notes: notes,
          action,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Save failed'); setSaving(false); return }
      onChanged?.()
      setState(s => ({ ...s, report: data.report }))
    } catch {
      setError('Connection error')
    }
    setSaving(false)
  }

  if (state.loading) return <div style={{ color: '#6B7280', padding: '2rem', textAlign: 'center' }}>Loading…</div>
  if (state.error) return <div style={{ color: '#DC2626', padding: '2rem', textAlign: 'center' }}>{state.error}</div>
  const r = state.report
  if (!r) return null

  return (
    <div>
      <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1.25rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem', marginBottom: '.75rem' }}>
          <div>
            <div style={{ fontWeight: 700, color: NAVY, fontSize: '1rem' }}>
              {r.study_type || 'Radiology report'}{r.body_part ? ` — ${r.body_part}` : ''}
            </div>
            <div style={{ fontSize: '.8125rem', color: '#6B7280', marginTop: 2 }}>
              Received {new Date(r.received_at).toLocaleString('en-NZ')}
              {r.page_count ? ` · ${r.page_count} pages` : ''}
              {r.sender_name ? ` · from ${r.sender_name}` : (r.sender_number ? ` · from ${r.sender_number}` : '')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {(r.urgency === 'critical' || r.urgency === 'urgent') && (
              <span style={{ background: r.urgency === 'critical' ? '#DC2626' : '#F59E0B', color: 'white', fontSize: '.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, letterSpacing: '.04em', textTransform: 'uppercase' }}>
                {r.urgency}
              </span>
            )}
            <StatusPill status={r.status} />
          </div>
        </div>

        {(r.patient_name_extracted || r.patient_nhi || r.clinical_impression) && (
          <div style={{ background: r.patient_id ? '#F0FDF4' : '#FEF3C7', border: `1px solid ${r.patient_id ? '#BBF7D0' : '#FDE68A'}`, borderRadius: 10, padding: '.75rem 1rem', marginBottom: '.75rem', fontSize: '.8125rem', lineHeight: 1.55, color: '#374151' }}>
            <div style={{ fontWeight: 700, color: r.patient_id ? '#065F46' : '#78350F', marginBottom: 4, fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              {r.patient_id ? '✓ Auto-matched by NHI' : 'AI-extracted (no NHI match)'}
            </div>
            {r.patient_name_extracted && <div><strong>Patient:</strong> {r.patient_name_extracted}{r.patient_dob_extracted ? ` · DOB ${new Date(r.patient_dob_extracted).toLocaleDateString('en-NZ')}` : ''}{r.patient_nhi ? ` · NHI ${r.patient_nhi}` : ''}</div>}
            {r.study_date && <div><strong>Study date:</strong> {new Date(r.study_date).toLocaleDateString('en-NZ')}</div>}
            {r.clinical_impression && <div style={{ marginTop: 6 }}><strong>Impression:</strong> {r.clinical_impression}</div>}
          </div>
        )}

        {state.pdfUrl ? (
          <iframe
            src={state.pdfUrl}
            title="Radiology report PDF"
            style={{ width: '100%', height: '65vh', border: '1px solid #E2E8F0', borderRadius: 8, background: '#F8FAFC' }}
          />
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6B7280', background: '#F8FAFC', borderRadius: 8 }}>
            PDF unavailable — link expired. Reopen this report to refresh.
          </div>
        )}
      </div>

      <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1.25rem' }}>
        <div style={{ marginBottom: '.75rem' }}>
          <label style={{ display: 'block', fontSize: '.8125rem', fontWeight: 700, color: NAVY, marginBottom: '.25rem' }}>Match to patient (UUID)</label>
          <input type="text" value={patientId} onChange={e => setPatientId(e.target.value)}
            placeholder="Paste patient_id from the patient chart"
            style={{ width: '100%', padding: '9px 11px', border: '1px solid #D1D5DB', borderRadius: 8, fontFamily: 'monospace', fontSize: '.8125rem', boxSizing: 'border-box' }} />
        </div>

        <div style={{ marginBottom: '.75rem' }}>
          <label style={{ display: 'block', fontSize: '.8125rem', fontWeight: 700, color: NAVY, marginBottom: '.25rem' }}>Provider notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            placeholder="Findings, follow-up needed, etc."
            style={{ width: '100%', padding: '9px 11px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: '.875rem', fontFamily: 'Plus Jakarta Sans, sans-serif', boxSizing: 'border-box', resize: 'vertical' }} />
        </div>

        {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: '.8125rem', color: '#991B1B', marginBottom: '.75rem' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button onClick={() => save()} disabled={saving} style={{ background: TEAL, color: 'white', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 700, fontSize: '.875rem', cursor: 'pointer', opacity: saving ? .6 : 1 }}>
            {saving ? 'Saving…' : 'Save match'}
          </button>
          <button onClick={() => save('mark_reviewed')} disabled={saving || !patientId.trim()} style={{ background: '#059669', color: 'white', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 700, fontSize: '.875rem', cursor: 'pointer', opacity: (saving || !patientId.trim()) ? .6 : 1 }}>
            Mark reviewed
          </button>
          <button onClick={() => save('archive')} disabled={saving} style={{ background: 'transparent', color: '#6B7280', border: '1px solid #D1D5DB', padding: '10px 18px', borderRadius: 8, fontWeight: 700, fontSize: '.875rem', cursor: 'pointer' }}>
            Archive
          </button>
        </div>
      </div>
    </div>
  )
}

export default function RadiologyReports() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const preselectId = params.get('id')
  // If deep-linked with ?id=X, land on 'all' so the specific report is
  // visible regardless of its current status.
  const [filter, setFilter] = useState(preselectId ? 'all' : 'unmatched')
  const [reports, setReports] = useState(null)
  const [activeId, setActiveId] = useState(preselectId || null)

  useEffect(() => {
    if (!sessionStorage.getItem('clinicianAuth')) navigate('/clinician')
  }, [navigate])

  async function load() {
    try {
      const q = filter && filter !== 'all' ? `?status=${filter}` : ''
      const res = await apiFetch(`/api/radiology-reports${q}`)
      const data = await res.json()
      setReports(data.reports || [])
    } catch {
      setReports([])
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [filter])

  const filtered = reports || []

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <nav style={{ background: NAVY, padding: '.875rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/clinician/dashboard" style={{ textDecoration: 'none', color: '#D4EEF0', fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: '1.4rem' }}>Tere</Link>
        <div style={{ color: 'white', fontSize: '.9375rem', fontWeight: 700 }}>Radiology reports</div>
        <div />
      </nav>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {['unmatched', 'matched', 'reviewed', 'archived', 'all'].map(f => (
            <button key={f} onClick={() => { setFilter(f); setActiveId(null) }}
              style={{
                background: filter === f ? NAVY : 'white',
                color: filter === f ? 'white' : NAVY,
                border: filter === f ? 'none' : '1px solid #D1D5DB',
                padding: '7px 14px', borderRadius: 99,
                fontSize: '.8125rem', fontWeight: 700, cursor: 'pointer',
                textTransform: 'capitalize',
              }}>
              {f}
            </button>
          ))}
          <button onClick={load} style={{ background: 'transparent', color: TEAL, border: `1px solid ${TEAL}`, padding: '7px 14px', borderRadius: 99, fontSize: '.8125rem', fontWeight: 700, cursor: 'pointer', marginLeft: 'auto' }}>
            ↻ Refresh
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: '1rem' }}>
          <div>
            {reports === null ? (
              <div style={{ color: '#6B7280', textAlign: 'center', padding: '2rem' }}>Loading…</div>
            ) : (
              <List reports={filtered} activeId={activeId} onSelect={setActiveId} />
            )}
          </div>
          <div>
            {activeId ? (
              <Detail id={activeId} onChanged={load} />
            ) : (
              <div style={{ background: 'white', border: '1px dashed #D1D5DB', borderRadius: 12, padding: '4rem 2rem', textAlign: 'center', color: '#6B7280', fontSize: '.9375rem' }}>
                Select a report on the left to view it.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
