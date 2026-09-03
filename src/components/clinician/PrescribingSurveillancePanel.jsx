// Admin > Compliance > Patient Prescribing Surveillance (task #424).
// Cross-provider view — surfaces doctor-shopping + polypharmacy signatures
// that the per-provider queue can't see. Paired server-side with
// /api/prescribing-surveillance which requires JIT elevation.

import React, { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const RED  = '#DC2626'
const FF   = 'Plus Jakarta Sans, sans-serif'

const nzDate = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'short', year: '2-digit' }) } catch { return '—' }
}

const card = { background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #E2E8F0', marginBottom: '1rem', fontFamily: FF }

export default function PrescribingSurveillancePanel() {
  const [cls, setCls]       = useState('benzo_opioid')
  const [days, setDays]     = useState(90)
  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr]       = useState(null)
  const [selected, setSelected] = useState(null)

  async function refresh() {
    setLoading(true); setErr(null)
    try {
      const r = await apiFetch(`/api/prescribing-surveillance?class=${cls}&days=${days}`)
      const j = await r.json()
      if (!r.ok) { setErr(j.error || 'load failed'); setRows([]) }
      else setRows(j.patients || [])
    } catch (e) { setErr(e.message); setRows([]) }
    setLoading(false)
  }
  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [cls, days])

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '1rem' }}>Patient Prescribing Surveillance</div>
          <div style={{ fontSize: '.75rem', color: '#6B7280' }}>Cross-provider view — doctor-shopping + polypharmacy signatures. Requires JIT elevation.</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            ['benzo_opioid', 'Benzos/Opioids'],
            ['controlled',   'Controlled'],
            ['all',          'All'],
          ].map(([k, l]) => (
            <button key={k} onClick={() => setCls(k)}
              style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${cls === k ? TEAL : '#E2E8F0'}`, background: cls === k ? '#EFF9F9' : 'white', color: cls === k ? TEAL : '#374151', fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
          ))}
          <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ padding: '4px 8px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: '.75rem', fontFamily: FF }}>
            <option value={30}>30 days</option><option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>365 days</option>
          </select>
        </div>
      </div>

      {err && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '.5rem .75rem', borderRadius: 6, fontSize: '.75rem', marginBottom: 8 }}>
        {err.includes('elevation') ? 'Elevation required — request via /api/elevation with reason.' : err}
      </div>}

      {loading ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>Loading…</div>
       : !rows.length ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>No patients meet the surveillance threshold in this window.</div>
       : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8125rem' }}>
            <thead><tr style={{ background: '#F8FAFC', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Patient</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Rx</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Providers</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Drugs</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Total qty</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>First</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Last</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Risk</th>
              <th style={{ padding: '6px 8px' }}></th>
            </tr></thead>
            <tbody>
              {rows.map(p => {
                const shopping = p.distinct_providers >= 3
                return (
                  <tr key={p.patient_nhi || p.patient_email || p.patient_name} style={{ borderTop: '1px solid #F1F5F9', background: shopping ? '#FEF2F2' : 'white' }}>
                    <td style={{ padding: '6px 8px', color: NAVY, fontWeight: 600 }}>{p.patient_name || p.patient_nhi || p.patient_email || '—'}</td>
                    <td style={{ padding: '6px 8px', color: '#374151' }}>{p.prescription_count}</td>
                    <td style={{ padding: '6px 8px', color: shopping ? RED : '#374151', fontWeight: shopping ? 700 : 400 }}>{p.distinct_providers}</td>
                    <td style={{ padding: '6px 8px', color: '#374151' }}>{p.distinct_drugs}</td>
                    <td style={{ padding: '6px 8px', color: '#374151' }}>{p.total_quantity}</td>
                    <td style={{ padding: '6px 8px', color: '#6B7280' }}>{nzDate(p.first_at)}</td>
                    <td style={{ padding: '6px 8px', color: '#6B7280' }}>{nzDate(p.last_at)}</td>
                    <td style={{ padding: '6px 8px', color: p.risk_score >= 30 ? RED : p.risk_score >= 15 ? '#D97706' : '#374151', fontWeight: 700 }}>{p.risk_score}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                      <button onClick={() => setSelected(p)} style={{ background: 'white', border: '1px solid #E2E8F0', color: NAVY, padding: '3px 8px', borderRadius: 6, fontFamily: FF, fontSize: '.6875rem', fontWeight: 700, cursor: 'pointer' }}>
                        Timeline
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,43,69,.7)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, fontFamily: FF }} onClick={() => setSelected(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 12, padding: '1.25rem', width: '100%', maxWidth: 720, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <div style={{ fontWeight: 800, color: NAVY, fontSize: '1rem' }}>
                {selected.patient_name || selected.patient_nhi || selected.patient_email}
                <span style={{ fontSize: '.75rem', color: '#6B7280', fontWeight: 400, marginLeft: 8 }}>
                  · risk {selected.risk_score} · {selected.distinct_providers} providers · {selected.prescription_count} scripts
                </span>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: '1.25rem' }}>×</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8125rem', marginTop: 8 }}>
              <thead><tr style={{ background: '#F8FAFC' }}>
                <th style={{ padding: '4px 8px', textAlign: 'left', fontSize: '.6875rem', color: '#6B7280', textTransform: 'uppercase' }}>Date</th>
                <th style={{ padding: '4px 8px', textAlign: 'left', fontSize: '.6875rem', color: '#6B7280', textTransform: 'uppercase' }}>Drug</th>
                <th style={{ padding: '4px 8px', textAlign: 'left', fontSize: '.6875rem', color: '#6B7280', textTransform: 'uppercase' }}>Qty × Repeats</th>
                <th style={{ padding: '4px 8px', textAlign: 'left', fontSize: '.6875rem', color: '#6B7280', textTransform: 'uppercase' }}>Provider</th>
              </tr></thead>
              <tbody>
                {selected.prescriptions.map(rx => (
                  <tr key={rx.id} style={{ borderTop: '1px solid #F1F5F9', background: rx.controlled ? '#FEF2F2' : 'white' }}>
                    <td style={{ padding: '4px 8px', color: '#374151' }}>{nzDate(rx.at)}</td>
                    <td style={{ padding: '4px 8px', color: NAVY, fontWeight: 600 }}>{rx.drug}{rx.controlled && ' 🔒'}</td>
                    <td style={{ padding: '4px 8px', color: '#374151' }}>{rx.qty} × {rx.repeats}</td>
                    <td style={{ padding: '4px 8px', color: '#6B7280' }}>{rx.provider || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
