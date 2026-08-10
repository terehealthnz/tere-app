// /clinician/admin/state-licenses — admin review of provider state licenses.
//
// Default view: pending_review queue. Filter to see active, rejected,
// expired, or revoked. Approve → sets active + refreshes provider's
// licensed_states cache. Reject requires a reason (sent to provider).

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { stateName } from '../../lib/usStates'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'

const STATUS_META = {
  pending_review: { label: 'Pending review',   color: '#B45309', bg: '#FEF3C7' },
  active:         { label: 'Active',            color: '#065F46', bg: '#D1FAE5' },
  rejected:       { label: 'Rejected',          color: '#991B1B', bg: '#FEE2E2' },
  expired:        { label: 'Expired',           color: '#6B7280', bg: '#F3F4F6' },
  revoked:        { label: 'Revoked',           color: '#6B7280', bg: '#F3F4F6' },
}
const FILTERS = ['pending_review', 'active', 'rejected', 'expired', 'all']

function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending_review
  return (
    <span style={{
      background: m.bg, color: m.color, padding: '3px 10px', borderRadius: 99,
      fontSize: '.72rem', fontWeight: 700, letterSpacing: '.02em', textTransform: 'uppercase',
    }}>{m.label}</span>
  )
}

function ReviewCard({ row, onDone }) {
  const [rejectMode, setRejectMode]   = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [busy, setBusy]               = useState(false)
  const [error, setError]             = useState(null)

  async function approve() {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const res = await apiFetch(`/api/provider-licenses?id=${row.id}&action=approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Approve failed')
      onDone?.()
    } catch (e) { setError(String(e.message || e)) }
    finally     { setBusy(false) }
  }
  async function reject() {
    if (!rejectReason.trim()) { setError('Reason required'); return }
    if (busy) return
    setBusy(true); setError(null)
    try {
      const res = await apiFetch(`/api/provider-licenses?id=${row.id}&action=reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_notes: rejectReason.trim() }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Reject failed')
      onDone?.()
    } catch (e) { setError(String(e.message || e)) }
    finally     { setBusy(false) }
  }

  const p = row.providers || {}
  const providerName = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Unknown provider'

  return (
    <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1.1rem 1.35rem', marginBottom: '.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.6rem' }}>
        <StatusPill status={row.status} />
        <span style={{ fontWeight: 700, color: NAVY, fontSize: '1rem' }}>
          {stateName(row.state_code)} ({row.state_code})
        </span>
        <span style={{ color: '#6B7280', fontSize: '.85rem' }}>· {providerName}</span>
      </div>
      <div style={{ fontSize: '.85rem', color: '#4B5563', marginBottom: '.35rem' }}>
        <strong>License #</strong> {row.license_number}
      </div>
      <div style={{ fontSize: '.85rem', color: '#4B5563', marginBottom: '.35rem' }}>
        <strong>Expires</strong> {row.expires_at}
      </div>
      {p.credential && (
        <div style={{ fontSize: '.85rem', color: '#4B5563', marginBottom: '.35rem' }}>
          <strong>Credential</strong> {p.credential}
        </div>
      )}
      {row.review_notes && (
        <div style={{ fontSize: '.82rem', color: '#374151', marginTop: '.5rem', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, padding: '.5rem .7rem' }}>
          <strong>Previous review note:</strong> {row.review_notes}
        </div>
      )}
      <div style={{ marginTop: '.8rem', display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        {row.license_doc_signed_url ? (
          <a href={row.license_doc_signed_url} target="_blank" rel="noopener noreferrer"
            style={{ background: '#F3F4F6', color: NAVY, border: '1px solid #E5E7EB', borderRadius: 8, padding: '.5rem .9rem', textDecoration: 'none', fontSize: '.85rem', fontWeight: 600 }}>
            View license doc
          </a>
        ) : (
          <span style={{ fontSize: '.82rem', color: '#B45309', fontStyle: 'italic', alignSelf: 'center' }}>
            No document uploaded — verify separately
          </span>
        )}
      </div>

      {row.status === 'pending_review' && (
        <div style={{ marginTop: '.9rem', borderTop: '1px dashed #E5E7EB', paddingTop: '.9rem' }}>
          {!rejectMode ? (
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <button onClick={approve} disabled={busy} style={approveBtn}>
                {busy ? '…' : 'Approve'}
              </button>
              <button onClick={() => setRejectMode(true)} disabled={busy} style={rejectBtn}>
                Reject…
              </button>
            </div>
          ) : (
            <div>
              <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 700, color: '#374151', marginBottom: '.35rem' }}>
                Reason (sent to provider)
              </label>
              <textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. License doc unreadable — please re-upload"
                style={{ width: '100%', padding: '.5rem .7rem', borderRadius: 8, border: '1.5px solid #E2E8F0', fontFamily: FF, fontSize: '.9rem', boxSizing: 'border-box' }} />
              <div style={{ marginTop: '.5rem', display: 'flex', gap: '.5rem' }}>
                <button onClick={reject} disabled={busy || !rejectReason.trim()} style={rejectBtn}>
                  {busy ? '…' : 'Confirm reject'}
                </button>
                <button onClick={() => { setRejectMode(false); setRejectReason('') }} disabled={busy}
                  style={{ background: 'none', border: '1px solid #E5E7EB', color: '#374151', borderRadius: 8, padding: '.5rem 1rem', fontFamily: FF, fontWeight: 600, fontSize: '.85rem', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {error && (
            <div style={{ marginTop: '.5rem', color: '#991B1B', fontSize: '.85rem' }}>{error}</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AdminStateLicenses() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('pending_review')
  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  useEffect(() => {
    if (!sessionStorage.getItem('clinicianAuth') || sessionStorage.getItem('providerIsAdmin') !== 'true') {
      navigate('/clinician?redirect=/clinician/admin/state-licenses'); return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await apiFetch(`/api/provider-licenses?admin=1&status=${filter}`)
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Load failed')
      setRows(j.licenses || [])
    } catch (e) { setError(String(e.message || e)) }
    finally     { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0', fontFamily: FF }}>
      <div style={{ background: NAVY, color: 'white', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button onClick={() => navigate('/clinician/admin')}
          style={{ background: 'rgba(255,255,255,.1)', border: 'none', color: 'white', borderRadius: 6, padding: '6px 12px', fontSize: '.8125rem', cursor: 'pointer' }}>
          ← Admin
        </button>
        <div style={{ fontWeight: 700, fontSize: '1.0625rem' }}>State license verifications</div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 1.25rem 3rem' }}>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '.4rem 1rem', borderRadius: 999, border: 'none', cursor: 'pointer',
              fontFamily: FF, fontWeight: 600, fontSize: '.82rem',
              background: filter === f ? NAVY : 'white',
              color: filter === f ? 'white' : '#4B5563',
              borderWidth: 1, borderStyle: 'solid',
              borderColor: filter === f ? NAVY : '#E5E7EB',
            }}>
              {f === 'pending_review' ? 'Pending' : f === 'all' ? 'All' : (STATUS_META[f]?.label || f)}
            </button>
          ))}
        </div>

        {loading && <div style={{ textAlign: 'center', color: '#6B7280' }}>Loading…</div>}
        {error && <div style={{ color: '#991B1B', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '.75rem 1rem', marginBottom: '1rem', fontSize: '.9rem' }}>{error}</div>}
        {!loading && !rows.length && (
          <div style={{ background: 'white', border: '1px dashed #D1D5DB', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#6B7280', fontSize: '.9rem' }}>
            Nothing here.
          </div>
        )}
        {rows.map(r => <ReviewCard key={r.id} row={r} onDone={load} />)}
      </div>
    </div>
  )
}

const approveBtn = {
  background: '#059669', color: 'white', border: 'none', borderRadius: 8,
  padding: '.55rem 1.2rem', fontFamily: FF, fontWeight: 700, fontSize: '.9rem', cursor: 'pointer',
}
const rejectBtn = {
  background: '#DC2626', color: 'white', border: 'none', borderRadius: 8,
  padding: '.55rem 1.2rem', fontFamily: FF, fontWeight: 700, fontSize: '.9rem', cursor: 'pointer',
}
