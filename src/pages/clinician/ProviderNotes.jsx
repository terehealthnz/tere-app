import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { getConsultation } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'
import { PrescribeModal, XrayModal } from '../../components/clinician/ClinicalActionModals'

const FF   = 'Plus Jakarta Sans, sans-serif'
const TEAL = '#0B6E76'
const NAVY = '#0D2B45'
const GREEN = '#059669'

const ACC_READ_CODES = [
  { code:'S30', label:'Ankle sprain' },
  { code:'S39', label:'Other ankle injury' },
  { code:'M13', label:'Laceration' },
  { code:'M10', label:'Contusion / bruise' },
  { code:'N17', label:'UTI' },
  { code:'H05', label:'URTI' },
  { code:'H06', label:'Tonsillitis' },
  { code:'K22', label:'Chest pain' },
  { code:'A84', label:'Back pain' },
  { code:'S20', label:'Wrist sprain' },
  { code:'F29', label:'Eye injury' },
  { code:'S60', label:'Finger injury' },
  { code:'T14', label:'Burn' },
  { code:'A09', label:'Headache' },
  { code:'R05', label:'Cough' },
]

const OUTCOMES = [
  { value:'discharged',        label:'Discharged' },
  { value:'prescription_only', label:'Prescription only' },
  { value:'acc_lodged',        label:'ACC claim lodged' },
  { value:'referred_gp',       label:'Referred to GP' },
  { value:'referred_ed',       label:'Referred to ED' },
  { value:'follow_up',         label:'Follow-up arranged' },
  { value:'watchful_waiting',  label:'Watchful waiting' },
]

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

// Collapsible section — shows AI-generated text, tap to confirm
function NoteSection({ title, value, onChange, confirmed, onConfirm, loading }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ background:'white', borderRadius:14, border:`1.5px solid ${confirmed?'#BBF7D0':'#E2E8F0'}`, marginBottom:12, overflow:'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width:'100%', padding:'14px 16px', background:'none', border:'none', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', fontFamily:FF }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {confirmed
            ? <span style={{ width:22, height:22, borderRadius:'50%', background:GREEN, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span style={{ color:'white', fontSize:12, fontWeight:700 }}>✓</span>
              </span>
            : <span style={{ width:22, height:22, borderRadius:'50%', border:'2px solid #E2E8F0', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }} />
          }
          <span style={{ fontWeight:700, fontSize:'.9375rem', color:confirmed?GREEN:NAVY }}>{title}</span>
          {loading && <span style={{ fontSize:'.6875rem', color:'#9CA3AF' }}>Generating…</span>}
        </div>
        <span style={{ color:'#9CA3AF', fontSize:'.875rem' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ borderTop:'1px solid #F3F4F6' }}>
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            rows={5}
            style={{ width:'100%', boxSizing:'border-box', border:'none', padding:'12px 16px', fontFamily:FF, fontSize:'1rem', lineHeight:1.7, resize:'vertical', outline:'none', color:'#1A2A33', background:confirmed?'#F0FDF4':'white' }}
          />
          {!confirmed && (
            <div style={{ padding:'0 16px 14px' }}>
              <button
                onClick={onConfirm}
                style={{ width:'100%', minHeight:48, borderRadius:10, border:`1.5px solid ${GREEN}`, background:'#F0FDF4', color:GREEN, fontFamily:FF, fontWeight:700, fontSize:'.9375rem', cursor:'pointer' }}>
                ✓ Confirm section
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function buildNZNote(data, consult, actions) {
  const consultDate = consult?.created_at
    ? new Date(consult.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''
  const consultType = consult?.consultation_type || 'video'
  const typeLabel   = consultType === 'phone' ? 'Phone' : consultType === 'message' ? 'Written message' : 'Video'
  const billing     = data.billing?.serviceCode || ''
  const providerName = consult?.provider_display_name || sessionStorage.getItem('providerDisplayName') || 'Treating clinician'
  const isAcc       = consult?.acc_eligible === 'yes'

  const lines = []

  // ── Header ──────────────────────────────────────────────────────────────────
  lines.push(`TELEHEALTH CONSULTATION — ${typeLabel.toUpperCase()}`)
  lines.push(`Date: ${consultDate}  |  Provider: ${providerName}${billing ? `  |  Billing: ${billing}` : ''}`)
  lines.push('')

  // ── Subjective ───────────────────────────────────────────────────────────────
  lines.push('SUBJECTIVE')
  lines.push(`Presenting complaint: ${data.presentingHistory || consult?.chief_complaint || '—'}`)

  if (data.medicalHistory) {
    lines.push('')
    lines.push(`Past medical history: ${data.medicalHistory}`)
  }
  lines.push(`Current medications: ${consult?.medications || 'Nil regular medications'}`)
  lines.push(`Allergies: ${consult?.patient_allergies || 'NKDA'}`)

  // Social history
  const soc = data.social || {}
  const socialItems = []
  if (soc.occupation && soc.occupation !== 'Not disclosed') socialItems.push(`Occupation: ${soc.occupation}`)
  if (soc.tobacco    && soc.tobacco    !== 'Not disclosed') socialItems.push(`Smoking: ${soc.tobacco}`)
  if (soc.alcohol    && soc.alcohol    !== 'Not disclosed') socialItems.push(`Alcohol: ${soc.alcohol}`)
  if (socialItems.length) {
    lines.push('')
    lines.push('Social history:')
    socialItems.forEach(s => lines.push(s))
  }

  // ACC injury details
  if (isAcc) {
    lines.push('')
    lines.push('ACC injury details:')
    if (data.accSection?.mechanism || consult?.acc_injury_details) lines.push(`Mechanism: ${data.accSection?.mechanism || consult?.acc_injury_details}`)
    if (consult?.acc_injury_date) lines.push(`Date of injury: ${consult.acc_injury_date}`)
    if (consult?.acc_employer)    lines.push(`Employer: ${consult.acc_employer}`)
  }

  // ── Objective ────────────────────────────────────────────────────────────────
  lines.push('')
  lines.push('OBJECTIVE')
  lines.push('Examination (telehealth visual assessment):')
  if (data.generalAppearance) lines.push(data.generalAppearance)
  if (data.visibleFindings)   lines.push(data.visibleFindings)
  if (!data.generalAppearance && !data.visibleFindings) {
    lines.push('Full physical examination not possible via telehealth. Assessment based on history and visual observation.')
  }

  const vitals = consult?.vitals
  if (vitals && typeof vitals === 'object' && Object.values(vitals).some(Boolean)) {
    const vParts = []
    if (vitals.heart_rate)      vParts.push(`HR ${vitals.heart_rate}`)
    if (vitals.blood_pressure)  vParts.push(`BP ${vitals.blood_pressure}`)
    if (vitals.spo2)            vParts.push(`SpO₂ ${vitals.spo2}%`)
    if (vitals.respiratory_rate) vParts.push(`RR ${vitals.respiratory_rate}`)
    if (vitals.temperature)     vParts.push(`Temp ${vitals.temperature}°C`)
    if (vitals.gcs)             vParts.push(`GCS ${vitals.gcs}`)
    if (vParts.length) lines.push(`Vitals (captured via Tere vitals system): ${vParts.join(', ')}`)
  }

  // ── Assessment ───────────────────────────────────────────────────────────────
  lines.push('')
  lines.push('ASSESSMENT')
  if (data.icd10Label || data.icd10Code) lines.push(`Diagnosis: ${data.icd10Label || ''}${data.icd10Code ? ` (ICD-10: ${data.icd10Code})` : ''}`)
  if (isAcc && data.accSection?.readCodeSuggestion) lines.push(`ACC Read code: ${data.accSection.readCodeSuggestion}${data.accSection.readCodeLabel ? ` — ${data.accSection.readCodeLabel}` : ''}`)

  if (data.mdm) {
    lines.push('')
    lines.push('Clinical reasoning:')
    lines.push(data.mdm)
  }

  // Red flags
  if (data._redFlags?.flags?.length) {
    lines.push('')
    lines.push('⚠ Safety flags identified (review before finalising):')
    data._redFlags.flags.forEach(f => lines.push(`• [${f.severity?.toUpperCase()}] ${f.concern} — ${f.recommendation}`))
  }

  // ── Plan ─────────────────────────────────────────────────────────────────────
  lines.push('')
  lines.push('PLAN')
  const rxItems = actions.filter(a => a.type === 'prescription')
  const xrItems = actions.filter(a => a.type === 'radiology')
  let planNum = 1
  if (rxItems.length) {
    rxItems.forEach(rx => {
      lines.push(`${planNum++}. Prescription: ${rx.medication || rx.drug || rx.name || 'medication prescribed'}`)
    })
  }
  if (xrItems.length) {
    xrItems.forEach(xr => {
      lines.push(`${planNum++}. Radiology: ${xr.type_of_scan || xr.body_part || xr.name || 'imaging requested'}`)
    })
  }
  if (data.planItems?.length) {
    data.planItems.forEach(item => lines.push(`${planNum++}. ${item}`))
  } else if (data.plan) {
    lines.push(data.plan)
  }
  if (!rxItems.length && !xrItems.length && !data.planItems?.length && !data.plan) {
    lines.push('[Complete plan]')
  }

  if (data.returnPrecautions) {
    lines.push('')
    lines.push(`Return precautions: ${data.returnPrecautions}`)
  }

  // ── Compliance footer ────────────────────────────────────────────────────────
  lines.push('')
  lines.push('---')
  lines.push('Patient identity confirmed at consultation commencement per MCNZ telehealth guidelines (August 2023).')
  if (isAcc) lines.push('Three-part ACC45 consent (treatment, lodgement, collection of information) obtained at triage registration.')

  return lines.join('\n')
}

export default function ProviderNotes() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [consult, setConsult]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [generating, setGenerating] = useState(false)
  const [finalising, setFinalising] = useState(false)
  const [genError, setGenError]     = useState(null)

  const [noteText, setNoteText]           = useState('')
  const [noteConfirmed, setNoteConfirmed] = useState(false)
  const [modals, setModals]               = useState({ rx: false, xr: false })

  const [workCapacity, setWorkCapacity]   = useState('fit')
  const [dutyLevel, setDutyLevel]         = useState('')
  const [workLimitation, setWorkLimitation] = useState('')
  const [returnDate, setReturnDate]       = useState('')
  const [accReadCode, setAccReadCode]   = useState('')
  const [accMechanism, setAccMechanism] = useState('')
  const [accBodyPart, setAccBodyPart]   = useState('')
  const [outcome, setOutcome]           = useState('')
  const [actualMethod, setActualMethod] = useState(() => sessionStorage.getItem('consultationType') || 'video')
  const [attested, setAttested]         = useState(false)

  const actionsRef  = useRef([])
  const transcriptRef = useRef('')
  const draftKey = `tere_notes_draft_${id}`

  // Auth
  useEffect(() => {
    if (!sessionStorage.getItem('clinicianAuth')) {
      const saved = getSaved()
      if (saved) restoreDevice(saved)
      else { navigate('/clinician?redirect=/provider'); return }
    }
  }, [navigate])

  // Load + generate
  useEffect(() => {
    async function load() {
      try {
        const data = await getConsultation(id)
        setConsult(data)
        setActualMethod(data.consultation_type || sessionStorage.getItem('consultationType') || 'video')

        const rs = location.state
        actionsRef.current  = rs?.actions || data.notes_draft?.actions || []
        transcriptRef.current = rs?.transcript || data.transcript || ''

        // Restore local draft first
        const localDraft = localStorage.getItem(draftKey)
        if (localDraft) {
          try {
            const d = JSON.parse(localDraft)
            restoreDraft(d)
            setLoading(false)
            return
          } catch {}
        }

        // If already finalised, load from DB
        if (data.notes_finalised && data.notes_final) {
          try {
            const final = typeof data.notes_final === 'string' ? JSON.parse(data.notes_final) : data.notes_final
            restoreDraft(final)
            Object.keys(confirmed).forEach(k => setConfirmed(c => ({ ...c, [k]:true })))
          } catch {}
          setLoading(false)
          return
        }

        // If DB draft exists
        if (data.notes_draft && data.note_generated_at) {
          restoreDraft(data.notes_draft)
          setLoading(false)
          return
        }

        // Generate fresh
        setLoading(false)
        await runGenerate(data)
      } catch (e) { console.error(e); setLoading(false) }
    }
    load()
  }, [id])

  function restoreDraft(d) {
    if (d.noteText) {
      setNoteText(d.noteText)
    } else if (d.sections) {
      // backwards compat: combine old multi-section format into single note
      const s = d.sections
      const e = d.exam || {}
      const parts = []
      if (s.presentingHistory) parts.push(`PRESENTING HISTORY\n${s.presentingHistory}`)
      if (s.medicalHistory)    parts.push(`PAST MEDICAL HISTORY\n${s.medicalHistory}`)
      if (s.allergies)         parts.push(`ALLERGIES\n${s.allergies}`)
      if (s.socialHistory)     parts.push(`SOCIAL HISTORY\n${s.socialHistory}`)
      const examParts = []
      if (e.general) examParts.push(`General: ${e.general}`)
      if (e.vitals)  examParts.push(`Vitals: ${e.vitals}`)
      if (e.msk)     examParts.push(`MSK: ${e.msk}`)
      if (examParts.length) parts.push(`EXAMINATION\n${examParts.join('\n')}`)
      if (s.mdm)  parts.push(`CLINICAL REASONING\n${s.mdm}`)
      if (s.plan) parts.push(`PLAN\n${s.plan}`)
      if (parts.length) setNoteText(parts.join('\n\n'))
    }
    if (d.workCapacity)   setWorkCapacity(d.workCapacity)
    if (d.dutyLevel)      setDutyLevel(d.dutyLevel)
    if (d.workLimitation) setWorkLimitation(d.workLimitation)
    if (d.returnDate)     setReturnDate(d.returnDate)
    if (d.accReadCode)  setAccReadCode(d.accReadCode)
    if (d.accMechanism) setAccMechanism(d.accMechanism)
    if (d.accBodyPart)  setAccBodyPart(d.accBodyPart)
    if (d.outcome)      setOutcome(d.outcome)
  }

  async function runGenerate(consultData) {
    setGenerating(true)
    setGenError(null)
    try {
      const prescriptions = (actionsRef.current || []).filter(a => a.type === 'prescription')
      const referrals     = (actionsRef.current || []).filter(a => a.type === 'radiology')
      const body = {
        transcript: transcriptRef.current || '',
        triage: {
          patientName:    `${consultData.patient_first_name} ${consultData.patient_last_name}`,
          patientDob:     consultData.patient_dob,
          patientNhi:     consultData.patient_nhi,
          chiefComplaint: consultData.chief_complaint,
          medicalHistory: consultData.medical_history,
          medications:    consultData.medications,
          allergies:      consultData.patient_allergies,
          accEligible:    consultData.acc_eligible === 'yes',
          accInjuryDescription: consultData.acc_injury_details,
          accInjuryDate:  consultData.acc_injury_date,
          accEmployer:    consultData.acc_employer,
        },
        vitals:         consultData.vitals,
        prescriptions,
        referrals,
        providerName: sessionStorage.getItem('providerDisplayName') || '',
        consultationDate: consultData.created_at,
      }

      const res = await apiFetch('/api/generate-notes', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Generation failed')

      setNoteText(buildNZNote(data, consultData, actionsRef.current || []))
      if (data.accSection) {
        if (data.accSection.mechanism) setAccMechanism(data.accSection.mechanism)
        if (data.accSection.bodyPart)  setAccBodyPart(data.accSection.bodyPart)
      }
      if (data.suggestedReadCode) setAccReadCode(data.suggestedReadCode)
      if (data.workCapacity)      setWorkCapacity(data.workCapacity)

      const { supabase } = await import('../../lib/supabase')
      await supabase.from('consultations').update({ note_generated_at: new Date().toISOString() }).eq('id', id)
    } catch (e) {
      console.error(e)
      setGenError(e.message)
    }
    setGenerating(false)
  }

  // Auto-save draft to localStorage
  useEffect(() => {
    if (!id || !consult) return
    const draft = { noteText, workCapacity, dutyLevel, workLimitation, returnDate, accReadCode, accMechanism, accBodyPart, outcome }
    localStorage.setItem(draftKey, JSON.stringify(draft))
  }, [noteText, workCapacity, dutyLevel, workLimitation, returnDate, accReadCode, accMechanism, accBodyPart, outcome])

  const canFinalise = noteConfirmed && !!outcome && attested

  function addAction(action) {
    actionsRef.current = [...actionsRef.current, action]
    setNoteConfirmed(false)
    // Append action to note plan section so provider sees it
    const label = action.type === 'prescription'
      ? `Rx: ${action.drug}${action.directions ? ` — ${action.directions}` : ''}`
      : action.type === 'radiology'
      ? `${action.investigation}: ${action.bodyPart}${action.urgency ? ` (${action.urgency})` : ''}`
      : null
    if (label) setNoteText(t => t + `\n${label}`)
  }

  async function finalise() {
    if (!canFinalise) return
    setFinalising(true)
    try {
      const now = new Date().toISOString()
      const { supabase } = await import('../../lib/supabase')
      const providerName = sessionStorage.getItem('providerDisplayName') || ''
      const durationSec = consult.consultation_duration_seconds ||
        (consult.started_at ? Math.round((Date.now() - new Date(consult.started_at)) / 1000) : null)

      const finalNote = {
        noteText, workCapacity, dutyLevel, workLimitation, returnDate, accReadCode,
        accSection: { mechanism:accMechanism, bodyPart:accBodyPart },
        outcome, providerName, attestedAt: now,
        actions: actionsRef.current,
      }

      const METHOD_PRICES = { video: 6500, phone: 4500, message: 2500 }
      const chargeCents = isAcc ? 2500 : (METHOD_PRICES[actualMethod] || 6500)

      const { error: updateErr } = await supabase.from('consultations').update({
        notes_final:         JSON.stringify(finalNote),
        notes_draft:         null,
        notes_finalised:     true,
        notes_finalised_at:  now,
        note_finalised_by:   providerName,
        acc_read_code:       accReadCode,
        work_capacity:       workCapacity,
        return_to_work_date: workCapacity !== 'fit' && returnDate ? returnDate : null,
        billing_code:        durationSec >= 1800 ? 'CS2T' : 'CS1T',
        outcome,
        status:              'complete',
        completed_at:        consult.completed_at || now,
        consultation_duration_seconds: durationSec,
        consultation_type:   actualMethod,
        payment_amount:      chargeCents / 100,
        is_acc:              isAcc,
      }).eq('id', id)
      if (updateErr) throw updateErr

      // Capture payment for the method actually used
      const paymentIntentId = consult.payment_intent_id || sessionStorage.getItem('paymentIntentId')
      if (paymentIntentId) {
        apiFetch('/api/capture-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId, consultationId: id, amount_cents: chargeCents }),
        }).catch(() => {})
      }

      // Patient summary email
      if (consult.patient_email) {
        apiFetch('/api/send-email', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            to: consult.patient_email,
            name: `${consult.patient_first_name} ${consult.patient_last_name}`,
            noteText, notes:{}, actions: actionsRef.current,
            consult: { chief_complaint: consult.chief_complaint },
            consultationId: id,
          }),
        }).catch(() => {})
      }

      localStorage.removeItem(draftKey)
      navigate('/provider')
    } catch (e) { console.error(e); setFinalising(false) }
  }

  if (loading) return (
    <div style={{ height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F0F2F5' }}>
      <div style={{ width:36, height:36, border:'3px solid #D4EEF0', borderTopColor:TEAL, borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (!consult) return (
    <div style={{ height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:FF }}>
      <button onClick={() => navigate('/provider')} style={{ background:TEAL, color:'white', border:'none', padding:'12px 24px', borderRadius:10, fontFamily:FF, cursor:'pointer' }}>← Back to queue</button>
    </div>
  )

  const isAcc = consult.acc_eligible === 'yes'
  const isFinalised = !!consult.notes_finalised
  const patientName = `${consult.patient_first_name} ${consult.patient_last_name}`
  const providerName = sessionStorage.getItem('providerDisplayName') || 'Treating clinician'

  return (
    <div style={{ minHeight:'100dvh', background:'#F0F2F5', fontFamily:FF }}>

      {/* Generating overlay */}
      {generating && (
        <div style={{ position:'fixed', inset:0, background:'rgba(13,43,69,.9)', zIndex:999, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'1rem' }}>
          <div style={{ width:44, height:44, border:'4px solid rgba(255,255,255,.2)', borderTopColor:'#D4EEF0', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
          <div style={{ color:'white', fontSize:'1.125rem', fontWeight:700 }}>Tere Scribe generating notes…</div>
          <div style={{ color:'rgba(255,255,255,.5)', fontSize:'.875rem', textAlign:'center', maxWidth:320 }}>Analysing transcript and triage data<br />This takes about 20 seconds</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* Top bar */}
      <div style={{ background:NAVY, padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:10 }}>
        <button onClick={() => navigate('/provider')}
          style={{ background:'rgba(255,255,255,.1)', border:'none', color:'rgba(255,255,255,.7)', padding:'8px 14px', borderRadius:8, cursor:'pointer', fontFamily:FF, fontSize:'.875rem', minHeight:44 }}>
          ← Queue
        </button>
        <div style={{ textAlign:'center' }}>
          <div onClick={() => navigate('/clinician/dashboard')} style={{ fontFamily:'Cormorant Garamond, serif', fontStyle:'italic', color:'#D4EEF0', fontSize:'1.1rem', lineHeight:1, cursor:'pointer', userSelect:'none', transition:'opacity .15s' }} onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'} role="link" aria-label="Tere Health — go to dashboard">Tere</div>
          <div style={{ color:'rgba(255,255,255,.45)', fontSize:'.6875rem' }}>Clinical notes</div>
        </div>
        {isFinalised
          ? <span style={{ background:'#065F46', color:'#6EE7B7', fontSize:'.6875rem', fontWeight:700, padding:'4px 10px', borderRadius:99 }}>DONE</span>
          : <div style={{ width:72 }} />
        }
      </div>

      <div style={{ padding:'1rem', paddingBottom:24 }}>

        {/* Patient header */}
        <div style={{ background:'white', borderRadius:14, padding:'1.25rem', marginBottom:12, border:'1px solid #E2E8F0', borderTop:`4px solid ${TEAL}` }}>
          <h2 style={{ fontSize:'1.25rem', fontWeight:800, color:NAVY, margin:'0 0 4px' }}>{patientName}</h2>
          <div style={{ fontSize:'.8125rem', color:'#6B7280', marginBottom:10 }}>
            NHI: {consult.patient_nhi || '—'} · {new Date(consult.created_at).toLocaleDateString('en-NZ')}
          </div>
          <div style={{ background:'#F8FAFC', borderRadius:8, padding:'10px 12px', fontSize:'.9375rem', color:'#374151' }}>
            {consult.chief_complaint}
          </div>
          {genError && (
            <div style={{ marginTop:10, background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 12px', fontSize:'.8125rem', color:'#DC2626', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span>Generation failed</span>
              <button onClick={() => runGenerate(consult)}
                style={{ background:'#DC2626', color:'white', border:'none', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontFamily:FF, fontSize:'.75rem', fontWeight:700 }}>Retry</button>
            </div>
          )}
        </div>

        {/* Rx / XR actions */}
        <div style={{ background:'white', borderRadius:14, padding:'1rem 1.25rem', marginBottom:12, border:'1px solid #E2E8F0' }}>
          <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#9CA3AF', marginBottom:10 }}>Actions</div>
          <div style={{ display:'flex', gap:8, marginBottom: actionsRef.current.length ? 10 : 0 }}>
            {!isFinalised && (
              <>
                <button onClick={() => setModals(m => ({ ...m, rx: true }))}
                  style={{ flex:1, minHeight:44, borderRadius:10, border:'1.5px solid #E2E8F0', background:'white', color:NAVY, fontFamily:FF, fontSize:'.875rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  💊 Prescribe
                </button>
                <button onClick={() => setModals(m => ({ ...m, xr: true }))}
                  style={{ flex:1, minHeight:44, borderRadius:10, border:'1.5px solid #E2E8F0', background:'white', color:NAVY, fontFamily:FF, fontSize:'.875rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  🩻 Imaging
                </button>
              </>
            )}
          </div>
          {actionsRef.current.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {actionsRef.current.map((a, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, background: a.type==='prescription' ? '#EFF9F9' : '#F5F3FF', borderRadius:8, padding:'8px 12px', fontSize:'.8125rem' }}>
                  <span style={{ fontWeight:700, color: a.type==='prescription' ? TEAL : '#7C3AED' }}>
                    {a.type === 'prescription' ? 'Rx' : a.investigation || 'Xr'}
                  </span>
                  <span style={{ color:'#374151', flex:1 }}>
                    {a.type === 'prescription'
                      ? `${a.drug}${a.directions ? ` — ${a.directions}` : ''}${a.pending ? ' (pending approval)' : ''}`
                      : `${a.bodyPart}${a.urgency ? ` — ${a.urgency}` : ''}${a.pending ? ' (pending approval)' : ''}`}
                  </span>
                </div>
              ))}
            </div>
          )}
          {!isFinalised && actionsRef.current.length === 0 && (
            <div style={{ fontSize:'.8125rem', color:'#9CA3AF', fontStyle:'italic' }}>No prescriptions or imaging ordered yet</div>
          )}
        </div>

        {/* Single combined note */}
        <div style={{ background:'white', borderRadius:14, border:`1.5px solid ${noteConfirmed?'#BBF7D0':'#E2E8F0'}`, marginBottom:12, overflow:'hidden' }}>
          <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:10 }}>
            {noteConfirmed
              ? <span style={{ width:22, height:22, borderRadius:'50%', background:GREEN, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ color:'white', fontSize:12, fontWeight:700 }}>✓</span>
                </span>
              : <span style={{ width:22, height:22, borderRadius:'50%', border:'2px solid #E2E8F0', display:'inline-block', flexShrink:0 }} />
            }
            <span style={{ fontWeight:700, fontSize:'.9375rem', color:noteConfirmed?GREEN:NAVY }}>Clinical note</span>
            {generating && <span style={{ fontSize:'.6875rem', color:'#9CA3AF', marginLeft:4 }}>Generating…</span>}
          </div>
          <div style={{ borderTop:'1px solid #F3F4F6' }}>
            <textarea
              value={noteText}
              onChange={e => { setNoteText(e.target.value); setNoteConfirmed(false) }}
              readOnly={isFinalised}
              rows={22}
              style={{ width:'100%', boxSizing:'border-box', border:'none', padding:'12px 16px', fontFamily:FF, fontSize:'.9375rem', lineHeight:1.7, resize:'vertical', outline:'none', color:'#1A2A33', background:noteConfirmed?'#F0FDF4':isFinalised?'#F8FAFC':'white' }}
            />
            {!noteConfirmed && !isFinalised && (
              <div style={{ padding:'0 16px 14px' }}>
                <button
                  onClick={() => setNoteConfirmed(true)}
                  style={{ width:'100%', minHeight:48, borderRadius:10, border:`1.5px solid ${GREEN}`, background:'#F0FDF4', color:GREEN, fontFamily:FF, fontWeight:700, fontSize:'.9375rem', cursor:'pointer' }}>
                  ✓ Confirm note
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Work capacity */}
        <div style={{ background:'white', borderRadius:14, padding:'1.25rem', marginBottom:12, border:'1px solid #E2E8F0' }}>
          <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#9CA3AF', marginBottom:12 }}>Work capacity</div>
          <div style={{ display:'flex', gap:8 }}>
            {[
              { val:'fit',      label:'Fit',      color:GREEN,     bg:'#F0FDF4',  border:'#BBF7D0' },
              { val:'modified', label:'Modified', color:'#D97706', bg:'#FFFBEB', border:'#FDE68A' },
              { val:'unfit',    label:'Unfit',    color:'#DC2626', bg:'#FEF2F2', border:'#FECACA' },
            ].map(o => (
              <button key={o.val} onClick={() => !isFinalised && setWorkCapacity(o.val)}
                style={{ flex:1, minHeight:52, borderRadius:10, border:`1.5px solid ${workCapacity===o.val?o.border:'#E2E8F0'}`, background:workCapacity===o.val?o.bg:'white', color:workCapacity===o.val?o.color:'#9CA3AF', fontFamily:FF, fontSize:'.8125rem', fontWeight:700, cursor:isFinalised?'default':'pointer' }}>
                {o.label}
              </button>
            ))}
          </div>

          {workCapacity === 'modified' && (
            <div style={{ marginTop:12 }}>
              <label style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#D97706', display:'block', marginBottom:8 }}>Duty level</label>
              <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                {[
                  { val:'sedentary', label:'Sedentary' },
                  { val:'light',     label:'Light' },
                  { val:'moderate',  label:'Moderate' },
                ].map(o => (
                  <button key={o.val} onClick={() => !isFinalised && setDutyLevel(o.val)}
                    style={{ flex:1, minHeight:44, borderRadius:8, border:`1.5px solid ${dutyLevel===o.val?'#F59E0B':'#E2E8F0'}`, background:dutyLevel===o.val?'#FFFBEB':'white', color:dutyLevel===o.val?'#D97706':'#9CA3AF', fontFamily:FF, fontSize:'.8125rem', fontWeight:700, cursor:isFinalised?'default':'pointer' }}>
                    {o.label}
                  </button>
                ))}
              </div>
              <label style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#9CA3AF', display:'block', marginBottom:6 }}>Limitations / restrictions</label>
              <textarea
                value={workLimitation}
                onChange={e => setWorkLimitation(e.target.value)}
                readOnly={isFinalised}
                rows={3}
                placeholder="e.g. No lifting over 5kg, no prolonged standing, avoid repetitive bending…"
                style={{ width:'100%', boxSizing:'border-box', border:'1.5px solid #E2E8F0', borderRadius:8, padding:'10px 12px', fontFamily:FF, fontSize:'.9375rem', lineHeight:1.6, resize:'none', outline:'none', background:isFinalised?'#F8FAFC':'white' }}
              />
            </div>
          )}

          {workCapacity !== 'fit' && (
            <div style={{ marginTop:10 }}>
              <label style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#9CA3AF', display:'block', marginBottom:6 }}>Return to work date</label>
              <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} readOnly={isFinalised}
                style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontFamily:FF, fontSize:'1rem', outline:'none', background:isFinalised?'#F8FAFC':'white' }} />
            </div>
          )}
        </div>

        {/* ACC section */}
        {isAcc && (
          <div style={{ background:'#EFF6FF', borderRadius:14, padding:'1.25rem', marginBottom:12, border:'1px solid #BFDBFE' }}>
            <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#1D4ED8', marginBottom:12 }}>ACC section</div>

            {/* Read code */}
            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#3B82F6', display:'block', marginBottom:6 }}>Read code</label>
              <select
                value={accReadCode}
                onChange={e => setAccReadCode(e.target.value)}
                disabled={isFinalised}
                style={{ width:'100%', padding:'10px 12px', border:'1.5px solid #BFDBFE', borderRadius:8, fontFamily:FF, fontSize:'1rem', outline:'none', background:isFinalised?'#F0F6FF':'white', WebkitAppearance:'none', appearance:'none' }}>
                <option value="">Select Read code…</option>
                {ACC_READ_CODES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
              </select>
            </div>

            {[
              { key:'accMechanism', label:'Mechanism', val:accMechanism, set:setAccMechanism, placeholder:'How did the injury occur?' },
              { key:'accBodyPart',  label:'Body part',  val:accBodyPart,  set:setAccBodyPart,  placeholder:'e.g. Right lateral malleolus' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:10 }}>
                <label style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#3B82F6', display:'block', marginBottom:6 }}>{f.label}</label>
                <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} readOnly={isFinalised}
                  style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', border:'1.5px solid #BFDBFE', borderRadius:8, fontFamily:FF, fontSize:'1rem', outline:'none', background:isFinalised?'#F0F6FF':'white' }} />
              </div>
            ))}
            <div style={{ fontSize:'.8125rem', color:'#1D4ED8', fontWeight:600 }}>✓ Three-part ACC45 consent obtained at triage</div>
          </div>
        )}

        {/* Outcome */}
        <div style={{ background:'white', borderRadius:14, padding:'1.25rem', marginBottom:12, border:`1.5px solid ${!outcome&&!isFinalised?'#FDE68A':'#E2E8F0'}` }}>
          <label style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#9CA3AF', display:'block', marginBottom:10 }}>
            Consultation outcome <span style={{ color:'#DC2626' }}>*</span>
          </label>
          <select value={outcome} onChange={e => setOutcome(e.target.value)} disabled={isFinalised}
            style={{ width:'100%', padding:'12px', border:`1.5px solid ${!outcome?'#FDE68A':'#E2E8F0'}`, borderRadius:10, fontFamily:FF, fontSize:'1rem', color:outcome?'#1A2A33':'#9CA3AF', background:isFinalised?'#F8FAFC':'white', outline:'none', WebkitAppearance:'none', appearance:'none' }}>
            <option value="">Select outcome…</option>
            {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Method actually used — determines charge amount */}
        {!isFinalised && (
          <div style={{ background:'white', borderRadius:14, padding:'1.25rem', marginBottom:12, border:'1px solid #E2E8F0' }}>
            <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#9CA3AF', marginBottom:10 }}>
              Method used <span style={{ color:'#9CA3AF', fontWeight:400, textTransform:'none', letterSpacing:0 }}>— patient charged this amount</span>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {[
                { val:'video',   label:'Video',   price: isAcc ? 25 : 65 },
                { val:'phone',   label:'Phone',   price: isAcc ? 25 : 45 },
                { val:'message', label:'Message', price: 25 },
              ].map(o => (
                <button key={o.val} onClick={() => setActualMethod(o.val)}
                  style={{ flex:1, minHeight:52, borderRadius:10, border:`1.5px solid ${actualMethod===o.val?TEAL:'#E2E8F0'}`, background:actualMethod===o.val?'#EFF9F9':'white', color:actualMethod===o.val?TEAL:'#9CA3AF', fontFamily:FF, fontSize:'.8125rem', fontWeight:700, cursor:'pointer' }}>
                  <div>{o.val === 'video' ? '📹' : o.val === 'phone' ? '📞' : '💬'} {o.label}</div>
                  <div style={{ fontSize:'.6875rem', fontWeight:400, marginTop:2 }}>${o.price}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Attestation + Finalise */}
        {!isFinalised ? (
          <div style={{ background:attested?'#F0FDF4':'white', borderRadius:14, padding:'1.25rem', marginBottom:12, border:`1.5px solid ${attested?'#BBF7D0':'#E2E8F0'}` }}>
            <label style={{ display:'flex', gap:12, alignItems:'flex-start', cursor:'pointer', marginBottom:'1rem' }}
              onClick={() => setAttested(v => !v)}>
              <div style={{ width:24, height:24, borderRadius:6, flexShrink:0, border:`2px solid ${attested?GREEN:'#D1D5DB'}`, background:attested?GREEN:'white', display:'flex', alignItems:'center', justifyContent:'center', marginTop:2 }}>
                {attested && <span style={{ color:'white', fontSize:14, fontWeight:700 }}>✓</span>}
              </div>
              <span style={{ fontSize:'.875rem', lineHeight:1.6, color:'#374151' }}>
                I, <strong>{providerName}</strong>, confirm these notes accurately reflect the telehealth consultation I conducted with <strong>{patientName}</strong> and accept clinical responsibility for this record.
              </span>
            </label>

            <button
              onClick={finalise}
              disabled={!canFinalise || finalising}
              style={{ width:'100%', minHeight:60, borderRadius:12, border:'none', background:canFinalise?GREEN:'#E2E8F0', color:canFinalise?'white':'#9CA3AF', fontFamily:FF, fontWeight:800, fontSize:'1.125rem', cursor:canFinalise?'pointer':'not-allowed', boxShadow:canFinalise?'0 4px 20px rgba(5,150,105,.35)':'none', transition:'all .2s' }}>
              {finalising ? 'Finalising…' : '✓ Finalise & complete'}
            </button>

            {!noteConfirmed && <div style={{ textAlign:'center', fontSize:'.8125rem', color:'#D97706', marginTop:8 }}>Confirm the clinical note above to continue</div>}
            {noteConfirmed && !outcome && <div style={{ textAlign:'center', fontSize:'.8125rem', color:'#D97706', marginTop:8 }}>Select a consultation outcome to continue</div>}
            {noteConfirmed && outcome && !attested && <div style={{ textAlign:'center', fontSize:'.8125rem', color:'#9CA3AF', marginTop:8 }}>Tick the attestation above to finalise</div>}
          </div>
        ) : (
          <div style={{ background:'#F0FDF4', borderRadius:14, padding:'1.5rem', border:'1.5px solid #BBF7D0', textAlign:'center', marginBottom:12 }}>
            <div style={{ fontSize:'2rem', marginBottom:8 }}>✓</div>
            <div style={{ fontWeight:800, color:GREEN, fontSize:'1.125rem', marginBottom:4 }}>Notes finalised</div>
            {consult.notes_finalised_at && <div style={{ fontSize:'.875rem', color:'#6B7280' }}>{new Date(consult.notes_finalised_at).toLocaleString('en-NZ')}</div>}
            <button onClick={() => navigate('/provider')}
              style={{ marginTop:'1rem', background:TEAL, color:'white', border:'none', padding:'12px 24px', borderRadius:10, fontFamily:FF, fontWeight:700, fontSize:'.9375rem', cursor:'pointer', minHeight:48 }}>
              ← Back to queue
            </button>
          </div>
        )}

      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <PrescribeModal
        open={modals.rx}
        onClose={() => setModals(m => ({ ...m, rx: false }))}
        consult={consult}
        onDone={action => { addAction(action); setModals(m => ({ ...m, rx: false })) }}
      />
      <XrayModal
        open={modals.xr}
        onClose={() => setModals(m => ({ ...m, xr: false }))}
        consult={consult}
        onDone={action => { addAction(action); setModals(m => ({ ...m, xr: false })) }}
      />
    </div>
  )
}
