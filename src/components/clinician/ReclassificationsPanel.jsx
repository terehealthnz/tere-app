// ReclassificationsPanel — admin visibility over every ACC decline.
//
// Lists all consults where a provider used the Complete Encounter popup to
// reclassify a patient-triage ACC flag off. Shows top-up status so admin
// can chase up pending charges or action deferred ones. Mirrors
// AccClaimsSection.jsx for layout + style.

import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'

const NAVY   = '#0D2B45'
const TEAL   = '#0B6E76'
const BORDER = '#E2E8F0'

const card = { background: 'white', borderRadius: 12, padding: 20, border: `1px solid ${BORDER}`, marginBottom: 16 }
const h = { fontSize: '1rem', fontWeight: 700, color: NAVY, marginBottom: 4 }
const sub = { fontSize: '.8125rem', color: '#64748B', marginBottom: 16 }
const pill = (bg, color) => ({
  display: 'inline-block', padding: '3px 8px', borderRadius: 999,
  fontSize: '.6875rem', fontWeight: 700, background: bg, color,
  textTransform: 'uppercase', letterSpacing: .3,
})
const btn = (active) => ({
  padding: '6px 12px', borderRadius: 8, border: `1.5px solid ${active ? TEAL : BORDER}`,
  background: active ? TEAL : 'white', color: active ? 'white' : NAVY,
  fontSize: '.8125rem', fontWeight: 600, cursor: 'pointer',
  fontFamily: 'Plus Jakarta Sans, sans-serif',
})

const STATUS_STYLES = {
  pending:  pill('#FEF3C7', '#92400E'),
  paid:     pill('#D1FAE5', '#065F46'),
  waived:   pill('#E0E7FF', '#3730A3'),
  deferred: pill('#FEE2E2', '#991B1B'),
  null:     pill('#F3F4F6', '#6B7280'),
}

function fmtDate(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return iso.slice(0, 10) }
}

function fmtMoney(cents) {
  if (cents == null) return '—'
  return `$${(cents / 100).toFixed(2)}`
}

function mask(name) {
  if (!name) return '—'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 1) + '.'
  return parts[0].slice(0, 1) + '. ' + parts[parts.length - 1]
}

export default function ReclassificationsPanel() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('all')

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    apiFetch(`/api/reclassifications?status=${status}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (!d.ok) throw new Error(d.error || 'Load failed')
        setRows(d.rows || [])
      })
      .catch(e => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [status])

  return (
    <div style={card}>
      <div style={h}>Reclassifications</div>
      <div style={sub}>
        Consults where the provider overrode the patient-triage ACC flag at
        Complete Encounter. Top-up column shows what the provider chose for
        the billing differential ($65 private – $25 ACC co-pay = $40).
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {['all', 'pending', 'paid', 'waived', 'deferred'].map(s => (
          <button key={s} type="button" onClick={() => setStatus(s)} style={btn(status === s)}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading && <div style={{ padding: 20, textAlign: 'center', color: '#9CA3AF' }}>Loading…</div>}
      {error && <div style={{ padding: 12, background: '#FEF2F2', color: '#991B1B', borderRadius: 8, fontSize: '.8125rem' }}>{error}</div>}

      {!loading && !error && rows.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: '.875rem' }}>
          No reclassifications{status !== 'all' ? ` with status "${status}"` : ' yet'}.
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div style={{ overflow: 'auto', border: `1px solid ${BORDER}`, borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8125rem' }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 700, color: '#475569' }}>Declined</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 700, color: '#475569' }}>Patient</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 700, color: '#475569' }}>Provider</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 700, color: '#475569' }}>Reason</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 700, color: '#475569' }}>Top-up</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 700, color: '#475569' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${BORDER}` }}>
                  <td style={{ padding: '8px 12px', color: '#475569', whiteSpace: 'nowrap' }}>{fmtDate(r.acc_provider_declined_at)}</td>
                  <td style={{ padding: '8px 12px', color: NAVY, fontWeight: 600 }}>{mask(r.patient_name || r.patient_first_name)}</td>
                  <td style={{ padding: '8px 12px', color: '#475569' }}>{r.declined_by_name || r.provider_display_name || '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#475569', maxWidth: 320 }}>{r.acc_provider_decline_reason || '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                    {(r.consultation_type === 'employee' || r.employer_paid)
                      ? <span style={pill('#E0F2FE', '#075985')}>employer-paid</span>
                      : fmtMoney(r.acc_decline_top_up_amount_cents)}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={STATUS_STYLES[r.acc_decline_top_up_status || 'null']}>{r.acc_decline_top_up_status || 'none'}</span>
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
