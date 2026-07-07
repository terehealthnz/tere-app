import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getWaitlist, markWaitlistNotified, providerDisplayName, updateConsultation, updateProvider, getAccPendingConsultations, getPendingPrescriptions, createEmployer, updateEmployer, addEmployerEmployees, getEmployers, getEmployerEmployeeCounts, getRecentConsultations, getPaymentPendingConsultations, getRatedConsultations, getRecallPendingConsultations, getCompleteSince, getFlaggedNotes, getConsultsByEmployer, getProviderPeriodConsults } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'
import AdminSchedule  from '../../pages/clinician/AdminSchedule'
import AdminPayroll   from '../../pages/clinician/AdminPayroll'
import AdminResearch  from '../../pages/clinician/AdminResearch'
import AdminPatients  from '../../pages/clinician/AdminPatients'

function useClinicianAuth() {
  const navigate = useNavigate()
  useEffect(() => { if (!sessionStorage.getItem('clinicianAuth')) navigate('/clinician?redirect=/clinician/admin') }, [navigate])
}

// Top-right nav on Admin — a hamburger that expands into a floating menu of
// admin destinations. Replaces a horizontal row of buttons that was starting
// to feel cramped on narrow viewports and expected more entries (validation
// dashboard was the trigger). Menu closes on outside click or a nav choice.
function AdminNavMenu({ navigate }) {
  const [open, setOpen] = useState(false)
  const menuRef = React.useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (!menuRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const go = (path) => { setOpen(false); navigate(path) }
  const signOut = () => {
    setOpen(false)
    localStorage.removeItem('tere_portal')
    sessionStorage.clear()
    navigate('/clinician')
  }

  const items = [
    { label: '← Queue',           onClick: () => go('/provider') },
    { label: '← Dashboard',       onClick: () => go('/clinician/dashboard') },
    { label: '🔬 Validation',     onClick: () => go('/vitals-validate/dashboard') },
    { label: '🚩 Feature flags',  onClick: () => go('/clinician/admin/flags') },
    { label: 'Sign out',          onClick: signOut, danger: true },
  ]

  return (
    <div ref={menuRef} style={{ position:'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        style={{
          background:'rgba(255,255,255,.1)', border:'none', color:'rgba(255,255,255,.9)',
          padding:'8px 14px', borderRadius:6, cursor:'pointer', fontSize:'.9rem',
          display:'flex', alignItems:'center', gap:'.4rem', fontWeight:500,
        }}>
        <span aria-hidden="true" style={{ fontSize:'1rem', lineHeight:1 }}>☰</span>
        <span>Menu</span>
      </button>
      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 8px)', right:0, minWidth:200,
          background:'white', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,.18)',
          border:'1px solid #E2E8F0', overflow:'hidden', zIndex:1000,
        }}>
          {items.map((it, i) => (
            <button key={i} onClick={it.onClick}
              style={{
                width:'100%', textAlign:'left', background:'none', border:'none',
                padding:'.75rem 1rem', cursor:'pointer',
                fontFamily:'Plus Jakarta Sans, sans-serif', fontSize:'.9rem',
                color: it.danger ? '#B91C1C' : '#0D2B45', fontWeight:500,
                borderTop: i === 0 ? 'none' : '1px solid #F1F5F9',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ProvidersPanel() {
  const [providers, setProviders] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(null)

  async function load() {
    try {
      const { supabase } = await import('../../lib/supabase')
      const { data, error } = await supabase
        .from('providers')
        .select('*')
        .order('first_name')
      if (error) throw error
      setProviders(data || [])
    } catch { setProviders([]) }
    setLoading(false)
  }

  async function update(id, updates) {
    setSaving(id)
    try {
      await updateProvider(id, updates)
      setProviders(ps => ps.map(p => p.id === id ? { ...p, ...updates } : p))
    } catch {}
    setSaving(null)
  }

  React.useEffect(() => { load() }, [])

  const card = { background:'white', borderRadius:12, padding:'1.5rem', marginBottom:'1rem', border:'1px solid #E2E8F0' }

  return (
    <div style={card}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
        <div>
          <div style={{ fontSize:'1rem', fontWeight:700, color:'#0D2B45', marginBottom:'.25rem' }}>Providers</div>
          <div style={{ fontSize:'.875rem', color:'#6B7280' }}>Manage clinician availability and access</div>
        </div>
        <button onClick={load} style={{ background:'#F0F9FA', border:'none', color:'#0B6E76', padding:'6px 12px', borderRadius:6, cursor:'pointer', fontSize:'.8125rem', fontWeight:600 }}>↻ Refresh</button>
      </div>
      {loading ? (
        <div style={{ textAlign:'center', padding:'2rem', color:'#9CA3AF' }}>Loading…</div>
      ) : providers.length === 0 ? (
        <div style={{ textAlign:'center', padding:'1.5rem', color:'#9CA3AF' }}>No providers found. Run supabase-providers-migration.sql first.</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'.75rem' }}>
          {providers.map(p => {
            const displayName = providerDisplayName(p)
            return (
              <div key={p.id} style={{ background:'#F8FAFC', borderRadius:8, padding:'1rem 1.25rem', border:`1px solid ${p.is_active ? '#E2E8F0' : '#FECACA'}`, opacity: p.is_active ? 1 : 0.6 }}>
                <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:'1rem', alignItems:'start', flexWrap:'wrap' }}>
                  <div style={{ width:44, height:44, borderRadius:'50%', background:p.color||'#0B6E76', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:700, fontSize:'1.1rem', flexShrink:0 }}>
                    {p.first_name[0]}{p.last_name[0]}
                  </div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:'.9375rem', color:'#0D2B45', marginBottom:2 }}>
                      {displayName}
                      {p.is_admin && <span style={{ marginLeft:8, background:'#EDE9FE', color:'#6D28D9', fontSize:'.75rem', fontWeight:700, padding:'1px 6px', borderRadius:99 }}>Admin</span>}
                      {!p.is_provider && <span style={{ marginLeft:8, background:'#F3F4F6', color:'#6B7280', fontSize:'.75rem', fontWeight:700, padding:'1px 6px', borderRadius:99 }}>Non-clinical</span>}
                    </div>
                    <div style={{ fontSize:'.8125rem', color:'#6B7280', marginBottom:'.5rem' }}>
                      {p.specialty || (p.is_admin && !p.is_provider ? 'Admin only' : 'Clinician')}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:'.5rem' }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background:p.is_available ? '#059669' : '#D1D5DB' }} />
                      <span style={{ fontSize:'.8125rem', color:p.is_available ? '#059669' : '#9CA3AF', minWidth:70 }}>
                        {p.is_available ? 'Available' : 'Unavailable'}
                      </span>
                      {p.is_provider && (
                        <input
                          value={p.availability_message || ''}
                          onChange={e => setProviders(ps => ps.map(q => q.id === p.id ? { ...q, availability_message: e.target.value } : q))}
                          placeholder="Availability message…"
                          style={{ flex:1, border:'1px solid #E2E8F0', borderRadius:6, padding:'4px 8px', fontSize:'.8125rem', fontFamily:'Plus Jakarta Sans, sans-serif' }}
                        />
                      )}
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'row', flexWrap:'wrap', gap:'.375rem', alignItems:'center', gridColumn:'1 / -1' }}>
                    {p.is_provider && (
                      <button onClick={() => update(p.id, { is_available: !p.is_available })}
                        disabled={saving === p.id}
                        style={{ background: p.is_available ? '#FEE2E2' : '#F0FDF4', color: p.is_available ? '#DC2626' : '#059669', border:'none', padding:'5px 12px', borderRadius:6, cursor:'pointer', fontSize:'.8125rem', fontWeight:600, fontFamily:'Plus Jakarta Sans, sans-serif', whiteSpace:'nowrap' }}>
                        {saving === p.id ? '…' : p.is_available ? 'Set unavailable' : 'Set available'}
                      </button>
                    )}
                    {p.is_provider && (
                      <button onClick={() => update(p.id, { availability_message: p.availability_message || '' })}
                        disabled={saving === p.id}
                        style={{ background:'#F0F9FA', color:'#0B6E76', border:'none', padding:'4px 10px', borderRadius:6, cursor:'pointer', fontSize:'.75rem', fontFamily:'Plus Jakarta Sans, sans-serif', whiteSpace:'nowrap' }}>
                        Save message
                      </button>
                    )}
                    <button onClick={() => update(p.id, { is_active: !p.is_active })}
                      disabled={saving === p.id}
                      style={{ background:'none', border:`1px solid ${p.is_active ? '#FECACA' : '#D1FAE5'}`, color:p.is_active ? '#DC2626' : '#059669', padding:'4px 10px', borderRadius:6, cursor:'pointer', fontSize:'.75rem', fontFamily:'Plus Jakarta Sans, sans-serif', whiteSpace:'nowrap' }}>
                      {p.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ConsultationLog() {
  const [rows, setRows] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')

  React.useEffect(() => {
    async function load() {
      try {
        const data = await getRecentConsultations(100)
        setRows(data || [])
      } catch(e) { console.error(e) }
      setLoading(false)
    }
    load()
  }, [])

  function exportAccCsv() {
    const accRows = rows.filter(r => r.acc_eligible === 'yes' && r.status === 'complete')
    if (!accRows.length) { alert('No completed ACC consultations found'); return }
    const header = 'Date,Patient NHI,Chief Complaint,Read Code,Duration (min),Amount NZD'
    const csv = [header, ...accRows.map(r => [
      new Date(r.created_at).toLocaleDateString('en-NZ'),
      r.patient_nhi || '',
      `"${(r.chief_complaint || '').replace(/"/g, '""')}"`,
      r.acc_read_code || '',
      r.consultation_duration_seconds ? Math.round(r.consultation_duration_seconds / 60) : '',
      (r.payment_amount_nzd || (r.payment_amount ? r.payment_amount / 100 : '')).toString(),
    ].join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `acc-export-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    return !q || `${r.patient_first_name} ${r.patient_last_name} ${r.chief_complaint}`.toLowerCase().includes(q)
  })

  const card = { background:'white', borderRadius:12, padding:'1.5rem', marginBottom:'1rem', border:'1px solid #E2E8F0' }
  const statusColor = { complete:'#059669', in_progress:'#0B6E76', waiting:'#D97706', cancelled:'#DC2626' }

  return (
    <div style={card}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem', flexWrap:'wrap', gap:'.75rem' }}>
        <div>
          <div style={{ fontSize:'1rem', fontWeight:700, color:'#0D2B45', marginBottom:'.25rem' }}>Consultation log</div>
          <div style={{ fontSize:'.875rem', color:'#6B7280' }}>Last 100 consultations</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <button onClick={exportAccCsv} style={{ background:'#EFF6FF', color:'#1D4ED8', border:'1px solid #BFDBFE', padding:'7px 12px', borderRadius:8, cursor:'pointer', fontSize:'.8125rem', fontWeight:600, fontFamily:'Plus Jakarta Sans, sans-serif', whiteSpace:'nowrap' }}>↓ ACC export</button>
          <input
            placeholder="Search patient or complaint…"
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding:'7px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:'.875rem', fontFamily:'Plus Jakarta Sans, sans-serif', width:200 }}
          />
        </div>
      </div>
      {loading ? (
        <div style={{ textAlign:'center', padding:'2rem', color:'#9CA3AF' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'2rem', color:'#9CA3AF' }}>No consultations found</div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.875rem' }}>
            <thead>
              <tr style={{ borderBottom:'2px solid #E2E8F0' }}>
                {['Date','Patient','Complaint','Status','Duration','Payment','ACC'].map(h => (
                  <th key={h} style={{ padding:'6px 8px', textAlign:'left', fontSize:'.75rem', fontWeight:700, color:'#6B7280', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{ borderBottom:'1px solid #F3F4F6' }}>
                  <td style={{ padding:'8px', whiteSpace:'nowrap', fontSize:'.8125rem' }}>{new Date(r.created_at).toLocaleDateString('en-NZ', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</td>
                  <td style={{ padding:'8px', fontWeight:600 }}>{r.patient_first_name} {r.patient_last_name}</td>
                  <td style={{ padding:'8px', color:'#6B7280', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.chief_complaint}</td>
                  <td style={{ padding:'8px' }}>
                    <span style={{ background: statusColor[r.status] ? statusColor[r.status]+'20' : '#F3F4F6', color: statusColor[r.status] || '#6B7280', fontWeight:600, fontSize:'.75rem', padding:'2px 8px', borderRadius:99 }}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding:'8px' }}>{r.consultation_duration_seconds ? `${Math.round(r.consultation_duration_seconds/60)} min` : '—'}</td>
                  <td style={{ padding:'8px', color:'#059669', fontWeight:600 }}>{r.payment_amount ? `${(r.payment_amount/100).toFixed(0)}` : '—'}</td>
                  <td style={{ padding:'8px' }}>{r.acc_eligible === 'yes' ? <span style={{ color:'#0B6E76', fontWeight:600 }}>✓</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FailedPayments() {
  const [rows, setRows] = React.useState([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function load() {
      try {
        // Server filter returns payment_pending consults (payment_intent_id !== null
        // AND status != 'complete'). Client trims 'waiting' + first 50 to match
        // the historic UI slice.
        const rows = await getPaymentPendingConsultations()
        setRows((rows || []).filter(r => r.status !== 'waiting').slice(0, 50))
      } catch(e) { console.error(e) }
      setLoading(false)
    }
    load()
  }, [])

  const card = { background:'white', borderRadius:12, padding:'1.5rem', marginBottom:'1rem', border:'1px solid #E2E8F0' }

  return (
    <div style={card}>
      <div style={{ marginBottom:'1.25rem' }}>
        <div style={{ fontSize:'1rem', fontWeight:700, color:'#0D2B45', marginBottom:'.25rem' }}>Failed / uncaptured payments</div>
        <div style={{ fontSize:'.875rem', color:'#6B7280' }}>Payment holds that were never captured</div>
      </div>
      {loading ? (
        <div style={{ textAlign:'center', padding:'2rem', color:'#9CA3AF' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign:'center', padding:'1.5rem', color:'#9CA3AF' }}>✓ No failed or uncaptured payments</div>
      ) : (
        <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.875rem' }}>
          <thead>
            <tr style={{ borderBottom:'2px solid #E2E8F0' }}>
              {['Date','Patient','Amount','Status','Payment ID'].map(h => (
                <th key={h} style={{ padding:'6px 8px', textAlign:'left', fontSize:'.75rem', fontWeight:700, color:'#6B7280', textTransform:'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderBottom:'1px solid #F3F4F6' }}>
                <td style={{ padding:'8px', fontSize:'.8125rem' }}>{new Date(r.created_at).toLocaleDateString('en-NZ', { day:'numeric', month:'short' })}</td>
                <td style={{ padding:'8px', fontWeight:600 }}>{r.patient_first_name} {r.patient_last_name}</td>
                <td style={{ padding:'8px', color:'#DC2626', fontWeight:600 }}>{r.payment_amount ? `${(r.payment_amount/100).toFixed(0)}` : '—'}</td>
                <td style={{ padding:'8px', color:'#D97706', fontWeight:600 }}>{r.status}</td>
                <td style={{ padding:'8px', fontSize:'.75rem', color:'#9CA3AF', fontFamily:'monospace' }}>{r.payment_intent_id?.slice(0,20)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}

function OutstandingReferrals() {
  const [rows, setRows] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [filter, setFilter] = React.useState('all')
  const [saving, setSaving] = React.useState(null)
  const now = Date.now()

  async function load() {
    setLoading(true)
    try {
      const { getRadiologyReferrals } = await import('../../lib/supabase')
      const data = await getRadiologyReferrals({ filter: 'active' })
      setRows(data)
    } catch { setRows([]) }
    setLoading(false)
  }

  async function updateStatus(id, status, notes) {
    setSaving(id)
    try {
      const { updateRadiologyReferral } = await import('../../lib/supabase')
      const updates = { referral_status: status }
      if (status === 'result_received') updates.result_received_at = new Date().toISOString()
      if (notes !== undefined) updates.result_notes = notes
      await updateRadiologyReferral(id, updates)
      setRows(rs => status === 'result_received' || status === 'dna'
        ? rs.filter(r => r.id !== id)
        : rs.map(r => r.id === id ? { ...r, ...updates } : r)
      )
    } catch {}
    setSaving(null)
  }

  React.useEffect(() => { load() }, [])

  const daysOut = (created) => Math.floor((now - new Date(created).getTime()) / 86400000)

  const filtered = filter === 'all' ? rows : rows.filter(r => (r.provider_id || '') === filter)
  const providers = [...new Set(rows.map(r => r.provider_name).filter(Boolean))]
  const card = { background:'white', borderRadius:12, padding:'1.5rem', marginBottom:'1rem', border:'1px solid #E2E8F0' }

  return (
    <div style={card}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem', flexWrap:'wrap', gap:'.75rem' }}>
        <div>
          <div style={{ fontSize:'1rem', fontWeight:700, color:'#0D2B45', marginBottom:'.25rem' }}>🩻 Outstanding referrals</div>
          <div style={{ fontSize:'.875rem', color:'#6B7280' }}>Radiology referrals awaiting results</div>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <div style={{ background: rows.length > 0 ? '#FEF3C7' : '#F0F9FA', color: rows.length > 0 ? '#92400E' : '#0B6E76', fontWeight:700, fontSize:'1.1rem', padding:'.25rem .75rem', borderRadius:8 }}>{rows.length}</div>
          <button onClick={load} style={{ background:'#F0F9FA', border:'none', color:'#0B6E76', padding:'6px 12px', borderRadius:6, cursor:'pointer', fontSize:'.8125rem', fontWeight:600 }}>↻</button>
        </div>
      </div>

      {providers.length > 1 && (
        <div style={{ display:'flex', gap:6, marginBottom:'1rem', flexWrap:'wrap' }}>
          <button onClick={() => setFilter('all')} style={{ padding:'4px 10px', borderRadius:99, border:'1.5px solid', borderColor:filter==='all'?'#0B6E76':'#E2E8F0', background:filter==='all'?'#0B6E76':'white', color:filter==='all'?'white':'#6B7280', fontSize:'.75rem', fontWeight:600, cursor:'pointer' }}>All providers</button>
          {[...new Set(rows.map(r => ({ id: r.provider_id, name: r.provider_name })).filter(p => p.id).map(p => JSON.stringify(p)))].map(ps => {
            const p = JSON.parse(ps)
            return <button key={p.id} onClick={() => setFilter(p.id)} style={{ padding:'4px 10px', borderRadius:99, border:'1.5px solid', borderColor:filter===p.id?'#0B6E76':'#E2E8F0', background:filter===p.id?'#0B6E76':'white', color:filter===p.id?'white':'#6B7280', fontSize:'.75rem', fontWeight:600, cursor:'pointer' }}>{p.name}</button>
          })}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:'2rem', color:'#9CA3AF' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'1.5rem', color:'#9CA3AF' }}>✓ No outstanding referrals</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'.75rem' }}>
          {filtered.map(r => {
            const days = daysOut(r.created_at)
            const isUrgent = r.urgency?.toLowerCase().includes('urgent')
            const overdue = isUrgent ? days > 7 : days > 21
            return (
              <div key={r.id} style={{ background: overdue ? '#FFF5F5' : '#F8FAFC', borderRadius:8, padding:'1rem 1.25rem', border:`1px solid ${overdue ? '#FECACA' : '#E2E8F0'}` }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:'1rem', alignItems:'start' }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:'.5rem', marginBottom:'.25rem', flexWrap:'wrap' }}>
                      <span style={{ fontWeight:700, fontSize:'.9375rem', color:'#0D2B45' }}>{r.patient_name}</span>
                      <span style={{ background:isUrgent?'#FEE2E2':'#F0F9FA', color:isUrgent?'#DC2626':'#0B6E76', fontSize:'.75rem', fontWeight:700, padding:'1px 8px', borderRadius:99 }}>{r.urgency || 'Routine'}</span>
                      {overdue && <span style={{ background:'#FEE2E2', color:'#DC2626', fontSize:'.75rem', fontWeight:700, padding:'1px 8px', borderRadius:99 }}>⚠ Overdue</span>}
                    </div>
                    <div style={{ fontSize:'.875rem', color:'#6B7280', marginBottom:'.25rem' }}>
                      {r.investigation}{r.body_part ? ` — ${r.body_part}` : ''} · {r.facility_name || 'Facility TBC'}
                    </div>
                    <div style={{ fontSize:'.8125rem', color:'#9CA3AF' }}>
                      {r.provider_name} · Sent {new Date(r.created_at).toLocaleDateString('en-NZ', { day:'numeric', month:'short' })} ({days}d ago)
                      {r.patient_nhi && ` · NHI: ${r.patient_nhi}`}
                    </div>
                    {r.result_notes && (
                      <div style={{ marginTop:'.5rem', fontSize:'.8125rem', color:'#0B6E76', background:'#F0F9FA', padding:'4px 8px', borderRadius:4 }}>{r.result_notes}</div>
                    )}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'.375rem', alignItems:'flex-end' }}>
                    <button onClick={() => updateStatus(r.id, 'result_received')} disabled={saving===r.id}
                      style={{ background:'#F0FDF4', color:'#059669', border:'1px solid #BBF7D0', padding:'5px 10px', borderRadius:6, cursor:'pointer', fontSize:'.75rem', fontWeight:600, fontFamily:'Plus Jakarta Sans, sans-serif', whiteSpace:'nowrap' }}>
                      {saving===r.id ? '…' : '✓ Result received'}
                    </button>
                    <button onClick={() => updateStatus(r.id, 'dna')} disabled={saving===r.id}
                      style={{ background:'none', border:'1px solid #E2E8F0', color:'#9CA3AF', padding:'4px 8px', borderRadius:6, cursor:'pointer', fontSize:'.75rem', fontFamily:'Plus Jakarta Sans, sans-serif', whiteSpace:'nowrap' }}>
                      DNA / cancelled
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function OutstandingPrescriptions() {
  const [rows, setRows] = React.useState([])
  const [loading, setLoading] = React.useState(true)

  async function load() {
    setLoading(true)
    try {
      const { supabase } = await import('../../lib/supabase')
      const since = new Date()
      since.setDate(since.getDate() - 30)
      const { data } = await supabase
        .from('prescriptions')
        .select('*')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
      setRows(data || [])
    } catch { setRows([]) }
    setLoading(false)
  }

  React.useEffect(() => { load() }, [])

  const card = { background:'white', borderRadius:12, padding:'1.5rem', marginBottom:'1rem', border:'1px solid #E2E8F0' }

  return (
    <div style={card}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem', flexWrap:'wrap', gap:'.75rem' }}>
        <div>
          <div style={{ fontSize:'1rem', fontWeight:700, color:'#0D2B45', marginBottom:'.25rem' }}>💊 Recent prescriptions</div>
          <div style={{ fontSize:'.875rem', color:'#6B7280' }}>Prescriptions issued in the last 30 days</div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <div style={{ background:'#F0F9FA', color:'#0B6E76', fontWeight:700, fontSize:'1.1rem', padding:'.25rem .75rem', borderRadius:8 }}>{rows.length}</div>
          <button onClick={load} style={{ background:'#F0F9FA', border:'none', color:'#0B6E76', padding:'6px 12px', borderRadius:6, cursor:'pointer', fontSize:'.8125rem', fontWeight:600 }}>↻</button>
        </div>
      </div>
      {loading ? (
        <div style={{ textAlign:'center', padding:'2rem', color:'#9CA3AF' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign:'center', padding:'1.5rem', color:'#9CA3AF' }}>No prescriptions in the last 30 days</div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.875rem' }}>
            <thead>
              <tr style={{ borderBottom:'2px solid #E2E8F0' }}>
                {['Date','Patient','Medication','Pharmacy','Provider','Status'].map(h => (
                  <th key={h} style={{ padding:'6px 8px', textAlign:'left', fontSize:'.75rem', fontWeight:700, color:'#6B7280', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderBottom:'1px solid #F3F4F6' }}>
                  <td style={{ padding:'8px', fontSize:'.8125rem', whiteSpace:'nowrap' }}>{new Date(r.created_at).toLocaleDateString('en-NZ', { day:'numeric', month:'short' })}</td>
                  <td style={{ padding:'8px', fontWeight:600 }}>{r.patient_name}</td>
                  <td style={{ padding:'8px', color:'#5B21B6', fontWeight:500 }}>{r.drug}</td>
                  <td style={{ padding:'8px', color:'#6B7280', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.pharmacy_name || '—'}</td>
                  <td style={{ padding:'8px', color:'#6B7280', fontSize:'.8125rem' }}>{r.provider_name || '—'}</td>
                  <td style={{ padding:'8px' }}>
                    <span style={{ background:r.delivery_status==='sent'?'#F0FDF4':'#FEF2F2', color:r.delivery_status==='sent'?'#059669':'#DC2626', fontSize:'.75rem', fontWeight:600, padding:'2px 8px', borderRadius:99 }}>
                      {r.delivery_status || 'pending'}
                    </span>
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

function RatingsPanel() {
  const [rows, setRows] = React.useState([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function load() {
      try {
        const rows = await getRatedConsultations()
        setRows((rows || []).slice(0, 100))
      } catch { setRows([]) }
      setLoading(false)
    }
    load()
  }, [])

  const avg = rows.length ? (rows.reduce((a, r) => a + r.rating, 0) / rows.length).toFixed(1) : '—'
  const flagged = rows.filter(r => r.rating <= 2)

  const byProvider = {}
  rows.forEach(r => {
    const p = r.provider_display_name || 'Unknown'
    if (!byProvider[p]) byProvider[p] = { total: 0, count: 0 }
    byProvider[p].total += r.rating
    byProvider[p].count++
  })

  const card = { background: 'white', borderRadius: 12, padding: '1.5rem', marginBottom: '1rem', border: '1px solid #E2E8F0' }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0D2B45', marginBottom: '.25rem' }}>★ Patient ratings</div>
          <div style={{ fontSize: '.875rem', color: '#6B7280' }}>Post-consultation satisfaction scores</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ background: '#FFFBEB', color: '#92400E', fontWeight: 700, fontSize: '1.5rem', padding: '.25rem .875rem', borderRadius: 8 }}>{avg} ★</div>
          <div style={{ fontSize: '.8125rem', color: '#9CA3AF' }}>{rows.length} reviews</div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '1.5rem', color: '#9CA3AF' }}>No ratings yet — rating link is included in every patient summary email.</div>
      ) : (
        <>
          {/* Per-provider averages */}
          {Object.keys(byProvider).length > 1 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem' }}>
              {Object.entries(byProvider).map(([name, { total, count }]) => (
                <div key={name} style={{ background: '#F8FAFC', borderRadius: 8, padding: '.5rem .875rem', fontSize: '.8125rem' }}>
                  <span style={{ fontWeight: 600, color: '#0D2B45' }}>{name.split(' ').pop()}</span>
                  <span style={{ color: '#9CA3AF' }}> — </span>
                  <span style={{ fontWeight: 700, color: '#D97706' }}>{(total/count).toFixed(1)} ★</span>
                  <span style={{ color: '#9CA3AF', fontSize: '.75rem' }}> ({count})</span>
                </div>
              ))}
            </div>
          )}

          {/* Flagged low ratings */}
          {flagged.length > 0 && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '.75rem 1rem', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 700, fontSize: '.875rem', color: '#DC2626', marginBottom: '.5rem' }}>⚠ {flagged.length} low rating{flagged.length > 1 ? 's' : ''} (1-2 stars) — review recommended</div>
              {flagged.map(r => (
                <div key={r.id} style={{ fontSize: '.8125rem', color: '#7F1D1D', marginBottom: '.25rem' }}>
                  <strong>{r.patient_first_name} {r.patient_last_name}</strong> — {r.rating}★{r.rating_comment ? `: "${r.rating_comment}"` : ''}
                </div>
              ))}
            </div>
          )}

          {/* Recent comments */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.625rem' }}>
            {rows.filter(r => r.rating_comment).slice(0, 8).map(r => (
              <div key={r.id} style={{ background: r.rating <= 2 ? '#FFF5F5' : '#F8FAFC', borderRadius: 8, padding: '.75rem 1rem', border: `1px solid ${r.rating <= 2 ? '#FECACA' : '#E2E8F0'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.25rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '.8125rem', color: '#0D2B45' }}>{r.patient_first_name} {r.patient_last_name}</span>
                  <span style={{ color: '#F59E0B', fontSize: '.875rem' }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                  {r.provider_display_name && <span style={{ fontSize: '.75rem', color: '#9CA3AF' }}>· {r.provider_display_name}</span>}
                </div>
                <div style={{ fontSize: '.8125rem', color: '#374151', lineHeight: 1.5 }}>"{r.rating_comment}"</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function AnalyticsPanel() {
  const [range, setRange] = React.useState(7) // days
  const [data, setData] = React.useState([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const since = new Date()
        since.setDate(since.getDate() - range)
        const rows = await getCompleteSince(
          since.toISOString(),
          'created_at, started_at, completed_at, consultation_duration_seconds, payment_amount, is_acc, acc_eligible, status, payment_intent_id',
        )
        setData(rows || [])
      } catch(e) { console.error(e) }
      setLoading(false)
    }
    load()
  }, [range])

  // Aggregate by day
  const byDay = {}
  data.forEach(r => {
    const day = r.created_at?.slice(0,10)
    if (!day) return
    if (!byDay[day]) byDay[day] = { consultations:0, totalWait:0, totalDuration:0, income:0, accPending:0, totalHours:0 }
    byDay[day].consultations++
    // Wait time = started_at - created_at
    if (r.started_at && r.created_at) {
      byDay[day].totalWait += (new Date(r.started_at) - new Date(r.created_at)) / 60000
    }
    if (r.consultation_duration_seconds) {
      byDay[day].totalDuration += r.consultation_duration_seconds / 60
      byDay[day].totalHours += r.consultation_duration_seconds / 3600
    }
    if (r.payment_amount) byDay[day].income += r.payment_amount / 100
    if (r.acc_eligible === 'yes' || r.is_acc) byDay[day].accPending += 62
  })

  const days = Object.keys(byDay).sort()
  const totalIncome = days.reduce((a, d) => a + byDay[d].income, 0)
  const totalACC = days.reduce((a, d) => a + byDay[d].accPending, 0)
  const totalConsults = days.reduce((a, d) => a + byDay[d].consultations, 0)
  const avgWait = totalConsults ? (days.reduce((a,d) => a + byDay[d].totalWait,0) / totalConsults).toFixed(0) : 0
  const avgDuration = totalConsults ? (days.reduce((a,d) => a + byDay[d].totalDuration,0) / totalConsults).toFixed(0) : 0

  const card = { background:'white', borderRadius:12, padding:'1.5rem', marginBottom:'1rem', border:'1px solid #E2E8F0' }

  return (
    <div style={card}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem', flexWrap:'wrap', gap:'.75rem' }}>
        <div>
          <div style={{ fontSize:'1rem', fontWeight:700, color:'#0D2B45', marginBottom:'.25rem' }}>Analytics</div>
          <div style={{ fontSize:'.875rem', color:'#6B7280' }}>Completed consultations</div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {[1,7,30].map(d => (
            <button key={d} onClick={() => setRange(d)} style={{
              padding:'5px 12px', borderRadius:6, border:'1.5px solid',
              borderColor: range===d ? '#0B6E76' : '#E2E8F0',
              background: range===d ? '#0B6E76' : 'white',
              color: range===d ? 'white' : '#6B7280',
              fontWeight:600, fontSize:'.8125rem', cursor:'pointer'
            }}>{d === 1 ? 'Today' : d === 7 ? '7 days' : '30 days'}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'2rem', color:'#9CA3AF' }}>Loading…</div>
      ) : totalConsults === 0 ? (
        <div style={{ textAlign:'center', padding:'2rem', color:'#9CA3AF' }}>No completed consultations in this period</div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:10, marginBottom:'1.5rem' }}>
            {[
              { label:'Consultations', value: totalConsults, unit:'' },
              { label:'Avg wait time', value: avgWait, unit:' min' },
              { label:'Avg visit length', value: avgDuration, unit:' min' },
              { label:'Income collected', value: `${totalIncome.toFixed(0)}`, unit:'' },
              { label:'ACC pending', value: `${totalACC.toFixed(0)}`, unit:'', note:'est.' },
            ].map(({ label, value, unit, note }) => (
              <div key={label} style={{ background:'#F8FAFC', borderRadius:8, padding:'1rem', textAlign:'center' }}>
                <div style={{ fontSize:'.75rem', fontWeight:700, color:'#6B7280', textTransform:'uppercase', marginBottom:4 }}>{label}</div>
                <div style={{ fontSize:'1.5rem', fontWeight:700, color:'#0D2B45' }}>{value}{unit}</div>
                {note && <div style={{ fontSize:'.7rem', color:'#9CA3AF' }}>{note}</div>}
              </div>
            ))}
          </div>

          {/* Daily breakdown */}
          <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.875rem' }}>
            <thead>
              <tr style={{ borderBottom:'2px solid #E2E8F0' }}>
                {['Date','Consults','Avg wait','Avg duration','Hours worked','Income','ACC pending'].map(h => (
                  <th key={h} style={{ padding:'6px 8px', textAlign:'left', fontSize:'.75rem', fontWeight:700, color:'#6B7280', textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map(day => {
                const d = byDay[day]
                const avgW = d.consultations ? (d.totalWait / d.consultations).toFixed(0) : '—'
                const avgDur = d.consultations ? (d.totalDuration / d.consultations).toFixed(0) : '—'
                return (
                  <tr key={day} style={{ borderBottom:'1px solid #F3F4F6' }}>
                    <td style={{ padding:'8px', fontWeight:600 }}>{new Date(day).toLocaleDateString('en-NZ', { weekday:'short', day:'numeric', month:'short' })}</td>
                    <td style={{ padding:'8px' }}>{d.consultations}</td>
                    <td style={{ padding:'8px' }}>{avgW} min</td>
                    <td style={{ padding:'8px' }}>{avgDur} min</td>
                    <td style={{ padding:'8px' }}>{d.totalHours.toFixed(1)} hrs</td>
                    <td style={{ padding:'8px', color:'#059669', fontWeight:600 }}>${d.income.toFixed(0)}</td>
                    <td style={{ padding:'8px', color:'#0B6E76' }}>${d.accPending.toFixed(0)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </>
      )}
    </div>
  )
}

function FlaggedNotes() {
  const navigate = useNavigate()
  const [rows, setRows] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)

  async function load() {
    try {
      const data = await getFlaggedNotes('id, created_at, patient_first_name, patient_last_name, chief_complaint, acc_eligible, notes_flagged, notes_finalised_at, clinical_notes, outcome')
      setRows(data || [])
    } catch { setError(true) }
    setLoading(false)
  }

  async function markReviewed(id) {
    try {
      await updateConsultation(id, { notes_flagged: false })
      setRows(rs => rs.filter(r => r.id !== id))
    } catch {}
  }

  React.useEffect(() => { load() }, [])

  const card = { background: 'white', borderRadius: 12, padding: '1.5rem', marginBottom: '1rem', border: '1px solid #E2E8F0' }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0D2B45', marginBottom: '.25rem' }}>🚩 Flagged notes</div>
          <div style={{ fontSize: '.875rem', color: '#6B7280' }}>Consultations flagged for clinical review</div>
        </div>
        <div style={{ background: rows.length > 0 ? '#FEE2E2' : '#F0F9FA', color: rows.length > 0 ? '#DC2626' : '#0B6E76', fontWeight: 700, fontSize: '1.25rem', padding: '.375rem .875rem', borderRadius: 8 }}>{rows.length}</div>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF' }}>Loading…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '1.5rem', color: '#9CA3AF' }}>Run migration to enable notes management.</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '1.5rem', color: '#9CA3AF' }}>✓ No flagged notes</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          {rows.map(r => (
            <div key={r.id} style={{ background: '#FFF5F5', borderRadius: 8, padding: '1rem 1.25rem', border: '1px solid #FECACA', display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: '.25rem', fontSize: '.9375rem' }}>{r.patient_first_name} {r.patient_last_name}</div>
                <div style={{ fontSize: '.875rem', color: '#6B7280', marginBottom: '.25rem' }}>
                  {new Date(r.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })} · {r.chief_complaint}
                </div>
                {r.outcome && <div style={{ fontSize: '.8125rem', color: '#0B6E76', fontWeight: 600 }}>Outcome: {r.outcome.replace(/_/g, ' ')}</div>}
                {r.notes_finalised_at && <div style={{ fontSize: '.75rem', color: '#9CA3AF' }}>Finalised {new Date(r.notes_finalised_at).toLocaleString('en-NZ')}</div>}
              </div>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button onClick={() => navigate(`/clinician/notes/${r.id}`)}
                  style={{ background: '#0D2B45', color: 'white', border: 'none', padding: '7px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '.8125rem', fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  View
                </button>
                <button onClick={() => markReviewed(r.id)}
                  style={{ background: '#F0FDF4', color: '#059669', border: '1px solid #BBF7D0', padding: '7px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '.8125rem', fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  ✓ Reviewed
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PendingApprovalsPanel() {
  const [items, setItems] = React.useState({ prescriptions: [], referrals: [], acc: [] })
  const [loading, setLoading] = React.useState(true)

  async function load() {
    setLoading(true)
    try {
      const { getRadiologyReferrals } = await import('../../lib/supabase')
      const [rx, refs, acc] = await Promise.all([
        getPendingPrescriptions('id, created_at, patient_name, drafted_by_name, provider_name, drug, urgency'),
        getRadiologyReferrals({ filter: 'pending_approval', columns: 'id, created_at, patient_name, drafted_by_name, provider_name, investigation, urgency' }),
        getAccPendingConsultations('id, created_at, patient_first_name, patient_last_name, provider_display_name'),
      ])
      setItems({ prescriptions: rx || [], referrals: refs || [], acc: acc || [] })
    } catch {}
    setLoading(false)
  }

  React.useEffect(() => { load() }, [])

  const total = items.prescriptions.length + items.referrals.length + items.acc.length
  const card = { background: 'white', borderRadius: 12, padding: '1.5rem', marginBottom: '1rem', border: '1px solid #E2E8F0' }

  function Row({ type, id, created_at, patient, drafter, description }) {
    const mins = Math.floor((Date.now() - new Date(created_at)) / 60000)
    const isUrgent = mins > 30
    const typeColors = { Prescription: ['#EDE9FE','#7C3AED'], Referral: ['#FEF3C7','#92400E'], ACC: ['#D1FAE5','#065F46'] }
    const [bg, fg] = typeColors[type] || ['#F3F4F6','#6B7280']
    return (
      <tr style={{ borderBottom: '1px solid #F3F4F6', background: isUrgent ? '#FFF5F5' : 'transparent' }}>
        <td style={{ padding: '8px', whiteSpace: 'nowrap', fontSize: '.8125rem', color: isUrgent ? '#DC2626' : '#9CA3AF', fontWeight: isUrgent ? 700 : 400 }}>
          {mins}m {isUrgent && '⚠'}
        </td>
        <td style={{ padding: '8px' }}><span style={{ background: bg, color: fg, fontSize: '.6875rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>{type}</span></td>
        <td style={{ padding: '8px', fontWeight: 600 }}>{patient}</td>
        <td style={{ padding: '8px', fontSize: '.875rem', color: '#6B7280' }}>{description}</td>
        <td style={{ padding: '8px', fontSize: '.8125rem', color: '#9CA3AF' }}>{drafter}</td>
      </tr>
    )
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0D2B45', marginBottom: '.25rem' }}>⏳ Pending approvals</div>
          <div style={{ fontSize: '.875rem', color: '#6B7280' }}>Prescriptions, referrals and ACC claims awaiting supervisor sign-off</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ background: total > 0 ? '#FEE2E2' : '#F0F9FA', color: total > 0 ? '#DC2626' : '#0B6E76', fontWeight: 700, fontSize: '1.1rem', padding: '.25rem .75rem', borderRadius: 8 }}>{total}</div>
          <button onClick={load} style={{ background: '#F0F9FA', border: 'none', color: '#0B6E76', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '.8125rem', fontWeight: 600 }}>↻</button>
        </div>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF' }}>Loading…</div>
      ) : total === 0 ? (
        <div style={{ textAlign: 'center', padding: '1.5rem', color: '#9CA3AF' }}>✓ No pending approvals</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E2E8F0' }}>
                {['Waiting','Type','Patient','Details','Drafted by'].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: '.75rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.prescriptions.map(r => <Row key={r.id} type="Prescription" id={r.id} created_at={r.created_at} patient={r.patient_name} drafter={r.drafted_by_name || r.provider_name} description={r.drug} />)}
              {items.referrals.map(r => <Row key={r.id} type="Referral" id={r.id} created_at={r.created_at} patient={r.patient_name} drafter={r.drafted_by_name || r.provider_name} description={`${r.investigation}${r.urgency ? ` (${r.urgency})` : ''}`} />)}
              {items.acc.map(r => <Row key={r.id} type="ACC" id={r.id} created_at={r.created_at} patient={`${r.patient_first_name} ${r.patient_last_name}`} drafter={r.provider_display_name || '—'} description="ACC claim" />)}
            </tbody>
          </table>
          {items.prescriptions.concat(items.referrals, items.acc).some(r => Math.floor((Date.now() - new Date(r.created_at)) / 60000) > 30) && (
            <div style={{ marginTop: '.75rem', padding: '.625rem 1rem', background: '#FEF2F2', borderRadius: 6, fontSize: '.8125rem', color: '#991B1B' }}>
              ⚠ Items pending &gt;30 min require urgent attention. Supervisors can approve from the Dashboard → Approvals tab.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CareersPanel() {
  const [listings, setListings] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [showForm, setShowForm] = React.useState(false)
  const [editId, setEditId] = React.useState(null)
  const [saving, setSaving] = React.useState(false)
  const blank = { title: '', location: '', employment_type: 'contractor', short_description: '', full_description: '', requirements: '', is_active: true }
  const [form, setForm] = React.useState(blank)

  async function load() {
    setLoading(true)
    try {
      const { supabase } = await import('../../lib/supabase')
      const { data } = await supabase.from('job_listings').select('*').order('created_at', { ascending: false })
      setListings(data || [])
    } catch { setListings([]) }
    setLoading(false)
  }

  async function save() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const { createJobListing, updateJobListing } = await import('../../lib/supabase')
      const payload = {
        title: form.title, location: form.location, employment_type: form.employment_type,
        short_description: form.short_description, full_description: form.full_description,
        is_active: form.is_active,
        requirements: form.requirements ? form.requirements.split('\n').map(r => r.trim()).filter(Boolean) : [],
      }
      if (editId) {
        await updateJobListing(editId, payload)
      } else {
        await createJobListing(payload)
      }
      setForm(blank); setEditId(null); setShowForm(false)
      await load()
    } catch(e) { console.error(e) }
    setSaving(false)
  }

  async function toggleActive(id, val) {
    try {
      const { updateJobListing } = await import('../../lib/supabase')
      await updateJobListing(id, { is_active: val })
      setListings(ls => ls.map(l => l.id === id ? { ...l, is_active: val } : l))
    } catch {}
  }

  async function remove(id) {
    if (!window.confirm('Delete this listing?')) return
    try {
      const { deleteJobListing } = await import('../../lib/supabase')
      await deleteJobListing(id)
      setListings(ls => ls.filter(l => l.id !== id))
    } catch {}
  }

  function startEdit(listing) {
    setForm({ ...listing, requirements: (listing.requirements || []).join('\n') })
    setEditId(listing.id)
    setShowForm(true)
  }

  React.useEffect(() => { load() }, [])

  const card = { background: 'white', borderRadius: 12, padding: '1.5rem', marginBottom: '1rem', border: '1px solid #E2E8F0' }
  const inp = { border: '1.5px solid #E2E8F0', borderRadius: 6, padding: '7px 10px', fontSize: '.875rem', fontFamily: 'Plus Jakarta Sans, sans-serif', outline: 'none', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0D2B45', marginBottom: '.25rem' }}>Job listings</div>
          <div style={{ fontSize: '.875rem', color: '#6B7280' }}>Active listings appear on the public /careers page</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={load} style={{ background: '#F0F9FA', border: 'none', color: '#0B6E76', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '.8125rem', fontWeight: 600 }}>↻</button>
          <button onClick={() => { setForm(blank); setEditId(null); setShowForm(s => !s) }} style={{ background: '#0B6E76', border: 'none', color: 'white', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '.8125rem', fontWeight: 600 }}>
            {showForm && !editId ? 'Cancel' : '+ New listing'}
          </button>
        </div>
      </div>

      {showForm && (
        <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '1rem 1.25rem', marginBottom: '1.25rem', border: '1px solid #E2E8F0' }}>
          <div style={{ fontWeight: 700, fontSize: '.9rem', color: '#0D2B45', marginBottom: '.75rem' }}>{editId ? 'Edit listing' : 'New listing'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', marginBottom: '.5rem' }}>
            <input style={inp} placeholder="Job title *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <input style={inp} placeholder="Location (e.g. Remote/Nationwide)" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            <select style={inp} value={form.employment_type} onChange={e => setForm(f => ({ ...f, employment_type: e.target.value }))}>
              <option value="contractor">Contractor</option>
              <option value="part-time">Part-time</option>
              <option value="full-time">Full-time</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.875rem', color: '#374151', fontFamily: 'Plus Jakarta Sans, sans-serif', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
              Active (visible on /careers)
            </label>
          </div>
          <input style={{ ...inp, marginBottom: '.5rem' }} placeholder="Short description" value={form.short_description} onChange={e => setForm(f => ({ ...f, short_description: e.target.value }))} />
          <textarea style={{ ...inp, resize: 'vertical', minHeight: 80, marginBottom: '.5rem' }} placeholder="Full description" value={form.full_description} onChange={e => setForm(f => ({ ...f, full_description: e.target.value }))} />
          <textarea style={{ ...inp, resize: 'vertical', minHeight: 80, marginBottom: '.75rem' }} placeholder="Requirements — one per line" value={form.requirements} onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))} />
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button onClick={save} disabled={saving || !form.title.trim()} style={{ background: '#0B6E76', color: 'white', border: 'none', padding: '7px 16px', borderRadius: 6, cursor: 'pointer', fontSize: '.875rem', fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              {saving ? 'Saving…' : editId ? 'Update' : 'Create'}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null); setForm(blank) }} style={{ background: 'none', border: '1px solid #E2E8F0', color: '#6B7280', padding: '7px 16px', borderRadius: 6, cursor: 'pointer', fontSize: '.875rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF' }}>Loading…</div>
      ) : listings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF' }}>No job listings yet. Create one above or run the careers migration SQL.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          {listings.map(l => (
            <div key={l.id} style={{ background: l.is_active ? '#F8FAFC' : '#FFF5F5', borderRadius: 8, padding: '1rem 1.25rem', border: `1px solid ${l.is_active ? '#E2E8F0' : '#FECACA'}`, opacity: l.is_active ? 1 : 0.75 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.25rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '.9375rem', color: '#0D2B45' }}>{l.title}</span>
                    <span style={{ background: l.is_active ? '#D1FAE5' : '#FEE2E2', color: l.is_active ? '#065F46' : '#991B1B', fontSize: '.6875rem', fontWeight: 700, padding: '1px 7px', borderRadius: 99 }}>
                      {l.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <span style={{ background: '#F3F4F6', color: '#6B7280', fontSize: '.6875rem', fontWeight: 600, padding: '1px 7px', borderRadius: 99 }}>{l.employment_type}</span>
                  </div>
                  <div style={{ fontSize: '.8125rem', color: '#6B7280' }}>
                    {l.location}{l.short_description ? ` · ${l.short_description}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '.375rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={() => startEdit(l)} style={{ background: '#F0F9FA', color: '#0B6E76', border: 'none', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '.75rem', fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Edit</button>
                  <button onClick={() => toggleActive(l.id, !l.is_active)} style={{ background: 'none', border: `1px solid ${l.is_active ? '#FECACA' : '#BBF7D0'}`, color: l.is_active ? '#DC2626' : '#059669', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '.75rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                    {l.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => remove(l.id)} style={{ background: 'none', border: '1px solid #FECACA', color: '#DC2626', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '.75rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EmployersPanel() {
  const [employers, setEmployers] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [showAdd, setShowAdd] = React.useState(false)
  const [newEmp, setNewEmp] = React.useState({ company_name: '', contact_email: '', monthly_rate_per_employee: '', contract_start: '' })
  const [saving, setSaving] = React.useState(false)
  const [uploadingFor, setUploadingFor] = React.useState(null)
  const [employeeCounts, setEmployeeCounts] = React.useState({})

  async function load() {
    setLoading(true)
    try {
      const emps = await getEmployers({ includeInactive: true })
      setEmployers(emps || [])
      if (emps?.length) {
        const map = await getEmployerEmployeeCounts()
        setEmployeeCounts(map || {})
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
      setNewEmp({ company_name: '', contact_email: '', monthly_rate_per_employee: '', contract_start: '' })
      setShowAdd(false)
      await load()
    } catch(e) { console.error(e) }
    setSaving(false)
  }

  async function toggleActive(id, val) {
    try {
      await updateEmployer(id, { is_active: val })
      setEmployers(es => es.map(e => e.id === id ? { ...e, is_active: val } : e))
    } catch {}
  }

  function parseCsv(text) {
    const lines = text.trim().split('\n').filter(Boolean)
    if (lines.length < 2) return []
    const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g,'_'))
    return lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g,''))
      const row = {}
      header.forEach((h, i) => { row[h] = cols[i] || '' })
      return row
    }).filter(r => r.first_name || r.firstname)
  }

  async function uploadCsv(file, employerId) {
    setUploadingFor(employerId)
    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (!rows.length) { alert('No valid rows found. CSV needs columns: first_name, last_name (and optionally dob, employee_id)'); setUploadingFor(null); return }
      const inserts = rows.map(r => ({
        employer_id: employerId,
        first_name: r.first_name || r.firstname || '',
        last_name: r.last_name || r.lastname || r.surname || '',
        dob: r.dob || null,
        employee_id: r.employee_id || r.staff_id || null,
      })).filter(r => r.first_name && r.last_name)
      await addEmployerEmployees(inserts)
      setEmployeeCounts(c => ({ ...c, [employerId]: (c[employerId] || 0) + inserts.length }))
      alert(`✓ ${inserts.length} employees imported`)
    } catch(e) { console.error(e); alert('Upload failed') }
    setUploadingFor(null)
  }

  async function downloadReport(emp) {
    try {
      const since = new Date(); since.setDate(1); since.setHours(0,0,0,0)
      const consults = await getConsultsByEmployer(emp.id, since.toISOString())
      if (!consults?.length) { alert('No consultations this month for this employer'); return }
      const header = 'Patient,Date,Type,Code\n'
      const rows = consults.map(c => `"${c.patient_first_name} ${c.patient_last_name}","${new Date(c.created_at).toLocaleDateString('en-NZ')}","${c.consultation_type||''}","${c.billing_code||''}"`)
      const csv = header + rows.join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${emp.company_name.replace(/\s+/g,'_')}_report_${new Date().toISOString().slice(0,7)}.csv`
      a.click(); URL.revokeObjectURL(url)
    } catch(e) { console.error(e) }
  }

  React.useEffect(() => { load() }, [])

  const card = { background: 'white', borderRadius: 12, padding: '1.5rem', marginBottom: '1rem', border: '1px solid #E2E8F0' }
  const inp = { border: '1.5px solid #E2E8F0', borderRadius: 6, padding: '7px 10px', fontSize: '.875rem', fontFamily: 'Plus Jakarta Sans, sans-serif', outline: 'none' }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0D2B45', marginBottom: '.25rem' }}>Employer accounts</div>
          <div style={{ fontSize: '.875rem', color: '#6B7280' }}>Companies whose employees get consultations at no cost</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={load} style={{ background: '#F0F9FA', border: 'none', color: '#0B6E76', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '.8125rem', fontWeight: 600 }}>↻</button>
          <button onClick={() => setShowAdd(s => !s)} style={{ background: '#0B6E76', border: 'none', color: 'white', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '.8125rem', fontWeight: 600 }}>
            {showAdd ? 'Cancel' : '+ Add employer'}
          </button>
        </div>
      </div>

      {showAdd && (
        <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '1rem 1.25rem', marginBottom: '1rem', border: '1px solid #E2E8F0' }}>
          <div style={{ fontWeight: 700, fontSize: '.9rem', color: '#0D2B45', marginBottom: '.75rem' }}>New employer</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', marginBottom: '.5rem' }}>
            <input style={inp} placeholder="Company name *" value={newEmp.company_name} onChange={e => setNewEmp(n => ({ ...n, company_name: e.target.value }))} />
            <input style={inp} placeholder="Contact email" value={newEmp.contact_email} onChange={e => setNewEmp(n => ({ ...n, contact_email: e.target.value }))} />
            <input style={inp} placeholder="Monthly rate per employee ($)" value={newEmp.monthly_rate_per_employee} onChange={e => setNewEmp(n => ({ ...n, monthly_rate_per_employee: e.target.value }))} />
            <input style={inp} type="date" placeholder="Contract start" value={newEmp.contract_start} onChange={e => setNewEmp(n => ({ ...n, contract_start: e.target.value }))} />
          </div>
          <button onClick={addEmployer} disabled={saving || !newEmp.company_name.trim()} style={{ background: '#0B6E76', color: 'white', border: 'none', padding: '7px 16px', borderRadius: 6, cursor: 'pointer', fontSize: '.875rem', fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {saving ? 'Saving…' : 'Add employer'}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF' }}>Loading…</div>
      ) : employers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF' }}>
          No employer accounts yet. Run supabase-employer-migration.sql first, then add one above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          {employers.map(emp => (
            <div key={emp.id} style={{ background: emp.is_active ? '#F8FAFC' : '#FFF5F5', borderRadius: 8, padding: '1rem 1.25rem', border: `1px solid ${emp.is_active ? '#E2E8F0' : '#FECACA'}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.25rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '.9375rem', color: '#0D2B45' }}>{emp.company_name}</span>
                    <span style={{ background: emp.is_active ? '#D1FAE5' : '#FEE2E2', color: emp.is_active ? '#065F46' : '#991B1B', fontSize: '.6875rem', fontWeight: 700, padding: '1px 7px', borderRadius: 99 }}>
                      {emp.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div style={{ fontSize: '.8125rem', color: '#6B7280' }}>
                    {emp.contact_email && <span>{emp.contact_email} · </span>}
                    {emp.monthly_rate_per_employee && <span>${emp.monthly_rate_per_employee}/employee/month · </span>}
                    <span style={{ fontWeight: 600, color: '#0B6E76' }}>{employeeCounts[emp.id] || 0} employees</span>
                    {emp.contract_start && <span> · Since {new Date(emp.contract_start).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '.375rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <label style={{ background: '#EFF6FF', color: '#2563EB', border: 'none', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '.75rem', fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif', whiteSpace: 'nowrap' }}>
                    {uploadingFor === emp.id ? 'Importing…' : '↑ Upload CSV'}
                    <input type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) uploadCsv(e.target.files[0], emp.id); e.target.value = '' }} disabled={uploadingFor === emp.id} />
                  </label>
                  <button onClick={() => downloadReport(emp)} style={{ background: '#F0FDF4', color: '#059669', border: '1px solid #BBF7D0', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '.75rem', fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif', whiteSpace: 'nowrap' }}>
                    ↓ Month report
                  </button>
                  <button onClick={() => toggleActive(emp.id, !emp.is_active)} style={{ background: 'none', border: `1px solid ${emp.is_active ? '#FECACA' : '#BBF7D0'}`, color: emp.is_active ? '#DC2626' : '#059669', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '.75rem', fontFamily: 'Plus Jakarta Sans, sans-serif', whiteSpace: 'nowrap' }}>
                    {emp.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: '1rem', padding: '.75rem', background: '#F8FAFC', borderRadius: 6, fontSize: '.8125rem', color: '#6B7280' }}>
        CSV format: <code style={{ fontFamily: 'monospace' }}>first_name,last_name,dob,employee_id</code> — header row required, dob and employee_id optional.
      </div>
    </div>
  )
}

function AppointmentsPanel() {
  const [rows, setRows] = React.useState([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function load() {
      try {
        const { getUpcomingAppointments } = await import('../../lib/supabase')
        const data = await getUpcomingAppointments()
        setRows(data)
      } catch { setRows([]) }
      setLoading(false)
    }
    load()
  }, [])

  const card = { background:'white', borderRadius:12, padding:'1.5rem', marginBottom:'1rem', border:'1px solid #E2E8F0' }

  async function updateStatus(id, status) {
    try {
      const { updateAppointmentStatus } = await import('../../lib/supabase')
      await updateAppointmentStatus(id, status)
      setRows(rs => rs.filter(r => r.id !== id))
    } catch {}
  }

  return (
    <div style={card}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
        <div>
          <div style={{ fontSize:'1rem', fontWeight:700, color:'#0D2B45', marginBottom:'.25rem' }}>Upcoming appointments</div>
          <div style={{ fontSize:'.875rem', color:'#6B7280' }}>Next 7 days — pending and confirmed</div>
        </div>
        <span style={{ background:'#EFF6FF', color:'#1D4ED8', fontWeight:700, fontSize:'.875rem', padding:'3px 10px', borderRadius:99 }}>{rows.length}</span>
      </div>
      {loading ? (
        <div style={{ textAlign:'center', padding:'1.5rem', color:'#9CA3AF' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign:'center', padding:'1.5rem', color:'#9CA3AF' }}>No upcoming appointments</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'.5rem' }}>
          {rows.map(r => (
            <div key={r.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'.75rem 1rem', background:'#F8FAFC', borderRadius:8, border:'1px solid #E2E8F0', gap:'1rem', flexWrap:'wrap' }}>
              <div>
                <div style={{ fontWeight:600, fontSize:'.9rem', color:'#0D2B45' }}>{r.patient_name}</div>
                <div style={{ fontSize:'.8125rem', color:'#6B7280' }}>{new Date(r.appointment_date).toLocaleDateString('en-NZ', { weekday:'short', day:'numeric', month:'short' })} at {r.slot_time?.slice(0,5)} · {r.reason || 'General'}</div>
              </div>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <span style={{ background: r.status === 'confirmed' ? '#F0FDF4' : '#FEF3C7', color: r.status === 'confirmed' ? '#059669' : '#D97706', fontWeight:600, fontSize:'.75rem', padding:'2px 8px', borderRadius:99 }}>{r.status}</span>
                {r.status === 'pending' && (
                  <button onClick={() => updateStatus(r.id, 'confirmed')} style={{ background:'#0B6E76', color:'white', border:'none', padding:'4px 10px', borderRadius:6, cursor:'pointer', fontSize:'.75rem', fontWeight:600, fontFamily:'Plus Jakarta Sans, sans-serif' }}>Confirm</button>
                )}
                <button onClick={() => updateStatus(r.id, 'cancelled')} style={{ background:'#FEE2E2', color:'#DC2626', border:'none', padding:'4px 10px', borderRadius:6, cursor:'pointer', fontSize:'.75rem', fontWeight:600, fontFamily:'Plus Jakarta Sans, sans-serif' }}>Cancel</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RecallsPanel() {
  const [rows, setRows] = React.useState([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function load() {
      try {
        const rows = await getRecallPendingConsultations()
        setRows((rows || []).slice(0, 50))
      } catch { setRows([]) }
      setLoading(false)
    }
    load()
  }, [])

  const card = { background:'white', borderRadius:12, padding:'1.5rem', marginBottom:'1rem', border:'1px solid #E2E8F0' }
  const today = new Date().toISOString().slice(0, 10)

  async function markDone(id) {
    try {
      await updateConsultation(id, { recall_completed: true })
      setRows(rs => rs.filter(r => r.id !== id))
    } catch {}
  }

  return (
    <div style={card}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
        <div>
          <div style={{ fontSize:'1rem', fontWeight:700, color:'#0D2B45', marginBottom:'.25rem' }}>Patient recalls</div>
          <div style={{ fontSize:'.875rem', color:'#6B7280' }}>Follow-up dates set during consultations</div>
        </div>
        <span style={{ background: rows.some(r => r.recall_date <= today) ? '#FEF3C7' : '#F0F9FA', color: rows.some(r => r.recall_date <= today) ? '#92400E' : '#0B6E76', fontWeight:700, fontSize:'.875rem', padding:'3px 10px', borderRadius:99 }}>{rows.length}</span>
      </div>
      {loading ? (
        <div style={{ textAlign:'center', padding:'1.5rem', color:'#9CA3AF' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign:'center', padding:'1.5rem', color:'#9CA3AF' }}>✓ No outstanding recalls</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'.5rem' }}>
          {rows.map(r => {
            const overdue = r.recall_date < today
            const due = r.recall_date === today
            return (
              <div key={r.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'.75rem 1rem', background: overdue ? '#FEF2F2' : due ? '#FFFBEB' : '#F8FAFC', borderRadius:8, border:`1px solid ${overdue ? '#FECACA' : due ? '#FDE68A' : '#E2E8F0'}`, gap:'1rem', flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:'.9rem', color:'#0D2B45' }}>{r.patient_first_name} {r.patient_last_name}</div>
                  <div style={{ fontSize:'.8125rem', color:'#6B7280' }}>
                    {overdue ? '⚠ Overdue — ' : due ? '● Due today — ' : ''}{new Date(r.recall_date).toLocaleDateString('en-NZ', { day:'numeric', month:'short', year:'numeric' })}
                    {r.recall_note && ` · ${r.recall_note}`}
                  </div>
                  {r.patient_phone && <div style={{ fontSize:'.75rem', color:'#9CA3AF', marginTop:2 }}>{r.patient_phone}</div>}
                </div>
                <button onClick={() => markDone(r.id)} style={{ background:'#F0FDF4', color:'#059669', border:'1px solid #BBF7D0', padding:'4px 10px', borderRadius:6, cursor:'pointer', fontSize:'.75rem', fontWeight:600, fontFamily:'Plus Jakarta Sans, sans-serif', whiteSpace:'nowrap' }}>Mark done</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RevenuePanel() {
  const [rows, setRows] = React.useState([])
  const [reservationCount, setReservationCount] = React.useState(0)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function load() {
      try {
        const { getReservationCount } = await import('../../lib/supabase')
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
        const [consultResult, reservationResult] = await Promise.allSettled([
          getCompleteSince(thirtyDaysAgo, 'created_at, payment_amount_nzd, payment_amount, acc_eligible, status'),
          getReservationCount(thirtyDaysAgo),
        ])
        if (consultResult.status === 'fulfilled') setRows(consultResult.value || [])
        if (reservationResult.status === 'fulfilled') setReservationCount(reservationResult.value || 0)
      } catch { setRows([]) }
      setLoading(false)
    }
    load()
  }, [])

  const card = { background:'white', borderRadius:12, padding:'1.5rem', marginBottom:'1rem', border:'1px solid #E2E8F0' }

  const consultTotal = rows.reduce((s, r) => s + (r.payment_amount_nzd || (r.payment_amount ? r.payment_amount / 100 : 0)), 0)
  const reservationTotal = reservationCount * 15
  const grandTotal = consultTotal + reservationTotal
  const accCount = rows.filter(r => r.acc_eligible === 'yes').length
  const privateCount = rows.length - accCount

  return (
    <div style={card}>
      <div style={{ marginBottom:'1.25rem' }}>
        <div style={{ fontSize:'1rem', fontWeight:700, color:'#0D2B45', marginBottom:'.25rem' }}>Revenue — last 30 days</div>
        <div style={{ fontSize:'.875rem', color:'#6B7280' }}>Completed consultations + reservation fees</div>
      </div>
      {loading ? (
        <div style={{ textAlign:'center', padding:'1.5rem', color:'#9CA3AF' }}>Loading…</div>
      ) : (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'.75rem', marginBottom:'.75rem' }}>
            {[
              ['Total revenue', `$${grandTotal.toFixed(2)}`, '#059669'],
              ['Consultation revenue', `$${consultTotal.toFixed(2)}`, '#0B6E76'],
              ['Reservation fees', `$${reservationTotal.toFixed(2)}`, '#7C3AED'],
            ].map(([label, value, color]) => (
              <div key={label} style={{ background:'#F8FAFC', borderRadius:8, padding:'.875rem', textAlign:'center' }}>
                <div style={{ fontSize:'1.25rem', fontWeight:700, color }}>{value}</div>
                <div style={{ fontSize:'.75rem', color:'#9CA3AF', marginTop:2 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem', marginBottom:'1.25rem' }}>
            {[
              ['Private consults', privateCount, '#0B6E76'],
              ['ACC consults', accCount, '#1D4ED8'],
            ].map(([label, value, color]) => (
              <div key={label} style={{ background:'#F8FAFC', borderRadius:8, padding:'.875rem', textAlign:'center' }}>
                <div style={{ fontSize:'1.25rem', fontWeight:700, color }}>{value}</div>
                <div style={{ fontSize:'.75rem', color:'#9CA3AF', marginTop:2 }}>{label}</div>
              </div>
            ))}
          </div>
          {rows.length > 0 && (
            <button onClick={() => {
              const csv = ['Date,Type,Amount NZD', ...rows.map(r => [
                new Date(r.created_at).toLocaleDateString('en-NZ'),
                r.acc_eligible === 'yes' ? 'ACC' : 'Private',
                (r.payment_amount_nzd || (r.payment_amount ? r.payment_amount / 100 : 0)).toFixed(2),
              ].join(',')), ...(reservationCount > 0 ? [`Last 30 days,Reservation fees,${reservationTotal.toFixed(2)}`] : [])].join('\n')
              const a = document.createElement('a')
              a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
              a.download = `revenue-${new Date().toISOString().slice(0,10)}.csv`
              a.click()
            }} style={{ background:'#F0F9FA', color:'#0B6E76', border:'1px solid #0B6E76', padding:'7px 14px', borderRadius:8, cursor:'pointer', fontSize:'.8125rem', fontWeight:600, fontFamily:'Plus Jakarta Sans, sans-serif' }}>
              ↓ Export CSV
            </button>
          )}
        </>
      )}
    </div>
  )
}

function AuditLogPanel() {
  const [logs, setLogs] = React.useState([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function load() {
      try {
        const { apiFetch } = await import('../../lib/api')
        const res = await apiFetch('/api/audit?limit=50')
        const { logs } = await res.json()
        setLogs(logs || [])
      } catch { setLogs([]) }
      setLoading(false)
    }
    load()
  }, [])

  const card = { background:'white', borderRadius:12, padding:'1.5rem', marginBottom:'1rem', border:'1px solid #E2E8F0' }
  const EVENT_COLOR = { view_notes:'#0B6E76', finalise_notes:'#059669', prescribe:'#7C3AED', login:'#6B7280', payment:'#D97706' }

  return (
    <div style={card}>
      <div style={{ marginBottom:'1.25rem' }}>
        <div style={{ fontSize:'1rem', fontWeight:700, color:'#0D2B45', marginBottom:'.25rem' }}>Audit log</div>
        <div style={{ fontSize:'.875rem', color:'#6B7280' }}>Recent provider activity (last 50 events)</div>
      </div>
      {loading ? (
        <div style={{ textAlign:'center', padding:'1.5rem', color:'#9CA3AF' }}>Loading…</div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign:'center', padding:'1.5rem', color:'#9CA3AF' }}>No audit events yet</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          {logs.map(l => (
            <div key={l.id} style={{ display:'flex', alignItems:'center', gap:'.75rem', padding:'.5rem .75rem', borderRadius:6, background:'#FAFAFA', fontSize:'.8125rem' }}>
              <span style={{ fontWeight:700, color: EVENT_COLOR[l.event_type] || '#9CA3AF', minWidth:120, flexShrink:0 }}>{l.event_type}</span>
              <span style={{ color:'#374151', flex:1 }}>{l.provider_name || '—'}</span>
              <span style={{ color:'#9CA3AF', whiteSpace:'nowrap' }}>{new Date(l.created_at).toLocaleString('en-NZ', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ComplaintsPanel() {
  const [rows, setRows] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [form, setForm] = React.useState({ patient_name:'', complaint_type:'Clinical', description:'', status:'open' })
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  React.useEffect(() => {
    apiFetch('/api/complaints').then(r=>r.json()).then(d=>setRows(d.complaints||[])).catch(()=>{}).finally(()=>setLoading(false))
  }, [])

  async function addComplaint() {
    if (!form.description.trim()) return
    setSaving(true)
    try {
      const res = await apiFetch('/api/complaints', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) })
      const d = await res.json()
      if (d.complaint) setRows(r=>[d.complaint,...r])
      setForm({ patient_name:'', complaint_type:'Clinical', description:'', status:'open' })
      setSaved(true); setTimeout(()=>setSaved(false),2500)
    } catch {} finally { setSaving(false) }
  }

  async function updateStatus(id, status) {
    try {
      await apiFetch('/api/complaints', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id, status }) })
      setRows(r=>r.map(c=>c.id===id?{...c,status}:c))
    } catch {}
  }

  const card = { background:'white', borderRadius:12, padding:'1.5rem', marginBottom:'1rem', border:'1px solid #E2E8F0' }
  const inp  = { width:'100%', padding:'.625rem .875rem', border:'1.5px solid #E2E8F0', borderRadius:8, fontFamily:'Plus Jakarta Sans, sans-serif', fontSize:'.875rem', boxSizing:'border-box', outline:'none' }

  return (
    <div>
      <div style={card}>
        <div style={{fontSize:'1rem',fontWeight:700,color:'#0D2B45',marginBottom:'.25rem'}}>Log a complaint</div>
        <div style={{fontSize:'.875rem',color:'#6B7280',marginBottom:'1rem'}}>Record patient complaints under the HDC Code of Rights</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.75rem',marginBottom:'.75rem'}}>
          <div>
            <label style={{fontSize:'.8125rem',fontWeight:600,color:'#374151',display:'block',marginBottom:3}}>Patient name</label>
            <input style={inp} value={form.patient_name} onChange={e=>setForm(f=>({...f,patient_name:e.target.value}))} placeholder="e.g. John Smith" />
          </div>
          <div>
            <label style={{fontSize:'.8125rem',fontWeight:600,color:'#374151',display:'block',marginBottom:3}}>Type</label>
            <select style={{...inp,cursor:'pointer'}} value={form.complaint_type} onChange={e=>setForm(f=>({...f,complaint_type:e.target.value}))}>
              <option>Clinical</option><option>Communication</option><option>Privacy</option><option>Access</option><option>Billing</option><option>Other</option>
            </select>
          </div>
        </div>
        <div style={{marginBottom:'.75rem'}}>
          <label style={{fontSize:'.8125rem',fontWeight:600,color:'#374151',display:'block',marginBottom:3}}>Description</label>
          <textarea style={{...inp,resize:'vertical',minHeight:72}} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="What happened…" />
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <button onClick={addComplaint} disabled={saving||!form.description.trim()}
            style={{background:'#0B6E76',color:'white',border:'none',padding:'9px 18px',borderRadius:8,fontWeight:600,fontSize:'.875rem',cursor:'pointer',fontFamily:'Plus Jakarta Sans, sans-serif'}}>
            {saving?'Saving…':'Log complaint'}
          </button>
          {saved && <span style={{fontSize:'.8125rem',color:'#059669',fontWeight:600}}>✓ Logged</span>}
        </div>
      </div>

      <div style={card}>
        <div style={{fontSize:'1rem',fontWeight:700,color:'#0D2B45',marginBottom:'1rem'}}>Complaints register</div>
        {loading ? <div style={{textAlign:'center',padding:'1.5rem',color:'#9CA3AF'}}>Loading…</div>
        : rows.length===0 ? <div style={{textAlign:'center',padding:'1.5rem',color:'#9CA3AF'}}>No complaints logged</div>
        : rows.map(c=>(
          <div key={c.id} style={{borderRadius:8,border:'1px solid #E2E8F0',padding:'.875rem 1rem',marginBottom:'.5rem',background:c.status==='resolved'?'#F0FDF4':'white'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'.375rem'}}>
              <div style={{fontWeight:600,color:'#0D2B45',fontSize:'.9375rem'}}>{c.patient_name||'Anonymous'} <span style={{fontSize:'.75rem',fontWeight:400,color:'#6B7280'}}>· {c.complaint_type}</span></div>
              <span style={{fontSize:'.6875rem',fontWeight:700,padding:'2px 8px',borderRadius:99,background:c.status==='resolved'?'#D1FAE5':c.status==='investigating'?'#FEF3C7':'#FEE2E2',color:c.status==='resolved'?'#065F46':c.status==='investigating'?'#92400E':'#991B1B'}}>{c.status}</span>
            </div>
            <div style={{fontSize:'.875rem',color:'#374151',lineHeight:1.5,marginBottom:'.5rem'}}>{c.description}</div>
            <div style={{fontSize:'.75rem',color:'#9CA3AF',marginBottom:'.5rem'}}>{new Date(c.created_at).toLocaleDateString('en-NZ',{day:'numeric',month:'short',year:'numeric'})}</div>
            {c.status !== 'resolved' && (
              <div style={{display:'flex',gap:'.5rem'}}>
                {c.status==='open' && <button onClick={()=>updateStatus(c.id,'investigating')} style={{background:'#FEF3C7',border:'none',color:'#92400E',padding:'4px 10px',borderRadius:6,fontSize:'.75rem',fontWeight:600,cursor:'pointer'}}>Investigating</button>}
                <button onClick={()=>updateStatus(c.id,'resolved')} style={{background:'#D1FAE5',border:'none',color:'#065F46',padding:'4px 10px',borderRadius:6,fontSize:'.75rem',fontWeight:600,cursor:'pointer'}}>Resolve</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function BreachPanel() {
  const [rows, setRows] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [form, setForm] = React.useState({ description:'', affected_count:1, data_types:'', severity:'medium' })
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  React.useEffect(() => {
    apiFetch('/api/breach').then(r=>r.json()).then(d=>setRows(d.breaches||[])).catch(()=>{}).finally(()=>setLoading(false))
  }, [])

  async function logBreach() {
    if (!form.description.trim()) return
    setSaving(true)
    try {
      const res = await apiFetch('/api/breach', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) })
      const d = await res.json()
      if (d.breach) setRows(r=>[d.breach,...r])
      setForm({ description:'', affected_count:1, data_types:'', severity:'medium' })
      setSaved(true); setTimeout(()=>setSaved(false),2500)
    } catch {} finally { setSaving(false) }
  }

  const card = { background:'white', borderRadius:12, padding:'1.5rem', marginBottom:'1rem', border:'1px solid #E2E8F0' }
  const inp  = { width:'100%', padding:'.625rem .875rem', border:'1.5px solid #E2E8F0', borderRadius:8, fontFamily:'Plus Jakarta Sans, sans-serif', fontSize:'.875rem', boxSizing:'border-box', outline:'none' }

  const OBLIGATIONS = [
    'Notify affected individuals within 72 hours of discovery',
    'Notify Office of the Privacy Commissioner (OPC) if harm likely',
    'Notify Health and Disability Commissioner if health data involved',
    'Preserve logs and evidence — do not delete',
    'Document all notifications sent and dates',
    'Review and remediate the cause of the breach',
  ]

  return (
    <div>
      <div style={{...card, borderColor:'#FECACA', background:'#FEF2F2'}}>
        <div style={{fontSize:'.875rem',fontWeight:700,color:'#991B1B',marginBottom:'.75rem'}}>⛔ NZ Privacy Act 2020 — Reporting obligations</div>
        {OBLIGATIONS.map((o,i)=>(
          <div key={i} style={{display:'flex',gap:'.5rem',alignItems:'flex-start',marginBottom:'.375rem',fontSize:'.8125rem',color:'#7F1D1D'}}>
            <span style={{fontWeight:700,flexShrink:0}}>{i+1}.</span><span>{o}</span>
          </div>
        ))}
        <div style={{marginTop:'.75rem',fontSize:'.75rem',color:'#9CA3AF'}}>
          OPC: <strong>privacy.org.nz</strong> or 0800 803 909 · HDC: <strong>hdc.org.nz</strong> or 0800 11 22 33
        </div>
      </div>

      <div style={card}>
        <div style={{fontSize:'1rem',fontWeight:700,color:'#0D2B45',marginBottom:'.25rem'}}>Log a breach</div>
        <div style={{fontSize:'.875rem',color:'#6B7280',marginBottom:'1rem'}}>Logging triggers an immediate alert to clinic management</div>
        <div style={{marginBottom:'.75rem'}}>
          <label style={{fontSize:'.8125rem',fontWeight:600,color:'#374151',display:'block',marginBottom:3}}>Description of the breach</label>
          <textarea style={{...inp,resize:'vertical',minHeight:72}} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="What data was accessed, when, by whom…" />
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'.75rem',marginBottom:'.75rem'}}>
          <div>
            <label style={{fontSize:'.8125rem',fontWeight:600,color:'#374151',display:'block',marginBottom:3}}>Severity</label>
            <select style={{...inp,cursor:'pointer',borderColor:form.severity==='critical'?'#DC2626':form.severity==='high'?'#D97706':'#E2E8F0'}} value={form.severity} onChange={e=>setForm(f=>({...f,severity:e.target.value}))}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label style={{fontSize:'.8125rem',fontWeight:600,color:'#374151',display:'block',marginBottom:3}}>Affected individuals</label>
            <input type="number" min="1" style={inp} value={form.affected_count} onChange={e=>setForm(f=>({...f,affected_count:parseInt(e.target.value)||1}))} />
          </div>
          <div>
            <label style={{fontSize:'.8125rem',fontWeight:600,color:'#374151',display:'block',marginBottom:3}}>Data types involved</label>
            <input style={inp} value={form.data_types} onChange={e=>setForm(f=>({...f,data_types:e.target.value}))} placeholder="e.g. NHI, clinical notes" />
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <button onClick={logBreach} disabled={saving||!form.description.trim()}
            style={{background:'#DC2626',color:'white',border:'none',padding:'9px 18px',borderRadius:8,fontWeight:600,fontSize:'.875rem',cursor:'pointer',fontFamily:'Plus Jakarta Sans, sans-serif'}}>
            {saving?'Logging…':'Log breach — alerts management'}
          </button>
          {saved && <span style={{fontSize:'.8125rem',color:'#059669',fontWeight:600}}>✓ Logged + admins alerted</span>}
        </div>
      </div>

      <div style={card}>
        <div style={{fontSize:'1rem',fontWeight:700,color:'#0D2B45',marginBottom:'1rem'}}>Breach register</div>
        {loading ? <div style={{textAlign:'center',padding:'1.5rem',color:'#9CA3AF'}}>Loading…</div>
        : rows.length===0 ? <div style={{textAlign:'center',padding:'1.5rem',color:'#059669'}}>✓ No breaches on record</div>
        : rows.map(b=>(
          <div key={b.id} style={{borderRadius:8,border:'1px solid #FECACA',padding:'.875rem 1rem',marginBottom:'.5rem',background:'#FEF2F2'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'.375rem'}}>
              <span style={{fontWeight:600,color:'#991B1B',fontSize:'.9375rem'}}>{b.severity?.toUpperCase()} — {b.affected_count} affected</span>
              <span style={{fontSize:'.75rem',color:'#9CA3AF'}}>{new Date(b.created_at).toLocaleDateString('en-NZ',{day:'numeric',month:'short',year:'numeric'})}</span>
            </div>
            <div style={{fontSize:'.875rem',color:'#374151',lineHeight:1.5}}>{b.description}</div>
            {b.data_types && <div style={{fontSize:'.75rem',color:'#6B7280',marginTop:4}}>Data: {b.data_types}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

function IncidentsPanel() {
  const [rows, setRows] = React.useState([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    apiFetch('/api/incidents').then(r=>r.json()).then(d=>setRows(d.incidents||[])).catch(()=>{}).finally(()=>setLoading(false))
  }, [])

  async function updateStatus(id, status) {
    try {
      await apiFetch('/api/incidents', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id, status }) })
      setRows(r=>r.map(i=>i.id===id?{...i,status}:i))
    } catch {}
  }

  const card = { background:'white', borderRadius:12, padding:'1.5rem', marginBottom:'1rem', border:'1px solid #E2E8F0' }
  const SEV_COLOR = { critical:'#DC2626', high:'#D97706', medium:'#0B6E76', low:'#6B7280' }

  return (
    <div style={card}>
      <div style={{fontSize:'1rem',fontWeight:700,color:'#0D2B45',marginBottom:'1rem'}}>Incident register</div>
      {loading ? <div style={{textAlign:'center',padding:'1.5rem',color:'#9CA3AF'}}>Loading…</div>
      : rows.length===0 ? <div style={{textAlign:'center',padding:'1.5rem',color:'#9CA3AF'}}>No incidents reported</div>
      : rows.map(i=>(
        <div key={i.id} style={{borderRadius:8,border:`1px solid ${SEV_COLOR[i.severity]||'#E2E8F0'}20`,borderLeft:`4px solid ${SEV_COLOR[i.severity]||'#E2E8F0'}`,padding:'.875rem 1rem',marginBottom:'.5rem',background:i.status==='resolved'?'#F0FDF4':'white'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'.375rem'}}>
            <div>
              <span style={{fontWeight:700,color:SEV_COLOR[i.severity]||'#374151',fontSize:'.8125rem',textTransform:'uppercase'}}>{i.severity}</span>
              <span style={{color:'#6B7280',fontSize:'.8125rem'}}> · {i.incident_type} · {i.provider_name||'Unknown'}</span>
            </div>
            <span style={{fontSize:'.75rem',color:'#9CA3AF'}}>{new Date(i.created_at).toLocaleDateString('en-NZ',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
          </div>
          <div style={{fontSize:'.875rem',color:'#374151',lineHeight:1.5,marginBottom:'.375rem'}}>{i.description}</div>
          {i.immediate_actions && <div style={{fontSize:'.8125rem',color:'#6B7280',marginBottom:'.375rem'}}><strong>Actions:</strong> {i.immediate_actions}</div>}
          <div style={{display:'flex',gap:'.5rem',marginTop:'.5rem'}}>
            <span style={{fontSize:'.6875rem',fontWeight:700,padding:'2px 8px',borderRadius:99,background:i.status==='resolved'?'#D1FAE5':i.status==='investigating'?'#FEF3C7':'#FEE2E2',color:i.status==='resolved'?'#065F46':i.status==='investigating'?'#92400E':'#991B1B'}}>{i.status}</span>
            {i.status==='open' && <button onClick={()=>updateStatus(i.id,'investigating')} style={{background:'#FEF3C7',border:'none',color:'#92400E',padding:'2px 8px',borderRadius:6,fontSize:'.75rem',fontWeight:600,cursor:'pointer'}}>Investigate</button>}
            {i.status!=='resolved' && <button onClick={()=>updateStatus(i.id,'resolved')} style={{background:'#D1FAE5',border:'none',color:'#065F46',padding:'2px 8px',borderRadius:6,fontSize:'.75rem',fontWeight:600,cursor:'pointer'}}>Resolve</button>}
          </div>
        </div>
      ))}
    </div>
  )
}

function ProviderMetricsPanel() {
  const [rows, setRows] = React.useState([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function load() {
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
        const data = await getCompleteSince(
          thirtyDaysAgo,
          'provider_display_name, provider_id, status, acc_eligible, payment_amount_nzd, payment_amount, consultation_duration_seconds, notes_finalised, created_at',
        )
        const grouped = {}
        for (const c of data || []) {
          const key = c.provider_display_name || c.provider_id || 'Unknown'
          if (!grouped[key]) grouped[key] = { name:key, total:0, acc:0, private:0, revenue:0, avgDuration:0, durations:[], notesPending:0 }
          grouped[key].total++
          if (c.acc_eligible==='yes') grouped[key].acc++ ; else grouped[key].private++
          grouped[key].revenue += c.payment_amount_nzd || (c.payment_amount ? c.payment_amount/100 : 0)
          if (c.consultation_duration_seconds) grouped[key].durations.push(c.consultation_duration_seconds)
          if (!c.notes_finalised) grouped[key].notesPending++
        }
        for (const k of Object.keys(grouped)) {
          const d = grouped[k].durations
          grouped[k].avgDuration = d.length ? Math.round(d.reduce((s,v)=>s+v,0)/d.length) : 0
        }
        setRows(Object.values(grouped).sort((a,b)=>b.total-a.total))
      } catch { setRows([]) }
      setLoading(false)
    }
    load()
  }, [])

  const card = { background:'white', borderRadius:12, padding:'1.5rem', marginBottom:'1rem', border:'1px solid #E2E8F0' }

  return (
    <div style={card}>
      <div style={{fontSize:'1rem',fontWeight:700,color:'#0D2B45',marginBottom:'.25rem'}}>Provider performance — last 30 days</div>
      <div style={{fontSize:'.875rem',color:'#6B7280',marginBottom:'1.25rem'}}>Completed consultations per clinician</div>
      {loading ? <div style={{textAlign:'center',padding:'1.5rem',color:'#9CA3AF'}}>Loading…</div>
      : rows.length===0 ? <div style={{textAlign:'center',padding:'1.5rem',color:'#9CA3AF'}}>No data yet</div>
      : (
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.8125rem'}}>
            <thead>
              <tr style={{borderBottom:'2px solid #E2E8F0'}}>
                {['Provider','Total','ACC','Private','Revenue','Avg mins','Notes due'].map(h=>(
                  <th key={h} style={{padding:'6px 10px',textAlign:h==='Provider'?'left':'right',color:'#6B7280',fontWeight:700,fontSize:'.75rem',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.name} style={{borderBottom:'1px solid #F3F4F6'}}>
                  <td style={{padding:'8px 10px',fontWeight:600,color:'#0D2B45'}}>{r.name}</td>
                  <td style={{padding:'8px 10px',textAlign:'right',fontWeight:700,color:'#0B6E76'}}>{r.total}</td>
                  <td style={{padding:'8px 10px',textAlign:'right',color:'#1D4ED8'}}>{r.acc}</td>
                  <td style={{padding:'8px 10px',textAlign:'right',color:'#374151'}}>{r.private}</td>
                  <td style={{padding:'8px 10px',textAlign:'right',color:'#059669',fontWeight:600}}>${r.revenue.toFixed(0)}</td>
                  <td style={{padding:'8px 10px',textAlign:'right',color:'#6B7280'}}>{r.avgDuration ? `${Math.round(r.avgDuration/60)}m` : '—'}</td>
                  <td style={{padding:'8px 10px',textAlign:'right',color:r.notesPending>0?'#D97706':'#9CA3AF',fontWeight:r.notesPending>0?700:400}}>{r.notesPending||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AdminBody() {
  const navigate = useNavigate()
  const [adminTab, setAdminTab] = useState('overview')
  const [waitlist, setWaitlist]   = useState([])
  const [notified, setNotified]   = useState(false)
  const [notifying, setNotifying] = useState(false)

  useEffect(() => {
    getWaitlist().then(data => setWaitlist(data || [])).catch(() => {})
  }, [])

  async function notifyWaitlist() {
    setNotifying(true)
    try {
      await markWaitlistNotified(waitlist.map(w => w.id))
      setNotified(true)
      setWaitlist([])
    } catch {}
    setNotifying(false)
  }

  const card = { background:'white', borderRadius:12, padding:'1.5rem', marginBottom:'1rem', border:'1px solid #E2E8F0' }
  const inp  = { width:'100%', padding:'.75rem 1rem', border:'1.5px solid #E2E8F0', borderRadius:8, fontFamily:'Plus Jakarta Sans, sans-serif', fontSize:'.9375rem', color:'#1A2A33', outline:'none', boxSizing:'border-box' }
  const btn  = { background:'#0B6E76', color:'white', border:'none', padding:'9px 20px', borderRadius:8, fontFamily:'Plus Jakarta Sans, sans-serif', fontWeight:600, fontSize:'.9375rem', cursor:'pointer' }
  const saved = { fontSize:'.8125rem', color:'#059669', fontWeight:600 }

  return (
    <div style={{ minHeight:'100dvh', background:'#F0F2F5', fontFamily:'Plus Jakarta Sans, sans-serif' }}>
      <nav style={{ background:'#0D2B45', padding:'.875rem 1.5rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'1.5rem' }}>
          <span onClick={() => navigate('/admin')} style={{ fontFamily:'Cormorant Garamond, serif', fontStyle:'italic', color:'#D4EEF0', fontSize:'1.3rem', cursor:'pointer', userSelect:'none', transition:'opacity .15s' }} onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'} role="link" aria-label="Tere Health — go to admin">Tere</span>
          <span style={{ color:'rgba(255,255,255,.4)', fontSize:'.8125rem' }}>Admin</span>
        </div>
        <AdminNavMenu navigate={navigate} />
      </nav>

      <div style={{ maxWidth:720, margin:'0 auto', padding:'2rem 1.5rem 3rem' }}>
        <h1 style={{ fontSize:'1.5rem', fontWeight:700, color:'#0D2B45', marginBottom:'.25rem' }}>Clinic Admin</h1>
        <p style={{ fontSize:'.9375rem', color:'#6B7280', marginBottom:'1rem' }}>Manage providers, schedule, and clinic settings.</p>

        {/* Tabs — desktop: horizontal row, mobile: dropdown */}
        {(() => {
          const ADMIN_TABS = [
            { id:'overview',     label:'📊 Overview' },
            { id:'schedule',     label:'📅 Schedule' },
            { id:'payroll',      label:'💰 Payroll' },
            { id:'safety',       label:'⚠ Safety' },
            { id:'performance',  label:'📈 Performance' },
            { id:'employers',    label:'🏢 Employers' },
            { id:'careers',      label:'💼 Careers' },
            { id:'research',     label:'🔬 Research' },
            { id:'patients',     label:'👥 Patients' },
          ]
          return (<>
            {/* Desktop horizontal tabs */}
            <div className="admin-tabs-desktop">
              {ADMIN_TABS.map(({ id, label }) => (
                <button key={id} onClick={() => setAdminTab(id)} style={{
                  background:'none', border:'none', padding:'8px 16px', cursor:'pointer',
                  fontFamily:'Plus Jakarta Sans, sans-serif', fontWeight:600, fontSize:'.9rem',
                  color: adminTab===id ? '#0B6E76' : '#6B7280',
                  borderBottom: adminTab===id ? '2px solid #0B6E76' : '2px solid transparent',
                  marginBottom:'-2px', whiteSpace:'nowrap',
                }}>{label}</button>
              ))}
            </div>
            {/* Mobile dropdown */}
            <div className="admin-tabs-mobile">
              <div style={{ width:'100%', display:'flex', alignItems:'center', gap:8, background:'#F7F5F0', borderRadius:10, border:'1.5px solid #E2E8F0', position:'relative' }}>
                <select
                  value={adminTab}
                  onChange={e => setAdminTab(e.target.value)}
                  style={{
                    flex:1, background:'transparent', color:'#0D2B45', border:'none', outline:'none',
                    borderRadius:10, padding:'10px 40px 10px 14px',
                    fontSize:'.9375rem', fontFamily:'Plus Jakarta Sans, sans-serif', fontWeight:700,
                    appearance:'none', WebkitAppearance:'none', cursor:'pointer', minHeight:44,
                  }}>
                  {ADMIN_TABS.map(({ id, label }) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
                <span style={{ position:'absolute', right:12, color:'#6B7280', fontSize:'1.1rem', pointerEvents:'none' }}>▾</span>
              </div>
            </div>
          </>)
        })()}

        {adminTab === 'patients' ? <AdminPatients embedded /> : adminTab === 'research' ? <AdminResearch embedded /> : adminTab === 'careers' ? <CareersPanel /> : adminTab === 'employers' ? <EmployersPanel /> : adminTab === 'schedule' ? <AdminSchedule embedded /> : adminTab === 'payroll' ? <AdminPayroll embedded /> : adminTab === 'performance' ? <><ProviderMetricsPanel /></> : adminTab === 'safety' ? <><IncidentsPanel /><ComplaintsPanel /><BreachPanel /></> : <>

        {/* Providers */}
        <ProvidersPanel />

        {/* Upcoming appointments */}
        <AppointmentsPanel />

        {/* Patient recalls */}
        <RecallsPanel />

        {/* Pending approvals */}
        <PendingApprovalsPanel />

        {/* Outstanding referrals */}
        <OutstandingReferrals />

        {/* Recent prescriptions */}
        <OutstandingPrescriptions />

        {/* Analytics */}
        <AnalyticsPanel />

        {/* Revenue */}
        <RevenuePanel />

        {/* Consultation Log */}
        <ConsultationLog />

        {/* Failed Payments */}
        <FailedPayments />

        {/* Flagged Notes */}
        <FlaggedNotes />

        {/* Audit log */}
        <AuditLogPanel />

        {/* Waitlist */}

        <div style={card}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
            <div>
              <div style={{ fontSize:'1rem', fontWeight:700, color:'#0D2B45', marginBottom:'.25rem' }}>Waitlist</div>
              <div style={{ fontSize:'.875rem', color:'#6B7280' }}>Patients waiting to be notified when you open</div>
            </div>
            <div style={{ background:waitlist.length > 0 ? '#FEF3C7' : '#F0F9FA', color:waitlist.length > 0 ? '#92400E' : '#0B6E76', fontWeight:700, fontSize:'1.25rem', padding:'.375rem .875rem', borderRadius:8 }}>{waitlist.length}</div>
          </div>
          {waitlist.length === 0 ? (
            <div style={{ textAlign:'center', padding:'1.5rem', color:'#9CA3AF' }}>{notified ? '✓ All patients notified' : 'No one on the waitlist right now'}</div>
          ) : (
            <>
              <div style={{ marginBottom:'1rem', border:'1px solid #E2E8F0', borderRadius:8, overflow:'hidden' }}>
                {waitlist.map((w,i) => (
                  <div key={w.id} style={{ display:'flex', justifyContent:'space-between', padding:'.75rem 1rem', borderBottom:i<waitlist.length-1 ? '1px solid #F3F4F6' : 'none', fontSize:'.9375rem' }}>
                    <span style={{ fontWeight:600 }}>{w.name}</span>
                    <span style={{ color:'#6B7280' }}>{w.email}</span>
                  </div>
                ))}
              </div>
              <button style={btn} onClick={notifyWaitlist} disabled={notifying}>{notifying ? 'Sending…' : `Email all ${waitlist.length} patient${waitlist.length > 1 ? 's' : ''}`}</button>
            </>
          )}
        </div>

        </>}

      </div>
    </div>
  )
}

export default function Admin() {
  useClinicianAuth()
  const navigate = useNavigate()
  const isAdmin = sessionStorage.getItem('providerIsAdmin') === 'true'

  if (!isAdmin) return (
    <div style={{ minHeight:'100dvh', background:'#F0F2F5', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Plus Jakarta Sans, sans-serif' }}>
      <div style={{ background:'white', borderRadius:12, padding:'2rem', width:'100%', maxWidth:360, border:'1px solid #E2E8F0', textAlign:'center' }}>
        <h2 style={{ fontSize:'1.2rem', fontWeight:700, color:'#0D2B45', marginBottom:'.75rem' }}>Access denied</h2>
        <p style={{ fontSize:'.875rem', color:'#6B7280', marginBottom:'1.5rem' }}>This area is restricted to admin accounts.</p>
        <button onClick={() => navigate('/clinician/dashboard')} style={{ background:'#0B6E76', color:'white', border:'none', padding:'10px 20px', borderRadius:8, fontWeight:600, fontSize:'.9375rem', cursor:'pointer' }}>← Back to dashboard</button>
      </div>
    </div>
  )

  return <AdminBody />
}
