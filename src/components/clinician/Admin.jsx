import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getWaitlist, markWaitlistNotified, providerDisplayName, updateConsultation, updateProvider, getAccPendingConsultations, getPendingPrescriptions, createEmployer, updateEmployer, addEmployerEmployees, getEmployers, getEmployerEmployeeCounts, getRecentConsultations, getPaymentPendingConsultations, getRatedConsultations, getRecallPendingConsultations, getCompleteSince, getFlaggedNotes, getConsultsByEmployer, getProviderPeriodConsults } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'
import AdminSchedule  from '../../pages/clinician/AdminSchedule'
import AdminPayroll   from '../../pages/clinician/AdminPayroll'
import AdminResearch  from '../../pages/clinician/AdminResearch'
import AdminPatients  from '../../pages/clinician/AdminPatients'
import PhiRevealGate, { ReasonPicker } from './PhiRevealGate'

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

// SupportPanel — patient-submitted "Contact us" tickets. Reads from
// /api/patient-support. Admin can open a ticket, send a reply email
// (recorded as an admin note), and change status.
const CATEGORY_LABEL = {
  prescription: 'Prescription', billing: 'Billing', follow_up: 'Follow-up',
  technical: 'Technical', complaint: 'Complaint', other: 'Other',
}
const STATUS_STYLE = {
  new:         { bg:'#EFF6FF', color:'#1D4ED8', label:'New' },
  in_progress: { bg:'#FEF3C7', color:'#92400E', label:'In progress' },
  resolved:    { bg:'#DCFCE7', color:'#065F46', label:'Resolved' },
  archived:    { bg:'#F3F4F6', color:'#6B7280', label:'Archived' },
}

function SupportPanel() {
  const [tickets, setTickets] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [statusFilter, setStatusFilter] = React.useState('new')
  const [open, setOpen] = React.useState(null) // ticket being viewed
  const [replyText, setReplyText] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [flash, setFlash] = React.useState(null)

  async function load() {
    setLoading(true)
    try {
      const { apiFetch } = await import('../../lib/api')
      const q = statusFilter === 'all' ? '' : `?status=${statusFilter}`
      const r = await apiFetch(`/api/patient-support${q}`)
      const data = await r.json()
      setTickets(data.tickets || [])
    } catch { setTickets([]) }
    setLoading(false)
  }

  React.useEffect(() => { load() }, [statusFilter])

  async function setStatus(id, status) {
    setBusy(true)
    try {
      const { apiFetch } = await import('../../lib/api')
      await apiFetch(`/api/patient-support?id=${id}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ status }),
      })
      setFlash(`Marked ${STATUS_STYLE[status].label.toLowerCase()}`)
      setTimeout(() => setFlash(null), 2500)
      if (open?.id === id) setOpen({ ...open, status })
      load()
    } catch {}
    setBusy(false)
  }

  async function sendReply() {
    if (!open || !replyText.trim()) return
    setBusy(true)
    try {
      const { apiFetch } = await import('../../lib/api')
      const r = await apiFetch(`/api/patient-support?action=reply&id=${open.id}`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ body: replyText }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Reply failed')
      setFlash('Reply sent + logged')
      setTimeout(() => setFlash(null), 2500)
      setReplyText('')
      // Refresh single ticket
      const t = await apiFetch(`/api/patient-support?id=${open.id}`)
      const tj = await t.json()
      if (tj.ticket) setOpen(tj.ticket)
      load()
    } catch (e) { alert(e.message) }
    setBusy(false)
  }

  const card = { background:'white', borderRadius:12, padding:'1.5rem', marginBottom:'1rem', border:'1px solid #E2E8F0' }

  return (
    <div style={card}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
        <div>
          <div style={{ fontSize:'1rem', fontWeight:700, color:'#0D2B45', marginBottom:'.25rem' }}>Patient support tickets</div>
          <div style={{ fontSize:'.875rem', color:'#6B7280' }}>Messages submitted via /contact or the post-consult "Need help?" link</div>
        </div>
        <div style={{ display:'flex', gap:'.5rem', alignItems:'center' }}>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding:'6px 10px', border:'1px solid #E2E8F0', borderRadius:6, fontSize:'.8125rem', fontFamily:'Plus Jakarta Sans, sans-serif' }}>
            <option value="new">New</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
          <button onClick={load} style={{ background:'#F0F9FA', border:'none', color:'#0B6E76', padding:'6px 12px', borderRadius:6, cursor:'pointer', fontSize:'.8125rem', fontWeight:600 }}>↻</button>
        </div>
      </div>

      {flash && <div style={{ background:'#F0FDF4', border:'1px solid #86EFAC', borderRadius:8, padding:'.5rem .75rem', fontSize:'.8125rem', color:'#065F46', marginBottom:'.75rem' }}>{flash}</div>}

      {loading ? (
        <div style={{ textAlign:'center', padding:'1.5rem', color:'#9CA3AF' }}>Loading…</div>
      ) : tickets.length === 0 ? (
        <div style={{ textAlign:'center', padding:'1.5rem', color:'#059669', fontSize:'.9375rem' }}>✓ No tickets in this view</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'.5rem' }}>
          {tickets.map(t => {
            const s = STATUS_STYLE[t.status] || STATUS_STYLE.new
            const created = new Date(t.created_at).toLocaleString('en-NZ', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
            return (
              <div key={t.id} onClick={() => setOpen(t)}
                style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:8, padding:'.75rem 1rem', cursor:'pointer' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'.75rem' }}>
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap', marginBottom:4 }}>
                      <span style={{ background:s.bg, color:s.color, fontSize:'.7rem', fontWeight:700, padding:'2px 8px', borderRadius:99 }}>{s.label}</span>
                      <span style={{ background:'#E0E7FF', color:'#4338CA', fontSize:'.7rem', fontWeight:700, padding:'2px 8px', borderRadius:99 }}>{CATEGORY_LABEL[t.category] || t.category}</span>
                      <span style={{ fontSize:'.75rem', color:'#6B7280' }}>{created}</span>
                    </div>
                    <div style={{ fontSize:'.875rem', fontWeight:700, color:'#0D2B45', marginBottom:2 }}>{t.patient_name || t.patient_email}</div>
                    <div style={{ fontSize:'.8125rem', color:'#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.message}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {open && (
        <div style={{ position:'fixed', inset:0, background:'rgba(13,43,69,0.6)', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'40px 20px', overflowY:'auto' }} onClick={() => setOpen(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background:'white', borderRadius:14, width:'100%', maxWidth:640, boxShadow:'0 20px 60px rgba(0,0,0,.3)', maxHeight:'calc(100vh - 80px)', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid #E2E8F0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:'1.125rem', fontWeight:800, color:'#0D2B45' }}>{open.patient_name || open.patient_email}</div>
                <div style={{ fontSize:'.8125rem', color:'#6B7280' }}>{CATEGORY_LABEL[open.category] || open.category} · {new Date(open.created_at).toLocaleString('en-NZ')}</div>
              </div>
              <button onClick={() => setOpen(null)} style={{ background:'none', border:'none', fontSize:'1.5rem', cursor:'pointer', color:'#6B7280', lineHeight:1 }}>×</button>
            </div>
            <div style={{ padding:'1.25rem 1.5rem', overflowY:'auto', flex:1 }}>
              <div style={{ marginBottom:'1rem', fontSize:'.8125rem', color:'#374151' }}>
                <div><strong>Email:</strong> <a href={`mailto:${open.patient_email}`} style={{ color:'#0B6E76' }}>{open.patient_email}</a></div>
                {open.patient_phone && <div><strong>Phone:</strong> {open.patient_phone}</div>}
                {open.consultation_id && <div><strong>Consult:</strong> <code>{open.consultation_id.slice(0,8)}…</code></div>}
                {open.source && <div><strong>Source:</strong> {open.source}</div>}
              </div>
              <div style={{ marginBottom:'1rem' }}>
                <PhiRevealGate
                  consultationId={open.id}
                  action="view_support_ticket_message"
                  resourceType="support_ticket"
                  resourceId={open.id}
                  summary="Patient message (contains PHI — click to view)"
                  subject={`Support ticket · ${open.category} · from ${open.patient_email}`}>
                  <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:8, padding:'.875rem 1rem' }}>
                    <div style={{ fontSize:'.7rem', color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em', fontWeight:600, marginBottom:6 }}>Patient's message</div>
                    <div style={{ fontSize:'.875rem', color:'#1A2A33', whiteSpace:'pre-wrap', lineHeight:1.6 }}>{open.message}</div>
                  </div>
                  {open.admin_notes && (
                    <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'.875rem 1rem', marginTop:'.75rem' }}>
                      <div style={{ fontSize:'.7rem', color:'#92400E', textTransform:'uppercase', letterSpacing:'.05em', fontWeight:600, marginBottom:6 }}>Reply history / notes</div>
                      <div style={{ fontSize:'.8125rem', color:'#374151', whiteSpace:'pre-wrap', lineHeight:1.6 }}>{open.admin_notes}</div>
                    </div>
                  )}
                </PhiRevealGate>
              </div>


              <div style={{ marginBottom:'1rem' }}>
                <label style={{ fontSize:'.75rem', color:'#6B7280', fontWeight:600, marginBottom:6, display:'block', textTransform:'uppercase', letterSpacing:'.04em' }}>Send reply to {open.patient_email}</label>
                <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={5}
                  placeholder="Type your reply. It will be emailed to the patient and recorded here."
                  style={{ width:'100%', padding:'.75rem', border:'1px solid #E2E8F0', borderRadius:8, fontSize:'.875rem', fontFamily:'Plus Jakarta Sans, sans-serif', resize:'vertical' }} />
                <button onClick={sendReply} disabled={busy || !replyText.trim()}
                  style={{ marginTop:'.5rem', background:'#0B6E76', border:'none', color:'white', padding:'8px 18px', borderRadius:6, cursor: busy ? 'wait' : 'pointer', fontSize:'.8125rem', fontWeight:700 }}>
                  {busy ? 'Sending…' : 'Send reply'}
                </button>
              </div>
            </div>
            <div style={{ padding:'.875rem 1.5rem', borderTop:'1px solid #E2E8F0', display:'flex', gap:'.5rem', flexWrap:'wrap', background:'#F8FAFC' }}>
              {open.status !== 'in_progress' && <button onClick={() => setStatus(open.id, 'in_progress')} disabled={busy} style={{ background:'#FEF3C7', color:'#92400E', border:'none', padding:'6px 14px', borderRadius:6, cursor:'pointer', fontSize:'.8125rem', fontWeight:700 }}>Mark in progress</button>}
              {open.status !== 'resolved' && <button onClick={() => setStatus(open.id, 'resolved')} disabled={busy} style={{ background:'#DCFCE7', color:'#065F46', border:'none', padding:'6px 14px', borderRadius:6, cursor:'pointer', fontSize:'.8125rem', fontWeight:700 }}>Mark resolved</button>}
              {open.status !== 'archived' && <button onClick={() => setStatus(open.id, 'archived')} disabled={busy} style={{ background:'white', border:'1px solid #E2E8F0', color:'#6B7280', padding:'6px 14px', borderRadius:6, cursor:'pointer', fontSize:'.8125rem', fontWeight:600 }}>Archive</button>}
              <div style={{ flex:1 }} />
              <button onClick={() => setOpen(null)} style={{ background:'white', border:'1px solid #E2E8F0', color:'#374151', padding:'6px 14px', borderRadius:6, cursor:'pointer', fontSize:'.8125rem', fontWeight:600 }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// AddProviderModal — full onboarding form for a new clinician / admin user.
// Posts to /api/providers with admin auth. Returns a plain initial PIN which
// the parent surfaces via a green banner. Auto-generates 6-digit PIN if empty.
const COLOR_SWATCHES = ['#0B6E76','#7C3AED','#DC2626','#059669','#D97706','#0EA5E9','#EC4899','#0D2B45']

// SignaturePad — canvas the provider draws their signature into during
// onboarding. Uploads the resulting PNG to Supabase Storage on demand and
// returns the public URL via the onSaved callback. Uses pointer events so
// mouse, trackpad, stylus, and touch all work uniformly.
function SignaturePad({ onSaved, disabled }) {
  const canvasRef = React.useRef(null)
  const drawingRef = React.useRef(false)
  const dirtyRef = React.useRef(false)
  const [status, setStatus] = React.useState(null) // 'saving' | 'saved' | 'error'
  const [savedUrl, setSavedUrl] = React.useState(null)
  const [errorMsg, setErrorMsg] = React.useState(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    // Fill white background so the PNG isn't transparent — PDF renderers
    // don't always composite transparent PNGs cleanly over the signature line.
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1A2A33'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function pointerPos(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (canvas.width / rect.width)
    const y = (e.clientY - rect.top) * (canvas.height / rect.height)
    return { x, y }
  }
  function onDown(e) {
    if (disabled) return
    e.preventDefault()
    const { x, y } = pointerPos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(x, y)
    drawingRef.current = true
    dirtyRef.current = true
    if (savedUrl) { setSavedUrl(null); setStatus(null) } // dirty after save
  }
  function onMove(e) {
    if (!drawingRef.current) return
    e.preventDefault()
    const { x, y } = pointerPos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  function onUp() {
    drawingRef.current = false
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1A2A33'
    ctx.lineWidth = 2.5
    dirtyRef.current = false
    setSavedUrl(null)
    setStatus(null)
    setErrorMsg(null)
    onSaved && onSaved('')
  }

  async function save() {
    if (!dirtyRef.current) return
    setStatus('saving')
    setErrorMsg(null)
    try {
      const canvas = canvasRef.current
      const blob = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('canvas.toBlob returned null')), 'image/png'))
      const { supabase } = await import('../../lib/supabase')
      const path = `sig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
      const { error: upErr } = await supabase.storage.from('signatures').upload(path, blob, { contentType: 'image/png', cacheControl: '3600', upsert: false })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('signatures').getPublicUrl(path)
      setSavedUrl(publicUrl)
      setStatus('saved')
      onSaved && onSaved(publicUrl)
    } catch (e) {
      setStatus('error')
      setErrorMsg(e.message)
    }
  }

  return (
    <div>
      <div style={{ position:'relative', border:'2px dashed #E2E8F0', borderRadius:8, background:'white', overflow:'hidden' }}>
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
          style={{ display:'block', width:'100%', height:'160px', cursor: disabled ? 'not-allowed' : 'crosshair', touchAction:'none' }}
        />
        <div style={{ position:'absolute', bottom:6, left:8, color:'#9CA3AF', fontSize:'.7rem', pointerEvents:'none' }}>Sign above the line</div>
      </div>
      <div style={{ display:'flex', gap:'.5rem', marginTop:'.5rem', alignItems:'center' }}>
        <button type="button" onClick={clear} disabled={disabled}
          style={{ background:'white', border:'1px solid #E2E8F0', color:'#374151', padding:'6px 14px', borderRadius:6, cursor:'pointer', fontSize:'.8125rem', fontWeight:600 }}>
          Clear
        </button>
        <button type="button" onClick={save} disabled={disabled || status === 'saving'}
          style={{ background:'#0B6E76', border:'none', color:'white', padding:'6px 14px', borderRadius:6, cursor:'pointer', fontSize:'.8125rem', fontWeight:700, opacity: status === 'saving' ? 0.6 : 1 }}>
          {status === 'saving' ? 'Saving…' : 'Save signature'}
        </button>
        {status === 'saved' && <span style={{ fontSize:'.75rem', color:'#059669', fontWeight:600 }}>✓ Saved</span>}
        {status === 'error' && <span style={{ fontSize:'.75rem', color:'#DC2626', fontWeight:600 }}>Save failed: {errorMsg}</span>}
      </div>
    </div>
  )
}

function AddProviderModal({ onClose, onCreated, prefill = {} }) {
  const [form, setForm] = React.useState({
    first_name: prefill.first_name || '',
    last_name:  prefill.last_name || '',
    email:      prefill.email || '',
    credential: prefill.credential || 'Dr',
    specialty:  prefill.specialty || '',
    color:      prefill.color || '#0B6E76',
    is_provider: true,
    is_admin: false,
    is_supervisor: false,
    can_prescribe: true,
    can_refer: true,
    can_acc: true,
    prescriber_number: '',
    cpn: '',
    hpi_number: '',
    acc_provider_number: '',
    // Payroll
    contract_type: 'contractor',
    base_rate: '',
    hourly_rate: '',
    holiday_pay_pct: '8',
    bank_account: '',
    ird_number: '',
    tax_code: 'M',
    // Signature
    signature_url: '',
    // Auth
    pin: '',
  })
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState(null)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e) {
    e?.preventDefault()
    setError(null)
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      setError('First name, last name, and email are required')
      return
    }
    if (form.pin && !/^\d{4,8}$/.test(form.pin)) {
      setError('PIN must be 4–8 digits, or leave blank to auto-generate')
      return
    }
    setSubmitting(true)
    try {
      const { apiFetch } = await import('../../lib/api')
      // Normalise payroll numerics — send as numbers, empty strings become null so
      // the endpoint doesn't try to parse "" as numeric.
      const payload = { ...form }
      for (const k of ['base_rate', 'hourly_rate', 'holiday_pay_pct']) {
        if (payload[k] === '' || payload[k] == null) delete payload[k]
        else payload[k] = Number(payload[k])
      }
      const res = await apiFetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create provider')
      onCreated(data)
    } catch (e) {
      setError(e.message)
      setSubmitting(false)
    }
  }

  const inputStyle = { width:'100%', padding:'8px 10px', border:'1px solid #E2E8F0', borderRadius:6, fontSize:'.875rem', fontFamily:'Plus Jakarta Sans, sans-serif' }
  const labelStyle = { fontSize:'.75rem', color:'#6B7280', fontWeight:600, marginBottom:4, textTransform:'uppercase', letterSpacing:'.04em' }
  const checkboxStyle = { display:'flex', alignItems:'center', gap:8, cursor:'pointer', padding:'6px 10px', border:'1px solid #E2E8F0', borderRadius:6, background:'#F8FAFC' }
  const groupStyle = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem' }
  const sectionStyle = { padding:'1rem 1.25rem', background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:8, marginBottom:'.75rem' }
  const sectionTitle = { fontSize:'.8125rem', fontWeight:700, color:'#0D2B45', marginBottom:'.75rem', textTransform:'uppercase', letterSpacing:'.04em' }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(13,43,69,0.6)', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'40px 20px', overflowY:'auto' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background:'white', borderRadius:14, width:'100%', maxWidth:640, boxShadow:'0 20px 60px rgba(0,0,0,.3)', maxHeight:'calc(100vh - 80px)', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid #E2E8F0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:'1.125rem', fontWeight:800, color:'#0D2B45' }}>Add provider</div>
            <div style={{ fontSize:'.8125rem', color:'#6B7280', marginTop:2 }}>Onboard a new clinician or admin user</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'1.5rem', cursor:'pointer', color:'#6B7280', lineHeight:1 }}>×</button>
        </div>

        <form onSubmit={submit} style={{ padding:'1.25rem 1.5rem', overflowY:'auto', flex:1 }}>
          {error && (
            <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', padding:'.625rem .875rem', borderRadius:8, fontSize:'.8125rem', marginBottom:'1rem' }}>{error}</div>
          )}

          {/* Identity */}
          <div style={sectionStyle}>
            <div style={sectionTitle}>Identity</div>
            <div style={groupStyle}>
              <div>
                <div style={labelStyle}>First name *</div>
                <input value={form.first_name} onChange={e => set('first_name', e.target.value)} style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>Last name *</div>
                <input value={form.last_name} onChange={e => set('last_name', e.target.value)} style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>Email *</div>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>Credential</div>
                <select value={form.credential} onChange={e => set('credential', e.target.value)} style={inputStyle}>
                  <option value="Dr">Dr</option>
                  <option value="RN">RN</option>
                  <option value="NP">NP</option>
                  <option value="Nurse">Nurse</option>
                  <option value="Paramedic">Paramedic</option>
                  <option value="Ms">Ms</option>
                  <option value="Mr">Mr</option>
                  <option value="">(none)</option>
                </select>
              </div>
              <div>
                <div style={labelStyle}>Specialty</div>
                <input value={form.specialty} onChange={e => set('specialty', e.target.value)} placeholder="e.g. Emergency Medicine" style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>Colour</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {COLOR_SWATCHES.map(c => (
                    <button key={c} type="button" onClick={() => set('color', c)}
                      style={{ width:26, height:26, borderRadius:'50%', background:c, border: form.color === c ? '2px solid #0D2B45' : '2px solid transparent', cursor:'pointer', padding:0 }} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Roles */}
          <div style={sectionStyle}>
            <div style={sectionTitle}>Roles</div>
            <div style={groupStyle}>
              <label style={checkboxStyle}><input type="checkbox" checked={form.is_provider} onChange={e => set('is_provider', e.target.checked)} /> <span style={{ fontSize:'.875rem' }}>Clinical provider</span></label>
              <label style={checkboxStyle}><input type="checkbox" checked={form.is_admin} onChange={e => set('is_admin', e.target.checked)} /> <span style={{ fontSize:'.875rem' }}>Admin</span></label>
              <label style={checkboxStyle}><input type="checkbox" checked={form.is_supervisor} onChange={e => set('is_supervisor', e.target.checked)} /> <span style={{ fontSize:'.875rem' }}>Supervisor</span></label>
            </div>
          </div>

          {/* Capabilities */}
          {form.is_provider && (
            <div style={sectionStyle}>
              <div style={sectionTitle}>Clinical capabilities</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'.5rem', marginBottom:'.75rem' }}>
                <label style={checkboxStyle}><input type="checkbox" checked={form.can_prescribe} onChange={e => set('can_prescribe', e.target.checked)} /> <span style={{ fontSize:'.875rem' }}>Can prescribe</span></label>
                <label style={checkboxStyle}><input type="checkbox" checked={form.can_refer} onChange={e => set('can_refer', e.target.checked)} /> <span style={{ fontSize:'.875rem' }}>Can refer</span></label>
                <label style={checkboxStyle}><input type="checkbox" checked={form.can_acc} onChange={e => set('can_acc', e.target.checked)} /> <span style={{ fontSize:'.875rem' }}>Can lodge ACC</span></label>
              </div>
              <div style={groupStyle}>
                <div>
                  <div style={labelStyle}>MCNZ prescriber number</div>
                  <input value={form.prescriber_number} onChange={e => set('prescriber_number', e.target.value)} style={inputStyle} placeholder="e.g. 12345" />
                </div>
                <div>
                  <div style={labelStyle}>HPI-CPN</div>
                  <input value={form.cpn} onChange={e => set('cpn', e.target.value)} style={inputStyle} placeholder="Common Person Number" />
                </div>
                <div>
                  <div style={labelStyle}>HPI number</div>
                  <input value={form.hpi_number} onChange={e => set('hpi_number', e.target.value)} style={inputStyle} placeholder="Provider HPI" />
                </div>
                <div>
                  <div style={labelStyle}>ACC provider number</div>
                  <input value={form.acc_provider_number} onChange={e => set('acc_provider_number', e.target.value)} style={inputStyle} placeholder="ACC vendor" />
                </div>
              </div>
            </div>
          )}

          {/* Signature — drawn during onboarding, uploaded on Save */}
          {form.is_provider && form.can_prescribe && (
            <div style={sectionStyle}>
              <div style={sectionTitle}>Prescriber signature</div>
              <div style={{ fontSize:'.75rem', color:'#6B7280', marginBottom:'.75rem' }}>
                The provider signs directly here — draw with mouse, trackpad, stylus, or finger (touchscreen). Click <strong>Save signature</strong> when it looks right, then <strong>Clear</strong> and redraw if needed. Rendered on prescription PDFs.
              </div>
              <SignaturePad onSaved={url => set('signature_url', url)} />
            </div>
          )}

          {/* Payroll */}
          <div style={sectionStyle}>
            <div style={sectionTitle}>Payroll & tax</div>
            <div style={{ fontSize:'.7rem', color:'#DC2626', marginBottom:'.75rem', fontWeight:600 }}>
              🔒 Sensitive — visible only to admin roles.
            </div>
            <div style={groupStyle}>
              <div>
                <div style={labelStyle}>Contract type</div>
                <select value={form.contract_type} onChange={e => set('contract_type', e.target.value)} style={inputStyle}>
                  <option value="contractor">Contractor</option>
                  <option value="employee">Employee</option>
                </select>
              </div>
              <div>
                <div style={labelStyle}>Tax code</div>
                <select value={form.tax_code} onChange={e => set('tax_code', e.target.value)} style={inputStyle}>
                  <option value="M">M (primary income)</option>
                  <option value="ME">ME (main earner)</option>
                  <option value="S">S (secondary)</option>
                  <option value="SB">SB (secondary, low)</option>
                  <option value="SH">SH (secondary, med)</option>
                  <option value="ST">ST (secondary, top)</option>
                  <option value="WT">WT (withholding tax — contractor)</option>
                </select>
              </div>
              <div>
                <div style={labelStyle}>Base rate ($NZD / consultation)</div>
                <input type="number" step="0.01" value={form.base_rate} onChange={e => set('base_rate', e.target.value)} style={inputStyle} placeholder="e.g. 45.00" />
              </div>
              <div>
                <div style={labelStyle}>Hourly rate ($NZD, optional)</div>
                <input type="number" step="0.01" value={form.hourly_rate} onChange={e => set('hourly_rate', e.target.value)} style={inputStyle} placeholder="e.g. 120.00" />
              </div>
              <div>
                <div style={labelStyle}>Holiday pay %</div>
                <input type="number" step="0.1" value={form.holiday_pay_pct} onChange={e => set('holiday_pay_pct', e.target.value)} style={inputStyle} placeholder="8" />
              </div>
              <div>
                <div style={labelStyle}>IRD number</div>
                <input value={form.ird_number} onChange={e => set('ird_number', e.target.value)} style={inputStyle} placeholder="123-456-789" />
              </div>
              <div style={{ gridColumn:'1 / -1' }}>
                <div style={labelStyle}>Bank account</div>
                <input value={form.bank_account} onChange={e => set('bank_account', e.target.value)} style={inputStyle} placeholder="01-1234-5678910-00" />
              </div>
            </div>
          </div>

          {/* PIN */}
          <div style={sectionStyle}>
            <div style={sectionTitle}>Login PIN</div>
            <div>
              <div style={labelStyle}>Initial PIN (4–8 digits) — leave blank to auto-generate</div>
              <input value={form.pin} onChange={e => set('pin', e.target.value.replace(/[^0-9]/g,'').slice(0,8))} style={{ ...inputStyle, fontFamily:'monospace', fontSize:'1rem', letterSpacing:'.1em' }} placeholder="Leave blank to auto-generate" />
              <div style={{ fontSize:'.75rem', color:'#6B7280', marginTop:6 }}>Provider will be forced to change this PIN on first login.</div>
            </div>
          </div>
        </form>

        <div style={{ padding:'1rem 1.5rem', borderTop:'1px solid #E2E8F0', display:'flex', justifyContent:'flex-end', gap:'.5rem', background:'#F8FAFC' }}>
          <button onClick={onClose} type="button" disabled={submitting} style={{ background:'white', border:'1px solid #E2E8F0', color:'#374151', padding:'8px 18px', borderRadius:6, cursor:'pointer', fontSize:'.875rem', fontWeight:600 }}>Cancel</button>
          <button onClick={submit} disabled={submitting} style={{ background:'#0B6E76', border:'none', color:'white', padding:'8px 18px', borderRadius:6, cursor: submitting ? 'wait' : 'pointer', fontSize:'.875rem', fontWeight:700, opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Creating…' : 'Create provider'}
          </button>
        </div>
      </div>
    </div>
  )
}

// EditProviderModal — edit an existing provider's editable fields, including
// re-signing the prescriber signature. Email + PIN are deliberately not
// editable here (email is identity; PIN goes through a separate rotation flow).
function EditProviderModal({ provider, onClose, onSaved }) {
  const [form, setForm] = React.useState({
    first_name: provider.first_name || '',
    last_name:  provider.last_name || '',
    credential: provider.credential || 'Dr',
    specialty:  provider.specialty || '',
    color:      provider.color || '#0B6E76',
    is_provider: !!provider.is_provider,
    is_admin: !!provider.is_admin,
    is_supervisor: !!provider.is_supervisor,
    is_available: !!provider.is_available,
    availability_message: provider.availability_message || '',
    can_prescribe: !!provider.can_prescribe,
    can_refer: !!provider.can_refer,
    can_acc: !!provider.can_acc,
    prescriber_number: provider.prescriber_number || '',
    cpn: provider.cpn || '',
    hpi_number: provider.hpi_number || '',
    acc_provider_number: provider.acc_provider_number || '',
    contract_type: provider.contract_type || 'contractor',
    base_rate: provider.base_rate ?? '',
    hourly_rate: provider.hourly_rate ?? '',
    holiday_pay_pct: provider.holiday_pay_pct ?? 8,
    bank_account: provider.bank_account || '',
    ird_number: provider.ird_number || '',
    tax_code: provider.tax_code || 'M',
    signature_url: provider.signature_url || '',
  })
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState(null)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e) {
    e?.preventDefault()
    setError(null)
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First name and last name are required'); return
    }
    setSubmitting(true)
    try {
      const { apiFetch } = await import('../../lib/api')
      const payload = { ...form }
      for (const k of ['base_rate', 'hourly_rate', 'holiday_pay_pct']) {
        if (payload[k] === '' || payload[k] == null) delete payload[k]
        else payload[k] = Number(payload[k])
      }
      const res = await apiFetch(`/api/providers?id=${provider.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      onSaved(data.provider)
    } catch (e) { setError(e.message); setSubmitting(false) }
  }

  const inputStyle = { width:'100%', padding:'8px 10px', border:'1px solid #E2E8F0', borderRadius:6, fontSize:'.875rem', fontFamily:'Plus Jakarta Sans, sans-serif' }
  const labelStyle = { fontSize:'.75rem', color:'#6B7280', fontWeight:600, marginBottom:4, textTransform:'uppercase', letterSpacing:'.04em' }
  const checkboxStyle = { display:'flex', alignItems:'center', gap:8, cursor:'pointer', padding:'6px 10px', border:'1px solid #E2E8F0', borderRadius:6, background:'#F8FAFC' }
  const groupStyle = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem' }
  const sectionStyle = { padding:'1rem 1.25rem', background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:8, marginBottom:'.75rem' }
  const sectionTitle = { fontSize:'.8125rem', fontWeight:700, color:'#0D2B45', marginBottom:'.75rem', textTransform:'uppercase', letterSpacing:'.04em' }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(13,43,69,0.6)', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'40px 20px', overflowY:'auto' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background:'white', borderRadius:14, width:'100%', maxWidth:640, boxShadow:'0 20px 60px rgba(0,0,0,.3)', maxHeight:'calc(100vh - 80px)', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid #E2E8F0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:'1.125rem', fontWeight:800, color:'#0D2B45' }}>Edit provider</div>
            <div style={{ fontSize:'.8125rem', color:'#6B7280', marginTop:2 }}>{provider.first_name} {provider.last_name} · {provider.email}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'1.5rem', cursor:'pointer', color:'#6B7280', lineHeight:1 }}>×</button>
        </div>

        <form onSubmit={submit} style={{ padding:'1.25rem 1.5rem', overflowY:'auto', flex:1 }}>
          {error && (
            <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', padding:'.625rem .875rem', borderRadius:8, fontSize:'.8125rem', marginBottom:'1rem' }}>{error}</div>
          )}

          <div style={sectionStyle}>
            <div style={sectionTitle}>Identity</div>
            <div style={groupStyle}>
              <div><div style={labelStyle}>First name *</div><input value={form.first_name} onChange={e => set('first_name', e.target.value)} style={inputStyle} /></div>
              <div><div style={labelStyle}>Last name *</div><input value={form.last_name} onChange={e => set('last_name', e.target.value)} style={inputStyle} /></div>
              <div>
                <div style={labelStyle}>Credential</div>
                <select value={form.credential} onChange={e => set('credential', e.target.value)} style={inputStyle}>
                  <option value="Dr">Dr</option><option value="RN">RN</option><option value="NP">NP</option>
                  <option value="Nurse">Nurse</option><option value="Paramedic">Paramedic</option>
                  <option value="Ms">Ms</option><option value="Mr">Mr</option><option value="">(none)</option>
                </select>
              </div>
              <div><div style={labelStyle}>Specialty</div><input value={form.specialty} onChange={e => set('specialty', e.target.value)} style={inputStyle} /></div>
              <div>
                <div style={labelStyle}>Colour</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {COLOR_SWATCHES.map(c => (
                    <button key={c} type="button" onClick={() => set('color', c)}
                      style={{ width:26, height:26, borderRadius:'50%', background:c, border: form.color === c ? '2px solid #0D2B45' : '2px solid transparent', cursor:'pointer', padding:0 }} />
                  ))}
                </div>
              </div>
              <div>
                <div style={labelStyle}>Availability message</div>
                <input value={form.availability_message} onChange={e => set('availability_message', e.target.value)} style={inputStyle} placeholder="Optional" />
              </div>
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={sectionTitle}>Roles</div>
            <div style={groupStyle}>
              <label style={checkboxStyle}><input type="checkbox" checked={form.is_provider} onChange={e => set('is_provider', e.target.checked)} /> <span style={{ fontSize:'.875rem' }}>Clinical provider</span></label>
              <label style={checkboxStyle}><input type="checkbox" checked={form.is_admin} onChange={e => set('is_admin', e.target.checked)} /> <span style={{ fontSize:'.875rem' }}>Admin</span></label>
              <label style={checkboxStyle}><input type="checkbox" checked={form.is_supervisor} onChange={e => set('is_supervisor', e.target.checked)} /> <span style={{ fontSize:'.875rem' }}>Supervisor</span></label>
              <label style={checkboxStyle}><input type="checkbox" checked={form.is_available} onChange={e => set('is_available', e.target.checked)} /> <span style={{ fontSize:'.875rem' }}>Available now</span></label>
            </div>
          </div>

          {form.is_provider && (
            <div style={sectionStyle}>
              <div style={sectionTitle}>Clinical capabilities</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'.5rem', marginBottom:'.75rem' }}>
                <label style={checkboxStyle}><input type="checkbox" checked={form.can_prescribe} onChange={e => set('can_prescribe', e.target.checked)} /> <span style={{ fontSize:'.875rem' }}>Can prescribe</span></label>
                <label style={checkboxStyle}><input type="checkbox" checked={form.can_refer} onChange={e => set('can_refer', e.target.checked)} /> <span style={{ fontSize:'.875rem' }}>Can refer</span></label>
                <label style={checkboxStyle}><input type="checkbox" checked={form.can_acc} onChange={e => set('can_acc', e.target.checked)} /> <span style={{ fontSize:'.875rem' }}>Can lodge ACC</span></label>
              </div>
              <div style={groupStyle}>
                <div><div style={labelStyle}>MCNZ prescriber number</div><input value={form.prescriber_number} onChange={e => set('prescriber_number', e.target.value)} style={inputStyle} /></div>
                <div><div style={labelStyle}>HPI-CPN</div><input value={form.cpn} onChange={e => set('cpn', e.target.value)} style={inputStyle} /></div>
                <div><div style={labelStyle}>HPI number</div><input value={form.hpi_number} onChange={e => set('hpi_number', e.target.value)} style={inputStyle} /></div>
                <div><div style={labelStyle}>ACC provider number</div><input value={form.acc_provider_number} onChange={e => set('acc_provider_number', e.target.value)} style={inputStyle} /></div>
              </div>
            </div>
          )}

          {form.is_provider && form.can_prescribe && (
            <div style={sectionStyle}>
              <div style={sectionTitle}>Prescriber signature</div>
              {form.signature_url && (
                <div style={{ marginBottom:'.75rem', padding:'.5rem', background:'white', border:'1px solid #E2E8F0', borderRadius:6 }}>
                  <div style={{ fontSize:'.7rem', color:'#6B7280', marginBottom:4, fontWeight:600 }}>Current signature on file:</div>
                  <img src={form.signature_url} alt="current signature" style={{ maxHeight:60, maxWidth:'100%', display:'block' }} />
                </div>
              )}
              <div style={{ fontSize:'.75rem', color:'#6B7280', marginBottom:'.5rem' }}>Draw below to replace the current signature. Leaving it blank keeps the existing one.</div>
              <SignaturePad onSaved={url => url && set('signature_url', url)} />
            </div>
          )}

          <div style={sectionStyle}>
            <div style={sectionTitle}>Payroll & tax</div>
            <div style={{ fontSize:'.7rem', color:'#DC2626', marginBottom:'.75rem', fontWeight:600 }}>🔒 Sensitive — visible only to admin roles.</div>
            <div style={groupStyle}>
              <div>
                <div style={labelStyle}>Contract type</div>
                <select value={form.contract_type} onChange={e => set('contract_type', e.target.value)} style={inputStyle}>
                  <option value="contractor">Contractor</option><option value="employee">Employee</option>
                </select>
              </div>
              <div>
                <div style={labelStyle}>Tax code</div>
                <select value={form.tax_code} onChange={e => set('tax_code', e.target.value)} style={inputStyle}>
                  <option value="M">M</option><option value="ME">ME</option><option value="S">S</option>
                  <option value="SB">SB</option><option value="SH">SH</option><option value="ST">ST</option>
                  <option value="WT">WT (contractor)</option>
                </select>
              </div>
              <div><div style={labelStyle}>Base rate ($NZD / consult)</div><input type="number" step="0.01" value={form.base_rate} onChange={e => set('base_rate', e.target.value)} style={inputStyle} /></div>
              <div><div style={labelStyle}>Hourly rate ($NZD, optional)</div><input type="number" step="0.01" value={form.hourly_rate} onChange={e => set('hourly_rate', e.target.value)} style={inputStyle} /></div>
              <div><div style={labelStyle}>Holiday pay %</div><input type="number" step="0.1" value={form.holiday_pay_pct} onChange={e => set('holiday_pay_pct', e.target.value)} style={inputStyle} /></div>
              <div><div style={labelStyle}>IRD number</div><input value={form.ird_number} onChange={e => set('ird_number', e.target.value)} style={inputStyle} /></div>
              <div style={{ gridColumn:'1 / -1' }}><div style={labelStyle}>Bank account</div><input value={form.bank_account} onChange={e => set('bank_account', e.target.value)} style={inputStyle} /></div>
            </div>
          </div>
        </form>

        <div style={{ padding:'1rem 1.5rem', borderTop:'1px solid #E2E8F0', display:'flex', justifyContent:'flex-end', gap:'.5rem', background:'#F8FAFC' }}>
          <button onClick={onClose} type="button" disabled={submitting} style={{ background:'white', border:'1px solid #E2E8F0', color:'#374151', padding:'8px 18px', borderRadius:6, cursor:'pointer', fontSize:'.875rem', fontWeight:600 }}>Cancel</button>
          <button onClick={submit} disabled={submitting} style={{ background:'#0B6E76', border:'none', color:'white', padding:'8px 18px', borderRadius:6, cursor: submitting ? 'wait' : 'pointer', fontSize:'.875rem', fontWeight:700, opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProvidersPanel() {
  const [providers, setProviders] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(null)
  const [addOpen, setAddOpen] = React.useState(false)
  const [editing, setEditing] = React.useState(null)
  const [createdNotice, setCreatedNotice] = React.useState(null)

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
        <div style={{ display:'flex', gap:'.5rem' }}>
          <button onClick={() => setAddOpen(true)} style={{ background:'#0B6E76', border:'none', color:'white', padding:'6px 14px', borderRadius:6, cursor:'pointer', fontSize:'.8125rem', fontWeight:700 }}>+ Add provider</button>
          <button onClick={load} style={{ background:'#F0F9FA', border:'none', color:'#0B6E76', padding:'6px 12px', borderRadius:6, cursor:'pointer', fontSize:'.8125rem', fontWeight:600 }}>↻ Refresh</button>
        </div>
      </div>
      {createdNotice && (
        <div style={{ background:'#F0FDF4', border:'1px solid #86EFAC', borderRadius:8, padding:'.875rem 1rem', marginBottom:'1rem', fontSize:'.875rem' }}>
          <div style={{ color:'#065F46', fontWeight:700, marginBottom:4 }}>✓ Provider created: {createdNotice.provider.first_name} {createdNotice.provider.last_name}</div>
          <div style={{ color:'#065F46' }}>
            Initial PIN: <code style={{ background:'white', padding:'2px 8px', borderRadius:4, fontSize:'1rem', fontWeight:700, letterSpacing:'.15em' }}>{createdNotice.initialPin}</code>
            &nbsp;— share with them securely. They'll be prompted to change it on first login.
          </div>
          <button onClick={() => setCreatedNotice(null)} style={{ marginTop:8, background:'none', border:'none', color:'#0B6E76', cursor:'pointer', fontSize:'.8125rem', fontWeight:600, padding:0 }}>Dismiss</button>
        </div>
      )}
      {addOpen && (
        <AddProviderModal
          onClose={() => setAddOpen(false)}
          onCreated={(payload) => {
            setAddOpen(false)
            setCreatedNotice(payload)
            load()
          }}
        />
      )}
      {editing && (
        <EditProviderModal
          provider={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
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
                    <button onClick={() => setEditing(p)} disabled={saving === p.id}
                      style={{ background:'#F0F9FA', color:'#0B6E76', border:'none', padding:'4px 12px', borderRadius:6, cursor:'pointer', fontSize:'.75rem', fontFamily:'Plus Jakarta Sans, sans-serif', whiteSpace:'nowrap', fontWeight:600 }}>
                      Edit
                    </button>
                    <button onClick={() => update(p.id, { is_active: !p.is_active })}
                      disabled={saving === p.id}
                      style={{ background:'none', border:`1px solid ${p.is_active ? '#FECACA' : '#D1FAE5'}`, color:p.is_active ? '#DC2626' : '#059669', padding:'4px 10px', borderRadius:6, cursor:'pointer', fontSize:'.75rem', fontFamily:'Plus Jakarta Sans, sans-serif', whiteSpace:'nowrap' }}>
                      {p.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={async () => {
                      const confirmed = window.confirm(`Permanently delete ${p.first_name} ${p.last_name}? This is irreversible.\n\nIf they have any consultation history, deletion will be refused and you should Deactivate instead.`)
                      if (!confirmed) return
                      setSaving(p.id)
                      try {
                        const { apiFetch } = await import('../../lib/api')
                        const r = await apiFetch(`/api/providers?id=${p.id}`, { method: 'DELETE' })
                        const data = await r.json()
                        if (!r.ok) {
                          alert(data.error || 'Delete failed')
                        } else {
                          setProviders(ps => ps.filter(q => q.id !== p.id))
                        }
                      } catch (e) { alert(e.message) }
                      setSaving(null)
                    }} disabled={saving === p.id}
                      style={{ background:'none', border:'1px solid #FECACA', color:'#991B1B', padding:'4px 10px', borderRadius:6, cursor:'pointer', fontSize:'.75rem', fontFamily:'Plus Jakarta Sans, sans-serif', whiteSpace:'nowrap' }}>
                      Delete
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
  const [showReveal, setShowReveal] = React.useState(false)
  const isProvider = sessionStorage.getItem('providerIsProvider') === 'true'
  const isBillingAdmin = sessionStorage.getItem('providerIsBillingAdmin') === 'true'
  // Providers have direct clinical need → auto-revealed. Billing admins never reveal.
  const [revealed, setRevealed] = React.useState(() => isProvider || sessionStorage.getItem('tere_consultlog_revealed') === 'true')

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
          {!isBillingAdmin && !revealed && (
            <button onClick={() => setShowReveal(true)}
              style={{ background:'#FEF3C7', color:'#78350F', border:'1px solid #FCD34D', padding:'7px 12px', borderRadius:8, cursor:'pointer', fontSize:'.8125rem', fontWeight:700, fontFamily:'Plus Jakarta Sans, sans-serif', whiteSpace:'nowrap' }}>
              🔒 Reveal clinical detail
            </button>
          )}
          {!isBillingAdmin && revealed && (
            <span style={{ background:'#D1FAE5', color:'#065F46', padding:'6px 10px', borderRadius:8, fontSize:'.75rem', fontWeight:700, whiteSpace:'nowrap' }}>🔓 Revealed · audited</span>
          )}
          <button onClick={exportAccCsv} style={{ background:'#EFF6FF', color:'#1D4ED8', border:'1px solid #BFDBFE', padding:'7px 12px', borderRadius:8, cursor:'pointer', fontSize:'.8125rem', fontWeight:600, fontFamily:'Plus Jakarta Sans, sans-serif', whiteSpace:'nowrap' }}>↓ ACC export</button>
          <input
            placeholder={revealed ? 'Search patient or complaint…' : 'Search patient…'}
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding:'7px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontSize:'.875rem', fontFamily:'Plus Jakarta Sans, sans-serif', width:200 }}
          />
        </div>
      </div>
      {showReveal && (
        <ReasonPicker
          open={true}
          subject={`Consultation log · ${rows.length} rows`}
          onCancel={() => setShowReveal(false)}
          onConfirm={async ({ reason, reason_notes }) => {
            try {
              await apiFetch('/api/audit-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'view_consultation_log_bulk',
                  reason, reason_notes,
                  resource_type: 'consultation_list',
                  metadata: { row_count: rows.length, view_scope: 'admin_consultation_log' },
                }),
              })
            } catch {}
            sessionStorage.setItem('tere_consultlog_revealed', 'true')
            setRevealed(true)
            setShowReveal(false)
          }}
        />
      )}
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
                  <td style={{ padding:'8px', color:'#6B7280', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {isBillingAdmin ? <span style={{ color:'#94A3B8', fontStyle:'italic' }}>—</span> : revealed ? r.chief_complaint : <span style={{ color:'#94A3B8' }}>🔒 hidden</span>}
                  </td>
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
      const { getRecentPrescriptions } = await import('../../lib/supabase')
      const since = new Date()
      since.setDate(since.getDate() - 30)
      const data = await getRecentPrescriptions(since.toISOString())
      setRows(data)
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
  const [subTab, setSubTab] = React.useState('listings')
  const NAVY = '#0D2B45', TEAL = '#0B6E76'
  const tabBtn = (active) => ({
    background: active ? TEAL : '#F7F5F0',
    color: active ? 'white' : NAVY,
    border: 'none', padding: '8px 16px', borderRadius: 99, cursor: 'pointer',
    fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: '.875rem',
  })
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: '1rem' }}>
        <button onClick={() => setSubTab('listings')}   style={tabBtn(subTab === 'listings')}>📋 Job listings</button>
        <button onClick={() => setSubTab('applicants')} style={tabBtn(subTab === 'applicants')}>👤 Applicants</button>
      </div>
      {subTab === 'listings' ? <JobListingsSection /> : <ApplicantsSection />}
    </div>
  )
}

function JobListingsSection() {
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
      const { getJobListings } = await import('../../lib/supabase')
      const data = await getJobListings()
      setListings(data)
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

// ── Applicants ────────────────────────────────────────────────────────────────

const APPLICANT_STATUSES = [
  { key: 'new',        label: 'New',        color: '#1D4ED8', bg: '#EFF6FF' },
  { key: 'reviewing',  label: 'Reviewing',  color: '#7C3AED', bg: '#F5F3FF' },
  { key: 'interview',  label: 'Interview',  color: '#0B6E76', bg: '#F0FDFA' },
  { key: 'offer',      label: 'Offer',      color: '#D97706', bg: '#FEF3C7' },
  { key: 'hired',      label: 'Hired',      color: '#065F46', bg: '#D1FAE5' },
  { key: 'rejected',   label: 'Rejected',   color: '#991B1B', bg: '#FEE2E2' },
  { key: 'withdrawn',  label: 'Withdrawn',  color: '#6B7280', bg: '#F3F4F6' },
]
const STATUS_BY_KEY = Object.fromEntries(APPLICANT_STATUSES.map(s => [s.key, s]))

function StatusPill({ status }) {
  const s = STATUS_BY_KEY[status] || { label: status, color: '#6B7280', bg: '#F3F4F6' }
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: '.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
      {s.label}
    </span>
  )
}

function ApplicantsSection() {
  const [applicants, setApplicants] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [statusFilter, setStatusFilter] = React.useState('active')  // 'active' | 'archived' | any status key
  const [openId, setOpenId] = React.useState(null)

  async function load() {
    setLoading(true)
    try {
      const { getJobApplications } = await import('../../lib/supabase')
      const opts = statusFilter === 'archived'
        ? { archived: true }
        : (statusFilter === 'active' ? {} : { status: statusFilter })
      const data = await getJobApplications(opts)
      setApplicants(data)
    } catch { setApplicants([]) }
    setLoading(false)
  }
  React.useEffect(() => { load() }, [statusFilter])

  const card = { background: 'white', borderRadius: 12, padding: '1.5rem', marginBottom: '1rem', border: '1px solid #E2E8F0' }
  const chip = (active) => ({
    background: active ? '#0D2B45' : '#F1F5F9', color: active ? 'white' : '#6B7280',
    border: 'none', padding: '5px 12px', borderRadius: 99, cursor: 'pointer',
    fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.75rem', fontWeight: 700,
  })

  const counts = React.useMemo(() => {
    const m = { active: 0 }
    for (const a of applicants) {
      m.active++
      m[a.status] = (m[a.status] || 0) + 1
    }
    return m
  }, [applicants])

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0D2B45', marginBottom: '.25rem' }}>Applicants</div>
          <div style={{ fontSize: '.875rem', color: '#6B7280' }}>Submissions from /careers/apply.</div>
        </div>
        <button onClick={load} style={{ background: '#F0F9FA', border: 'none', color: '#0B6E76', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '.8125rem', fontWeight: 600 }}>↻ Refresh</button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button onClick={() => setStatusFilter('active')} style={chip(statusFilter === 'active')}>All active</button>
        {APPLICANT_STATUSES.map(s => (
          <button key={s.key} onClick={() => setStatusFilter(s.key)} style={chip(statusFilter === s.key)}>
            {s.label}{counts[s.key] ? ` · ${counts[s.key]}` : ''}
          </button>
        ))}
        <button onClick={() => setStatusFilter('archived')} style={chip(statusFilter === 'archived')}>Archived</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF' }}>Loading…</div>
      ) : applicants.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF' }}>
          {statusFilter === 'active' ? 'No applicants yet.' : `No applicants match "${statusFilter}".`}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          {applicants.map(a => (
            <div key={a.id} onClick={() => setOpenId(a.id)} style={{
              background: '#F8FAFC', borderRadius: 8, padding: '.75rem 1rem', border: '1px solid #E2E8F0',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.125rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: '.9rem', color: '#0D2B45' }}>
                    {a.first_name} {a.last_name}
                  </span>
                  <StatusPill status={a.status} />
                  {a.job_listing?.title && (
                    <span style={{ background: '#EFF6FF', color: '#1D4ED8', fontSize: '.6875rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99 }}>
                      {a.job_listing.title}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '.75rem', color: '#6B7280' }}>
                  {a.email}{a.phone ? ` · ${a.phone}` : ''} · Applied {new Date(a.applied_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <span style={{ color: '#9CA3AF', fontSize: '.875rem' }}>→</span>
            </div>
          ))}
        </div>
      )}

      {openId && <ApplicantDetail id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  )
}

function ApplicantDetail({ id, onClose, onChanged }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [noteText, setNoteText] = React.useState('')

  async function load() {
    setLoading(true)
    try {
      const { getJobApplication } = await import('../../lib/supabase')
      const d = await getJobApplication(id)
      setData(d)
    } catch { setData(null) }
    setLoading(false)
  }
  React.useEffect(() => { load() }, [id])

  async function setStatus(next) {
    setSaving(true)
    try {
      const { updateJobApplication } = await import('../../lib/supabase')
      await updateJobApplication(id, { status: next })
      await load()
      onChanged?.()
    } finally { setSaving(false) }
  }
  async function toggleArchive() {
    setSaving(true)
    try {
      const { updateJobApplication } = await import('../../lib/supabase')
      await updateJobApplication(id, { archived: !data?.application?.archived })
      await load()
      onChanged?.()
    } finally { setSaving(false) }
  }
  async function addNote() {
    if (!noteText.trim()) return
    setSaving(true)
    try {
      const { addApplicationNote } = await import('../../lib/supabase')
      await addApplicationNote(id, noteText.trim())
      setNoteText('')
      await load()
    } finally { setSaving(false) }
  }
  async function toggleStep(stepId, done) {
    setSaving(true)
    try {
      const { updateOnboardingStep } = await import('../../lib/supabase')
      await updateOnboardingStep(stepId, { done })
      await load()
    } finally { setSaving(false) }
  }

  const backdrop = { position: 'fixed', inset: 0, background: 'rgba(13,43,69,.55)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', overflowY: 'auto' }
  const modal    = { background: 'white', borderRadius: 16, maxWidth: 720, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,.25)', border: '1px solid #E2E8F0', maxHeight: '92vh', overflowY: 'auto' }
  const section  = { padding: '1.25rem 1.5rem', borderTop: '1px solid #F1F5F9' }
  const label    = { display: 'block', fontSize: '.75rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem' }
  const btn = (variant) => {
    const map = {
      primary: { background: '#0B6E76', color: 'white' },
      danger:  { background: '#FEE2E2', color: '#DC2626' },
      ghost:   { background: 'none', color: '#6B7280', border: '1px solid #E2E8F0' },
    }
    return { ...(map[variant] || map.primary), border: 'none', padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '.8125rem', fontWeight: 700, fontFamily: 'Plus Jakarta Sans, sans-serif' }
  }

  const app  = data?.application
  const notes = data?.notes || []
  const onboarding = data?.onboarding || []

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0D2B45' }}>
              {loading ? 'Loading…' : app ? `${app.first_name} ${app.last_name}` : 'Not found'}
            </div>
            {app && (
              <div style={{ fontSize: '.8125rem', color: '#6B7280', marginTop: '.25rem' }}>
                <a href={`mailto:${app.email}`} style={{ color: '#0B6E76', textDecoration: 'none' }}>{app.email}</a>
                {app.phone ? ` · ${app.phone}` : ''}
                {app.job_listing?.title ? ` · ${app.job_listing.title}` : ' · Speculative'}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: '1rem' }}>✕</button>
        </div>

        {app && (
          <>
            <div style={section}>
              <span style={label}>Status</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {APPLICANT_STATUSES.map(s => (
                  <button key={s.key} onClick={() => setStatus(s.key)} disabled={saving} style={{
                    ...btn('ghost'),
                    background: app.status === s.key ? s.bg : '#F8FAFC',
                    color: app.status === s.key ? s.color : '#6B7280',
                    borderColor: app.status === s.key ? s.color : '#E2E8F0',
                    padding: '6px 12px',
                  }}>{s.label}</button>
                ))}
              </div>
              <div style={{ marginTop: '.75rem', display: 'flex', gap: 6 }}>
                <button onClick={toggleArchive} disabled={saving} style={btn('ghost')}>
                  {app.archived ? 'Unarchive' : 'Archive'}
                </button>
              </div>
            </div>

            <div style={section}>
              <span style={label}>Applicant details</span>
              <div style={{ fontSize: '.875rem', color: '#374151', lineHeight: 1.65 }}>
                <div><strong>Applied:</strong> {new Date(app.applied_at).toLocaleString('en-NZ')}</div>
                {app.source && <div><strong>Source:</strong> {app.source}</div>}
                {app.cv_url && (
                  <div><strong>CV:</strong> <a href={app.cv_url} target="_blank" rel="noopener noreferrer" style={{ color: '#0B6E76' }}>{app.cv_filename || 'Open CV'}</a></div>
                )}
                {app.cover_note && (
                  <div style={{ marginTop: '.5rem', padding: '.75rem', background: '#F8FAFC', borderRadius: 6, whiteSpace: 'pre-wrap' }}>{app.cover_note}</div>
                )}
              </div>
            </div>

            <div style={section}>
              <span style={label}>Internal notes ({notes.length})</span>
              <div style={{ display: 'flex', gap: 6, marginBottom: '.75rem' }}>
                <input
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), addNote())}
                  placeholder="Add a note (e.g. 'MCNZ verified', 'Schedule interview Tuesday')…"
                  style={{ flex: 1, border: '1.5px solid #E2E8F0', borderRadius: 6, padding: '7px 10px', fontSize: '.875rem', fontFamily: 'Plus Jakarta Sans, sans-serif', outline: 'none' }}
                />
                <button onClick={addNote} disabled={saving || !noteText.trim()} style={btn('primary')}>Add</button>
              </div>
              {notes.length === 0 ? (
                <div style={{ fontSize: '.8125rem', color: '#9CA3AF', fontStyle: 'italic' }}>No notes yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {notes.map(n => (
                    <div key={n.id} style={{ background: '#F8FAFC', borderRadius: 6, padding: '.5rem .75rem', border: '1px solid #EEF2F7' }}>
                      <div style={{ fontSize: '.875rem', color: '#1A2A33', whiteSpace: 'pre-wrap' }}>{n.note}</div>
                      <div style={{ fontSize: '.6875rem', color: '#9CA3AF', marginTop: '.25rem' }}>
                        {n.author_name || 'Provider'} · {new Date(n.created_at).toLocaleString('en-NZ')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {onboarding.length > 0 && (
              <div style={section}>
                <span style={label}>Onboarding ({onboarding.filter(s => s.done).length}/{onboarding.length})</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {onboarding.map(s => (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '.625rem', padding: '.5rem .625rem', background: s.done ? '#F0FDF4' : '#F8FAFC', border: `1px solid ${s.done ? '#BBF7D0' : '#E2E8F0'}`, borderRadius: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={s.done} onChange={e => toggleStep(s.id, e.target.checked)} style={{ marginTop: 3, accentColor: '#0B6E76' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '.875rem', color: s.done ? '#065F46' : '#1A2A33', fontWeight: s.done ? 600 : 500 }}>
                          {s.label}
                        </div>
                        {s.done && s.done_by_name && (
                          <div style={{ fontSize: '.6875rem', color: '#065F46', marginTop: '.125rem' }}>
                            {s.done_by_name} · {new Date(s.done_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {app.status === 'hired' && onboarding.length === 0 && (
              <div style={section}>
                <div style={{ fontSize: '.8125rem', color: '#9CA3AF' }}>
                  Onboarding checklist will appear here shortly. If it doesn't, re-set status to 'hired' to seed it.
                </div>
              </div>
            )}
          </>
        )}
      </div>
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
            { id:'support',      label:'🎫 Support' },
            { id:'research',     label:'🔬 Research' },
            { id:'patients',     label:'👥 Patients' },
          ]
          return (
            <div style={{ width:'100%', maxWidth:360, display:'flex', alignItems:'center', gap:8, background:'#F7F5F0', borderRadius:10, border:'1.5px solid #E2E8F0', position:'relative', marginBottom:'1.5rem' }}>
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
          )
        })()}

        {adminTab === 'patients' ? <AdminPatients embedded /> : adminTab === 'research' ? <AdminResearch embedded /> : adminTab === 'careers' ? <CareersPanel /> : adminTab === 'support' ? <SupportPanel /> : adminTab === 'employers' ? <EmployersPanel /> : adminTab === 'schedule' ? <AdminSchedule embedded /> : adminTab === 'payroll' ? <AdminPayroll embedded /> : adminTab === 'performance' ? <><ProviderMetricsPanel /></> : adminTab === 'safety' ? <><IncidentsPanel /><ComplaintsPanel /><BreachPanel /></> : <>

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
