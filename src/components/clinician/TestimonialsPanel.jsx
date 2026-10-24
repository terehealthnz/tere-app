import React, { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'

const card = { background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #E2E8F0', marginBottom: '1rem', fontFamily: FF }

const TABS = [
  { id: 'pending',   label: 'Pending' },
  { id: 'approved',  label: 'Approved' },
  { id: 'rejected',  label: 'Rejected' },
  { id: 'complaint', label: 'Complaints' },
]

function fmtDate(iso) {
  try { return new Date(iso).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' }) }
  catch { return iso || '' }
}

export default function TestimonialsPanel() {
  const [tab, setTab] = useState('pending')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async (status) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/admin-testimonials?action=list&status=${encodeURIComponent(status)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load')
      setRows(data.feedback || [])
    } catch (e) {
      setError(e.message)
      setRows([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load(tab) }, [tab, load])

  async function moderate(id, decision) {
    setWorking(id + ':' + decision)
    setError(null)
    try {
      const res = await apiFetch('/api/admin-testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'moderate', id, decision }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Moderation failed')
      await load(tab)
    } catch (e) {
      setError(e.message)
    }
    setWorking(null)
  }

  const tabBtn = (active) => ({ padding: '6px 12px', borderRadius: 6, border: `1px solid ${active ? TEAL : '#E2E8F0'}`, background: active ? '#EFF9F9' : 'white', color: active ? TEAL : '#374151', fontSize: '.8125rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' })
  const btn = { padding: '6px 12px', borderRadius: 6, border: '1px solid #D1D5DB', background: 'white', fontSize: '.8125rem', fontFamily: FF, fontWeight: 600, cursor: 'pointer' }
  const btnApprove = { ...btn, borderColor: TEAL, color: TEAL }
  const btnReject = { ...btn, borderColor: '#D1D5DB', color: '#374151' }
  const btnRoute = { ...btn, borderColor: '#B91C1C', color: '#B91C1C' }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '1rem' }}>Testimonials & post-consult feedback</div>
          <div style={{ fontSize: '.75rem', color: '#6B7280' }}>Thumbs-down entries also sit in Support with source=post_consult_feedback.</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={tabBtn(tab === t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '.5rem .75rem', borderRadius: 6, fontSize: '.8125rem', marginBottom: '.75rem' }}>{error}</div>
      )}
      {loading && <div style={{ color: '#6B7280', fontSize: '.875rem' }}>Loading...</div>}
      {!loading && rows.length === 0 && (
        <div style={{ color: '#9CA3AF', fontSize: '.875rem', padding: '1rem', textAlign: 'center', background: '#F8FAFC', borderRadius: 8 }}>Nothing in this bucket.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
        {rows.map(r => {
          const c = r.consultation || {}
          const ratingDot = r.rating === 'positive' ? '👍' : '👎'
          return (
            <div key={r.id} style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: '.875rem 1rem', background: '#FDFDFD' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: '.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: '.9375rem', fontWeight: 700, color: NAVY }}>
                    <span style={{ marginRight: 6 }}>{ratingDot}</span>
                    {r.patient_display_name || '(no display name)'}
                    {r.allow_publish && <span style={{ marginLeft: 8, fontSize: '.6875rem', background: '#D1FAE5', color: '#065F46', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>OK TO PUBLISH</span>}
                  </div>
                  <div style={{ fontSize: '.75rem', color: '#6B7280' }}>
                    Consult {r.consultation_id?.slice(0, 8)}{c.provider_display_name ? ` - ${c.provider_display_name}` : ''} - {fmtDate(r.created_at)}
                  </div>
                </div>
                <div style={{ fontSize: '.6875rem', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{r.status}</div>
              </div>
              <div style={{ fontSize: '.875rem', color: '#374151', whiteSpace: 'pre-wrap', background: '#F8FAFC', padding: '.5rem .75rem', borderRadius: 6, borderLeft: `3px solid ${r.rating === 'positive' ? TEAL : '#D97706'}`, marginBottom: '.75rem' }}>
                {r.testimonial_text || <span style={{ color: '#9CA3AF' }}>(no message)</span>}
              </div>
              {r.support_ticket_id && (
                <div style={{ fontSize: '.75rem', color: '#6B7280', marginBottom: '.5rem' }}>Linked support ticket: <code>{r.support_ticket_id.slice(0, 8)}</code></div>
              )}
              {tab === 'pending' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button style={btnApprove} disabled={!!working} onClick={() => moderate(r.id, 'approve')}>{working === r.id + ':approve' ? '...' : 'Approve'}</button>
                  <button style={btnReject}  disabled={!!working} onClick={() => moderate(r.id, 'reject')}>{working === r.id + ':reject'  ? '...' : 'Reject'}</button>
                  <button style={btnRoute}   disabled={!!working} onClick={() => moderate(r.id, 'route_to_complaint')}>{working === r.id + ':route_to_complaint' ? '...' : 'Route to complaint'}</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
