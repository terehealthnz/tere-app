// Admin > Quality > Peer review sampling (task #370).
//
// Samples N random un-reviewed ACC-billed consults. Reviewer records
// agreement level + notes. Feeds ACC's clinical audit expectation that
// providers peer-review a % of billed claims.

import React, { useEffect, useMemo, useState } from 'react'
import { samplePeerReviewCandidates, listPeerReviews, addPeerReview } from '../../lib/supabase'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'

const AGREEMENT_LABELS = {
  agree:                'Agree — appropriate care',
  agree_with_comments:  'Agree with comments',
  disagree_minor:       'Disagree — minor concerns',
  disagree_major:       'Disagree — major concerns',
}
const AGREEMENT_COLOR = {
  agree:                '#059669',
  agree_with_comments:  '#0B6E76',
  disagree_minor:       '#D97706',
  disagree_major:       '#DC2626',
}

const nzDateTime = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return String(iso) }
}
const nzDate = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'short', year: 'numeric' }) } catch { return String(iso) }
}

const inp = { padding: '.5rem .625rem', border: '1px solid #E2E8F0', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', width: '100%', boxSizing: 'border-box' }
const lbl = { fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }

export default function PeerReviewPanel() {
  const [sample, setSample]   = useState([])
  const [poolSize, setPoolSize] = useState(0)
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [agreement, setAgreement] = useState('agree')
  const [notes, setNotes]       = useState('')
  const [reason, setReason]     = useState('random_sample')
  const [savingReview, setSavingReview] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const [sampleData, reviewsList] = await Promise.all([
        samplePeerReviewCandidates(10),
        listPeerReviews(),
      ])
      setSample(sampleData.sample || [])
      setPoolSize(sampleData.unreviewed_pool_size || 0)
      setReviews(reviewsList)
    } catch { /* fail-soft */ }
    setLoading(false)
  }
  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [])

  async function submitReview() {
    if (!selected) return
    setSavingReview(true)
    try {
      await addPeerReview({
        consultation_id: selected.id,
        agreement,
        notes:           notes.trim() || null,
        sample_reason:   reason,
      })
      setSelected(null); setNotes(''); setAgreement('agree'); setReason('random_sample')
      await refresh()
    } catch (e) { alert('Save failed: ' + e.message) }
    setSavingReview(false)
  }

  const stats = useMemo(() => {
    const total = reviews.length
    const byAgreement = new Map()
    for (const r of reviews) byAgreement.set(r.agreement, (byAgreement.get(r.agreement) || 0) + 1)
    return { total, byAgreement: [...byAgreement.entries()] }
  }, [reviews])

  return (
    <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1.25rem', marginBottom: '1rem', fontFamily: FF }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '.75rem', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '1rem' }}>Peer review sampling</div>
          <div style={{ fontSize: '.75rem', color: '#6B7280', marginTop: 2 }}>
            Sample ACC-billed consults for peer review. Feeds ACC's clinical audit expectation + internal QI.
          </div>
        </div>
        <button onClick={refresh} disabled={loading}
          style={{ padding: '6px 12px', background: TEAL, color: 'white', border: 'none', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }}>
          {loading ? 'Loading…' : 'New sample'}
        </button>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: '1rem' }}>
        <div style={{ background: '#F7F5F0', padding: '.625rem .75rem', borderRadius: 8 }}>
          <div style={{ fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase' }}>Unreviewed pool</div>
          <div style={{ fontSize: '1.125rem', color: NAVY, fontWeight: 800 }}>{poolSize}</div>
        </div>
        <div style={{ background: '#F7F5F0', padding: '.625rem .75rem', borderRadius: 8 }}>
          <div style={{ fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase' }}>Total reviews</div>
          <div style={{ fontSize: '1.125rem', color: NAVY, fontWeight: 800 }}>{stats.total}</div>
        </div>
        {stats.byAgreement.map(([k, n]) => (
          <div key={k} style={{ background: '#F7F5F0', padding: '.625rem .75rem', borderRadius: 8 }}>
            <div style={{ fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase' }}>{k.replace(/_/g, ' ')}</div>
            <div style={{ fontSize: '1.125rem', color: AGREEMENT_COLOR[k] || NAVY, fontWeight: 800 }}>{n}</div>
          </div>
        ))}
      </div>

      {/* Sample list */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '.75rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
          Sampled for review ({sample.length}) — click any row to review
        </div>
        {!sample.length && !loading && (
          <div style={{ color: '#9CA3AF', fontSize: '.8125rem', padding: '.75rem', background: '#F8FAFC', borderRadius: 6 }}>
            No un-reviewed ACC consults available (or none exist yet).
          </div>
        )}
        {sample.map(c => (
          <div key={c.id} onClick={() => setSelected(c)}
            style={{ padding: '.625rem .75rem', border: `1px solid ${selected?.id === c.id ? TEAL : '#E2E8F0'}`, background: selected?.id === c.id ? '#EFF9F9' : 'white', borderRadius: 6, marginBottom: 6, cursor: 'pointer', fontSize: '.8125rem' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: NAVY, fontWeight: 700 }}>{c.patient_first_name} {c.patient_last_name}</span>
              <span style={{ color: '#6B7280', fontSize: '.6875rem' }}>NHI {c.patient_nhi}</span>
              <span style={{ color: TEAL, fontSize: '.6875rem', fontWeight: 700 }}>{c.acc_read_code}</span>
              <span style={{ color: '#6B7280', fontSize: '.6875rem' }}>{c.acc_body_part}</span>
              <span style={{ flex: 1 }} />
              <span style={{ color: '#6B7280', fontSize: '.6875rem' }}>{nzDate(c.created_at)}</span>
              <span style={{ color: '#374151', fontSize: '.6875rem' }}>{c.provider_display_name}</span>
            </div>
            <div style={{ color: '#374151', fontSize: '.75rem', marginTop: 3 }}>{String(c.chief_complaint || '').slice(0, 200)}</div>
          </div>
        ))}
      </div>

      {/* Review form for the selected consult */}
      {selected && (
        <div style={{ background: '#F8FAFC', border: '1px solid #A7D4D8', borderRadius: 8, padding: '1rem' }}>
          <div style={{ fontSize: '.875rem', color: NAVY, fontWeight: 700, marginBottom: '.5rem' }}>Reviewing consult {selected.id.slice(0, 8)}…</div>
          {selected.doctor_notes && (
            <div style={{ background: 'white', border: '1px solid #E2E8F0', padding: '.5rem .75rem', borderRadius: 6, fontSize: '.75rem', color: '#374151', marginBottom: '.75rem', maxHeight: 200, overflowY: 'auto' }}>
              <strong>Notes:</strong> {selected.doctor_notes}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
            <div>
              <label style={lbl}>Agreement</label>
              <select value={agreement} onChange={e => setAgreement(e.target.value)} style={inp}>
                {Object.entries(AGREEMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Sample reason</label>
              <select value={reason} onChange={e => setReason(e.target.value)} style={inp}>
                <option value="random_sample">Random sample</option>
                <option value="flagged_high_cost">Flagged — high cost</option>
                <option value="complaint_investigation">Complaint investigation</option>
                <option value="scheduled_10pct">Scheduled 10% audit</option>
              </select>
            </div>
          </div>
          <label style={lbl}>Reviewer notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} placeholder="Any comments, learning, or concerns" />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={submitReview} disabled={savingReview}
              style={{ background: TEAL, color: 'white', border: 'none', padding: '.5rem 1rem', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', fontWeight: 700, cursor: 'pointer' }}>
              {savingReview ? 'Saving…' : 'Record review'}
            </button>
            <button onClick={() => setSelected(null)}
              style={{ background: 'white', color: '#374151', border: '1px solid #E2E8F0', padding: '.5rem 1rem', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Recent reviews list */}
      {reviews.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ fontSize: '.75rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
            Recent reviews ({reviews.length})
          </div>
          {reviews.slice(0, 20).map(r => (
            <div key={r.id} style={{ padding: '.5rem .625rem', borderBottom: '1px solid #F1F5F9', fontSize: '.8125rem' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: '#6B7280', minWidth: 130 }}>{nzDateTime(r.reviewed_at)}</span>
                <span style={{ color: AGREEMENT_COLOR[r.agreement] || NAVY, fontWeight: 700, fontSize: '.75rem' }}>{(r.agreement || '').replace(/_/g, ' ')}</span>
                <span style={{ color: NAVY, flex: 1 }}>{r.reviewer_name}</span>
                <span style={{ color: '#6B7280', fontSize: '.6875rem' }}>{r.sample_reason}</span>
              </div>
              {r.notes && <div style={{ color: '#374151', fontSize: '.75rem', marginTop: 3 }}>{r.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
