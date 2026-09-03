// Admin > Compliance > Conflict of Interest Register (task #410).
// Providers declare external roles, ownership, directorships, gifts, etc.
// Admin reviews + marks quarterly. Feeds ISO 27001 A.15 + HDC governance.

import React, { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'

const TYPE_LABELS = {
  external_role:            'External role',
  ownership_stake:          'Ownership stake',
  directorship:             'Directorship',
  family_member_in_industry:'Family in industry',
  consulting_income:        'Consulting income',
  research_funding:         'Research funding',
  gifts_received:           'Gifts received',
  other:                    'Other',
}

const card = { background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #E2E8F0', marginBottom: '1rem', fontFamily: FF }
const inp = { padding: '.5rem .625rem', border: '1px solid #E2E8F0', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', width: '100%', boxSizing: 'border-box' }
const lbl = { fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }

const nzDate = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'short', year: 'numeric' }) } catch { return String(iso) }
}

export default function ConflictOfInterestPanel() {
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(false)
  const [showActive, setShowActive] = useState(true)
  const [addOpen, setAddOpen]   = useState(false)
  const [declType, setDeclType] = useState('external_role')
  const [descText, setDescText] = useState('')
  const [busy, setBusy]         = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ filter: showActive ? 'active' : 'all' })
      const res = await apiFetch('/api/conflict-of-interest?' + params.toString())
      const { declarations } = await res.json().catch(() => ({ declarations: [] }))
      setRows(declarations || [])
    } catch { setRows([]) }
    setLoading(false)
  }
  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [showActive])

  async function addDeclaration() {
    if (!descText.trim() || descText.trim().length < 5) { alert('Add a description (≥ 5 chars)'); return }
    setBusy(true)
    try {
      const res = await apiFetch('/api/conflict-of-interest', {
        method: 'POST',
        body: JSON.stringify({ declarationType: declType, description: descText.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setDescText(''); setDeclType('external_role'); setAddOpen(false)
      await refresh()
    } catch (e) { alert('Failed: ' + e.message) }
    setBusy(false)
  }

  async function markReviewed(id) {
    try {
      await apiFetch('/api/conflict-of-interest', {
        method: 'PATCH',
        body: JSON.stringify({ id, reviewed_at: new Date().toISOString() }),
      })
      await refresh()
    } catch (e) { alert('Failed: ' + e.message) }
  }

  async function deactivate(id) {
    if (!confirm('Mark this declaration inactive (superseded / no longer applies)?')) return
    try {
      await apiFetch('/api/conflict-of-interest', {
        method: 'PATCH',
        body: JSON.stringify({ id, active: false }),
      })
      await refresh()
    } catch (e) { alert('Failed: ' + e.message) }
  }

  const overdue = useMemo(() => {
    const cutoff = Date.now() - 100 * 24 * 60 * 60 * 1000  // 100 days
    return rows.filter(r => r.active && (!r.reviewed_at || new Date(r.reviewed_at).getTime() < cutoff))
  }, [rows])

  function exportCsv() {
    const header = ['disclosed_at', 'provider_name', 'declaration_type', 'description', 'active', 'reviewed_at']
    const csv = [header, ...rows.map(r => header.map(k => (r[k] == null ? '' : String(r[k]).replace(/"/g, '""'))))]
      .map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${v}"` : v).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `conflict-of-interest-register-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '1rem' }}>Conflict of Interest Register</div>
          <div style={{ fontSize: '.75rem', color: '#6B7280' }}>Provider-declared external roles, ownership, directorships, gifts. Review quarterly.</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setShowActive(v => !v)}
            style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${showActive ? TEAL : '#E2E8F0'}`, background: showActive ? '#EFF9F9' : 'white', color: showActive ? TEAL : '#374151', fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }}>
            {showActive ? 'Active only' : 'All'}
          </button>
          <button onClick={exportCsv} disabled={!rows.length}
            style={{ padding: '4px 12px', background: 'white', color: NAVY, border: '1px solid #E2E8F0', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: rows.length ? 'pointer' : 'default' }}>
            Export CSV
          </button>
          <button onClick={() => setAddOpen(o => !o)}
            style={{ padding: '4px 12px', background: TEAL, color: 'white', border: 'none', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }}>
            + Declare
          </button>
        </div>
      </div>

      {overdue.length > 0 && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#78350F', padding: '.5rem .75rem', borderRadius: 6, fontSize: '.75rem', marginBottom: '.75rem' }}>
          ⚠ {overdue.length} declaration(s) haven't been reviewed in over 100 days — quarterly review overdue.
        </div>
      )}

      {addOpen && (
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '.875rem', marginBottom: '.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={lbl}>Type</label>
              <select value={declType} onChange={e => setDeclType(e.target.value)} style={inp}>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Description</label>
              <input value={descText} onChange={e => setDescText(e.target.value)} placeholder="e.g. Non-executive director at Rural Health Trust NZ (Jun 2024–present)" style={inp} />
            </div>
          </div>
          <button onClick={addDeclaration} disabled={busy}
            style={{ padding: '6px 14px', background: TEAL, color: 'white', border: 'none', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }}>
            {busy ? 'Saving…' : 'Add declaration'}
          </button>
        </div>
      )}

      {loading ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>Loading…</div>
       : !rows.length ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>No {showActive ? 'active ' : ''}declarations on file.</div>
       : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8125rem' }}>
            <thead><tr style={{ background: '#F8FAFC', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Declared</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Provider</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Type</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Description</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Last review</th>
              <th style={{ padding: '6px 8px' }}></th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid #F1F5F9', opacity: r.active ? 1 : 0.5 }}>
                  <td style={{ padding: '6px 8px', color: '#374151' }}>{nzDate(r.disclosed_at)}</td>
                  <td style={{ padding: '6px 8px', color: NAVY, fontWeight: 700 }}>{r.provider_name || r.provider_id.slice(0, 8)}</td>
                  <td style={{ padding: '6px 8px', color: TEAL, fontWeight: 700 }}>{TYPE_LABELS[r.declaration_type] || r.declaration_type}</td>
                  <td style={{ padding: '6px 8px', color: '#374151' }}>{r.description}</td>
                  <td style={{ padding: '6px 8px', color: '#6B7280' }}>{nzDate(r.reviewed_at)}</td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {r.active && (
                      <>
                        <button onClick={() => markReviewed(r.id)} style={{ background: 'white', border: '1px solid #E2E8F0', color: NAVY, padding: '3px 8px', borderRadius: 6, fontFamily: FF, fontSize: '.6875rem', fontWeight: 700, cursor: 'pointer', marginRight: 4 }}>
                          Mark reviewed
                        </button>
                        <button onClick={() => deactivate(r.id)} style={{ background: 'white', border: '1px solid #E2E8F0', color: '#DC2626', padding: '3px 8px', borderRadius: 6, fontFamily: FF, fontSize: '.6875rem', fontWeight: 700, cursor: 'pointer' }}>
                          Deactivate
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
