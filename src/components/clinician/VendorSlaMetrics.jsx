// Vendor SLA metrics — answers ACC + regulator "what's your service quality"
// questions. Median wait, no-show %, avg duration, throughput.

import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'

const cardStyle = { background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #E2E8F0', marginBottom: '1rem' }
const kpiStyle  = { background: '#F7F5F0', borderRadius: 10, padding: '.75rem .875rem' }
const kLbl = { fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }
const kVal = { fontSize: '1.375rem', color: NAVY, fontWeight: 800 }

function median(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}
function pct(n, d) { return d ? Math.round((n / d) * 1000) / 10 : 0 }
function fmtMin(mins) { if (mins == null) return '—'; if (mins < 1) return '<1 min'; return `${Math.round(mins)} min` }

export default function VendorSlaMetrics() {
  const [days, setDays] = useState(30)
  const [consults, setConsults] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const since = new Date(); since.setDate(since.getDate() - days)
        const res = await apiFetch(`/api/consultations?filter=recent&since=${since.toISOString()}&columns=id,created_at,status,completed_at,provider_id,provider_display_name,no_show_reason,consultation_type,is_acc,acc_claim_number`)
        const { consultations } = await res.json()
        setConsults(Array.isArray(consultations) ? consultations : [])
      } catch { setConsults([]) }
      setLoading(false)
    }
    load()
  }, [days])

  const stats = useMemo(() => {
    const total = consults.length
    if (!total) return null

    const done = consults.filter(c => c.completed_at && c.status === 'complete')
    const noShow = consults.filter(c => c.status === 'no_show' || c.no_show_reason)
    const acc = consults.filter(c => c.is_acc || c.acc_claim_number)

    const waits = consults
      .filter(c => c.created_at && c.completed_at)
      .map(c => (new Date(c.completed_at) - new Date(c.created_at)) / 60000)
      .filter(v => v >= 0 && v < 24 * 60) // cap at 24h to filter absurd values (queue rejoins etc.)
    const medianWait = median(waits)

    // Duration approximation: use completed_at - created_at as a floor
    // (we don't have reliable reviewing_at). Better than nothing.
    const durations = done
      .map(c => (new Date(c.completed_at) - new Date(c.created_at)) / 60000)
      .filter(v => v > 0 && v < 4 * 60) // cap 4h
    const medianDuration = median(durations)

    // Per-provider breakdown
    const byProvider = new Map()
    for (const c of consults) {
      const pid = c.provider_id || 'unassigned'
      if (!byProvider.has(pid)) byProvider.set(pid, {
        provider: c.provider_display_name || 'Unassigned',
        total: 0, completed: 0, noShow: 0, acc: 0,
      })
      const e = byProvider.get(pid)
      e.total++
      if (c.status === 'complete') e.completed++
      if (c.status === 'no_show' || c.no_show_reason) e.noShow++
      if (c.is_acc || c.acc_claim_number) e.acc++
    }
    const providerRows = [...byProvider.values()].sort((a, b) => b.total - a.total)

    return {
      total, done: done.length, noShow: noShow.length, acc: acc.length,
      completionRate: pct(done.length, total),
      noShowRate:     pct(noShow.length, total),
      accRate:        pct(acc.length, total),
      medianWait, medianDuration,
      providerRows,
    }
  }, [consults])

  function exportCsv() {
    if (!consults.length) return
    const header = ['created_at', 'completed_at', 'status', 'provider_display_name', 'consultation_type', 'is_acc', 'acc_claim_number', 'no_show_reason']
    const csv = [header, ...consults.map(c => header.map(k => (c[k] == null ? '' : String(c[k]).replace(/"/g, '""'))))]
      .map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${v}"` : v).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sla-metrics-${days}d-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  return (
    <div style={{ ...cardStyle, fontFamily: FF }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '1rem' }}>Service SLA metrics</div>
          <div style={{ fontSize: '.75rem', color: '#6B7280', marginTop: 2 }}>
            For ACC vendor audits + regulator queries. Median wait, completion, no-show, ACC mix, per-provider throughput.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[7, 30, 90, 180].map(d => (
            <button key={d} onClick={() => setDays(d)}
              style={{ padding: '4px 12px', border: `1px solid ${days === d ? TEAL : '#E2E8F0'}`, background: days === d ? '#EFF9F9' : 'white', color: days === d ? TEAL : '#374151', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }}>
              {d}d
            </button>
          ))}
          <button onClick={exportCsv} disabled={!consults.length}
            style={{ padding: '4px 12px', background: '#0B6E76', color: 'white', border: 'none', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: consults.length ? 'pointer' : 'default', opacity: consults.length ? 1 : 0.5 }}>
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '1rem', color: '#9CA3AF', fontSize: '.8125rem' }}>Loading…</div>
      ) : !stats ? (
        <div style={{ padding: '1rem', color: '#9CA3AF', fontSize: '.8125rem' }}>No consults in this window.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: '1rem' }}>
            <div style={kpiStyle}>
              <div style={kLbl}>Total consults</div>
              <div style={kVal}>{stats.total}</div>
            </div>
            <div style={kpiStyle}>
              <div style={kLbl}>Completed</div>
              <div style={kVal}>{stats.done}</div>
              <div style={{ fontSize: '.75rem', color: '#059669', fontWeight: 700 }}>{stats.completionRate}%</div>
            </div>
            <div style={kpiStyle}>
              <div style={kLbl}>No-show rate</div>
              <div style={{ ...kVal, color: stats.noShowRate > 10 ? '#DC2626' : NAVY }}>{stats.noShowRate}%</div>
              <div style={{ fontSize: '.75rem', color: '#6B7280' }}>{stats.noShow} of {stats.total}</div>
            </div>
            <div style={kpiStyle}>
              <div style={kLbl}>ACC mix</div>
              <div style={kVal}>{stats.accRate}%</div>
              <div style={{ fontSize: '.75rem', color: '#6B7280' }}>{stats.acc} ACC-billed</div>
            </div>
            <div style={kpiStyle}>
              <div style={kLbl}>Median time-to-completion</div>
              <div style={kVal}>{fmtMin(stats.medianWait)}</div>
            </div>
            <div style={kpiStyle}>
              <div style={kLbl}>Median consult duration</div>
              <div style={kVal}>{fmtMin(stats.medianDuration)}</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '.75rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>By provider</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8125rem' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', textAlign: 'left' }}>
                    <th style={{ padding: '.5rem .625rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Provider</th>
                    <th style={{ padding: '.5rem .625rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase', textAlign: 'right' }}>Total</th>
                    <th style={{ padding: '.5rem .625rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase', textAlign: 'right' }}>Completed</th>
                    <th style={{ padding: '.5rem .625rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase', textAlign: 'right' }}>No-show</th>
                    <th style={{ padding: '.5rem .625rem', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase', textAlign: 'right' }}>ACC</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.providerRows.map((p, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '.5rem .625rem', color: NAVY, fontWeight: 700 }}>{p.provider}</td>
                      <td style={{ padding: '.5rem .625rem', color: NAVY, textAlign: 'right' }}>{p.total}</td>
                      <td style={{ padding: '.5rem .625rem', color: '#059669', textAlign: 'right', fontWeight: 700 }}>{p.completed}</td>
                      <td style={{ padding: '.5rem .625rem', color: p.noShow > 0 ? '#DC2626' : '#6B7280', textAlign: 'right' }}>{p.noShow}</td>
                      <td style={{ padding: '.5rem .625rem', color: '#7C3AED', textAlign: 'right', fontWeight: 700 }}>{p.acc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
