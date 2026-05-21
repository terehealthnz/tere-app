import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getConsultation, updateConsultation } from '../../lib/supabase'
import { ConsultationRecorder, transcribeAudio, generateNotes } from '../../lib/tereScribe'
import { LiveKitRoom, VideoConference } from '@livekit/components-react'
import '@livekit/components-styles'
import ChatPanel from '../ChatPanel'
import HpiSearch from '../HpiSearch'
import { CONSULT_TYPE_LABELS } from '../../lib/consultationType'
import { getLangMeta } from '../../lib/i18n'

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

function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function PrescribeModal({ open, onClose, consult, onDone }) {
  const [rx, setRx] = useState({ drug:'', dose:'', directions:'', qty:'', repeats:0 })
  const [pharmacy, setPharmacy] = useState({ name:'', hpiId:'', email:'', phone:'', address:'' })
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const hasAllergyNote = consult?.patient_allergies?.toLowerCase().includes('penicillin') || false
  const canPrescribe = sessionStorage.getItem('providerCanPrescribe') !== 'false'

  async function handleSubmit(e) {
    e.preventDefault()
    setSending(true)
    setResult(null)
    try {
      const res = await fetch('/api/generate-prescription-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultationId: consult?.id,
          providerId: sessionStorage.getItem('providerId'),
          providerName: sessionStorage.getItem('providerDisplayName'),
          prescriberNumber: sessionStorage.getItem('prescriberNumber'),
          patientName: `${consult?.patient_first_name || ''} ${consult?.patient_last_name || ''}`.trim(),
          patientNhi: consult?.patient_nhi,
          patientDob: consult?.patient_dob,
          patientEmail: consult?.patient_email,
          drug: rx.drug,
          dose: rx.dose,
          directions: rx.directions,
          quantity: rx.qty,
          repeats: rx.repeats,
          pharmacyName: pharmacy.name,
          pharmacyHpiId: pharmacy.hpiId,
          pharmacyEmail: pharmacy.email,
          pharmacyPhone: pharmacy.phone,
          pharmacyAddress: pharmacy.address,
          needsApproval: !canPrescribe,
          draftedByName: sessionStorage.getItem('providerDisplayName'),
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setResult({ ok: true, pending: data.pending, warnings: data.deliveryErrors })
        onDone({ type: 'prescription', drug: rx.drug, directions: rx.directions, pharmacy: pharmacy.name, pending: data.pending, timestamp: new Date().toISOString() })
        setTimeout(() => { setResult(null); onClose() }, data.pending ? 3000 : 2000)
      } else {
        setResult({ ok: false, error: data.error })
      }
    } catch (e) {
      setResult({ ok: false, error: e.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="💊 Prescribe">
      <form onSubmit={handleSubmit}>
        {!canPrescribe && (
          <div className="alert" style={{background:'#FEF3C7',borderColor:'#D97706',color:'#92400E',fontSize:'.8125rem',marginBottom:'1rem'}}>
            ⚠️ You are not authorised to prescribe independently. This prescription will be sent to a supervising doctor for approval before being dispensed.
          </div>
        )}
        {hasAllergyNote && <div className="alert alert-danger">⚠️ Penicillin allergy documented</div>}
        <div className="form-group">
          <label>Medication</label>
          <input value={rx.drug} onChange={e=>setRx(r=>({...r,drug:e.target.value}))} required placeholder="e.g. Ibuprofen 400mg tablets" />
        </div>
        <div className="form-group">
          <label>Dose</label>
          <input value={rx.dose} onChange={e=>setRx(r=>({...r,dose:e.target.value}))} placeholder="400mg" />
        </div>
        <div className="form-group">
          <label>Directions</label>
          <input value={rx.directions} onChange={e=>setRx(r=>({...r,directions:e.target.value}))} required placeholder="One tablet three times daily with food" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Quantity</label>
            <input value={rx.qty} onChange={e=>setRx(r=>({...r,qty:e.target.value}))} placeholder="30 tablets" />
          </div>
          <div className="form-group">
            <label>Repeats</label>
            <input type="number" min={0} max={12} value={rx.repeats} onChange={e=>setRx(r=>({...r,repeats:parseInt(e.target.value)||0}))} />
          </div>
        </div>
        <div className="form-group">
          <label>Pharmacy</label>
          <HpiSearch
            type="pharmacy"
            value={pharmacy.name}
            onSelect={r => setPharmacy({ name:r.name, hpiId:r.hpiId, email:r.email, phone:r.phone, address:r.address })}
            placeholder="Search pharmacies…"
          />
          {pharmacy.address && <div style={{fontSize:'.75rem',color:'var(--muted)',marginTop:'3px'}}>{pharmacy.address}</div>}
        </div>
        {!pharmacy.email && pharmacy.name && (
          <div className="form-group">
            <label>Pharmacy email <span style={{color:'var(--muted)',fontWeight:400}}>(if not found above)</span></label>
            <input value={pharmacy.email} onChange={e=>setPharmacy(p=>({...p,email:e.target.value}))} placeholder="dispensary@pharmacy.co.nz" type="email" />
          </div>
        )}
        {canPrescribe && (
          <div className="alert alert-info" style={{fontSize:'.8125rem',marginBottom:'1rem'}}>
            PDF generated &amp; emailed to pharmacy and patient. Non-controlled medications only.
          </div>
        )}
        {result && (
          <div className={`alert ${result.ok ? 'alert-success' : 'alert-danger'}`} style={{marginBottom:'1rem'}}>
            {result.ok
              ? result.pending
                ? '⏳ Prescription sent to supervising doctor for approval'
                : '✓ Prescription sent successfully'
              : `Error: ${result.error}`}
            {result.warnings?.length > 0 && <div style={{fontSize:'.75rem',marginTop:4}}>⚠ {result.warnings.join('; ')}</div>}
          </div>
        )}
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>Cancel</button>
          <button type="submit" className="btn btn-primary" style={{flex:1}} disabled={sending}>
            {sending ? 'Sending…' : canPrescribe ? 'Send to pharmacy' : 'Submit for approval'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function XrayModal({ open, onClose, consult, onDone }) {
  const [xr, setXr] = useState({ investigation:'X-ray', bodyPart:'', indication:'', urgency:'Urgent (within 24 hours)', history:'' })
  const [facility, setFacility] = useState({ name:'', hpiId:'', email:'', phone:'', address:'' })
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const accNum = consult?.acc_claim_number || ''
  const canRefer = sessionStorage.getItem('providerCanRefer') !== 'false'

  async function handleSubmit(e) {
    e.preventDefault()
    setSending(true)
    setResult(null)
    try {
      const res = await fetch('/api/generate-referral-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultationId: consult?.id,
          providerId: sessionStorage.getItem('providerId'),
          providerName: sessionStorage.getItem('providerDisplayName'),
          providerCpn: sessionStorage.getItem('providerCpn'),
          patientName: `${consult?.patient_first_name || ''} ${consult?.patient_last_name || ''}`.trim(),
          patientNhi: consult?.patient_nhi,
          patientDob: consult?.patient_dob,
          patientEmail: consult?.patient_email,
          investigation: xr.investigation,
          bodyPart: xr.bodyPart,
          clinicalIndication: xr.indication,
          urgency: xr.urgency,
          history: xr.history,
          accClaimNumber: accNum,
          facilityName: facility.name,
          facilityHpiId: facility.hpiId,
          facilityEmail: facility.email,
          facilityPhone: facility.phone,
          facilityAddress: facility.address,
          needsApproval: !canRefer,
          draftedByName: sessionStorage.getItem('providerDisplayName'),
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setResult({ ok: true, pending: data.pending, warnings: data.deliveryErrors })
        onDone({ type: 'radiology', investigation: xr.investigation, bodyPart: xr.bodyPart, urgency: xr.urgency, pending: data.pending, timestamp: new Date().toISOString() })
        setTimeout(() => { setResult(null); onClose() }, data.pending ? 3000 : 2000)
      } else {
        setResult({ ok: false, error: data.error })
      }
    } catch (e) {
      setResult({ ok: false, error: e.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="🩻 Order Imaging">
      <form onSubmit={handleSubmit}>
        {!canRefer && (
          <div className="alert" style={{background:'#FEF3C7',borderColor:'#D97706',color:'#92400E',fontSize:'.8125rem',marginBottom:'1rem'}}>
            ⚠️ You are not authorised to refer independently. This referral will be sent to a supervising doctor for approval before being dispatched.
          </div>
        )}
        <div className="form-row">
          <div className="form-group">
            <label>Investigation</label>
            <select value={xr.investigation} onChange={e=>setXr(x=>({...x,investigation:e.target.value}))}>
              <option>X-ray</option><option>CT</option><option>Ultrasound</option><option>MRI</option>
            </select>
          </div>
          <div className="form-group">
            <label>Body part / region</label>
            <input value={xr.bodyPart} onChange={e=>setXr(x=>({...x,bodyPart:e.target.value}))} required placeholder="Right ankle AP & lateral" />
          </div>
        </div>
        <div className="form-group">
          <label>Clinical indication</label>
          <textarea value={xr.indication} onChange={e=>setXr(x=>({...x,indication:e.target.value}))} required rows={2} placeholder="Suspected fracture. Ottawa rules positive." />
        </div>
        <div className="form-group">
          <label>Relevant history <span style={{color:'var(--muted)',fontWeight:400}}>(optional)</span></label>
          <input value={xr.history} onChange={e=>setXr(x=>({...x,history:e.target.value}))} placeholder="e.g. First presentation, no previous imaging" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Urgency</label>
            <select value={xr.urgency} onChange={e=>setXr(x=>({...x,urgency:e.target.value}))}>
              <option>Urgent (within 24 hours)</option>
              <option>Semi-urgent (within 48 hours)</option>
              <option>Routine</option>
            </select>
          </div>
          {accNum && <div className="form-group">
            <label>ACC claim</label>
            <input value={accNum} readOnly style={{background:'var(--bg)',color:'var(--success)'}} />
          </div>}
        </div>
        <div className="form-group">
          <label>Radiology facility</label>
          <HpiSearch
            type="radiology"
            value={facility.name}
            onSelect={r => setFacility({ name:r.name, hpiId:r.hpiId, email:r.email, phone:r.phone, address:r.address })}
            placeholder="Search radiology providers…"
          />
          {facility.address && <div style={{fontSize:'.75rem',color:'var(--muted)',marginTop:'3px'}}>{facility.address}</div>}
        </div>
        {!facility.email && facility.name && (
          <div className="form-group">
            <label>Facility email <span style={{color:'var(--muted)',fontWeight:400}}>(if not found above)</span></label>
            <input value={facility.email} onChange={e=>setFacility(f=>({...f,email:e.target.value}))} placeholder="referrals@radiology.co.nz" type="email" />
          </div>
        )}
        {canRefer && (
          <div className="alert alert-success" style={{fontSize:'.8125rem'}}>
            ✓ CRR eligible as urgent care doctor. ACC-funded for injury presentations.
          </div>
        )}
        {result && (
          <div className={`alert ${result.ok ? 'alert-success' : 'alert-danger'}`} style={{marginBottom:'1rem'}}>
            {result.ok
              ? result.pending
                ? '⏳ Referral sent to supervising doctor for approval'
                : '✓ Referral sent successfully'
              : `Error: ${result.error}`}
            {result.warnings?.length > 0 && <div style={{fontSize:'.75rem',marginTop:4}}>⚠ {result.warnings.join('; ')}</div>}
          </div>
        )}
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>Cancel</button>
          <button type="submit" className="btn btn-primary" style={{flex:1}} disabled={sending}>
            {sending ? 'Sending…' : canRefer ? 'Send referral' : 'Submit for approval'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ACCModal({ open, onClose, consult, onDone }) {
  const [acc, setAcc] = useState({
    injury: '', cause: '', readCode: 'S60',
    employer: consult?.acc_employer || '',
  })
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const canAcc = sessionStorage.getItem('providerCanAcc') !== 'false'

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setResult(null)
    if (!canAcc) {
      // Save pending approval on the consultation
      try {
        const { supabase } = await import('../../lib/supabase')
        await supabase.from('consultations').update({
          acc_approval_status: 'pending_approval',
          acc_draft: { ...acc, drafted_by: sessionStorage.getItem('providerDisplayName'), drafted_at: new Date().toISOString() },
        }).eq('id', consult.id)
        setResult({ pending: true })
        onDone({ type: 'acc45', ...acc, pending: true, timestamp: new Date().toISOString() })
        setTimeout(() => { setResult(null); onClose() }, 3000)
      } catch (e) {
        setResult({ error: e.message })
      } finally {
        setSaving(false)
      }
      return
    }
    onDone({ type: 'acc45', ...acc, timestamp: new Date().toISOString() })
    onClose()
    setSaving(false)
  }

  return (
    <Modal open={open} onClose={onClose} title="✓ Lodge ACC Claim">
      <form onSubmit={handleSubmit}>
        {!canAcc && (
          <div className="alert" style={{background:'#FEF3C7',borderColor:'#D97706',color:'#92400E',fontSize:'.8125rem',marginBottom:'1rem'}}>
            ⚠️ ACC claims require supervisor countersignature. This claim will be sent for approval before lodging.
          </div>
        )}
        <div className="form-group">
          <label>Injury / diagnosis</label>
          <input value={acc.injury} onChange={e=>setAcc(a=>({...a,injury:e.target.value}))} required placeholder="e.g. Suspected fracture right lateral malleolus" />
        </div>
        <div className="form-group">
          <label>Cause of injury</label>
          <input value={acc.cause} onChange={e=>setAcc(a=>({...a,cause:e.target.value}))} required placeholder="e.g. Fall from ladder on vessel" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Read code</label>
            <input value={acc.readCode} onChange={e=>setAcc(a=>({...a,readCode:e.target.value}))} />
          </div>
          <div className="form-group">
            <label>Employer</label>
            <input value={acc.employer} onChange={e=>setAcc(a=>({...a,employer:e.target.value}))} />
          </div>
        </div>
        {canAcc && (
          <div className="alert alert-success" style={{fontSize:'.8125rem'}}>
            ✓ Three-part ACC45 consent obtained at intake. Claim ready to lodge via ProviderHub.
          </div>
        )}
        {result?.pending && (
          <div className="alert alert-success" style={{marginBottom:'1rem'}}>
            ⏳ ACC claim sent to supervising doctor for countersignature
          </div>
        )}
        {result?.error && (
          <div className="alert alert-danger" style={{marginBottom:'1rem'}}>Error: {result.error}</div>
        )}
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn btn-primary" style={{flex:1}} disabled={saving}>
            {saving ? 'Saving…' : canAcc ? 'Lodge via ProviderHub' : 'Submit for approval'}
          </button>
        </div>
      </form>
    </Modal>
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
  const recorderRef = useRef(null)

  useEffect(() => {
    if (!sessionStorage.getItem('clinicianAuth')) { navigate('/clinician'); return }
    async function load() {
      try {
        const data = await getConsultation(id)
        setConsult(data)

        if (!data.daily_room_url) {
          try {
            const res = await fetch('/api/create-room', {
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
          const tr = await fetch('/api/join-room', {
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

  async function startScribe() {
    setScribeState('recording')
    recorderRef.current = new ConsultationRecorder()
    try {
      await recorderRef.current.start()
    } catch (e) {
      alert(e.message)
      setScribeState('idle')
    }
  }

  async function stopScribe() {
    setScribeState('transcribing')
    try {
      const blob = await recorderRef.current.stop()
      const text = await transcribeAudio(blob)
      setTranscript(text)
      setTab('notes')

      const context = {
        patientName: `${consult.patient_first_name} ${consult.patient_last_name}`,
        complaint: consult.chief_complaint,
        vitals: consult.vitals,
        accEligible: consult.acc_eligible === 'yes',
      }
      const generated = await generateNotes(text, context)
      setAiNotes(generated)
      setNotes(generated.soap || notes)
      setScribeState('done')
    } catch (e) {
      console.error(e)
      setScribeState('idle')
      alert('Transcription failed. Check your API keys or enter notes manually.')
    }
  }

  function addAction(action) {
    setActions(a => [...a, action])
  }

  async function endConsult() {
    const durationSec = consult.started_at
      ? Math.round((Date.now() - new Date(consult.started_at)) / 1000) : null
    try {
      const { supabase } = await import('../../lib/supabase')
      await supabase.from('consultations').update({
        notes_draft: { actions },
        transcript: transcript || null,
        consultation_duration_seconds: durationSec,
      }).eq('id', id)
    } catch {}
    navigate(`/clinician/notes/${id}`, { state: { actions, transcript: transcript || '' } })
  }

  if (!consult) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh'}}><div className="spinner" /></div>

  return (
    <div style={{display:'grid',gridTemplateColumns:'360px 1fr',height:'100vh',overflow:'hidden',fontFamily:'Plus Jakarta Sans, sans-serif'}}>

      {/* ── Left panel ── */}
      <div style={{background:'white',borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {/* Top bar */}
        <div style={{background:'var(--navy)',padding:'.875rem 1rem',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontFamily:'Cormorant Garamond, serif',fontStyle:'italic',color:'var(--teal-light)',fontSize:'1.2rem'}}>Tere</span>
            <button onClick={() => navigate('/clinician/dashboard')}
              style={{background:'rgba(255,255,255,.1)',border:'none',color:'rgba(255,255,255,.7)',padding:'4px 10px',borderRadius:'6px',cursor:'pointer',fontSize:'.8125rem'}}>
              ← Queue
            </button>
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
                ].filter(([,v]) => v).map(([k,v]) => (
                  <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:'.8125rem'}}>
                    <span style={{color:'var(--muted)'}}>{k}</span>
                    <span style={{fontWeight:500,color: k==='ACC'&&v.startsWith('✓') ? 'var(--success)' : k==='Allergies'&&v!=='None documented' ? 'var(--danger)' : 'var(--text)'}}>{v}</span>
                  </div>
                ))}
              </div>

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
                    await supabase.from('consultations').update({ status: 'in_progress', started_at: startedAt }).eq('id', consult.id)
                    setConsult(d => ({...d, status: 'in_progress', started_at: startedAt}))
                    if (consult.payment_intent_id) {
                      fetch('/api/capture-payment', {
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

              {consult.status === 'in_progress' && (
                <div style={{marginTop:'1rem',background:'var(--success-bg)',border:'1px solid var(--success)',borderRadius:'var(--radius-sm)',padding:'.75rem',textAlign:'center',fontSize:'.875rem',color:'var(--success)',fontWeight:600}}>
                  ✓ Patient admitted — joining call
                </div>
              )}
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
                    {scribeState==='transcribing' && <div style={{width:18,height:18,border:'2px solid var(--teal-light)',borderTopColor:'var(--teal)',borderRadius:'50%',animation:'spin .7s linear infinite'}} />}
                    <span style={{fontSize:'.8125rem',fontWeight:600,color: scribeState==='recording'?'#DC2626':scribeState==='done'?'var(--success)':'var(--muted)'}}>
                      {scribeState==='idle'?'Tere Scribe':scribeState==='recording'?'Recording…':scribeState==='transcribing'?'Generating notes…':'Notes ready'}
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
            </div>

            {/* Audio-only banner */}
            {isPhone && (
              <div style={{background:'rgba(11,110,118,.85)',padding:'.5rem 1rem',fontSize:'.875rem',color:'white',fontFamily:'Plus Jakarta Sans,sans-serif',display:'flex',alignItems:'center',gap:'.5rem',flexShrink:0}}>
                📞 <strong>Audio only</strong> — video camera disabled for this consultation
              </div>
            )}

            {/* Video area */}
            <div style={{flex:1,overflow:'hidden',position:'relative'}}>
              {lkToken && lkUrl ? (
                <LiveKitRoom
                  token={lkToken}
                  serverUrl={lkUrl}
                  video={!isPhone}
                  audio={true}
                  data-lk-theme="default"
                  style={{width:'100%',height:'100%'}}
                >
                  <VideoConference />
                </LiveKitRoom>
              ) : (
                <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <div style={{textAlign:'center',color:'rgba(255,255,255,.5)'}}>
                    <div style={{width:32,height:32,border:'3px solid rgba(255,255,255,.2)',borderTopColor:'var(--teal)',borderRadius:'50%',animation:'spin .8s linear infinite',margin:'0 auto 1rem'}}/>
                    <div style={{fontSize:'.9375rem',color:'rgba(255,255,255,.4)'}}>Connecting…</div>
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
            </div>

            <div style={{background:'rgba(0,0,0,.3)',padding:'5px',textAlign:'center',flexShrink:0}}>
              <span style={{fontSize:'.6875rem',color:'rgba(255,255,255,.2)'}}>
                Tere · LiveKit WebRTC · {id}
              </span>
            </div>
          </div>
        )
      })()}

      {/* Modals */}
      <PrescribeModal open={modals.rx} onClose={() => setModals(m=>({...m,rx:false}))} consult={consult} onDone={addAction} />
      <XrayModal open={modals.xr} onClose={() => setModals(m=>({...m,xr:false}))} consult={consult} onDone={addAction} />
      <ACCModal open={modals.acc} onClose={() => setModals(m=>({...m,acc:false}))} consult={consult} onDone={addAction} />

      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
