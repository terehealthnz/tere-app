// Admin > Compliance > Results Follow-up (task #418). Worklist of every
// ordered investigation with its state (ordered → received → reviewed →
// actioned). Overdue + unreviewed + abnormal-unactioned rows highlighted.
// Paired with nightly /api/cron-results-reconciliation which auto-flags +
// escalates.

import React, { useEffect, useMemo, useState } from 'react'
import { listInvestigationOrders, patchInvestigationOrder, createInvestigationOrder } from '../../lib/supabase'

const NAVY  = '#0D2B45'
const TEAL  = '#0B6E76'
const RED   = '#DC2626'
const AMBER = '#D97706'
const GREEN = '#059669'
const FF    = 'Plus Jakarta Sans, sans-serif'

const nzDate = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'short', year: 'numeric' }) } catch { return '—' }
}

const STATUS_COLORS = {
  ordered:   { bg: '#EFF6FF', fg: '#1D4ED8', label: 'Ordered'  },
  received:  { bg: '#FEF3C7', fg: '#92400E', label: 'Received' },
  reviewed:  { bg: '#DBEAFE', fg: '#1E40AF', label: 'Reviewed' },
  actioned:  { bg: '#DCFCE7', fg: '#166534', label: 'Actioned' },
  cancelled: { bg: '#F1F5F9', fg: '#475569', label: 'Cancelled'},
}

const card = { background: 'white', borderRadius: 12, padding: '1.25rem', border: '1px solid #E2E8F0', marginBottom: '1rem', fontFamily: FF }
const inp  = { padding: '.5rem .625rem', border: '1px solid #E2E8F0', borderRadius: 6, fontFamily: FF, fontSize: '.8125rem', width: '100%', boxSizing: 'border-box' }
const lbl  = { fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }

export default function ResultsFollowupPanel() {
  const [filter, setFilter]     = useState('worklist')  // worklist | mine | overdue | abnormal_unactioned | all
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(false)
  const [addOpen, setAddOpen]   = useState(false)
  const [addForm, setAddForm]   = useState({ order_type: 'lab', order_description: '', patient_nhi: '', patient_name: '', expected_by_days: 3 })
  const [selected, setSelected] = useState(null)  // full order object
  const [busy, setBusy]         = useState(false)
  const [err, setErr]           = useState(null)

  async function refresh() {
    setLoading(true); setErr(null)
    try { setRows(await listInvestigationOrders({ filter })) }
    catch (e) { setErr(e.message); setRows([]) }
    setLoading(false)
  }
  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [filter])

  const counts = useMemo(() => {
    const c = { overdue: 0, unreviewed: 0, abnormal_unactioned: 0 }
    for (const o of rows) {
      if (o.is_overdue) c.overdue++
      if (o.status === 'received') c.unreviewed++
      if (o.status === 'reviewed' && o.is_abnormal) c.abnormal_unactioned++
    }
    return c
  }, [rows])

  async function transition(o, patch) {
    setBusy(true); setErr(null)
    try {
      await patchInvestigationOrder(o.id, patch)
      setSelected(null)
      await refresh()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  async function addManual() {
    if (!addForm.order_description || addForm.order_description.trim().length < 3) { alert('Description ≥ 3 chars'); return }
    setBusy(true); setErr(null)
    try {
      await createInvestigationOrder(addForm)
      setAddForm({ order_type: 'lab', order_description: '', patient_nhi: '', patient_name: '', expected_by_days: 3 })
      setAddOpen(false)
      await refresh()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '1rem' }}>Results Follow-up Worklist</div>
          <div style={{ fontSize: '.75rem', color: '#6B7280' }}>Every ordered investigation tracked. Nightly reconciliation cron flags overdue + abnormal-unactioned.</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            ['worklist',            'Active'],
            ['overdue',             `Overdue${counts.overdue?' ('+counts.overdue+')':''}`],
            ['abnormal_unactioned', `Abnormal Unactioned${counts.abnormal_unactioned?' ('+counts.abnormal_unactioned+')':''}`],
            ['mine',                'Mine'],
            ['all',                 'All'],
          ].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${filter === k ? TEAL : '#E2E8F0'}`, background: filter === k ? '#EFF9F9' : 'white', color: filter === k ? TEAL : '#374151', fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }}>
              {l}
            </button>
          ))}
          <button onClick={() => setAddOpen(o => !o)}
            style={{ padding: '4px 12px', background: TEAL, color: 'white', border: 'none', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }}>
            + Add lab / other
          </button>
        </div>
      </div>

      {(counts.overdue || counts.abnormal_unactioned) ? (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '.5rem .75rem', borderRadius: 6, fontSize: '.75rem', marginBottom: '.75rem' }}>
          {counts.abnormal_unactioned > 0 && <>🚨 <strong>{counts.abnormal_unactioned}</strong> abnormal result(s) reviewed but NOT actioned — highest priority. </>}
          {counts.overdue > 0 && <>⏰ <strong>{counts.overdue}</strong> order(s) past expected turnaround with no result — chase or cancel.</>}
        </div>
      ) : null}

      {addOpen && (
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '.875rem', marginBottom: '.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 100px', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={lbl}>Type</label>
              <select value={addForm.order_type} onChange={e => setAddForm(f => ({ ...f, order_type: e.target.value }))} style={inp}>
                <option value="lab">Lab</option>
                <option value="radiology">Radiology (manual)</option>
                <option value="referral">Referral</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Patient NHI</label>
              <input value={addForm.patient_nhi} onChange={e => setAddForm(f => ({ ...f, patient_nhi: e.target.value.toUpperCase() }))} placeholder="ABC1234" style={inp} />
            </div>
            <div>
              <label style={lbl}>Patient name</label>
              <input value={addForm.patient_name} onChange={e => setAddForm(f => ({ ...f, patient_name: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={lbl}>Expect (days)</label>
              <input type="number" min="1" max="90" value={addForm.expected_by_days} onChange={e => setAddForm(f => ({ ...f, expected_by_days: Number(e.target.value) }))} style={inp} />
            </div>
          </div>
          <div>
            <label style={lbl}>Description</label>
            <input value={addForm.order_description} onChange={e => setAddForm(f => ({ ...f, order_description: e.target.value }))} placeholder="e.g. FBC + LFTs — post-antibiotic monitoring" style={inp} />
          </div>
          <button onClick={addManual} disabled={busy} style={{ marginTop: 8, padding: '6px 14px', background: TEAL, color: 'white', border: 'none', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }}>
            {busy ? 'Saving…' : 'Add order'}
          </button>
        </div>
      )}

      {err && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '.5rem .75rem', borderRadius: 6, fontSize: '.75rem', marginBottom: '.5rem' }}>{err}</div>}

      {loading ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>Loading…</div>
       : !rows.length ? <div style={{ color: '#9CA3AF', fontSize: '.8125rem' }}>No orders under this filter.</div>
       : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8125rem' }}>
            <thead><tr style={{ background: '#F8FAFC', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Status</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Ordered</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Patient</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Type</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Description</th>
              <th style={{ padding: '6px 8px', color: '#6B7280', fontWeight: 700, fontSize: '.6875rem', textTransform: 'uppercase' }}>Ordered by</th>
              <th style={{ padding: '6px 8px' }}></th>
            </tr></thead>
            <tbody>
              {rows.map(o => {
                const c = STATUS_COLORS[o.status] || STATUS_COLORS.ordered
                const abnormalTag = o.is_abnormal ? <span style={{ background: '#FEE2E2', color: '#991B1B', padding: '2px 6px', borderRadius: 4, fontSize: '.6875rem', fontWeight: 700, marginLeft: 4 }}>ABNORMAL</span> : null
                const overdueTag  = o.is_overdue  ? <span style={{ background: '#FEE2E2', color: '#991B1B', padding: '2px 6px', borderRadius: 4, fontSize: '.6875rem', fontWeight: 700, marginLeft: 4 }}>OVERDUE</span> : null
                return (
                  <tr key={o.id} style={{ borderTop: '1px solid #F1F5F9', background: o.is_abnormal && o.status === 'reviewed' ? '#FEF2F2' : o.is_overdue ? '#FEF3C7' : 'white' }}>
                    <td style={{ padding: '6px 8px' }}>
                      <span style={{ background: c.bg, color: c.fg, padding: '2px 8px', borderRadius: 10, fontSize: '.6875rem', fontWeight: 700 }}>{c.label}</span>
                      {abnormalTag}{overdueTag}
                    </td>
                    <td style={{ padding: '6px 8px', color: '#374151' }}>{nzDate(o.ordered_at)}</td>
                    <td style={{ padding: '6px 8px', color: NAVY, fontWeight: 600 }}>{o.patient_name || o.patient_nhi || '—'}</td>
                    <td style={{ padding: '6px 8px', color: TEAL, fontWeight: 700 }}>{o.order_type}</td>
                    <td style={{ padding: '6px 8px', color: '#374151' }}>{o.order_description}</td>
                    <td style={{ padding: '6px 8px', color: '#6B7280' }}>{o.ordered_by_provider_name || '—'}</td>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button onClick={() => setSelected(o)} style={{ background: 'white', border: '1px solid #E2E8F0', color: NAVY, padding: '3px 8px', borderRadius: 6, fontFamily: FF, fontSize: '.6875rem', fontWeight: 700, cursor: 'pointer' }}>
                        Manage
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
        <OrderManageModal order={selected} busy={busy} err={err} onClose={() => setSelected(null)} onTransition={transition} />
      )}
    </div>
  )
}

function OrderManageModal({ order, busy, err, onClose, onTransition }) {
  const [received, setReceived]         = useState(order.received_summary || '')
  const [abnormal, setAbnormal]         = useState(!!order.is_abnormal)
  const [actionNotes, setActionNotes]   = useState(order.action_notes || '')
  const [cancelReason, setCancelReason] = useState('')

  const nowIso = () => new Date().toISOString()

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,43,69,.7)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, fontFamily: FF }}>
      <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem', width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <div style={{ fontWeight: 800, color: NAVY, fontSize: '1rem' }}>Manage investigation order</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: '1.25rem' }}>×</button>
        </div>
        <div style={{ fontSize: '.8125rem', color: '#374151', marginBottom: 12, background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '.5rem .75rem', borderRadius: 6 }}>
          <div><strong>Patient:</strong> {order.patient_name || order.patient_nhi || '—'}</div>
          <div><strong>Order:</strong> {order.order_type} — {order.order_description}</div>
          <div><strong>Ordered:</strong> {nzDate(order.ordered_at)} by {order.ordered_by_provider_name || '—'}</div>
          <div><strong>Status:</strong> {order.status}{order.is_overdue ? ' · OVERDUE' : ''}</div>
          {order.reviewed_at && <div><strong>Reviewed:</strong> {nzDate(order.reviewed_at)} by {order.reviewed_by_provider_name || '—'}</div>}
        </div>

        {err && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '.5rem .75rem', borderRadius: 6, fontSize: '.75rem', marginBottom: 8 }}>{err}</div>}

        {order.status === 'ordered' && (
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Result summary (mark received)</label>
            <textarea value={received} onChange={e => setReceived(e.target.value)} rows={3} style={{ ...inp, minHeight: 60 }} placeholder="e.g. FBC WNL. Neutrophils 6.2. No action." />
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, fontSize: '.8125rem', color: '#374151' }}>
              <input type="checkbox" checked={abnormal} onChange={e => setAbnormal(e.target.checked)} />
              Abnormal — flag for urgent action
            </label>
            <button onClick={() => onTransition(order, { received_at: nowIso(), received_summary: received.trim() || null, is_abnormal: abnormal, status: 'received' })}
              disabled={busy} style={{ marginTop: 8, padding: '6px 14px', background: TEAL, color: 'white', border: 'none', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }}>
              Mark received
            </button>
          </div>
        )}

        {order.status === 'received' && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '.5rem .75rem', borderRadius: 6, fontSize: '.8125rem', color: '#1E40AF', marginBottom: 8 }}>
              <strong>Result summary:</strong> {order.received_summary || '(none)'}
            </div>
            <button onClick={() => onTransition(order, { reviewed_at: nowIso() })}
              disabled={busy} style={{ padding: '6px 14px', background: TEAL, color: 'white', border: 'none', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }}>
              Mark reviewed by me
            </button>
          </div>
        )}

        {order.status === 'reviewed' && (
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Action taken</label>
            <textarea value={actionNotes} onChange={e => setActionNotes(e.target.value)} rows={3} style={{ ...inp, minHeight: 60 }} placeholder="e.g. Called patient 2026-09-04, changed metformin dose to 500mg BD, GP letter sent." />
            <button onClick={() => onTransition(order, { actioned_at: nowIso(), action_notes: actionNotes.trim() || null })}
              disabled={busy || actionNotes.trim().length < 5} style={{ marginTop: 8, padding: '6px 14px', background: actionNotes.trim().length >= 5 ? GREEN : '#CBD5E1', color: 'white', border: 'none', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }}>
              Mark actioned (close order)
            </button>
          </div>
        )}

        {order.status !== 'cancelled' && order.status !== 'actioned' && (
          <div style={{ marginTop: 16, padding: '.75rem', background: '#FEF2F2', border: '1px dashed #FECACA', borderRadius: 6 }}>
            <label style={lbl}>Cancel this order</label>
            <input value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="reason (e.g. patient declined, ordered in error)" style={inp} />
            <button onClick={() => onTransition(order, { cancelled_at: nowIso(), cancelled_reason: cancelReason.trim() || 'cancelled' })}
              disabled={busy} style={{ marginTop: 6, padding: '4px 10px', background: 'white', color: RED, border: '1px solid #FECACA', borderRadius: 6, fontSize: '.6875rem', fontFamily: FF, fontWeight: 700, cursor: 'pointer' }}>
              Cancel order
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
