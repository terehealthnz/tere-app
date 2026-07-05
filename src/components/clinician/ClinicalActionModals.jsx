import React, { useState, useEffect } from 'react'
import HpiSearch from '../HpiSearch'
import { apiFetch } from '../../lib/api'

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

export const PAED_DRUGS = {
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

export function PrescribeModal({ open, onClose, consult, onDone }) {
  const [rx, setRx] = useState({ drug:'', dose:'', directions:'', qty:'', repeats:0 })
  const [pharmacy, setPharmacy] = useState({ name:'', hpiId:'', email:'', fax:'', phone:'', address:'', medsafeId:'' })
  // Delivery channel — fax is the default because it has near-universal pharmacy
  // acceptance and NZ pharmacies universally monitor their fax during trading hours,
  // whereas dispensary emails aren't consistently checked in real time.
  const [deliveryChannel, setDeliveryChannel] = useState('fax')
  // Medsafe pharmacy picker state — lets the provider change from the patient's
  // triage selection. Same register (/pharmacies.json) as the patient picker.
  const [medsafeList, setMedsafeList] = useState(null)
  const [showPharmacyPicker, setShowPharmacyPicker] = useState(false)
  const [pharmacyQuery, setPharmacyQuery] = useState('')

  // Pre-fill from the patient's triage selection when the modal opens, plus any
  // crowdsourced contact details already recorded against this pharmacy_id.
  useEffect(() => {
    if (!open || !consult) return
    const medsafeId = consult.pharmacy_id || ''
    setPharmacy(p => ({
      ...p,
      name: p.name || consult.pharmacy || '',
      fax: p.fax || consult.pharmacy_fax || '',
      medsafeId: p.medsafeId || medsafeId,
    }))
    // If a pharmacy_id exists, look up crowd-sourced fax/email/phone.
    if (!medsafeId) return
    ;(async () => {
      try {
        const { supabase } = await import('../../lib/supabase')
        const { data } = await supabase.from('pharmacy_contacts')
          .select('fax,dispensary_email,phone,hpi_id')
          .eq('pharmacy_id', medsafeId).maybeSingle()
        if (data) {
          setPharmacy(p => ({
            ...p,
            fax:   p.fax   || data.fax || '',
            email: p.email || data.dispensary_email || '',
            phone: p.phone || data.phone || '',
            hpiId: p.hpiId || data.hpi_id || '',
          }))
        }
      } catch {}
    })()
  }, [open, consult])

  // Lazy-load the register once when the picker is opened.
  useEffect(() => {
    if (!showPharmacyPicker || medsafeList !== null) return
    fetch('/pharmacies.json')
      .then(r => r.ok ? r.json() : [])
      .then(list => setMedsafeList(Array.isArray(list) ? list : []))
      .catch(() => setMedsafeList([]))
  }, [showPharmacyPicker, medsafeList])

  const filteredPharmacies = (() => {
    if (!medsafeList) return []
    const q = pharmacyQuery.trim().toLowerCase()
    if (q.length < 2) return []
    const nameHits = [], otherHits = []
    for (const p of medsafeList) {
      const name    = (p.premises_name || '').toLowerCase()
      const address = (p.address       || '').toLowerCase()
      const town    = (p.town          || '').toLowerCase()
      const region  = (p.region        || '').toLowerCase()
      if (name.includes(q)) nameHits.push(p)
      else if (address.includes(q) || town.includes(q) || region.includes(q)) otherHits.push(p)
      if (nameHits.length + otherHits.length >= 40) break
    }
    return [...nameHits, ...otherHits].slice(0, 8)
  })()

  async function pickPharmacy(p) {
    // Update local state — clear the HPI-derived delivery fields since the Medsafe
    // register doesn't carry email/phone. Provider fills those below if needed.
    setPharmacy({
      name: p.premises_name || '',
      medsafeId: p.id || '',
      hpiId: '',
      email: '',
      phone: '',
      address: p.address || '',
    })
    setShowPharmacyPicker(false)
    setPharmacyQuery('')
    // Persist the change on the consultation row so downstream steps (prescription
    // PDF, patient email, provider notes) all agree on which pharmacy is being used.
    if (consult?.id) {
      try {
        const { supabase } = await import('../../lib/supabase')
        await supabase.from('consultations').update({
          pharmacy: p.premises_name || null,
          pharmacy_id: p.id || null,
        }).eq('id', consult.id)
      } catch {}
    }
  }
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
          pharmacyId: pharmacy.medsafeId,
          pharmacyName: pharmacy.name,
          pharmacyHpiId: pharmacy.hpiId,
          pharmacyEmail: pharmacy.email,
          pharmacyFax: pharmacy.fax,
          pharmacyPhone: pharmacy.phone,
          pharmacyAddress: pharmacy.address,
          deliveryChannel,
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
          <label style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
            <span>Pharmacy</span>
            {pharmacy.name && !showPharmacyPicker && (
              <button type="button" onClick={() => setShowPharmacyPicker(true)}
                style={{background:'none',border:'none',color:'var(--teal)',fontSize:'.75rem',fontWeight:600,cursor:'pointer',padding:0}}>
                Change pharmacy →
              </button>
            )}
          </label>
          {/* Patient's selection banner — shown when we have a pre-filled name and
              the picker isn't open. Nothing renders on a fresh consultation with no
              pharmacy chosen; provider just uses the register picker below. */}
          {pharmacy.name && !showPharmacyPicker ? (
            <div style={{border:'1.5px solid var(--border)',borderRadius:8,padding:'.5rem .75rem',background:'#F8FAFC'}}>
              <div style={{fontSize:'.875rem',fontWeight:600,color:'#111827'}}>{pharmacy.name}</div>
              {pharmacy.address && <div style={{fontSize:'.75rem',color:'var(--muted)',marginTop:2}}>{pharmacy.address}</div>}
              {pharmacy.medsafeId && <div style={{fontSize:'.6875rem',color:'var(--muted)',marginTop:2}}>Medsafe ID: {pharmacy.medsafeId}</div>}
            </div>
          ) : (
            <>
              {/* Medsafe register picker — same list as the triage patient picker */}
              <div style={{position:'relative'}}>
                <input
                  value={pharmacyQuery}
                  onChange={e => { setPharmacyQuery(e.target.value); setShowPharmacyPicker(true) }}
                  onFocus={() => setShowPharmacyPicker(true)}
                  placeholder="Search Medsafe register — pharmacy name, town, region…"
                  style={{width:'100%',padding:'.5rem .75rem',border:'1.5px solid var(--border)',borderRadius:8,fontFamily:'Plus Jakarta Sans, sans-serif',fontSize:'.875rem',outline:'none',boxSizing:'border-box'}}
                />
                {filteredPharmacies.length > 0 && (
                  <div style={{position:'absolute',top:'100%',left:0,right:0,background:'white',border:'1.5px solid var(--border)',borderRadius:8,marginTop:2,zIndex:20,overflow:'hidden',boxShadow:'0 4px 12px rgba(0,0,0,.1)',maxHeight:280,overflowY:'auto'}}>
                    {filteredPharmacies.map((p, idx) => (
                      <button type="button" key={p.id || idx} onClick={() => pickPharmacy(p)}
                        style={{display:'block',width:'100%',textAlign:'left',padding:'9px 12px',background:'none',border:'none',fontFamily:'Plus Jakarta Sans, sans-serif',cursor:'pointer',borderBottom:idx<filteredPharmacies.length-1?'1px solid #F3F4F6':'none'}}
                        onMouseEnter={e=>e.currentTarget.style.background='#F0F9FA'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                        <div style={{fontSize:'.875rem',fontWeight:600,color:'#111827'}}>{p.premises_name}</div>
                        {(p.town || p.region) && (
                          <div style={{fontSize:'.75rem',color:'#6B7280',marginTop:1}}>{[p.town, p.region].filter(Boolean).join(' · ')}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{fontSize:'.7rem',color:'var(--muted)',marginTop:4}}>
                Or use HPI directory lookup:
              </div>
              <HpiSearch
                type="pharmacy"
                value={pharmacy.name}
                onSelect={r => setPharmacy({ name:r.name, hpiId:r.hpiId, email:r.email, phone:r.phone, address:r.address, medsafeId:'' })}
                placeholder="Search HPI directory…"
              />
              {pharmacy.address && <div style={{fontSize:'.75rem',color:'var(--muted)',marginTop:'3px'}}>{pharmacy.address}</div>}
            </>
          )}
        </div>
        {pharmacy.name && (
          <div className="form-group">
            <label>Delivery</label>
            <div style={{display:'flex',gap:6,marginBottom:8}}>
              {[
                { key:'fax',   label:'Fax',   disabled:!pharmacy.fax },
                { key:'email', label:'Email', disabled:!pharmacy.email },
                { key:'both',  label:'Both',  disabled:!pharmacy.fax || !pharmacy.email },
              ].map(opt => (
                <button type="button" key={opt.key}
                  onClick={() => setDeliveryChannel(opt.key)}
                  disabled={opt.disabled}
                  style={{
                    flex:1, padding:'6px 10px', borderRadius:8, cursor:opt.disabled?'not-allowed':'pointer',
                    background: deliveryChannel === opt.key ? 'var(--teal)' : 'white',
                    color:      deliveryChannel === opt.key ? 'white' : opt.disabled ? '#9CA3AF' : '#374151',
                    border:`1.5px solid ${deliveryChannel === opt.key ? 'var(--teal)' : '#E2E8F0'}`,
                    fontSize:'.8125rem', fontWeight:600, opacity:opt.disabled?.55:1,
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <div>
                <div style={{fontSize:'.7rem',color:'var(--muted)',marginBottom:3,fontWeight:600}}>Fax</div>
                <input value={pharmacy.fax} onChange={e=>setPharmacy(p=>({...p,fax:e.target.value}))}
                  placeholder="03 123 4567 or +64…"
                  style={{width:'100%',padding:'.4rem .6rem',border:'1.5px solid var(--border)',borderRadius:6,fontFamily:'Plus Jakarta Sans, sans-serif',fontSize:'.8125rem',outline:'none',boxSizing:'border-box'}}
                />
              </div>
              <div>
                <div style={{fontSize:'.7rem',color:'var(--muted)',marginBottom:3,fontWeight:600}}>Dispensary email</div>
                <input value={pharmacy.email} onChange={e=>setPharmacy(p=>({...p,email:e.target.value}))}
                  placeholder="dispensary@pharmacy.co.nz" type="email"
                  style={{width:'100%',padding:'.4rem .6rem',border:'1.5px solid var(--border)',borderRadius:6,fontFamily:'Plus Jakarta Sans, sans-serif',fontSize:'.8125rem',outline:'none',boxSizing:'border-box'}}
                />
              </div>
            </div>
            {!pharmacy.fax && !pharmacy.email && (
              <div style={{fontSize:'.7rem',color:'#B45309',marginTop:6}}>
                No fax or email on file — the prescription can still be generated as a PDF, but nothing will be delivered until a contact is added.
              </div>
            )}
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

export function ACCModal({ open, onClose, consult, onDone }) {
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
