import React, { useState, useEffect } from 'react'
import { apiFetch } from '../../lib/api'
import HpiSearch from '../HpiSearch'

// ── Shared modal shell ────────────────────────────────────────────────────────

export function Modal({ open, onClose, title, children }) {
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

// ── Paediatric dose calculator ────────────────────────────────────────────────

const PAED_DRUGS = {
  'paracetamol': { mgPerKg:15, maxMg:1000, concentration:{ mg:250, mL:5 }, form:'oral suspension 250mg/5mL', freq:'every 4–6 hours (max 4 doses/24h)', maxRepeats:0 },
  'ibuprofen':   { mgPerKg:10, maxMg:400,  concentration:{ mg:100, mL:5 }, form:'oral suspension 100mg/5mL', freq:'every 6–8 hours with food',        maxRepeats:0 },
  'amoxicillin': { mgPerKg:25, maxMg:500,  concentration:{ mg:250, mL:5 }, form:'oral suspension 250mg/5mL', freq:'three times daily for 5 days',      maxRepeats:0 },
  'cefalexin':   { mgPerKg:25, maxMg:500,  concentration:{ mg:250, mL:5 }, form:'oral suspension 250mg/5mL', freq:'four times daily for 5 days',       maxRepeats:0 },
}

export function calcPaedDose(drug, weightKg) {
  const d = PAED_DRUGS[drug?.toLowerCase().split(' ')[0]]
  if (!d || !weightKg) return null
  const mg = Math.min(Math.round(d.mgPerKg * weightKg / 5) * 5, d.maxMg)
  const mL = Math.round((mg / d.concentration.mg) * d.concentration.mL * 10) / 10
  return { dose:`${mg}mg (${mL}mL)`, directions:`${mL}mL ${d.form} ${d.freq}`, qty:`100mL` }
}

// ── Prescribe modal ───────────────────────────────────────────────────────────

export function PrescribeModal({ open, onClose, consult, onDone }) {
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

  // Pre-fill pharmacy name from triage data when modal opens
  useEffect(() => {
    if (open && consult?.pharmacy && !pharmacy.name) {
      setPharmacy(p => ({ ...p, name: consult.pharmacy }))
    }
    if (!open) {
      setPharmacy({ name:'', hpiId:'', email:'', phone:'', address:'' })
    }
  }, [open, consult?.pharmacy])

  async function checkDrugInteractions(drugName) {
    if (!drugName) return
    setCheckingInteractions(true)
    setInteractions(null)
    try {
      const res = await apiFetch('/api/drug-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drug: drugName, patientMedications: consult?.medications || '', patientAllergies: consult?.patient_allergies || '', consultationId: consult?.id, providerId }),
      })
      const data = await res.json()
      if (!data.error) setInteractions(data)
    } catch {}
    setCheckingInteractions(false)
  }

  useEffect(() => {
    if (!open || !providerId) return
    apiFetch('/api/appointments', { method:'POST', body: JSON.stringify({ action:'get_templates', provider_id: providerId }) })
      .then(r => r.json()).then(d => setTemplates(d.templates || [])).catch(() => {})
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
      const r = await apiFetch('/api/appointments', { method:'POST', body: JSON.stringify({ action:'save_template', provider_id:providerId, name:templateName.trim(), drug:rx.drug, dose:rx.dose, directions:rx.directions, quantity:rx.qty, repeats:rx.repeats }) })
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
          drug: rx.drug, dose: rx.dose, directions: rx.directions,
          quantity: rx.qty, repeats: rx.repeats,
          pharmacyName: pharmacy.name, pharmacyHpiId: pharmacy.hpiId,
          pharmacyEmail: pharmacy.email, pharmacyPhone: pharmacy.phone,
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
        <strong>Prescribing reminder:</strong> Controlled drugs (opioids, benzodiazepines, stimulants) and GLP-1 weight loss injections cannot be prescribed via telehealth under NZ law.
        {consult?.controlled_medication_mentioned && <span style={{display:'block',marginTop:3,fontWeight:700}}>⚠ Patient mentioned a controlled medication during triage.</span>}
      </div>
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
            ⚠️ You are not authorised to prescribe independently. This prescription will be sent to a supervising doctor for approval.
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
                <div key={i} style={{fontSize:'.75rem',color:'#374151',marginBottom:3}}><strong>{ix.drug1} + {ix.drug2}:</strong> {ix.description}</div>
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
                const w = parseFloat(e.target.value); setPaedWeight(e.target.value)
                if (w > 0 && rx.drug) { const calc = calcPaedDose(rx.drug, w); if (calc) setRx(r => ({...r, dose:calc.dose, directions:calc.directions, qty:calc.qty})) }
              }} placeholder="Weight (kg)" style={{width:130,padding:'7px 10px',border:'1.5px solid #93C5FD',borderRadius:8,fontFamily:'Plus Jakarta Sans, sans-serif',fontSize:'.9rem',outline:'none'}} />
              <span style={{fontSize:'.8rem',color:'#6B7280'}}>kg</span>
              {paedWeight && calcPaedDose(rx.drug, parseFloat(paedWeight)) && (
                <span style={{fontSize:'.8rem',color:'#1D4ED8',fontWeight:700}}>→ {calcPaedDose(rx.drug, parseFloat(paedWeight)).dose}</span>
              )}
              {paedWeight && !calcPaedDose(rx.drug, parseFloat(paedWeight)) && (
                <span style={{fontSize:'.8rem',color:'#D97706'}}>No auto-calc — enter dose manually</span>
              )}
            </div>
          </div>
        )}
        <div className="form-group"><label>Dose</label><input value={rx.dose} onChange={e=>setRx(r=>({...r,dose:e.target.value}))} placeholder="400mg" /></div>
        <div className="form-group"><label>Directions</label><input value={rx.directions} onChange={e=>setRx(r=>({...r,directions:e.target.value}))} required placeholder="One tablet three times daily with food" /></div>
        <div className="form-row">
          <div className="form-group"><label>Quantity</label><input value={rx.qty} onChange={e=>setRx(r=>({...r,qty:e.target.value}))} placeholder="30 tablets" /></div>
          <div className="form-group"><label>Repeats</label><input type="number" min={0} max={12} value={rx.repeats} onChange={e=>setRx(r=>({...r,repeats:parseInt(e.target.value)||0}))} /></div>
        </div>
        {!consult?.pharmacy ? (
          <div style={{background:'#FEF9EC',border:'1px solid #FDE68A',borderRadius:8,padding:'.625rem .875rem',marginBottom:'.875rem',fontSize:'.8125rem',color:'#92400E',lineHeight:1.5}}>
            ⚠️ <strong>No pharmacy on file.</strong> Patient didn't specify a preferred pharmacy during triage. Consider messaging them to ask before sending.
          </div>
        ) : !pharmacy.hpiId ? (
          <div style={{background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:8,padding:'.5rem .875rem',marginBottom:'.75rem',fontSize:'.8125rem',color:'#1D4ED8',lineHeight:1.5}}>
            📍 Patient's preferred pharmacy: <strong>{consult.pharmacy}</strong> — search below to confirm and get their email for delivery.
          </div>
        ) : null}
        <div className="form-group">
          <label>Pharmacy</label>
          <HpiSearch type="pharmacy" value={pharmacy.name} onSelect={r => setPharmacy({ name:r.name, hpiId:r.hpiId, email:r.email, phone:r.phone, address:r.address })} placeholder="Search pharmacies…" />
          {pharmacy.address && <div style={{fontSize:'.75rem',color:'var(--muted)',marginTop:'3px'}}>{pharmacy.address}</div>}
        </div>
        {!pharmacy.email && pharmacy.name && (
          <div className="form-group">
            <label>Pharmacy email <span style={{color:'var(--muted)',fontWeight:400}}>(if not found above)</span></label>
            <input value={pharmacy.email} onChange={e=>setPharmacy(p=>({...p,email:e.target.value}))} placeholder="dispensary@pharmacy.co.nz" type="email" />
          </div>
        )}
        {canPrescribe && <div className="alert alert-info" style={{fontSize:'.8125rem',marginBottom:'1rem'}}>PDF generated &amp; emailed to pharmacy and patient. Non-controlled medications only.</div>}
        {result && (
          <div className={`alert ${result.ok ? 'alert-success' : 'alert-danger'}`} style={{marginBottom:'1rem'}}>
            {result.ok ? (result.pending ? '⏳ Sent to supervising doctor for approval' : '✓ Prescription sent successfully') : `Error: ${result.error}`}
            {result.warnings?.length > 0 && <div style={{fontSize:'.75rem',marginTop:4}}>⚠ {result.warnings.join('; ')}</div>}
          </div>
        )}
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>Cancel</button>
          <button type="submit" className="btn btn-primary" style={{flex:1}} disabled={sending || (interactions?.maxSeverity==='major' && !interactionOverride)}>
            {sending ? 'Sending…' : canPrescribe ? 'Send to pharmacy' : 'Submit for approval'}
          </button>
        </div>
      </form>
      {rx.drug && (
        <div style={{borderTop:'1px solid var(--border)',paddingTop:'.75rem',marginTop:'.75rem'}}>
          {showSaveTemplate ? (
            <div style={{display:'flex',gap:'.5rem',alignItems:'center'}}>
              <input value={templateName} onChange={e=>setTemplateName(e.target.value)} placeholder="Template name e.g. Ibuprofen standard"
                style={{flex:1,padding:'.5rem .75rem',border:'1.5px solid var(--border)',borderRadius:8,fontSize:'.875rem',fontFamily:'Plus Jakarta Sans, sans-serif'}} />
              <button onClick={saveTemplate} disabled={savingTemplate||!templateName.trim()} style={{background:'var(--teal)',color:'white',border:'none',borderRadius:8,padding:'.5rem .875rem',cursor:'pointer',fontSize:'.875rem',fontWeight:600}}>{savingTemplate?'…':'Save'}</button>
              <button onClick={()=>setShowSaveTemplate(false)} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',padding:'.5rem'}}>✕</button>
            </div>
          ) : (
            <button onClick={()=>setShowSaveTemplate(true)} style={{background:'none',border:'none',color:'var(--muted)',fontSize:'.8125rem',cursor:'pointer',fontFamily:'Plus Jakarta Sans, sans-serif',padding:0}}>★ Save as template</button>
          )}
        </div>
      )}
    </Modal>
  )
}

// ── Imaging referral modal ────────────────────────────────────────────────────

export function XrayModal({ open, onClose, consult, onDone }) {
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
          patientNhi: consult?.patient_nhi, patientDob: consult?.patient_dob, patientEmail: consult?.patient_email,
          investigation: xr.investigation, bodyPart: xr.bodyPart, clinicalIndication: xr.indication,
          urgency: xr.urgency, history: xr.history, accClaimNumber: accNum,
          facilityName: facility.name, facilityHpiId: facility.hpiId, facilityEmail: facility.email,
          facilityPhone: facility.phone, facilityAddress: facility.address,
          needsApproval: !canRefer, draftedByName: sessionStorage.getItem('providerDisplayName'),
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
            ⚠️ You are not authorised to refer independently. This referral will be sent to a supervising doctor for approval.
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
          {accNum && <div className="form-group"><label>ACC claim</label><input value={accNum} readOnly style={{background:'var(--bg)',color:'var(--success)'}} /></div>}
        </div>
        <div className="form-group">
          <label>Radiology facility</label>
          <HpiSearch type="radiology" value={facility.name} onSelect={r => setFacility({ name:r.name, hpiId:r.hpiId, email:r.email, phone:r.phone, address:r.address })} placeholder="Search radiology providers…" />
          {facility.address && <div style={{fontSize:'.75rem',color:'var(--muted)',marginTop:'3px'}}>{facility.address}</div>}
        </div>
        {!facility.email && facility.name && (
          <div className="form-group">
            <label>Facility email <span style={{color:'var(--muted)',fontWeight:400}}>(if not found above)</span></label>
            <input value={facility.email} onChange={e=>setFacility(f=>({...f,email:e.target.value}))} placeholder="referrals@radiology.co.nz" type="email" />
          </div>
        )}
        {canRefer && <div className="alert alert-success" style={{fontSize:'.8125rem'}}>✓ CRR eligible as telehealth doctor. ACC-funded for injury presentations.</div>}
        {result && (
          <div className={`alert ${result.ok ? 'alert-success' : 'alert-danger'}`} style={{marginBottom:'1rem'}}>
            {result.ok ? (result.pending ? '⏳ Sent to supervising doctor for approval' : '✓ Referral sent successfully') : `Error: ${result.error}`}
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

// ── Clinical notes modal ──────────────────────────────────────────────────────
// Generates SOAP notes from triage + message exchange, lets provider edit,
// then returns the final text to be included in the consultation response.

export function NotesModal({ open, onClose, consult, messages, onInsert }) {
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [generated, setGenerated] = useState(false)

  useEffect(() => {
    if (!open || generated) return
    generate()
  }, [open])

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      // Build a transcript from the async message exchange
      const transcript = (messages || [])
        .map(m => `${m.sender === 'provider' ? 'Provider' : 'Patient'}: ${m.message || ''}`)
        .filter(l => l.length > 10)
        .join('\n')

      const res = await apiFetch('/api/generate-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultationId: consult?.id,
          transcript,
          providerName: sessionStorage.getItem('providerDisplayName') || 'Treating clinician',
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      // Format SOAP sections into editable text
      const n = data.notes || {}
      const lines = []
      if (n.S) lines.push(`SUBJECTIVE\n${n.S}`)
      if (n.O) lines.push(`OBJECTIVE\n${n.O}`)
      if (n.A) lines.push(`ASSESSMENT\n${n.A}`)
      if (n.P) lines.push(`PLAN\n${n.P}`)
      if (n.safetyNetting) lines.push(`SAFETY NETTING\n${n.safetyNetting}`)
      setNotes(lines.join('\n\n'))
      setGenerated(true)
    } catch (e) {
      setError(e.message || 'Could not generate notes')
    } finally {
      setLoading(false)
    }
  }

  function handleInsert() {
    onInsert(notes)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="📋 Clinical Notes">
      {loading && (
        <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <div style={{ width: 32, height: 32, border: '3px solid var(--teal)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto .75rem' }} />
          <div style={{ color: 'var(--muted)', fontSize: '.9375rem' }}>Generating notes from triage &amp; messages…</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}
      {error && (
        <div>
          <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{error}</div>
          <button onClick={generate} className="btn btn-secondary" style={{ width: '100%' }}>Retry</button>
        </div>
      )}
      {!loading && !error && (
        <>
          <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: '.5rem' }}>
            AI-generated from triage data and message history — review and edit before using.
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={16}
            style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--border)', borderRadius: 8, padding: '.75rem', fontFamily: 'monospace', fontSize: '.8125rem', lineHeight: 1.7, resize: 'vertical', outline: 'none' }}
          />
          <div className="modal-footer" style={{ marginTop: '.75rem' }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleInsert} disabled={!notes.trim()}>
              Insert into response
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

// ── In-person referral modal ──────────────────────────────────────────────────
// Closes consultation with no charge, refers patient to GP or ED,
// emails patient explaining the recommendation.

export function InPersonModal({ open, onClose, consult, onDone }) {
  const [referralType, setReferralType] = useState('gp')
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!open) { setReferralType('gp'); setNotes(''); setResult(null) }
  }, [open])

  async function handleSubmit() {
    setSending(true)
    setResult(null)
    try {
      const res = await apiFetch('/api/async-consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'in_person',
          consultationId: consult?.id,
          referralType,
          notes: notes.trim() || undefined,
          providerId: sessionStorage.getItem('providerId'),
          providerName: sessionStorage.getItem('providerDisplayName'),
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setResult({ ok: true })
        onDone({ type: 'in_person', referralType })
        setTimeout(() => { setResult(null); onClose() }, 2000)
      } else {
        setResult({ ok: false, error: data.error })
      }
    } catch (e) {
      setResult({ ok: false, error: e.message })
    } finally {
      setSending(false)
    }
  }

  const FF = 'Plus Jakarta Sans, sans-serif'
  return (
    <Modal open={open} onClose={onClose} title="🏥 Seen in person">
      <div style={{ marginBottom: '1.25rem' }}>
        <label style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '.5rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Refer to</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
          <button onClick={() => setReferralType('gp')}
            style={{ padding: '14px 10px', borderRadius: 10, border: `2px solid ${referralType === 'gp' ? '#0B6E76' : '#E2E8F0'}`, background: referralType === 'gp' ? '#EFF9F9' : 'white', color: referralType === 'gp' ? '#0B6E76' : '#6B7280', fontWeight: 700, fontSize: '.875rem', cursor: 'pointer', fontFamily: FF }}>
            🏥 GP
          </button>
          <button onClick={() => setReferralType('er')}
            style={{ padding: '14px 10px', borderRadius: 10, border: `2px solid ${referralType === 'er' ? '#DC2626' : '#E2E8F0'}`, background: referralType === 'er' ? '#FEF2F2' : 'white', color: referralType === 'er' ? '#DC2626' : '#6B7280', fontWeight: 700, fontSize: '.875rem', cursor: 'pointer', fontFamily: FF }}>
            🚨 Emergency Dept
          </button>
        </div>
      </div>
      <div className="form-group">
        <label>Notes for patient <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          placeholder="e.g. Please see your GP within 24 hours for further evaluation…"
          style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--border)', borderRadius: 8, padding: '.75rem', fontFamily: FF, fontSize: '.875rem', resize: 'vertical', outline: 'none' }} />
      </div>
      <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '.875rem', fontSize: '.8125rem', color: '#065F46', marginBottom: '1rem' }}>
        ✅ No charge will be applied — the patient's payment authorisation will be released automatically.
      </div>
      {result && (
        <div className={`alert ${result.ok ? 'alert-success' : 'alert-danger'}`} style={{ marginBottom: '1rem' }}>
          {result.ok ? '✓ Patient notified — no charge applied' : `Error: ${result.error}`}
        </div>
      )}
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1, ...(referralType === 'er' ? { background: '#DC2626' } : {}) }} onClick={handleSubmit} disabled={sending}>
          {sending ? 'Sending…' : `Refer to ${referralType === 'er' ? 'Emergency Dept' : 'GP'}`}
        </button>
      </div>
    </Modal>
  )
}

// ── Upgrade to live consultation modal ────────────────────────────────────────
// Changes a message consultation to video/phone, notifies patient to rejoin.

export function UpgradeModal({ open, onClose, consult, onDone }) {
  const [consultationType, setConsultationType] = useState('video')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!open) { setConsultationType('video'); setMessage(''); setResult(null) }
  }, [open])

  async function handleSubmit() {
    setSending(true)
    setResult(null)
    try {
      const res = await apiFetch('/api/async-consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upgrade_to_live',
          consultationId: consult?.id,
          consultationType,
          message: message.trim() || undefined,
          providerId: sessionStorage.getItem('providerId'),
          providerName: sessionStorage.getItem('providerDisplayName'),
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setResult({ ok: true })
        onDone({ type: 'upgrade', consultationType })
        setTimeout(() => { setResult(null); onClose() }, 2000)
      } else {
        setResult({ ok: false, error: data.error })
      }
    } catch (e) {
      setResult({ ok: false, error: e.message })
    } finally {
      setSending(false)
    }
  }

  const FF = 'Plus Jakarta Sans, sans-serif'
  return (
    <Modal open={open} onClose={onClose} title="📹 Patient needs to be seen">
      <div style={{ marginBottom: '1.25rem' }}>
        <label style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '.5rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Consultation type</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
          <button onClick={() => setConsultationType('video')}
            style={{ padding: '14px 10px', borderRadius: 10, border: `2px solid ${consultationType === 'video' ? '#0B6E76' : '#E2E8F0'}`, background: consultationType === 'video' ? '#EFF9F9' : 'white', color: consultationType === 'video' ? '#0B6E76' : '#6B7280', fontWeight: 700, fontSize: '.875rem', cursor: 'pointer', fontFamily: FF }}>
            📹 Video call
          </button>
          <button onClick={() => setConsultationType('phone')}
            style={{ padding: '14px 10px', borderRadius: 10, border: `2px solid ${consultationType === 'phone' ? '#7C3AED' : '#E2E8F0'}`, background: consultationType === 'phone' ? '#F5F3FF' : 'white', color: consultationType === 'phone' ? '#7C3AED' : '#6B7280', fontWeight: 700, fontSize: '.875rem', cursor: 'pointer', fontFamily: FF }}>
            📞 Phone call
          </button>
        </div>
      </div>
      <div className="form-group">
        <label>Message to patient <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
          placeholder="e.g. I'd like to discuss your symptoms in more detail over a video call…"
          style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--border)', borderRadius: 8, padding: '.75rem', fontFamily: FF, fontSize: '.875rem', resize: 'vertical', outline: 'none' }} />
      </div>
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '.875rem', fontSize: '.8125rem', color: '#1D4ED8', marginBottom: '1rem' }}>
        📧 The patient will receive an email and SMS asking them to return for a live {consultationType === 'phone' ? 'phone' : 'video'} call. The consultation will re-appear in your queue.
      </div>
      {result && (
        <div className={`alert ${result.ok ? 'alert-success' : 'alert-danger'}`} style={{ marginBottom: '1rem' }}>
          {result.ok ? '✓ Patient notified — consultation moved to live queue' : `Error: ${result.error}`}
        </div>
      )}
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSubmit} disabled={sending}>
          {sending ? 'Sending…' : `Request ${consultationType === 'phone' ? 'phone' : 'video'} call`}
        </button>
      </div>
    </Modal>
  )
}
