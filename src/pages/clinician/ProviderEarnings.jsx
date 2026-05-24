import React, { useState, useEffect } from 'react'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'
const BASE_RATE    = 15.00
const HOLIDAY_RATE = 0.08
const PER_CONSULT  = parseFloat((BASE_RATE * (1 + HOLIDAY_RATE)).toFixed(2))

const REF_MS = new Date('2024-01-01T00:00:00Z').getTime()
function getFortnight(dateStr) {
  const dMs = new Date(dateStr + 'T00:00:00Z').getTime()
  const idx  = Math.floor((dMs - REF_MS) / (14 * 86400000))
  const s    = new Date(REF_MS + idx * 14 * 86400000)
  const e    = new Date(REF_MS + (idx + 1) * 14 * 86400000 - 86400000)
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

function StatusChip({ status }) {
  const cfg = {
    draft:    { bg:'#FEF3C7', color:'#92400E', label:'Pending' },
    approved: { bg:'#DBEAFE', color:'#1E40AF', label:'Approved' },
    paid:     { bg:'#D1FAE5', color:'#065F46', label:'Paid' },
  }[status] || { bg:'#F3F4F6', color:'#9CA3AF', label:'—' }
  return (
    <span style={{ background:cfg.bg, color:cfg.color, borderRadius:99, padding:'2px 9px', fontSize:'.6875rem', fontWeight:700 }}>
      {cfg.label}
    </span>
  )
}

export default function ProviderEarnings({ embedded = true }) {
  const providerId = sessionStorage.getItem('providerId')
  const today      = new Date().toISOString().slice(0,10)
  const period     = getFortnight(today)

  const [currentData, setCurrentData] = useState(null)  // { count, consultations }
  const [todayCount, setTodayCount]   = useState(0)
  const [weekCount, setWeekCount]     = useState(0)
  const [history, setHistory]         = useState([])
  const [ytd, setYtd]                 = useState(null)
  const [loading, setLoading]         = useState(true)
  const [payslipLoading, setPayslipLoading] = useState(null)
  const [toast, setToast]             = useState(null)

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  useEffect(() => {
    if (!providerId) return
    async function load() {
      setLoading(true)
      try {
        const { supabase } = await import('../../lib/supabase')

        // All completed consultations in current period
        const { data: periodConsults } = await supabase.from('consultations')
          .select('id,created_at,patient_first_name,patient_last_name,consultation_type')
          .eq('status', 'complete').eq('provider_id', providerId)
          .gte('created_at', period.period_start + 'T00:00:00.000Z')
          .lte('created_at', period.period_end + 'T23:59:59.999Z')
          .order('created_at', { ascending: false })

        const all = periodConsults || []

        // Today count
        const todayStart = today + 'T00:00:00.000Z'
        const todayEnd   = today + 'T23:59:59.999Z'
        setTodayCount(all.filter(c => c.created_at >= todayStart && c.created_at <= todayEnd).length)

        // This week (Mon–Sun)
        const dayOfWeek = new Date().getDay()
        const daysToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1
        const weekStart = new Date(Date.now() - daysToMon * 86400000).toISOString().slice(0,10)
        setWeekCount(all.filter(c => c.created_at.slice(0,10) >= weekStart).length)

        setCurrentData({ count: all.length, consultations: all.slice(0,5) })

        // History from payroll_periods
        const { data: histRows } = await supabase.from('payroll_periods')
          .select('*').eq('provider_id', providerId)
          .order('period_start', { ascending: false }).limit(12)
        setHistory(histRows || [])

        // YTD
        const year = new Date().getFullYear()
        const { data: ytdRows } = await supabase.from('payroll_periods')
          .select('total_amount,consultation_count').eq('provider_id', providerId)
          .gte('period_start', `${year}-01-01`).lte('period_end', `${year}-12-31`)
        const ytdTotal   = (ytdRows || []).reduce((s, r) => s + (r.total_amount || 0), 0)
        const ytdConsults = (ytdRows || []).reduce((s, r) => s + (r.consultation_count || 0), 0)
        setYtd({ total: parseFloat(ytdTotal.toFixed(2)), consultations: ytdConsults })

      } catch {} finally { setLoading(false) }
    }
    load()
  }, [providerId, period.period_start, period.period_end, today])

  async function downloadPayslip(row) {
    setPayslipLoading(row.id)
    try {
      const r = await apiFetch('/api/payroll', {
        method: 'POST',
        body: JSON.stringify({ action:'payslip', period_id: row.id }),
      })
      const d = await r.json()
      if (d.pdf) downloadBase64Pdf(d.pdf, d.filename)
      else showToast('Payslip not available yet')
    } catch { showToast('Failed to download') }
    finally { setPayslipLoading(null) }
  }

  const currentCount  = currentData?.count || 0
  const currentBase   = parseFloat((currentCount * BASE_RATE).toFixed(2))
  const currentHol    = parseFloat((currentBase * HOLIDAY_RATE).toFixed(2))
  const currentTotal  = parseFloat((currentBase + currentHol).toFixed(2))

  if (loading) return (
    <div style={{ padding:'4rem', textAlign:'center' }}><div className="spinner" style={{ borderColor:'rgba(11,110,118,.2)', borderTopColor:TEAL }} /></div>
  )

  return (
    <div style={{ padding:'1rem', fontFamily:FF }}>
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
          {/* Stats row */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'.5rem', marginBottom:'1.25rem' }}>
            {[
              { label:'Today', value:todayCount },
              { label:'This week', value:weekCount },
              { label:'This period', value:currentCount },
            ].map(s => (
              <div key={s.label} style={{ background:'#F9FAFB', borderRadius:10, padding:'.75rem .5rem', textAlign:'center' }}>
                <div style={{ fontWeight:800, fontSize:'1.5rem', color:NAVY }}>{s.value}</div>
                <div style={{ fontSize:'.6875rem', color:'#9CA3AF', marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Earnings breakdown */}
          <div style={{ background:'#F0F9FA', borderRadius:10, padding:'1rem 1.25rem', marginBottom:currentCount > 0 ? '1rem' : 0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'.5rem', fontSize:'.875rem' }}>
              <span style={{ color:'#6B7280' }}>Base ({currentCount} × ${BASE_RATE.toFixed(2)})</span>
              <span style={{ fontWeight:600, color:NAVY }}>${currentBase.toFixed(2)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'.75rem', fontSize:'.875rem' }}>
              <span style={{ color:'#6B7280' }}>Holiday pay (8%)</span>
              <span style={{ fontWeight:600, color:NAVY }}>${currentHol.toFixed(2)}</span>
            </div>
            <div style={{ borderTop:'1px solid #D4EEF0', paddingTop:'.625rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontWeight:700, color:NAVY }}>Period total</span>
              <span style={{ fontWeight:800, color:TEAL, fontSize:'1.5rem' }}>${currentTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Recent consultations */}
          {currentCount > 0 && currentData?.consultations && (
            <div>
              <div style={{ fontSize:'.75rem', fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:'.5rem' }}>Recent</div>
              {currentData.consultations.map(c => (
                <div key={c.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'.5rem 0', borderBottom:'1px solid #F3F4F6', fontSize:'.875rem' }}>
                  <span style={{ color:'#374151' }}>
                    {new Date(c.created_at).toLocaleDateString('en-NZ', { day:'2-digit', month:'short' })} — {c.patient_first_name?.charAt(0)}{c.patient_last_name?.charAt(0)}.
                  </span>
                  <span style={{ color:TEAL, fontWeight:600 }}>${PER_CONSULT.toFixed(2)}</span>
                </div>
              ))}
              {currentCount > 5 && (
                <div style={{ fontSize:'.8125rem', color:'#9CA3AF', textAlign:'center', padding:'.5rem 0' }}>+{currentCount - 5} more this period</div>
              )}
            </div>
          )}
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

      {/* Payslip history */}
      {history.length > 0 && (
        <div style={{ background:'white', borderRadius:16, border:'1px solid #E2E8F0', overflow:'hidden', marginBottom:'1rem' }}>
          <div style={{ padding:'1rem 1.25rem', borderBottom:'1px solid #F3F4F6' }}>
            <div style={{ fontWeight:700, color:NAVY, fontSize:'.9375rem' }}>Previous periods</div>
          </div>
          {history.map((row, i) => (
            <div key={row.id} style={{ display:'flex', alignItems:'center', gap:'.75rem', padding:'1rem 1.25rem', borderBottom:i < history.length-1 ? '1px solid #F3F4F6' : 'none' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'.875rem', fontWeight:600, color:NAVY }}>{fmtShort(row.period_start)} – {fmtShort(row.period_end)}</div>
                <div style={{ display:'flex', alignItems:'center', gap:'.5rem', marginTop:2 }}>
                  <span style={{ fontSize:'.8125rem', color:'#6B7280' }}>{row.consultation_count} consults</span>
                  <StatusChip status={row.status} />
                </div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontWeight:700, color:TEAL, fontSize:'.9375rem' }}>${Number(row.total_amount).toFixed(2)}</div>
                {row.status !== 'draft' && (
                  <button onClick={() => downloadPayslip(row)} disabled={payslipLoading === row.id}
                    style={{ background:'none', border:'none', color:TEAL, fontSize:'.75rem', cursor:'pointer', fontFamily:FF, padding:0, fontWeight:600 }}>
                    {payslipLoading === row.id ? '…' : '⬇ Payslip'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {history.length === 0 && !loading && (
        <div style={{ textAlign:'center', padding:'2rem', color:'#9CA3AF', fontSize:'.875rem' }}>
          Previous payslips will appear here once your first pay period is approved.
        </div>
      )}

      <div style={{ fontSize:'.75rem', color:'#D1D5DB', textAlign:'center', lineHeight:1.6, padding:'.5rem 0' }}>
        $16.20 per consultation · Base $15.00 + 8% holiday pay · As a contractor you are responsible for your own tax
      </div>
    </div>
  )
}
