// HDC complaint themes + adverse-event distinction dashboard (tasks #393, #394).
// Aggregates complaints by complaint_type over the last 12 months. Split by
// "complaint" vs "adverse event" using severity + complaint_type heuristic.
// HDC annual reporting expectation.

import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'

const card = { background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #E2E8F0', marginBottom: '1rem', fontFamily: FF }

const ADVERSE_TYPES = new Set(['adverse_event', 'harm_event', 'near_miss', 'medication_error'])

export default function ComplaintThemesPanel() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('all')  // 'all' | 'complaints' | 'adverse'

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const res = await apiFetch('/api/complaints?limit=500')
      const data = await res.json().catch(() => ({ complaints: [] }))
      if (cancelled) return
      // Last 12 months only.
      const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000
      setRows((data.complaints || []).filter(r => new Date(r.created_at).getTime() >= cutoff))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const isAdverse = (r) => ADVERSE_TYPES.has(String(r.complaint_type || '').toLowerCase()) || r.severity === 'high'

  const filtered = useMemo(() => {
    if (tab === 'complaints') return rows.filter(r => !isAdverse(r))
    if (tab === 'adverse')    return rows.filter(r => isAdverse(r))
    return rows
  }, [rows, tab])

  const byType = useMemo(() => {
    const map = new Map()
    for (const r of filtered) {
      const key = r.complaint_type || 'Not specified'
      map.set(key, (map.get(key) || 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [filtered])

  const bySeverity = useMemo(() => {
    const map = new Map()
    for (const r of filtered) map.set(r.severity || 'medium', (map.get(r.severity || 'medium') || 0) + 1)
    return [...map.entries()]
  }, [filtered])

  const byStatus = useMemo(() => {
    const map = new Map()
    for (const r of filtered) map.set(r.status || 'open', (map.get(r.status || 'open') || 0) + 1)
    return [...map.entries()]
  }, [filtered])

  const maxCount = Math.max(1, ...byType.map(([, n]) => n))

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '1rem' }}>Complaint & adverse event themes (12 months)</div>
          <div style={{ fontSize: '.75rem', color: '#6B7280' }}>HDC annual reporting expectation — trends over rolling year, split by category.</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['all', 'All'], ['complaints', 'Complaints'], ['adverse', 'Adverse events']].map(([id, lbl]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${tab === id ? TEAL : '#E2E8F0'}`, background: tab === id ? '#EFF9F9' : 'white', color: tab === id ? TEAL : '#374151', fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>Loading…</div>
       : !filtered.length ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>No records in this window.</div>
       : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: '1rem' }}>
            <div style={{ background: '#F7F5F0', padding: '.625rem .75rem', borderRadius: 8 }}>
              <div style={{ fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase' }}>Total in window</div>
              <div style={{ fontSize: '1.375rem', color: NAVY, fontWeight: 800 }}>{filtered.length}</div>
            </div>
            {bySeverity.map(([s, n]) => (
              <div key={s} style={{ background: '#F7F5F0', padding: '.625rem .75rem', borderRadius: 8 }}>
                <div style={{ fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase' }}>Severity: {s}</div>
                <div style={{ fontSize: '1.375rem', color: s === 'high' ? '#DC2626' : NAVY, fontWeight: 800 }}>{n}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: '.75rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>By theme</div>
          <div>
            {byType.map(([type, n]) => (
              <div key={type} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8125rem', marginBottom: 2 }}>
                  <span style={{ color: NAVY, fontWeight: 700 }}>{type}</span>
                  <span style={{ color: '#6B7280' }}>{n}</span>
                </div>
                <div style={{ width: `${(n / maxCount) * 100}%`, background: TEAL, height: 6, borderRadius: 3 }} />
              </div>
            ))}
          </div>

          <div style={{ fontSize: '.75rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', margin: '1rem 0 6px' }}>By status</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {byStatus.map(([s, n]) => (
              <span key={s} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '3px 10px', borderRadius: 99, fontSize: '.75rem', color: NAVY }}>
                {s}: <strong>{n}</strong>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
