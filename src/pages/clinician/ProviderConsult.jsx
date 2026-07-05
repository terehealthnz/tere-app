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
  const [phoneCallState, setPhoneCallState] = useState('idle') // idle|dialling|ringing|answered|completed|no_answer|busy|failed
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

  function buildTriageContext(data) {
    const lines = []
    if (data.vitals && !data.vitals.skipped) {
      const v = data.vitals
      const vparts = [
        v.hr  && `HR ${v.hr} bpm`,
        v.rr  && `RR ${v.rr} br/min`,
        v.spo2 && `SpO₂ ${v.spo2}%`,
        v.bp  && `BP ${v.bp}`,
      ].filter(Boolean)
      if (vparts.length) lines.push(`Vitals: ${vparts.join(', ')}`)
    }
    const social = []
    if (data.tobacco_use === 'yes') social.push(`Smoker${data.tobacco_amount ? ` (${data.tobacco_amount})` : ''}`)
    else if (data.tobacco_use === 'no') social.push('Non-smoker')
    if (data.alcohol_use === 'yes') social.push(`Drinks alcohol${data.alcohol_amount ? ` (${data.alcohol_amount})` : ''}`)
    else if (data.alcohol_use === 'no') social.push('Non-drinker')
    if (social.length) lines.push(`Social Hx: ${social.join('. ')}.`)
    return lines.join('\n')
  }

  // Load consultation
  useEffect(() => {
    async function load() {
      try {
        const data = await getConsultation(id)
        setConsult(data)
        const ctx = buildTriageContext(data)
        if (ctx) setCallNotes(ctx + '\n\n')
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
          if (data.status !== prev.status || JSON.stringify(data.vitals) !== JSON.stringify(prev.vitals)) return data
          return prev
        })
        // Inject vitals into notes once they arrive (if notes don't already have them)
        if (data.vitals && !data.vitals.skipped) {
          setCallNotes(prev => {
            if (prev.includes('Vitals:')) return prev
            const ctx = buildTriageContext(data)
            return ctx ? ctx + '\n\n' + prev.replace(/^Vitals:[^\n]*\n?/, '') : prev
          })
        }
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

  async function initiatePhoneCall() {
    setPhoneCallState('dialling')
    try {
      const res = await apiFetch('/api/make-call', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultationId: id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to initiate call')
        setPhoneCallState('idle')
      }
    } catch { setPhoneCallState('idle') }
  }

  // Poll twilio_call_status when a Twilio call is active
  useEffect(() => {
    if (!['dialling', 'ringing', 'answered'].includes(phoneCallState)) return
    const interval = setInterval(async () => {
      try {
        const data = await getConsultation(id)
        const s = data?.twilio_call_status
        if (s && s !== phoneCallState) setPhoneCallState(s)
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [id, phoneCallState])

  // Auto-start scribe when entering in-call state
  useEffect(() => {
    if (inCall && scribeState === 'idle') startScribe()
  }, [inCall])

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
      return text
    } catch (e) {
      console.error(e)
    } finally {
      setScribeState('idle')
    }
    return null
  }

  async function endCall() {
    if (endingCall) return
    setEndingCall(true)
    const durationSec = callStart ? Math.round((Date.now() - callStart) / 1000) : null

    // Stop the scribe first so its recorded audio actually gets transcribed. Previously
    // endCall persisted transcript state to DB *before* stopScribe ran, so the Blob
    // never reached /api/transcribe and transcript was always null in the record.
    let finalTranscript = transcript
    if (scribeState === 'recording' && recorderRef.current) {
      const captured = await stopScribe()
      if (captured) finalTranscript = captured
    }

    try {
      const { supabase } = await import('../../lib/supabase')
      await supabase.from('consultations').update({
        notes_draft: { actions, callNotes },
        transcript: finalTranscript || null,
        consultation_duration_seconds: durationSec,
        // Clear note_generated_at so ProviderNotes re-runs AI generation on the fresh
        // transcript. Otherwise line 248 in ProviderNotes.jsx sees stale note_generated_at
        // from a previous call, restores the (empty) draft, and skips runGenerate entirely.
        note_generated_at: null,
      }).eq('id', id)
    } catch {}
    navigate(`/provider/notes/${id}`, { state: { actions, transcript: finalTranscript || '', callNotes } })
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
  const isPhone     = consult.consultation_type === 'phone'
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

      {/* Audio-only banner for phone */}
      {isPhone && (
        <div style={{ background:'rgba(11,110,118,.85)', padding:'8px 16px', fontSize:'.875rem', color:'white', display:'flex', alignItems:'center', gap:'.5rem', flexShrink:0 }}>
          📞 <strong>Audio only</strong> — 🔊 Put phone on speaker for Scribe to capture both sides
        </div>
      )}

      {/* Video / Audio */}
      <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
        {lkToken && lkUrl ? (
          <LiveKitRoom token={lkToken} serverUrl={lkUrl} video={!isPhone} audio data-lk-theme="default" style={{ width:'100%', height:'100%' }}>
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

        {/* Twilio fallback — all consultation types */}
        {(
          <div style={{ position:'absolute', top:12, right:12, background:'rgba(0,0,0,.75)', backdropFilter:'blur(4px)', borderRadius:12, padding:'10px 14px', minWidth:200, zIndex:10 }}>
            <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'rgba(255,255,255,.5)', marginBottom:6 }}>
              Connection issues? Call their phone
            </div>
            {phoneCallState === 'idle' && (
              <button onClick={initiatePhoneCall}
                style={{ width:'100%', padding:'7px 10px', background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.25)', borderRadius:8, color:'white', fontFamily:FF, fontWeight:600, fontSize:'.8125rem', cursor:'pointer' }}>
                📞 Call their phone
              </button>
            )}
            {['dialling','ringing','answered'].includes(phoneCallState) && (
              <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:'.8125rem', color: phoneCallState==='answered' ? '#4ADE80' : '#FCD34D', fontWeight:600 }}>
                <div style={{ width:7, height:7, borderRadius:'50%', background:'currentColor', animation:'blink 1.2s infinite' }} />
                {phoneCallState==='dialling'?'Dialling…':phoneCallState==='ringing'?'Ringing…':'Call in progress'}
              </div>
            )}
            {phoneCallState === 'completed' && <div style={{ fontSize:'.8125rem', color:'#4ADE80', fontWeight:600 }}>✓ Call ended</div>}
            {['no_answer','busy','failed'].includes(phoneCallState) && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                <span style={{ fontSize:'.8125rem', color:'#F87171', fontWeight:600 }}>
                  {phoneCallState==='no_answer'?'No answer':phoneCallState==='busy'?'Busy':'Failed'}
                </span>
                <button onClick={initiatePhoneCall}
                  style={{ padding:'4px 10px', background:'transparent', border:'1px solid #F87171', borderRadius:6, color:'#F87171', fontFamily:FF, fontWeight:600, fontSize:'.75rem', cursor:'pointer' }}>
                  Retry
                </button>
              </div>
            )}
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
        @keyframes pulse-ring{0%{transform:scale(1);opacity:.5}100%{transform:scale(1.5);opacity:0}}
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

        {/* Triage summary — one card */}
        <div style={{ background:'white', borderRadius:14, padding:'1.25rem', marginBottom:12, border:'1px solid #E2E8F0', borderTop:`4px solid ${TEAL}` }}>
          {/* Patient name + badges */}
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

          {/* Vitals */}
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#9CA3AF', marginBottom:6 }}>Vitals</div>
            <VitalsRow vitals={consult.vitals} />
          </div>

          {/* Medical history */}
          {consult.medical_history && (
            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#9CA3AF', marginBottom:4 }}>Medical history</div>
              <div style={{ fontSize:'.9375rem', color:'#374151', lineHeight:1.6 }}>{consult.medical_history}</div>
            </div>
          )}

          {/* Social history */}
          {(consult.tobacco_use || consult.alcohol_use) && (
            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#9CA3AF', marginBottom:4 }}>Social history</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {consult.tobacco_use === 'yes' && (
                  <span style={{ background:'#FEF2F2', color:'#DC2626', border:'1px solid #FECACA', borderRadius:99, padding:'3px 10px', fontSize:'.75rem', fontWeight:600 }}>
                    🚬 Smoker{consult.tobacco_amount ? ` · ${consult.tobacco_amount}` : ''}
                  </span>
                )}
                {consult.tobacco_use === 'no' && (
                  <span style={{ background:'#F0FDF4', color:'#059669', border:'1px solid #BBF7D0', borderRadius:99, padding:'3px 10px', fontSize:'.75rem', fontWeight:600 }}>Non-smoker</span>
                )}
                {consult.alcohol_use === 'yes' && (
                  <span style={{ background:'#FFFBEB', color:'#92400E', border:'1px solid #FDE68A', borderRadius:99, padding:'3px 10px', fontSize:'.75rem', fontWeight:600 }}>
                    🍺 Drinks{consult.alcohol_amount ? ` · ${consult.alcohol_amount}` : ''}
                  </span>
                )}
                {consult.alcohol_use === 'no' && (
                  <span style={{ background:'#F0FDF4', color:'#059669', border:'1px solid #BBF7D0', borderRadius:99, padding:'3px 10px', fontSize:'.75rem', fontWeight:600 }}>Non-drinker</span>
                )}
              </div>
            </div>
          )}

          {/* ACC injury details */}
          {isAcc && consult.acc_injury_details && (
            <div style={{ background:'#EFF6FF', borderRadius:8, padding:'10px 12px', marginBottom:8 }}>
              <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#1D4ED8', marginBottom:4 }}>ACC injury</div>
              <div style={{ fontSize:'.9375rem', color:'#1e3a5f', lineHeight:1.6 }}>{consult.acc_injury_details}</div>
              {consult.acc_injury_date && <div style={{ fontSize:'.8125rem', color:'#3B82F6', marginTop:4 }}>Date of injury: {new Date(consult.acc_injury_date).toLocaleDateString('en-NZ')}</div>}
            </div>
          )}

          {/* Patient info rows */}
          {[
            ['Location',    consult.patient_location],
            ['Employer',    consult.acc_employer],
            ['Pharmacy',    consult.pharmacy],
            ['Medications', consult.medications],
            ['GP',          consult.gp_name ? `${consult.gp_name}${consult.gp_clinic ? ` · ${consult.gp_clinic}` : ''}` : null],
          ].filter(([,v]) => v).map(([k,v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderTop:'1px solid #F3F4F6', fontSize:'.8125rem' }}>
              <span style={{ color:'#9CA3AF' }}>{k}</span>
              <span style={{ color:'#374151', fontWeight:500, textAlign:'right', maxWidth:'60%' }}>{v}</span>
            </div>
          ))}
        </div>

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
            {calling ? 'Connecting…' : isPhone ? '📞 Start phone call' : '📹 Start video call'}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
