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

// NZ paediatric dose calculator — weight in kg, returns { dose, volume, directions }
const PAED_DRUGS = {
  'paracetamol': { mgPerKg:15, maxMg:1000, concentration:{ mg:250, mL:5 }, form:'oral suspension 250mg/5mL', freq:'every 4–6 hours (max 4 doses/24h)', maxRepeats:0 },
  'ibuprofen':   { mgPerKg:10, maxMg:400,  concentration:{ mg:100, mL:5 }, form:'oral suspension 100mg/5mL', freq:'every 6–8 hours with food',        maxRepeats:0 },
  'amoxicillin': { mgPerKg:25, maxMg:500,  concentration:{ mg:250, mL:5 }, form:'oral suspension 250mg/5mL', freq:'three times daily for 5 days',      maxRepeats:0 },
  'cefalexin':   { mgPerKg:25, maxMg:500,  concentration:{ mg:250, mL:5 }, form:'oral suspension 250mg/5mL', freq:'four times daily for 5 days',       maxRepeats:0 },
}
function calcPaedDose(drug, weightKg) {
  const d = PAED_DRUGS[drug?.toLowerCase().split(' ')[0]]
  if (!d || !weightKg) return null
  const mg = Math.min(Math.round(d.mgPerKg * weightKg / 5) * 5, d.maxMg) // round to nearest 5mg
  const mL = Math.round((mg / d.concentration.mg) * d.concentration.mL * 10) / 10
  return { dose:`${mg}mg (${mL}mL)`, directions:`${mL}mL ${d.form} ${d.freq}`, qty:`100mL` }
}

function PrescribeModal({ open, onClose, consult, onDone }) {
  const [rx, setRx] = useState({ drug:'', dose:'', directions:'', qty:'', repeats:0 })
  const [pharmacy, setPharmacy] = useState({ name:'', hpiId:'', email:'', phone:'', address:'' })
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [templates, setTemplates] = useState([])
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [interactions, setInteractions] = useState(null)
  const [checkingInteractions, setCheckingInteractions] = useState(false)
  const [interactionOverride, setInteractionOverride] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [isPaediatric, setIsPaediatric] = useState(false)
  const [paedWeight, setPaedWeight] = useState('')
  const hasAllergyNote = consult?.patient_allergies?.toLowerCase().includes('penicillin') || false
  const canPrescribe = sessionStorage.getItem('providerCanPrescribe') !== 'false'
  const providerId = sessionStorage.getItem('providerId')

  async function checkDrugInteractions(drugName) {
    if (!drugName) return
    setCheckingInteractions(true)
    setInteractions(null)
    try {
      const res = await apiFetch('/api/drug-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drug: drugName,
          patientMedications: consult?.medications || '',
          patientAllergies: consult?.patient_allergies || '',
          consultationId: consult?.id,
          providerId,
        }),
      })
      const data = await res.json()
      if (!data.error) setInteractions(data)
    } catch {}
    setCheckingInteractions(false)
  }

  useEffect(() => {
    if (!open || !providerId) return
    apiFetch('/api/appointments', {
      method: 'POST', body: JSON.stringify({ action:'get_templates', provider_id: providerId })
    }).then(r => r.json()).then(d => setTemplates(d.templates || [])).catch(() => {})
  }, [open, providerId])

  function loadTemplate(t) {
    setRx({ drug:t.drug||'', dose:t.dose||'', directions:t.directions||'', qty:t.quantity||'', repeats:t.repeats||0 })
    setIsPaediatric(!!t.paediatric)
    setPaedWeight('')
  }

  async function saveTemplate() {
    if (!templateName.trim() || !rx.drug) return
    setSavingTemplate(true)
    try {
      const r = await apiFetch('/api/appointments', { method:'POST', body: JSON.stringify({
        action:'save_template', provider_id:providerId, name:templateName.trim(),
        drug:rx.drug, dose:rx.dose, directions:rx.directions, quantity:rx.qty, repeats:rx.repeats,
      })})
      const d = await r.json()
      if (d.ok) { setTemplates(ts => [...ts, d.template]); setShowSaveTemplate(false); setTemplateName('') }
    } catch {} finally { setSavingTemplate(false) }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSending(true)
    setResult(null)
    try {
      const res = await apiFetch('/api/generate-prescription-pdf', {
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
      <div style={{background:'#FEF3C7',border:'1px solid #D97706',borderRadius:8,padding:'.625rem .875rem',marginBottom:'1rem',fontSize:'.8125rem',color:'#92400E',lineHeight:1.5}}>
        <strong>Prescribing reminder:</strong> Controlled drugs (opioids, benzodiazepines, stimulants) and GLP-1 weight loss injections (e.g. Ozempic/Wegovy) cannot be prescribed via telehealth under NZ law.
        {consult?.controlled_medication_mentioned && <span style={{display:'block',marginTop:3,fontWeight:700}}>⚠ Patient mentioned a controlled medication during triage.</span>}
      </div>
      {/* Template picker */}
      {templates.length > 0 && (
        <div style={{marginBottom:'1rem'}}>
          <label style={{fontSize:'.75rem',fontWeight:600,color:'var(--muted)',display:'block',marginBottom:'.25rem'}}>Load template</label>
          <select onChange={e => { const t = templates.find(x=>x.id===e.target.value); if(t) loadTemplate(t); e.target.value='' }}
            style={{width:'100%',padding:'.5rem .75rem',border:'1.5px solid var(--border)',borderRadius:8,fontFamily:'Plus Jakarta Sans, sans-serif',fontSize:'.875rem',cursor:'pointer'}}>
            <option value=''>— Select a saved prescription —</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}
      <form onSubmit={handleSubmit}>
        {!canPrescribe && (
          <div className="alert" style={{background:'#FEF3C7',borderColor:'#D97706',color:'#92400E',fontSize:'.8125rem',marginBottom:'1rem'}}>
            ⚠️ You are not authorised to prescribe independently. This prescription will be sent to a supervising doctor for approval before being dispensed.
          </div>
        )}
        {hasAllergyNote && <div className="alert alert-danger">⚠️ Penicillin allergy documented</div>}
        <div className="form-group">
          <label>Medication</label>
          <input value={rx.drug} onChange={e=>setRx(r=>({...r,drug:e.target.value}))} onBlur={e=>checkDrugInteractions(e.target.value)} required placeholder="e.g. Ibuprofen 400mg tablets" />
          {checkingInteractions && <div style={{fontSize:'.75rem',color:'var(--muted)',marginTop:3}}>Checking interactions…</div>}
          {interactions && interactions.interactions?.length > 0 && (
            <div style={{marginTop:'.5rem',borderRadius:8,border:`1.5px solid ${interactions.maxSeverity==='major'?'#DC2626':interactions.maxSeverity==='moderate'?'#D97706':'#E2E8F0'}`,padding:'.75rem',background:interactions.maxSeverity==='major'?'#FEF2F2':interactions.maxSeverity==='moderate'?'#FFFBEB':'#F8FAFC'}}>
              <div style={{fontWeight:700,fontSize:'.8125rem',color:interactions.maxSeverity==='major'?'#DC2626':interactions.maxSeverity==='moderate'?'#D97706':'#374151',marginBottom:'.375rem'}}>
                {interactions.maxSeverity==='major'?'⛔ Major interaction detected':interactions.maxSeverity==='moderate'?'⚠ Moderate interaction':'ℹ Minor interaction'}
              </div>
              {interactions.interactions.map((ix,i)=>(
                <div key={i} style={{fontSize:'.75rem',color:'#374151',marginBottom:3}}>
                  <strong>{ix.drug1} + {ix.drug2}:</strong> {ix.description}
                </div>
              ))}
              {interactions.maxSeverity==='major' && !interactionOverride && (
                <div style={{marginTop:'.5rem'}}>
                  <div style={{fontSize:'.75rem',color:'#DC2626',marginBottom:4,fontWeight:600}}>Major interaction — document reason to proceed</div>
                  <input value={overrideReason} onChange={e=>setOverrideReason(e.target.value)} placeholder="Clinical reason for prescribing despite interaction…"
                    style={{width:'100%',boxSizing:'border-box',padding:'6px 8px',border:'1.5px solid #FECACA',borderRadius:6,fontSize:'.8125rem',fontFamily:'Plus Jakarta Sans, sans-serif'}} />
                  <button onClick={()=>{if(overrideReason.trim()){setInteractionOverride(true);apiFetch('/api/drug-interactions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({drug:rx.drug,patientMedications:consult?.medications,consultationId:consult?.id,providerId,override:true,overrideReason})})}}}
                    disabled={!overrideReason.trim()}
                    style={{marginTop:'.375rem',background:'#DC2626',color:'white',border:'none',borderRadius:6,padding:'5px 12px',cursor:'pointer',fontSize:'.75rem',fontWeight:700,fontFamily:'Plus Jakarta Sans, sans-serif'}}>
                    Override — proceed with prescription
                  </button>
                </div>
              )}
              {interactions.maxSeverity==='major' && interactionOverride && (
                <div style={{fontSize:'.75rem',color:'#059669',marginTop:4,fontWeight:600}}>✓ Override documented</div>
              )}
            </div>
          )}
          {interactions && interactions.interactions?.length === 0 && (
            <div style={{fontSize:'.75rem',color:'#059669',marginTop:3}}>✓ No known interactions with current medications</div>
          )}
        </div>
        {/* Paediatric weight-based dosing */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:'.75rem'}}>
          <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:'.8125rem',color:'#374151',fontFamily:'Plus Jakarta Sans, sans-serif'}}>
            <input type="checkbox" checked={isPaediatric} onChange={e=>{ setIsPaediatric(e.target.checked); setPaedWeight('') }} style={{width:16,height:16,cursor:'pointer'}} />
            Paediatric dosing (weight-based)
          </label>
        </div>
        {isPaediatric && (
          <div style={{background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:8,padding:'.75rem',marginBottom:'.75rem'}}>
            <div style={{fontSize:'.75rem',fontWeight:700,color:'#1D4ED8',marginBottom:6,textTransform:'uppercase',letterSpacing:'.05em'}}>Weight-based dose calculator</div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input type="number" min={1} max={100} value={paedWeight} onChange={e => {
                const w = parseFloat(e.target.value)
                setPaedWeight(e.target.value)
                if (w > 0 && rx.drug) {
                  const calc = calcPaedDose(rx.drug, w)
                  if (calc) setRx(r => ({...r, dose:calc.dose, directions:calc.directions, qty:calc.qty}))
                }
              }}
                placeholder="Weight (kg)"
                style={{width:130,padding:'7px 10px',border:'1.5px solid #93C5FD',borderRadius:8,fontFamily:'Plus Jakarta Sans, sans-serif',fontSize:'.9rem',outline:'none'}}
              />
              <span style={{fontSize:'.8rem',color:'#6B7280'}}>kg</span>
              {paedWeight && calcPaedDose(rx.drug, parseFloat(paedWeight)) && (
                <span style={{fontSize:'.8rem',color:'#1D4ED8',fontWeight:700}}>
                  → {calcPaedDose(rx.drug, parseFloat(paedWeight)).dose}
                </span>
              )}
              {paedWeight && !calcPaedDose(rx.drug, parseFloat(paedWeight)) && (
                <span style={{fontSize:'.8rem',color:'#D97706'}}>No auto-calc for this drug — enter dose manually</span>
              )}
            </div>
          </div>
        )}
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
          <button type="submit" className="btn btn-primary" style={{flex:1}}
            disabled={sending || (interactions?.maxSeverity==='major' && !interactionOverride)}>
            {sending ? 'Sending…' : canPrescribe ? 'Send to pharmacy' : 'Submit for approval'}
          </button>
        </div>
      </form>
      {/* Save as template */}
      {rx.drug && (
        <div style={{borderTop:'1px solid var(--border)',paddingTop:'.75rem',marginTop:'.75rem'}}>
          {showSaveTemplate ? (
            <div style={{display:'flex',gap:'.5rem',alignItems:'center'}}>
              <input value={templateName} onChange={e=>setTemplateName(e.target.value)} placeholder="Template name e.g. Ibuprofen standard"
                style={{flex:1,padding:'.5rem .75rem',border:'1.5px solid var(--border)',borderRadius:8,fontSize:'.875rem',fontFamily:'Plus Jakarta Sans, sans-serif'}} />
              <button onClick={saveTemplate} disabled={savingTemplate||!templateName.trim()}
                style={{background:'var(--teal)',color:'white',border:'none',borderRadius:8,padding:'.5rem .875rem',cursor:'pointer',fontSize:'.875rem',fontWeight:600}}>
                {savingTemplate?'…':'Save'}
              </button>
              <button onClick={()=>setShowSaveTemplate(false)} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',padding:'.5rem'}}>✕</button>
            </div>
          ) : (
            <button onClick={()=>setShowSaveTemplate(true)} style={{background:'none',border:'none',color:'var(--muted)',fontSize:'.8125rem',cursor:'pointer',fontFamily:'Plus Jakarta Sans, sans-serif',padding:0}}>
              ★ Save as template
            </button>
          )}
        </div>
      )}
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
      const res = await apiFetch('/api/generate-referral-pdf', {
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
            ✓ CRR eligible as telehealth doctor. ACC-funded for injury presentations.
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
                  {!isPhone && <VirtualBgControls />}
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

      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
