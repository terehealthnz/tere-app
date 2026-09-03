// Controlled Drugs Register — Medsafe / Misuse of Drugs Regs 1977 Reg 44
// admin surface. Every prescription flagged controlled=true, filterable by
// date range + drug, exportable to CSV for regulator submission.

import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'

const nzDateTime = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return String(iso) }
}
const inp = { padding: '.5rem .625rem', border: '1px solid #E2E8F0', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', outline: 'none' }
const lbl = { fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }

export default function ControlledDrugsRegister() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 90)
    return d.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [drug, setDrug] = useState('')

  async function refresh() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ filter: 'controlled_register' })
      if (from) params.set('from', new Date(from + 'T00:00:00').toISOString())
      if (to)   params.set('to',   new Date(to   + 'T23:59:59.999').toISOString())
      if (drug.trim()) params.set('drug', drug.trim())
      const res = await apiFetch(`/api/prescriptions?${params.toString()}`)
      const { prescriptions } = await res.json()
      setRows(prescriptions || [])
    } catch { setRows([]) }
    setLoading(false)
  }
  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [])

  const byDrug = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      const key = (r.drug_name || r.drug || 'Unknown').toLowerCase()
      if (!map.has(key)) map.set(key, { drug: r.drug_name || r.drug || 'Unknown', count: 0 })
      map.get(key).count += 1
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [rows])

  function exportCsv() {
    const header = ['created_at', 'drug_name', 'strength', 'dose_instructions', 'quantity', 'refills', 'patient_name', 'patient_nhi', 'provider_name', 'prescriber_number', 'delivery_status', 'consultation_id']
    const csv = [header, ...rows.map(r => header.map(k => (r[k] == null ? '' : String(r[k]).replace(/"/g, '""'))))]
      .map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${v}"` : v).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `controlled-drugs-register-${from}_to_${to}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  return (
    <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1.25rem', marginBottom: '1rem', fontFamily: FF }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '.75rem', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '1rem' }}>Controlled Drugs Register</div>
          <div style={{ fontSize: '.75rem', color: '#6B7280', marginTop: 2 }}>
            Every controlled-drug prescription in the selected range — Misuse of Drugs Regulations 1977 reg 44 (Medsafe audit).
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={exportCsv} disabled={!rows.length}
            style={{ padding: '6px 12px', background: 'white', color: NAVY, border: '1px solid #E2E8F0', borderRadius: 6, fontSize: '.75rem', fontWeight: 700, cursor: rows.length ? 'pointer' : 'default', opacity: rows.length ? 1 : 0.5, fontFamily: FF }}>
            Export CSV ({rows.length})
          </button>
          <button onClick={refresh} disabled={loading}
            style={{ padding: '6px 12px', background: TEAL, color: 'white', border: 'none', borderRadius: 6, fontSize: '.75rem', fontWeight: 700, cursor: loading ? 'default' : 'pointer', fontFamily: FF }}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: '.75rem' }}>
        <div>
          <label style={lbl}>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...inp, width: '100%' }} />
        </div>
        <div>
          <label style={lbl}>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ ...inp, width: '100%' }} />
        </div>
        <div>
          <label style={lbl}>Drug name contains</label>
          <input value={drug} onChange={e => setDrug(e.target.value)} placeholder="e.g. tramadol" style={{ ...inp, width: '100%' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button onClick={refresh} style={{ width: '100%', background: NAVY, color: 'white', border: 'none', padding: '.5rem .75rem', borderRadius: 6, fontSize: '.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: FF }}>
            Apply
          </button>
        </div>
      </div>

      {byDrug.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '.75rem' }}>
          {byDrug.map(d => (
            <span key={d.drug} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '4px 10px', borderRadius: 99, fontSize: '.75rem', color: NAVY, fontWeight: 700 }}>
              {d.drug} · {d.count}
            </span>
          ))}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.75rem' }}>
          <thead>
            <tr style={{ background: '#F8FAFC', textAlign: 'left' }}>
              <th style={{ padding: '.5rem .625rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Date</th>
              <th style={{ padding: '.5rem .625rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Drug</th>
              <th style={{ padding: '.5rem .625rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Dose</th>
              <th style={{ padding: '.5rem .625rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Qty</th>
              <th style={{ padding: '.5rem .625rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Patient</th>
              <th style={{ padding: '.5rem .625rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Prescriber</th>
              <th style={{ padding: '.5rem .625rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && !loading && (
              <tr><td colSpan={7} style={{ padding: '1.25rem', textAlign: 'center', color: '#9CA3AF' }}>No controlled-drug scripts in this range.</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                <td style={{ padding: '.5rem .625rem', color: '#374151' }}>{nzDateTime(r.created_at)}</td>
                <td style={{ padding: '.5rem .625rem', color: NAVY, fontWeight: 700 }}>{r.drug_name || r.drug} {r.strength && <span style={{ color: '#6B7280', fontWeight: 400 }}>{r.strength}</span>}</td>
                <td style={{ padding: '.5rem .625rem', color: '#374151' }}>{r.dose_instructions || r.dose || '—'}</td>
                <td style={{ padding: '.5rem .625rem', color: '#374151' }}>{r.quantity ?? '—'}</td>
                <td style={{ padding: '.5rem .625rem' }}>
                  <div style={{ color: NAVY }}>{r.patient_name || '—'}</div>
                  <div style={{ color: '#6B7280', fontSize: '.6875rem' }}>{r.patient_nhi || '—'}</div>
                </td>
                <td style={{ padding: '.5rem .625rem' }}>
                  <div style={{ color: NAVY }}>{r.provider_name || '—'}</div>
                  <div style={{ color: '#6B7280', fontSize: '.6875rem' }}>{r.prescriber_number || '—'}</div>
                </td>
                <td style={{ padding: '.5rem .625rem', color: '#374151' }}>{r.delivery_status || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
