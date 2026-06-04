import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getConsultation } from '../../lib/supabase'
import { ConsultationRecorder, transcribeAudio } from '../../lib/tereScribe'
import { LiveKitRoom, VideoConference } from '@livekit/components-react'
import '@livekit/components-styles'
import { apiFetch } from '../../lib/api'

const FF   = 'Plus Jakarta Sans, sans-serif'
const TEAL = '#0B6E76'
const NAVY = '#0D2B45'
const GREEN = '#059669'

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

function VitalBadge({ label, value, unit, status }) {
  const colors = { normal:'#059669', warning:'#D97706', danger:'#DC2626' }
  const bgs    = { normal:'#F0FDF4', warning:'#FFFBEB', danger:'#FEF2F2' }
  const c = colors[status] || '#374151'
  const bg = bgs[status] || '#F8FAFC'
  return (
    <div style={{ background:bg, borderRadius:10, padding:'10px 14px', flex:1, textAlign:'center', minWidth:0 }}>
      <div style={{ fontSize:'.625rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#9CA3AF', marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:'1.5rem', fontWeight:700, color:c, lineHeight:1 }}>{value || '—'}</div>
      {unit && <div style={{ fontSize:'.625rem', color:'#9CA3AF' }}>{unit}</div>}
    </div>
  )
}

function VitalsRow({ vitals }) {
  if (!vitals || vitals.skipped) return (
    <div style={{ fontSize:'.875rem', color:'#9CA3AF', textAlign:'center', padding:'10px' }}>No vitals captured</div>
  )
  const hrS = vitals.hr ? (vitals.hr < 60 || vitals.hr > 100 ? 'warning' : 'normal') : ''
  const rrS = vitals.rr ? (vitals.rr < 12 || vitals.rr > 20 ? 'warning' : 'normal') : ''
  return (
    <div style={{ display:'flex', gap:8 }}>
      {vitals.hr  && <VitalBadge label="HR"   value={vitals.hr}   unit="bpm"      status={hrS} />}
      {vitals.rr  && <VitalBadge label="RR"   value={vitals.rr}   unit="br/min"   status={rrS} />}
      {vitals.spo2 && <VitalBadge label="SpO₂" value={`${vitals.spo2}%`} unit="" status="normal" />}
      {vitals.bp  && <VitalBadge label="BP"   value={vitals.bp}   unit="mmHg"     status="" />}
    </div>
  )
}

export default function ProviderConsult() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [consult, setConsult]           = useState(null)
  const [loading, setLoading]           = useState(true)
  const [calling, setCalling]           = useState(false)
  const [inCall, setInCall]             = useState(false)
  const [lkToken, setLkToken]           = useState(null)
  const [lkUrl, setLkUrl]               = useState(null)
  const [scribeState, setScribeState]   = useState('idle') // idle|recording|transcribing
  const [transcript, setTranscript]     = useState('')
  const [showNotes, setShowNotes]       = useState(false)
  const [callNotes, setCallNotes]       = useState('')
  const [actions, setActions]           = useState([])
  const [endingCall, setEndingCall]     = useState(false)
  const [callStart, setCallStart]       = useState(null)
  const [elapsed, setElapsed]           = useState(0)
  const recorderRef = useRef(null)
  const pollRef = useRef(null)

  // Auth check — support remembered device
  useEffect(() => {
    if (!sessionStorage.getItem('clinicianAuth')) {
      const saved = getSaved()
      if (saved) restoreDevice(saved)
      else { navigate('/clinician?redirect=/provider'); return }
    }
  }, [navigate])

  // Load consultation
  useEffect(() => {
    async function load() {
      try {
        const data = await getConsultation(id)
        setConsult(data)
        if (data.status === 'in_progress') {
          setInCall(true)
          await fetchToken()
        }
      } catch (e) {
        console.error(e)
      }
      setLoading(false)
    }
    load()
  }, [id])

  // Poll for status changes
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const data = await getConsultation(id)
        setConsult(prev => {
          if (!prev) return data
          if (data.status !== prev.status) return data
          return prev
        })
        if (data.status === 'in_progress' && !inCall) {
          setInCall(true)
        }
      } catch {}
    }, 4000)
    return () => clearInterval(pollRef.current)
  }, [id, inCall])

  // Call timer
  useEffect(() => {
    if (!inCall) return
    if (!callStart) setCallStart(Date.now())
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - (callStart || Date.now())) / 1000)), 1000)
    return () => clearInterval(t)
  }, [inCall, callStart])

  async function fetchToken() {
    try {
      const tr = await apiFetch('/api/join-room', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ consultationId:id, identity:`provider-${id.slice(0,8)}` })
      })
      if (tr.ok) {
        const { token, serverUrl } = await tr.json()
        if (token) { setLkToken(token); setLkUrl(serverUrl) }
      }
    } catch {}
  }

  async function initiateCall() {
    setCalling(true)
    try {
      const providerId   = sessionStorage.getItem('providerId')
      const providerName = sessionStorage.getItem('providerDisplayName')
      const res = await apiFetch('/api/initiate-call', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultationId: id, providerId, providerName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setConsult(d => ({ ...d, status: 'in_progress' }))
      if (data.token) { setLkToken(data.token); setLkUrl(data.serverUrl) }
      setCallStart(Date.now())
      setInCall(true)
    } catch (e) { console.error(e) }
    setCalling(false)
  }

  async function startScribe() {
    setScribeState('recording')
    recorderRef.current = new ConsultationRecorder()
    try { await recorderRef.current.start() }
    catch (e) { console.error(e); setScribeState('idle') }
  }

  async function stopScribe() {
    setScribeState('transcribing')
    try {
      const blob = await recorderRef.current.stop()
      const text = await transcribeAudio(blob)
      setTranscript(text)
      setCallNotes(n => n ? `${n}\n\n[Transcript]\n${text}` : `[Transcript]\n${text}`)
      setShowNotes(true)
    } catch (e) { console.error(e) }
    setScribeState('idle')
  }

  async function endCall() {
    if (endingCall) return
    setEndingCall(true)
    const durationSec = callStart ? Math.round((Date.now() - callStart) / 1000) : null
    try {
      const { supabase } = await import('../../lib/supabase')
      await supabase.from('consultations').update({
        notes_draft: { actions, callNotes },
        transcript: transcript || null,
        consultation_duration_seconds: durationSec,
      }).eq('id', id)
    } catch {}
    navigate(`/provider/notes/${id}`, { state: { actions, transcript: transcript || '', callNotes } })
  }

  const fmtTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  if (loading) return (
    <div style={{ height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F0F2F5' }}>
      <div style={{ width:36, height:36, border:'3px solid #D4EEF0', borderTopColor:TEAL, borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (!consult) return (
    <div style={{ height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:FF }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:'1.25rem', fontWeight:700, color:NAVY }}>Consultation not found</div>
        <button onClick={() => navigate('/provider')} style={{ marginTop:'1rem', background:TEAL, color:'white', border:'none', padding:'12px 20px', borderRadius:8, fontFamily:FF, cursor:'pointer', minHeight:44 }}>← Back</button>
      </div>
    </div>
  )

  const isAcc       = consult.acc_eligible === 'yes'
  const patientName = `${consult.patient_first_name} ${consult.patient_last_name}`

  // ── IN-CALL VIEW ─────────────────────────────────────────────────────────────
  if (inCall) return (
    <div style={{ height:'100dvh', background:'#0D1117', display:'flex', flexDirection:'column', fontFamily:FF, position:'relative' }}>

      {/* Top bar */}
      <div style={{ background:'rgba(0,0,0,.6)', padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, zIndex:20 }}>
        <div>
          <div style={{ color:'white', fontWeight:700, fontSize:'.9375rem' }}>{patientName}</div>
          <div style={{ color:'rgba(255,255,255,.5)', fontSize:'.75rem' }}>{consult.chief_complaint}</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {/* Timer */}
          <div style={{ background:'rgba(255,255,255,.1)', padding:'4px 10px', borderRadius:99, color:'rgba(255,255,255,.8)', fontSize:'.875rem', fontWeight:700, fontFamily:'monospace' }}>
            {fmtTime(elapsed)}
          </div>
          {/* Scribe button */}
          <button
            onClick={scribeState === 'idle' ? startScribe : scribeState === 'recording' ? stopScribe : undefined}
            disabled={scribeState === 'transcribing'}
            style={{ minHeight:44, padding:'8px 14px', borderRadius:99, border:'none', cursor:'pointer', fontFamily:FF, fontWeight:700, fontSize:'.8125rem',
              background: scribeState==='recording' ? '#DC2626' : scribeState==='transcribing' ? '#374151' : TEAL,
              color:'white', display:'flex', alignItems:'center', gap:6 }}>
            {scribeState==='idle' && '🎙 Record'}
            {scribeState==='recording' && <><span style={{ width:8, height:8, background:'white', borderRadius:'50%', display:'inline-block', animation:'blink 1s infinite' }}/>Stop</>}
            {scribeState==='transcribing' && '…'}
          </button>
        </div>
      </div>

      {/* Video */}
      <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
        {lkToken && lkUrl ? (
          <LiveKitRoom token={lkToken} serverUrl={lkUrl} video audio data-lk-theme="default" style={{ width:'100%', height:'100%' }}>
            <VideoConference />
          </LiveKitRoom>
        ) : (
          <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ textAlign:'center', color:'rgba(255,255,255,.5)' }}>
              <div style={{ width:32, height:32, border:'3px solid rgba(255,255,255,.2)', borderTopColor:TEAL, borderRadius:'50%', animation:'spin .8s linear infinite', margin:'0 auto 1rem' }} />
              <div>Connecting…</div>
            </div>
          </div>
        )}

        {/* Notes slide-up panel */}
        {showNotes && (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.7)', display:'flex', flexDirection:'column', zIndex:30 }}>
            <div style={{ flex:1 }} onClick={() => setShowNotes(false)} />
            <div style={{ background:'white', borderRadius:'16px 16px 0 0', padding:'1.25rem', maxHeight:'60vh', display:'flex', flexDirection:'column' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
                <span style={{ fontWeight:700, color:NAVY }}>Call notes</span>
                <button onClick={() => setShowNotes(false)} style={{ background:'none', border:'none', fontSize:'1.25rem', cursor:'pointer', color:'#6B7280' }}>✕</button>
              </div>
              <textarea
                value={callNotes}
                onChange={e => setCallNotes(e.target.value)}
                placeholder="Jot notes here — AI will complete the full record after the call"
                rows={6}
                style={{ border:'1.5px solid #E2E8F0', borderRadius:10, padding:'12px', fontFamily:FF, fontSize:'1rem', resize:'none', outline:'none', flex:1 }}
              />
              {transcript && (
                <div style={{ marginTop:8, fontSize:'.75rem', color:'#059669', fontWeight:600 }}>✓ Transcript captured ({transcript.length} chars)</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div style={{ background:'rgba(0,0,0,.8)', padding:'16px', paddingBottom:'calc(16px + env(safe-area-inset-bottom))', display:'flex', gap:12, flexShrink:0, zIndex:20 }}>
        {/* Notes toggle */}
        <button
          onClick={() => setShowNotes(v => !v)}
          style={{ minHeight:56, flex:1, borderRadius:12, border:`1.5px solid ${showNotes?TEAL:'rgba(255,255,255,.2)'}`, background: showNotes ? 'rgba(11,110,118,.3)' : 'rgba(255,255,255,.08)', color:'white', fontFamily:FF, fontWeight:700, fontSize:'.9375rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          📋 Notes {transcript && '✓'}
        </button>
        {/* End call */}
        <button
          onClick={endCall}
          disabled={endingCall}
          style={{ minHeight:56, flex:2, borderRadius:12, border:'none', background:'#DC2626', color:'white', fontFamily:FF, fontWeight:700, fontSize:'1rem', cursor:endingCall?'not-allowed':'pointer', opacity:endingCall?0.6:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          {endingCall ? 'Ending…' : '🔴 End call'}
        </button>
      </div>

      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
      `}</style>
    </div>
  )

  // ── PRE-CALL VIEW ─────────────────────────────────────────────────────────────
  return (
    <div style={{ height:'100dvh', background:'#F0F2F5', fontFamily:FF, display:'flex', flexDirection:'column', overflow:'hidden' }}>

      {/* Top bar */}
      <div style={{ background:NAVY, padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <button onClick={() => navigate('/provider')}
          style={{ background:'rgba(255,255,255,.1)', border:'none', color:'rgba(255,255,255,.7)', padding:'8px 14px', borderRadius:8, cursor:'pointer', fontFamily:FF, fontSize:'.875rem', minHeight:44 }}>
          ← Queue
        </button>
        <span onClick={() => navigate('/clinician/dashboard')} style={{ fontFamily:'Cormorant Garamond, serif', fontStyle:'italic', color:'#D4EEF0', fontSize:'1.25rem', cursor:'pointer', userSelect:'none', transition:'opacity .15s' }} onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'} role="link" aria-label="Tere Health — go to dashboard">Tere</span>
        <div style={{ width:60 }} />
      </div>

      <div style={{ flex:1, padding:'1rem', overflowY:'auto' }}>

        {/* Patient header card */}
        <div style={{ background:'white', borderRadius:14, padding:'1.25rem', marginBottom:12, border:'1px solid #E2E8F0', borderTop:`4px solid ${TEAL}` }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
            <div>
              <h1 style={{ fontSize:'1.375rem', fontWeight:800, color:NAVY, margin:0, lineHeight:1.2 }}>{patientName}</h1>
              <div style={{ fontSize:'.8125rem', color:'#6B7280', marginTop:4 }}>
                NHI: {consult.patient_nhi || '—'}
                {consult.patient_dob && ` · ${new Date(consult.patient_dob).toLocaleDateString('en-NZ')}`}
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4, alignItems:'flex-end' }}>
              {isAcc && (
                <span style={{ background:'#EFF6FF', color:'#1D4ED8', border:'1px solid #BFDBFE', borderRadius:99, padding:'3px 10px', fontSize:'.6875rem', fontWeight:700 }}>ACC</span>
              )}
              <span style={{ background:'#F3F4F6', color:'#6B7280', borderRadius:99, padding:'3px 10px', fontSize:'.6875rem', fontWeight:600 }}>
                {consult.consultation_type === 'phone' ? '📞 Phone' : '📹 Video'}
              </span>
            </div>
          </div>

          {/* Chief complaint */}
          <div style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 14px', fontSize:'.9375rem', color:'#374151', lineHeight:1.6, marginBottom:12 }}>
            {consult.chief_complaint}
          </div>

          {/* Allergy warning */}
          {consult.patient_allergies && consult.patient_allergies.toLowerCase() !== 'none' && (
            <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'8px 12px', fontSize:'.8125rem', color:'#DC2626', fontWeight:600, marginBottom:12 }}>
              ⚠ Allergy: {consult.patient_allergies}
            </div>
          )}

          {/* Patient info rows */}
          {[
            ['Location',  consult.patient_location],
            ['Employer',  consult.acc_employer],
            ['Pharmacy',  consult.pharmacy],
            ['Medications', consult.medications],
          ].filter(([,v]) => v).map(([k,v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderTop:'1px solid #F3F4F6', fontSize:'.8125rem' }}>
              <span style={{ color:'#9CA3AF' }}>{k}</span>
              <span style={{ color:'#374151', fontWeight:500, textAlign:'right', maxWidth:'60%' }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Medical history */}
        {consult.medical_history && (
          <div style={{ background:'white', borderRadius:14, padding:'1.25rem', marginBottom:12, border:'1px solid #E2E8F0' }}>
            <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#9CA3AF', marginBottom:8 }}>Medical history</div>
            <div style={{ fontSize:'.9375rem', color:'#374151', lineHeight:1.6 }}>{consult.medical_history}</div>
          </div>
        )}

        {/* ACC injury details */}
        {isAcc && consult.acc_injury_details && (
          <div style={{ background:'#EFF6FF', borderRadius:14, padding:'1.25rem', marginBottom:12, border:'1px solid #BFDBFE' }}>
            <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#1D4ED8', marginBottom:8 }}>ACC injury details</div>
            <div style={{ fontSize:'.9375rem', color:'#1e3a5f', lineHeight:1.6 }}>{consult.acc_injury_details}</div>
            {consult.acc_injury_date && <div style={{ fontSize:'.8125rem', color:'#3B82F6', marginTop:6 }}>Date of injury: {new Date(consult.acc_injury_date).toLocaleDateString('en-NZ')}</div>}
          </div>
        )}

        {/* Spacer for bottom buttons */}
        <div style={{ height:148 }} />
      </div>

      {/* Fixed bottom action area */}
      <div style={{ position:'fixed', bottom:0, left:0, right:0, background:'white', borderTop:'1px solid #E2E8F0', padding:'12px 16px', paddingBottom:'calc(12px + env(safe-area-inset-bottom))' }}>
        <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, padding:'10px 14px', textAlign:'center', fontSize:'.875rem', color:'#92400E', marginBottom:8 }}>
          ⏳ Connecting — patient is being notified
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:8 }}>
          <button onClick={() => navigate('/provider')}
            style={{ minHeight:48, borderRadius:10, border:'1.5px solid #E2E8F0', background:'white', color:'#374151', fontFamily:FF, fontWeight:600, fontSize:'.875rem', cursor:'pointer' }}>
            ← Queue
          </button>
          <button onClick={initiateCall} disabled={calling}
            style={{ minHeight:48, borderRadius:10, border:'none', background:GREEN, color:'white', fontFamily:FF, fontWeight:700, fontSize:'.9375rem', cursor:calling?'not-allowed':'pointer', opacity:calling?0.6:1, boxShadow:'0 4px 16px rgba(5,150,105,.3)' }}>
            {calling ? 'Connecting…' : '📞 Start call now'}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
