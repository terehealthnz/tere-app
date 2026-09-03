// NZ Health regulatory audit panels (tasks #389, #390, #391) — three
// small admin surfaces for HNZ/HDC evidence:
//
//   1. HpiQueryAudit    — every /api/hpi lookup (filter audit_logs by event_type)
//   2. Hl7ReceiveAudit  — every inbound HL7 message from Medical-Objects
//   3. Section22fReport — every full-record FHIR export via disclosure_events
//
// Each stands alone; all three go under Admin → Compliance.

import React, { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'

const card = { background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #E2E8F0', marginBottom: '1rem', fontFamily: FF }
const inp = { padding: '.5rem .625rem', border: '1px solid #E2E8F0', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem' }

const nzDateTime = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return String(iso) }
}

function csvExport(header, rows, filenameStem) {
  const csv = [header, ...rows.map(r => header.map(k => (r[k] == null ? '' : String(r[k]).replace(/"/g, '""'))))]
    .map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${v}"` : v).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filenameStem}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// ── 1. HPI query audit ───────────────────────────────────────────────────
export function HpiQueryAudit() {
  const [days, setDays] = useState(30)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const from = new Date(); from.setDate(from.getDate() - days)
      const params = new URLSearchParams({ limit: '500', from: from.toISOString() })
      const res = await apiFetch('/api/audit?' + params.toString())
      const { logs } = await res.json().catch(() => ({ logs: [] }))
      if (cancelled) return
      // Filter to HPI events client-side (audit endpoint doesn't have a
      // starts-with filter; volume is small enough).
      const hpi = (logs || []).filter(l => (l.event_type || '').startsWith('hpi_') || (l.event_type || '').includes('practitioner') || l.resource_type === 'Practitioner' || l.resource_type === 'Location')
      setRows(hpi)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [days])

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '1rem' }}>HPI query audit</div>
          <div style={{ fontSize: '.75rem', color: '#6B7280' }}>Every /api/hpi lookup — HNZ can audit our usage under IN-3502 compliance.</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${days === d ? TEAL : '#E2E8F0'}`, background: days === d ? '#EFF9F9' : 'white', color: days === d ? TEAL : '#374151', fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }}>
              {d}d
            </button>
          ))}
          <button onClick={() => csvExport(['created_at','event_type','provider_name','provider_role','resource_type','resource_id','ip'], rows, 'hpi-query-audit')} disabled={!rows.length}
            style={{ padding: '4px 12px', background: TEAL, color: 'white', border: 'none', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: rows.length ? 'pointer' : 'default' }}>Export CSV</button>
        </div>
      </div>
      {loading ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>Loading…</div>
       : !rows.length ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>No HPI queries in this window.</div>
       : (
        <div style={{ overflowX: 'auto', maxHeight: 300 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.75rem' }}>
            <thead><tr style={{ background: '#F8FAFC', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700 }}>When</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700 }}>Event</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700 }}>Provider</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700 }}>Target</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '6px 8px', color: '#374151' }}>{nzDateTime(r.created_at)}</td>
                  <td style={{ padding: '6px 8px', color: TEAL, fontWeight: 700 }}>{r.event_type}</td>
                  <td style={{ padding: '6px 8px', color: NAVY }}>{r.provider_name || '—'}</td>
                  <td style={{ padding: '6px 8px', color: '#374151' }}>{r.resource_type ? `${r.resource_type}/${r.resource_id || ''}` : (r.metadata?.cpn || '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 2. HL7 inbound audit ─────────────────────────────────────────────────
export function Hl7ReceiveAudit() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [nhi, setNhi] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const params = new URLSearchParams({ limit: '200' })
      if (nhi.trim()) params.set('patient_nhi', nhi.trim())
      const res = await apiFetch('/api/hl7-audit?' + params.toString())
      const data = await res.json().catch(() => ({ files: [] }))
      if (cancelled) return
      setRows(data.files || data.messages || [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [nhi])

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '1rem' }}>HL7 inbound audit</div>
          <div style={{ fontSize: '.75rem', color: '#6B7280' }}>Every HL7 message received from Medical-Objects (Medlab, RHCNZ, etc).</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={nhi} onChange={e => setNhi(e.target.value)} placeholder="Filter by NHI" style={{ ...inp, width: 140 }} />
          <button onClick={() => csvExport(['received_at','sending_facility','message_type','patient_nhi','patient_name','status','id'], rows, 'hl7-inbound-audit')} disabled={!rows.length}
            style={{ padding: '4px 12px', background: TEAL, color: 'white', border: 'none', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: rows.length ? 'pointer' : 'default' }}>Export CSV</button>
        </div>
      </div>
      {loading ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>Loading…</div>
       : !rows.length ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>No HL7 messages{nhi ? ' for that NHI' : ''}.</div>
       : (
        <div style={{ overflowX: 'auto', maxHeight: 300 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.75rem' }}>
            <thead><tr style={{ background: '#F8FAFC', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700 }}>Received</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700 }}>From</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700 }}>Type</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700 }}>Patient</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700 }}>Status</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '6px 8px', color: '#374151' }}>{nzDateTime(r.received_at || r.created_at)}</td>
                  <td style={{ padding: '6px 8px', color: NAVY }}>{r.sending_facility || r.msh6 || '—'}</td>
                  <td style={{ padding: '6px 8px', color: TEAL, fontWeight: 700 }}>{r.message_type || r.msh9 || '—'}</td>
                  <td style={{ padding: '6px 8px', color: '#374151' }}>{r.patient_name || '—'} <span style={{ color: '#6B7280' }}>{r.patient_nhi || ''}</span></td>
                  <td style={{ padding: '6px 8px', color: '#374151' }}>{r.status || 'filed'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 3. Section 22F disclosure report ─────────────────────────────────────
// Reads disclosure_events via a small helper endpoint (we already have
// /api/audit for audit_logs; disclosures are separate). We piggyback on
// /api/audit-log GET which isn't hooked to disclosure_events, so surface
// disclosure_events via a light wrapper — see the endpoint below.

export function Section22fReport() {
  const [days, setDays] = useState(90)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const from = new Date(); from.setDate(from.getDate() - days)
      const params = new URLSearchParams({ channel: 'section_22f_export', from: from.toISOString() })
      const res = await apiFetch('/api/disclosures?' + params.toString())
      const data = await res.json().catch(() => ({ disclosures: [] }))
      if (cancelled) return
      setRows(data.disclosures || [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [days])

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '1rem' }}>Section 22F disclosures</div>
          <div style={{ fontSize: '.75rem', color: '#6B7280' }}>Every full-record FHIR export under s22F Health Act 1956. HNZ/HDC compliance evidence.</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[30, 90, 365].map(d => (
            <button key={d} onClick={() => setDays(d)}
              style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${days === d ? TEAL : '#E2E8F0'}`, background: days === d ? '#EFF9F9' : 'white', color: days === d ? TEAL : '#374151', fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }}>
              {d === 365 ? '1y' : `${d}d`}
            </button>
          ))}
          <button onClick={() => csvExport(['disclosed_at','patient_nhi','destination','destination_label','disclosed_by_name','consent_source','disclosure_purpose','payload_summary'], rows, 'section-22f-disclosures')} disabled={!rows.length}
            style={{ padding: '4px 12px', background: TEAL, color: 'white', border: 'none', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: rows.length ? 'pointer' : 'default' }}>Export CSV</button>
        </div>
      </div>
      {loading ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>Loading…</div>
       : !rows.length ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>No Section 22F disclosures in this window.</div>
       : (
        <div style={{ overflowX: 'auto', maxHeight: 300 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.75rem' }}>
            <thead><tr style={{ background: '#F8FAFC', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700 }}>When</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700 }}>Patient NHI</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700 }}>Destination</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700 }}>By</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700 }}>Consent source</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '6px 8px', color: '#374151' }}>{nzDateTime(r.disclosed_at)}</td>
                  <td style={{ padding: '6px 8px', color: NAVY, fontWeight: 700 }}>{r.patient_nhi || '—'}</td>
                  <td style={{ padding: '6px 8px', color: '#374151' }}>{r.destination_label || r.destination}</td>
                  <td style={{ padding: '6px 8px', color: NAVY }}>{r.disclosed_by_name || '—'}</td>
                  <td style={{ padding: '6px 8px', color: TEAL, fontWeight: 700 }}>{r.consent_source || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
