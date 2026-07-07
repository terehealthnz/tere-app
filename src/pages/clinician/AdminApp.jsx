import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getWaitlist, markWaitlistNotified, updateConsultation, getFlaggedNotesCount, getAccConvertedFlagged, getPendingPrescriptionsCount, getConsultsByEmployer, getCompleteCount, getResearchConsentedConsults, createEmployer, updateEmployer, addEmployerEmployees, getEmployers, getEmployerEmployeeCounts } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'
import AdminSchedule from './AdminSchedule'
import AdminPayroll  from './AdminPayroll'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'
const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d)) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s/60)}m`
  return `${Math.floor(s/3600)}h`
}

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4)
  const raw = window.atob((b64 + pad).replace(/-/g,'+').replace(/_/g,'/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

async function registerPush(providerId) {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_KEY) return
    if (Notification.permission === 'denied') return
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    const sub = existing || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_KEY) })
    await apiFetch('/api/push-subscribe', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ providerId, subscription: sub.toJSON() }) })
  } catch {}
}

function getSaved() {
  try {
    const s = localStorage.getItem('tere_device')
    if (!s) return null
    const d = JSON.parse(s)
    if (!d.savedAt || Date.now() - d.savedAt > 30 * 86400000) { localStorage.removeItem('tere_device'); return null }
    return d
  } catch { return null }
}

function restoreDevice(d) {
  const keys = ['providerId','providerDisplayName','providerIsAdmin','providerIsProvider','providerIsSupervisor','providerCanPrescribe','providerCanRefer','providerCanAcc','providerColor','prescriberNumber','providerCpn']
  sessionStorage.setItem('clinicianAuth', 'true')
  keys.forEach(k => { if (d[k]) sessionStorage.setItem(k, d[k]) })
}

// ── Dashboard tab ─────────────────────────────────────────────────────────────

function DashboardTab() {
  const navigate = useNavigate()
  const [queue, setQueue] = useState([])
  const [approvals, setApprovals] = useState(0)
  const [flagged, setFlagged] = useState(0)
  const [waitlist, setWaitlist] = useState([])
  const [notifying, setNotifying] = useState(false)
  const [notified, setNotified] = useState(false)
  const [loading, setLoading] = useState(true)
  const [accConversions, setAccConversions] = useState([])
  const [lodgingId, setLodgingId] = useState(null)

  const load = useCallback(async () => {
    try {
      const [qRes, flagCount, accList] = await Promise.all([
        apiFetch('/api/get-queue').then(r => r.json()),
        getFlaggedNotesCount(),
        getAccConvertedFlagged(),
      ])
      setQueue(qRes.consultations || [])
      setFlagged(flagCount || 0)
      setAccConversions(accList || [])
    } catch {}
    // Pending approvals — radiology_referrals still direct (own follow-up)
    try {
      const { supabase } = await import('../../lib/supabase')
      const [rxC, refRes] = await Promise.all([
        getPendingPrescriptionsCount(),
        supabase.from('radiology_referrals').select('*', { count:'exact', head:true }).eq('approval_status','pending_approval'),
      ])
      setApprovals((rxC || 0) + (refRes.count || 0))
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    getWaitlist().then(setWaitlist).catch(() => {})
    const interval = setInterval(load, 20000)
    return () => clearInterval(interval)
  }, [load])

  async function notifyWaitlist() {
    setNotifying(true)
    const count = waitlist.length
    try {
      for (const p of waitlist) {
        try { await apiFetch('/api/send-email', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ to:p.email, name:p.name, isOpenNotification:true, resumeId:p.id }) }) } catch {}
      }
      await markWaitlistNotified()
      setWaitlist([])
      setNotified(true)
      setTimeout(() => setNotified(false), 3000)
      apiFetch('/api/push-notify', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type:'waitlist_open', count }) }).catch(() => {})
    } catch {}
    setNotifying(false)
  }

  async function markLodged(id) {
    setLodgingId(id)
    try {
      await updateConsultation(id, { notes_flagged: false })
      setAccConversions(prev => prev.filter(c => c.id !== id))
    } catch {}
    setLodgingId(null)
  }

  const waiting    = queue.filter(c => c.status === 'waiting')
  const vitals     = queue.filter(c => ['vitals_requested','vitals_complete'].includes(c.status))
  const inProgress = queue.filter(c => c.status === 'in_progress')

  const SL = { waiting:'Waiting', vitals_requested:'Vitals pending', vitals_complete:'Vitals ready', ready:'Ready', in_progress:'In consult' }
  const SC = { waiting:'#F59E0B', vitals_requested:TEAL, vitals_complete:'#059669', ready:'#059669', in_progress:'#7C3AED' }

  return (
    <div style={{ padding:'1rem', fontFamily:FF }}>

      {/* Stat tiles */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'2.5rem' }}><div className="spinner" style={{ borderColor:'rgba(11,110,118,.15)', borderTopColor:TEAL }} /></div>
      ) : (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'.5rem', marginTop:'.875rem' }}>
            {[
              { label:'Waiting',   count:waiting.length,    color:'#F59E0B' },
              { label:'Vitals',    count:vitals.length,     color:TEAL },
              { label:'In consult', count:inProgress.length, color:'#7C3AED' },
            ].map(s => (
              <div key={s.label} style={{ background:'white', borderRadius:12, padding:'.875rem .5rem', textAlign:'center', border:`1px solid ${s.color}25` }}>
                <div style={{ fontSize:'2rem', fontWeight:800, color:s.color, lineHeight:1 }}>{s.count}</div>
                <div style={{ fontSize:'.625rem', color:'#6B7280', fontWeight:600, textTransform:'uppercase', marginTop:4, letterSpacing:'.05em' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Approval alert */}
          {approvals > 0 && (
            <button onClick={() => navigate('/clinician/dashboard')} style={{ width:'100%', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:12, padding:'1rem', display:'flex', alignItems:'center', gap:'.875rem', marginTop:'.75rem', cursor:'pointer', textAlign:'left', fontFamily:FF }}>
              <span style={{ fontSize:'1.5rem' }}>⏳</span>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, color:'#991B1B', fontSize:'.9375rem' }}>{approvals} pending approval{approvals>1?'s':''}</div>
                <div style={{ fontSize:'.8125rem', color:'#DC2626' }}>Prescriptions & referrals needing sign-off</div>
              </div>
              <span style={{ color:'#DC2626', fontSize:'1.25rem' }}>›</span>
            </button>
          )}

          {/* Flagged notes alert */}
          {flagged > 0 && (
            <button onClick={() => navigate('/clinician/admin')} style={{ width:'100%', background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:12, padding:'1rem', display:'flex', alignItems:'center', gap:'.875rem', marginTop:'.625rem', cursor:'pointer', textAlign:'left', fontFamily:FF }}>
              <span style={{ fontSize:'1.5rem' }}>🚩</span>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, color:'#92400E', fontSize:'.9375rem' }}>{flagged} flagged note{flagged>1?'s':''}</div>
                <div style={{ fontSize:'.8125rem', color:'#D97706' }}>Consultations flagged for clinical review</div>
              </div>
              <span style={{ color:'#D97706', fontSize:'1.25rem' }}>›</span>
            </button>
          )}

          {/* Waitlist */}
          {(waitlist.length > 0 || notified) && (
            <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:12, padding:'1rem', marginTop:'.625rem' }}>
              <div style={{ fontWeight:700, color:'#92400E', marginBottom:'.5rem', fontSize:'.9375rem' }}>
                {notified ? '✓ Waitlist notified' : `📋 ${waitlist.length} on waitlist`}
              </div>
              {!notified && waitlist.length > 0 && (
                <>
                  <div style={{ fontSize:'.8125rem', color:'#B45309', marginBottom:'.75rem' }}>Patients waiting for clinic to open</div>
                  <button onClick={notifyWaitlist} disabled={notifying} style={{ width:'100%', background:notifying?'#9CA3AF':'#D97706', color:'white', border:'none', borderRadius:10, padding:'12px', fontFamily:FF, fontWeight:700, fontSize:'.9375rem', cursor:'pointer', minHeight:48 }}>
                    {notifying ? 'Sending…' : `Email all ${waitlist.length} patient${waitlist.length>1?'s':''}`}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Queue list */}
          <div style={{ background:'white', borderRadius:12, border:'1px solid #E2E8F0', overflow:'hidden', marginTop:'.75rem' }}>
            <div style={{ padding:'.875rem 1rem', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontWeight:700, color:NAVY, fontSize:'.9375rem' }}>Active queue ({queue.length})</span>
              <button onClick={load} style={{ background:'none', border:'none', color:TEAL, fontSize:'.8125rem', fontWeight:600, cursor:'pointer', fontFamily:FF, padding:'4px 8px', minHeight:36 }}>↻</button>
            </div>
            {queue.length === 0 ? (
              <div style={{ textAlign:'center', padding:'2rem', color:'#9CA3AF', fontSize:'.875rem' }}>Queue is clear</div>
            ) : queue.map((c, i) => (
              <div key={c.id} style={{ padding:'.875rem 1rem', borderBottom:i<queue.length-1?'1px solid #F9FAFB':'none', display:'flex', alignItems:'center', gap:'.75rem' }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:SC[c.status]||'#9CA3AF', flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, color:NAVY, fontSize:'.875rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.patient_first_name} {c.patient_last_name}</div>
                  <div style={{ fontSize:'.75rem', color:'#9CA3AF' }}>{SL[c.status]||c.status} · {timeAgo(c.created_at)}</div>
                </div>
                {c.acc_eligible === 'yes' && <span style={{ background:'#D4EEF0', color:TEAL, fontSize:'.625rem', fontWeight:700, padding:'2px 6px', borderRadius:99 }}>ACC</span>}
              </div>
            ))}
          </div>

          {/* ACC conversions pending ProviderHub lodgement */}
          {accConversions.length > 0 && (
            <div style={{ background:'white', borderRadius:12, border:'1px solid #FDE68A', overflow:'hidden', marginTop:'.75rem' }}>
              <div style={{ padding:'.875rem 1rem', borderBottom:'1px solid #FEF3C7', background:'#FFFBEB' }}>
                <span style={{ fontWeight:700, color:'#92400E', fontSize:'.9375rem' }}>⚡ ACC lodgements pending ({accConversions.length})</span>
                <div style={{ fontSize:'.75rem', color:'#B45309', marginTop:2 }}>Lodge each ACC45 claim via ProviderHub, then mark as done.</div>
              </div>
              {accConversions.map((c, i) => (
                <div key={c.id} style={{ padding:'.875rem 1rem', borderBottom:i<accConversions.length-1?'1px solid #FEF9EE':'none' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'.75rem' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, color:NAVY, fontSize:'.875rem' }}>{c.patient_first_name} {c.patient_last_name}</div>
                      <div style={{ fontSize:'.75rem', color:'#6B7280', marginTop:2 }}>
                        {c.acc_injury_details || '—'}{c.acc_body_part ? ` · ${c.acc_body_part}` : ''}{c.acc_read_code ? ` · ${c.acc_read_code}` : ''}
                      </div>
                      {c.acc_converted_at && (
                        <div style={{ fontSize:'.7rem', color:'#9CA3AF', marginTop:1 }}>
                          Converted {new Date(c.acc_converted_at).toLocaleDateString('en-NZ', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                        </div>
                      )}
                    </div>
                    <button onClick={() => markLodged(c.id)} disabled={lodgingId === c.id}
                      style={{ flexShrink:0, padding:'6px 12px', border:'none', borderRadius:8, background:lodgingId===c.id?'#9CA3AF':'#059669', color:'white', cursor:lodgingId===c.id?'default':'pointer', fontFamily:FF, fontWeight:700, fontSize:'.75rem', minHeight:36 }}>
                      {lodgingId === c.id ? '…' : '✓ Lodged'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Analytics tab ─────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const [range, setRange] = useState(7)
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const { supabase } = await import('../../lib/supabase')
        const since = new Date()
        since.setDate(since.getDate() - range)
        const { data: rows } = await supabase
          .from('consultations')
          .select('created_at,started_at,consultation_duration_seconds,payment_amount,acc_eligible,consultation_subtype')
          .gte('created_at', since.toISOString())
          .eq('status','complete')
          .order('created_at', { ascending:true })
        setData(rows || [])
      } catch {}
      setLoading(false)
    }
    load()
  }, [range])

  const total    = data.length
  const revenue  = data.reduce((a,r) => a + (r.payment_amount||0)/100, 0)
  const accCount = data.filter(r => r.acc_eligible === 'yes').length
  // Async message ACC: $37.50 (patient $25 already in payment_amount as part of $62.50 total)
  // Video/phone ACC: $62 ACC subsidy (patient co-payment already in payment_amount)
  const accEst   = data.filter(r => r.acc_eligible === 'yes').reduce((sum, r) =>
    sum + (r.consultation_subtype === 'async_message' ? 37.5 : 62), 0)
  const waits    = data.filter(r => r.started_at).map(r => (new Date(r.started_at) - new Date(r.created_at))/60000)
  const avgWait  = waits.length ? Math.round(waits.reduce((a,b)=>a+b,0)/waits.length) : 0
  const durs     = data.filter(r => r.consultation_duration_seconds).map(r => r.consultation_duration_seconds/60)
  const avgDur   = durs.length ? Math.round(durs.reduce((a,b)=>a+b,0)/durs.length) : 0

  const byDay = {}
  data.forEach(r => {
    const day = r.created_at?.slice(0,10)
    if (!day) return
    if (!byDay[day]) byDay[day] = { count:0, revenue:0, acc:0 }
    byDay[day].count++
    byDay[day].revenue += (r.payment_amount||0)/100
    if (r.acc_eligible === 'yes') byDay[day].acc += r.consultation_subtype === 'async_message' ? 37.5 : 62
  })
  const days = Object.keys(byDay).sort().reverse()

  const stats = [
    { label:'Consultations', value:total,           color:TEAL,      icon:'🏥' },
    { label:'Revenue',       value:`$${Math.round(revenue)}`,   color:'#059669', icon:'💵' },
    { label:'ACC est.',      value:`$${accEst}`,    color:'#7C3AED', icon:'📋' },
    { label:'Avg wait',      value:`${avgWait}m`,   color:'#F59E0B', icon:'⏱' },
    { label:'Avg consult',   value:`${avgDur}m`,    color:'#D97706', icon:'🩺' },
    { label:'ACC consults',  value:accCount,        color:TEAL,      icon:'✓' },
  ]

  return (
    <div style={{ padding:'1rem', fontFamily:FF }}>
      {/* Period picker */}
      <div style={{ display:'flex', gap:8, marginBottom:'1rem' }}>
        {[1,7,30].map(d => (
          <button key={d} onClick={() => setRange(d)} style={{ flex:1, padding:'11px', borderRadius:10, border:'1.5px solid', fontFamily:FF, fontWeight:700, fontSize:'.9375rem', cursor:'pointer', transition:'all .15s', borderColor:range===d?TEAL:'#E2E8F0', background:range===d?TEAL:'white', color:range===d?'white':'#6B7280' }}>
            {d===1 ? 'Today' : d===7 ? '7 days' : '30 days'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'3rem' }}><div className="spinner" style={{ borderColor:'rgba(11,110,118,.15)', borderTopColor:TEAL }} /></div>
      ) : total === 0 ? (
        <div style={{ textAlign:'center', padding:'3rem', background:'white', borderRadius:12, border:'1px solid #E2E8F0' }}>
          <div style={{ fontSize:'2rem', marginBottom:'.75rem' }}>📊</div>
          <div style={{ fontWeight:700, color:NAVY, marginBottom:'.25rem' }}>No data yet</div>
          <div style={{ color:'#9CA3AF', fontSize:'.875rem' }}>Completed consultations appear here</div>
        </div>
      ) : (
        <>
          {/* Stat cards 2-col grid */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.625rem', marginBottom:'1rem' }}>
            {stats.map(s => (
              <div key={s.label} style={{ background:'white', borderRadius:12, padding:'1rem', border:`1.5px solid ${s.color}20` }}>
                <div style={{ fontSize:'1.25rem', marginBottom:'.25rem' }}>{s.icon}</div>
                <div style={{ fontSize:'1.875rem', fontWeight:800, color:s.color, lineHeight:1 }}>{s.value}</div>
                <div style={{ fontSize:'.6875rem', fontWeight:600, color:'#6B7280', textTransform:'uppercase', marginTop:4, letterSpacing:'.04em' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Daily breakdown — card list, no table */}
          <div style={{ background:'white', borderRadius:12, border:'1px solid #E2E8F0', overflow:'hidden' }}>
            <div style={{ padding:'.875rem 1rem', borderBottom:'1px solid #F3F4F6', fontWeight:700, color:NAVY, fontSize:'.9375rem' }}>
              Daily breakdown
            </div>
            {days.map((day, i) => {
              const d = byDay[day]
              return (
                <div key={day} style={{ padding:'.875rem 1rem', borderBottom:i<days.length-1?'1px solid #F9FAFB':'none', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <div style={{ fontWeight:600, color:NAVY, fontSize:'.875rem' }}>
                      {new Date(day+'T12:00:00').toLocaleDateString('en-NZ', { weekday:'short', day:'numeric', month:'short' })}
                    </div>
                    <div style={{ fontSize:'.75rem', color:'#9CA3AF', marginTop:2 }}>{d.count} consult{d.count!==1?'s':''}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontWeight:700, color:'#059669', fontSize:'.9375rem' }}>${Math.round(d.revenue)}</div>
                    {d.acc > 0 && <div style={{ fontSize:'.75rem', color:TEAL }}>+ ${d.acc} ACC</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Employers tab ─────────────────────────────────────────────────────────────

function EmployersTab() {
  const [employers, setEmployers]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [showAdd, setShowAdd]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [uploadingFor, setUploadingFor] = useState(null)
  const [counts, setCounts]         = useState({})
  const [newEmp, setNewEmp]         = useState({ company_name:'', contact_email:'', monthly_rate_per_employee:'', contract_start:'' })

  async function load() {
    setLoading(true)
    try {
      const emps = await getEmployers({ includeInactive: true })
      setEmployers(emps || [])
      if (emps?.length) {
        const map = await getEmployerEmployeeCounts()
        setCounts(map || {})
      }
    } catch {}
    setLoading(false)
  }

  async function addEmployer() {
    if (!newEmp.company_name.trim()) return
    setSaving(true)
    try {
      await createEmployer({
        company_name: newEmp.company_name.trim(),
        contact_email: newEmp.contact_email.trim() || null,
        monthly_rate_per_employee: newEmp.monthly_rate_per_employee ? parseFloat(newEmp.monthly_rate_per_employee) : null,
        contract_start: newEmp.contract_start || null,
        is_active: true,
      })
      setNewEmp({ company_name:'', contact_email:'', monthly_rate_per_employee:'', contract_start:'' })
      setShowAdd(false)
      await load()
    } catch {}
    setSaving(false)
  }

  async function toggleActive(id, val) {
    try {
      await updateEmployer(id, { is_active: val })
      setEmployers(es => es.map(e => e.id===id ? {...e,is_active:val} : e))
    } catch {}
  }

  function parseCsv(text) {
    const lines = text.trim().split('\n').filter(Boolean)
    if (lines.length < 2) return []
    const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g,'_'))
    return lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g,''))
      const row = {}
      header.forEach((h,i) => { row[h] = cols[i]||'' })
      return row
    }).filter(r => r.first_name || r.firstname)
  }

  async function uploadCsv(file, empId) {
    setUploadingFor(empId)
    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (!rows.length) { alert('No valid rows. CSV needs: first_name, last_name'); setUploadingFor(null); return }
      const inserts = rows.map(r => ({
        employer_id: empId,
        first_name: r.first_name||r.firstname||'',
        last_name: r.last_name||r.lastname||r.surname||'',
        dob: r.dob||null,
        employee_id: r.employee_id||r.staff_id||null,
      })).filter(r => r.first_name && r.last_name)
      await addEmployerEmployees(inserts)
      setCounts(c => ({...c, [empId]: (c[empId]||0)+inserts.length}))
      alert(`✓ ${inserts.length} employees imported`)
    } catch { alert('Upload failed') }
    setUploadingFor(null)
  }

  async function downloadReport(emp) {
    try {
      const since = new Date(); since.setDate(1); since.setHours(0,0,0,0)
      const cs = await getConsultsByEmployer(emp.id, since.toISOString())
      if (!cs?.length) { alert('No consultations this month for this employer'); return }
      const csv = 'Patient,Date,Type,Code\n' + cs.map(c => `"${c.patient_first_name} ${c.patient_last_name}","${new Date(c.created_at).toLocaleDateString('en-NZ')}","${c.consultation_type||''}","${c.billing_code||''}"`).join('\n')
      const url = URL.createObjectURL(new Blob([csv],{type:'text/csv'}))
      const a = document.createElement('a')
      a.href=url; a.download=`${emp.company_name.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,7)}.csv`
      a.click(); URL.revokeObjectURL(url)
    } catch {}
  }

  useEffect(() => { load() }, [])

  const inp = { width:'100%', boxSizing:'border-box', border:'1.5px solid #E2E8F0', borderRadius:8, padding:'11px 12px', fontFamily:FF, fontSize:'.9375rem', outline:'none', marginBottom:'.625rem', background:'white' }

  return (
    <div style={{ padding:'1rem', fontFamily:FF }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
        <div>
          <div style={{ fontWeight:700, fontSize:'1.0625rem', color:NAVY }}>Employer accounts</div>
          <div style={{ fontSize:'.8125rem', color:'#6B7280' }}>Corporate healthcare partners</div>
        </div>
        <button onClick={() => setShowAdd(s=>!s)} style={{ background:TEAL, border:'none', color:'white', borderRadius:10, padding:'10px 16px', fontFamily:FF, fontWeight:700, fontSize:'.875rem', cursor:'pointer', minHeight:44 }}>
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showAdd && (
        <div style={{ background:'white', borderRadius:12, padding:'1.25rem', marginBottom:'1rem', border:'1px solid #E2E8F0' }}>
          <div style={{ fontWeight:700, color:NAVY, marginBottom:'.875rem' }}>New employer</div>
          <input style={inp} placeholder="Company name *" value={newEmp.company_name} onChange={e => setNewEmp(n=>({...n,company_name:e.target.value}))} />
          <input style={inp} placeholder="Contact email" value={newEmp.contact_email} onChange={e => setNewEmp(n=>({...n,contact_email:e.target.value}))} />
          <input style={inp} placeholder="Monthly rate per employee ($)" value={newEmp.monthly_rate_per_employee} onChange={e => setNewEmp(n=>({...n,monthly_rate_per_employee:e.target.value}))} />
          <input style={{...inp,marginBottom:'1rem'}} type="date" value={newEmp.contract_start} onChange={e => setNewEmp(n=>({...n,contract_start:e.target.value}))} />
          <button onClick={addEmployer} disabled={saving||!newEmp.company_name.trim()} style={{ width:'100%', background:TEAL, color:'white', border:'none', borderRadius:10, padding:'14px', fontFamily:FF, fontWeight:700, fontSize:'1rem', cursor:'pointer', minHeight:52, opacity:saving||!newEmp.company_name.trim()?0.5:1 }}>
            {saving ? 'Saving…' : 'Add employer'}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:'3rem' }}><div className="spinner" style={{ borderColor:'rgba(11,110,118,.15)', borderTopColor:TEAL }} /></div>
      ) : employers.length === 0 ? (
        <div style={{ textAlign:'center', padding:'3rem', background:'white', borderRadius:12, border:'1px solid #E2E8F0' }}>
          <div style={{ fontSize:'2rem', marginBottom:'.75rem' }}>🏢</div>
          <div style={{ fontWeight:700, color:NAVY, marginBottom:'.25rem' }}>No employers yet</div>
          <div style={{ color:'#9CA3AF', fontSize:'.875rem' }}>Tap + Add to get started</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'.75rem' }}>
          {employers.map(emp => (
            <div key={emp.id} style={{ background:'white', borderRadius:12, padding:'1.25rem', border:`1px solid ${emp.is_active?'#E2E8F0':'#FECACA'}` }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'.875rem' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:'.25rem' }}>
                    <span style={{ fontWeight:700, fontSize:'1rem', color:NAVY }}>{emp.company_name}</span>
                    <span style={{ background:emp.is_active?'#D1FAE5':'#FEE2E2', color:emp.is_active?'#065F46':'#991B1B', fontSize:'.6875rem', fontWeight:700, padding:'1px 7px', borderRadius:99 }}>
                      {emp.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {emp.contact_email && <div style={{ fontSize:'.8125rem', color:'#6B7280', marginBottom:2 }}>{emp.contact_email}</div>}
                  <div style={{ fontSize:'.8125rem', color:TEAL, fontWeight:600 }}>
                    {counts[emp.id]||0} employees
                    {emp.monthly_rate_per_employee && <span style={{ fontWeight:400, color:'#9CA3AF' }}> · ${emp.monthly_rate_per_employee}/mo each</span>}
                  </div>
                </div>
                <button onClick={() => toggleActive(emp.id, !emp.is_active)} style={{ background:'none', border:`1px solid ${emp.is_active?'#FECACA':'#BBF7D0'}`, color:emp.is_active?'#DC2626':'#059669', borderRadius:8, padding:'6px 10px', cursor:'pointer', fontSize:'.75rem', fontFamily:FF, minHeight:36, whiteSpace:'nowrap', flexShrink:0, marginLeft:8 }}>
                  {emp.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.5rem' }}>
                <label style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, background:'#EFF6FF', color:'#2563EB', borderRadius:10, padding:'11px', cursor:'pointer', fontSize:'.875rem', fontWeight:600, fontFamily:FF, minHeight:44 }}>
                  {uploadingFor===emp.id ? 'Importing…' : '↑ Upload CSV'}
                  <input type="file" accept=".csv" style={{ display:'none' }} onChange={e => { if (e.target.files[0]) uploadCsv(e.target.files[0], emp.id); e.target.value='' }} disabled={uploadingFor===emp.id} />
                </label>
                <button onClick={() => downloadReport(emp)} style={{ background:'#F0FDF4', color:'#059669', border:'1px solid #BBF7D0', borderRadius:10, padding:'11px', cursor:'pointer', fontSize:'.875rem', fontWeight:600, fontFamily:FF, minHeight:44 }}>
                  ↓ Month report
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop:'1rem', padding:'.75rem', background:'#F8FAFC', borderRadius:8, fontSize:'.75rem', color:'#9CA3AF', textAlign:'center' }}>
        CSV columns: first_name, last_name, dob (opt), employee_id (opt)
      </div>
    </div>
  )
}

// ── Settings tab ──────────────────────────────────────────────────────────────

function SettingsTab({ navigate, displayName }) {
  const [providers, setProviders]     = useState([])
  const [saving, setSaving]           = useState(null)
  const [nextTimes, setNextTimes]     = useState('')
  const [savingMsg, setSavingMsg]     = useState(false)
  const [msgSaved, setMsgSaved]       = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const { supabase } = await import('../../lib/supabase')
        const { data } = await supabase.from('providers').select('id,first_name,last_name,color,is_active,is_available,is_provider,specialty,credential').eq('is_active',true).order('first_name')
        setProviders(data||[])
      } catch {}
    }
    load()
    getSchedule().then(sc => setNextTimes(sc.next_times||'')).catch(()=>{})
  }, [])

  async function toggleProviderAvail(id, val) {
    setSaving(id)
    try {
      const res = await apiFetch('/api/set-provider-avail', {
        method: 'POST',
        body: JSON.stringify({ providerId: id, isAvailable: val }),
      })
      if (!res.ok) throw new Error('Failed')
      setProviders(ps => ps.map(p => p.id===id ? {...p,is_available:val} : p))
    } catch (e) { console.error('toggleProviderAvail error:', e) }
    setSaving(null)
  }

  async function saveMsg() {
    setSavingMsg(true)
    try { await setSchedule(nextTimes); setMsgSaved(true); setTimeout(()=>setMsgSaved(false),2500) }
    catch {}
    setSavingMsg(false)
  }

  function signOut() {
    localStorage.removeItem('tere_device')
    localStorage.removeItem('tere_portal')
    sessionStorage.clear()
    navigate('/clinician')
  }

  const links = [
    { label:'Payroll',               icon:'💰',  sub:'Calculate & approve provider earnings', action:()=>navigate('/admin/payroll') },
    { label:'Provider dashboard',    icon:'📊',  sub:'Clinician consultation view',           action:()=>navigate('/clinician/dashboard') },
    { label:'Change password',       icon:'🔑',  sub:'Update your PIN',                       action:()=>navigate('/clinician/change-password') },
  ]

  return (
    <div style={{ padding:'1rem', fontFamily:FF }}>
      {/* Provider availability */}
      <div style={{ background:'white', borderRadius:12, padding:'1.25rem', marginBottom:'.875rem', border:'1px solid #E2E8F0' }}>
        <div style={{ fontWeight:700, color:NAVY, marginBottom:'1rem', fontSize:'.9375rem' }}>Provider availability</div>
        {providers.filter(p => p.is_provider).length === 0 ? (
          <div style={{ color:'#9CA3AF', fontSize:'.875rem', textAlign:'center', padding:'1rem' }}>No active providers found</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'.75rem' }}>
            {providers.filter(p => p.is_provider).map(p => (
              <div key={p.id} style={{ display:'flex', alignItems:'center', gap:'.875rem' }}>
                <div style={{ width:42, height:42, borderRadius:'50%', background:p.color||TEAL, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:700, fontSize:'1rem', flexShrink:0 }}>
                  {p.first_name[0]}{p.last_name[0]}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, color:NAVY, fontSize:'.875rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{providerDisplayName(p)}</div>
                  <div style={{ fontSize:'.75rem', color:'#9CA3AF' }}>{p.specialty||'Clinician'}</div>
                </div>
                <button
                  onClick={() => toggleProviderAvail(p.id, !p.is_available)}
                  disabled={saving===p.id}
                  style={{ background:p.is_available?'#F0FDF4':'#FEF2F2', color:p.is_available?'#059669':'#DC2626', border:`1px solid ${p.is_available?'#BBF7D0':'#FECACA'}`, borderRadius:99, padding:'7px 14px', cursor:'pointer', fontFamily:FF, fontWeight:700, fontSize:'.8125rem', whiteSpace:'nowrap', minHeight:40, flexShrink:0 }}
                >
                  {saving===p.id ? '…' : p.is_available ? '● On' : '○ Off'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Next available message */}
      <div style={{ background:'white', borderRadius:12, padding:'1.25rem', marginBottom:'.875rem', border:'1px solid #E2E8F0' }}>
        <div style={{ fontWeight:700, color:NAVY, marginBottom:'.25rem', fontSize:'.9375rem' }}>Closed-screen message</div>
        <div style={{ fontSize:'.8125rem', color:'#6B7280', marginBottom:'.875rem' }}>Holiday notes, on-call numbers, next open time.</div>
        <textarea
          value={nextTimes}
          onChange={e => setNextTimes(e.target.value)}
          rows={3}
          placeholder={'e.g. Back Monday 9am\nHoliday cover: call 111 for emergencies'}
          style={{ width:'100%', boxSizing:'border-box', border:'1.5px solid #E2E8F0', borderRadius:8, padding:'10px 12px', fontFamily:FF, fontSize:'.9375rem', outline:'none', resize:'none', lineHeight:1.6, marginBottom:'.75rem' }}
        />
        <button onClick={saveMsg} disabled={savingMsg} style={{ width:'100%', background:TEAL, color:'white', border:'none', borderRadius:10, padding:'12px', fontFamily:FF, fontWeight:700, fontSize:'.9375rem', cursor:'pointer', minHeight:48 }}>
          {savingMsg ? 'Saving…' : msgSaved ? '✓ Saved' : 'Save message'}
        </button>
      </div>

      {/* Navigation links */}
      <div style={{ background:'white', borderRadius:12, border:'1px solid #E2E8F0', overflow:'hidden', marginBottom:'.875rem' }}>
        {links.map((item, i) => (
          <button key={item.label} onClick={item.action} style={{ width:'100%', background:'none', border:'none', borderBottom:i<links.length-1?'1px solid #F3F4F6':'none', padding:'1rem 1.25rem', display:'flex', alignItems:'center', gap:'.875rem', cursor:'pointer', textAlign:'left', minHeight:60, fontFamily:FF }}>
            <span style={{ fontSize:'1.25rem', width:28, textAlign:'center' }}>{item.icon}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, color:NAVY, fontSize:'.875rem' }}>{item.label}</div>
              <div style={{ fontSize:'.75rem', color:'#9CA3AF', marginTop:2 }}>{item.sub}</div>
            </div>
            <span style={{ color:'#D1D5DB', fontSize:'1.125rem' }}>›</span>
          </button>
        ))}
      </div>

      {/* Sign out */}
      <button onClick={signOut} style={{ width:'100%', background:'#FEF2F2', color:'#DC2626', border:'1px solid #FECACA', borderRadius:12, padding:'16px', fontFamily:FF, fontWeight:700, fontSize:'1rem', cursor:'pointer', minHeight:56 }}>
        Sign out
      </button>
    </div>
  )
}

// ── Bookings tab ──────────────────────────────────────────────────────────────

function BookingsTab() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('upcoming')
  const [cancelling, setCancelling] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const params = filter === 'today'
        ? `action=list&date=${new Date().toISOString().slice(0,10)}`
        : 'action=list'
      const res = await apiFetch(`/api/bookings?${params}`)
      const data = await res.json()
      setBookings(data.bookings || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [filter])

  async function cancelBooking(id) {
    if (!window.confirm('Cancel this booking and notify the patient?')) return
    setCancelling(id)
    try {
      await apiFetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', id, cancelled_by: 'admin', reason: 'admin_cancelled' }),
      })
      await load()
    } catch {}
    setCancelling(null)
  }

  const STATUS_COLOR = { confirmed:'#059669', cancelled:'#DC2626', completed:'#6B7280', no_show:'#F59E0B', schedule_change:'#7C3AED' }
  const STATUS_LABEL = { confirmed:'Confirmed', cancelled:'Cancelled', completed:'Done', no_show:'No show', schedule_change:'Schedule change' }

  return (
    <div style={{ padding:'1rem', fontFamily:FF }}>
      <div style={{ display:'flex', gap:6, marginBottom:'1rem' }}>
        {['upcoming','today','all'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ flex:1, padding:'8px 4px', border:`1.5px solid ${filter===f?TEAL:'#E2E8F0'}`, borderRadius:8, background:filter===f?'#EFF9F9':'white', color:filter===f?TEAL:'#6B7280', fontFamily:FF, fontWeight:700, fontSize:'.8125rem', cursor:'pointer', textTransform:'capitalize' }}>
            {f === 'upcoming' ? 'All upcoming' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      {loading ? (
        <div style={{ textAlign:'center', padding:'2rem', color:'#9CA3AF' }}>Loading…</div>
      ) : bookings.length === 0 ? (
        <div style={{ textAlign:'center', padding:'2rem', color:'#9CA3AF', background:'white', borderRadius:12 }}>No bookings found</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'.5rem' }}>
          {bookings.map(b => (
            <div key={b.id} style={{ background:'white', borderRadius:12, padding:'1rem', border:'1px solid #E2E8F0' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'.375rem' }}>
                <div style={{ fontWeight:700, color:NAVY, fontSize:'.9375rem' }}>{b.patient_name}</div>
                <span style={{ background:STATUS_COLOR[b.status]||'#E2E8F0', color:'white', fontSize:'.6875rem', fontWeight:700, padding:'2px 8px', borderRadius:99 }}>
                  {STATUS_LABEL[b.status]||b.status}
                </span>
              </div>
              <div style={{ fontSize:'.8125rem', color:'#6B7280', display:'flex', gap:'1rem', flexWrap:'wrap' }}>
                <span>{b.consultation_type === 'video' ? '📹' : '📞'} {b.consultation_type}</span>
                <span>📅 {b.appointment_date} {b.appointment_time}</span>
                {b.provider_name && <span>👤 {b.provider_name}</span>}
              </div>
              {b.reason && <div style={{ fontSize:'.8125rem', color:'#374151', marginTop:'.375rem' }}>{b.reason}</div>}
              {b.status === 'confirmed' && (
                <button onClick={() => cancelBooking(b.id)} disabled={cancelling === b.id}
                  style={{ marginTop:'.5rem', background:'#FEF2F2', color:'#DC2626', border:'1px solid #FECACA', borderRadius:6, padding:'5px 12px', fontSize:'.75rem', fontWeight:700, cursor:'pointer', fontFamily:FF }}>
                  {cancelling === b.id ? 'Cancelling…' : 'Cancel booking'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Research tab ──────────────────────────────────────────────────────────────

function ResearchTab() {
  const [data, setData]           = useState([])
  const [totalComplete, setTotalComplete] = useState(0)
  const [loading, setLoading]     = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [allCount, consentList] = await Promise.all([
          getCompleteCount(),
          getResearchConsentedConsults(),
        ])
        setTotalComplete(allCount || 0)
        setData(consentList || [])
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  function ageBucket(dob) {
    if (!dob) return 'Unknown'
    const age = Math.floor((Date.now() - new Date(dob)) / (365.25 * 86400000))
    if (age < 18) return '<18'
    if (age < 30) return '18–29'
    if (age < 45) return '30–44'
    if (age < 60) return '45–59'
    if (age < 75) return '60–74'
    return '75+'
  }

  function tally(arr, keyFn) {
    const map = {}
    arr.forEach(r => {
      const k = keyFn(r) || 'Unknown'
      map[k] = (map[k] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }

  const n = data.length
  const consentRate = totalComplete > 0 ? Math.round((n / totalComplete) * 100) : 0
  const accCount    = data.filter(r => r.acc_eligible === 'yes').length
  const avgDur      = data.filter(r => r.consultation_duration_seconds).length
    ? Math.round(data.filter(r => r.consultation_duration_seconds).reduce((a, r) => a + r.consultation_duration_seconds / 60, 0) / data.filter(r => r.consultation_duration_seconds).length)
    : 0

  const ageRows     = tally(data, r => ageBucket(r.patient_dob))
  const locationRows = tally(data, r => r.patient_location || null)
  const typeRows    = tally(data, r => r.consultation_type ? r.consultation_type.replace(/_/g,' ') : null)

  const complaintRows = tally(data, r => {
    const c = (r.chief_complaint || '').toLowerCase()
    if (!c) return 'Unknown'
    if (c.includes('cold') || c.includes('flu') || c.includes('cough') || c.includes('throat') || c.includes('sinus')) return 'Cold / flu / URTI'
    if (c.includes('pain')) return 'Pain'
    if (c.includes('certificate') || c.includes('sick note') || c.includes('fit note')) return 'Sick certificate'
    if (c.includes('script') || c.includes('prescri') || c.includes('medication') || c.includes('refill')) return 'Prescription / repeat'
    if (c.includes('rash') || c.includes('skin') || c.includes('itch')) return 'Skin / rash'
    if (c.includes('mental') || c.includes('anxiety') || c.includes('depress') || c.includes('stress')) return 'Mental health'
    if (c.includes('uti') || c.includes('urin')) return 'UTI / urinary'
    if (c.includes('injury') || c.includes('wound') || c.includes('sprain')) return 'Injury'
    if (c.includes('referral')) return 'Referral'
    return 'Other'
  })

  const workRows = tally(data, r => {
    const w = r.work_capacity
    if (!w) return null
    const map = { fit:'Fit for work', fit_with_restrictions:'Fit with restrictions', unfit:'Unfit for work', not_applicable:'Not applicable' }
    return map[w] || w
  }).filter(([k]) => k !== 'Unknown')

  function Bar({ rows, total, color }) {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {rows.slice(0, 6).map(([label, count]) => {
          const pct = total ? Math.round((count / total) * 100) : 0
          return (
            <div key={label}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3, fontSize:'.75rem', fontFamily:FF }}>
                <span style={{ color:'#374151', fontWeight:500 }}>{label}</span>
                <span style={{ color:'#6B7280' }}>{count} ({pct}%)</span>
              </div>
              <div style={{ height:6, borderRadius:3, background:'#F3F4F6', overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:3, background:color, width:`${pct}%`, transition:'width .5s' }} />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  async function exportCsv() {
    setExporting(true)
    try {
      const header = 'Record ID,Date,Age Bucket,Location,Type,Chief Complaint,ACC,Duration (min),Work Capacity'
      const rows = data.map(r => {
        const rawComplaint = (r.chief_complaint || '').replace(/"/g, "'").substring(0, 80)
        const dur = r.consultation_duration_seconds ? Math.round(r.consultation_duration_seconds / 60) : ''
        return [
          r.id.slice(0, 8),
          r.created_at ? r.created_at.slice(0, 10) : '',
          ageBucket(r.patient_dob),
          r.patient_location || '',
          r.consultation_type || '',
          `"${rawComplaint}"`,
          r.acc_eligible === 'yes' ? 'Yes' : 'No',
          dur,
          r.work_capacity || '',
        ].join(',')
      })
      const csv = [header, ...rows].join('\n')
      const filename = `tere_research_${new Date().toISOString().slice(0,10)}_confidential.csv`
      const url = URL.createObjectURL(new Blob([csv], { type:'text/csv' }))
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
      // Audit log
      try {
        const { supabase } = await import('../../lib/supabase')
        await supabase.from('audit_log').insert({
          action: 'research_data_export',
          actor_id: sessionStorage.getItem('providerId'),
          metadata: { record_count: data.length, filename },
        })
      } catch {}
    } catch {}
    setExporting(false)
  }

  return (
    <div style={{ padding:'1rem', fontFamily:FF }}>

      {/* Privacy notice */}
      <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:12, padding:'1rem', marginBottom:'1rem', display:'flex', gap:10 }}>
        <span style={{ fontSize:'1.125rem', flexShrink:0 }}>🔒</span>
        <div style={{ fontSize:'.8125rem', color:'#78350F', lineHeight:1.6 }}>
          <strong style={{ display:'block', marginBottom:2 }}>De-identified data only</strong>
          All records on this page are anonymised. No names, NHI numbers, or direct identifiers are shown. Access is restricted to authorised Tere Health administrators.
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'3rem' }}>
          <div className="spinner" style={{ borderColor:'rgba(11,110,118,.15)', borderTopColor:TEAL }} />
        </div>
      ) : (
        <>
          {/* Consent overview */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'.5rem', marginBottom:'1rem' }}>
            {[
              { label:'Consented',   value:n,            color:TEAL,      icon:'✓' },
              { label:'Consent rate', value:`${consentRate}%`, color:'#059669', icon:'📊' },
              { label:'Avg duration', value:`${avgDur}m`, color:'#7C3AED', icon:'⏱' },
            ].map(s => (
              <div key={s.label} style={{ background:'white', borderRadius:12, padding:'.875rem .5rem', textAlign:'center', border:`1px solid ${s.color}22` }}>
                <div style={{ fontSize:'1.625rem', fontWeight:800, color:s.color, lineHeight:1 }}>{s.value}</div>
                <div style={{ fontSize:'.5875rem', color:'#6B7280', fontWeight:600, textTransform:'uppercase', marginTop:4, letterSpacing:'.04em' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* ACC quick pill */}
          <div style={{ display:'flex', gap:'.5rem', marginBottom:'1rem', flexWrap:'wrap' }}>
            <span style={{ background:'#D4EEF0', color:TEAL, fontWeight:700, fontSize:'.75rem', padding:'4px 10px', borderRadius:99 }}>
              ACC {n > 0 ? Math.round((accCount/n)*100) : 0}% ({accCount})
            </span>
          </div>

          {/* Demographics */}
          <div style={{ background:'white', borderRadius:12, padding:'1.25rem', border:'1px solid #E2E8F0', marginBottom:'.75rem' }}>
            <div style={{ fontWeight:700, color:NAVY, marginBottom:'1rem', fontSize:'.9375rem' }}>Age distribution</div>
            <Bar rows={ageRows} total={n} color={TEAL} />
          </div>

          {/* Chief complaints */}
          <div style={{ background:'white', borderRadius:12, padding:'1.25rem', border:'1px solid #E2E8F0', marginBottom:'.75rem' }}>
            <div style={{ fontWeight:700, color:NAVY, marginBottom:'1rem', fontSize:'.9375rem' }}>Chief complaints</div>
            <Bar rows={complaintRows} total={n} color='#7C3AED' />
          </div>

          {/* Consultation type */}
          {typeRows.length > 0 && (
            <div style={{ background:'white', borderRadius:12, padding:'1.25rem', border:'1px solid #E2E8F0', marginBottom:'.75rem' }}>
              <div style={{ fontWeight:700, color:NAVY, marginBottom:'1rem', fontSize:'.9375rem' }}>Consultation type</div>
              <Bar rows={typeRows} total={n} color='#059669' />
            </div>
          )}

          {/* Work capacity */}
          {workRows.length > 0 && (
            <div style={{ background:'white', borderRadius:12, padding:'1.25rem', border:'1px solid #E2E8F0', marginBottom:'.75rem' }}>
              <div style={{ fontWeight:700, color:NAVY, marginBottom:'1rem', fontSize:'.9375rem' }}>Work capacity outcomes</div>
              <Bar rows={workRows} total={workRows.reduce((a,[,c])=>a+c,0)} color='#F59E0B' />
            </div>
          )}

          {/* Location / region */}
          {locationRows.filter(([k])=>k!=='Unknown').length > 0 && (
            <div style={{ background:'white', borderRadius:12, padding:'1.25rem', border:'1px solid #E2E8F0', marginBottom:'.75rem' }}>
              <div style={{ fontWeight:700, color:NAVY, marginBottom:'1rem', fontSize:'.9375rem' }}>Patient location</div>
              <Bar rows={locationRows.filter(([k])=>k!=='Unknown')} total={locationRows.filter(([k])=>k!=='Unknown').reduce((a,[,c])=>a+c,0)} color='#D97706' />
            </div>
          )}

          {/* Recent records — anonymised */}
          <div style={{ background:'white', borderRadius:12, border:'1px solid #E2E8F0', overflow:'hidden', marginBottom:'.75rem' }}>
            <div style={{ padding:'.875rem 1rem', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontWeight:700, color:NAVY, fontSize:'.9375rem' }}>Anonymised records ({n})</span>
              <button onClick={exportCsv} disabled={exporting || n === 0}
                style={{ background:TEAL, border:'none', color:'white', borderRadius:8, padding:'6px 12px', fontFamily:FF, fontWeight:700, fontSize:'.75rem', cursor:'pointer', minHeight:36, opacity:(exporting||n===0)?0.5:1 }}>
                {exporting ? '…' : '↓ CSV'}
              </button>
            </div>
            {data.slice(0, 20).map((r, i) => (
              <div key={r.id} style={{ padding:'.75rem 1rem', borderBottom:i<Math.min(data.length,20)-1?'1px solid #F9FAFB':'none', display:'flex', alignItems:'center', gap:'.5rem', flexWrap:'wrap' }}>
                <span style={{ fontFamily:'monospace', fontSize:'.75rem', color:'#9CA3AF', flexShrink:0 }}>{r.id.slice(0,8)}</span>
                <span style={{ fontSize:'.75rem', color:'#6B7280' }}>{r.created_at?.slice(0,10)}</span>
                <span style={{ background:'#F3F4F6', color:'#374151', fontSize:'.6875rem', padding:'2px 6px', borderRadius:4 }}>{ageBucket(r.patient_dob)}</span>
                {r.patient_location && <span style={{ fontSize:'.6875rem', color:'#6B7280' }}>{r.patient_location}</span>}
                {r.acc_eligible === 'yes' && <span style={{ background:'#D4EEF0', color:TEAL, fontSize:'.6875rem', fontWeight:700, padding:'1px 5px', borderRadius:4 }}>ACC</span>}
                <span style={{ fontSize:'.75rem', color:'#374151', flex:1, minWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {(r.chief_complaint || '—').substring(0, 60)}
                </span>
              </div>
            ))}
            {n > 20 && (
              <div style={{ padding:'.75rem 1rem', textAlign:'center', color:'#9CA3AF', fontSize:'.75rem', borderTop:'1px solid #F3F4F6' }}>
                + {n - 20} more records — export CSV for full dataset
              </div>
            )}
          </div>

          {/* Research partnership */}
          <div style={{ background:'linear-gradient(135deg, #0D2B45, #0B6E76)', borderRadius:12, padding:'1.25rem', marginBottom:'1rem', textAlign:'center' }}>
            <div style={{ fontSize:'1.5rem', marginBottom:'.5rem' }}>🔬</div>
            <div style={{ fontWeight:700, color:'white', fontSize:'.9375rem', marginBottom:'.375rem' }}>Research partnerships</div>
            <div style={{ color:'rgba(212,238,240,.75)', fontSize:'.8125rem', lineHeight:1.6, marginBottom:'1rem' }}>
              Our anonymised dataset covers primary care telehealth consultations across New Zealand. Interested in partnering for research?
            </div>
            <a href="mailto:research@tere.health" style={{ display:'inline-block', background:'rgba(255,255,255,.15)', color:'white', borderRadius:8, padding:'8px 18px', fontSize:'.875rem', fontWeight:600, textDecoration:'none', fontFamily:FF }}>
              research@tere.health
            </a>
          </div>

          {n === 0 && (
            <div style={{ textAlign:'center', padding:'2rem', background:'white', borderRadius:12, border:'1px solid #E2E8F0' }}>
              <div style={{ fontSize:'2rem', marginBottom:'.75rem' }}>🔬</div>
              <div style={{ fontWeight:700, color:NAVY, marginBottom:'.25rem' }}>No consented records yet</div>
              <div style={{ color:'#9CA3AF', fontSize:'.875rem' }}>Patients who consent to research during triage will appear here after their consultation is finalised.</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Bottom nav ────────────────────────────────────────────────────────────────

function BottomNav({ tab, setTab, dashBadge }) {
  const items = [
    { id:'dashboard', icon:'🏠', label:'Dashboard', badge:dashBadge },
    { id:'analytics', icon:'📊', label:'Analytics',  badge:0 },
    { id:'bookings',  icon:'📆', label:'Bookings',   badge:0 },
    { id:'schedule',  icon:'📅', label:'Schedule',   badge:0 },
    { id:'research',  icon:'🔬', label:'Research',   badge:0 },
    { id:'settings',  icon:'⚙️', label:'Settings',   badge:0 },
  ]
  return (
    <div style={{ background:NAVY, display:'flex', flexShrink:0, minHeight:60, paddingBottom:'env(safe-area-inset-bottom)', borderTop:'1px solid rgba(255,255,255,.08)' }}>
      {items.map(item => (
        <button key={item.id} onClick={() => setTab(item.id)}
          style={{ flex:1, background:'none', border:'none', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, padding:'8px 4px', position:'relative', color:tab===item.id?'#D4EEF0':'rgba(255,255,255,.4)', minHeight:60 }}>
          {item.badge > 0 && (
            <span style={{ position:'absolute', top:6, right:'50%', marginRight:-16, background:'#DC2626', color:'white', fontSize:'.625rem', fontWeight:700, padding:'1px 5px', borderRadius:99, minWidth:16, textAlign:'center', lineHeight:1.4 }}>
              {item.badge > 9 ? '9+' : item.badge}
            </span>
          )}
          <span style={{ fontSize:'1.2rem', lineHeight:1 }}>{item.icon}</span>
          <span style={{ fontSize:'.5625rem', fontWeight:tab===item.id?700:400, letterSpacing:'.01em', fontFamily:FF, whiteSpace:'nowrap', overflow:'hidden', maxWidth:'100%' }}>{item.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminApp() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!sessionStorage.getItem('clinicianAuth')) {
      const saved = getSaved()
      if (saved) { restoreDevice(saved) }
      else { navigate('/clinician?redirect=/admin'); return }
    }
    if (sessionStorage.getItem('providerIsAdmin') !== 'true') {
      navigate('/clinician?redirect=/admin')
    }
  }, [navigate])

  const providerId  = sessionStorage.getItem('providerId')
  const displayName = sessionStorage.getItem('providerDisplayName') || 'Admin'

  const [tab, setTab]               = useState('dashboard')
  const [isOnline, setIsOnline]     = useState(navigator.onLine)
  const [dashBadge, setDashBadge]   = useState(0)

  // Register push
  useEffect(() => {
    if (providerId) registerPush(providerId)
  }, [providerId])

  // Online/offline
  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Dashboard badge (queue + pending approvals)
  useEffect(() => {
    async function loadBadge() {
      try {
        const [qRes] = await Promise.all([
          apiFetch('/api/get-queue').then(r => r.json()),
        ])
        const qCount = (qRes.consultations || []).filter(c => ['waiting','vitals_requested','vitals_complete','ready'].includes(c.status)).length
        const rxCount = await getPendingPrescriptionsCount().catch(() => 0)
        setDashBadge(qCount + rxCount)
      } catch {}
    }
    loadBadge()
    const interval = setInterval(loadBadge, 20000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{ height:'100dvh', background:'#F7F5F0', display:'flex', flexDirection:'column', fontFamily:FF, userSelect:'none', WebkitUserSelect:'none', position:'relative', overflow:'hidden' }}>

      {!isOnline && (
        <div style={{ background:'#DC2626', color:'white', textAlign:'center', padding:'.5rem', fontSize:'.8125rem', fontWeight:600, flexShrink:0 }}>
          ⚠️ No connection — data may be stale
        </div>
      )}

      {/* Top bar */}
      <div style={{ background:NAVY, paddingTop:'calc(.875rem + env(safe-area-inset-top))', paddingBottom:'.875rem', paddingLeft:'1.25rem', paddingRight:'1.25rem', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'.75rem' }}>
          <span style={{ fontFamily:'Cormorant Garamond,Georgia,serif', fontStyle:'italic', color:'#D4EEF0', fontSize:'1.4rem', letterSpacing:'.06em' }}>Tere</span>
          <span style={{ background:'rgba(255,255,255,.12)', color:'rgba(255,255,255,.75)', fontSize:'.6875rem', fontWeight:700, padding:'3px 9px', borderRadius:99, letterSpacing:'.06em', textTransform:'uppercase' }}>Admin</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={() => navigate('/provider')}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:8, background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.18)', color:'rgba(255,255,255,.85)', fontSize:'.75rem', cursor:'pointer', fontFamily:FF, minHeight:34 }}>
            🩺 Provider
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto', minHeight:0, WebkitOverflowScrolling:'touch' }}>
        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'analytics' && <AnalyticsTab />}
        {tab === 'bookings'  && <BookingsTab />}
        {tab === 'schedule'  && <AdminSchedule embedded />}
        {tab === 'employers' && <EmployersTab />}
        {tab === 'research'  && <ResearchTab />}
        {tab === 'settings'  && <SettingsTab navigate={navigate} displayName={displayName} />}
      </div>

      {/* Bottom nav — in-flow, no position:fixed */}
      <BottomNav tab={tab} setTab={setTab} dashBadge={dashBadge} />
    </div>
  )
}
