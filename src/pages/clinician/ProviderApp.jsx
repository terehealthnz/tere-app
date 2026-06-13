import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { getActiveConsultations, subscribeToQueue } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'
import { PrescribeModal, XrayModal, NotesModal, InPersonModal, UpgradeModal } from '../../components/clinician/ConsultModals'
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

function bufferInfo(createdAt, now) {
  const deadline = new Date(createdAt).getTime() + 2 * 60 * 60 * 1000
  const remaining = deadline - now
  const absMs = Math.abs(remaining)
  const totalMins = Math.floor(absMs / 60000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  const mStr = String(m).padStart(2, '0')
  if (remaining <= 0) return { label: `+ ${h} hr ${mStr} min`, color: '#DC2626', bg: '#FEE2E2' }
  const label = `${h} hr ${mStr} min`
  if (totalMins < 15) return { label, color: '#DC2626', bg: '#FEE2E2' }
  if (totalMins < 60) return { label, color: '#D97706', bg: '#FEF3C7' }
  return { label, color: '#059669', bg: '#D1FAE5' }
}

function queueStatus(c, now) {
  const s = c.status
  if (['complete', 'cancelled', 'dismissed'].includes(s)) return { label: 'Completed', color: '#065F46', bg: '#D1FAE5' }
  if (s === 'no_answer')  return { label: 'No answer',  color: '#991B1B', bg: '#FEE2E2' }
  if (s === 'expired')    return { label: 'Expired',    color: '#6B7280', bg: '#F3F4F6' }
  if (s === 'in_progress') return { label: 'In Progress', color: '#7C3AED', bg: '#EDE9FE' }
  if (s === 'reviewing')  return { label: `Reviewing — ${c.provider_display_name || 'Provider'}`, color: '#92400E', bg: '#FEF3C7' }
  if (s === 'waiting')    return { label: '📸 Scanning vitals', color: '#D97706', bg: '#FEF3C7' }
  if (s === 'vitals_complete') return { label: '✓ Vitals ready', color: '#059669', bg: '#D1FAE5' }
  const deadline = new Date(c.created_at).getTime() + 2 * 60 * 60 * 1000
  const minsLeft = (deadline - now) / 60000
  if (minsLeft <= 30) return { label: 'Upcoming', color: '#1E40AF', bg: '#DBEAFE' }
  return { label: 'Pending', color: '#92400E', bg: '#FEF3C7' }
}

function fmtEnteredAt(iso) {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-NZ', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()
  return `${date}, ${time} NZST`
}

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4)
  const raw = window.atob((b64 + pad).replace(/-/g,'+').replace(/_/g,'/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

async function registerPush(providerId) {
  try {
    const isNative = window.Capacitor?.isNativePlatform?.()

    if (isNative) {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      const status = await PushNotifications.checkPermissions()
      let perm = status.receive
      if (perm === 'prompt' || perm === 'prompt-with-rationale') {
        const result = await PushNotifications.requestPermissions()
        perm = result.receive
      }
      if (perm !== 'granted') return

      await PushNotifications.register()
      PushNotifications.addListener('registration', async (tokenData) => {
        const platform = window.Capacitor.getPlatform()
        await apiFetch('/api/push-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId, token: tokenData.value, platform }),
        })
      })
    } else {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_KEY) return
      if (Notification.permission === 'denied') return
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      const sub = existing || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_KEY) })
      await apiFetch('/api/push-subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId, subscription: sub.toJSON() }) })
    }
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

const TYPE_BADGE = {
  video:   { icon:'📹', bg: TEAL, color:'white', label:'Video' },
  phone:   { icon:'📞', bg: NAVY, color:'white', label:'Phone' },
  message: { icon:'✉️', bg: '#6B7280', color:'white', label:'Message' },
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

const TH = { fontSize:'.6875rem', fontWeight:700, color:'#374151', padding:'.625rem .75rem', textAlign:'left', whiteSpace:'nowrap', background:'#F9FAFB', borderBottom:'1px solid #E2E8F0' }
const TD = { padding:'.75rem .75rem', verticalAlign:'middle' }

function QueueTab({ consultations, loading, starting, onStart, onDismiss, navigate }) {
  const [now, setNow]             = useState(Date.now())
  const [dismissTarget, setDismissTarget] = useState(null)
  const [dismissing, setDismissing]       = useState(false)
  const currentProviderId = sessionStorage.getItem('providerId')

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])

  const queue = [...consultations].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  if (loading) return <div style={{ textAlign:'center', padding:'4rem' }}><div className="spinner" style={{ borderColor:'rgba(11,110,118,.2)', borderTopColor:TEAL }} /></div>

  if (!queue.length) return (
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

  const COLS = '44px 1.5fr 1.8fr 1.1fr 1.6fr 100px 72px'

  return (
    <div>
      <HandoverBanner />
      <TodayAppointments />
      <div style={{ padding:'1rem', overflowX:'auto' }}>
        <div style={{ minWidth:680, borderRadius:14, overflow:'hidden', border:'1px solid #E2E8F0', background:'white', fontFamily:FF }}>

          {/* Header */}
          <div style={{ display:'grid', gridTemplateColumns:COLS }}>
            {['','Patient','Date / Time','Buffer','Main Complaint','Status',''].map((h, i) => (
              <div key={i} style={{ ...TH, textAlign: i === 0 ? 'center' : 'left' }}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          {queue.map((c, i) => {
            const isLocked    = c.provider_id && c.provider_id !== currentProviderId
            const isScanning  = c.status === 'waiting'
            const isBlocked   = isLocked || isScanning
            const buf = bufferInfo(c.created_at, now)
            const sta = queueStatus(c, now)
            const tb  = TYPE_BADGE[c.consultation_type || 'video'] || TYPE_BADGE.video
            const isLast = i === queue.length - 1
            const isCalling = starting === c.id
            const complaint = (c.chief_complaint || '').length > 20
              ? c.chief_complaint.slice(0, 20) + '…'
              : c.chief_complaint

            return (
              <div
                key={c.id}
                onClick={() => { if (!isBlocked) navigate(`/clinician/patient/${c.id}`) }}
                title={isScanning ? 'Patient completing vitals scan' : isLocked ? 'Being reviewed by another provider' : undefined}
                style={{
                  display:'grid', gridTemplateColumns:COLS,
                  borderBottom: isLast ? 'none' : '1px solid #F3F4F6',
                  cursor: isBlocked ? 'not-allowed' : 'pointer',
                  background: isLocked ? '#F3F4F6' : 'white',
                  opacity: isBlocked ? 0.55 : 1,
                  transition:'background .1s, opacity .15s',
                  alignItems:'center',
                }}
                onMouseEnter={e => { if (!isBlocked) e.currentTarget.style.background='#F0F9FA' }}
                onMouseLeave={e => { e.currentTarget.style.background = isLocked ? '#F3F4F6' : 'white' }}
              >
                {/* Type icon — shows 📸 when scanning */}
                <div style={{ ...TD, display:'flex', justifyContent:'center' }}>
                  <div style={{ width:40, height:40, borderRadius:10, background: isScanning ? '#FEF3C7' : tb.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.25rem', flexShrink:0 }}>
                    {isScanning ? '📸' : tb.icon}
                  </div>
                </div>

                {/* Patient name */}
                <div style={TD}>
                  <div style={{ fontWeight:600, color:NAVY, fontSize:'.9375rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {c.patient_first_name} {c.patient_last_name}
                  </div>
                  {c.acc_eligible==='yes' && (
                    <span style={{ background:'#D4EEF0', color:TEAL, fontSize:'.5625rem', fontWeight:700, padding:'1px 5px', borderRadius:99, whiteSpace:'nowrap', display:'inline-block', marginTop:3 }}>ACC</span>
                  )}
                </div>

                {/* Date/time */}
                <div style={TD}>
                  <div style={{ fontSize:'.75rem', color:'#374151', lineHeight:1.5, whiteSpace:'nowrap' }}>{fmtEnteredAt(c.created_at)}</div>
                </div>

                {/* Buffer */}
                <div style={TD}>
                  <span style={{ background:buf.bg, color:buf.color, fontSize:'.6875rem', fontWeight:700, padding:'4px 8px', borderRadius:99, whiteSpace:'nowrap', display:'inline-block' }}>
                    {buf.label}
                  </span>
                </div>

                {/* Complaint */}
                <div style={TD}>
                  <div style={{ fontSize:'.875rem', color:'#374151', fontStyle:'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={c.chief_complaint}>
                    {complaint}
                  </div>
                  {c.patient_allergies && !['none','no','nkda','nil','no known allergies','no allergies','n/a'].includes(c.patient_allergies.toLowerCase().trim()) && (
                    <div style={{ fontSize:'.625rem', color:'#DC2626', fontWeight:700, marginTop:2 }}>⚠ Allergy</div>
                  )}
                </div>

                {/* Status */}
                <div style={{ ...TD, paddingRight:'.5rem' }}>
                  <span style={{ background:sta.bg, color:sta.color, fontSize:'.6875rem', fontWeight:700, padding:'4px 8px', borderRadius:99, whiteSpace:'nowrap', display:'inline-block' }}>
                    {isCalling ? 'Calling…' : sta.label}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ ...TD, display:'flex', gap:4, justifyContent:'flex-end', paddingRight:'.875rem' }}>
                  {!isBlocked && (
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/clinician/patient/${c.id}`) }}
                      title="View patient"
                      style={{ background:'none', border:'1.5px solid #E2E8F0', borderRadius:8, width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:'1rem', color:'#6B7280' }}
                    >👁</button>
                  )}
                  {!isScanning && !isLocked && (
                    <button
                      onClick={e => { e.stopPropagation(); setDismissTarget(c) }}
                      title="Dismiss patient"
                      style={{ background:'none', border:'1.5px solid #E2E8F0', borderRadius:8, width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:'.875rem', color:'#9CA3AF' }}
                    >✕</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ textAlign:'center', padding:'.625rem 0 .25rem', fontSize:'.75rem', color:'#9CA3AF' }}>
          {queue.length} patient{queue.length !== 1 ? 's' : ''} in queue · Click a row to view
        </div>
      </div>

      {/* Dismiss confirmation modal */}
      {dismissTarget && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:500, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:'0 0 calc(env(safe-area-inset-bottom) + .5rem)' }}
          onClick={e => { if (e.target === e.currentTarget) setDismissTarget(null) }}>
          <div style={{ background:'white', borderRadius:'20px 20px 0 0', padding:'1.5rem 1.25rem', width:'100%', maxWidth:480, fontFamily:FF }}>
            <div style={{ fontWeight:700, fontSize:'1.0625rem', color:NAVY, marginBottom:'.5rem' }}>
              Dismiss {dismissTarget.patient_first_name} {dismissTarget.patient_last_name}?
            </div>
            <div style={{ fontSize:'.875rem', color:'#6B7280', marginBottom:'1.25rem', lineHeight:1.6 }}>
              They will be removed from the queue. <strong>No charge will be applied</strong> and they'll receive an email letting them know.
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem' }}>
              <button onClick={() => setDismissTarget(null)}
                style={{ background:'white', border:'1.5px solid #D1D5DB', color:'#374151', borderRadius:12, padding:'13px', fontWeight:600, fontSize:'.9375rem', cursor:'pointer', fontFamily:FF }}>
                Cancel
              </button>
              <button
                disabled={dismissing}
                onClick={async () => {
                  setDismissing(true)
                  await onDismiss(dismissTarget)
                  setDismissTarget(null)
                  setDismissing(false)
                }}
                style={{ background:'#DC2626', color:'white', border:'none', borderRadius:12, padding:'13px', fontWeight:700, fontSize:'.9375rem', cursor: dismissing ? 'not-allowed' : 'pointer', fontFamily:FF, opacity: dismissing ? .7 : 1 }}
              >
                {dismissing ? 'Dismissing…' : 'Dismiss patient'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Response templates ────────────────────────────────────────────────────────

const RESPONSE_TEMPLATES = [
  {
    label: 'URTI',
    text: 'Based on your symptoms, this appears consistent with an upper respiratory tract infection (URTI), which is most likely viral. Antibiotics won\'t help here. I recommend rest, staying well hydrated, and paracetamol or ibuprofen for fever and discomfort. Most URTIs resolve within 7–10 days. Please seek care if your symptoms worsen significantly, you develop shortness of breath, a high fever (over 39°C), or your symptoms persist beyond 2 weeks.',
  },
  {
    label: 'UTI',
    text: 'Your symptoms are consistent with an uncomplicated urinary tract infection. I\'m prescribing trimethoprim 300mg at night for 3 nights — please fill this at your pharmacy. Drink plenty of water throughout the day. If symptoms worsen, you develop fever or flank pain, or if you\'re not improving after 2–3 days, please seek further medical attention.',
  },
  {
    label: 'Repeat Rx',
    text: 'I\'ve reviewed your medication history and am happy to issue a repeat prescription. This will be sent to your nominated pharmacy. Please continue as previously prescribed. It would be worth booking a regular medication review to ensure everything remains appropriate for you.',
  },
  {
    label: 'Medical cert',
    text: 'Based on your symptoms, I can confirm you are unfit for work from today. I recommend rest and a gradual return to normal activities as you feel able. If your symptoms are not improving or you need a further certificate, please consult us again.',
  },
  {
    label: 'Reassurance',
    text: 'Based on the information you\'ve provided, your symptoms do not appear to indicate anything serious at this stage. I\'d recommend monitoring how you feel over the next few days with rest and over-the-counter relief if needed. Please get in touch if your symptoms worsen, change, or you remain concerned — we\'re here to help.',
  },
]

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

function MessagesTab({ msgBadge, setMsgBadge }) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading]             = useState(true)
  const providerId = sessionStorage.getItem('providerId')

  async function load() {
    try {
      const res = await apiFetch('/api/provider-notifications?providerId=' + (providerId || ''))
      const data = await res.json()
      const notifs = data.notifications || []
      setNotifications(notifs)
      const unread = notifs.filter(n => !n.is_read).length
      if (setMsgBadge) setMsgBadge(unread)
    } catch {} finally { setLoading(false) }
  }

  async function markRead(id) {
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, is_read: true } : n))
    setMsgBadge?.(prev => Math.max(0, (prev || 0) - 1))
    apiFetch('/api/provider-notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, providerId }),
    }).catch(() => {})
  }

  async function markAllRead() {
    setNotifications(ns => ns.map(n => ({ ...n, is_read: true })))
    setMsgBadge?.(0)
    apiFetch('/api/provider-notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true, providerId }),
    }).catch(() => {})
  }

  useEffect(() => { load() }, [])

  if (loading) return <div style={{ textAlign: 'center', padding: '4rem' }}><div className="spinner" /></div>

  return (
    <div style={{ padding: '1rem', fontFamily: FF }}>
      {!notifications.length ? (
        <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '.75rem' }}>✉️</div>
          <div style={{ fontWeight: 700, color: NAVY, fontSize: '1.125rem', marginBottom: '.5rem' }}>No messages</div>
          <div style={{ color: '#6B7280', fontSize: '.9375rem' }}>Admin notifications will appear here</div>
        </div>
      ) : (
        <>
          {notifications.some(n => !n.is_read) && (
            <button onClick={markAllRead}
              style={{ display: 'block', marginLeft: 'auto', marginBottom: '.75rem', background: 'none', border: 'none', color: TEAL, fontSize: '.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: FF }}>
              Mark all read ✓
            </button>
          )}
          {notifications.map(n => (
            <div key={n.id} onClick={() => !n.is_read && markRead(n.id)}
              style={{ background: n.is_read ? 'white' : '#EFF9F9', borderRadius: 14, border: `1px solid ${n.is_read ? '#E2E8F0' : '#A7D4D8'}`, borderLeft: `4px solid ${n.is_pinned ? '#D97706' : n.is_read ? '#E2E8F0' : TEAL}`, padding: '1rem 1.25rem', marginBottom: '.75rem', cursor: n.is_read ? 'default' : 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '.5rem', marginBottom: '.25rem' }}>
                <div style={{ fontWeight: n.is_read ? 600 : 700, fontSize: '.9375rem', color: NAVY }}>{n.subject}</div>
                <div style={{ display: 'flex', gap: '.375rem', flexShrink: 0 }}>
                  {!n.is_read && <span style={{ background: TEAL, color: 'white', fontSize: '.625rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>NEW</span>}
                  {n.is_pinned && <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: '.625rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>PINNED</span>}
                </div>
              </div>
              <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginBottom: '.5rem' }}>
                {n.from_name} · {new Date(n.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
              <div style={{ fontSize: '.875rem', color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{n.body}</div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}


// ── PMS tab ───────────────────────────────────────────────────────────────────

const ACC_STATUS_COLOR = { submitted:'#D97706', simulated:'#6B7280', invoiced:'#2563EB', paid:'#059669', declined:'#DC2626', pending:'#9CA3AF' }
const ACC_STATUS_LABEL = { submitted:'Submitted', simulated:'Test', invoiced:'Invoiced', paid:'Paid', declined:'Declined', pending:'Pending' }

function PMSStat({ label, value, sub, color }) {
  return (
    <div style={{ background:'white', borderRadius:14, padding:'1rem', border:'1px solid #E2E8F0', textAlign:'center' }}>
      <div style={{ fontSize:'1.625rem', fontWeight:800, color:color||NAVY, lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:'.6875rem', fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.04em', marginTop:4 }}>{label}</div>
      {sub && <div style={{ fontSize:'.6875rem', color:'#9CA3AF', marginTop:2 }}>{sub}</div>}
    </div>
  )
}

function PMSTab({ navigate }) {
  const [subTab, setSubTab]     = useState('overview')
  const [loading, setLoading]   = useState(true)
  const [data, setData]         = useState(null)
  const [pendingNotes, setPendingNotes] = useState([])
  const [completedNotes, setCompletedNotes] = useState([])
  const [notesTab, setNotesTab] = useState('pending')
  const providerId = sessionStorage.getItem('providerId') || ''

  async function load() {
    setLoading(true)
    try {
      const { supabase } = await import('../../lib/supabase')
      const nzNow      = new Date(new Date().toLocaleString('en-US', { timeZone:'Pacific/Auckland' }))
      const todayStart = new Date(nzNow.getFullYear(), nzNow.getMonth(), nzNow.getDate()).toISOString()

      const [todayRes, claimsRes, rxRes, pendingRes, completedRes] = await Promise.allSettled([
        // Today's consults
        supabase.from('consultations')
          .select('id,status,consultation_type,is_acc,payment_amount_nzd,notes_finalised,created_at,patient_first_name,patient_last_name,chief_complaint,acc_claim_number,acc_claim_status,outcome')
          .eq('status','complete').gte('created_at', todayStart)
          .order('created_at', { ascending:false }),

        // ACC claims
        supabase.from('acc_claims')
          .select('*').order('created_at',{ascending:false}).limit(50),

        // Prescriptions
        supabase.from('prescriptions')
          .select('id,drug_name,drug,dose,directions,delivery_status,created_at,patient_name,nzeps_token,consultation_id')
          .order('created_at',{ascending:false}).limit(30),

        // Pending notes
        supabase.from('consultations')
          .select('id,created_at,patient_first_name,patient_last_name,chief_complaint,acc_eligible')
          .eq('status','complete').eq('notes_finalised',false)
          .order('created_at',{ascending:false}).limit(50),

        // Completed notes
        supabase.from('consultations')
          .select('id,created_at,patient_first_name,patient_last_name,chief_complaint,notes_finalised_at,outcome,note_finalised_by,prescription_issued,referral_issued')
          .eq('status','complete').eq('notes_finalised',true)
          .order('notes_finalised_at',{ascending:false}).limit(50),
      ])

      const today     = todayRes.status   === 'fulfilled' ? (todayRes.value.data   || []) : []
      const claims    = claimsRes.status  === 'fulfilled' ? (claimsRes.value.data  || []) : []
      const rx        = rxRes.status      === 'fulfilled' ? (rxRes.value.data      || []) : []

      const claimsByStatus = claims.reduce((m,c) => { m[c.status]=(m[c.status]||0)+1; return m }, {})
      const outstandingCents = claims.filter(c=>['submitted','invoiced'].includes(c.status)).reduce((s,c)=>s+(c.amount_claimed||0),0)
      const paidCents        = claims.filter(c=>c.status==='paid').reduce((s,c)=>s+(c.amount_paid||0),0)
      const todayRevenue     = today.reduce((s,c)=>s+(c.payment_amount_nzd||0),0)

      setData({ today, claims, rx, claimsByStatus, outstandingCents, paidCents, todayRevenue })
      setPendingNotes(pendingRes.status   === 'fulfilled' ? (pendingRes.value.data   || []) : [])
      setCompletedNotes(completedRes.status === 'fulfilled' ? (completedRes.value.data || []) : [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'4rem', gap:12, fontFamily:FF, color:'#9CA3AF' }}>
      <div style={{ width:20,height:20,border:'2px solid #D4EEF0',borderTopColor:TEAL,borderRadius:'50%',animation:'spin .8s linear infinite' }} />
      Loading…
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const subTabs = [
    { id:'overview', label:'Overview' },
    { id:'notes',    label:`Notes${pendingNotes.length ? ` (${pendingNotes.length})` : ''}` },
    { id:'claims',   label:`ACC${(data?.claims||[]).length ? ` (${(data?.claims||[]).length})` : ''}` },
    { id:'rx',       label:`Rx${(data?.rx||[]).length ? ` (${(data?.rx||[]).length})` : ''}` },
  ]

  return (
    <div style={{ fontFamily:FF, minHeight:'100%' }}>
      {/* Sub-tab bar */}
      <div style={{ display:'flex', background:'white', borderBottom:'1px solid #E2E8F0', position:'sticky', top:0, zIndex:10 }}>
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            style={{ flex:1, padding:'.75rem .25rem', background:'none', border:'none', borderBottom:`2px solid ${subTab===t.id?TEAL:'transparent'}`, color:subTab===t.id?TEAL:'#6B7280', fontFamily:FF, fontWeight:700, fontSize:'.75rem', cursor:'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding:'1rem' }}>

        {/* ── OVERVIEW ──────────────────────────────────────────────────────── */}
        {subTab === 'overview' && (
          <>
            <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#9CA3AF', marginBottom:'.625rem' }}>
              Today
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'.625rem', marginBottom:'1.25rem' }}>
              <PMSStat label="Consults"     value={data?.today?.length || 0} color={NAVY} />
              <PMSStat label="Revenue"      value={`$${((data?.todayRevenue||0)).toFixed(0)}`} color='#059669' />
              <PMSStat label="ACC claims"   value={data?.today?.filter(c=>c.is_acc)?.length || 0} color='#2563EB' />
              <PMSStat label="Pending notes" value={pendingNotes.length} color={pendingNotes.length>0?'#D97706':'#059669'} />
            </div>

            {pendingNotes.length > 0 && (
              <>
                <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#D97706', marginBottom:'.625rem' }}>
                  Pending notes ({pendingNotes.length})
                </div>
                {pendingNotes.slice(0,3).map(c => (
                  <div key={c.id} style={{ background:'white', borderRadius:14, border:'1px solid #E2E8F0', borderLeft:'4px solid #D97706', padding:'1rem 1.25rem', marginBottom:'.625rem', cursor:'pointer' }}
                    onClick={() => navigate(`/provider/notes/${c.id}`)}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <div style={{ fontWeight:700, color:NAVY, fontSize:'.9375rem' }}>{c.patient_first_name} {c.patient_last_name}</div>
                      <span style={{ fontSize:'.75rem', color:'#9CA3AF' }}>{timeAgo(c.created_at)}</span>
                    </div>
                    <div style={{ fontSize:'.8125rem', color:'#6B7280', fontStyle:'italic', marginBottom:'.75rem' }}>{c.chief_complaint}</div>
                    <div style={{ fontSize:'.75rem', fontWeight:700, color:TEAL }}>Complete notes →</div>
                  </div>
                ))}
                {pendingNotes.length > 3 && (
                  <button onClick={() => setSubTab('notes')} style={{ width:'100%', background:'none', border:'1px dashed #E2E8F0', borderRadius:12, padding:'.75rem', color:'#9CA3AF', fontFamily:FF, fontSize:'.8125rem', cursor:'pointer', marginBottom:'1.25rem' }}>
                    + {pendingNotes.length - 3} more pending notes
                  </button>
                )}
              </>
            )}

            {(data?.claims||[]).length > 0 && (
              <>
                <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#9CA3AF', marginBottom:'.625rem' }}>
                  ACC claims
                </div>
                <div style={{ background:'white', borderRadius:14, border:'1px solid #E2E8F0', padding:'1rem 1.25rem', marginBottom:'1.25rem' }}>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'.5rem', marginBottom:'.875rem' }}>
                    {Object.entries(data.claimsByStatus).map(([status, count]) => (
                      <span key={status} style={{ background:`${ACC_STATUS_COLOR[status]}18`, color:ACC_STATUS_COLOR[status]||'#6B7280', borderRadius:99, padding:'3px 10px', fontSize:'.75rem', fontWeight:700 }}>
                        {ACC_STATUS_LABEL[status]||status}: {count}
                      </span>
                    ))}
                  </div>
                  {data.outstandingCents > 0 && (
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:'.875rem' }}>
                      <span style={{ color:'#6B7280' }}>Outstanding</span>
                      <span style={{ fontWeight:700, color:NAVY }}>${(data.outstandingCents/100).toFixed(2)}</span>
                    </div>
                  )}
                  {data.paidCents > 0 && (
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:'.875rem', marginTop:4 }}>
                      <span style={{ color:'#6B7280' }}>Total received</span>
                      <span style={{ fontWeight:700, color:'#059669' }}>${(data.paidCents/100).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {data?.today?.length > 0 && (
              <>
                <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#9CA3AF', marginBottom:'.625rem' }}>
                  Today's consultations
                </div>
                {data.today.map(c => (
                  <div key={c.id} onClick={() => navigate(`/provider/notes/${c.id}`)}
                    style={{ background:'white', borderRadius:14, border:'1px solid #E2E8F0', borderLeft:`4px solid ${c.is_acc?'#2563EB':'#059669'}`, padding:'1rem 1.25rem', marginBottom:'.625rem', cursor:'pointer' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <div style={{ fontWeight:700, color:NAVY, fontSize:'.9375rem' }}>{c.patient_first_name} {c.patient_last_name}</div>
                      <div style={{ display:'flex', gap:4 }}>
                        {c.is_acc && <span style={{ background:'#DBEAFE', color:'#1D4ED8', fontSize:'.625rem', fontWeight:700, padding:'2px 6px', borderRadius:99 }}>ACC</span>}
                        {c.acc_claim_number && <span style={{ background:'#D1FAE5', color:'#065F46', fontSize:'.625rem', fontWeight:700, padding:'2px 6px', borderRadius:99 }}>✓ Claim</span>}
                      </div>
                    </div>
                    <div style={{ fontSize:'.8125rem', color:'#6B7280', fontStyle:'italic' }}>{c.chief_complaint}</div>
                    {c.acc_claim_number && <div style={{ fontSize:'.75rem', color:'#059669', marginTop:3 }}>Claim: {c.acc_claim_number}</div>}
                  </div>
                ))}
              </>
            )}

            {!data?.today?.length && !pendingNotes.length && (
              <div style={{ textAlign:'center', padding:'3rem 1.5rem' }}>
                <div style={{ fontSize:'3rem', marginBottom:'.75rem' }}>📊</div>
                <div style={{ fontWeight:700, color:NAVY, fontSize:'1.125rem', marginBottom:'.5rem' }}>PMS ready</div>
                <div style={{ color:'#6B7280', fontSize:'.875rem' }}>Activity from today's consultations will appear here</div>
              </div>
            )}
          </>
        )}

        {/* ── NOTES ─────────────────────────────────────────────────────────── */}
        {subTab === 'notes' && (
          <>
            <div style={{ display:'flex', gap:8, marginBottom:'1rem' }}>
              {[{id:'pending',label:'Pending',count:pendingNotes.length},{id:'completed',label:'Completed',count:completedNotes.length}].map(t => (
                <button key={t.id} onClick={() => setNotesTab(t.id)}
                  style={{ flex:1, padding:'.75rem', borderRadius:10, border:`1.5px solid ${notesTab===t.id?TEAL:'#E2E8F0'}`, background:notesTab===t.id?'#EFF9F9':'white', color:notesTab===t.id?TEAL:'#6B7280', fontFamily:FF, fontWeight:700, fontSize:'.875rem', cursor:'pointer' }}>
                  {t.label} {t.count>0&&`(${t.count})`}
                </button>
              ))}
            </div>

            {notesTab === 'pending' && (
              !pendingNotes.length ? (
                <div style={{ textAlign:'center', padding:'3rem 1.5rem' }}>
                  <div style={{ fontSize:'3rem', marginBottom:'.75rem' }}>✓</div>
                  <div style={{ fontWeight:700, color:NAVY, fontSize:'1.125rem' }}>All notes complete</div>
                </div>
              ) : pendingNotes.map(c => (
                <div key={c.id} style={{ background:'white', borderRadius:14, border:'1px solid #E2E8F0', borderLeft:'4px solid #D97706', padding:'1.25rem', marginBottom:'.75rem' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <div style={{ fontWeight:700, color:NAVY }}>{c.patient_first_name} {c.patient_last_name}</div>
                    <span style={{ fontSize:'.75rem', color:'#9CA3AF' }}>{timeAgo(c.created_at)}</span>
                  </div>
                  <div style={{ fontSize:'.875rem', color:'#6B7280', marginBottom:'1rem', fontStyle:'italic' }}>{c.chief_complaint}</div>
                  <button onClick={() => navigate(`/provider/notes/${c.id}`)} style={{ width:'100%', background:NAVY, color:'white', border:'none', borderRadius:12, padding:'14px', fontWeight:700, fontSize:'1rem', cursor:'pointer', fontFamily:FF, minHeight:52 }}>
                    Complete notes →
                  </button>
                </div>
              ))
            )}

            {notesTab === 'completed' && (
              !completedNotes.length ? (
                <div style={{ textAlign:'center', padding:'3rem 1.5rem' }}>
                  <div style={{ fontSize:'3rem', marginBottom:'.75rem' }}>📋</div>
                  <div style={{ fontWeight:700, color:NAVY, fontSize:'1.125rem' }}>No completed notes yet</div>
                </div>
              ) : completedNotes.map(c => (
                <div key={c.id} onClick={() => navigate(`/provider/notes/${c.id}`)}
                  style={{ background:'white', borderRadius:14, border:'1px solid #E2E8F0', borderLeft:'4px solid #059669', padding:'1.25rem', marginBottom:'.75rem', cursor:'pointer' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <div style={{ fontWeight:700, color:NAVY }}>{c.patient_first_name} {c.patient_last_name}</div>
                    <div style={{ display:'flex', gap:4 }}>
                      {c.prescription_issued && <span style={{ background:'#EFF9F9', color:TEAL, fontSize:'.625rem', fontWeight:700, padding:'2px 6px', borderRadius:99 }}>Rx</span>}
                      {c.referral_issued && <span style={{ background:'#F5F3FF', color:'#7C3AED', fontSize:'.625rem', fontWeight:700, padding:'2px 6px', borderRadius:99 }}>Xr</span>}
                    </div>
                  </div>
                  <div style={{ fontSize:'.875rem', color:'#6B7280', fontStyle:'italic', marginBottom:4 }}>{c.chief_complaint}</div>
                  <div style={{ fontSize:'.75rem', color:'#9CA3AF' }}>
                    {c.notes_finalised_at ? new Date(c.notes_finalised_at).toLocaleDateString('en-NZ',{day:'numeric',month:'short',year:'numeric'}) : ''}
                    {c.note_finalised_by ? ` · ${c.note_finalised_by}` : ''}
                    {c.outcome ? ` · ${c.outcome.replace(/_/g,' ')}` : ''}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* ── ACC CLAIMS ────────────────────────────────────────────────────── */}
        {subTab === 'claims' && (
          !(data?.claims||[]).length ? (
            <div style={{ textAlign:'center', padding:'3rem 1.5rem' }}>
              <div style={{ fontSize:'3rem', marginBottom:'.75rem' }}>🏥</div>
              <div style={{ fontWeight:700, color:NAVY, fontSize:'1.125rem', marginBottom:'.5rem' }}>No ACC claims yet</div>
              <div style={{ color:'#6B7280', fontSize:'.875rem', lineHeight:1.6 }}>
                Claims appear here automatically when you finalise a consultation marked as ACC eligible.
              </div>
              <div style={{ marginTop:'1rem', background:'#EFF6FF', borderRadius:12, padding:'.875rem', fontSize:'.8125rem', color:'#1D4ED8', lineHeight:1.6 }}>
                ℹ️ ACC API credentials not yet configured — claims will be simulated until ACC_API_KEY and ACC_VENDOR_ID are set.
              </div>
            </div>
          ) : (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'.625rem', marginBottom:'1.25rem' }}>
                <PMSStat label="Outstanding" value={`$${((data?.outstandingCents||0)/100).toFixed(0)}`} color='#D97706' />
                <PMSStat label="Total paid"  value={`$${((data?.paidCents||0)/100).toFixed(0)}`} color='#059669' />
              </div>
              {(data?.claims||[]).map(c => (
                <div key={c.id} style={{ background:'white', borderRadius:14, border:`1px solid ${ACC_STATUS_COLOR[c.status]||'#E2E8F0'}33`, borderLeft:`4px solid ${ACC_STATUS_COLOR[c.status]||'#9CA3AF'}`, padding:'1rem 1.25rem', marginBottom:'.625rem' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                    <div>
                      <div style={{ fontWeight:700, color:NAVY, fontSize:'.9375rem' }}>{c.patient_name}</div>
                      <div style={{ fontSize:'.75rem', color:'#9CA3AF', marginTop:2 }}>
                        {new Date(c.created_at).toLocaleDateString('en-NZ',{day:'numeric',month:'short',year:'numeric'})}
                        {c.provider_name ? ` · ${c.provider_name}` : ''}
                      </div>
                    </div>
                    <span style={{ background:`${ACC_STATUS_COLOR[c.status]||'#9CA3AF'}18`, color:ACC_STATUS_COLOR[c.status]||'#9CA3AF', borderRadius:99, padding:'3px 10px', fontSize:'.6875rem', fontWeight:700, flexShrink:0, marginLeft:8 }}>
                      {ACC_STATUS_LABEL[c.status]||c.status}
                    </span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:'.8125rem' }}>
                    <span style={{ color:'#6B7280' }}>
                      {c.claim_number ? `#${c.claim_number}` : 'No claim number'}
                      {c.service_code ? ` · ${c.service_code}` : ''}
                    </span>
                    <span style={{ fontWeight:700, color:c.status==='paid'?'#059669':NAVY }}>
                      {c.status==='paid' && c.amount_paid ? `$${(c.amount_paid/100).toFixed(2)} paid` : c.amount_claimed ? `$${(c.amount_claimed/100).toFixed(2)} claimed` : ''}
                    </span>
                  </div>
                  {c.decline_reason && (
                    <div style={{ marginTop:6, background:'#FEF2F2', borderRadius:8, padding:'6px 10px', fontSize:'.75rem', color:'#DC2626' }}>
                      Declined: {c.decline_reason}
                    </div>
                  )}
                </div>
              ))}
            </>
          )
        )}

        {/* ── PRESCRIPTIONS ─────────────────────────────────────────────────── */}
        {subTab === 'rx' && (
          !(data?.rx||[]).length ? (
            <div style={{ textAlign:'center', padding:'3rem 1.5rem' }}>
              <div style={{ fontSize:'3rem', marginBottom:'.75rem' }}>💊</div>
              <div style={{ fontWeight:700, color:NAVY, fontSize:'1.125rem', marginBottom:'.5rem' }}>No prescriptions yet</div>
              <div style={{ color:'#6B7280', fontSize:'.875rem' }}>Issued prescriptions will appear here</div>
            </div>
          ) : (data?.rx||[]).map(rx => (
            <div key={rx.id} style={{ background:'white', borderRadius:14, border:'1px solid #E2E8F0', borderLeft:'4px solid #EFF9F9', padding:'1rem 1.25rem', marginBottom:'.625rem' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                <div style={{ fontWeight:700, color:NAVY, fontSize:'.9375rem' }}>{rx.drug_name||rx.drug}</div>
                <span style={{ background: rx.delivery_status==='sent'?'#D1FAE5':rx.delivery_status==='error'?'#FEE2E2':'#F3F4F6', color:rx.delivery_status==='sent'?'#065F46':rx.delivery_status==='error'?'#991B1B':'#6B7280', borderRadius:99, padding:'2px 8px', fontSize:'.625rem', fontWeight:700 }}>
                  {rx.delivery_status||'draft'}
                </span>
              </div>
              {rx.dose && <div style={{ fontSize:'.8125rem', color:'#6B7280' }}>{rx.dose}</div>}
              <div style={{ fontSize:'.75rem', color:'#9CA3AF', marginTop:4 }}>
                {rx.patient_name && `${rx.patient_name} · `}
                {new Date(rx.created_at).toLocaleDateString('en-NZ',{day:'numeric',month:'short'})}
              </div>
              {rx.nzeps_token && (
                <div style={{ marginTop:6, background:'#EFF9F9', borderRadius:8, padding:'4px 10px', fontSize:'.75rem', color:TEAL, fontWeight:700 }}>
                  NZePS token: {rx.nzeps_token}
                </div>
              )}
            </div>
          ))
        )}

      </div>
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

function BottomNav({ tab, setTab, queueBadge, notesBadge, msgBadge }) {
  const items = [
    { id:'queue',    icon:'🏥', label:'Queue',    badge:queueBadge },
    { id:'messages', icon:'✉️', label:'Messages', badge:msgBadge },
    { id:'pms',      icon:'📊', label:'PMS',      badge:notesBadge },
    { id:'schedule', icon:'📅', label:'Schedule', badge:0 },
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
  const [msgBadge, setMsgBadge]   = useState(0)
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
    const isMessage = c.consultation_type === 'message' || c.consultation_subtype === 'async_message'
    if (isMessage) {
      navigate(`/provider/notes/${c.id}`)
      return
    }
    setStarting(c.id)
    try {
      await apiFetch('/api/initiate-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultationId: c.id,
          providerId,
          providerName: displayName,
        }),
      })
    } catch {}
    setStarting(null)
    navigate(`/provider/consult/${c.id}`)
  }

  async function dismiss(c) {
    try {
      await apiFetch('/api/dismiss-patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultationId: c.id,
          patientEmail: c.patient_email,
          patientName: `${c.patient_first_name || ''} ${c.patient_last_name || ''}`.trim(),
          paymentIntentId: c.payment_intent_id || undefined,
        }),
      })
    } catch {}
    setConsultations(cs => cs.filter(x => x.id !== c.id))
  }

  const queueCount = consultations.length

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
        {tab === 'queue'    && <QueueTab consultations={consultations} loading={loading} starting={starting} onStart={startConsult} onDismiss={dismiss} navigate={navigate} />}
        {tab === 'messages' && <MessagesTab msgBadge={msgBadge} setMsgBadge={setMsgBadge} />}
        {tab === 'pms'      && <PMSTab navigate={navigate} />}
        {tab === 'schedule' && <ProviderSchedule embedded />}
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
      <BottomNav tab={tab} setTab={setTab} queueBadge={queueCount} notesBadge={0} msgBadge={msgBadge} />
    </div>
  )
}
