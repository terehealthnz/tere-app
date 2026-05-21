import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAvailability, setAvailability, getSchedule, setSchedule, getWaitlist, markWaitlistNotified, providerDisplayName } from '../../lib/supabase'
import ScheduleEditor, { getScheduleSlots, getUseSchedule, shouldBeOpen } from './ScheduleEditor'

function useClinicianAuth() {
  const navigate = useNavigate()
  useEffect(() => { if (!sessionStorage.getItem('clinicianAuth')) navigate('/clinician') }, [navigate])
}

const ADMIN_PIN = 'admin2026'

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
      const { supabase } = await import('../../lib/supabase')
      await supabase.from('providers').update(updates).eq('id', id)
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
                <div style={{ display:'grid', gridTemplateColumns:'auto 1fr auto', gap:'1rem', alignItems:'start' }}>
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
                  <div style={{ display:'flex', flexDirection:'column', gap:'.375rem', alignItems:'flex-end' }}>
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
        const { supabase } = await import('../../lib/supabase')
        const { data } = await supabase
          .from('consultations')
          .select('id, created_at, completed_at, patient_first_name, patient_last_name, chief_complaint, status, payment_amount, acc_eligible, consultation_duration_seconds')
          .order('created_at', { ascending: false })
          .limit(100)
        setRows(data || [])
      } catch(e) { console.error(e) }
      setLoading(false)
    }
    load()
  }, [])

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
        <input
          placeholder="Search patient or complaint…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding:'7px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:'.875rem', fontFamily:'Plus Jakarta Sans, sans-serif', width:220 }}
        />
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
        const { supabase } = await import('../../lib/supabase')
        const { data } = await supabase
          .from('consultations')
          .select('id, created_at, patient_first_name, patient_last_name, payment_amount, payment_intent_id, status')
          .not('payment_intent_id', 'is', null)
          .neq('status', 'complete')
          .neq('status', 'waiting')
          .order('created_at', { ascending: false })
          .limit(50)
        setRows(data || [])
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
      const { supabase } = await import('../../lib/supabase')
      const { data } = await supabase
        .from('radiology_referrals')
        .select('*')
        .not('referral_status', 'eq', 'result_received')
        .not('referral_status', 'eq', 'dna')
        .order('created_at', { ascending: true })
      setRows(data || [])
    } catch { setRows([]) }
    setLoading(false)
  }

  async function updateStatus(id, status, notes) {
    setSaving(id)
    try {
      const { supabase } = await import('../../lib/supabase')
      const updates = { referral_status: status }
      if (status === 'result_received') updates.result_received_at = new Date().toISOString()
      if (notes !== undefined) updates.result_notes = notes
      await supabase.from('radiology_referrals').update(updates).eq('id', id)
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

function AnalyticsPanel() {
  const [range, setRange] = React.useState(7) // days
  const [data, setData] = React.useState([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const { supabase } = await import('../../lib/supabase')
        const since = new Date()
        since.setDate(since.getDate() - range)
        const { data: rows } = await supabase
          .from('consultations')
          .select('created_at, started_at, completed_at, consultation_duration_seconds, payment_amount, is_acc, acc_eligible, status, payment_intent_id')
          .gte('created_at', since.toISOString())
          .eq('status', 'complete')
          .order('created_at', { ascending: true })
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
      const { supabase } = await import('../../lib/supabase')
      const { data, error: err } = await supabase
        .from('consultations')
        .select('id, created_at, patient_first_name, patient_last_name, chief_complaint, acc_eligible, notes_flagged, notes_finalised_at, clinical_notes, outcome')
        .eq('notes_flagged', true)
        .order('created_at', { ascending: false })
      if (err) throw err
      setRows(data || [])
    } catch { setError(true) }
    setLoading(false)
  }

  async function markReviewed(id) {
    try {
      const { supabase } = await import('../../lib/supabase')
      await supabase.from('consultations').update({ notes_flagged: false }).eq('id', id)
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
      const { supabase } = await import('../../lib/supabase')
      const [rxRes, refRes, accRes] = await Promise.all([
        supabase.from('prescriptions').select('id, created_at, patient_name, drafted_by_name, provider_name, drug, urgency').eq('approval_status', 'pending_approval').order('created_at'),
        supabase.from('radiology_referrals').select('id, created_at, patient_name, drafted_by_name, provider_name, investigation, urgency').eq('approval_status', 'pending_approval').order('created_at'),
        supabase.from('consultations').select('id, created_at, patient_first_name, patient_last_name, provider_display_name').eq('acc_approval_status', 'pending_approval').order('created_at'),
      ])
      setItems({ prescriptions: rxRes.data || [], referrals: refRes.data || [], acc: accRes.data || [] })
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
      const { supabase } = await import('../../lib/supabase')
      const { data: emps } = await supabase.from('employers').select('*').order('company_name')
      setEmployers(emps || [])
      if (emps?.length) {
        const { data: counts } = await supabase
          .from('employer_employees')
          .select('employer_id')
        const map = {}
        ;(counts || []).forEach(r => { map[r.employer_id] = (map[r.employer_id] || 0) + 1 })
        setEmployeeCounts(map)
      }
    } catch {}
    setLoading(false)
  }

  async function addEmployer() {
    if (!newEmp.company_name.trim()) return
    setSaving(true)
    try {
      const { supabase } = await import('../../lib/supabase')
      await supabase.from('employers').insert({
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
      const { supabase } = await import('../../lib/supabase')
      await supabase.from('employers').update({ is_active: val }).eq('id', id)
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
      const { supabase } = await import('../../lib/supabase')
      const inserts = rows.map(r => ({
        employer_id: employerId,
        first_name: r.first_name || r.firstname || '',
        last_name: r.last_name || r.lastname || r.surname || '',
        dob: r.dob || null,
        employee_id: r.employee_id || r.staff_id || null,
      })).filter(r => r.first_name && r.last_name)
      await supabase.from('employer_employees').insert(inserts)
      setEmployeeCounts(c => ({ ...c, [employerId]: (c[employerId] || 0) + inserts.length }))
      alert(`✓ ${inserts.length} employees imported`)
    } catch(e) { console.error(e); alert('Upload failed') }
    setUploadingFor(null)
  }

  async function downloadReport(emp) {
    try {
      const { supabase } = await import('../../lib/supabase')
      const since = new Date(); since.setDate(1); since.setHours(0,0,0,0)
      const { data: consults } = await supabase
        .from('consultations')
        .select('patient_first_name, patient_last_name, created_at, consultation_type, billing_code')
        .eq('employer_id', emp.id)
        .gte('created_at', since.toISOString())
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

function AdminBody() {
  const navigate = useNavigate()
  const [adminTab, setAdminTab] = useState('overview')
  const [isOpen, setIsOpen] = useState(false)
  const [availMsg, setAvailMsg] = useState('')
  const [savingAvail, setSavingAvail] = useState(false)
  const [availSaved, setAvailSaved] = useState(false)
  const [nextTimes, setNextTimes] = useState('')
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [scheduleSaved, setScheduleSaved] = useState(false)
  const [waitlist, setWaitlist] = useState([])
  const [notifying, setNotifying] = useState(false)
  const [notified, setNotified] = useState(false)

  const load = useCallback(async () => {
    try {
      const [av, sc, wl, slots, useSched] = await Promise.all([
        getAvailability(), getSchedule(), getWaitlist(), getScheduleSlots(), getUseSchedule()
      ])
      setIsOpen(av.is_open)
      setAvailMsg(av.message || '')
      setNextTimes(sc.next_times || '')
      setWaitlist(wl)
      if (useSched) {
        const open = shouldBeOpen(slots)
        if (open !== av.is_open) {
          await setAvailability(open, av.message || '')
          setIsOpen(open)
        }
      }
    } catch (e) { console.error(e) }
  }, [])

  useEffect(() => { load() }, [load])

  async function saveAvailability() {
    setSavingAvail(true)
    try {
      await setAvailability(isOpen, availMsg)
      setAvailSaved(true)
      setTimeout(() => setAvailSaved(false), 2500)
      // If opening clinic, notify waitlisted patients
      if (isOpen) {
        try {
          const res = await fetch('/api/notify-waitlist', { method:'POST', headers:{'Content-Type':'application/json'} })
          const { sent } = await res.json()
          if (sent > 0) alert(`✓ ${sent} waitlisted patient${sent>1?'s':''} notified by email`)
        } catch(e) { console.error('Waitlist notify error:', e) }
      }
    }
    catch (e) { console.error(e) }
    setSavingAvail(false)
  }

  async function saveScheduleHandler() {
    setSavingSchedule(true)
    try { await setSchedule(nextTimes); setScheduleSaved(true); setTimeout(() => setScheduleSaved(false), 2500) }
    catch (e) { console.error(e) }
    setSavingSchedule(false)
  }

  async function notifyWaitlist() {
    setNotifying(true)
    try {
      for (const p of waitlist) {
        try { await fetch('/api/send-email', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ to:p.email, name:p.name, isOpenNotification:true, schedule:nextTimes }) }) } catch {}
      }
      await markWaitlistNotified()
      setWaitlist([])
      setNotified(true)
      setTimeout(() => setNotified(false), 3000)
    } catch (e) { console.error(e) }
    setNotifying(false)
  }

  const card = { background:'white', borderRadius:12, padding:'1.5rem', marginBottom:'1rem', border:'1px solid #E2E8F0' }
  const inp  = { width:'100%', padding:'.75rem 1rem', border:'1.5px solid #E2E8F0', borderRadius:8, fontFamily:'Plus Jakarta Sans, sans-serif', fontSize:'.9375rem', color:'#1A2A33', outline:'none', boxSizing:'border-box' }
  const btn  = { background:'#0B6E76', color:'white', border:'none', padding:'9px 20px', borderRadius:8, fontFamily:'Plus Jakarta Sans, sans-serif', fontWeight:600, fontSize:'.9375rem', cursor:'pointer' }
  const saved = { fontSize:'.8125rem', color:'#059669', fontWeight:600 }

  return (
    <div style={{ minHeight:'100vh', background:'#F0F2F5', fontFamily:'Plus Jakarta Sans, sans-serif' }}>
      <nav style={{ background:'#0D2B45', padding:'.875rem 1.5rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'1.5rem' }}>
          <span style={{ fontFamily:'Cormorant Garamond, serif', fontStyle:'italic', color:'#D4EEF0', fontSize:'1.3rem' }}>Tere</span>
          <span style={{ color:'rgba(255,255,255,.4)', fontSize:'.8125rem' }}>Admin</span>
        </div>
        <div style={{ display:'flex', gap:'.75rem' }}>
          <button onClick={() => navigate('/clinician/dashboard')} style={{ background:'rgba(255,255,255,.1)', border:'none', color:'rgba(255,255,255,.7)', padding:'6px 12px', borderRadius:6, cursor:'pointer', fontSize:'.8125rem' }}>← Dashboard</button>
          <button onClick={() => { sessionStorage.clear(); navigate('/clinician') }} style={{ background:'rgba(255,255,255,.1)', border:'none', color:'rgba(255,255,255,.7)', padding:'6px 12px', borderRadius:6, cursor:'pointer', fontSize:'.8125rem' }}>Sign out</button>
        </div>
      </nav>

      <div style={{ maxWidth:720, margin:'0 auto', padding:'2rem 1.5rem 3rem' }}>
        <h1 style={{ fontSize:'1.5rem', fontWeight:700, color:'#0D2B45', marginBottom:'.25rem' }}>Clinic Admin</h1>
        <p style={{ fontSize:'.9375rem', color:'#6B7280', marginBottom:'1rem' }}>Manage availability, schedule, and clinic settings.</p>

        {/* Tabs */}
        <div style={{ display:'flex', gap:6, marginBottom:'1.5rem', borderBottom:'2px solid #E2E8F0', paddingBottom:'.125rem' }}>
          {[['overview','Overview'],['employers','Employers']].map(([id, label]) => (
            <button key={id} onClick={() => setAdminTab(id)} style={{
              background:'none', border:'none', padding:'8px 16px', cursor:'pointer',
              fontFamily:'Plus Jakarta Sans, sans-serif', fontWeight:600, fontSize:'.9rem',
              color: adminTab===id ? '#0B6E76' : '#6B7280',
              borderBottom: adminTab===id ? '2px solid #0B6E76' : '2px solid transparent',
              marginBottom:'-2px',
            }}>{label}</button>
          ))}
        </div>

        {adminTab === 'employers' ? <EmployersPanel /> : <>

        {/* Availability */}
        <div style={card}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem', flexWrap:'wrap', gap:'.75rem' }}>
            <div>
              <div style={{ fontSize:'1rem', fontWeight:700, color:'#0D2B45', marginBottom:'.25rem' }}>Manual override</div>
              <div style={{ fontSize:'.875rem', color:'#6B7280' }}>Toggle the clinic open or closed right now, overriding the schedule</div>
            </div>
            <div onClick={() => setIsOpen(o => !o)} style={{ width:56, height:30, borderRadius:15, cursor:'pointer', position:'relative', transition:'background .2s', background:isOpen ? '#059669' : '#DC2626', flexShrink:0 }}>
              <div style={{ position:'absolute', top:3, left:isOpen ? 29 : 3, width:24, height:24, borderRadius:'50%', background:'white', transition:'left .2s', boxShadow:'0 1px 4px rgba(0,0,0,.2)' }} />
            </div>
          </div>
          <div style={{ padding:'1rem', background:isOpen ? '#F0FDF4' : '#FEF2F2', borderRadius:8, marginBottom:'1.25rem', border:`1px solid ${isOpen ? '#BBF7D0' : '#FECACA'}` }}>
            <div style={{ fontWeight:700, color:isOpen ? '#065F46' : '#991B1B', marginBottom:'.25rem' }}>{isOpen ? '✓ Open — accepting patients' : '✗ Closed — patients see unavailable screen'}</div>
          </div>
          <div style={{ marginBottom:'1.25rem' }}>
            <label style={{ display:'block', fontSize:'.8125rem', fontWeight:600, color:'#1A2A33', marginBottom:'.375rem' }}>Message shown to patients when closed</label>
            <input style={inp} value={availMsg} onChange={e => setAvailMsg(e.target.value)} placeholder="e.g. Dr Herling is not available today. Back tomorrow at 9am." />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <button style={btn} onClick={saveAvailability} disabled={savingAvail}>{savingAvail ? 'Saving…' : 'Save'}</button>
            {availSaved && <span style={saved}>✓ Saved</span>}
          </div>
        </div>

        {/* Auto schedule */}
        <div style={card}>
          <div style={{ fontSize:'1rem', fontWeight:700, color:'#0D2B45', marginBottom:'.25rem' }}>Weekly schedule</div>
          <div style={{ fontSize:'.875rem', color:'#6B7280', marginBottom:'1.25rem' }}>Set your regular hours and the clinic opens and closes automatically.</div>
          <ScheduleEditor onSaved={(slots, useSched) => {
            const open = useSched ? shouldBeOpen(slots) : isOpen
            if (useSched) { setIsOpen(open); setAvailability(open, availMsg).catch(console.error) }
          }} />
        </div>

        {/* Next available text */}
        <div style={card}>
          <div style={{ fontSize:'1rem', fontWeight:700, color:'#0D2B45', marginBottom:'.25rem' }}>Next available message</div>
          <div style={{ fontSize:'.875rem', color:'#6B7280', marginBottom:'.875rem' }}>Shown on the closed screen alongside the schedule. Use this for special notes e.g. holiday cover.</div>
          <textarea style={{ ...inp, resize:'vertical', minHeight:80 }} value={nextTimes} onChange={e => setNextTimes(e.target.value)} placeholder={'e.g. Back Monday 9am\nHoliday cover: call 111 for emergencies'} />
          <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:'.875rem' }}>
            <button style={btn} onClick={saveScheduleHandler} disabled={savingSchedule}>{savingSchedule ? 'Saving…' : 'Save message'}</button>
            {scheduleSaved && <span style={saved}>✓ Saved</span>}
          </div>
        </div>

        {/* Providers */}
        <ProvidersPanel />

        {/* Pending approvals */}
        <PendingApprovalsPanel />

        {/* Outstanding referrals */}
        <OutstandingReferrals />

        {/* Recent prescriptions */}
        <OutstandingPrescriptions />

        {/* Analytics */}
        <AnalyticsPanel />

        {/* Consultation Log */}
        <ConsultationLog />

        {/* Failed Payments */}
        <FailedPayments />

        {/* Flagged Notes */}
        <FlaggedNotes />

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
  const [pinOk, setPinOk] = React.useState(
    sessionStorage.getItem('providerIsAdmin') === 'true' || sessionStorage.getItem('adminAuth') === '1'
  )
  const [pinInput, setPinInput] = React.useState('')
  const [pinError, setPinError] = React.useState(false)

  if (pinOk) return <AdminBody />

  return (
    <div style={{ minHeight:'100vh', background:'#F0F2F5', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Plus Jakarta Sans, sans-serif' }}>
      <div style={{ background:'white', borderRadius:12, padding:'2rem', width:'100%', maxWidth:360, border:'1px solid #E2E8F0' }}>
        <h2 style={{ fontSize:'1.2rem', fontWeight:700, color:'#0D2B45', marginBottom:'.5rem' }}>Admin access</h2>
        <p style={{ fontSize:'.875rem', color:'#6B7280', marginBottom:'1.25rem' }}>Enter the admin PIN to continue.</p>
        <input
          type="password" autoFocus
          style={{ width:'100%', padding:'.75rem 1rem', border:`1.5px solid ${pinError ? '#DC2626' : '#E2E8F0'}`, borderRadius:8, fontSize:'1rem', marginBottom:'.75rem', boxSizing:'border-box', fontFamily:'Plus Jakarta Sans, sans-serif' }}
          value={pinInput}
          onChange={e => { setPinInput(e.target.value); setPinError(false) }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              if (pinInput === ADMIN_PIN) { sessionStorage.setItem('adminAuth','1'); setPinOk(true) }
              else { setPinError(true); setPinInput('') }
            }
          }}
          placeholder="Enter PIN"
        />
        {pinError && <p style={{ color:'#DC2626', fontSize:'.8125rem', marginBottom:'.75rem' }}>Incorrect PIN</p>}
        <button
          style={{ background:'#0B6E76', color:'white', border:'none', padding:'10px 20px', borderRadius:8, fontWeight:600, fontSize:'.9375rem', cursor:'pointer', width:'100%' }}
          onClick={() => {
            if (pinInput === ADMIN_PIN) { sessionStorage.setItem('adminAuth','1'); setPinOk(true) }
            else { setPinError(true); setPinInput('') }
          }}>
          Enter
        </button>
        <button onClick={() => navigate('/clinician/dashboard')} style={{ background:'none', border:'none', color:'#6B7280', fontSize:'.8125rem', cursor:'pointer', marginTop:'.75rem', width:'100%' }}>← Back to dashboard</button>
      </div>
    </div>
  )
}
