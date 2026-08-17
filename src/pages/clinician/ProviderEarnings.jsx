// Provider earnings — contractor payment record.
//
// All numbers are canonical: fetched from /api/payroll (which reads each
// provider's base_rate from providers.base_rate). No rate math on the
// client — rate changes admin makes on AdminPayroll flow through here on
// next load.
//
// Contractor framing (not employee): no PAYE deduction, no holiday-pay
// loading, provider self-reports income for tax.

import React, { useState, useEffect } from 'react'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'

const REF_MS = new Date('2024-01-01T00:00:00Z').getTime()
function getFortnight(dateStr) {
  const dMs = new Date(dateStr + 'T00:00:00Z').getTime()
  const idx = Math.floor((dMs - REF_MS) / (14 * 86400000))
  const s   = new Date(REF_MS + idx * 14 * 86400000)
  const e   = new Date(REF_MS + (idx + 1) * 14 * 86400000 - 86400000)
  return { period_start: s.toISOString().slice(0,10), period_end: e.toISOString().slice(0,10) }
}

function fmtDate(d) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-NZ', { day:'numeric', month:'short', year:'numeric' })
}
function fmtShort(d) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-NZ', { day:'numeric', month:'short' })
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

function StatusChip({ status, paidAt }) {
  const cfg = {
    draft:    { bg:'#FEF3C7', color:'#92400E', label:'Pending' },
    approved: { bg:'#DBEAFE', color:'#1E40AF', label:'Approved' },
    paid:     { bg:'#D1FAE5', color:'#065F46', label:'Paid' },
  }[status] || { bg:'#F3F4F6', color:'#9CA3AF', label:'—' }
  const paidLabel = status === 'paid' && paidAt
    ? ` · ${fmtShort(paidAt.slice(0,10))}` : ''
  return (
    <span style={{ background:cfg.bg, color:cfg.color, borderRadius:99, padding:'2px 9px', fontSize:'.6875rem', fontWeight:700 }}>
      {cfg.label}{paidLabel}
    </span>
  )
}

export default function ProviderEarnings({ embedded = true }) {
  const providerId = sessionStorage.getItem('providerId')
  const today      = new Date().toISOString().slice(0,10)
  const period     = getFortnight(today)

  const [current, setCurrent] = useState(null)   // server-computed summary for this period
  const [history, setHistory] = useState([])     // frozen payroll_periods rows
  const [ytd,     setYtd]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [payslipLoading, setPayslipLoading] = useState(null)
  const [toast,   setToast]   = useState(null)

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  useEffect(() => {
    if (!providerId) { setLoading(false); return }
    async function load() {
      setLoading(true)
      try {
        const qs = `provider_id=${providerId}`
        const [histRes, ytdRes, sumRes] = await Promise.all([
          apiFetch(`/api/payroll?type=history&${qs}`),
          apiFetch(`/api/payroll?type=ytd&${qs}`),
          apiFetch(`/api/payroll?type=summary&${qs}&period_start=${period.period_start}&period_end=${period.period_end}`),
        ])
        const histData = await histRes.json().catch(() => ({}))
        const ytdData  = await ytdRes.json().catch(() => ({}))
        const sumData  = await sumRes.json().catch(() => ({}))

        setHistory(Array.isArray(histData?.periods) ? histData.periods : [])
        setYtd({
          total:         Number(ytdData?.ytd_total || 0),
          consultations: Number(ytdData?.ytd_consultations || 0),
        })
        // type=summary returns { summary: <one> } when provider_id filter is set,
        // else { summaries: [...] } — support both shapes defensively.
        const mySummary = sumData?.summary
          || (Array.isArray(sumData?.summaries) ? sumData.summaries.find(s => s.provider_id === providerId) : null)
        setCurrent(mySummary || null)
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [providerId, period.period_start, period.period_end])

  async function downloadPayslip(row) {
    setPayslipLoading(row.id)
    try {
      const r = await apiFetch('/api/payroll', {
        method: 'POST',
        body: JSON.stringify({ action:'payslip', period_id: row.id }),
      })
      const d = await r.json()
      if (d.pdf) downloadBase64Pdf(d.pdf, d.filename)
      else showToast('Payment record not available yet')
    } catch { showToast('Failed to download') }
    finally { setPayslipLoading(null) }
  }

  if (loading) return (
    <div style={{ padding:'4rem', textAlign:'center' }}><div className="spinner" style={{ borderColor:'rgba(11,110,118,.2)', borderTopColor:TEAL }} /></div>
  )

  const currentCount = Number(current?.consultation_count || 0)
  const currentRate  = Number(current?.base_rate || 20)
  const currentTotal = Number(current?.total_amount || 0)
  const currentStatus = current?.status || 'draft'

  return (
    <div style={{ padding:'1rem', fontFamily:FF, maxWidth:640, margin:'0 auto' }}>
      {toast && (
        <div style={{ position:'fixed', bottom:'5rem', left:'1rem', right:'1rem', zIndex:200, background:NAVY, color:'white', padding:'.875rem 1rem', borderRadius:10, fontFamily:FF, fontWeight:600, fontSize:'.9375rem', textAlign:'center' }}>
          {toast}
        </div>
      )}

      {/* Current period card */}
      <div style={{ background:'white', borderRadius:16, border:'1px solid #E2E8F0', overflow:'hidden', marginBottom:'1rem' }}>
        <div style={{ background:NAVY, padding:'1rem 1.25rem' }}>
          <div style={{ color:'rgba(255,255,255,.6)', fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:2 }}>Current pay period</div>
          <div style={{ color:'white', fontWeight:700, fontSize:'.9375rem' }}>{fmtShort(period.period_start)} – {fmtDate(period.period_end)}</div>
        </div>
        <div style={{ padding:'1.25rem' }}>
          <div style={{ background:'#F0F9FA', borderRadius:10, padding:'1rem 1.25rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'.5rem', fontSize:'.875rem' }}>
              <span style={{ color:'#6B7280' }}>{currentCount} consultation{currentCount !== 1 ? 's' : ''} × ${currentRate.toFixed(2)}</span>
              <span style={{ fontWeight:600, color:NAVY }}>${currentTotal.toFixed(2)}</span>
            </div>
            <div style={{ borderTop:'1px solid #D4EEF0', paddingTop:'.625rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontWeight:700, color:NAVY }}>Period total</div>
                <div style={{ marginTop:4 }}><StatusChip status={currentStatus} paidAt={current?.paid_at} /></div>
              </div>
              <span style={{ fontWeight:800, color:TEAL, fontSize:'1.5rem' }}>${currentTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* YTD */}
      {ytd && (
        <div style={{ background:'white', borderRadius:16, border:'1px solid #E2E8F0', padding:'1.125rem 1.25rem', marginBottom:'1rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontWeight:700, color:NAVY, fontSize:'.9375rem' }}>Year to date</div>
            <div style={{ fontSize:'.8125rem', color:'#6B7280' }}>{ytd.consultations} consultation{ytd.consultations !== 1 ? 's' : ''}</div>
          </div>
          <div style={{ fontWeight:800, color:TEAL, fontSize:'1.375rem' }}>${ytd.total.toFixed(2)}</div>
        </div>
      )}

      {/* Previous periods */}
      {history.length > 0 && (
        <div style={{ background:'white', borderRadius:16, border:'1px solid #E2E8F0', overflow:'hidden', marginBottom:'1rem' }}>
          <div style={{ padding:'1rem 1.25rem', borderBottom:'1px solid #F3F4F6' }}>
            <div style={{ fontWeight:700, color:NAVY, fontSize:'.9375rem' }}>Previous periods</div>
          </div>
          {history.map((row, i) => (
            <div key={row.id} style={{ display:'flex', alignItems:'center', gap:'.75rem', padding:'1rem 1.25rem', borderBottom:i < history.length-1 ? '1px solid #F3F4F6' : 'none' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'.875rem', fontWeight:600, color:NAVY }}>{fmtShort(row.period_start)} – {fmtShort(row.period_end)}</div>
                <div style={{ display:'flex', alignItems:'center', gap:'.5rem', marginTop:4, flexWrap:'wrap' }}>
                  <span style={{ fontSize:'.8125rem', color:'#6B7280' }}>{row.consultation_count} consult{row.consultation_count !== 1 ? 's' : ''}</span>
                  <StatusChip status={row.status} paidAt={row.paid_at} />
                </div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontWeight:700, color:TEAL, fontSize:'.9375rem' }}>${Number(row.total_amount).toFixed(2)}</div>
                {row.status !== 'draft' && (
                  <button onClick={() => downloadPayslip(row)} disabled={payslipLoading === row.id}
                    style={{ background:'none', border:'none', color:TEAL, fontSize:'.75rem', cursor:'pointer', fontFamily:FF, padding:0, fontWeight:600 }}>
                    {payslipLoading === row.id ? '…' : '⬇ Record'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {history.length === 0 && !loading && (
        <div style={{ textAlign:'center', padding:'2rem', color:'#9CA3AF', fontSize:'.875rem' }}>
          Payment records will appear here once admin finalises your first pay period.
        </div>
      )}

      <div style={{ fontSize:'.75rem', color:'#9CA3AF', textAlign:'center', lineHeight:1.6, padding:'.75rem 0 0', maxWidth:520, margin:'0 auto' }}>
        <div style={{ color:'#374151', fontWeight:600, marginBottom:'.35rem' }}>Rates: $20 per video/phone consultation · $10 per message consultation</div>
        This is a record of contractor earnings. Contractors are responsible for their own tax. <strong style={{ color:'#6B7280' }}>Tere Health does not deduct PAYE.</strong>
      </div>
    </div>
  )
}
