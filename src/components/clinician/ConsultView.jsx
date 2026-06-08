import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getConsultation, updateConsultation } from '../../lib/supabase'
// Live transcription via Deepgram WebSocket — no SDK required
import { LiveKitRoom, VideoConference } from '@livekit/components-react'
import '@livekit/components-styles'
import ChatPanel from '../ChatPanel'
import HpiSearch from '../HpiSearch'
import ClinicalTools from './ClinicalTools'
import ConvertToAccModal from './ConvertToAccModal'
import VirtualBgControls from './VirtualBgControls'
import { CONSULT_TYPE_LABELS } from '../../lib/consultationType'
import { getLangMeta } from '../../lib/i18n'
import { apiFetch } from '../../lib/api'
import { Modal, PrescribeModal, XrayModal, ACCModal } from './ClinicalActionModals'

// ── Sub-components ────────────────────────────────────────────────────────────

function VitalsPanel({ vitals }) {
  if (!vitals || vitals.skipped) return (
    <div style={{background:'var(--bg)',borderRadius:'var(--radius-sm)',padding:'1rem',fontSize:'.875rem',color:'var(--muted)'}}>
      No vital signs captured for this patient.
    </div>
  )
  const v = vitals
  const hrCls = v.hr ? (v.hr < 60 || v.hr > 100 ? 'warning' : 'normal') : ''
  const rrCls = v.rr ? (v.rr < 12 || v.rr > 20 ? 'warning' : 'normal') : ''
  return (
    <div>
      <div className="vitals-grid">
        {v.hr && <div className={`vital-card ${hrCls}`}>
          <div className="vital-label">Heart Rate</div>
          <div className={`vital-value ${hrCls}`}>{v.hr}</div>
          <div className="vital-unit">bpm</div>
        </div>}
        {v.rr && <div className={`vital-card ${rrCls}`}>
          <div className="vital-label">Resp. Rate</div>
          <div className={`vital-value ${rrCls}`}>{v.rr}</div>
          <div className="vital-unit">br/min</div>
        </div>}
        {v.spo2 && <div className="vital-card normal">
          <div className="vital-label">SpO₂</div>
          <div className="vital-value normal">{v.spo2}</div>
          <div className="vital-unit">%</div>
        </div>}
        {v.bp && <div className="vital-card">
          <div className="vital-label">BP</div>
          <div className="vital-value">{v.bp}</div>
          <div className="vital-unit">mmHg</div>
        </div>}
      </div>
      <p style={{fontSize:'.75rem',color:'var(--muted)',marginTop:'.5rem',fontStyle:'italic'}}>
        {v.source === 'manual' ? 'Manually entered' : 'Tere rPPG — indicative screening only'}
      </p>
    </div>
  )
}


// ── Main ConsultView ──────────────────────────────────────────────────────────

export default function ConsultView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [consult, setConsult] = useState(null)
  const [tab, setTab] = useState('vitals')
  const [notes, setNotes] = useState({ S:'', O:'', A:'', P:'' })
  const [aiNotes, setAiNotes] = useState(null)
  const [scribeState, setScribeState] = useState('idle') // idle|recording|transcribing|done
  const [transcript, setTranscript] = useState('')
  const [actions, setActions] = useState([])
  const [modals, setModals] = useState({ rx:false, xr:false, acc:false })
  const [vitalsConfirmed, setVitalsConfirmed] = useState(false)
  const [lkToken, setLkToken] = useState(null)
  const [lkUrl, setLkUrl] = useState(null)
  const [supervisorLinkCopied, setSupervisorLinkCopied] = useState(false)
  const [showClinicalTools, setShowClinicalTools] = useState(false)
  const [patientFlags, setPatientFlags] = useState([])
  const [showAccConvert, setShowAccConvert] = useState(false)
  const [showIncidentModal, setShowIncidentModal] = useState(false)
  const [incidentForm, setIncidentForm] = useState({ incident_type:'Clinical', severity:'low', description:'', immediate_actions:'', contributing_factors:'' })
  const [submittingIncident, setSubmittingIncident] = useState(false)
  const [incidentDone, setIncidentDone] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [showTranscript, setShowTranscript] = useState(false)
  const [phoneCallState, setPhoneCallState] = useState('idle') // idle|dialling|ringing|answered|completed|no_answer|busy|failed|canceled
  const wsRef              = useRef(null)
  const mediaRecorderRef   = useRef(null)
  const streamRef          = useRef(null)
  const transcriptPanelRef = useRef(null)

  useEffect(() => {
    if (!sessionStorage.getItem('clinicianAuth')) { navigate('/clinician'); return }
    async function load() {
      try {
        const data = await getConsultation(id)
        setConsult(data)

        if (!data.daily_room_url) {
          try {
            const res = await apiFetch('/api/create-room', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ consultationId: id })
            })
            if (res.ok) {
              const { roomName } = await res.json()
              const { supabase } = await import('../../lib/supabase')
              await supabase.from('consultations').update({ daily_room_url: roomName }).eq('id', id)
              setConsult(d => ({...d, daily_room_url: roomName}))
            }
          } catch (e) { console.error('Room creation error:', e) }
        }

        // Get clinician token (always — covers page refreshes too)
        try {
          const tr = await apiFetch('/api/join-room', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ consultationId: id, identity: `clinician-${id.slice(0,8)}` })
          })
          if (tr.ok) {
            const { token, serverUrl } = await tr.json()
            if (token) { setLkToken(token); setLkUrl(serverUrl) }
          }
        } catch (e) { console.error('Token fetch error:', e) }

        if (data?.vitals) {
          setNotes(n => ({...n, O: `Vitals (Tere rPPG): HR ${data.vitals.hr||'—'} bpm, RR ${data.vitals.rr||'—'} br/min${data.vitals.spo2?`, SpO₂ ${data.vitals.spo2}%`:''}${data.vitals.bp?`, BP ${data.vitals.bp}`:''}. `}))
        }
        // Load patient flags if NHI available
        if (data?.patient_nhi) {
          apiFetch(`/api/patient-flags?patient_nhi=${data.patient_nhi}`)
            .then(r => r.json()).then(d => setPatientFlags(d.flags || [])).catch(() => {})
        }
      } catch {
        // Demo mode
        setConsult({
          id, patient_first_name:'James', patient_last_name:'Taitoko',
          patient_nhi:'ZKJ7823', patient_dob:'1986-03-14',
          chief_complaint:'Right ankle injury — fell from ladder on boat',
          acc_eligible:'yes', acc_employer:'Sanford Aquaculture',
          patient_location:'Pelorus Sound', patient_allergies:'Penicillin',
          vitals:{ hr:88, rr:16, confidence:'indicative', source:'rppg' },
          daily_room_url: null, status:'in_progress',
        })
        setNotes(n => ({...n, O:'Vitals (Tere rPPG): HR 88 bpm, RR 16 br/min. '}))
      }
    }
    load()
  }, [id, navigate])

  // Poll for vitals and status changes until patient is admitted
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await getConsultation(id)
        setConsult(prev => {
          if (!prev) return data
          // Only re-render if status or vitals changed
          if (data.status !== prev.status || JSON.stringify(data.vitals) !== JSON.stringify(prev.vitals)) {
            return data
          }
          return prev
        })
        // Populate O notes once when vitals first arrive
        if (data?.vitals && !data.vitals.skipped) {
          setNotes(n => n.O ? n : ({...n, O: `Vitals (Tere rPPG): HR ${data.vitals.hr||'—'} bpm, RR ${data.vitals.rr||'—'} br/min${data.vitals.spo2?`, SpO₂ ${data.vitals.spo2}%`:''}${data.vitals.bp?`, BP ${data.vitals.bp}`:''}. `}))
        }
      } catch {}
    }, 4000)
    return () => clearInterval(interval)
  }, [id])

  // Auto-scroll live transcript panel
  useEffect(() => {
    if (transcriptPanelRef.current) {
      transcriptPanelRef.current.scrollTop = transcriptPanelRef.current.scrollHeight
    }
  }, [liveTranscript])

  // Cleanup live transcription on unmount
  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop()
      streamRef.current?.getTracks().forEach(t => t.stop())
      wsRef.current?.close()
    }
  }, [])

  const NZ_DRUG_KEYTERMS = [
    'paracetamol','ibuprofen','amoxicillin','flucloxacillin','metformin','atorvastatin',
    'omeprazole','salbutamol','prednisone','cephalexin','trimethoprim','nitrofurantoin',
    'azithromycin','doxycycline','diclofenac','naproxen','levothyroxine','amlodipine',
    'lisinopril','warfarin','aspirin','dabigatran','sertraline','fluoxetine',
  ]

  async function startScribe() {
    const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY
    if (!apiKey) { alert('Live transcription not configured (VITE_DEEPGRAM_API_KEY missing)'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream

      const keyterms = NZ_DRUG_KEYTERMS.map(k => `keyterm=${encodeURIComponent(k)}`).join('&')
      const url = `wss://api.deepgram.com/v1/listen?model=nova-2&language=en-NZ&diarize=true&punctuate=true&smart_format=true&interim_results=false&${keyterms}`
      const ws = new WebSocket(url, ['token', apiKey])
      wsRef.current = ws

      ws.onopen = () => {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
        const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {})
        mediaRecorderRef.current = mr
        mr.ondataavailable = e => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data)
        }
        mr.start(250)
      }

      ws.onmessage = e => {
        try {
          const data = JSON.parse(e.data)
          if (data.type !== 'Results' || !data.is_final) return
          const alt = data.channel?.alternatives?.[0]
          if (!alt?.transcript?.trim()) return

          const words = alt.words || []
          let text = alt.transcript
          if (words.length > 0 && words[0].speaker !== undefined) {
            let labeled = ''
            let curSpeaker = null
            words.forEach(w => {
              if (w.speaker !== curSpeaker) {
                curSpeaker = w.speaker
                labeled += (labeled ? '\n' : '') + (w.speaker === 0 ? '[PROVIDER]' : '[PATIENT]') + ' '
              } else {
                labeled += ' '
              }
              labeled += (w.punctuated_word || w.word)
            })
            text = labeled
          }
          setLiveTranscript(prev => prev + (prev ? '\n' : '') + text)
        } catch {}
      }

      ws.onerror = () => {}
      setLiveTranscript('')
      setScribeState('recording')
      setShowTranscript(true)
    } catch (e) {
      alert(e.message || 'Microphone access denied')
      setScribeState('idle')
    }
  }

  function stopScribe() {
    mediaRecorderRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'CloseStream' }))
      wsRef.current.close()
    }
    wsRef.current = null
    mediaRecorderRef.current = null
    streamRef.current = null
    setScribeState('done')
    setTab('notes')
  }

  async function initiatePhoneCall() {
    setPhoneCallState('dialling')
    try {
      const res = await apiFetch('/api/make-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultationId: id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to initiate call')
        setPhoneCallState('idle')
      }
    } catch {
      setPhoneCallState('idle')
    }
  }

  // Poll twilio_call_status from the consultation record
  useEffect(() => {
    if (consult?.consultation_type !== 'phone') return
    if (!['dialling', 'ringing', 'answered'].includes(phoneCallState)) return
    const interval = setInterval(async () => {
      try {
        const data = await getConsultation(id)
        const s = data?.twilio_call_status
        if (s && s !== phoneCallState) setPhoneCallState(s)
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [id, phoneCallState, consult?.consultation_type])

  function addAction(action) {
    setActions(a => [...a, action])
  }

  async function submitIncident() {
    setSubmittingIncident(true)
    try {
      await apiFetch('/api/incidents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...incidentForm,
          consultation_id: id,
          provider_id: sessionStorage.getItem('providerId'),
          provider_name: sessionStorage.getItem('providerDisplayName'),
          patient_nhi: consult?.patient_nhi,
        }),
      })
      setIncidentDone(true)
    } catch {}
    setSubmittingIncident(false)
  }

  async function endConsult() {
    if (scribeState === 'recording') stopScribe()
    const durationSec = consult.started_at
      ? Math.round((Date.now() - new Date(consult.started_at)) / 1000) : null
    try {
      const { supabase } = await import('../../lib/supabase')
      await supabase.from('consultations').update({
        notes_draft: { actions },
        transcript: liveTranscript || null,
        consultation_duration_seconds: durationSec,
      }).eq('id', id)
    } catch {}
    navigate(`/clinician/notes/${id}`, { state: { actions, transcript: liveTranscript || '' } })
  }

  if (!consult) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100dvh'}}><div className="spinner" /></div>

  return (
    <div style={{display:'grid',gridTemplateColumns:'360px 1fr',height:'100dvh',overflow:'hidden',fontFamily:'Plus Jakarta Sans, sans-serif'}}>

      {/* ── Left panel ── */}
      <div style={{background:'white',borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {/* Top bar */}
        <div style={{background:'var(--navy)',padding:'.875rem 1rem',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span onClick={() => navigate('/clinician/dashboard')} style={{fontFamily:'Cormorant Garamond, serif',fontStyle:'italic',color:'var(--teal-light)',fontSize:'1.2rem',cursor:'pointer',userSelect:'none',transition:'opacity .15s'}} onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'} role="link" aria-label="Tere Health — go to dashboard">Tere</span>
            <div style={{display:'flex',gap:'.375rem',alignItems:'center'}}>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/clinician/consult/${id}`
                  navigator.clipboard.writeText(url).then(() => {
                    setSupervisorLinkCopied(true)
                    setTimeout(() => setSupervisorLinkCopied(false), 2500)
                  })
                }}
                title="Copy supervisor join link"
                style={{background:'rgba(255,255,255,.12)',border:'none',color:'rgba(255,255,255,.75)',padding:'4px 8px',borderRadius:'6px',cursor:'pointer',fontSize:'.75rem',whiteSpace:'nowrap'}}>
                {supervisorLinkCopied ? '✓ Copied' : '👥 Supervise'}
              </button>
              <button onClick={() => setShowClinicalTools(true)} title="Clinical decision tools"
                style={{background:'rgba(255,255,255,.12)',border:'none',color:'rgba(255,255,255,.75)',padding:'4px 8px',borderRadius:'6px',cursor:'pointer',fontSize:'.75rem',whiteSpace:'nowrap'}}>
                🔬 Tools
              </button>
              <button onClick={() => setShowIncidentModal(true)} title="Report incident"
                style={{background:'rgba(220,38,38,.25)',border:'none',color:'rgba(255,180,180,.9)',padding:'4px 8px',borderRadius:'6px',cursor:'pointer',fontSize:'.75rem',whiteSpace:'nowrap'}}>
                ⚠ Incident
              </button>
              <button onClick={() => navigate('/clinician/dashboard')}
                style={{background:'rgba(255,255,255,.1)',border:'none',color:'rgba(255,255,255,.7)',padding:'4px 10px',borderRadius:'6px',cursor:'pointer',fontSize:'.8125rem'}}>
                ← Queue
              </button>
            </div>
          </div>
          <div style={{color:'white',fontWeight:600,marginTop:'.375rem',fontSize:'1rem'}}>
            {consult.patient_first_name} {consult.patient_last_name}
          </div>
          <div style={{color:'rgba(255,255,255,.5)',fontSize:'.8125rem',marginTop:'2px'}}>
            {consult.chief_complaint}
          </div>
          {(consult.provider_display_name || sessionStorage.getItem('providerDisplayName')) && (
            <div style={{color:'rgba(255,255,255,.35)',fontSize:'.75rem',marginTop:'2px'}}>
              {consult.provider_display_name || sessionStorage.getItem('providerDisplayName')}
            </div>
          )}
          {consult.patient_language && consult.patient_language !== 'en' && (() => {
            const lm = getLangMeta(consult.patient_language)
            return (
              <div style={{marginTop:4,display:'inline-flex',alignItems:'center',gap:4,background:'rgba(11,110,118,.4)',border:'1px solid rgba(11,110,118,.6)',borderRadius:12,padding:'2px 8px',fontSize:'.7rem',color:'#D4EEF0'}}>
                {lm.flag} {lm.name}
              </div>
            )
          })()}
        </div>

        {/* Tabs */}
        <div style={{display:'flex',borderBottom:'1px solid var(--border)',flexShrink:0}}>
          {['vitals','patient','notes'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex:1,padding:'.625rem 4px',fontSize:'.75rem',fontWeight:600,
              border:'none',background:'none',cursor:'pointer',borderBottom:'2px solid',
              borderBottomColor: tab===t ? 'var(--teal)' : 'transparent',
              color: tab===t ? 'var(--teal)' : 'var(--muted)',
              fontFamily:'Plus Jakarta Sans, sans-serif',
              textTransform:'capitalize',
            }}>
              {t}
            </button>
          ))}
        </div>

        {/* Patient flags banner */}
        {patientFlags.length > 0 && (
          <div style={{background:'#FEF2F2',borderBottom:'2px solid #DC2626',padding:'.5rem 1rem',flexShrink:0}}>
            <div style={{fontSize:'.7rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'#DC2626',marginBottom:'.25rem'}}>Patient flags</div>
            {patientFlags.map((f,i) => (
              <div key={i} style={{fontSize:'.8125rem',color:'#7F1D1D',display:'flex',gap:'.375rem',alignItems:'flex-start',marginBottom:2}}>
                <span style={{color:'#DC2626',fontWeight:700}}>⚑</span>
                <span><strong>{f.flag_type}:</strong> {f.description}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tab content */}
        <div style={{flex:1,overflowY:'auto',padding:'1rem'}}>
          {tab === 'vitals' && (
            <>
              {/* Vitals — waiting or received */}
              {consult.vitals ? (
                <VitalsPanel vitals={consult.vitals} />
              ) : (
                <div style={{background:'var(--bg)',borderRadius:'var(--radius-sm)',padding:'1.25rem',textAlign:'center',fontSize:'.875rem',color:'var(--muted)'}}>
                  <div style={{fontSize:'1.5rem',marginBottom:'.5rem'}}>⏳</div>
                  Waiting for patient to complete their vitals scan…
                </div>
              )}

              {/* Patient info */}
              <div style={{marginTop:'1rem'}}>
                <div style={{fontSize:'.6875rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--muted)',marginBottom:'.5rem'}}>
                  Patient info
                </div>
                {[
                  ['NHI', consult.patient_nhi],
                  ['DOB', consult.patient_dob],
                  ['Location', consult.patient_location],
                  ['ACC', consult.acc_eligible === 'yes' ? '✓ Eligible' : 'Not eligible'],
                  ['Employer', consult.acc_employer],
                  ['Allergies', consult.patient_allergies || 'None documented'],
                  ['Interpreter', consult.interpreter_requested ? '🌐 Requested' : null],
                ].filter(([,v]) => v).map(([k,v]) => (
                  <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:'.8125rem'}}>
                    <span style={{color:'var(--muted)'}}>{k}</span>
                    <span style={{fontWeight:500,color: k==='ACC'&&v.startsWith('✓') ? 'var(--success)' : k==='Allergies'&&v!=='None documented' ? 'var(--danger)' : 'var(--text)'}}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Convert to ACC — only when not already ACC */}
              {consult.acc_eligible !== 'yes' && !consult.acc_converted_by_provider && (
                <button
                  onClick={() => setShowAccConvert(true)}
                  style={{ width:'100%', marginTop:'.75rem', padding:'8px 12px', border:'1.5px solid #D97706', borderRadius:8, background:'#FFFBEB', color:'#92400E', cursor:'pointer', fontFamily:'Plus Jakarta Sans, sans-serif', fontWeight:700, fontSize:'.875rem' }}
                >
                  ⚡ Convert to ACC claim
                </button>
              )}
              {consult.acc_converted_by_provider && (
                <div style={{ marginTop:'.75rem', padding:'8px 12px', border:'1px solid #BBF7D0', borderRadius:8, background:'#F0FDF4', color:'#065F46', fontSize:'.8125rem', fontWeight:600 }}>
                  ✓ Converted to ACC — pending admin lodgement
                </div>
              )}

              {/* Step 2: Vitals received (or skipped) — clinician confirms review */}
              {consult.status === 'vitals_complete' && !vitalsConfirmed && (
                <button
                  onClick={() => setVitalsConfirmed(true)}
                  className="btn btn-primary btn-lg"
                  style={{width:'100%',marginTop:'1rem'}}
                >
                  ✓ Vitals confirmed
                </button>
              )}

              {/* Step 3: Admit — only visible after vitals confirmed */}
              {vitalsConfirmed && consult.status !== 'in_progress' && (
                <button
                  onClick={async () => {
                    const { supabase } = await import('../../lib/supabase')
                    const startedAt = new Date().toISOString()
                    // Ensure room exists before admitting (guard against silent create-room failure at load time)
                    let roomName = consult.daily_room_url
                    if (!roomName) {
                      try {
                        const rr = await apiFetch('/api/create-room', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ consultationId: consult.id }),
                        })
                        if (rr.ok) { const rd = await rr.json(); roomName = rd.roomName }
                      } catch {}
                    }
                    const patch = { status: 'in_progress', started_at: startedAt }
                    if (roomName) patch.daily_room_url = roomName
                    const { error } = await supabase.from('consultations').update(patch).eq('id', consult.id)
                    if (error) { console.error('Admit update failed:', error); return }
                    setConsult(d => ({...d, ...patch}))
                    if (consult.payment_intent_id) {
                      apiFetch('/api/capture-payment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ paymentIntentId: consult.payment_intent_id })
                      }).catch(e => console.error('Payment capture error:', e))
                    }
                  }}
                  className="btn btn-primary btn-lg"
                  style={{width:'100%',marginTop:'.625rem',background:'#065F46',borderColor:'#065F46'}}
                >
                  Admit patient to call →
                </button>
              )}

              {consult.status === 'in_progress' && consult.consultation_type !== 'phone' && (
                <div style={{marginTop:'1rem',background:'var(--success-bg)',border:'1px solid var(--success)',borderRadius:'var(--radius-sm)',padding:'.75rem',textAlign:'center',fontSize:'.875rem',color:'var(--success)',fontWeight:600}}>
                  ✓ Patient admitted — joining call
                </div>
              )}

              {consult.status === 'in_progress' && consult.consultation_type === 'phone' && (() => {
                const callStateConfig = {
                  idle:      { icon: '📞', label: 'Ready to call', sub: `Patient: ${consult.patient_phone}`, btn: true, btnLabel: '📞 Call patient now', color: 'var(--teal)' },
                  dialling:  { icon: '📲', label: 'Dialling…',     sub: `Calling ${consult.patient_phone}`,  btn: false, color: '#D97706' },
                  ringing:   { icon: '📱', label: "Patient's phone is ringing", sub: 'Waiting for answer…',  btn: false, color: '#D97706' },
                  answered:  { icon: '✓',  label: 'Call in progress', sub: 'Patient has answered',           btn: false, color: 'var(--success)' },
                  completed: { icon: '✓',  label: 'Call ended',     sub: null, btn: true, btnLabel: '📞 Call again', color: 'var(--success)' },
                  no_answer: { icon: '📵', label: 'No answer',      sub: null, btn: true, btnLabel: '📞 Try again', color: '#DC2626' },
                  busy:      { icon: '🔴', label: 'Line busy',      sub: null, btn: true, btnLabel: '📞 Try again', color: '#DC2626' },
                  failed:    { icon: '⚠',  label: 'Call failed',    sub: null, btn: true, btnLabel: '📞 Retry', color: '#DC2626' },
                  canceled:  { icon: '✕',  label: 'Call canceled',  sub: null, btn: true, btnLabel: '📞 Call patient', color: '#6B7280' },
                }
                const cfg = callStateConfig[phoneCallState] || callStateConfig.idle
                const isActive = ['dialling','ringing','answered'].includes(phoneCallState)
                return (
                  <div style={{marginTop:'1rem',border:`1.5px solid ${cfg.color}`,borderRadius:'var(--radius-sm)',padding:'.875rem',background: phoneCallState === 'answered' ? 'var(--success-bg)' : 'white'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'.375rem'}}>
                      {isActive && <div style={{width:8,height:8,borderRadius:'50%',background:cfg.color,animation:'blink 1.2s infinite',flexShrink:0}} />}
                      <span style={{fontSize:'1rem'}}>{cfg.icon}</span>
                      <span style={{fontWeight:700,fontSize:'.9375rem',color:cfg.color}}>{cfg.label}</span>
                    </div>
                    {cfg.sub && <div style={{fontSize:'.8125rem',color:'var(--muted)',marginBottom:'.5rem'}}>{cfg.sub}</div>}
                    {cfg.btn && (
                      <button onClick={initiatePhoneCall}
                        style={{width:'100%',padding:'8px 12px',background:cfg.color,border:'none',borderRadius:8,color:'white',fontFamily:'Plus Jakarta Sans, sans-serif',fontWeight:700,fontSize:'.875rem',cursor:'pointer'}}>
                        {cfg.btnLabel}
                      </button>
                    )}
                  </div>
                )
              })()}
            </>
          )}

          {tab === 'patient' && (
            <div>
              <div style={{fontSize:'.6875rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--muted)',marginBottom:'.75rem'}}>Chief complaint</div>
              <div style={{background:'var(--bg)',borderRadius:'var(--radius-sm)',padding:'.875rem',fontSize:'.9375rem',lineHeight:1.6,marginBottom:'1rem'}}>
                {consult.chief_complaint}
              </div>
              {consult.acc_injury_details && <>
                <div style={{fontSize:'.6875rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--muted)',marginBottom:'.5rem'}}>Injury details</div>
                <div style={{background:'var(--bg)',borderRadius:'var(--radius-sm)',padding:'.875rem',fontSize:'.875rem',lineHeight:1.6}}>
                  {consult.acc_injury_details}
                </div>
              </>}
            </div>
          )}

          {tab === 'notes' && (
            <>
              {/* Tere Scribe status */}
              <div style={{background: scribeState==='recording' ? '#FEF2F2' : scribeState==='done' ? '#F0FDF4' : 'var(--bg)', borderRadius:'var(--radius-sm)',padding:'.875rem',marginBottom:'1rem',border:`1px solid ${scribeState==='recording'?'#FECACA':scribeState==='done'?'#BBF7D0':'var(--border)'}`}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                    {scribeState==='recording' && <div style={{width:8,height:8,borderRadius:'50%',background:'#DC2626',animation:'blink 1s infinite'}} />}
                    <span style={{fontSize:'.8125rem',fontWeight:600,color: scribeState==='recording'?'#DC2626':scribeState==='done'?'var(--success)':'var(--muted)'}}>
                      {scribeState==='idle'?'Tere Scribe':scribeState==='recording'?'Recording…':'Transcript ready'}
                    </span>
                  </div>
                  {scribeState==='idle' && <button onClick={startScribe} style={{background:'var(--teal)',color:'white',border:'none',padding:'4px 10px',borderRadius:'99px',fontSize:'.75rem',fontWeight:600,cursor:'pointer'}}>▶ Start</button>}
                  {scribeState==='recording' && <button onClick={stopScribe} style={{background:'#DC2626',color:'white',border:'none',padding:'4px 10px',borderRadius:'99px',fontSize:'.75rem',fontWeight:600,cursor:'pointer'}}>■ Stop</button>}
                </div>
              </div>

              {/* SOAP notes */}
              {[
                { key:'S', label:'S — Subjective', placeholder:'History and presenting complaint…' },
                { key:'O', label:'O — Objective', placeholder:'Vital signs, examination findings…' },
                { key:'A', label:'A — Assessment', placeholder:'Diagnosis or differential…' },
                { key:'P', label:'P — Plan', placeholder:'Management plan…' },
              ].map(({ key, label, placeholder }) => (
                <div key={key} style={{marginBottom:'.875rem'}}>
                  <div style={{fontSize:'.6875rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--teal)',marginBottom:'.25rem',display:'flex',alignItems:'center',gap:'6px'}}>
                    {label}
                    {aiNotes && <span style={{fontSize:'.625rem',background:'var(--teal-light)',color:'var(--teal)',padding:'1px 6px',borderRadius:'99px',fontWeight:600,textTransform:'none',letterSpacing:0}}>AI draft</span>}
                  </div>
                  <textarea value={notes[key]} onChange={e => setNotes(n=>({...n,[key]:e.target.value}))}
                    rows={key==='P'?4:3} placeholder={placeholder}
                    style={{width:'100%',border:`1px solid ${aiNotes?'#BBF7D0':'var(--border)'}`,borderRadius:'var(--radius-sm)',padding:'.625rem .75rem',fontFamily:'Plus Jakarta Sans,sans-serif',fontSize:'.8125rem',resize:'vertical',background:aiNotes?'#F0FDF4':'white',lineHeight:1.6,outline:'none'}} />
                </div>
              ))}
              {aiNotes && <div style={{fontSize:'.6875rem',color:'var(--muted)',fontStyle:'italic',marginBottom:'.75rem'}}>Review all AI-generated content. You are clinically responsible.</div>}

              {/* Completed actions */}
              {actions.length > 0 && (
                <div style={{marginTop:'.75rem'}}>
                  <div style={{fontSize:'.6875rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--muted)',marginBottom:'.5rem'}}>Actions</div>
                  {actions.map((a,i) => (
                    <div key={i} style={{fontSize:'.8125rem',color:'var(--success)',background:'var(--success-bg)',borderRadius:'var(--radius-sm)',padding:'4px 8px',marginBottom:'4px'}}>
                      ✓ {a.type==='prescription'?`Rx: ${a.drug}`:a.type==='radiology'?`${a.investigation}: ${a.bodyPart}`:a.type==='acc45'?`ACC45 lodged: ${a.injury}`:'Action'}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Action buttons */}
        <div style={{borderTop:'1px solid var(--border)',padding:'.75rem',flexShrink:0,display:'flex',flexDirection:'column',gap:'.5rem'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'.5rem'}}>
            <button onClick={() => setModals(m=>({...m,rx:true}))} style={{background:'#EDE9FE',color:'#5B21B6',border:'none',padding:'8px 4px',borderRadius:'var(--radius-sm)',fontSize:'.8125rem',fontWeight:600,cursor:'pointer',fontFamily:'Plus Jakarta Sans,sans-serif'}}>
              💊 Rx
            </button>
            <button onClick={() => setModals(m=>({...m,xr:true}))} style={{background:'#FEF3C7',color:'#92400E',border:'none',padding:'8px 4px',borderRadius:'var(--radius-sm)',fontSize:'.8125rem',fontWeight:600,cursor:'pointer',fontFamily:'Plus Jakarta Sans,sans-serif'}}>
              🩻 XR
            </button>
            <button onClick={() => setModals(m=>({...m,acc:true}))} style={{background:'var(--success-bg)',color:'#065F46',border:'none',padding:'8px 4px',borderRadius:'var(--radius-sm)',fontSize:'.8125rem',fontWeight:600,cursor:'pointer',fontFamily:'Plus Jakarta Sans,sans-serif'}}>
              ✓ ACC
            </button>
          </div>
          <button onClick={endConsult} className="btn btn-primary btn-full" style={{borderRadius:'var(--radius-sm)'}}>
            Complete consultation
          </button>
        </div>
      </div>

      {/* ── Right panel: Video / Audio ── */}
      {(() => {
        const isPhone = consult?.consultation_type === 'phone'
        const typeLabel = CONSULT_TYPE_LABELS[consult?.consultation_type] || CONSULT_TYPE_LABELS.video
        return (
          <div style={{background:'#0D1117',display:'flex',flexDirection:'column',position:'relative'}}>
            {/* Video header */}
            <div style={{background:'rgba(0,0,0,.4)',padding:'.625rem 1rem',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <div style={{width:7,height:7,borderRadius:'50%',background: lkToken ? '#22C55E' : '#6B7280'}} />
                <span style={{color:'rgba(255,255,255,.7)',fontSize:'.8125rem',fontWeight:600}}>
                  {typeLabel.icon} Tere {isPhone ? 'Phone' : 'Video'}
                </span>
                <span style={{color:'rgba(255,255,255,.35)',fontSize:'.75rem'}}>· encrypted · Scribe {scribeState==='recording'?'on':'ready'}</span>
              </div>
              {(scribeState === 'recording' || liveTranscript) && (
                <button onClick={() => setShowTranscript(v => !v)}
                  style={{background:showTranscript?'rgba(11,110,118,.5)':'rgba(255,255,255,.12)',border:'none',color:'rgba(255,255,255,.8)',padding:'3px 9px',borderRadius:6,cursor:'pointer',fontSize:'.75rem',fontWeight:600,fontFamily:'Plus Jakarta Sans, sans-serif'}}>
                  📝 {showTranscript ? 'Hide transcript' : 'Transcript'}
                </button>
              )}
            </div>

            {/* Phone consultation body */}
            {isPhone && (
              <div style={{flex:1,overflow:'hidden',position:'relative',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'1.5rem',padding:'2rem'}}>
                {/* Call state display */}
                {(() => {
                  const stateIcon = { idle:'📞', dialling:'📲', ringing:'📱', answered:'✓', completed:'✓', no_answer:'📵', busy:'🔴', failed:'⚠', canceled:'✕' }
                  const stateColor = { idle:'#0B6E76', dialling:'#D97706', ringing:'#D97706', answered:'#22C55E', completed:'#22C55E', no_answer:'#EF4444', busy:'#EF4444', failed:'#EF4444', canceled:'#6B7280' }
                  const stateLabel = { idle:'Waiting to call', dialling:'Dialling patient…', ringing:'Ringing…', answered:'Call in progress', completed:'Call ended', no_answer:'No answer', busy:'Line busy', failed:'Call failed', canceled:'Canceled' }
                  const icon = stateIcon[phoneCallState] || '📞'
                  const color = stateColor[phoneCallState] || '#0B6E76'
                  const label = stateLabel[phoneCallState] || phoneCallState
                  const isActive = ['dialling','ringing','answered'].includes(phoneCallState)
                  return (
                    <div style={{textAlign:'center'}}>
                      <div style={{width:96,height:96,borderRadius:'50%',background:color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'2.5rem',margin:'0 auto 1rem',boxShadow:`0 0 40px ${color}66`,position:'relative'}}>
                        {isActive && <div style={{position:'absolute',inset:-4,borderRadius:'50%',border:`2px solid ${color}`,animation:'pulse-ring 2s ease-out infinite',opacity:.5}} />}
                        {icon}
                      </div>
                      <div style={{color:'white',fontWeight:700,fontSize:'1.25rem',marginBottom:'.375rem'}}>{label}</div>
                      {consult.patient_phone && <div style={{color:'rgba(255,255,255,.5)',fontSize:'.9375rem'}}>{consult.patient_phone}</div>}
                    </div>
                  )
                })()}

                {/* Tere Scribe for phone */}
                <div style={{background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.12)',borderRadius:12,padding:'1rem 1.25rem',width:'100%',maxWidth:360}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      {scribeState==='recording' && <div style={{width:8,height:8,borderRadius:'50%',background:'#EF4444',animation:'blink 1s infinite'}} />}
                      <span style={{color:'rgba(255,255,255,.7)',fontWeight:600,fontSize:'.875rem'}}>
                        {scribeState==='idle'?'Tere Scribe':scribeState==='recording'?'Recording…':'Transcript ready'}
                      </span>
                    </div>
                    {scribeState==='idle' && <button onClick={startScribe} style={{background:'var(--teal)',color:'white',border:'none',padding:'4px 10px',borderRadius:'99px',fontSize:'.75rem',fontWeight:600,cursor:'pointer'}}>▶ Start</button>}
                    {scribeState==='recording' && <button onClick={stopScribe} style={{background:'#DC2626',color:'white',border:'none',padding:'4px 10px',borderRadius:'99px',fontSize:'.75rem',fontWeight:600,cursor:'pointer'}}>■ Stop</button>}
                  </div>
                </div>
              </div>
            )}

            {/* Video area */}
            {!isPhone && <div style={{flex:1,overflow:'hidden',position:'relative'}}>
              {lkToken && lkUrl ? (
                <LiveKitRoom
                  token={lkToken}
                  serverUrl={lkUrl}
                  video={true}
                  audio={true}
                  data-lk-theme="default"
                  style={{width:'100%',height:'100%'}}
                >
                  <VideoConference />
                  <VirtualBgControls />
                </LiveKitRoom>
              ) : (
                <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <div style={{textAlign:'center',color:'rgba(255,255,255,.5)'}}>
                    <div style={{width:32,height:32,border:'3px solid rgba(255,255,255,.2)',borderTopColor:'var(--teal)',borderRadius:'50%',animation:'spin .8s linear infinite',margin:'0 auto 1rem'}}/>
                    <div style={{fontSize:'.9375rem',color:'rgba(255,255,255,.4)'}}>Connecting…</div>
                  </div>
                </div>
              )}
              {/* Live transcript panel */}
              {showTranscript && (
                <div style={{position:'absolute',bottom:0,left:0,right:0,height:'38%',background:'rgba(0,0,0,.88)',backdropFilter:'blur(4px)',borderTop:'1px solid rgba(255,255,255,.12)',display:'flex',flexDirection:'column',zIndex:5}}>
                  <div style={{padding:'5px 12px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid rgba(255,255,255,.1)',flexShrink:0}}>
                    <span style={{color:'rgba(255,255,255,.6)',fontSize:'.75rem',fontWeight:600,display:'flex',alignItems:'center',gap:6}}>
                      {scribeState==='recording' && <span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:'#EF4444',animation:'blink 1s infinite'}} />}
                      Live Transcript {scribeState==='recording' ? '· live' : '· stopped'}
                    </span>
                    <button onClick={() => setShowTranscript(false)} style={{background:'none',border:'none',color:'rgba(255,255,255,.4)',cursor:'pointer',fontSize:'.875rem',padding:'2px 6px',lineHeight:1}}>✕</button>
                  </div>
                  <div ref={transcriptPanelRef} style={{flex:1,overflowY:'auto',padding:'8px 12px',fontFamily:'monospace',fontSize:'.8125rem',lineHeight:1.8,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
                    {liveTranscript
                      ? liveTranscript.split('\n').map((line, i) => (
                          <div key={i} style={{color: line.startsWith('[PROVIDER]') ? '#7ECFD4' : line.startsWith('[PATIENT]') ? '#86EFAC' : 'rgba(255,255,255,.75)', marginBottom:2}}>
                            {line}
                          </div>
                        ))
                      : <span style={{color:'rgba(255,255,255,.3)',fontFamily:'Plus Jakarta Sans, sans-serif',fontStyle:'italic',fontSize:'.8rem'}}>Waiting for speech…</span>
                    }
                  </div>
                </div>
              )}
              {/* In-call chat */}
              <ChatPanel
                consultationId={id}
                sender="provider"
                patientLanguage={consult?.patient_language || 'en'}
                onPhotoReceived={(photoUrl) => {
                  setNotes(n => ({ ...n, O: (n.O ? n.O + '\n' : '') + '[Patient photo attached — see chat]' }))
                }}
                style={{ bottom: 16, right: 16 }}
              />
            </div>}

            <div style={{background:'rgba(0,0,0,.3)',padding:'5px',textAlign:'center',flexShrink:0}}>
              <span style={{fontSize:'.6875rem',color:'rgba(255,255,255,.2)'}}>
                {isPhone ? `Tere · Phone · ${id}` : `Tere · LiveKit WebRTC · ${id}`}
              </span>
            </div>
          </div>
        )
      })()}

      {/* Modals */}
      <PrescribeModal open={modals.rx} onClose={() => setModals(m=>({...m,rx:false}))} consult={consult} onDone={addAction} />
      <XrayModal open={modals.xr} onClose={() => setModals(m=>({...m,xr:false}))} consult={consult} onDone={addAction} />
      <ACCModal open={modals.acc} onClose={() => setModals(m=>({...m,acc:false}))} consult={consult} onDone={addAction} />
      {showAccConvert && (
        <ConvertToAccModal
          consult={consult}
          onClose={() => setShowAccConvert(false)}
          onSuccess={() => {
            setConsult(c => ({ ...c, acc_eligible: 'yes', is_acc: true, acc_converted_by_provider: true }))
            setShowAccConvert(false)
          }}
        />
      )}

      {/* Clinical tools modal */}
      {showClinicalTools && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowClinicalTools(false)}>
          <div className="modal" style={{maxWidth:520,width:'100%',maxHeight:'90vh',overflowY:'auto'}}>
            <div className="modal-header">
              <h3 className="modal-title">🔬 Clinical Decision Tools</h3>
              <button className="modal-close" onClick={() => setShowClinicalTools(false)}>✕</button>
            </div>
            <ClinicalTools
              onAddToMdm={(result) => {
                setNotes(n => ({ ...n, A: (n.A ? n.A + '\n' : '') + result }))
                setShowClinicalTools(false)
              }}
              onClose={() => setShowClinicalTools(false)}
            />
          </div>
        </div>
      )}

      {/* Incident report modal */}
      <Modal open={showIncidentModal} onClose={() => { setShowIncidentModal(false); setIncidentDone(false) }} title="⚠ Report Incident">
        {incidentDone ? (
          <div>
            <div className="alert alert-success" style={{marginBottom:'1rem'}}>
              <strong>Incident reported.</strong> Management have been notified. Ref: {new Date().getTime().toString(36).toUpperCase()}
            </div>
            <button className="btn btn-secondary btn-full" onClick={() => { setShowIncidentModal(false); setIncidentDone(false) }}>Close</button>
          </div>
        ) : (
          <div>
            <div className="form-row">
              <div className="form-group">
                <label>Incident type</label>
                <select value={incidentForm.incident_type} onChange={e => setIncidentForm(f=>({...f,incident_type:e.target.value}))}
                  style={{width:'100%',padding:'.5rem .75rem',border:'1.5px solid var(--border)',borderRadius:8,fontFamily:'Plus Jakarta Sans, sans-serif',fontSize:'.875rem'}}>
                  <option>Clinical</option><option>Medication</option><option>Falls</option><option>Equipment</option><option>Privacy / Data</option><option>Other</option>
                </select>
              </div>
              <div className="form-group">
                <label>Severity</label>
                <select value={incidentForm.severity} onChange={e => setIncidentForm(f=>({...f,severity:e.target.value}))}
                  style={{width:'100%',padding:'.5rem .75rem',border:`1.5px solid ${incidentForm.severity==='critical'||incidentForm.severity==='high'?'#DC2626':'var(--border)'}`,borderRadius:8,fontFamily:'Plus Jakarta Sans, sans-serif',fontSize:'.875rem',background:incidentForm.severity==='critical'?'#FEF2F2':incidentForm.severity==='high'?'#FFF7ED':'white'}}>
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                </select>
              </div>
            </div>
            {(incidentForm.severity === 'high' || incidentForm.severity === 'critical') && (
              <div className="alert" style={{background:'#FEF2F2',borderColor:'#DC2626',color:'#7F1D1D',fontSize:'.8125rem',marginBottom:'1rem'}}>
                ⛔ High/critical incidents are immediately escalated to management and the clinical lead.
              </div>
            )}
            <div className="form-group">
              <label>Description</label>
              <textarea value={incidentForm.description} onChange={e => setIncidentForm(f=>({...f,description:e.target.value}))}
                rows={3} placeholder="Describe what happened…"
                style={{width:'100%',border:'1.5px solid var(--border)',borderRadius:8,padding:'.625rem .75rem',fontFamily:'Plus Jakarta Sans, sans-serif',fontSize:'.875rem',resize:'vertical',lineHeight:1.6}} />
            </div>
            <div className="form-group">
              <label>Immediate actions taken</label>
              <textarea value={incidentForm.immediate_actions} onChange={e => setIncidentForm(f=>({...f,immediate_actions:e.target.value}))}
                rows={2} placeholder="What was done immediately after the incident…"
                style={{width:'100%',border:'1.5px solid var(--border)',borderRadius:8,padding:'.625rem .75rem',fontFamily:'Plus Jakarta Sans, sans-serif',fontSize:'.875rem',resize:'vertical',lineHeight:1.6}} />
            </div>
            <div className="form-group">
              <label>Contributing factors <span style={{color:'var(--muted)',fontWeight:400}}>(optional)</span></label>
              <textarea value={incidentForm.contributing_factors} onChange={e => setIncidentForm(f=>({...f,contributing_factors:e.target.value}))}
                rows={2} placeholder="System, environmental, or human factors…"
                style={{width:'100%',border:'1.5px solid var(--border)',borderRadius:8,padding:'.625rem .75rem',fontFamily:'Plus Jakarta Sans, sans-serif',fontSize:'.875rem',resize:'vertical',lineHeight:1.6}} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowIncidentModal(false)} disabled={submittingIncident}>Cancel</button>
              <button className="btn btn-primary" style={{flex:1,background:'#DC2626',borderColor:'#DC2626'}}
                onClick={submitIncident} disabled={submittingIncident || !incidentForm.description.trim()}>
                {submittingIncident ? 'Submitting…' : 'Submit incident report'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}} @keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse-ring{0%{transform:scale(1);opacity:.5}100%{transform:scale(1.5);opacity:0}}`}</style>
    </div>
  )
}
