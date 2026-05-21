import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { db } from '../../lib/supabase'
import { createRoom, joinRoom } from '../../lib/daily'

// ── Sub-components ─────────────────────────────────────────────────────────

function VitalCard({ label, value, unit, normal, source }) {
  if (!value) return (
    <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:'0.75rem', textAlign:'center' }}>
      <div style={{ fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase', color:'var(--muted)' }}>{label}</div>
      <div style={{ fontSize:'1.4rem', color:'var(--muted)', marginTop:4 }}>—</div>
      <div style={{ fontSize:'0.7rem', color:'var(--muted)' }}>{unit}</div>
    </div>
  )
  const ok = normal ? normal(value) : true
  return (
    <div style={{
      background: ok ? 'var(--success-bg)' : 'var(--warning-bg)',
      border:`1px solid ${ok ? '#6EE7B7' : '#FDE68A'}`,
      borderRadius:8, padding:'0.75rem', textAlign:'center'
    }}>
      <div style={{ fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase', color:'var(--muted)' }}>{label}</div>
      <div style={{ fontSize:'1.6rem', fontWeight:700, color: ok ? 'var(--success)' : 'var(--warning)', marginTop:2 }}>{value}</div>
      <div style={{ fontSize:'0.7rem', color:'var(--muted)' }}>{unit}</div>
      {source && <div className="badge badge-teal" style={{ marginTop:4, fontSize:'0.65rem' }}>{source}</div>}
    </div>
  )
}

function PrescribeModal({ onClose, onSave, allergyWarning }) {
  const [rx, setRx] = useState({ medication:'', directions:'', quantity:'', pharmacy:'' })
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'1rem' }}>
      <div className="card" style={{ width:'100%', maxWidth:400 }}>
        <h3 style={{ marginBottom:'1rem' }}>💊 Prescribe</h3>
        {allergyWarning && <div className="alert alert-danger" style={{ marginBottom:'1rem', fontSize:'0.85rem' }}>{allergyWarning}</div>}
        {[['medication','Medication','e.g. Ibuprofen 400mg'],['directions','Directions','e.g. One tablet TDS with food'],
          ['quantity','Quantity','e.g. 30 tablets'],['pharmacy','Pharmacy','e.g. Havelock Pharmacy']].map(([k,l,ph]) => (
          <div className="form-group" key={k}>
            <label className="form-label">{l}</label>
            <input className="form-input" value={rx[k]} onChange={e => setRx(r => ({...r,[k]:e.target.value}))} placeholder={ph} />
          </div>
        ))}
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onClose} className="btn btn-secondary btn-md" style={{ flex:1 }}>Cancel</button>
          <button onClick={() => onSave(rx)} className="btn btn-primary btn-md" style={{ flex:2 }}>
            Send to pharmacy
          </button>
        </div>
      </div>
    </div>
  )
}

function XrayModal({ onClose, onSave }) {
  const [xr, setXr] = useState({ investigation:'X-ray — Right ankle AP & lateral', indication:'', urgency:'Urgent (within 24hrs)', provider:'Marlborough Medical Imaging, Blenheim' })
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'1rem' }}>
      <div className="card" style={{ width:'100%', maxWidth:400 }}>
        <h3 style={{ marginBottom:'1rem' }}>🩻 Radiology Referral</h3>
        <div className="alert alert-success" style={{ marginBottom:'1rem', fontSize:'0.85rem' }}>
          ✓ CRR eligible (urgent care doctor). ACC-funded for injury presentations.
        </div>
        {[['investigation','Investigation'],['indication','Clinical indication'],['urgency','Urgency'],['provider','Radiology provider']].map(([k,l]) => (
          <div className="form-group" key={k}>
            <label className="form-label">{l}</label>
            {k === 'indication'
              ? <textarea className="form-textarea" rows={2} value={xr[k]} onChange={e => setXr(r => ({...r,[k]:e.target.value}))} />
              : <input className="form-input" value={xr[k]} onChange={e => setXr(r => ({...r,[k]:e.target.value}))} />
            }
          </div>
        ))}
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onClose} className="btn btn-secondary btn-md" style={{ flex:1 }}>Cancel</button>
          <button onClick={() => onSave(xr)} className="btn btn-primary btn-md" style={{ flex:2 }}>Send referral</button>
        </div>
      </div>
    </div>
  )
}

function ACCModal({ consultation, onClose, onSave }) {
  const [acc, setAcc] = useState({
    injury: consultation.acc_injury_description || '',
    cause: consultation.acc_injury_description || '',
    employer: consultation.acc_employer || '',
    read_code: 'S60 — Injury of ankle and foot',
  })
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'1rem' }}>
      <div className="card" style={{ width:'100%', maxWidth:400 }}>
        <h3 style={{ marginBottom:'1rem' }}>✓ Lodge ACC Claim</h3>
        <div className="alert alert-success" style={{ marginBottom:'1rem', fontSize:'0.85rem' }}>
          ✓ Three-part ACC45 consent recorded at intake
        </div>
        {[['injury','Injury'],['cause','Cause of injury'],['employer','Employer'],['read_code','Read code']].map(([k,l]) => (
          <div className="form-group" key={k}>
            <label className="form-label">{l}</label>
            <input className="form-input" value={acc[k]} onChange={e => setAcc(a => ({...a,[k]:e.target.value}))} />
          </div>
        ))}
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onClose} className="btn btn-secondary btn-md" style={{ flex:1 }}>Cancel</button>
          <button onClick={() => onSave(acc)} className="btn btn-primary btn-md" style={{ flex:2 }}>Lodge via ProviderHub</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Consultation() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [c, setC]           = useState(null)
  const [tab, setTab]       = useState('vitals')
  const [modal, setModal]   = useState(null)  // 'rx' | 'xr' | 'acc' | null
  const [notes, setNotes]   = useState({ s:'', o:'', a:'', p:'' })
  const [scribe, setScribe] = useState({ status:'idle', transcript:[], processing:false })
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState(null)

  const callContainerRef = useRef(null)
  const callFrameRef     = useRef(null)
  const timerRef         = useRef(null)
  const [elapsed, setElapsed] = useState(0)

  const showToast = (msg, icon='✅') => {
    setToast({ msg, icon })
    setTimeout(() => setToast(null), 4000)
  }

  // Load consultation + start video
  useEffect(() => {
    const init = async () => {
      const consultation = await db.consultations.getById(id)
      setC(consultation)

      // Pre-populate notes from Scribe if available
      if (consultation.soap_subjective) {
        setNotes({
          s: consultation.soap_subjective || '',
          o: consultation.soap_objective  || '',
          a: consultation.soap_assessment || '',
          p: consultation.soap_plan       || '',
        })
      }

      // Create or reuse Daily.co room
      let roomUrl = consultation.daily_room_url
      let guestToken = consultation.daily_guest_token

      if (!roomUrl) {
        const room = await createRoom(id)
        roomUrl = room.roomUrl
        guestToken = room.guestToken
        await db.consultations.update(id, {
          status: 'in_progress',
          daily_room_name: room.roomName,
          daily_room_url: roomUrl,
          daily_guest_token: guestToken,
        })
      } else {
        await db.consultations.update(id, { status: 'in_progress' })
      }

      // Join as host
      const frame = await joinRoom(roomUrl, room?.hostToken, callContainerRef.current)
      callFrameRef.current = frame
      frame.on('left-meeting', handleEndCall)
    }
    init().catch(console.error)

    // Timer
    const t = setInterval(() => setElapsed(s => s+1), 1000)
    timerRef.current = t
    return () => { clearInterval(t); callFrameRef.current?.destroy() }
  }, [id])

  const fmtTime = (s) => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  // ── Tere Scribe ──────────────────────────────────────────────────────────
  const generateNotes = useCallback(async () => {
    if (!c) return
    setScribe(s => ({ ...s, processing: true }))
    try {
      const res = await fetch('/api/generate-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: scribe.transcript.map(l => `${l.speaker}: ${l.text}`).join('\n'),
          vitals: {
            hr: c.vitals_hr, rr: c.vitals_rr,
            spo2: c.vitals_spo2, bp: c.vitals_bp_sys ? `${c.vitals_bp_sys}/${c.vitals_bp_dia}` : null
          },
          intake: { complaint: c.chief_complaint, accInjury: c.acc_injury_description },
        })
      })
      const { notes: generated } = await res.json()
      setNotes({ s: generated.subjective, o: generated.objective, a: generated.assessment, p: generated.plan })
      setTab('notes')
      showToast('Tere Scribe notes generated — review before accepting')
    } catch (err) {
      console.error(err)
      showToast('Note generation failed — write notes manually', '⚠️')
    } finally {
      setScribe(s => ({ ...s, processing: false }))
    }
  }, [c, scribe.transcript])

  // ── Actions ───────────────────────────────────────────────────────────────
  const savePrescription = async (rx) => {
    const prescriptions = [...(c.prescriptions || []), rx]
    await db.consultations.update(id, { prescriptions })
    setC(prev => ({ ...prev, prescriptions }))
    setModal(null)
    showToast(`Prescription sent to ${rx.pharmacy}`)
  }

  const saveRadiology = async (xr) => {
    const radiology_referrals = [...(c.radiology_referrals || []), xr]
    await db.consultations.update(id, { radiology_referrals })
    setC(prev => ({ ...prev, radiology_referrals }))
    setModal(null)
    showToast(`XR referral sent to ${xr.provider}`)
  }

  const saveACC = async (acc) => {
    // TODO: integrate with ACC ProviderHub API
    const claimNum = `ACC-${Date.now()}`
    await db.consultations.update(id, { acc_claim_number: claimNum })
    setC(prev => ({ ...prev, acc_claim_number: claimNum }))
    setModal(null)
    showToast(`ACC45 lodged — ref ${claimNum}`)
  }

  const handleEndCall = useCallback(async () => {
    clearInterval(timerRef.current)
    callFrameRef.current?.destroy()
    setSaving(true)
    await db.consultations.update(id, {
      status: 'completed',
      consultation_duration_seconds: elapsed,
      soap_subjective: notes.s,
      soap_objective:  notes.o,
      soap_assessment: notes.a,
      soap_plan:       notes.p,
      notes_accepted:  true,
    })
    navigate('/clinician')
  }, [id, elapsed, notes, navigate])

  if (!c) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--navy)' }}>
      <div className="spinner spinner-lg" style={{ borderColor:'rgba(255,255,255,0.2)', borderTopColor:'var(--teal)' }}></div>
    </div>
  )

  const allergyWarning = c.patient_allergies
    ? `⚠️ Allergy documented: ${c.patient_allergies}`
    : null

  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* Top bar */}
      <div style={{
        height:52, background:'var(--navy)', display:'flex', alignItems:'center',
        justifyContent:'space-between', padding:'0 1.25rem', flexShrink:0
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:'1.2rem', fontWeight:700, color:'var(--teal-light)', letterSpacing:'0.1em' }}>TERE</span>
          <span className="badge badge-live">● LIVE</span>
          <span style={{ color:'white', fontWeight:600, fontSize:'0.9rem' }}>
            {c.patient_name} — {c.chief_complaint?.slice(0,40)}{c.chief_complaint?.length > 40 ? '…' : ''}
          </span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ color:'#9CA3AF', fontSize:'0.85rem', fontFamily:'monospace' }}>{fmtTime(elapsed)}</span>
          <button onClick={handleEndCall} className="btn btn-danger btn-sm">End & Save</button>
        </div>
      </div>

      {/* Main layout */}
      <div style={{ flex:1, display:'grid', gridTemplateColumns:'340px 1fr', overflow:'hidden' }}>

        {/* LEFT — Clinical panel */}
        <div style={{ background:'white', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {/* Tabs */}
          <div style={{ display:'flex', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            {[['vitals','Vitals'],['patient','Patient'],['notes','Notes']].map(([t,l]) => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex:1, padding:'10px 6px', fontSize:'12px', fontWeight:600,
                color: tab===t ? 'var(--teal)' : 'var(--muted)', border:'none', background:'none',
                borderBottom: tab===t ? '2px solid var(--teal)' : '2px solid transparent',
                cursor:'pointer'
              }}>{l}</button>
            ))}
          </div>

          <div style={{ flex:1, overflowY:'auto' }}>

            {/* VITALS TAB */}
            {tab === 'vitals' && (
              <div style={{ padding:'1rem' }}>
                <p style={{ fontSize:'0.7rem', color:'var(--muted)', marginBottom:'0.75rem' }}>
                  Tere Vitals™ — pre-consultation · indicative screening only
                </p>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:'1rem' }}>
                  <VitalCard label="Heart Rate" value={c.vitals_hr} unit="bpm" normal={v=>v>=60&&v<=100} source="rPPG" />
                  <VitalCard label="SpO₂" value={c.vitals_spo2} unit="%" normal={v=>v>=95} source="manual" />
                  <VitalCard label="Resp. Rate" value={c.vitals_rr} unit="/min" normal={v=>v>=12&&v<=20} source="rPPG" />
                  <VitalCard label="BP" value={c.vitals_bp_sys ? `${c.vitals_bp_sys}/${c.vitals_bp_dia}` : null} unit="mmHg" normal={() => true} source="manual" />
                </div>

                <div style={{ fontSize:'0.85rem', fontWeight:600, marginBottom:'0.5rem' }}>Chief complaint</div>
                <div style={{ background:'var(--bg)', padding:'0.75rem', borderRadius:'var(--radius)', fontSize:'0.875rem', lineHeight:1.6, marginBottom:'1rem' }}>
                  {c.chief_complaint}
                </div>

                {c.is_acc && (
                  <>
                    <div style={{ fontSize:'0.85rem', fontWeight:600, marginBottom:'0.5rem' }}>ACC details</div>
                    <div style={{ fontSize:'0.85rem', display:'flex', flexDirection:'column', gap:4 }}>
                      <div style={{ display:'flex', justifyContent:'space-between' }}>
                        <span style={{ color:'var(--muted)' }}>Cover</span>
                        <span className="badge badge-purple">✓ Eligible</span>
                      </div>
                      {c.acc_employer && (
                        <div style={{ display:'flex', justifyContent:'space-between' }}>
                          <span style={{ color:'var(--muted)' }}>Employer</span>
                          <span style={{ fontWeight:500 }}>{c.acc_employer}</span>
                        </div>
                      )}
                      <div style={{ display:'flex', justifyContent:'space-between' }}>
                        <span style={{ color:'var(--muted)' }}>ACC45 consent</span>
                        <span style={{ color:'var(--success)', fontWeight:600 }}>✓ Recorded</span>
                      </div>
                      {c.acc_claim_number && (
                        <div style={{ display:'flex', justifyContent:'space-between' }}>
                          <span style={{ color:'var(--muted)' }}>Claim ref</span>
                          <span style={{ fontWeight:500, color:'var(--success)' }}>{c.acc_claim_number}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* PATIENT TAB */}
            {tab === 'patient' && (
              <div style={{ padding:'1rem' }}>
                {[
                  ['Name', c.patient_name],
                  ['NHI', c.patient_nhi || 'Not provided'],
                  ['DOB', c.patient_dob ? new Date(c.patient_dob).toLocaleDateString('en-NZ') : 'Not provided'],
                  ['Location', c.patient_location],
                  ['Phone', c.patient_phone || 'Not provided'],
                  ['Prescriptions sent', (c.prescriptions||[]).length],
                  ['XR referrals', (c.radiology_referrals||[]).length],
                ].map(([l,v]) => (
                  <div key={l} style={{
                    display:'flex', justifyContent:'space-between',
                    padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:'0.875rem'
                  }}>
                    <span style={{ color:'var(--muted)' }}>{l}</span>
                    <span style={{ fontWeight:500 }}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* NOTES TAB — Tere Scribe */}
            {tab === 'notes' && (
              <div style={{ padding:'1rem' }}>
                {/* Scribe status */}
                <div style={{
                  display:'flex', alignItems:'center', gap:8,
                  background: scribe.processing ? 'var(--warning-bg)' : c.recording_consent ? 'var(--success-bg)' : 'var(--bg)',
                  border:`1px solid ${scribe.processing ? '#FDE68A' : c.recording_consent ? '#6EE7B7' : 'var(--border)'}`,
                  borderRadius:'var(--radius)', padding:'0.75rem', marginBottom:'0.875rem'
                }}>
                  <span>{scribe.processing ? '⏳' : c.recording_consent ? '🎙' : '🔇'}</span>
                  <div>
                    <p style={{ fontSize:'0.8rem', fontWeight:600, margin:0 }}>
                      {scribe.processing ? 'Generating notes…' : c.recording_consent ? 'Tere Scribe active' : 'Recording consent not given'}
                    </p>
                    {!scribe.processing && c.recording_consent && (
                      <p style={{ fontSize:'0.75rem', color:'var(--muted)', margin:0 }}>
                        {scribe.transcript.length} transcript lines
                      </p>
                    )}
                  </div>
                  {c.recording_consent && !scribe.processing && scribe.transcript.length > 0 && (
                    <button onClick={generateNotes} className="btn btn-sm btn-primary" style={{ marginLeft:'auto', flexShrink:0 }}>
                      Generate →
                    </button>
                  )}
                </div>

                {/* SOAP notes */}
                {[['s','S — Subjective'],['o','O — Objective'],['a','A — Assessment'],['p','P — Plan']].map(([k,l]) => (
                  <div key={k} style={{ marginBottom:'0.875rem' }}>
                    <div style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--teal)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>
                      {l}
                      {notes[k] && <span style={{
                        marginLeft:6, fontSize:'0.65rem', background:'var(--teal-light)',
                        color:'var(--teal)', padding:'1px 6px', borderRadius:99
                      }}>AI draft</span>}
                    </div>
                    <textarea
                      value={notes[k]}
                      onChange={e => setNotes(n => ({...n,[k]:e.target.value}))}
                      className="form-textarea"
                      style={{ background: notes[k] ? '#F0FDF4' : 'var(--bg)', borderColor: notes[k] ? '#6EE7B7' : 'var(--border)' }}
                      rows={k==='p'?4:3}
                    />
                  </div>
                ))}

                <p style={{ fontSize:'0.7rem', color:'var(--muted)', marginTop:'0.5rem' }}>
                  Review all AI-generated content. You are clinically responsible for all notes.
                </p>
              </div>
            )}
          </div>

          {/* Action bar */}
          <div style={{ borderTop:'1px solid var(--border)', padding:'0.75rem', display:'flex', gap:6, flexShrink:0 }}>
            <button onClick={() => setModal('rx')} style={{
              flex:1, padding:'8px 4px', borderRadius:8, border:'none', cursor:'pointer',
              background:'var(--purple-bg)', color:'var(--purple)', fontSize:'11px', fontWeight:600
            }}>💊 Rx</button>
            <button onClick={() => setModal('xr')} style={{
              flex:1, padding:'8px 4px', borderRadius:8, border:'none', cursor:'pointer',
              background:'var(--warning-bg)', color:'var(--warning)', fontSize:'11px', fontWeight:600
            }}>🩻 XR</button>
            {c.is_acc && !c.acc_claim_number && (
              <button onClick={() => setModal('acc')} style={{
                flex:1, padding:'8px 4px', borderRadius:8, border:'none', cursor:'pointer',
                background:'var(--success-bg)', color:'var(--success)', fontSize:'11px', fontWeight:600
              }}>✓ ACC</button>
            )}
          </div>
        </div>

        {/* RIGHT — Video */}
        <div style={{ background:'#0D1117', display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'6px 1rem', background:'rgba(0,0,0,0.4)', flexShrink:0, display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:7, height:7, background:'#22C55E', borderRadius:'50%', animation:'pulse 2s infinite' }}></div>
            <span style={{ color:'rgba(255,255,255,0.6)', fontSize:'0.8rem' }}>
              Tere Video — end-to-end encrypted
            </span>
          </div>
          <div ref={callContainerRef} style={{ flex:1 }}></div>
        </div>
      </div>

      {/* Modals */}
      {modal === 'rx'  && <PrescribeModal onClose={() => setModal(null)} onSave={savePrescription} allergyWarning={allergyWarning} />}
      {modal === 'xr'  && <XrayModal     onClose={() => setModal(null)} onSave={saveRadiology} />}
      {modal === 'acc' && <ACCModal      consultation={c} onClose={() => setModal(null)} onSave={saveACC} />}

      {/* Toast */}
      {toast && (
        <div style={{
          position:'fixed', top:64, right:'1rem', background:'white',
          border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px',
          boxShadow:'0 4px 20px rgba(0,0,0,0.12)', display:'flex', gap:10,
          alignItems:'center', zIndex:300, maxWidth:320, animation:'slideIn 0.3s ease'
        }}>
          <style>{`@keyframes slideIn{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
          <span style={{ fontSize:'1.2rem' }}>{toast.icon}</span>
          <span style={{ fontSize:'0.875rem' }}>{toast.msg}</span>
        </div>
      )}
    </div>
  )
}
