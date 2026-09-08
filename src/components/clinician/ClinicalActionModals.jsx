import React, { useState, useEffect } from 'react'
import HpiSearch from '../HpiSearch'
import { apiFetch } from '../../lib/api'
import { updateConsultation } from '../../lib/supabase'
import { RHCNZ_REGIONS, autoSelectRegion } from '../../lib/rhcnzRegions'
import { isNZ } from '../../lib/region'

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

// PrescribeModal consolidated into ConsultModals (2026-09-08). The version
// that used to live here duplicated features and drifted — ConsultModals
// has structured fields, NZF autocomplete, ADULT_DRUG_PRESETS, ⭐ favourites,
// and now the allergen check + Medsafe picker that used to live here.
export { PrescribeModal } from './ConsultModals'


export function XrayModal({ open, onClose, consult, onDone }) {
  const [xr, setXr] = useState({ investigation:'X-ray', bodyPart:'', indication:'', urgency:'Urgent (within 24 hours)', history:'' })
  const [facility, setFacility] = useState({ name:'', hpiId:'', email:'', phone:'', address:'' })
  const [rhcnzRegionId, setRhcnzRegionId] = useState('')
  const [rhcnzAutoReason, setRhcnzAutoReason] = useState(null) // "postcode 8011" / "nearest clinic (2.3 km)" / null
  const [regionTouchedByUser, setRegionTouchedByUser] = useState(false)
  const [extra, setExtra] = useState({
    cscNumber: '', phoneHome: '', phoneMobile: consult?.patient_phone || '',
    otherFunding: '', dateOfInjury: '', copyToDoctor: '',
    preferredName: '', address: consult?.patient_address || '', gender: consult?.patient_gender || '',
  })
  const [showExtra, setShowExtra] = useState(false)

  // Look up the patient-chosen pharmacy's postcode from the Medsafe register.
  // Pharmacy pick beats home postcode for RHCNZ region routing because it
  // reflects where the patient can PHYSICALLY collect the script today —
  // a traveller consulting from Christchurch will pick a Chch pharmacy
  // even if their home postcode is Wellington. Imaging needs to happen
  // near where they are, not where they're from (Patrick call, 2026-09-08).
  const [pharmacyAddress, setPharmacyAddress] = useState('')
  useEffect(() => {
    if (!consult?.pharmacy_id) { setPharmacyAddress(''); return }
    ;(async () => {
      try {
        const res = await fetch('/pharmacies.json')
        if (!res.ok) return
        const list = await res.json()
        const p = Array.isArray(list) ? list.find(x => x.id === consult.pharmacy_id) : null
        if (p) setPharmacyAddress([p.address, p.town, p.postcode].filter(Boolean).join(' '))
      } catch {}
    })()
  }, [consult?.pharmacy_id])

  // Auto-select the RHCNZ region. Priority (see rhcnzRegions.js):
  //   1. patient GPS coords (if we have them + clinic lat/lng data)
  //   2. pharmacy postcode (revealed real-time location — beats home)
  //   3. patient home postcode (fallback)
  // Never overwrites a manual pick.
  useEffect(() => {
    if (regionTouchedByUser) return
    const match = autoSelectRegion({
      patientAddress: extra.address,
      patientCoords: consult?.patient_lat && consult?.patient_lng
        ? { lat: consult.patient_lat, lng: consult.patient_lng }
        : null,
      pharmacyAddress,
    })
    if (match) {
      setRhcnzRegionId(match.regionId)
      setRhcnzAutoReason(match.reason)
    } else {
      setRhcnzAutoReason(null)
    }
  }, [extra.address, consult?.patient_lat, consult?.patient_lng, pharmacyAddress, regionTouchedByUser])
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const accNum = consult?.acc_claim_number || ''
  const canRefer = sessionStorage.getItem('providerCanRefer') !== 'false'
  const isRhcnz = !!rhcnzRegionId

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
          providerMcnz: sessionStorage.getItem('providerMcnz'),
          providerPhone: sessionStorage.getItem('providerPhone'),
          patientName: `${consult?.patient_first_name || ''} ${consult?.patient_last_name || ''}`.trim(),
          patientPreferredName: extra.preferredName || null,
          patientNhi: consult?.patient_nhi,
          patientDob: consult?.patient_dob,
          patientGender: extra.gender || null,
          patientEmail: consult?.patient_email,
          patientAddress: extra.address || null,
          patientPhoneHome: extra.phoneHome || null,
          patientPhoneMobile: extra.phoneMobile || null,
          cscNumber: extra.cscNumber || null,
          otherFundingPathway: extra.otherFunding || null,
          dateOfInjury: extra.dateOfInjury || null,
          copyToDoctor: extra.copyToDoctor || null,
          investigation: xr.investigation,
          bodyPart: xr.bodyPart,
          clinicalIndication: xr.indication,
          urgency: xr.urgency,
          history: xr.history,
          accClaimNumber: accNum,
          rhcnzRegionId: rhcnzRegionId || null,
          facilityName: isRhcnz ? null : facility.name,
          facilityHpiId: isRhcnz ? null : facility.hpiId,
          facilityEmail: isRhcnz ? null : facility.email,
          facilityPhone: isRhcnz ? null : facility.phone,
          facilityAddress: isRhcnz ? null : facility.address,
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
              <option>X-ray</option><option>Ultrasound</option>
            </select>
            {/* MRI and CT intentionally excluded — telehealth scope. If the
                patient needs cross-sectional imaging, refer to specialist or
                ED for onward ordering. */}
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
          {isNZ() && accNum && <div className="form-group">
            <label>ACC claim</label>
            <input value={accNum} readOnly style={{background:'var(--bg)',color:'var(--success)'}} />
          </div>}
        </div>
        {/* RHCNZ = Rural Health Coalition NZ, our NZ radiology partner
            (ARG / Bay / Pacific). Hidden on AU beta — AU has its own
            private radiology directory that isn't wired yet. */}
        {isNZ() && (
        <div className="form-group">
          <label>Send to RHCNZ (recommended)</label>
          <select value={rhcnzRegionId} onChange={e => { setRhcnzRegionId(e.target.value); setRegionTouchedByUser(true); setRhcnzAutoReason(null) }}>
            <option value="">— Other facility (free-text below) —</option>
            {RHCNZ_REGIONS.map(r => (
              <option key={r.id} value={r.id}>{r.brand} — {r.region}</option>
            ))}
          </select>
          {isRhcnz && rhcnzAutoReason && (
            <div style={{fontSize:'.7rem',color:'var(--muted)',marginTop:4,fontStyle:'italic'}}>
              Auto-selected from {rhcnzAutoReason} — pick a different region above if you'd rather.
            </div>
          )}
          {isRhcnz && (
            <div style={{background:'#F0FDFA',border:'1px solid #99F6E4',borderRadius:8,padding:'.5rem .75rem',marginTop:6,fontSize:'.75rem',color:'#0F766E',lineHeight:1.5}}>
              📧 Referral will be sent (urgent) to <strong>{RHCNZ_REGIONS.find(r => r.id === rhcnzRegionId)?.email}</strong>. RHCNZ will contact the patient to book.
            </div>
          )}
        </div>
        )}

        {!isRhcnz && (
          <>
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
          </>
        )}

        {/* Additional patient/funding details — RHCNZ template asks for these */}
        <div className="form-group">
          <button type="button" onClick={() => setShowExtra(v => !v)}
            style={{background:'none',border:'none',padding:0,color:'var(--teal)',fontWeight:600,cursor:'pointer',fontFamily:'inherit',fontSize:'.8125rem'}}>
            {showExtra ? '▾' : '▸'} Additional patient / referral details {isRhcnz ? '(RHCNZ recommended)' : '(optional)'}
          </button>
        </div>
        {showExtra && (
          <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,padding:'.75rem',marginBottom:'1rem'}}>
            <div className="form-row">
              <div className="form-group">
                <label>Preferred name</label>
                <input value={extra.preferredName} onChange={e=>setExtra(x=>({...x,preferredName:e.target.value}))} />
              </div>
              <div className="form-group">
                <label>Gender</label>
                <input value={extra.gender} onChange={e=>setExtra(x=>({...x,gender:e.target.value}))} placeholder="M / F / Other" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Phone (mobile)</label>
                <input value={extra.phoneMobile} onChange={e=>setExtra(x=>({...x,phoneMobile:e.target.value}))} />
              </div>
              <div className="form-group">
                <label>Phone (home)</label>
                <input value={extra.phoneHome} onChange={e=>setExtra(x=>({...x,phoneHome:e.target.value}))} />
              </div>
            </div>
            <div className="form-group">
              <label>Address</label>
              <input value={extra.address} onChange={e=>setExtra(x=>({...x,address:e.target.value}))} placeholder="Street, suburb, city, postcode" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>CSC number</label>
                <input value={extra.cscNumber} onChange={e=>setExtra(x=>({...x,cscNumber:e.target.value}))} placeholder="Community Services Card" />
              </div>
              {accNum && (
                <div className="form-group">
                  <label>Date of injury</label>
                  <input type="date" value={extra.dateOfInjury} onChange={e=>setExtra(x=>({...x,dateOfInjury:e.target.value}))} />
                </div>
              )}
            </div>
            <div className="form-group">
              <label>Other funding pathway <span style={{color:'var(--muted)',fontWeight:400}}>(e.g. Southern Cross)</span></label>
              <input value={extra.otherFunding} onChange={e=>setExtra(x=>({...x,otherFunding:e.target.value}))} />
            </div>
            <div className="form-group">
              <label>Additional report to <span style={{color:'var(--muted)',fontWeight:400}}>(copy to GP, name + address)</span></label>
              <input value={extra.copyToDoctor} onChange={e=>setExtra(x=>({...x,copyToDoctor:e.target.value}))} />
            </div>
          </div>
        )}
        {isNZ() && canRefer && (
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
        await updateConsultation(consult.id, {
          acc_approval_status: 'pending_approval',
          acc_draft: { ...acc, drafted_by: sessionStorage.getItem('providerDisplayName'), drafted_at: new Date().toISOString() },
        })
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

// MedCertModal — telehealth medical certificate for absence-from-work.
// Capped at 7 days per MCNZ Telehealth Standards guidance (anything longer
// requires a follow-up in-person assessment). Days off pushes certTo out
// from today; diagnosis is pre-filled from the extracted ICD-10-AM
// suggestion; the provider signs on a canvas which we cache in localStorage
// so they only draw it once per device.
//
// The generated cert is emailed directly to the patient via Resend (existing
// /api/generate-med-cert endpoint). We also stamp
// consultations.medical_certificate_issued = true so the notes page shows
// it as done.
export function MedCertModal({ open, onClose, consult, onDone }) {
  const [days, setDays] = useState(3)
  const [diagnosis, setDiagnosis] = useState('')
  const [restrictions, setRestrictions] = useState('')
  const [signatureUrl, setSignatureUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const canvasRef = React.useRef(null)
  const drawingRef = React.useRef(false)
  const providerId = sessionStorage.getItem('providerId') || 'default'
  const sigKey = `tere_provider_signature_${providerId}`

  useEffect(() => {
    if (!open || !consult) return
    const finalDiag = consult.notes_final?.icd10?.description
      || consult.diagnosis
      || consult.diagnosis_description
      || consult.chief_complaint
      || ''
    setDiagnosis(finalDiag)
    setDays(3)
    setRestrictions('')
    setError('')

    // Signature loading priority (best → worst):
    //   1. Provider profile signature_url (server-side, cross-device)
    //   2. localStorage cache (same-device fallback)
    //   3. Blank canvas (provider signs fresh)
    // Fetching the profile signature auto-populates the canvas so the
    // provider doesn't have to redraw on every cert. If the profile has
    // no signature yet, we fall back to the cached one; if there's
    // neither, the canvas stays blank and the provider signs.
    async function loadSignature() {
      try {
        // Try profile first
        const res = await apiFetch(`/api/providers?id=${encodeURIComponent(providerId)}&columns=signature_url`)
        if (res.ok) {
          const { provider } = await res.json()
          if (provider?.signature_url) {
            setSignatureUrl(provider.signature_url)
            setTimeout(() => {
              const c = canvasRef.current
              if (!c) return
              const ctx = c.getContext('2d')
              const img = new Image()
              img.crossOrigin = 'anonymous'
              img.onload = () => { ctx.drawImage(img, 0, 0, c.width, c.height) }
              img.src = provider.signature_url
            }, 50)
            return
          }
        }
      } catch {}
      // Fallback to localStorage
      try {
        const cached = localStorage.getItem(sigKey)
        if (cached) {
          setSignatureUrl(cached)
          setTimeout(() => {
            const c = canvasRef.current
            if (!c) return
            const ctx = c.getContext('2d')
            const img = new Image()
            img.onload = () => { ctx.drawImage(img, 0, 0, c.width, c.height) }
            img.src = cached
          }, 50)
        }
      } catch {}
    }
    loadSignature()
  }, [open, consult, sigKey, providerId])

  function pointerXY(e) {
    const c = canvasRef.current
    const rect = c.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return { x: (clientX - rect.left) * (c.width / rect.width), y: (clientY - rect.top) * (c.height / rect.height) }
  }
  function beginStroke(e) {
    e.preventDefault()
    drawingRef.current = true
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    const { x, y } = pointerXY(e)
    ctx.strokeStyle = '#0D2B45'
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  function continueStroke(e) {
    if (!drawingRef.current) return
    e.preventDefault()
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    const { x, y } = pointerXY(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  function endStroke() {
    if (!drawingRef.current) return
    drawingRef.current = false
    const c = canvasRef.current
    const dataUrl = c.toDataURL('image/png')
    setSignatureUrl(dataUrl)
    try { localStorage.setItem(sigKey, dataUrl) } catch {}
  }
  function clearSignature() {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    setSignatureUrl('')
    try { localStorage.removeItem(sigKey) } catch {}
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (saving) return
    setError('')
    if (!diagnosis.trim()) { setError('Diagnosis is required.'); return }
    if (!signatureUrl) { setError('Please sign in the box before sending.'); return }
    if (days < 1 || days > 7) { setError('Days off must be between 1 and 7.'); return }
    setSaving(true)
    try {
      const today = new Date()
      const certTo = new Date(today)
      certTo.setDate(certTo.getDate() + (days - 1))
      const providerName = sessionStorage.getItem('providerDisplayName') || 'Tere Health clinician'
      const providerReg  = sessionStorage.getItem('providerCpn') || sessionStorage.getItem('prescriberNumber') || ''
      const res = await apiFetch('/api/generate-med-cert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultationId: consult.id,
          patientName:    `${consult.patient_first_name || ''} ${consult.patient_last_name || ''}`.trim(),
          patientDob:     consult.patient_dob,
          patientEmail:   consult.patient_email,
          patientNhi:     consult.patient_nhi,
          employer:       consult.acc_employer || consult.employer || '',
          consultationDate: consult.created_at,
          providerName,
          providerReg,
          workCapacity:   'unfit',
          certFrom:       today.toISOString(),
          certTo:         certTo.toISOString(),
          restrictions:   restrictions.trim() || null,
          diagnosis:      diagnosis.trim(),
          providerSignature: signatureUrl,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      onDone && onDone({ days, diagnosis })
      onClose()
    } catch (e) {
      setError(e.message || 'Failed to send certificate')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="📄 Medical certificate">
      <div style={{background:'#FEF3C7',border:'1px solid #D97706',borderRadius:8,padding:'.625rem .875rem',marginBottom:'1rem',fontSize:'.8125rem',color:'#92400E',lineHeight:1.5}}>
        <strong>Telehealth cert limit:</strong> Maximum 7 days off work per MCNZ Telehealth Standards. For longer absences the patient must be seen in person.
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label style={{fontSize:'.75rem',fontWeight:600,color:'var(--muted)',display:'block',marginBottom:'.375rem'}}>Days off work</label>
          <div style={{display:'flex',gap:6}}>
            {[1,2,3,4,5,6,7].map(n => (
              <button type="button" key={n} onClick={() => setDays(n)}
                style={{ flex:1, minHeight:44, borderRadius:8,
                  border:`2px solid ${days === n ? '#0B6E76' : '#E2E8F0'}`,
                  background: days === n ? '#E6F5F6' : 'white',
                  color: days === n ? '#0B6E76' : '#374151',
                  fontFamily:'Plus Jakarta Sans, sans-serif', fontWeight:700, fontSize:'1rem', cursor:'pointer' }}>
                {n}
              </button>
            ))}
          </div>
          <div style={{fontSize:'.75rem',color:'var(--muted)',marginTop:6}}>
            From {new Date().toLocaleDateString('en-NZ',{day:'numeric',month:'short'})} to {(() => { const d = new Date(); d.setDate(d.getDate() + days - 1); return d.toLocaleDateString('en-NZ',{day:'numeric',month:'short'}) })()}
          </div>
        </div>

        <div className="form-group">
          <label style={{fontSize:'.75rem',fontWeight:600,color:'var(--muted)',display:'block',marginBottom:'.25rem'}}>Diagnosis (visible on certificate)</label>
          <input type="text" value={diagnosis} onChange={e => setDiagnosis(e.target.value)}
            placeholder="e.g. Gastroenteritis and colitis of unspecified origin"
            style={{width:'100%',padding:'.5rem .75rem',border:'1.5px solid var(--border)',borderRadius:8,fontFamily:'Plus Jakarta Sans, sans-serif',fontSize:'.875rem'}} />
        </div>

        <div className="form-group">
          <label style={{fontSize:'.75rem',fontWeight:600,color:'var(--muted)',display:'block',marginBottom:'.25rem'}}>Restrictions / notes for employer (optional)</label>
          <textarea value={restrictions} onChange={e => setRestrictions(e.target.value)}
            placeholder="e.g. no lifting >5kg, no prolonged standing"
            rows={2}
            style={{width:'100%',padding:'.5rem .75rem',border:'1.5px solid var(--border)',borderRadius:8,fontFamily:'Plus Jakarta Sans, sans-serif',fontSize:'.875rem',resize:'vertical'}} />
        </div>

        <div className="form-group">
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'.25rem'}}>
            <label style={{fontSize:'.75rem',fontWeight:600,color:'var(--muted)'}}>Provider signature</label>
            <button type="button" onClick={clearSignature}
              style={{background:'none',border:'none',color:'#DC2626',fontSize:'.75rem',fontWeight:600,cursor:'pointer',padding:0}}>
              Clear
            </button>
          </div>
          <div style={{border:'1.5px solid var(--border)',borderRadius:8,background:'#FAFAFA',overflow:'hidden'}}>
            <canvas
              ref={canvasRef}
              width={520} height={110}
              style={{width:'100%',height:110,touchAction:'none',cursor:'crosshair',display:'block'}}
              onMouseDown={beginStroke} onMouseMove={continueStroke} onMouseUp={endStroke} onMouseLeave={endStroke}
              onTouchStart={beginStroke} onTouchMove={continueStroke} onTouchEnd={endStroke}
            />
          </div>
          <div style={{fontSize:'.6875rem',color:'var(--muted)',marginTop:4}}>
            {signatureUrl ? 'Signature saved on this device — you won\'t need to redraw it.' : 'Sign with mouse or finger — cached in your browser after the first cert.'}
          </div>
        </div>

        {error && (
          <div className="alert alert-danger" style={{fontSize:'.8125rem',marginBottom:'.75rem'}}>{error}</div>
        )}

        <div style={{display:'flex',gap:8,marginTop:'1rem'}}>
          <button type="button" onClick={onClose}
            style={{flex:1,minHeight:44,borderRadius:10,border:'1.5px solid #E2E8F0',background:'white',color:'#0D2B45',fontFamily:'Plus Jakarta Sans, sans-serif',fontWeight:700,cursor:'pointer'}}>
            Cancel
          </button>
          <button type="submit" disabled={saving}
            style={{flex:2,minHeight:44,borderRadius:10,border:'none',background:'#0B6E76',color:'white',fontFamily:'Plus Jakarta Sans, sans-serif',fontWeight:700,cursor:saving?'wait':'pointer',opacity:saving?0.6:1}}>
            {saving ? 'Sending…' : `📧 Email certificate to ${consult?.patient_first_name || 'patient'}`}
          </button>
        </div>
      </form>
    </Modal>
  )
}
