import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { getActiveConsultations, subscribeToQueue } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'
import ProviderSchedule from './ProviderSchedule'
import ProviderEarnings from './ProviderEarnings'

// ── Constants ─────────────────────────────────────────────────────────────────

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'
const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

const STATUS_COLOR = { waiting:'#F59E0B', vitals_requested:'#0B6E76', vitals_complete:'#059669', ready:'#059669', in_progress:'#7C3AED' }
const STATUS_LABEL = { waiting:'Waiting', vitals_requested:'Vitals pending', vitals_complete:'Vitals ready', ready:'Ready', in_progress:'In progress' }
const TYPE_CFG     = { video:{icon:'📹',label:'Video',c:'#0B6E76'}, phone:{icon:'📞',label:'Phone',c:'#7C3AED'}, message:{icon:'💬',label:'Message',c:'#D97706'} }

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

export function saveDevice() {
  const keys = ['providerId','providerDisplayName','providerIsAdmin','providerIsProvider','providerIsSupervisor','providerCanPrescribe','providerCanRefer','providerCanAcc','providerColor','prescriberNumber','providerCpn']
  const d = { savedAt: Date.now() }
  keys.forEach(k => { const v = sessionStorage.getItem(k); if (v) d[k] = v })
  localStorage.setItem('tere_device', JSON.stringify(d))
}

function restoreDevice(d) {
  const keys = ['providerId','providerDisplayName','providerIsAdmin','providerIsProvider','providerIsSupervisor','providerCanPrescribe','providerCanRefer','providerCanAcc','providerColor','prescriberNumber','providerCpn']
  sessionStorage.setItem('clinicianAuth', 'true')
  keys.forEach(k => { if (d[k]) sessionStorage.setItem(k, d[k]) })
}

// ── Install prompt ─────────────────────────────────────────────────────────────

function InstallBanner({ onDismiss }) {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
  if (isStandalone) return null
  return (
    <div style={{ background:'#0B6E76', color:'white', padding:'1rem 1.25rem', display:'flex', alignItems:'flex-start', gap:'1rem', fontFamily:FF }}>
      <div style={{ fontSize:'2rem', lineHeight:1 }}>📲</div>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700, fontSize:'.9375rem', marginBottom:'.25rem' }}>Add Tere to your home screen</div>
        {isIos
          ? <div style={{ fontSize:'.8125rem', opacity:.85 }}>Tap the share button <strong>⬆</strong> then "Add to Home Screen"</div>
          : <div style={{ fontSize:'.8125rem', opacity:.85 }}>Tap your browser menu → "Add to Home Screen" for instant access</div>
        }
      </div>
      <button onClick={onDismiss} style={{ background:'none', border:'none', color:'rgba(255,255,255,.6)', fontSize:'1.375rem', cursor:'pointer', padding:4, minWidth:44, minHeight:44, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
    </div>
  )
}

// ── Queue card ────────────────────────────────────────────────────────────────

function QueueCard({ c, onStart, onDismiss, starting }) {
  const sc = STATUS_COLOR[c.status] || '#6B7280'
  const sl = STATUS_LABEL[c.status] || c.status
  const tc = TYPE_CFG[c.consultation_type || 'video'] || TYPE_CFG.video
  const v  = c.vitals
  return (
    <div style={{ background:'white', borderRadius:16, borderLeft:`4px solid ${sc}`, border:`1px solid #E2E8F0`, borderLeftWidth:4, padding:'1.25rem', marginBottom:'.875rem', fontFamily:FF }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'.625rem' }}>
        <div>
          <div style={{ fontWeight:700, fontSize:'1.0625rem', color:NAVY, marginBottom:'.375rem' }}>
            {c.patient_first_name} {c.patient_last_name}
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <span style={{ background:sc+'18', color:sc, fontSize:'.6875rem', fontWeight:700, padding:'2px 8px', borderRadius:99 }}>{sl}</span>
            <span style={{ background:tc.c+'18', color:tc.c, fontSize:'.6875rem', fontWeight:700, padding:'2px 8px', borderRadius:99 }}>{tc.icon} {tc.label}</span>
            {c.acc_eligible==='yes' && <span style={{ background:'#D4EEF0', color:TEAL, fontSize:'.6875rem', fontWeight:700, padding:'2px 8px', borderRadius:99 }}>✓ ACC</span>}
            {c.interpreter_requested && <span style={{ background:'#EDE9FE', color:'#6D28D9', fontSize:'.6875rem', fontWeight:700, padding:'2px 8px', borderRadius:99 }}>🌐 Interpreter</span>}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ fontSize:'.8125rem', color:'#9CA3AF', whiteSpace:'nowrap' }}>{timeAgo(c.created_at)}</span>
          <button onClick={() => onDismiss(c.id)} style={{ background:'none', border:'none', color:'#D1D5DB', fontSize:'1.125rem', cursor:'pointer', padding:0, minWidth:44, minHeight:44, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>
      </div>

      {/* Complaint */}
      <div style={{ fontSize:'.9375rem', color:'#374151', lineHeight:1.5, marginBottom:'.625rem', fontStyle:'italic', borderLeft:'3px solid #F3F4F6', paddingLeft:'.75rem' }}>
        {c.chief_complaint}
      </div>

      {/* Vitals + location */}
      <div style={{ display:'flex', gap:'.75rem', flexWrap:'wrap', marginBottom:'1rem', fontSize:'.8125rem' }}>
        {v && !v.skipped && v.hr  && <span style={{ color:'#059669', fontWeight:600 }}>❤️ {v.hr} bpm</span>}
        {v && !v.skipped && v.rr  && <span style={{ color:TEAL, fontWeight:600 }}>🫁 {v.rr}/min</span>}
        {v && !v.skipped && v.spo2 && <span style={{ color:'#7C3AED', fontWeight:600 }}>SpO₂ {v.spo2}%</span>}
        {c.patient_location && <span style={{ color:'#6B7280' }}>📍 {c.patient_location}</span>}
        {c.patient_allergies && c.patient_allergies !== 'None' && <span style={{ color:'#DC2626', fontWeight:600 }}>⚠️ {c.patient_allergies}</span>}
      </div>

      {/* Start button */}
      <button
        onClick={() => onStart(c)}
        disabled={starting === c.id}
        style={{ width:'100%', background: starting===c.id ? '#9CA3AF' : TEAL, color:'white', border:'none', borderRadius:12, padding:'16px', fontSize:'1.0625rem', fontWeight:700, cursor: starting===c.id ? 'not-allowed' : 'pointer', fontFamily:FF, minHeight:56, letterSpacing:'.01em' }}
      >
        {starting === c.id ? 'Starting…' : 'Start consultation →'}
      </button>
    </div>
  )
}

// ── Today's appointments strip ────────────────────────────────────────────────

function TodayAppointments() {
  const [appts, setAppts] = useState([])

  useEffect(() => {
    async function load() {
      try {
        const pid = sessionStorage.getItem('providerId')
        const { supabase } = await import('../../lib/supabase')
        const today = new Date().toISOString().slice(0, 10)
        let q = supabase.from('appointments').select('*').eq('appointment_date', today).in('status', ['pending', 'confirmed']).order('slot_time').limit(10)
        if (pid) q = q.eq('provider_id', pid)
        let bq = supabase.from('bookings').select('*').eq('appointment_date', today).not('status', 'eq', 'cancelled').order('appointment_time').limit(10)
        if (pid) bq = bq.eq('provider_id', pid)
        const [ar, br] = await Promise.allSettled([q, bq])
        const apptData = ar.value?.data || []
        const bookData = br.value?.data || []
        const merged = [
          ...apptData.map(a => ({ id: a.id, time: a.slot_time, name: a.patient_name, label: a.reason || 'General' })),
          ...bookData.map(b => ({ id: b.id, time: b.appointment_time, name: b.patient_name, label: (b.reason || 'General') + ' 📅', isBooked: true })),
        ].sort((a, b) => (a.time || '').localeCompare(b.time || ''))
        setAppts(merged)
      } catch {}
    }
    load()
  }, [])

  if (!appts.length) return null

  return (
    <div style={{ margin:'1rem 1rem 0', background:'white', borderRadius:12, border:'1px solid #BFDBFE', padding:'.875rem 1rem' }}>
      <div style={{ fontSize:'.75rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#1D4ED8', marginBottom:'.5rem' }}>Today's appointments</div>
      <div style={{ display:'flex', flexDirection:'column', gap:'.375rem' }}>
        {appts.map(a => (
          <div key={a.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'.8125rem', gap:'.5rem' }}>
            <span style={{ fontWeight:600, color:NAVY, flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.time?.slice(0,5)} — {a.name}</span>
            <span style={{ color:'#6B7280', flexShrink:0 }}>{a.label}</span>
            {a.isBooked && (
              <Link to={`/booking/join/${a.id}`} style={{ color:TEAL, fontSize:'.75rem', fontWeight:700, textDecoration:'none', background:'#EFF9F9', border:`1px solid ${TEAL}`, padding:'3px 8px', borderRadius:6, flexShrink:0, whiteSpace:'nowrap' }}>Start →</Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Handover notes banner ─────────────────────────────────────────────────────

function HandoverBanner() {
  const [notes, setNotes] = useState([])
  const [dismissed, setDismissed] = useState([])

  useEffect(() => {
    apiFetch('/api/handover?action=get')
      .then(r => r.json())
      .then(d => setNotes(d.notes || []))
      .catch(() => {})
  }, [])

  async function acknowledge(noteId) {
    const pid = sessionStorage.getItem('providerId')
    await apiFetch('/api/handover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'acknowledge', id: noteId, providerId: pid })
    }).catch(() => {})
    setDismissed(d => [...d, noteId])
  }

  const visible = notes.filter(n => !dismissed.includes(n.id))
  if (!visible.length) return null

  return (
    <div style={{ margin:'1rem 1rem 0', borderRadius:12, overflow:'hidden', border:'1px solid #FDE68A' }}>
      <div style={{ background:'#FEF3C7', padding:'.5rem .875rem', display:'flex', alignItems:'center', gap:'.5rem' }}>
        <span style={{ fontSize:'.75rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#92400E' }}>📋 Handover notes</span>
      </div>
      {visible.map(n => (
        <div key={n.id} style={{ background:'white', borderTop:'1px solid #FDE68A', padding:'.75rem .875rem', display:'flex', alignItems:'flex-start', gap:'.75rem' }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:'.75rem', color:'#92400E', fontWeight:600, marginBottom:2 }}>{n.provider_name} · {new Date(n.created_at).toLocaleTimeString('en-NZ',{hour:'2-digit',minute:'2-digit'})}</div>
            <div style={{ fontSize:'.875rem', color:'#374151', lineHeight:1.5 }}>{n.content}</div>
          </div>
          <button onClick={() => acknowledge(n.id)}
            style={{ background:'#FEF3C7', border:'1px solid #FDE68A', color:'#92400E', borderRadius:8, padding:'4px 8px', fontSize:'.75rem', fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
            Acknowledged ✓
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Queue tab ─────────────────────────────────────────────────────────────────

function QueueTab({ consultations, loading, starting, onStart, onDismiss }) {
  const videoQueue = consultations.filter(c => c.consultation_type !== 'message')
  if (loading) return <div style={{ textAlign:'center', padding:'4rem' }}><div className="spinner" style={{ borderColor:'rgba(11,110,118,.2)', borderTopColor:TEAL }} /></div>
  if (!videoQueue.length) return (
    <>
      <HandoverBanner />
      <TodayAppointments />
      <div style={{ textAlign:'center', padding:'4rem 2rem', fontFamily:FF }}>
        <div style={{ fontSize:'3rem', marginBottom:'1rem' }}>✓</div>
        <div style={{ fontWeight:700, color:NAVY, fontSize:'1.125rem', marginBottom:'.5rem' }}>Queue is clear</div>
        <div style={{ color:'#6B7280', fontSize:'.9375rem' }}>New patients will appear here</div>
      </div>
    </>
  )
  return (
    <div>
      <HandoverBanner />
      <TodayAppointments />
      <div style={{ padding:'1rem' }}>
        {videoQueue.map(c => <QueueCard key={c.id} c={c} onStart={onStart} onDismiss={onDismiss} starting={starting} />)}
      </div>
    </div>
  )
}

// ── Messages tab ──────────────────────────────────────────────────────────────

function fmtDeadline(iso) {
  if (!iso) return null
  const TZ = 'Pacific/Auckland'
  const dl  = new Date(iso)
  const t   = dl.toLocaleTimeString('en-NZ', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
  const dlDay  = dl.toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD
  const nowDay = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const tomDay = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: TZ })
  if (dlDay === nowDay) return `by ${t} today`
  if (dlDay === tomDay) return `by ${t} tomorrow`
  return `by ${t} ${dl.toLocaleDateString('en-NZ', { timeZone: TZ, weekday: 'short' })}`
}

function MessagesTab() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [responding, setResponding] = useState(null)
  const [text, setText]       = useState('')
  const [sending, setSending] = useState(false)
  const [accChoice, setAccChoice]     = useState(null)    // 'yes' | 'no'
  const [accClaimRef, setAccClaimRef] = useState('')
  const [injuryDate, setInjuryDate]   = useState('')
  const [injuryDetails, setInjuryDetails] = useState('')

  async function load() {
    try {
      const { supabase } = await import('../../lib/supabase')
      const { data } = await supabase.from('consultations').select('*')
        .eq('consultation_type', 'message').in('status', ['waiting', 'in_progress'])
        .order('created_at', { ascending: true })
      const now = Date.now()
      const sorted = [...(data || [])].sort((a, b) => {
        const aOvr = a.consultation_subtype === 'async_message' && a.async_deadline && new Date(a.async_deadline) < now
        const bOvr = b.consultation_subtype === 'async_message' && b.async_deadline && new Date(b.async_deadline) < now
        if (aOvr && !bOvr) return -1
        if (!aOvr && bOvr) return 1
        return new Date(a.created_at) - new Date(b.created_at)
      })
      setRows(sorted)
    } catch {} finally { setLoading(false) }
  }

  function startResponding(id) {
    setResponding(id); setText('')
    setAccChoice(null); setAccClaimRef(''); setInjuryDate(''); setInjuryDetails('')
  }

  async function send(c) {
    const isAsync = c.consultation_subtype === 'async_message'
    const pid   = sessionStorage.getItem('providerId')
    const pname = sessionStorage.getItem('providerDisplayName')
    setSending(true)
    try {
      if (isAsync) {
        const res = await apiFetch('/api/async-consult', {
          method: 'POST',
          body: JSON.stringify({
            action: 'respond', consultationId: c.id,
            responseText: text,
            providerId: pid || undefined,
            providerName: pname || undefined,
            isAcc: accChoice === 'yes',
            accClaimRef: accChoice === 'yes' ? accClaimRef : undefined,
            injuryDate: accChoice === 'yes' ? injuryDate : undefined,
            injuryDetails: accChoice === 'yes' ? injuryDetails : undefined,
          }),
        })
        const d = await res.json()
        if (!d.ok) throw new Error(d.error || 'Failed')
      } else {
        const { supabase } = await import('../../lib/supabase')
        await supabase.from('consultations').update({
          status: 'complete',
          clinical_notes: { S: c.chief_complaint, O: '', A: '', P: text },
          notes_finalised: true, notes_finalised_at: new Date().toISOString(),
          outcome: 'message_response', provider_display_name: pname,
          ...(pid ? { provider_id: pid } : {}),
        }).eq('id', c.id)
        if (c.payment_intent_id) apiFetch('/api/capture-payment', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId: c.payment_intent_id }),
        }).catch(() => {})
      }
      setRows(rs => rs.filter(r => r.id !== c.id))
      setResponding(null); setText('')
    } catch {} finally { setSending(false) }
  }

  useEffect(() => { load() }, [])

  if (loading) return <div style={{ textAlign: 'center', padding: '4rem' }}><div className="spinner" /></div>

  return (
    <div style={{ padding: '1rem', fontFamily: FF }}>
      {!rows.length ? (
        <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '.75rem' }}>💬</div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '1.125rem', marginBottom: '.5rem' }}>No pending messages</div>
          <div style={{ color: '#6B7280' }}>Message consultations will appear here</div>
        </div>
      ) : rows.map(c => {
        const isAsync = c.consultation_subtype === 'async_message'
        const isResponding = responding === c.id
        const dl = fmtDeadline(c.async_deadline)
        const isOverdue = isAsync && c.async_deadline && new Date(c.async_deadline) < Date.now()
        const canSend = text.trim() && (!isAsync || accChoice !== null)

        return (
          <div key={c.id} style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', borderLeft: `4px solid ${isOverdue ? '#DC2626' : isAsync ? TEAL : '#D97706'}`, padding: '1.25rem', marginBottom: '.875rem' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.25rem' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: NAVY }}>{c.patient_first_name} {c.patient_last_name}</div>
              {isAsync && (isOverdue
                ? <span style={{ background: '#FEE2E2', color: '#DC2626', fontSize: '.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>OVERDUE</span>
                : <span style={{ background: '#D4EEF0', color: TEAL, fontSize: '.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>ASYNC</span>
              )}
            </div>
            <div style={{ fontSize: '.8125rem', color: '#6B7280', marginBottom: '.75rem' }}>
              {timeAgo(c.created_at)} · {c.patient_email}
              {dl && <span style={{ color: '#D97706', fontWeight: 600, marginLeft: '.5rem' }}>· Due {dl}</span>}
            </div>

            {/* Chief complaint */}
            <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '.875rem', marginBottom: '.875rem', fontSize: '.9375rem', lineHeight: 1.6 }}>
              {c.chief_complaint}
            </div>

            {/* Async clinical detail */}
            {isAsync && c.async_symptom_detail && (
              <div style={{ marginBottom: '.875rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                <div style={{ background: '#F0F9FA', borderRadius: 8, padding: '.75rem', borderLeft: `3px solid ${TEAL}` }}>
                  <div style={{ fontSize: '.6875rem', fontWeight: 700, color: TEAL, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.375rem' }}>Symptom detail</div>
                  <div style={{ fontSize: '.875rem', color: NAVY, lineHeight: 1.6 }}>{c.async_symptom_detail}</div>
                </div>
                {(c.async_symptom_progression || c.async_daily_impact) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
                    {c.async_symptom_progression && (
                      <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '.625rem' }}>
                        <div style={{ fontSize: '.625rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.25rem' }}>Progression</div>
                        <div style={{ fontSize: '.8125rem', color: NAVY }}>{c.async_symptom_progression}</div>
                      </div>
                    )}
                    {c.async_daily_impact && (
                      <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '.625rem' }}>
                        <div style={{ fontSize: '.625rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.25rem' }}>Daily impact</div>
                        <div style={{ fontSize: '.8125rem', color: NAVY }}>{c.async_daily_impact}</div>
                      </div>
                    )}
                  </div>
                )}
                {c.async_previous_treatment && (
                  <div style={{ fontSize: '.8125rem', color: '#6B7280' }}><strong>Previous treatment:</strong> {c.async_previous_treatment}</div>
                )}
                {c.async_previous_episodes && (
                  <div style={{ fontSize: '.8125rem', color: '#6B7280' }}><strong>Previous episodes:</strong> {c.async_previous_episodes}</div>
                )}
                {c.async_requests?.length > 0 && (
                  <div style={{ fontSize: '.8125rem', color: '#6B7280' }}><strong>Requests:</strong> {c.async_requests.join(', ')}</div>
                )}
                {c.async_urgency && (
                  <div style={{ fontSize: '.8125rem', color: '#D97706', fontWeight: 600 }}>Urgency: {c.async_urgency}</div>
                )}
                {c.async_photo_urls?.length > 0 && (
                  <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                    {c.async_photo_urls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer"
                        style={{ background: '#EFF9F9', color: TEAL, borderRadius: 8, padding: '4px 10px', fontSize: '.75rem', fontWeight: 700, textDecoration: 'none' }}>
                        📷 Photo {i + 1}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Response area */}
            {isResponding ? (
              <>
                <textarea value={text} onChange={e => setText(e.target.value)} rows={5}
                  placeholder="Type your response…"
                  style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #D1D5DB', borderRadius: 8, padding: '.75rem', fontFamily: FF, fontSize: 16, resize: 'none', lineHeight: 1.6, outline: 'none', marginBottom: '.75rem' }} />

                {/* Billing — async only */}
                {isAsync && (
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1rem', marginBottom: '.75rem' }}>
                    <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9375rem', marginBottom: '.5rem' }}>Billing</div>
                    <div style={{ fontSize: '.875rem', color: '#6B7280', marginBottom: '.625rem' }}>Is this an ACC-eligible injury?</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', marginBottom: accChoice ? '.75rem' : 0 }}>
                      <button onClick={() => setAccChoice('yes')}
                        style={{ padding: '11px', borderRadius: 10, border: `2px solid ${accChoice === 'yes' ? '#1D4ED8' : '#E2E8F0'}`, background: accChoice === 'yes' ? '#EFF6FF' : 'white', color: accChoice === 'yes' ? '#1D4ED8' : '#6B7280', fontWeight: 700, fontSize: '.8125rem', cursor: 'pointer', fontFamily: FF }}>
                        ✓ Yes — Lodge ACC claim
                      </button>
                      <button onClick={() => setAccChoice('no')}
                        style={{ padding: '11px', borderRadius: 10, border: `2px solid ${accChoice === 'no' ? TEAL : '#E2E8F0'}`, background: accChoice === 'no' ? '#EFF9F9' : 'white', color: accChoice === 'no' ? TEAL : '#6B7280', fontWeight: 700, fontSize: '.8125rem', cursor: 'pointer', fontFamily: FF }}>
                        No — Private $25 only
                      </button>
                    </div>

                    {accChoice === 'yes' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                        <input value={accClaimRef} onChange={e => setAccClaimRef(e.target.value)}
                          placeholder="ACC claim reference (optional)"
                          style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #BFDBFE', borderRadius: 8, padding: '.625rem .75rem', fontFamily: FF, fontSize: '.875rem', outline: 'none' }} />
                        <input type="date" value={injuryDate} onChange={e => setInjuryDate(e.target.value)}
                          style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #BFDBFE', borderRadius: 8, padding: '.625rem .75rem', fontFamily: FF, fontSize: '.875rem', outline: 'none' }} />
                        <input value={injuryDetails} onChange={e => setInjuryDetails(e.target.value)}
                          placeholder="Brief injury description for ACC claim"
                          style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #BFDBFE', borderRadius: 8, padding: '.625rem .75rem', fontFamily: FF, fontSize: '.875rem', outline: 'none' }} />
                        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '.75rem', fontSize: '.8125rem', color: '#1D4ED8', display: 'flex', justifyContent: 'space-between' }}>
                          <span>ACC claim — $37.50 · Patient co-payment — $25</span>
                          <strong>Total $62.50</strong>
                        </div>
                      </div>
                    )}
                    {accChoice === 'no' && (
                      <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '.75rem', fontSize: '.8125rem', color: '#065F46' }}>
                        Private fee — $25 patient payment only
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
                  <button onClick={() => { setResponding(null); setText(''); setAccChoice(null) }}
                    style={{ background: 'white', border: '1.5px solid #D1D5DB', color: '#6B7280', borderRadius: 10, padding: '14px', fontWeight: 600, fontSize: '.9375rem', cursor: 'pointer', fontFamily: FF }}>
                    Cancel
                  </button>
                  <button onClick={() => send(c)} disabled={sending || !canSend}
                    style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 10, padding: '14px', fontWeight: 700, fontSize: '.9375rem', cursor: 'pointer', fontFamily: FF, opacity: sending || !canSend ? 0.5 : 1 }}>
                    {sending ? 'Sending…' : 'Send response'}
                  </button>
                </div>
              </>
            ) : (
              <button onClick={() => startResponding(c.id)}
                style={{ width: '100%', background: TEAL, color: 'white', border: 'none', borderRadius: 12, padding: '14px', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', fontFamily: FF, minHeight: 56 }}>
                Respond →
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Notes tab ─────────────────────────────────────────────────────────────────

function NotesTab({ navigate }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const { supabase } = await import('../../lib/supabase')
        const { data } = await supabase.from('consultations').select('id,created_at,patient_first_name,patient_last_name,chief_complaint,acc_eligible,notes_finalised').eq('status','complete').eq('notes_finalised',false).order('created_at',{ascending:false}).limit(50)
        setRows(data || [])
      } catch {} finally { setLoading(false) }
    })()
  }, [])

  if (loading) return <div style={{ textAlign:'center', padding:'4rem' }}><div className="spinner" /></div>

  return (
    <div style={{ padding:'1rem', fontFamily:FF }}>
      {!rows.length ? (
        <div style={{ textAlign:'center', padding:'3rem 1.5rem' }}>
          <div style={{ fontSize:'3rem', marginBottom:'.75rem' }}>📋</div>
          <div style={{ fontWeight:700, color:NAVY, fontSize:'1.125rem', marginBottom:'.5rem' }}>All notes complete</div>
          <div style={{ color:'#6B7280' }}>Consultations needing notes will appear here</div>
        </div>
      ) : rows.map(c => (
        <div key={c.id} style={{ background:'white', borderRadius:16, border:'1px solid #E2E8F0', borderLeft:'4px solid #D97706', padding:'1.25rem', marginBottom:'.875rem' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'.5rem' }}>
            <div style={{ fontWeight:700, color:NAVY }}>{c.patient_first_name} {c.patient_last_name}</div>
            <span style={{ fontSize:'.75rem', color:'#9CA3AF' }}>{timeAgo(c.created_at)}</span>
          </div>
          <div style={{ fontSize:'.875rem', color:'#6B7280', marginBottom:'1rem', fontStyle:'italic' }}>{c.chief_complaint}</div>
          <button onClick={() => navigate(`/provider/notes/${c.id}`)} style={{ width:'100%', background:NAVY, color:'white', border:'none', borderRadius:12, padding:'14px', fontWeight:700, fontSize:'1rem', cursor:'pointer', fontFamily:FF, minHeight:56 }}>
            Complete notes →
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Menu tab ──────────────────────────────────────────────────────────────────

function MenuTab({ navigate, displayName, isAdmin }) {
  function signOut() {
    localStorage.removeItem('tere_device')
    localStorage.removeItem('tere_portal')
    sessionStorage.clear()
    navigate('/clinician')
  }
  const items = [
    ...(isAdmin ? [{ label:'Admin dashboard', icon:'⚙️', action:()=>navigate('/clinician/admin'), color:NAVY }] : []),
    { label:'Provider dashboard (desktop)', icon:'🖥', action:()=>navigate('/clinician/dashboard'), color:'#374151' },
    { label:'Change password', icon:'🔑', action:()=>navigate('/clinician/change-password'), color:'#374151' },
    { label:'Sign out', icon:'→', action:signOut, color:'#DC2626' },
  ]
  return (
    <div style={{ padding:'1.25rem', fontFamily:FF }}>
      <div style={{ textAlign:'center', padding:'1.5rem 0 2rem' }}>
        <div style={{ width:64, height:64, borderRadius:'50%', background:sessionStorage.getItem('providerColor')||TEAL, color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.5rem', fontWeight:700, margin:'0 auto .75rem' }}>
          {(displayName||'?').split(' ').map(n=>n[0]).join('').slice(0,2)}
        </div>
        <div style={{ fontWeight:700, color:NAVY, fontSize:'1.0625rem' }}>{displayName}</div>
        <div style={{ color:'#6B7280', fontSize:'.8125rem', marginTop:'.25rem' }}>Tere Provider</div>
      </div>
      <div style={{ background:'white', borderRadius:16, border:'1px solid #E2E8F0', overflow:'hidden' }}>
        {items.map((item,i) => (
          <button key={item.label} onClick={item.action}
            style={{ width:'100%', background:'none', border:'none', borderBottom: i<items.length-1 ? '1px solid #F3F4F6' : 'none', padding:'1rem 1.25rem', display:'flex', alignItems:'center', gap:'1rem', cursor:'pointer', fontFamily:FF, textAlign:'left', minHeight:56 }}>
            <span style={{ fontSize:'1.25rem', width:28, textAlign:'center' }}>{item.icon}</span>
            <span style={{ fontWeight:600, color:item.color, fontSize:'.9375rem' }}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Bottom nav ────────────────────────────────────────────────────────────────

function BottomNav({ tab, setTab, queueBadge, msgBadge, notesBadge }) {
  const items = [
    { id:'queue',    icon:'🏥', label:'Queue',    badge:queueBadge },
    { id:'messages', icon:'💬', label:'Messages', badge:msgBadge },
    { id:'schedule', icon:'📅', label:'Schedule', badge:0 },
    { id:'notes',    icon:'📋', label:'Notes',    badge:notesBadge },
    { id:'earnings', icon:'💰', label:'Earnings', badge:0 },
    { id:'menu',     icon:'☰',  label:'Menu',     badge:0 },
  ]
  return (
    <div style={{ background:NAVY, display:'flex', flexShrink:0, minHeight:60, paddingBottom:'env(safe-area-inset-bottom)', borderTop:'1px solid rgba(255,255,255,.08)' }}>
      {items.map(item => (
        <button key={item.id} onClick={() => setTab(item.id)}
          style={{ flex:1, background:'none', border:'none', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, padding:'8px 4px', position:'relative', color: tab===item.id ? '#D4EEF0' : 'rgba(255,255,255,.4)', minHeight:60 }}>
          {item.badge > 0 && (
            <span style={{ position:'absolute', top:6, right:'50%', marginRight:-16, background:'#DC2626', color:'white', fontSize:'.625rem', fontWeight:700, padding:'1px 5px', borderRadius:99, minWidth:16, textAlign:'center', lineHeight:1.4 }}>
              {item.badge > 9 ? '9+' : item.badge}
            </span>
          )}
          <span style={{ fontSize:'1.375rem', lineHeight:1 }}>{item.icon}</span>
          <span style={{ fontSize:'.625rem', fontWeight: tab===item.id ? 700 : 400, letterSpacing:'.02em', fontFamily:FF }}>
            {item.label}
          </span>
        </button>
      ))}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ProviderApp() {
  const navigate = useNavigate()

  // Auth check
  useEffect(() => {
    if (!sessionStorage.getItem('clinicianAuth')) {
      // Try restoring from saved device
      const saved = getSaved()
      if (saved) { restoreDevice(saved) }
      else { navigate('/clinician?redirect=/provider'); return }
    }
  }, [navigate])

  const providerId    = sessionStorage.getItem('providerId')
  const displayName   = sessionStorage.getItem('providerDisplayName') || 'Provider'
  const isAdmin       = sessionStorage.getItem('providerIsAdmin') === 'true'
  const provColor     = sessionStorage.getItem('providerColor') || TEAL

  const [tab, setTab]             = useState('queue')
  const [consultations, setConsultations] = useState([])
  const [loading, setLoading]     = useState(true)
  const [starting, setStarting]   = useState(null)
  const [isAvail, setIsAvail]     = useState(false)
  const [savingAvail, setSavingAvail] = useState(false)
  const [isOnline, setIsOnline]   = useState(navigator.onLine)
  const [showInstall, setShowInstall] = useState(false)
  const [showSaveDevice, setShowSaveDevice] = useState(false)
  const installPromptRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/get-queue')
      const { consultations: data } = await res.json()
      setConsultations(data || [])
    } catch { setConsultations([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 15000)
    const sub = subscribeToQueue(() => load())
    return () => { clearInterval(interval); sub?.unsubscribe?.() }
  }, [load])

  // Load availability
  useEffect(() => {
    if (!providerId) return
    import('../../lib/supabase').then(({ supabase }) => {
      supabase.from('providers').select('is_available').eq('id', providerId).single()
        .then(({ data }) => { if (data) setIsAvail(data.is_available) })
        .catch(() => {})
    })
  }, [providerId])

  // Register push + service worker
  useEffect(() => {
    if (providerId) registerPush(providerId)
  }, [providerId])

  // Capture install prompt (Android)
  useEffect(() => {
    const onPrompt = e => { e.preventDefault(); installPromptRef.current = e; setShowInstall(true) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  // Show install hint on iOS after a delay
  useEffect(() => {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    const dismissed = localStorage.getItem('tere_install_dismissed')
    if (isIos && !isStandalone && !dismissed) {
      setTimeout(() => setShowInstall(true), 3000)
    }
  }, [])

  // Show "remember device?" once per session
  useEffect(() => {
    if (getSaved()) return // already saved
    const shown = sessionStorage.getItem('tere_save_prompt')
    if (!shown) { setTimeout(() => setShowSaveDevice(true), 2000); sessionStorage.setItem('tere_save_prompt','1') }
  }, [])

  // Online/offline
  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  async function toggleAvail() {
    if (!providerId) return
    setSavingAvail(true)
    try {
      const v = !isAvail
      const res = await apiFetch('/api/set-provider-avail', {
        method: 'POST',
        body: JSON.stringify({ providerId, isAvailable: v }),
      })
      if (!res.ok) throw new Error('Failed to update availability')
      setIsAvail(v)
    } catch (e) {
      console.error('toggleAvail error:', e)
    } finally { setSavingAvail(false) }
  }

  async function startConsult(c) {
    setStarting(c.id)
    try {
      const { supabase } = await import('../../lib/supabase')
      await supabase.from('consultations').update({
        status: 'vitals_requested',
        vitals_requested_at: new Date().toISOString(),
        ...(providerId ? { provider_id: providerId } : {}),
        ...(displayName ? { provider_display_name: displayName } : {}),
      }).eq('id', c.id)
      navigate(`/provider/consult/${c.id}`)
    } catch { navigate(`/provider/consult/${c.id}`) }
    finally { setStarting(null) }
  }

  async function dismiss(id) {
    try {
      const { supabase } = await import('../../lib/supabase')
      await supabase.from('consultations').update({ status:'expired' }).eq('id', id)
      setConsultations(cs => cs.filter(c => c.id !== id))
    } catch {}
  }

  const msgCount   = consultations.filter(c => c.consultation_type === 'message').length
  const queueCount = consultations.filter(c => c.consultation_type !== 'message').length

  return (
    <div style={{ height:'100dvh', background:'#F7F5F0', display:'flex', flexDirection:'column', fontFamily:FF, userSelect:'none', WebkitUserSelect:'none', position:'relative', overflow:'hidden' }}>
      {/* Offline banner */}
      {!isOnline && (
        <div style={{ background:'#DC2626', color:'white', textAlign:'center', padding:'.625rem', fontSize:'.875rem', fontWeight:600, zIndex:300 }}>
          ⚠️ No connection — data may be stale
        </div>
      )}

      {/* Install prompt */}
      {showInstall && !window.matchMedia('(display-mode: standalone)').matches && (
        <InstallBanner onDismiss={() => { setShowInstall(false); localStorage.setItem('tere_install_dismissed','1') }} />
      )}

      {/* Top bar */}
      <div style={{ background:NAVY, paddingTop:'calc(.875rem + env(safe-area-inset-top))', paddingBottom:'.875rem', paddingLeft:'1.25rem', paddingRight:'1.25rem', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <span style={{ fontFamily:'Cormorant Garamond,Georgia,serif', fontStyle:'italic', color:'#D4EEF0', fontSize:'1.4rem', letterSpacing:'.06em' }}>Tere</span>
        <div style={{ display:'flex', alignItems:'center', gap:'.5rem' }}>
          {isAdmin && (
            <button onClick={() => navigate('/admin')}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:8, background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.18)', color:'rgba(255,255,255,.85)', fontSize:'.75rem', cursor:'pointer', fontFamily:FF, minHeight:34, flexShrink:0 }}>
              ⚙️ Admin
            </button>
          )}
          <span style={{ color:'rgba(255,255,255,.7)', fontSize:'.875rem', maxWidth:80, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{displayName}</span>
          <button onClick={toggleAvail} disabled={savingAvail}
            style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,.1)', border:'none', borderRadius:99, padding:'6px 12px', cursor:'pointer', minHeight:44 }}>
            <div style={{ width:10, height:10, borderRadius:'50%', background: isAvail ? '#10B981' : '#6B7280', flexShrink:0 }} />
            <span style={{ color:'rgba(255,255,255,.8)', fontSize:'.75rem', fontFamily:FF }}>{savingAvail ? '…' : isAvail ? 'Available' : 'Closed'}</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto', minHeight:0, WebkitOverflowScrolling:'touch' }}>
        {tab === 'queue'    && <QueueTab consultations={consultations} loading={loading} starting={starting} onStart={startConsult} onDismiss={dismiss} />}
        {tab === 'messages' && <MessagesTab />}
        {tab === 'schedule' && <ProviderSchedule embedded />}
        {tab === 'notes'    && <NotesTab navigate={navigate} />}
        {tab === 'earnings' && <ProviderEarnings embedded />}
        {tab === 'menu'     && <MenuTab navigate={navigate} displayName={displayName} isAdmin={isAdmin} />}
      </div>

      {/* Save device prompt */}
      {showSaveDevice && (
        <div style={{ position:'absolute', bottom:60, left:0, right:0, zIndex:250, padding:'0 1rem' }}>
          <div style={{ background:NAVY, borderRadius:16, padding:'1.25rem', boxShadow:'0 8px 32px rgba(0,0,0,.4)', border:'1px solid rgba(255,255,255,.1)' }}>
            <div style={{ fontWeight:700, color:'white', marginBottom:'.375rem', fontFamily:FF }}>🔐 Remember this device?</div>
            <div style={{ fontSize:'.8125rem', color:'rgba(255,255,255,.6)', marginBottom:'.875rem', fontFamily:FF }}>Stay signed in for 30 days. Protected by your device lock screen.</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.5rem' }}>
              <button onClick={() => setShowSaveDevice(false)} style={{ background:'rgba(255,255,255,.1)', border:'none', color:'rgba(255,255,255,.7)', borderRadius:10, padding:'12px', fontFamily:FF, fontWeight:600, cursor:'pointer' }}>Not now</button>
              <button onClick={() => { saveDevice(); setShowSaveDevice(false) }} style={{ background:TEAL, border:'none', color:'white', borderRadius:10, padding:'12px', fontFamily:FF, fontWeight:700, cursor:'pointer' }}>Save 🔐</button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <BottomNav tab={tab} setTab={setTab} queueBadge={queueCount} msgBadge={msgCount} notesBadge={0} />
    </div>
  )
}
