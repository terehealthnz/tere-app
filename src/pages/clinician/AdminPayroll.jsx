import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'
const BASE_RATE = 15.00
const HOLIDAY_RATE = 0.08

// ── Helpers ───────────────────────────────────────────────────────────────────

const REF_MS = new Date('2024-01-01T00:00:00Z').getTime()
function getFortnight(dateStr) {
  const dMs = new Date(dateStr + 'T00:00:00Z').getTime()
  const idx  = Math.floor((dMs - REF_MS) / (14 * 86400000))
  const s    = new Date(REF_MS + idx * 14 * 86400000)
  const e    = new Date(REF_MS + (idx + 1) * 14 * 86400000 - 86400000)
  return { period_start: s.toISOString().slice(0,10), period_end: e.toISOString().slice(0,10) }
}
function getPastFortnights(n = 13) {
  const seen = new Set(), result = []
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.now() - i * 14 * 86400000)
    const f = getFortnight(d.toISOString().slice(0,10))
    if (!seen.has(f.period_start)) { seen.add(f.period_start); result.push(f) }
  }
  return result
}
function fmtDate(d) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-NZ', { day:'numeric', month:'short', year:'numeric' })
}
function fmtShort(d) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-NZ', { day:'numeric', month:'short' })
}
function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase()
}
function downloadBase64Pdf(b64, filename) {
  const bytes = atob(b64)
  const buf   = new Uint8Array(bytes.length).map((_, i) => bytes.charCodeAt(i))
  const blob  = new Blob([buf], { type: 'application/pdf' })
  const url   = URL.createObjectURL(blob)
  const a     = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
function exportCsv(summaries, period_start, period_end) {
  const rows = [
    ['Provider', 'Period Start', 'Period End', 'Consultations', 'Base Rate', 'Base Amount', 'Holiday Pay (8%)', 'Total', 'Status'],
    ...summaries.map(s => [
      s.provider_name, period_start, period_end, s.consultation_count,
      s.base_rate.toFixed(2), s.base_amount.toFixed(2), s.holiday_pay_amount.toFixed(2), s.total_amount.toFixed(2), s.status,
    ]),
  ]
  const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `payroll-${period_start}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// ── Status chip ───────────────────────────────────────────────────────────────

function StatusChip({ status, paidAt }) {
  const cfg = {
    draft:    { bg:'#FEF3C7', color:'#92400E', label:'Draft' },
    approved: { bg:'#DBEAFE', color:'#1E40AF', label:'Approved' },
    paid:     { bg:'#D1FAE5', color:'#065F46', label:'Paid' },
  }[status] || { bg:'#F3F4F6', color:'#6B7280', label:'—' }
  return (
    <span style={{ background:cfg.bg, color:cfg.color, borderRadius:99, padding:'3px 10px', fontSize:'.6875rem', fontWeight:700 }}>
      {cfg.label}{status==='paid' && paidAt ? ` ${fmtShort(paidAt.slice(0,10))}` : ''}
    </span>
  )
}

// ── Review modal ──────────────────────────────────────────────────────────────

function ReviewModal({ summary, period_start, period_end, onClose }) {
  const [consults, setConsults] = useState(null)

  useEffect(() => {
    apiFetch(`/api/payroll?type=consultations&provider_id=${summary.provider_id}&period_start=${period_start}&period_end=${period_end}`)
      .then(r => r.json()).then(d => setConsults(d.consultations || [])).catch(() => setConsults([]))
  }, [summary.provider_id, period_start, period_end])

  const typeIcon = { video:'📹', phone:'📞', message:'💬' }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'white', borderRadius:16, width:'100%', maxWidth:560, maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ background:NAVY, padding:'1.25rem 1.5rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ color:'white', fontWeight:700, fontSize:'1rem', fontFamily:FF }}>{summary.provider_name}</div>
            <div style={{ color:'rgba(255,255,255,.6)', fontSize:'.8125rem', fontFamily:FF }}>{fmtShort(period_start)} – {fmtDate(period_end)}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'rgba(255,255,255,.6)', fontSize:'1.375rem', cursor:'pointer', minWidth:44, minHeight:44, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>
        <div style={{ overflowY:'auto', flex:1 }}>
          {consults === null ? (
            <div style={{ padding:'3rem', textAlign:'center' }}><div className="spinner" /></div>
          ) : consults.length === 0 ? (
            <div style={{ padding:'3rem', textAlign:'center', color:'#9CA3AF', fontFamily:FF }}>No consultations in this period</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FF, fontSize:'.875rem' }}>
              <thead>
                <tr style={{ background:'#F9FAFB', borderBottom:'1px solid #E2E8F0' }}>
                  <th style={{ padding:'.625rem 1rem', textAlign:'left', fontWeight:600, color:'#6B7280', fontSize:'.75rem' }}>Date</th>
                  <th style={{ padding:'.625rem .5rem', textAlign:'left', fontWeight:600, color:'#6B7280', fontSize:'.75rem' }}>Type</th>
                  <th style={{ padding:'.625rem .5rem', textAlign:'left', fontWeight:600, color:'#6B7280', fontSize:'.75rem' }}>Patient</th>
                  <th style={{ padding:'.625rem 1rem', textAlign:'right', fontWeight:600, color:'#6B7280', fontSize:'.75rem' }}>Earned</th>
                </tr>
              </thead>
              <tbody>
                {consults.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'white':'#FAFAFA' }}>
                    <td style={{ padding:'.625rem 1rem', color:'#374151', whiteSpace:'nowrap' }}>
                      {new Date(c.created_at).toLocaleDateString('en-NZ', { day:'2-digit', month:'short' })}
                    </td>
                    <td style={{ padding:'.625rem .5rem' }}>{typeIcon[c.consultation_type] || '📹'}</td>
                    <td style={{ padding:'.625rem .5rem', color:'#374151' }}>
                      {c.patient_first_name?.charAt(0)}{c.patient_last_name?.charAt(0)}.
                    </td>
                    <td style={{ padding:'.625rem 1rem', textAlign:'right', color:TEAL, fontWeight:600 }}>${(BASE_RATE * (1 + HOLIDAY_RATE)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background:'#F0F9FA', borderTop:'2px solid #D4EEF0' }}>
                  <td colSpan={3} style={{ padding:'.75rem 1rem', fontWeight:700, color:NAVY, fontFamily:FF }}>Total ({consults.length} consultations)</td>
                  <td style={{ padding:'.75rem 1rem', textAlign:'right', fontWeight:800, color:TEAL, fontSize:'1.0625rem' }}>${summary.total_amount.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
        <div style={{ padding:'.875rem 1rem', borderTop:'1px solid #E2E8F0', background:'#F9FAFB', fontFamily:FF, fontSize:'.75rem', color:'#9CA3AF', lineHeight:1.6 }}>
          Base $15.00 + 8% holiday pay = $16.20 per consultation · Holidays Act 2003
        </div>
      </div>
    </div>
  )
}

// ── Provider card ─────────────────────────────────────────────────────────────

function ProviderCard({ summary, period_start, period_end, onAction, actionLoading }) {
  const [showReview, setShowReview] = useState(false)
  const isLoading = k => actionLoading === `${summary.provider_id}:${k}`

  return (
    <>
      <div style={{ background:'white', borderRadius:14, border:'1px solid #E2E8F0', padding:'1.25rem', fontFamily:FF }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:'.875rem', marginBottom:'1rem' }}>
          <div style={{ width:44, height:44, borderRadius:'50%', background:summary.provider_color, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:700, fontSize:'1rem', flexShrink:0 }}>
            {initials(summary.provider_name)}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:700, color:NAVY, fontSize:'.9375rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{summary.provider_name}</div>
            <div style={{ display:'flex', alignItems:'center', gap:'.5rem', marginTop:2 }}>
              <span style={{ fontSize:'.8125rem', color:'#6B7280' }}>{summary.consultation_count} consult{summary.consultation_count !== 1 ? 's' : ''}</span>
              <StatusChip status={summary.status} paidAt={summary.paid_at} />
            </div>
          </div>
          <div style={{ textAlign:'right', flexShrink:0 }}>
            <div style={{ fontWeight:800, color:TEAL, fontSize:'1.25rem' }}>${summary.total_amount.toFixed(2)}</div>
            <div style={{ fontSize:'.6875rem', color:'#9CA3AF' }}>incl. holiday pay</div>
          </div>
        </div>

        {/* Breakdown */}
        {summary.consultation_count > 0 && (
          <div style={{ background:'#F9FAFB', borderRadius:8, padding:'.75rem 1rem', marginBottom:'1rem', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'.25rem', fontSize:'.8125rem' }}>
            <div><div style={{ color:'#9CA3AF', fontSize:'.6875rem' }}>Base</div><div style={{ fontWeight:600, color:NAVY }}>${summary.base_amount.toFixed(2)}</div></div>
            <div><div style={{ color:'#9CA3AF', fontSize:'.6875rem' }}>Holiday pay</div><div style={{ fontWeight:600, color:NAVY }}>${summary.holiday_pay_amount.toFixed(2)}</div></div>
            <div><div style={{ color:'#9CA3AF', fontSize:'.6875rem' }}>Total</div><div style={{ fontWeight:700, color:TEAL }}>${summary.total_amount.toFixed(2)}</div></div>
          </div>
        )}

        {summary.consultation_count === 0 && (
          <div style={{ textAlign:'center', padding:'.75rem', color:'#D1D5DB', fontSize:'.875rem', marginBottom:'.75rem' }}>No consultations this period</div>
        )}

        {/* Action buttons */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:'.5rem' }}>
          {summary.consultation_count > 0 && (
            <button onClick={() => setShowReview(true)}
              style={{ background:'#F3F4F6', border:'none', borderRadius:8, padding:'8px 14px', fontFamily:FF, fontWeight:600, fontSize:'.8125rem', cursor:'pointer', color:NAVY }}>
              Review
            </button>
          )}
          {summary.status === 'draft' && summary.consultation_count > 0 && summary.id && (
            <button onClick={() => onAction('approve', summary)} disabled={isLoading('approve')}
              style={{ background:'#DBEAFE', border:'none', borderRadius:8, padding:'8px 14px', fontFamily:FF, fontWeight:600, fontSize:'.8125rem', cursor:'pointer', color:'#1E40AF', opacity:isLoading('approve')?0.6:1 }}>
              {isLoading('approve') ? '…' : 'Approve'}
            </button>
          )}
          {summary.status === 'approved' && summary.id && (
            <button onClick={() => onAction('mark_paid', summary)} disabled={isLoading('mark_paid')}
              style={{ background:'#D1FAE5', border:'none', borderRadius:8, padding:'8px 14px', fontFamily:FF, fontWeight:600, fontSize:'.8125rem', cursor:'pointer', color:'#065F46', opacity:isLoading('mark_paid')?0.6:1 }}>
              {isLoading('mark_paid') ? '…' : 'Mark paid'}
            </button>
          )}
          {summary.consultation_count > 0 && (
            <button onClick={() => onAction('payslip', summary)} disabled={isLoading('payslip')}
              style={{ background:'#F0F9FA', border:'1px solid #D4EEF0', borderRadius:8, padding:'8px 14px', fontFamily:FF, fontWeight:600, fontSize:'.8125rem', cursor:'pointer', color:TEAL, opacity:isLoading('payslip')?0.6:1 }}>
              {isLoading('payslip') ? '…' : '⬇ Payslip'}
            </button>
          )}
          {summary.consultation_count > 0 && summary.provider_email && (
            <button onClick={() => onAction('send_email', summary)} disabled={isLoading('send_email')}
              style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:8, padding:'8px 14px', fontFamily:FF, fontWeight:600, fontSize:'.8125rem', cursor:'pointer', color:'#92400E', opacity:isLoading('send_email')?0.6:1 }}>
              {isLoading('send_email') ? '…' : '✉ Email'}
            </button>
          )}
        </div>
      </div>
      {showReview && (
        <ReviewModal summary={summary} period_start={period_start} period_end={period_end} onClose={() => setShowReview(false)} />
      )}
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminPayroll({ embedded = false }) {
  const navigate = useNavigate()
  const fortnights = getPastFortnights(13)
  const [period, setPeriod] = useState(fortnights[0])
  const [summaries, setSummaries]   = useState([])
  const [overview, setOverview]     = useState(null)
  const [loading, setLoading]       = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [toast, setToast]           = useState(null)
  const [showAll, setShowAll]       = useState(false)

  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500) }

  const load = useCallback(async () => {
    if (!period) return
    setLoading(true)
    try {
      const r = await apiFetch(`/api/payroll?type=summary&period_start=${period.period_start}&period_end=${period.period_end}`)
      const d = await r.json()
      setSummaries(d.summaries || [])
      setOverview(d.overview || null)
    } catch { showToast('Failed to load payroll data', false) }
    finally { setLoading(false) }
  }, [period])

  useEffect(() => { load() }, [load])

  async function calculate() {
    setCalculating(true)
    try {
      await apiFetch('/api/payroll', {
        method: 'POST',
        body: JSON.stringify({ action:'calculate', period_start:period.period_start, period_end:period.period_end }),
      })
      await load()
      showToast('Payroll calculated')
    } catch { showToast('Calculation failed', false) }
    finally { setCalculating(false) }
  }

  async function handleAction(type, summary) {
    const key = `${summary.provider_id}:${type}`
    setActionLoading(key)
    try {
      if (type === 'approve') {
        await apiFetch('/api/payroll', { method:'POST', body: JSON.stringify({ action:'approve', period_id:summary.id }) })
        showToast(`${summary.provider_name.split(' ')[0]}'s payroll approved`)
        await load()
      } else if (type === 'mark_paid') {
        await apiFetch('/api/payroll', { method:'POST', body: JSON.stringify({ action:'mark_paid', period_id:summary.id }) })
        showToast(`Marked as paid`)
        await load()
      } else if (type === 'payslip') {
        const r = await apiFetch('/api/payroll', {
          method: 'POST',
          body: JSON.stringify({ action:'payslip', provider_id:summary.provider_id, period_start:period.period_start, period_end:period.period_end }),
        })
        const d = await r.json()
        if (d.pdf) downloadBase64Pdf(d.pdf, d.filename)
        else showToast('Failed to generate payslip', false)
      } else if (type === 'send_email') {
        const r = await apiFetch('/api/payroll', {
          method: 'POST',
          body: JSON.stringify({ action:'send_email', provider_id:summary.provider_id, period_start:period.period_start, period_end:period.period_end }),
        })
        const d = await r.json()
        d.ok ? showToast(`Email sent to ${summary.provider_name.split(' ')[0]}`) : showToast(d.error || 'Email failed', false)
      }
    } catch { showToast('Action failed', false) }
    finally { setActionLoading(null) }
  }

  async function approveAll() {
    setActionLoading('global:approve_all')
    try {
      await apiFetch('/api/payroll', { method:'POST', body: JSON.stringify({ action:'approve_all', period_start:period.period_start, period_end:period.period_end }) })
      showToast('All draft periods approved')
      await load()
    } catch { showToast('Failed', false) }
    finally { setActionLoading(null) }
  }

  async function markAllPaid() {
    setActionLoading('global:mark_all_paid')
    try {
      await apiFetch('/api/payroll', { method:'POST', body: JSON.stringify({ action:'mark_all_paid', period_start:period.period_start, period_end:period.period_end }) })
      showToast('All approved periods marked as paid')
      await load()
    } catch { showToast('Failed', false) }
    finally { setActionLoading(null) }
  }

  async function sendAllEmails() {
    setActionLoading('global:send_emails')
    let sent = 0
    for (const s of summaries.filter(x => x.consultation_count > 0 && x.provider_email)) {
      try {
        await apiFetch('/api/payroll', { method:'POST', body: JSON.stringify({ action:'send_email', provider_id:s.provider_id, period_start:period.period_start, period_end:period.period_end }) })
        sent++
      } catch {}
    }
    setActionLoading(null)
    showToast(`Emails sent to ${sent} provider${sent !== 1 ? 's' : ''}`)
  }

  const activeProviders = summaries.filter(s => s.consultation_count > 0)
  const displayed       = showAll ? summaries : summaries.filter(s => s.consultation_count > 0)
  const hasDrafts       = summaries.some(s => s.status === 'draft' && s.consultation_count > 0 && s.id)
  const hasApproved     = summaries.some(s => s.status === 'approved' && s.id)

  const content = (
    <div style={{ fontFamily:FF }}>
      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', bottom:'1.5rem', right:'1.5rem', zIndex:300, background:toast.ok?'#059669':'#DC2626', color:'white', padding:'.875rem 1.25rem', borderRadius:10, fontFamily:FF, fontWeight:600, fontSize:'.9375rem', boxShadow:'0 8px 24px rgba(0,0,0,.2)', maxWidth:300 }}>
          {toast.msg}
        </div>
      )}

      {/* Period selector + Calculate */}
      <div style={{ display:'flex', gap:'.75rem', alignItems:'center', flexWrap:'wrap', marginBottom:'1.25rem' }}>
        <select value={period?.period_start || ''} onChange={e => {
          const f = fortnights.find(x => x.period_start === e.target.value)
          if (f) setPeriod(f)
        }} style={{ flex:1, minWidth:200, padding:'.6rem .875rem', border:'1.5px solid #E2E8F0', borderRadius:8, fontFamily:FF, fontSize:'.9375rem', cursor:'pointer' }}>
          {fortnights.map(f => (
            <option key={f.period_start} value={f.period_start}>
              {fmtShort(f.period_start)} – {fmtDate(f.period_end)}
            </option>
          ))}
        </select>
        <button onClick={calculate} disabled={calculating}
          style={{ background:TEAL, color:'white', border:'none', borderRadius:8, padding:'.6rem 1.25rem', fontFamily:FF, fontWeight:700, fontSize:'.9375rem', cursor:'pointer', opacity:calculating?0.7:1, whiteSpace:'nowrap' }}>
          {calculating ? 'Calculating…' : '⟳ Calculate'}
        </button>
      </div>

      {/* Overview stats */}
      {overview && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:'.75rem', marginBottom:'1.5rem' }}>
          {[
            { label:'Total payroll', value:`$${(overview.total_payroll || 0).toFixed(2)}`, color:TEAL },
            { label:'Active providers', value:overview.active_providers || 0, color:NAVY },
            { label:'Consultations', value:overview.total_consultations || 0, color:'#7C3AED' },
            { label:'Top provider', value:(overview.top_provider?.provider_name || '—').split(' ')[0], color:'#D97706' },
          ].map(s => (
            <div key={s.label} style={{ background:'white', border:'1px solid #E2E8F0', borderRadius:12, padding:'1rem', textAlign:'center' }}>
              <div style={{ fontWeight:800, fontSize:'1.375rem', color:s.color }}>{s.value}</div>
              <div style={{ fontSize:'.6875rem', color:'#9CA3AF', marginTop:2, fontWeight:600, textTransform:'uppercase', letterSpacing:'.04em' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Provider cards */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'3rem' }}><div className="spinner" /></div>
      ) : displayed.length === 0 ? (
        <div style={{ textAlign:'center', padding:'3rem 1.5rem', color:'#9CA3AF', background:'white', borderRadius:12, border:'1px solid #E2E8F0' }}>
          <div style={{ fontSize:'2.5rem', marginBottom:'.75rem' }}>💰</div>
          <div style={{ fontWeight:600, color:NAVY, marginBottom:'.5rem' }}>No consultations this period</div>
          <div style={{ fontSize:'.875rem' }}>Hit Calculate to refresh from consultation data</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'.875rem', marginBottom:'1.5rem' }}>
          {displayed.map(s => (
            <ProviderCard key={s.provider_id} summary={s} period_start={period.period_start} period_end={period.period_end} onAction={handleAction} actionLoading={actionLoading} />
          ))}
        </div>
      )}

      {/* Show/hide zero-consultation providers */}
      {summaries.some(s => s.consultation_count === 0) && (
        <button onClick={() => setShowAll(v => !v)}
          style={{ background:'none', border:'none', color:'#9CA3AF', fontSize:'.875rem', cursor:'pointer', fontFamily:FF, marginBottom:'1rem', textDecoration:'underline' }}>
          {showAll ? 'Hide inactive providers' : `Show ${summaries.filter(s=>s.consultation_count===0).length} inactive provider(s)`}
        </button>
      )}

      {/* Global actions */}
      {activeProviders.length > 0 && (
        <div style={{ background:'white', borderRadius:12, border:'1px solid #E2E8F0', padding:'1.25rem', marginBottom:'1.5rem' }}>
          <div style={{ fontWeight:700, color:NAVY, marginBottom:'1rem', fontSize:'.9375rem' }}>Bulk actions</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'.625rem' }}>
            {hasDrafts && (
              <button onClick={approveAll} disabled={actionLoading === 'global:approve_all'}
                style={{ background:'#DBEAFE', color:'#1E40AF', border:'none', borderRadius:8, padding:'10px 16px', fontFamily:FF, fontWeight:700, fontSize:'.875rem', cursor:'pointer' }}>
                {actionLoading === 'global:approve_all' ? '…' : '✓ Approve all drafts'}
              </button>
            )}
            {hasApproved && (
              <button onClick={markAllPaid} disabled={actionLoading === 'global:mark_all_paid'}
                style={{ background:'#D1FAE5', color:'#065F46', border:'none', borderRadius:8, padding:'10px 16px', fontFamily:FF, fontWeight:700, fontSize:'.875rem', cursor:'pointer' }}>
                {actionLoading === 'global:mark_all_paid' ? '…' : '✓ Mark all approved as paid'}
              </button>
            )}
            <button onClick={() => exportCsv(summaries, period.period_start, period.period_end)}
              style={{ background:'#F3F4F6', color:NAVY, border:'none', borderRadius:8, padding:'10px 16px', fontFamily:FF, fontWeight:700, fontSize:'.875rem', cursor:'pointer' }}>
              ⬇ Export CSV
            </button>
            <button onClick={sendAllEmails} disabled={actionLoading === 'global:send_emails'}
              style={{ background:'#FFF7ED', color:'#92400E', border:'1px solid #FED7AA', borderRadius:8, padding:'10px 16px', fontFamily:FF, fontWeight:700, fontSize:'.875rem', cursor:'pointer' }}>
              {actionLoading === 'global:send_emails' ? 'Sending…' : '✉ Email all providers'}
            </button>
          </div>
        </div>
      )}

      {/* Payroll rates note */}
      <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:10, padding:'.875rem 1rem', fontSize:'.8125rem', color:'#78350F', lineHeight:1.6 }}>
        <strong>Rates:</strong> $15.00 base + 8% holiday pay = $16.20 per consultation.
        This is a record of casual contractor earnings. Contractors are responsible for their own tax.
        Tere Health does not deduct PAYE.
      </div>
    </div>
  )

  if (embedded) {
    return <div style={{ padding:'1.25rem' }}>{content}</div>
  }

  return (
    <div style={{ minHeight:'100dvh', background:'#F7F5F0', fontFamily:FF }}>
      {/* Nav header */}
      <div style={{ background:NAVY, padding:'.875rem 1.5rem', display:'flex', alignItems:'center', gap:'.875rem', paddingTop:'max(.875rem, env(safe-area-inset-top))' }}>
        <button onClick={() => navigate(-1)} style={{ background:'none', border:'none', color:'rgba(255,255,255,.7)', fontSize:'1.375rem', cursor:'pointer', minWidth:44, minHeight:44, display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>‹</button>
        <div>
          <div style={{ fontFamily:'Cormorant Garamond,Georgia,serif', fontStyle:'italic', color:'#D4EEF0', fontSize:'1.25rem', letterSpacing:'.06em' }}>Tere</div>
          <div style={{ color:'rgba(255,255,255,.55)', fontSize:'.75rem' }}>Payroll</div>
        </div>
      </div>
      <div style={{ maxWidth:760, margin:'0 auto', padding:'1.5rem 1rem 4rem' }}>
        <h2 style={{ color:NAVY, marginBottom:'1.25rem' }}>Payroll</h2>
        {content}
      </div>
    </div>
  )
}
