import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { getConsultation, updateConsultation } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'

const FF   = 'Plus Jakarta Sans, sans-serif'
const TEAL = '#0B6E76'
const NAVY = '#0D2B45'
const GREEN = '#059669'
const today = new Date().toISOString().slice(0, 10)

const ACC_READ_CODES = [
  { code:'S30', label:'Ankle sprain' }, { code:'S39', label:'Other ankle injury' },
  { code:'M13', label:'Laceration' },   { code:'M10', label:'Contusion / bruise' },
  { code:'N17', label:'UTI' },          { code:'H05', label:'URTI' },
  { code:'H06', label:'Tonsillitis' },  { code:'K22', label:'Chest pain' },
  { code:'A84', label:'Back pain' },    { code:'S20', label:'Wrist sprain' },
  { code:'F29', label:'Eye injury' },   { code:'S60', label:'Finger injury' },
  { code:'T14', label:'Burn' },         { code:'A09', label:'Headache' },
  { code:'R05', label:'Cough' },        { code:'J06', label:'Nausea / vomiting' },
]

const MCNZ_STATEMENT = 'This examination was conducted via video telehealth in accordance with MCNZ telehealth standards. Physical palpation, auscultation, and percussion were not performed. Clinical findings are based on visual assessment and patient-reported symptoms.'
const MCNZ_FOOTER = 'Telehealth consultation conducted via Tere Health (tere.co.nz) in accordance with MCNZ Statement on Telehealth (August 2023). Video platform: LiveKit WebRTC. Patient and provider both located in New Zealand at time of consultation.'

// source: 'transcript' | 'triage' | 'none' | undefined (undefined = not yet generated, show no badge)
// confidence: 'high' | 'medium' | 'low' | null (only applies when source === 'transcript')
function SectionCard({ num, title, source, confidence, children }) {
  let badge = null
  if (source === 'transcript') {
    if (!confidence || confidence === 'high') {
      badge = { text:'TERE SCRIBE ✓',       bg:'rgba(11,110,118,.35)', color:'#7ECFD4' }
    } else if (confidence === 'medium') {
      badge = { text:'TERE SCRIBE ⚠ REVIEW', bg:'rgba(217,119,6,.30)',  color:'#FCD34D' }
    } else {
      badge = { text:'TERE SCRIBE ✗ COMPLETE', bg:'rgba(220,38,38,.28)', color:'#FCA5A5' }
    }
  } else if (source === 'triage') {
    badge = { text:'TRIAGE ✓',    bg:'rgba(5,150,105,.20)',  color:'#6EE7B7' }
  } else if (source === 'none') {
    badge = { text:'NEEDS INPUT', bg:'rgba(220,38,38,.12)',   color:'#FCA5A5' }
  }

  return (
    <div style={{ background:'white', borderRadius:14, border:'1px solid #E2E8F0', marginBottom:'1rem', overflow:'hidden' }}>
      <div style={{ background:NAVY, padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ width:24, height:24, borderRadius:'50%', background:TEAL, color:'white', fontWeight:800, fontSize:'.75rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{num}</span>
          <span style={{ fontWeight:700, fontSize:'.9rem', color:'white' }}>{title}</span>
        </div>
        {badge && <span style={{ fontSize:'.65rem', background:badge.bg, color:badge.color, borderRadius:99, padding:'2px 8px', fontWeight:700, letterSpacing:'.05em' }}>{badge.text}</span>}
      </div>
      <div style={{ padding:'1rem' }}>{children}</div>
    </div>
  )
}

function TA({ value, onChange, rows = 4, placeholder = '', disabled }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows}
      placeholder={placeholder} readOnly={disabled}
      style={{ width:'100%', boxSizing:'border-box', border:'1.5px solid #E2E8F0', borderRadius:8, padding:'10px 12px', fontFamily:FF, fontSize:'.9375rem', lineHeight:1.7, resize:'vertical', outline:'none', background:disabled?'#F8FAFC':'white', color:'#1A2A33' }}
    />
  )
}

function Input({ label, value, onChange, disabled, placeholder = '' }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      {label && <label style={{ fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#6B7280' }}>{label}</label>}
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} readOnly={disabled}
        style={{ border:'1.5px solid #E2E8F0', borderRadius:8, padding:'9px 12px', fontFamily:FF, fontSize:'.9375rem', outline:'none', color:'#1A2A33', background:disabled?'#F8FAFC':'white', width:'100%', boxSizing:'border-box' }}
      />
    </div>
  )
}

function ProgressDots({ progress }) {
  return (
    <div style={{ display:'flex', gap:6, alignItems:'center', justifyContent:'center', padding:'10px 0 2px' }}>
      {progress.map((done, i) => (
        <div key={i} style={{ width:done?10:8, height:done?10:8, borderRadius:'50%', background:done?TEAL:'#D1D5DB', transition:'all .2s' }} title={`Section ${i+1}`} />
      ))}
    </div>
  )
}

function formatTimer(sec) {
  return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`
}

function formatVitals(vitals) {
  if (!vitals) return 'No vitals recorded via Tere Vitals'
  return [
    vitals.hr    ? `HR: ${vitals.hr} bpm`   : null,
    vitals.rr    ? `RR: ${vitals.rr} brpm`  : null,
    vitals.spo2  ? `SpO2: ${vitals.spo2}%`  : null,
    vitals.bp    ? `BP: ${vitals.bp} mmHg`  : null,
    vitals.temp  ? `Temp: ${vitals.temp}°C` : null,
  ].filter(Boolean).join('  |  ')
}

export default function NotesCompletion() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const location  = useLocation()

  const [consult, setConsult]         = useState(null)
  const [loading, setLoading]         = useState(true)
  const [generating, setGenerating]   = useState(false)
  const [genError, setGenError]       = useState(null)
  const [finalising, setFinalising]   = useState(false)
  const [lastSaved, setLastSaved]     = useState(null)

  // ── Note state ───────────────────────────────────────────────────────────────
  const [s1, setS1] = useState('')   // presenting history
  const [medHistory, setMedHistory]     = useState('')
  const [medications, setMedications]   = useState('')
  const [allergies, setAllergies]       = useState('')
  const [tobacco, setTobacco]           = useState('Not disclosed')
  const [alcohol, setAlcohol]           = useState('Not disclosed')
  const [occupation, setOccupation]     = useState('')
  const [generalAppearance, setGA]      = useState('')
  const [visibleFindings, setVF]        = useState('')
  const [mdm, setMdm]                   = useState('')
  const [planItems, setPlanItems]       = useState([]) // [{id, text, locked, type}]
  const [returnPrecautions, setReturnP] = useState('')
  const [outcome, setOutcome]           = useState('')

  // Work capacity
  const [workCapacity, setWorkCapacity] = useState('')
  const [wcFrom, setWcFrom]             = useState(today)
  const [wcTo, setWcTo]                 = useState('')
  const [wcLimitations, setWcLimits]    = useState('')
  const [wcReview, setWcReview]         = useState('')

  // ACC
  const [accReadCode, setAccReadCode]   = useState('')
  const [accMechanism, setAccMech]      = useState('')
  const [accBodyPart, setAccBody]       = useState('')

  // Attestation
  const [attested, setAttested]         = useState(false)

  // Source tracking — where each section's content came from
  const [sources, setSources]           = useState({})
  // Confidence per section from Scribe
  const [confidence, setConfidence]     = useState({})
  // Red flags from Scribe
  const [redFlags, setRedFlags]         = useState(null)
  const [flagsAcknowledged, setFlagsAcknowledged] = useState(false)
  // Note comparison: triage snapshot vs scribe additions
  const [showComparison, setShowComparison]   = useState(false)
  const [triageSnapshot, setTriageSnapshot]   = useState({})
  const [additions, setAdditions]             = useState({})
  // ICD-10
  const [icd10Code, setIcd10Code]       = useState('')
  const [icd10Label, setIcd10Label]     = useState('')

  const actionsRef    = useRef([])
  const transcriptRef = useRef('')
  const startTimeRef  = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const draftKey = `tere_notes2_${id}`

  // Timer
  useEffect(() => {
    if (attested) return
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [attested])

  // Auth
  useEffect(() => {
    if (!sessionStorage.getItem('clinicianAuth')) navigate('/clinician')
  }, [navigate])

  // ── Load ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const data = await getConsultation(id)
        setConsult(data)

        const rs = location.state
        actionsRef.current  = rs?.actions   || data.notes_draft?.actions || []
        transcriptRef.current = rs?.transcript || data.transcript || ''

        // Already finalised
        if (data.notes_finalised && data.notes_final) {
          try {
            const final = typeof data.notes_final === 'string' ? JSON.parse(data.notes_final) : data.notes_final
            restoreDraft(final, data)
            setAttested(true)
          } catch {}
          setLoading(false)
          return
        }

        // Existing draft
        if (data.notes_draft?.v === 2) {
          restoreDraft(data.notes_draft, data)
          setLoading(false)
          return
        }

        // Local draft fallback
        try {
          const local = localStorage.getItem(draftKey)
          if (local) {
            const d = JSON.parse(local)
            if (d.v === 2) { restoreDraft(d, data); setLoading(false); return }
          }
        } catch {}

        // Generate fresh
        setLoading(false)
        await runGenerate(data, transcriptRef.current, actionsRef.current)
      } catch (e) { console.error(e); setLoading(false) }
    }
    load()
  }, [id])

  function restoreDraft(d, data) {
    if (d.s1 !== undefined)          setS1(d.s1)
    if (d.medHistory !== undefined)  setMedHistory(d.medHistory)
    if (d.medications !== undefined) setMedications(d.medications)
    if (d.allergies !== undefined)   setAllergies(d.allergies)
    if (d.tobacco !== undefined)     setTobacco(d.tobacco)
    if (d.alcohol !== undefined)     setAlcohol(d.alcohol)
    if (d.occupation !== undefined)  setOccupation(d.occupation)
    if (d.generalAppearance !== undefined) setGA(d.generalAppearance)
    if (d.visibleFindings !== undefined)   setVF(d.visibleFindings)
    if (d.mdm !== undefined)         setMdm(d.mdm)
    if (d.planItems !== undefined)   setPlanItems(d.planItems)
    if (d.returnPrecautions !== undefined) setReturnP(d.returnPrecautions)
    if (d.outcome !== undefined)     setOutcome(d.outcome || data?.outcome || '')
    if (d.workCapacity !== undefined) setWorkCapacity(d.workCapacity)
    if (d.wcFrom !== undefined)      setWcFrom(d.wcFrom)
    if (d.wcTo !== undefined)        setWcTo(d.wcTo)
    if (d.wcLimitations !== undefined) setWcLimits(d.wcLimitations)
    if (d.wcReview !== undefined)    setWcReview(d.wcReview)
    if (d.accReadCode !== undefined) setAccReadCode(d.accReadCode)
    if (d.accMechanism !== undefined) setAccMech(d.accMechanism)
    if (d.accBodyPart !== undefined) setAccBody(d.accBodyPart)
    if (!d.workCapacity && data?.work_capacity) setWorkCapacity(data.work_capacity)
    if (!d.outcome && data?.outcome) setOutcome(data.outcome)
    if (d._sources)     setSources(d._sources)
    if (d._confidence)  setConfidence(d._confidence)
    if (d._redFlags)    setRedFlags(d._redFlags)
    if (d._triage)      setTriageSnapshot(d._triage)
    if (d._additions)   setAdditions(d._additions)
    if (d.icd10Code)    setIcd10Code(d.icd10Code)
    if (d.icd10Label)   setIcd10Label(d.icd10Label)
  }

  async function runGenerate(consultData, transcript, actions) {
    setGenerating(true); setGenError(null)
    try {
      const prescriptions = (actions || []).filter(a => a.type === 'prescription')
      const referrals     = (actions || []).filter(a => a.type === 'radiology')
      const res = await apiFetch('/api/generate-notes', {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          transcript: transcript || '',
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
        }),
      })
      const d = await res.json()
      if (!res.ok || d.error) throw new Error(d.error || 'Generation failed')

      if (d.presentingHistory) setS1(d.presentingHistory)
      if (d.medicalHistory)    setMedHistory(d.medicalHistory)
      if (d.medications)       setMedications(d.medications)
      if (d.allergies)         setAllergies(d.allergies)
      if (d.social) {
        if (d.social.tobacco)    setTobacco(d.social.tobacco)
        if (d.social.alcohol)    setAlcohol(d.social.alcohol)
        if (d.social.occupation) setOccupation(d.social.occupation)
      }
      if (d.generalAppearance) setGA(d.generalAppearance)
      if (d.visibleFindings)   setVF(d.visibleFindings)
      if (d.mdm)               setMdm(d.mdm)
      if (d.returnPrecautions) setReturnP(d.returnPrecautions)
      if (d.workCapacity)      setWorkCapacity(d.workCapacity)
      if (d.accSection) {
        if (d.accSection.mechanism)         setAccMech(d.accSection.mechanism)
        if (d.accSection.bodyPart)          setAccBody(d.accSection.bodyPart)
        if (d.accSection.readCodeSuggestion) setAccReadCode(d.accSection.readCodeSuggestion)
      }
      if (d.suggestedReadCode) setAccReadCode(prev => prev || d.suggestedReadCode)
      if (d.icd10Code)         setIcd10Code(d.icd10Code)
      if (d.icd10Label)        setIcd10Label(d.icd10Label)
      if (d._sources)          setSources(d._sources)
      if (d._confidence)       setConfidence(d._confidence)
      if (d._redFlags)         setRedFlags(d._redFlags)
      if (d._triage)           setTriageSnapshot(d._triage)
      if (d._additions)        setAdditions(d._additions)

      // Build editable plan items from AI (locked items built from actions separately)
      if (Array.isArray(d.planItems)) {
        setPlanItems(prev => {
          const locked = prev.filter(p => p.locked)
          const editable = d.planItems.map((text, i) => ({ id: `ai-${i}`, text, locked: false }))
          return [...locked, ...editable]
        })
      }

      await updateConsultation(id, { note_generated_at: new Date().toISOString() })
    } catch (e) { console.error(e); setGenError(e.message) }
    setGenerating(false)
  }

  // Build locked plan items from actions on mount
  useEffect(() => {
    const actions = actionsRef.current || []
    const locked = []
    actions.filter(a => a.type === 'prescription').forEach(p => {
      locked.push({ id: `rx-${p.drug}`, locked: true, type:'rx', text: `Prescription: ${p.drug}${p.dose?' '+p.dose:''}${p.frequency?' '+p.frequency:''}${p.pharmacy?' — '+p.pharmacy:''}` })
    })
    actions.filter(a => a.type === 'radiology').forEach(r => {
      locked.push({ id: `ref-${r.investigation}`, locked: true, type:'ref', text: `Referral: ${r.investigation||'Imaging'} — ${r.bodyPart||''}${r.priority?' ['+r.priority+']':''}` })
    })
    if (locked.length) {
      setPlanItems(prev => [...locked, ...prev.filter(p => !p.locked)])
    }
  }, [])

  // Auto-save every 30 seconds
  const getDraft = useCallback(() => ({
    v: 2, s1, medHistory, medications, allergies, tobacco, alcohol, occupation,
    generalAppearance, visibleFindings, mdm, planItems, returnPrecautions, outcome,
    workCapacity, wcFrom, wcTo, wcLimitations, wcReview, accReadCode, accMechanism, accBodyPart,
    icd10Code, icd10Label,
    actions: actionsRef.current,
    _sources: sources,
    _confidence: confidence,
    _redFlags: redFlags,
    _triage: triageSnapshot,
    _additions: additions,
  }), [s1, medHistory, medications, allergies, tobacco, alcohol, occupation,
       generalAppearance, visibleFindings, mdm, planItems, returnPrecautions, outcome,
       workCapacity, wcFrom, wcTo, wcLimitations, wcReview, accReadCode, accMechanism, accBodyPart,
       icd10Code, icd10Label,
       sources, confidence, redFlags, triageSnapshot, additions])

  useEffect(() => {
    if (!consult) return
    const t = setInterval(async () => {
      const draft = getDraft()
      localStorage.setItem(draftKey, JSON.stringify(draft))
      try {
        await updateConsultation(id, { notes_draft: draft })
        setLastSaved(new Date())
      } catch {}
    }, 30000)
    return () => clearInterval(t)
  }, [consult, getDraft, id])

  // ── Finalise ─────────────────────────────────────────────────────────────────
  async function finalise() {
    setFinalising(true)
    try {
      const now    = new Date().toISOString()
      const completedSec = Math.floor((Date.now() - startTimeRef.current) / 1000)
      const providerName = sessionStorage.getItem('providerDisplayName') || 'Treating clinician'
      const providerId   = sessionStorage.getItem('providerId') || null
      const regNum       = sessionStorage.getItem('providerCpn') || sessionStorage.getItem('prescriberNumber') || ''
      const patientName  = consult ? `${consult.patient_first_name} ${consult.patient_last_name}` : ''
      const dob          = consult?.patient_dob ? new Date(consult.patient_dob).toLocaleDateString('en-NZ') : '—'
      const nhi          = consult?.patient_nhi || '—'
      const consultDate  = consult ? new Date(consult.created_at).toLocaleDateString('en-NZ', { day:'numeric', month:'long', year:'numeric' }) : ''
      const consultTime  = consult ? new Date(consult.created_at).toLocaleTimeString('en-NZ', { hour:'2-digit', minute:'2-digit', timeZoneName:'short' }) : ''

      const allPlanLines = [
        ...planItems.map(p => `• ${p.text}`),
        returnPrecautions ? `• Return precautions: ${returnPrecautions}` : null,
        workCapacity === 'fit' ? '• Work capacity: Fit for work' :
        workCapacity === 'modified' ? `• Work capacity: Modified duties — ${wcLimitations}${wcFrom?' from '+wcFrom:''}${wcTo?' to '+wcTo:''}` :
        `• Work capacity: Unfit for work${wcFrom?' from '+wcFrom:''}${wcTo?' to '+wcTo:''}${wcReview?' Review '+wcReview:''}`,
        outcome ? `• Outcome: ${outcome}` : null,
      ].filter(Boolean).join('\n')

      const finalNote = {
        v: 2, attestedAt: now, providerName, providerId,
        s1, medHistory, medications, allergies,
        social: { tobacco, alcohol, occupation },
        generalAppearance, visibleFindings,
        mdm, planItems, returnPrecautions, outcome,
        workCapacity, wcFrom, wcTo, wcLimitations, wcReview,
        accReadCode, accMechanism, accBodyPart,
        actions: actionsRef.current,
      }

      const noteText = [
        `CLINICAL NOTES — ${consultDate} ${consultTime}`,
        `Patient: ${patientName} | DOB: ${dob} | NHI: ${nhi}`,
        `Provider: ${providerName}${regNum ? ' (Reg: ' + regNum + ')' : ''}`,
        '',
        '1. PRESENTING COMPLAINT AND HISTORY',
        s1,
        '',
        '2. MEDICAL HISTORY, ALLERGIES AND SOCIAL HISTORY',
        `Medical history: ${medHistory}`,
        `Current medications: ${medications}`,
        `Allergies: ${allergies}`,
        `Social: Tobacco — ${tobacco} | Alcohol — ${alcohol} | Occupation — ${occupation}`,
        '',
        '3. TELEHEALTH EXAMINATION',
        `Vitals: ${formatVitals(consult?.vitals)}`,
        `General appearance: ${generalAppearance || 'Not assessed'}`,
        `Visible findings: ${visibleFindings || 'Not assessed'}`,
        MCNZ_STATEMENT,
        '',
        '4. MEDICAL DECISION MAKING',
        mdm,
        '',
        '5. PLAN',
        allPlanLines,
        ...(consult?.acc_eligible === 'yes' ? [
          '',
          `ACC: Read code ${accReadCode} | Mechanism: ${accMechanism} | Body part: ${accBodyPart}`,
        ] : []),
        '',
        '6. ATTESTATION',
        `I, ${providerName}${regNum ? ' (' + regNum + ')' : ''}, confirm that these notes accurately reflect the telehealth consultation I conducted on ${consultDate} at ${consultTime} with ${patientName} (NHI: ${nhi}). I conducted this consultation in accordance with MCNZ telehealth standards and accept clinical responsibility for this record.`,
        '',
        MCNZ_FOOTER,
      ].join('\n')

      const durationSec = consult?.consultation_duration_seconds ||
        (consult?.started_at ? Math.round((Date.now() - new Date(consult.started_at)) / 1000) : null)

      try {
        await updateConsultation(id, {
          notes_final:             JSON.stringify(finalNote),
          notes_draft:             null,
          notes_finalised:         true,
          notes_finalised_at:      now,
          note_finalised_by:       providerName,
          notes_finalised_by:      providerId,
          notes_completed_seconds: completedSec,
          acc_read_code:           accReadCode || null,
          work_capacity:           workCapacity || null,
          return_to_work_date:     workCapacity !== 'fit' && wcTo ? wcTo : null,
          billing_code:            durationSec >= 1800 ? 'CS2T' : 'CS1T',
          outcome:                 outcome || null,
          status:                  'complete',
          completed_at:            consult?.completed_at || now,
          consultation_duration_seconds: durationSec,
          payment_amount:          consult?.payment_amount || (consult?.acc_eligible === 'yes' ? 2500 : 6500),
          is_acc:                  consult?.acc_eligible === 'yes',
        })
      } catch (updateErr) { throw updateErr }

      // Patient summary email
      if (consult?.patient_email) {
        apiFetch('/api/send-email', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            to: consult.patient_email,
            name: patientName,
            sections: { presentingHistory: s1, mdm, plan: allPlanLines },
            notes: {},
            actions: actionsRef.current,
            consult: { chief_complaint: consult.chief_complaint },
            consultationId: id,
          }),
        }).catch(() => {})
      }

      localStorage.removeItem(draftKey)
      navigate('/clinician/dashboard')
    } catch (e) { console.error(e); setFinalising(false) }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────
  const isAcc       = consult?.acc_eligible === 'yes'
  const isFinalised = !!consult?.notes_finalised
  const disabled    = isFinalised
  const patientName = consult ? `${consult.patient_first_name} ${consult.patient_last_name}` : '…'
  const regNum      = sessionStorage.getItem('providerCpn') || sessionStorage.getItem('prescriberNumber') || ''
  const providerName = sessionStorage.getItem('providerDisplayName') || 'Treating clinician'

  const criticalFlags = redFlags?.flags?.filter(f => f.severity === 'critical') || []
  const canFinalise = !isFinalised && s1.trim().length > 0 && !!workCapacity && attested &&
    (criticalFlags.length === 0 || flagsAcknowledged)

  const progress = [
    !!s1.trim(),
    !!(medHistory.trim() || medications.trim() || allergies.trim()),
    true,
    !!mdm.trim(),
    !!workCapacity,
    attested,
  ]

  const timerColor = elapsed < 60 ? GREEN : elapsed < 120 ? '#D97706' : '#DC2626'

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F0F2F5' }}>
      <div style={{ width:36, height:36, border:'3px solid #D4EEF0', borderTopColor:TEAL, borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ minHeight:'100dvh', background:'#F0F2F5', fontFamily:FF }}>

      {/* Generating overlay */}
      {generating && (
        <div style={{ position:'fixed', inset:0, background:'rgba(13,43,69,.92)', zIndex:999, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'1rem' }}>
          <div style={{ width:44, height:44, border:'4px solid rgba(255,255,255,.2)', borderTopColor:'#D4EEF0', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
          <div style={{ color:'white', fontSize:'1.1rem', fontWeight:700 }}>Tere Scribe generating notes…</div>
          <div style={{ color:'rgba(255,255,255,.5)', fontSize:'.875rem', textAlign:'center', maxWidth:300 }}>Analysing transcript and triage data<br />~20 seconds</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* Top bar */}
      <div style={{ background:NAVY, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:10 }}>
        <button onClick={() => navigate('/clinician/dashboard')}
          style={{ background:'rgba(255,255,255,.1)', border:'none', color:'rgba(255,255,255,.7)', padding:'8px 12px', borderRadius:8, cursor:'pointer', fontFamily:FF, fontSize:'.875rem', minHeight:44 }}>
          ← Queue
        </button>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontWeight:700, fontSize:'.9rem', color:'white' }}>{patientName}</div>
          <div style={{ fontSize:'.7rem', color:'rgba(255,255,255,.45)' }}>Clinical notes</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {Object.keys(triageSnapshot).length > 0 && (
            <button onClick={() => setShowComparison(v => !v)}
              style={{ fontSize:'.7rem', fontWeight:700, background:showComparison?'rgba(11,110,118,.25)':'rgba(255,255,255,.1)', color:showComparison?'#7ECFD4':'rgba(255,255,255,.55)', border:'none', borderRadius:99, padding:'4px 10px', cursor:'pointer', fontFamily:FF, whiteSpace:'nowrap' }}>
              {showComparison ? '✕ Changes' : '⊕ Changes'}
            </button>
          )}
          {isFinalised
            ? <span style={{ background:'#065F46', color:'#6EE7B7', fontSize:'.65rem', fontWeight:700, padding:'4px 10px', borderRadius:99 }}>DONE</span>
            : <span style={{ fontWeight:800, fontSize:'.875rem', color:timerColor, fontVariantNumeric:'tabular-nums', minWidth:44, textAlign:'right' }}>{formatTimer(elapsed)}</span>
          }
        </div>
      </div>

      <div style={{ padding:'0 1rem 2rem' }}>

        {/* Progress */}
        <ProgressDots progress={progress} />

        {/* Patient header */}
        <div style={{ background:'white', borderRadius:14, padding:'1rem', margin:'10px 0 1rem', border:'1px solid #E2E8F0', borderTop:`4px solid ${TEAL}` }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:6 }}>
            <div>
              <div style={{ fontWeight:800, fontSize:'1.1rem', color:NAVY }}>{patientName}</div>
              <div style={{ fontSize:'.8rem', color:'#6B7280' }}>
                NHI: {consult?.patient_nhi || '—'} ·{' '}
                {consult ? new Date(consult.created_at).toLocaleDateString('en-NZ', { day:'numeric', month:'long', year:'numeric' }) : '—'}
              </div>
            </div>
            {isFinalised && <span style={{ fontSize:'.75rem', fontWeight:700, color:GREEN }}>✓ Notes finalised</span>}
          </div>
          <div style={{ background:'#F8FAFC', borderRadius:8, padding:'8px 12px', marginTop:10, fontSize:'.9375rem', color:'#374151', fontWeight:600 }}>
            {consult?.chief_complaint}
          </div>
          {consult?.vitals && (
            <div style={{ background:'#F0F9FA', borderRadius:8, padding:'8px 12px', marginTop:8, fontSize:'.8125rem', color:TEAL, fontFamily:'monospace' }}>
              {formatVitals(consult.vitals)}
            </div>
          )}
          {genError && (
            <div style={{ marginTop:10, background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 12px', fontSize:'.8125rem', color:'#DC2626', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span>Generation failed: {genError}</span>
              <button onClick={() => runGenerate(consult, transcriptRef.current, actionsRef.current)}
                style={{ background:'#DC2626', color:'white', border:'none', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontFamily:FF, fontSize:'.75rem', fontWeight:700, marginLeft:8 }}>Retry</button>
            </div>
          )}
        </div>

        {/* ─── Section 1: Presenting Complaint ─── */}
        <SectionCard num={1} title="Presenting Complaint and History" source={sources.presentingHistory} confidence={confidence.presentingHistory}>
          {showComparison && triageSnapshot.presentingHistory && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#6B7280', marginBottom:4 }}>TRIAGE (original)</div>
              <div style={{ background:'#F8FAFC', borderRadius:8, padding:'8px 12px', fontSize:'.8rem', color:'#6B7280', lineHeight:1.6, borderLeft:'3px solid #D1D5DB' }}>
                {triageSnapshot.presentingHistory}
              </div>
              {additions.presentingHistory && (
                <>
                  <div style={{ fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:TEAL, marginBottom:4, marginTop:8 }}>ADDED BY TERE SCRIBE</div>
                  <div style={{ background:'rgba(11,110,118,.07)', borderRadius:8, padding:'8px 12px', fontSize:'.8rem', color:TEAL, lineHeight:1.6, borderLeft:`3px solid ${TEAL}` }}>
                    {additions.presentingHistory}
                  </div>
                </>
              )}
              <div style={{ borderTop:'1px solid #E2E8F0', margin:'10px 0 6px' }} />
            </div>
          )}
          <TA value={s1} onChange={setS1} rows={5} disabled={disabled}
            placeholder="Generating from triage and transcript…" />
        </SectionCard>

        {/* ─── Section 2: Medical History ─── */}
        <SectionCard num={2} title="Medical History, Allergies and Social History"
          source={
            sources.social === 'transcript' ? 'transcript'
            : (sources.medicalHistory === 'triage' || sources.medications === 'triage' || sources.allergies === 'triage') ? 'triage'
            : sources.medicalHistory
          }
        >
          <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
            <div>
              <label style={{ fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#6B7280', display:'block', marginBottom:4 }}>Medical history</label>
              <TA value={medHistory} onChange={setMedHistory} rows={3} disabled={disabled} placeholder="Past medical conditions, surgical history, hospitalisations…" />
            </div>
            <div>
              <label style={{ fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#6B7280', display:'block', marginBottom:4 }}>Current medications</label>
              <TA value={medications} onChange={setMedications} rows={2} disabled={disabled} placeholder="Medication, dose, frequency…" />
            </div>
            <Input label="Allergies" value={allergies} onChange={setAllergies} disabled={disabled} placeholder="NKDA or Drug — reaction type" />
            <div style={{ borderTop:'1px solid #F3F4F6', paddingTop:10 }}>
              <div style={{ fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#6B7280', marginBottom:8 }}>Social history</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                <Input label="Tobacco" value={tobacco} onChange={setTobacco} disabled={disabled} />
                <Input label="Alcohol" value={alcohol} onChange={setAlcohol} disabled={disabled} />
              </div>
              <Input label="Occupation" value={occupation} onChange={setOccupation} disabled={disabled} placeholder="Role, employer, location…" />
            </div>
          </div>
        </SectionCard>

        {/* ─── Section 3: Examination ─── */}
        <SectionCard num={3} title="Telehealth Examination"
          source={
            sources.visibleFindings === 'transcript' || sources.generalAppearance === 'transcript' ? 'transcript'
            : sources.visibleFindings !== undefined ? (consult?.vitals ? 'triage' : 'none')
            : undefined
          }
          confidence={
            confidence.visibleFindings === 'low' || confidence.generalAppearance === 'low' ? 'low'
            : confidence.visibleFindings === 'medium' || confidence.generalAppearance === 'medium' ? 'medium'
            : confidence.visibleFindings || confidence.generalAppearance
          }
        >
          <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
            {/* Vitals — locked */}
            <div style={{ background:'#F0F9FA', borderRadius:10, padding:'10px 14px', border:'1px solid #D4EEF0' }}>
              <div style={{ fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:TEAL, marginBottom:4 }}>Vitals — Tere Vitals rPPG</div>
              <div style={{ fontSize:'.875rem', fontFamily:'monospace', color:NAVY }}>
                {formatVitals(consult?.vitals)}
              </div>
            </div>
            <div>
              <label style={{ fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#6B7280', display:'block', marginBottom:4 }}>General appearance</label>
              <TA value={generalAppearance} onChange={setGA} rows={2} disabled={disabled} placeholder="Alert and oriented. Appears comfortable/distressed/pale — from video assessment" />
            </div>
            <div>
              <label style={{ fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#6B7280', display:'block', marginBottom:4 }}>Visible findings</label>
              <TA value={visibleFindings} onChange={setVF} rows={2} disabled={disabled} placeholder="Visible injury, swelling, skin changes, MSK inspection findings visible on camera…" />
            </div>
            <div style={{ background:'#F8FAFC', borderRadius:8, padding:'10px 12px', fontSize:'.8125rem', color:'#6B7280', lineHeight:1.5, borderLeft:'3px solid #E2E8F0' }}>
              {MCNZ_STATEMENT}
            </div>
          </div>
        </SectionCard>

        {/* ─── Section 4: MDM ─── */}
        <SectionCard num={4} title="Medical Decision Making" source={sources.mdm} confidence={confidence.mdm}>
          <TA value={mdm} onChange={setMdm} rows={6} disabled={disabled}
            placeholder="Differentials considered, clinical decision rules applied, risk stratification, reason for investigations and prescriptions, red flags excluded…" />
        </SectionCard>

        {/* ─── Section 5: Plan ─── */}
        <SectionCard num={5} title="Plan"
          source={
            sources.planItems === 'transcript' || sources.returnPrecautions === 'transcript' ? 'transcript'
            : sources.planItems !== undefined ? 'none'
            : undefined
          }
          confidence={
            confidence.planItems === 'low' || confidence.returnPrecautions === 'low' ? 'low'
            : confidence.planItems === 'medium' || confidence.returnPrecautions === 'medium' ? 'medium'
            : confidence.planItems || confidence.returnPrecautions
          }
        >
          <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
            {/* Locked auto items */}
            {planItems.filter(p => p.locked).length > 0 && (
              <div>
                <div style={{ fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#6B7280', marginBottom:6 }}>Auto-filled from consultation</div>
                {planItems.filter(p => p.locked).map(p => (
                  <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8, background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:8, padding:'8px 12px', marginBottom:6, fontSize:'.875rem', color:'#065F46' }}>
                    <span style={{ fontWeight:700, flexShrink:0 }}>
                      {p.type==='rx'?'Rx':p.type==='ref'?'Ref':'ACC'}
                    </span>
                    <span>{p.text.replace(/^(Prescription|Referral): /,'')}</span>
                    <span style={{ marginLeft:'auto', fontSize:'.65rem', color:'#6EE7B7', fontWeight:700 }}>LOCKED</span>
                  </div>
                ))}
              </div>
            )}

            {/* ACC auto-fill if eligible */}
            {isAcc && (
              <div style={{ background:'#F0F9FA', border:'1px solid #D4EEF0', borderRadius:8, padding:'8px 12px', fontSize:'.875rem', color:TEAL }}>
                ✓ ACC claim lodged — three-part consent obtained at triage
              </div>
            )}

            {/* Editable plan items */}
            <div>
              <div style={{ fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#6B7280', marginBottom:6 }}>Plan items</div>
              {planItems.filter(p => !p.locked).map((p, i) => (
                <div key={p.id} style={{ display:'flex', gap:6, marginBottom:6 }}>
                  <input value={p.text} onChange={e => {
                    setPlanItems(prev => prev.map(x => x.id === p.id ? { ...x, text: e.target.value } : x))
                  }} readOnly={disabled}
                    style={{ flex:1, border:'1.5px solid #E2E8F0', borderRadius:8, padding:'8px 10px', fontFamily:FF, fontSize:'.9rem', outline:'none', color:'#1A2A33' }}
                  />
                  {!disabled && (
                    <button onClick={() => setPlanItems(prev => prev.filter(x => x.id !== p.id))}
                      style={{ background:'none', border:'1.5px solid #FECACA', color:'#DC2626', borderRadius:8, padding:'8px 10px', cursor:'pointer', fontFamily:FF, fontSize:'.8rem' }}>✕</button>
                  )}
                </div>
              ))}
              {!disabled && (
                <button onClick={() => setPlanItems(prev => [...prev, { id:`custom-${Date.now()}`, text:'', locked:false }])}
                  style={{ background:'none', border:'1.5px dashed #D1D5DB', borderRadius:8, padding:'8px 14px', cursor:'pointer', fontFamily:FF, fontSize:'.875rem', color:'#9CA3AF', width:'100%' }}>
                  + Add plan item
                </button>
              )}
            </div>

            <div>
              <label style={{ fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#6B7280', display:'block', marginBottom:4 }}>Return precautions</label>
              <TA value={returnPrecautions} onChange={setReturnP} rows={2} disabled={disabled}
                placeholder="Symptoms to watch for, when to seek immediate care…" />
            </div>

            {/* Work capacity */}
            <div>
              <div style={{ fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#6B7280', marginBottom:8 }}>
                Work capacity <span style={{ color:'#DC2626' }}>*</span>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                {[
                  { val:'fit',      label:'Fit for work',    color:GREEN,     bg:'#F0FDF4', border:'#BBF7D0' },
                  { val:'modified', label:'Modified duties', color:'#D97706', bg:'#FFFBEB', border:'#FDE68A' },
                  { val:'unfit',    label:'Unfit for work',  color:'#DC2626', bg:'#FEF2F2', border:'#FECACA' },
                ].map(o => (
                  <button key={o.val} onClick={() => !disabled && setWorkCapacity(o.val)}
                    style={{ flex:1, minHeight:48, borderRadius:10, border:`1.5px solid ${workCapacity===o.val?o.border:'#E2E8F0'}`, background:workCapacity===o.val?o.bg:'white', color:workCapacity===o.val?o.color:'#9CA3AF', fontFamily:FF, fontSize:'.8rem', fontWeight:700, cursor:disabled?'default':'pointer', transition:'all .15s' }}>
                    {o.label}
                  </button>
                ))}
              </div>
              {workCapacity === 'modified' && (
                <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:8 }}>
                  <Input label="Limitations" value={wcLimitations} onChange={setWcLimits} disabled={disabled} placeholder="Hours per day, restrictions…" />
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <Input label="From" value={wcFrom} onChange={setWcFrom} disabled={disabled} />
                    <Input label="To" value={wcTo} onChange={setWcTo} disabled={disabled} />
                  </div>
                </div>
              )}
              {workCapacity === 'unfit' && (
                <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:8 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                    <Input label="From" value={wcFrom} onChange={setWcFrom} disabled={disabled} />
                    <Input label="To (max 14 days)" value={wcTo} onChange={setWcTo} disabled={disabled} />
                    <Input label="Review date" value={wcReview} onChange={setWcReview} disabled={disabled} />
                  </div>
                </div>
              )}
            </div>

            {/* ACC fields */}
            {isAcc && (
              <div style={{ background:'#EFF6FF', borderRadius:10, padding:'0.875rem', border:'1px solid #BFDBFE' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <div style={{ fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#1D4ED8' }}>ACC</div>
                  {icd10Code && (
                    <span style={{ background:'#F0FDF4', color:'#065F46', borderRadius:6, padding:'2px 8px', fontSize:'.7rem', fontWeight:700 }}>
                      ICD-10 {icd10Code} — {icd10Label}
                    </span>
                  )}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <div>
                    <label style={{ fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#3B82F6', display:'block', marginBottom:4 }}>Read code</label>
                    <select value={accReadCode} onChange={e => setAccReadCode(e.target.value)} disabled={disabled}
                      style={{ width:'100%', padding:'9px 12px', border:`1.5px solid ${accReadCode?'#3B82F6':'#BFDBFE'}`, borderRadius:8, fontFamily:FF, fontSize:'.9rem', outline:'none', background:disabled?'#F0F6FF':'white', color:'#1A2A33' }}>
                      <option value="">Select Read code…</option>
                      {ACC_READ_CODES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
                    </select>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <Input label="Mechanism" value={accMechanism} onChange={setAccMech} disabled={disabled} placeholder="How the injury occurred" />
                    <Input label="Body part" value={accBodyPart} onChange={setAccBody} disabled={disabled} placeholder="e.g. Right lateral malleolus" />
                  </div>
                </div>
              </div>
            )}

            {/* ICD-10 (non-ACC) */}
            {!isAcc && icd10Code && (
              <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:8, padding:'8px 12px', fontSize:'.8rem', color:'#065F46', fontWeight:600 }}>
                ICD-10 {icd10Code} — {icd10Label}
              </div>
            )}

            {/* Outcome */}
            <div>
              <label style={{ fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#6B7280', display:'block', marginBottom:6 }}>Consultation outcome</label>
              <select value={outcome} onChange={e => setOutcome(e.target.value)} disabled={disabled}
                style={{ width:'100%', padding:'10px 12px', border:`1.5px solid ${outcome?'#0B6E76':'#E2E8F0'}`, borderRadius:8, fontFamily:FF, fontSize:'.9rem', color:outcome?'#1A2A33':'#9CA3AF', background:disabled?'#F8FAFC':'white', outline:'none' }}>
                <option value="">Select outcome…</option>
                {[['discharged','Discharged'],['prescription_only','Prescription only'],['acc_lodged','ACC claim lodged'],
                  ['referred_gp','Referred to GP'],['referred_ed','Referred to ED'],['follow_up','Follow-up arranged'],
                  ['watchful_waiting','Watchful waiting']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
        </SectionCard>

        {/* ─── Red flags panel ─── */}
        {redFlags?.flags?.length > 0 && (
          <div style={{ marginBottom:'1rem' }}>
            <div style={{ fontSize:'.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#6B7280', marginBottom:8 }}>
              Tere Scribe — Clinical Alerts
            </div>
            {redFlags.flags.map((flag, i) => {
              const isC = flag.severity === 'critical'
              const isH = flag.severity === 'high'
              return (
                <div key={i} style={{ background:isC?'#FEF2F2':isH?'#FFFBEB':'#FEFCE8', border:`1px solid ${isC?'#FECACA':isH?'#FDE68A':'#FEF08A'}`, borderRadius:10, padding:'10px 14px', marginBottom:8 }}>
                  <div style={{ fontWeight:700, fontSize:'.8125rem', color:isC?'#DC2626':isH?'#D97706':'#CA8A04', marginBottom:3 }}>
                    {isC ? '⛔' : isH ? '⚠' : 'ℹ'} {flag.concern}
                  </div>
                  <div style={{ fontSize:'.8rem', color:'#6B7280', lineHeight:1.5 }}>{flag.recommendation}</div>
                </div>
              )
            })}
            {criticalFlags.length > 0 && (
              <label style={{ display:'flex', gap:10, alignItems:'center', cursor:'pointer', background:flagsAcknowledged?'#F0FDF4':'#FEF2F2', borderRadius:10, padding:'10px 14px', border:`1.5px solid ${flagsAcknowledged?'#BBF7D0':'#FECACA'}`, marginTop:4 }}
                onClick={() => setFlagsAcknowledged(v => !v)}>
                <div style={{ width:20, height:20, borderRadius:4, flexShrink:0, border:`2px solid ${flagsAcknowledged?GREEN:'#DC2626'}`, background:flagsAcknowledged?GREEN:'white', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {flagsAcknowledged && <span style={{ color:'white', fontSize:13, fontWeight:700 }}>✓</span>}
                </div>
                <span style={{ fontSize:'.8125rem', color:flagsAcknowledged?GREEN:'#DC2626', fontWeight:600, lineHeight:1.4 }}>
                  {flagsAcknowledged ? '✓ Critical flags reviewed and addressed' : 'I have reviewed and addressed all critical flags above'}
                </span>
              </label>
            )}
          </div>
        )}

        {/* ─── Section 6: Attestation ─── */}
        <SectionCard num={6} title="Attestation">
          {isFinalised ? (
            <div style={{ background:'#F0FDF4', borderRadius:10, padding:'1rem', border:'1px solid #BBF7D0', textAlign:'center' }}>
              <div style={{ fontSize:'1.5rem', marginBottom:6 }}>✓</div>
              <div style={{ fontWeight:800, color:GREEN }}>Notes finalised</div>
              {consult?.notes_finalised_at && <div style={{ fontSize:'.8rem', color:'#6B7280', marginTop:4 }}>{new Date(consult.notes_finalised_at).toLocaleString('en-NZ')}</div>}
              {consult?.notes_completed_seconds && (
                <div style={{ fontSize:'.8rem', color:'#9CA3AF', marginTop:4 }}>Completed in {formatTimer(consult.notes_completed_seconds)}</div>
              )}
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
              <label style={{ display:'flex', gap:12, alignItems:'flex-start', cursor:'pointer' }} onClick={() => setAttested(v => !v)}>
                <div style={{ width:24, height:24, borderRadius:6, flexShrink:0, border:`2px solid ${attested?GREEN:'#D1D5DB'}`, background:attested?GREEN:'white', display:'flex', alignItems:'center', justifyContent:'center', marginTop:2 }}>
                  {attested && <span style={{ color:'white', fontSize:14, fontWeight:700 }}>✓</span>}
                </div>
                <span style={{ fontSize:'.875rem', lineHeight:1.65, color:'#374151' }}>
                  I, <strong>{providerName}</strong>{regNum ? ` (${regNum})` : ''}, confirm that these notes accurately reflect
                  the telehealth consultation I conducted on{' '}
                  <strong>{consult ? new Date(consult.created_at).toLocaleDateString('en-NZ', { day:'numeric', month:'long', year:'numeric' }) : '—'}</strong>{' '}
                  at{' '}
                  <strong>{consult ? new Date(consult.created_at).toLocaleTimeString('en-NZ', { hour:'2-digit', minute:'2-digit', timeZoneName:'short' }) : '—'}</strong>{' '}
                  with <strong>{patientName}</strong> (NHI: {consult?.patient_nhi || '—'}). I conducted this consultation in accordance with MCNZ telehealth standards and accept clinical responsibility for this record.
                </span>
              </label>

              {/* Validation hints */}
              {!s1.trim() && <div style={{ fontSize:'.8rem', color:'#D97706', background:'#FFFBEB', borderRadius:8, padding:'8px 12px' }}>Section 1 (Presenting History) cannot be empty</div>}
              {!workCapacity && <div style={{ fontSize:'.8rem', color:'#D97706', background:'#FFFBEB', borderRadius:8, padding:'8px 12px' }}>Work capacity must be selected</div>}

              {attested && (
                <button onClick={finalise} disabled={!canFinalise || finalising}
                  style={{ width:'100%', minHeight:60, borderRadius:12, border:'none', background:canFinalise?GREEN:'#E2E8F0', color:canFinalise?'white':'#9CA3AF', fontFamily:FF, fontWeight:800, fontSize:'1.1rem', cursor:canFinalise?'pointer':'not-allowed', boxShadow:canFinalise?'0 4px 20px rgba(5,150,105,.35)':'none', transition:'all .2s' }}>
                  {finalising ? 'Finalising…' : '✓ Finalise notes'}
                </button>
              )}

              <div style={{ fontSize:'.75rem', color:'#9CA3AF', lineHeight:1.5 }}>
                {MCNZ_FOOTER}
              </div>
            </div>
          )}
        </SectionCard>

        {/* Auto-save indicator */}
        {lastSaved && !isFinalised && (
          <div style={{ textAlign:'center', fontSize:'.75rem', color:'#9CA3AF', marginTop:'-0.5rem', marginBottom:'1rem' }}>
            Saved {lastSaved.toLocaleTimeString('en-NZ', { hour:'2-digit', minute:'2-digit' })}
          </div>
        )}

        {isFinalised && (
          <button onClick={() => navigate('/clinician/dashboard')}
            style={{ width:'100%', background:TEAL, color:'white', border:'none', borderRadius:12, padding:'14px', fontFamily:FF, fontWeight:700, fontSize:'1rem', cursor:'pointer', minHeight:52 }}>
            ← Back to dashboard
          </button>
        )}
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
