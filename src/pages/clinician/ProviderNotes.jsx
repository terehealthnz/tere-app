import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { getConsultation, getChatMessages, subscribeToChatMessages, sendChatMessage, updateConsultation } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'
import { PrescribeModal, XrayModal } from '../../components/clinician/ClinicalActionModals'

const FF    = 'Plus Jakarta Sans, sans-serif'
const TEAL  = '#0B6E76'
const NAVY  = '#0D2B45'
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
  { value:'async_response',    label:'Message response sent' },
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

function formatDeadline(iso) {
  if (!iso) return ''
  const TZ = 'Pacific/Auckland'
  const d  = new Date(iso)
  const t  = d.toLocaleTimeString('en-NZ', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
  const dlDay  = d.toLocaleDateString('en-CA', { timeZone: TZ })
  const nowDay = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const tomDay = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: TZ })
  if (dlDay === nowDay) return `by ${t} today`
  if (dlDay === tomDay) return `by ${t} tomorrow`
  return `by ${t} ${d.toLocaleDateString('en-NZ', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })}`
}

function buildNZNote(data, consult, actions) {
  const consultDate = consult?.created_at
    ? new Date(consult.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Pacific/Auckland' })
    : ''
  const consultType  = consult?.consultation_type || 'video'
  const typeLabel    = consultType === 'phone' ? 'Phone' : consultType === 'message' ? 'Written message' : 'Video'
  const billing      = data.billing?.serviceCode || ''
  const providerName = consult?.provider_display_name || sessionStorage.getItem('providerDisplayName') || 'Treating clinician'
  const isAcc        = consult?.acc_eligible === 'yes'
  const lines        = []

  lines.push(`TELEHEALTH CONSULTATION — ${typeLabel.toUpperCase()}`)
  lines.push(`Date: ${consultDate}  |  Provider: ${providerName}${billing ? `  |  Billing: ${billing}` : ''}`)
  lines.push('')
  lines.push('SUBJECTIVE')
  lines.push(`Presenting complaint: ${data.presentingHistory || consult?.chief_complaint || '—'}`)
  if (data.medicalHistory) { lines.push(''); lines.push(`Past medical history: ${data.medicalHistory}`) }
  lines.push(`Current medications: ${consult?.medications || 'Nil regular medications'}`)
  lines.push(`Allergies: ${consult?.patient_allergies || 'NKDA'}`)

  const soc = data.social || {}
  const socialItems = []
  if (soc.occupation && soc.occupation !== 'Not disclosed') socialItems.push(`Occupation: ${soc.occupation}`)
  if (soc.tobacco    && soc.tobacco    !== 'Not disclosed') socialItems.push(`Smoking: ${soc.tobacco}`)
  if (soc.alcohol    && soc.alcohol    !== 'Not disclosed') socialItems.push(`Alcohol: ${soc.alcohol}`)
  if (socialItems.length) { lines.push(''); lines.push('Social history:'); socialItems.forEach(s => lines.push(s)) }

  if (isAcc) {
    lines.push('')
    lines.push('ACC injury details:')
    if (data.accSection?.mechanism || consult?.acc_injury_details) lines.push(`Mechanism: ${data.accSection?.mechanism || consult?.acc_injury_details}`)
    if (consult?.acc_injury_date) lines.push(`Date of injury: ${consult.acc_injury_date}`)
    if (consult?.acc_employer)    lines.push(`Employer: ${consult.acc_employer}`)
  }

  lines.push('')
  lines.push('OBJECTIVE')
  lines.push('Examination (telehealth visual assessment):')
  if (data.generalAppearance) lines.push(data.generalAppearance)
  if (data.visibleFindings)   lines.push(data.visibleFindings)
  if (!data.generalAppearance && !data.visibleFindings) {
    lines.push('Full physical examination not possible via telehealth. Assessment based on history and visual observation.')
  }

  const vitals = consult?.vitals
  if (vitals && typeof vitals === 'object' && !vitals.skipped && Object.values(vitals).some(Boolean)) {
    const vParts = []
    const hr   = vitals.heart_rate || vitals.hr
    const bp   = vitals.blood_pressure || vitals.bp
    const rr   = vitals.respiratory_rate || vitals.rr
    const spo2 = vitals.spo2
    const temp = vitals.temperature
    const gcs  = vitals.gcs
    if (hr)   vParts.push(`HR ${hr}`)
    if (bp)   vParts.push(`BP ${bp}`)
    if (spo2) vParts.push(`SpO₂ ${spo2}%`)
    if (rr)   vParts.push(`RR ${rr}`)
    if (temp) vParts.push(`Temp ${temp}°C`)
    if (gcs)  vParts.push(`GCS ${gcs}`)
    if (vParts.length) lines.push(`Vitals (captured via Tere vitals system): ${vParts.join(', ')}`)
  }

  lines.push('')
  lines.push('ASSESSMENT')
  if (data.icd10Label || data.icd10Code) lines.push(`Diagnosis: ${data.icd10Label || ''}${data.icd10Code ? ` (ICD-10: ${data.icd10Code})` : ''}`)
  if (isAcc && data.accSection?.readCodeSuggestion) lines.push(`ACC Read code: ${data.accSection.readCodeSuggestion}${data.accSection.readCodeLabel ? ` — ${data.accSection.readCodeLabel}` : ''}`)
  if (data.mdm) { lines.push(''); lines.push('Clinical reasoning:'); lines.push(data.mdm) }

  lines.push('')
  lines.push('PLAN')
  const rxItems = actions.filter(a => a.type === 'prescription')
  const xrItems = actions.filter(a => a.type === 'radiology')
  let planNum = 1
  rxItems.forEach(rx => lines.push(`${planNum++}. Prescription: ${rx.medication || rx.drug || rx.name || 'medication prescribed'}`))
  xrItems.forEach(xr => lines.push(`${planNum++}. Radiology: ${xr.type_of_scan || xr.body_part || xr.name || 'imaging requested'}`))
  if (data.planItems?.length) data.planItems.forEach(item => lines.push(`${planNum++}. ${item}`))
  else if (data.plan) lines.push(data.plan)
  if (!rxItems.length && !xrItems.length && !data.planItems?.length && !data.plan) lines.push('[Complete plan]')
  if (data.returnPrecautions) { lines.push(''); lines.push(`Return precautions: ${data.returnPrecautions}`) }

  lines.push('')
  lines.push('---')
  lines.push('Patient identity confirmed at consultation commencement per MCNZ telehealth guidelines (August 2023).')
  if (isAcc) lines.push('Three-part ACC45 consent (treatment, lodgement, collection of information) obtained at triage registration.')

  return lines.join('\n')
}

export default function ProviderNotes() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const location   = useLocation()

  const [consult,     setConsult]     = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [generating,  setGenerating]  = useState(false)
  const [finalising,  setFinalising]  = useState(false)
  const [finaliseSteps, setFinaliseSteps] = useState([]) // { label, status: 'pending'|'running'|'done'|'error', detail }
  const [finaliseResult, setFinaliseResult] = useState(null) // { accClaimNumber, chargeCents, ... }
  const [genError,    setGenError]    = useState(null)

  // Clinical note
  const [noteText,      setNoteText]      = useState('')
  const [noteConfirmed, setNoteConfirmed] = useState(false)
  const [modals,        setModals]        = useState({ rx: false, xr: false })

  // Work / ACC / outcome
  const [workCapacity,   setWorkCapacity]   = useState('fit')
  const [dutyLevel,      setDutyLevel]      = useState('')
  const [workLimitation, setWorkLimitation] = useState('')
  const [returnDate,     setReturnDate]     = useState('')
  const [accReadCode,    setAccReadCode]    = useState('')
  const [accMechanism,   setAccMechanism]   = useState('')
  const [accBodyPart,    setAccBodyPart]    = useState('')
  const [outcome,        setOutcome]        = useState('')
  const [actualMethod,   setActualMethod]   = useState(() => sessionStorage.getItem('consultationType') || 'video')
  const [attested,       setAttested]       = useState(false)

  // Async message — thread
  const [threadMsgs,   setThreadMsgs]   = useState([])
  const [threadInput,  setThreadInput]  = useState('')
  const [threadSending,setThreadSending]= useState(false)
  const threadScrollRef = useRef(null)
  const threadSubRef    = useRef(null)

  // Async message — response
  const [asyncResponse,   setAsyncResponse]   = useState('')
  const [asyncGenerating, setAsyncGenerating] = useState(false)
  const [asyncPolishing,  setAsyncPolishing]  = useState(false)
  const [asyncSending,    setAsyncSending]    = useState(false)

  // Async message — escalation bottom sheet
  const [escalate,        setEscalate]        = useState(null) // null | 'phone' | 'video' | 'gp' | 'er'
  const [escalateNote,    setEscalateNote]    = useState('')
  const [escalateSending, setEscalateSending] = useState(false)

  const actionsRef    = useRef([])
  const transcriptRef = useRef('')
  const draftKey      = `tere_notes_draft_${id}`

  // Auth
  useEffect(() => {
    if (!sessionStorage.getItem('clinicianAuth')) {
      const saved = getSaved()
      if (saved) restoreDevice(saved)
      else { navigate('/clinician?redirect=/provider'); return }
    }
  }, [navigate])

  // Load consultation + (optionally) generate note
  useEffect(() => {
    async function load() {
      try {
        const data = await getConsultation(id)
        setConsult(data)
        setActualMethod(data.consultation_type || sessionStorage.getItem('consultationType') || 'video')

        const rs = location.state
        actionsRef.current    = rs?.actions || data.notes_draft?.actions || []
        transcriptRef.current = rs?.transcript || data.transcript || ''

        const localDraft = localStorage.getItem(draftKey)
        if (localDraft) {
          try { restoreDraft(JSON.parse(localDraft)); setLoading(false); return } catch {}
        }
        if (data.notes_finalised && data.notes_final) {
          try {
            const final = typeof data.notes_final === 'string' ? JSON.parse(data.notes_final) : data.notes_final
            restoreDraft(final)
          } catch {}
          setLoading(false)
          return
        }
        if (data.notes_draft && data.note_generated_at) {
          restoreDraft(data.notes_draft)
          setLoading(false)
          return
        }
        setLoading(false)
        await runGenerate(data)
      } catch (e) { console.error(e); setLoading(false) }
    }
    load()
  }, [id])

  // Thread subscription for async message consultations
  useEffect(() => {
    if (!id || !consult) return
    const isAsync = consult.consultation_subtype === 'async_message' || consult.consultation_type === 'message'
    if (!isAsync) return
    getChatMessages(id).then(msgs => setThreadMsgs(msgs || [])).catch(() => {})
    const sub = subscribeToChatMessages(id, msg => {
      setThreadMsgs(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
    })
    threadSubRef.current = sub
    return () => { sub?.unsubscribe?.(); threadSubRef.current = null }
  }, [id, consult?.id])

  // Auto-scroll thread
  useEffect(() => {
    setTimeout(() => {
      if (threadScrollRef.current) threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight
    }, 50)
  }, [threadMsgs])

  function restoreDraft(d) {
    if (d.noteText) {
      setNoteText(d.noteText)
    } else if (d.sections) {
      const s = d.sections, e = d.exam || {}, parts = []
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
    if (d.accReadCode)    setAccReadCode(d.accReadCode)
    if (d.accMechanism)   setAccMechanism(d.accMechanism)
    if (d.accBodyPart)    setAccBodyPart(d.accBodyPart)
    if (d.outcome)        setOutcome(d.outcome)
    if (d.asyncResponse)  setAsyncResponse(d.asyncResponse)
  }

  async function runGenerate(consultData) {
    setGenerating(true)
    setGenError(null)
    try {
      const isAsync = consultData.consultation_subtype === 'async_message' || consultData.consultation_type === 'message'
      const asyncTranscript = isAsync
        ? [
            '[ASYNC MESSAGE CONSULTATION]',
            consultData.async_symptom_detail ? `Patient message: ${consultData.async_symptom_detail}` : '',
            consultData.async_symptom_progression ? `Progression: ${consultData.async_symptom_progression}` : '',
            consultData.async_daily_impact ? `Daily impact: ${consultData.async_daily_impact}` : '',
            consultData.async_requests?.length ? `Requests: ${consultData.async_requests.join(', ')}` : '',
          ].filter(Boolean).join('\n')
        : transcriptRef.current || ''

      const prescriptions = (actionsRef.current || []).filter(a => a.type === 'prescription')
      const referrals     = (actionsRef.current || []).filter(a => a.type === 'radiology')

      const res = await apiFetch('/api/generate-notes', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          transcript: asyncTranscript,
          triage: {
            patientName:          `${consultData.patient_first_name} ${consultData.patient_last_name}`,
            patientDob:           consultData.patient_dob,
            patientNhi:           consultData.patient_nhi,
            chiefComplaint:       consultData.chief_complaint,
            medicalHistory:       consultData.medical_history,
            medications:          consultData.medications,
            allergies:            consultData.patient_allergies,
            accEligible:          consultData.acc_eligible === 'yes',
            accInjuryDescription: consultData.acc_injury_details,
            accInjuryDate:        consultData.acc_injury_date,
            accEmployer:          consultData.acc_employer,
          },
          vitals:          consultData.vitals,
          prescriptions,
          referrals,
          providerName:    sessionStorage.getItem('providerDisplayName') || '',
          consultationDate: consultData.created_at,
        }),
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

      await updateConsultation(id, { note_generated_at: new Date().toISOString() })
    } catch (e) {
      console.error(e)
      setGenError(e.message)
    }
    setGenerating(false)
  }

  // Auto-save draft
  useEffect(() => {
    if (!id || !consult) return
    const draft = { noteText, workCapacity, dutyLevel, workLimitation, returnDate, accReadCode, accMechanism, accBodyPart, outcome, asyncResponse }
    localStorage.setItem(draftKey, JSON.stringify(draft))
  }, [noteText, workCapacity, dutyLevel, workLimitation, returnDate, accReadCode, accMechanism, accBodyPart, outcome, asyncResponse])

  // ── Thread handlers ───────────────────────────────────────────────────────────

  async function sendThreadMsg() {
    const text = threadInput.trim()
    if (!text || threadSending) return
    setThreadSending(true)
    const optId = `opt-${Date.now()}`
    setThreadMsgs(prev => [...prev, { id: optId, sender: 'provider', message: text, created_at: new Date().toISOString() }])
    setThreadInput('')
    try {
      await sendChatMessage({ consultation_id: id, message: text })
      apiFetch('/api/async-consult', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action: 'notify_question', consultationId: id,
          providerName: sessionStorage.getItem('providerDisplayName') || '',
          questionText: text,
        }),
      }).catch(() => {})
    } catch {
      setThreadMsgs(prev => prev.filter(m => m.id !== optId))
      setThreadInput(text)
    } finally { setThreadSending(false) }
  }

  // ── Async response handlers ───────────────────────────────────────────────────

  async function generateAsyncDraft() {
    setAsyncGenerating(true)
    try {
      const res = await apiFetch('/api/async-consult', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'generate_summary', consultationId:id, providerMessages:threadMsgs }),
      })
      const data = await res.json()
      if (data.summary) setAsyncResponse(data.summary)
    } catch {}
    setAsyncGenerating(false)
  }

  async function polishAsyncResponse() {
    if (!asyncResponse.trim()) return
    setAsyncPolishing(true)
    try {
      const res = await apiFetch('/api/async-consult', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'polish_response', consultationId:id, draft:asyncResponse }),
      })
      const data = await res.json()
      if (data.polished) setAsyncResponse(data.polished)
    } catch {}
    setAsyncPolishing(false)
  }

  async function sendAsyncResponse() {
    if (!asyncResponse.trim() || asyncSending) return
    setAsyncSending(true)
    try {
      const providerId   = sessionStorage.getItem('providerId')   || ''
      const providerName = sessionStorage.getItem('providerDisplayName') || ''
      const res = await apiFetch('/api/async-consult', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action: 'respond', consultationId: id,
          responseText: asyncResponse, providerId, providerName,
          isAcc: consult.acc_eligible === 'yes',
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Send failed')

      // Save clinical note as internal record
      if (noteText) {
        const now = new Date().toISOString()
        try {
          await updateConsultation(id, {
            notes_final: JSON.stringify({ noteText, outcome: outcome || 'async_response', actions: actionsRef.current }),
            notes_draft: null,
            note_finalised_by: providerName,
            notes_finalised_at: now,
            acc_read_code: accReadCode || null,
            work_capacity: workCapacity || null,
          })
        } catch {}
      }
      localStorage.removeItem(draftKey)
      navigate('/provider')
    } catch (e) { console.error(e) }
    setAsyncSending(false)
  }

  async function sendEscalate() {
    if (escalateSending || !escalate) return
    setEscalateSending(true)
    try {
      const providerId   = sessionStorage.getItem('providerId')   || ''
      const providerName = sessionStorage.getItem('providerDisplayName') || ''
      if (escalate === 'gp' || escalate === 'er') {
        await apiFetch('/api/async-consult', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'in_person', consultationId:id, referralType:escalate, notes:escalateNote, providerId, providerName }),
        })
      } else {
        await apiFetch('/api/async-consult', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'upgrade_to_live', consultationId:id, consultationType:escalate, message:escalateNote, providerId, providerName }),
        })
      }
      localStorage.removeItem(draftKey)
      navigate('/provider')
    } catch (e) { console.error(e) }
    setEscalateSending(false)
  }

  // ── Standard finalise (video / phone) ────────────────────────────────────────

  const canFinalise = noteConfirmed && !!outcome && attested

  function addAction(action) {
    actionsRef.current = [...actionsRef.current, action]
    setNoteConfirmed(false)
    const label = action.type === 'prescription'
      ? `Rx: ${action.drug}${action.directions ? ` — ${action.directions}` : ''}`
      : action.type === 'radiology'
      ? `${action.investigation}: ${action.bodyPart}${action.urgency ? ` (${action.urgency})` : ''}`
      : null
    if (label) setNoteText(t => t + `\n${label}`)
  }

  function stepUpdate(steps, index, patch) {
    return steps.map((s, i) => i === index ? { ...s, ...patch } : s)
  }

  async function finalise() {
    if (!canFinalise) return
    setFinalising(true)

    const METHOD_PRICES = { video:6500, phone:4500, message:2500 }
    const chargeCents   = isAcc ? 2500 : (METHOD_PRICES[actualMethod] || 6500)

    const steps = [
      { label: 'Saving clinical notes',    status: 'pending' },
      { label: 'Charging patient',         status: 'pending' },
      ...(isAcc ? [{ label: 'Submitting ACC claim', status: 'pending' }] : []),
      { label: 'Sending patient summary',  status: 'pending' },
    ]
    setFinaliseSteps(steps)

    const result = { chargeCents, accClaimNumber: null, chargeError: null, accError: null }
    let currentSteps = [...steps]

    function setStep(i, patch) {
      currentSteps = stepUpdate(currentSteps, i, patch)
      setFinaliseSteps([...currentSteps])
    }

    try {
      // ── Step 0: Save notes ───────────────────────────────────────────────────
      setStep(0, { status: 'running' })
      const now          = new Date().toISOString()
      const providerName = sessionStorage.getItem('providerDisplayName') || ''
      const durationSec  = consult.consultation_duration_seconds ||
        (consult.started_at ? Math.round((Date.now() - new Date(consult.started_at)) / 1000) : null)

      const finalNote = { noteText, workCapacity, dutyLevel, workLimitation, returnDate, accReadCode, accSection:{ mechanism:accMechanism, bodyPart:accBodyPart }, outcome, providerName, attestedAt:now, actions:actionsRef.current }

      try {
        await updateConsultation(id, {
          notes_final:   JSON.stringify(finalNote), notes_draft:null, notes_finalised:true,
          notes_finalised_at:now, note_finalised_by:providerName,
          acc_read_code:accReadCode, work_capacity:workCapacity,
          return_to_work_date: workCapacity !== 'fit' && returnDate ? returnDate : null,
          billing_code: durationSec >= 1800 ? 'CS2T' : 'CS1T',
          outcome, status:'complete', completed_at:consult.completed_at || now,
          consultation_duration_seconds:durationSec, consultation_type:actualMethod,
          payment_amount:chargeCents / 100, is_acc:isAcc,
        })
      } catch (updateErr) { throw updateErr }
      setStep(0, { status: 'done' })

      // ── Step 1: Capture payment ──────────────────────────────────────────────
      setStep(1, { status: 'running' })
      const paymentIntentId = consult.payment_intent_id || sessionStorage.getItem('paymentIntentId')
      if (paymentIntentId) {
        try {
          await apiFetch('/api/capture-payment', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ paymentIntentId, consultationId:id, amount_cents:chargeCents }),
          })
          setStep(1, { status: 'done', detail: `$${(chargeCents/100).toFixed(2)} charged` })
        } catch (e) {
          result.chargeError = e.message
          setStep(1, { status: 'error', detail: 'Charge failed — manual capture needed' })
        }
      } else {
        setStep(1, { status: 'done', detail: 'No payment hold — skipped' })
      }

      // ── Step 2 (conditional): ACC claim ─────────────────────────────────────
      const accStepIdx = isAcc ? 2 : -1
      if (isAcc) {
        setStep(accStepIdx, { status: 'running' })
        try {
          const accRes  = await apiFetch('/api/acc-claims', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
              consultationId:  id,
              providerId:      sessionStorage.getItem('providerId'),
              providerName,
              providerHpi:     sessionStorage.getItem('providerHpiNumber') || '',
              providerType:    'specialist',
            }),
          })
          const accData = await accRes.json()
          if (accData.ok) {
            result.accClaimNumber = accData.claimNumber
            result.accSimulated   = accData.simulated
            setStep(accStepIdx, {
              status: 'done',
              detail: accData.simulated ? `Claim ${accData.claimNumber} (test)` : `Claim ${accData.claimNumber}`,
            })
          } else {
            result.accError = accData.error
            setStep(accStepIdx, { status: 'error', detail: accData.error || 'ACC submission failed' })
          }
        } catch (e) {
          result.accError = e.message
          setStep(accStepIdx, { status: 'error', detail: 'ACC submission error — retry from PMS' })
        }
      }

      // ── Step 3: Patient email ────────────────────────────────────────────────
      const emailStepIdx = isAcc ? 3 : 2
      setStep(emailStepIdx, { status: 'running' })
      if (consult.patient_email) {
        apiFetch('/api/send-email', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            to:consult.patient_email,
            name:`${consult.patient_first_name} ${consult.patient_last_name}`,
            noteText, notes:{}, actions:actionsRef.current,
            consult:{ chief_complaint:consult.chief_complaint },
            consultationId:id,
            accClaimNumber: result.accClaimNumber || undefined,
          }),
        }).catch(() => {})
      }
      setStep(emailStepIdx, { status: 'done', detail: consult.patient_email || 'No email on file' })

      localStorage.removeItem(draftKey)
      setFinaliseResult({ ...result, steps: currentSteps })
    } catch (e) {
      console.error('finalise error:', e)
      setFinalising(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

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

  const isAcc           = consult.acc_eligible === 'yes'
  const isFinalised     = !!consult.notes_finalised
  const isAsyncMessage  = consult.consultation_subtype === 'async_message' || consult.consultation_type === 'message'
  const isAlreadyResponded = isAsyncMessage && !!consult.async_response
  const patientName     = `${consult.patient_first_name} ${consult.patient_last_name}`
  const providerName    = sessionStorage.getItem('providerDisplayName') || 'Treating clinician'
  const asyncDeadline   = consult.async_deadline
  const isOverdue       = asyncDeadline && !isAlreadyResponded && new Date(asyncDeadline) < Date.now()

  return (
    <div style={{ minHeight:'100dvh', background:'#F0F2F5', fontFamily:FF }}>

      {/* Finalising progress overlay */}
      {finalising && finaliseSteps.length > 0 && !finaliseResult && (
        <div style={{ position:'fixed', inset:0, background:'rgba(13,43,69,.95)', zIndex:999, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'1.25rem', padding:'2rem' }}>
          <div style={{ width:48, height:48, border:'4px solid rgba(255,255,255,.2)', borderTopColor:'#D4EEF0', borderRadius:'50%', animation:'spin .8s linear infinite', marginBottom:'.5rem' }} />
          <div style={{ color:'white', fontSize:'1.125rem', fontWeight:800, marginBottom:'.25rem' }}>Finalising consultation…</div>
          <div style={{ background:'rgba(255,255,255,.07)', borderRadius:16, padding:'1.25rem 1.5rem', width:'100%', maxWidth:360, display:'flex', flexDirection:'column', gap:'.75rem' }}>
            {finaliseSteps.map((step, i) => (
              <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:'.75rem' }}>
                <div style={{ width:22, height:22, borderRadius:'50%', flexShrink:0, marginTop:1, display:'flex', alignItems:'center', justifyContent:'center',
                  background: step.status==='done'?'#059669':step.status==='error'?'#DC2626':step.status==='running'?'transparent':'rgba(255,255,255,.15)',
                  border: step.status==='running'?'2px solid rgba(255,255,255,.4)':'2px solid transparent',
                }}>
                  {step.status==='done'  && <span style={{color:'white',fontSize:12,fontWeight:700}}>✓</span>}
                  {step.status==='error' && <span style={{color:'white',fontSize:12,fontWeight:700}}>✕</span>}
                  {step.status==='running' && <div style={{width:8,height:8,borderRadius:'50%',background:'rgba(255,255,255,.6)',animation:'pulse 1s ease-in-out infinite'}} />}
                  {step.status==='pending' && <div style={{width:6,height:6,borderRadius:'50%',background:'rgba(255,255,255,.25)'}} />}
                </div>
                <div>
                  <div style={{ color: step.status==='done'?'#6EE7B7':step.status==='error'?'#FCA5A5':step.status==='running'?'white':'rgba(255,255,255,.45)', fontWeight:step.status==='running'?700:400, fontSize:'.9375rem' }}>
                    {step.label}
                  </div>
                  {step.detail && <div style={{ fontSize:'.75rem', color:'rgba(255,255,255,.4)', marginTop:2 }}>{step.detail}</div>}
                </div>
              </div>
            ))}
          </div>
          <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}`}</style>
        </div>
      )}

      {/* Finalise result overlay */}
      {finaliseResult && (
        <div style={{ position:'fixed', inset:0, background:'rgba(13,43,69,.97)', zIndex:999, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'2rem', gap:'1rem' }}>
          <div style={{ fontSize:'3rem', marginBottom:'.25rem' }}>✓</div>
          <div style={{ color:'white', fontSize:'1.25rem', fontWeight:800 }}>Consultation complete</div>
          <div style={{ background:'rgba(255,255,255,.07)', borderRadius:16, padding:'1.25rem 1.5rem', width:'100%', maxWidth:360, display:'flex', flexDirection:'column', gap:'.625rem' }}>
            {finaliseResult.accClaimNumber && (
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ color:'rgba(255,255,255,.6)', fontSize:'.875rem' }}>ACC claim</span>
                <span style={{ color:'#6EE7B7', fontWeight:700, fontSize:'.9375rem' }}>
                  {finaliseResult.accClaimNumber}{finaliseResult.accSimulated ? ' (test)' : ''}
                </span>
              </div>
            )}
            {finaliseResult.accError && (
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ color:'rgba(255,255,255,.6)', fontSize:'.875rem' }}>ACC claim</span>
                <span style={{ color:'#FCA5A5', fontWeight:600, fontSize:'.8125rem' }}>Failed — retry from PMS tab</span>
              </div>
            )}
            {finaliseResult.chargeCents > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ color:'rgba(255,255,255,.6)', fontSize:'.875rem' }}>Charged</span>
                <span style={{ color:'white', fontWeight:700 }}>${(finaliseResult.chargeCents/100).toFixed(2)}</span>
              </div>
            )}
            {finaliseResult.chargeError && (
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ color:'rgba(255,255,255,.6)', fontSize:'.875rem' }}>Payment</span>
                <span style={{ color:'#FCA5A5', fontSize:'.8125rem' }}>Failed — capture manually</span>
              </div>
            )}
          </div>
          <button onClick={() => navigate('/provider')}
            style={{ marginTop:'.5rem', background:TEAL, color:'white', border:'none', padding:'14px 32px', borderRadius:12, fontFamily:FF, fontWeight:800, fontSize:'1rem', cursor:'pointer', minHeight:52 }}>
            ← Next patient
          </button>
        </div>
      )}

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
          <div onClick={() => navigate('/clinician/dashboard')}
            style={{ fontFamily:'Cormorant Garamond, serif', fontStyle:'italic', color:'#D4EEF0', fontSize:'1.1rem', lineHeight:1, cursor:'pointer', userSelect:'none' }}
            role="link" aria-label="Tere Health — go to dashboard">Tere</div>
          <div style={{ color:'rgba(255,255,255,.45)', fontSize:'.6875rem' }}>
            {isAsyncMessage ? '💬 Message' : 'Clinical notes'}
          </div>
        </div>
        {isFinalised || isAlreadyResponded
          ? <span style={{ background:'#065F46', color:'#6EE7B7', fontSize:'.6875rem', fontWeight:700, padding:'4px 10px', borderRadius:99 }}>DONE</span>
          : isOverdue
          ? <span style={{ background:'#DC2626', color:'white', fontSize:'.6875rem', fontWeight:700, padding:'4px 10px', borderRadius:99 }}>OVERDUE</span>
          : <div style={{ width:72 }} />
        }
      </div>

      <div style={{ padding:'1rem', paddingBottom:24 }}>

        {/* Patient header */}
        <div style={{ background:'white', borderRadius:14, padding:'1.25rem', marginBottom:12, border:'1px solid #E2E8F0', borderTop:`4px solid ${isAsyncMessage ? '#1D4ED8' : TEAL}` }}>
          <h2 style={{ fontSize:'1.25rem', fontWeight:800, color:NAVY, margin:'0 0 4px' }}>{patientName}</h2>
          <div style={{ fontSize:'.8125rem', color:'#6B7280', marginBottom:10 }}>
            NHI: {consult.patient_nhi || '—'} · {new Date(consult.created_at).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland' })}
            {isAsyncMessage && (
              <span style={{ marginLeft:8, background:'#DBEAFE', color:'#1D4ED8', borderRadius:99, padding:'1px 8px', fontWeight:700, fontSize:'.75rem' }}>
                💬 Message consultation
              </span>
            )}
          </div>
          <div style={{ background:'#F8FAFC', borderRadius:8, padding:'10px 12px', fontSize:'.9375rem', color:'#374151' }}>
            {consult.chief_complaint}
          </div>
          {genError && (
            <div style={{ marginTop:10, background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 12px', fontSize:'.8125rem', color:'#DC2626', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span>Generation failed</span>
              <button onClick={() => runGenerate(consult)} style={{ background:'#DC2626', color:'white', border:'none', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontFamily:FF, fontSize:'.75rem', fontWeight:700 }}>Retry</button>
            </div>
          )}
        </div>

        {/* ── ASYNC MESSAGE — Patient message panel ───────────────────────────── */}
        {isAsyncMessage && (
          <div style={{ background:'white', borderRadius:14, padding:'1.25rem', marginBottom:12, border:'1.5px solid #BFDBFE' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#1D4ED8' }}>
                Patient message
              </div>
              {asyncDeadline && (
                <div style={{ fontSize:'.75rem', fontWeight:600, color: isOverdue ? '#DC2626' : '#6B7280' }}>
                  {isAlreadyResponded ? '✓ Responded' : isOverdue ? '⚠ Overdue' : `Due ${formatDeadline(asyncDeadline)}`}
                </div>
              )}
            </div>

            {consult.async_symptom_detail ? (
              <div style={{ background:'#EFF6FF', borderRadius:10, padding:'12px 14px', marginBottom:10, fontSize:'.9375rem', color:'#1A2A33', lineHeight:1.75, whiteSpace:'pre-wrap' }}>
                {consult.async_symptom_detail}
              </div>
            ) : (
              <div style={{ color:'#9CA3AF', fontSize:'.875rem', marginBottom:10, fontStyle:'italic' }}>No symptom detail provided</div>
            )}

            {(consult.async_symptom_progression || consult.async_daily_impact) && (
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                {consult.async_symptom_progression && (
                  <span style={{ background:'#EEF2FF', color:'#4338CA', fontSize:'.8125rem', padding:'4px 10px', borderRadius:99, fontWeight:600 }}>
                    {consult.async_symptom_progression}
                  </span>
                )}
                {consult.async_daily_impact && (
                  <span style={{ background:'#FEF9EC', color:'#92400E', fontSize:'.8125rem', padding:'4px 10px', borderRadius:99, fontWeight:600 }}>
                    {consult.async_daily_impact}
                  </span>
                )}
              </div>
            )}

            {consult.async_requests?.length > 0 && (
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
                <span style={{ fontSize:'.6875rem', color:'#9CA3AF', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', alignSelf:'center', marginRight:2 }}>Requests:</span>
                {consult.async_requests.map(r => (
                  <span key={r} style={{ background:'#EFF9F9', color:TEAL, fontSize:'.75rem', padding:'3px 9px', borderRadius:99, border:`1px solid ${TEAL}33`, fontWeight:600 }}>
                    {r}
                  </span>
                ))}
              </div>
            )}

            {consult.async_photo_urls?.length > 0 && (
              <div>
                <div style={{ fontSize:'.6875rem', color:'#9CA3AF', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>
                  Photos ({consult.async_photo_urls.length})
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {consult.async_photo_urls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer"
                      style={{ display:'block', borderRadius:8, overflow:'hidden', border:'1px solid #E2E8F0', flexShrink:0 }}>
                      <img src={url} alt={`Patient photo ${i+1}`}
                        style={{ width:90, height:90, objectFit:'cover', display:'block' }} />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ASYNC MESSAGE — Thread ───────────────────────────────────────────── */}
        {isAsyncMessage && !isAlreadyResponded && (
          <div style={{ background:NAVY, borderRadius:14, marginBottom:12, overflow:'hidden' }}>
            <div style={{ padding:'10px 14px', borderBottom:'1px solid rgba(255,255,255,.08)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'rgba(212,238,240,.5)' }}>
                Thread
              </div>
              <div style={{ fontSize:'.6875rem', color:'rgba(212,238,240,.25)' }}>Messages here notify patient by email</div>
            </div>

            <div ref={threadScrollRef} style={{ minHeight:72, maxHeight:260, overflowY:'auto', WebkitOverflowScrolling:'touch', padding:'10px 12px', display:'flex', flexDirection:'column', gap:6 }}>
              {threadMsgs.length === 0 && (
                <div style={{ color:'rgba(212,238,240,.25)', fontSize:'.8125rem', textAlign:'center', padding:'16px 0' }}>
                  No messages yet
                </div>
              )}
              {threadMsgs.map(msg => {
                const isProvider = msg.sender === 'provider'
                const isOpt      = String(msg.id).startsWith('opt-')
                return (
                  <div key={msg.id} style={{ display:'flex', justifyContent: isProvider ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth:'80%',
                      background: isProvider ? TEAL : 'rgba(255,255,255,.12)',
                      color:'white',
                      borderRadius: isProvider ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                      padding:'7px 11px',
                      fontSize:'.875rem',
                      lineHeight:1.55,
                      opacity: isOpt ? .6 : 1,
                      transition:'opacity .2s',
                    }}>
                      <div style={{ fontSize:'.625rem', opacity:.5, marginBottom:2 }}>
                        {isProvider ? 'You' : patientName} · {new Date(msg.created_at).toLocaleTimeString('en-NZ', { hour:'2-digit', minute:'2-digit' })}
                      </div>
                      {msg.message}
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ padding:'8px 10px', borderTop:'1px solid rgba(255,255,255,.08)', display:'flex', gap:6, alignItems:'flex-end' }}>
              <textarea
                value={threadInput}
                onChange={e => setThreadInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendThreadMsg() } }}
                placeholder="Ask a clarifying question… (Enter to send)"
                rows={1}
                style={{ flex:1, background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.15)', borderRadius:8, padding:'8px 12px', color:'white', fontFamily:FF, fontSize:'.9375rem', outline:'none', resize:'none', maxHeight:80, lineHeight:1.4, boxSizing:'border-box' }}
                onInput={e => { e.target.style.height='auto'; e.target.style.height = Math.min(e.target.scrollHeight,80)+'px' }}
              />
              <button onClick={sendThreadMsg} disabled={threadSending || !threadInput.trim()}
                style={{ width:40, height:40, borderRadius:8, background: threadInput.trim() ? TEAL : 'rgba(255,255,255,.1)', border:'none', color:'white', fontWeight:700, fontSize:'1.1rem', cursor: threadInput.trim() ? 'pointer' : 'default', opacity: threadSending ? .5 : 1, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {threadSending ? '…' : '↑'}
              </button>
            </div>
          </div>
        )}

        {/* ── ASYNC MESSAGE — Response composer ───────────────────────────────── */}
        {isAsyncMessage && !isAlreadyResponded && (
          <div style={{ background:'white', borderRadius:14, marginBottom:12, border:'1.5px solid #BBF7D0', overflow:'hidden' }}>
            <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #F3F4F6' }}>
              <span style={{ fontWeight:700, fontSize:'.9375rem', color:NAVY }}>Response to patient</span>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={generateAsyncDraft} disabled={asyncGenerating}
                  style={{ background:'#EFF9F9', border:`1px solid ${TEAL}44`, color:TEAL, borderRadius:8, padding:'5px 10px', fontSize:'.75rem', fontWeight:700, cursor:'pointer', fontFamily:FF, minHeight:34, opacity: asyncGenerating ? .6 : 1 }}>
                  {asyncGenerating ? 'Drafting…' : '✨ AI draft'}
                </button>
                {asyncResponse.trim() && (
                  <button onClick={polishAsyncResponse} disabled={asyncPolishing}
                    style={{ background:'#EFF9F9', border:`1px solid ${TEAL}44`, color:TEAL, borderRadius:8, padding:'5px 10px', fontSize:'.75rem', fontWeight:700, cursor:'pointer', fontFamily:FF, minHeight:34, opacity: asyncPolishing ? .6 : 1 }}>
                    {asyncPolishing ? 'Polishing…' : '✨ Polish'}
                  </button>
                )}
              </div>
            </div>

            <textarea
              value={asyncResponse}
              onChange={e => setAsyncResponse(e.target.value)}
              rows={9}
              placeholder="Write your response to the patient here…&#10;&#10;Tip: use 'AI draft' to generate a response based on the patient's message and your thread messages, then edit as needed."
              style={{ width:'100%', boxSizing:'border-box', border:'none', padding:'12px 16px', fontFamily:FF, fontSize:'.9375rem', lineHeight:1.75, resize:'vertical', outline:'none', color:'#1A2A33' }}
            />

            <div style={{ padding:'0 16px 16px', display:'flex', flexDirection:'column', gap:8 }}>
              {/* Primary — send response */}
              <button
                onClick={sendAsyncResponse}
                disabled={!asyncResponse.trim() || asyncSending}
                style={{ width:'100%', minHeight:56, borderRadius:12, border:'none', background: asyncResponse.trim() ? GREEN : '#E2E8F0', color: asyncResponse.trim() ? 'white' : '#9CA3AF', fontFamily:FF, fontWeight:800, fontSize:'1.0625rem', cursor: asyncResponse.trim() ? 'pointer' : 'not-allowed', boxShadow: asyncResponse.trim() ? '0 4px 16px rgba(5,150,105,.3)' : 'none', transition:'all .2s' }}>
                {asyncSending ? 'Sending…' : `✓ Send response · $25 charged`}
              </button>

              {/* Escalation row */}
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => { setEscalate('phone'); setEscalateNote('') }}
                  style={{ flex:1, minHeight:44, borderRadius:10, border:'1.5px solid #E2E8F0', background:'white', color:'#6B7280', fontFamily:FF, fontSize:'.8125rem', fontWeight:600, cursor:'pointer' }}>
                  📞 Upgrade to call
                </button>
                <button onClick={() => { setEscalate('gp'); setEscalateNote('') }}
                  style={{ flex:1, minHeight:44, borderRadius:10, border:'1.5px solid #E2E8F0', background:'white', color:'#6B7280', fontFamily:FF, fontSize:'.8125rem', fontWeight:600, cursor:'pointer' }}>
                  🏥 Refer in person
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── ASYNC MESSAGE — Already responded ───────────────────────────────── */}
        {isAsyncMessage && isAlreadyResponded && (
          <div style={{ background:'#F0FDF4', borderRadius:14, padding:'1.25rem', marginBottom:12, border:'1.5px solid #BBF7D0' }}>
            <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#065F46', marginBottom:10 }}>
              ✓ Response sent {consult.async_responded_at ? new Date(consult.async_responded_at).toLocaleString('en-NZ', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : ''}
            </div>
            <div style={{ background:'white', borderRadius:10, padding:'12px 14px', fontSize:'.9375rem', color:'#1A2A33', lineHeight:1.75, whiteSpace:'pre-wrap' }}>
              {consult.async_response}
            </div>
          </div>
        )}

        {/* Rx / XR actions */}
        <div style={{ background:'white', borderRadius:14, padding:'1rem 1.25rem', marginBottom:12, border:'1px solid #E2E8F0' }}>
          <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#9CA3AF', marginBottom:10 }}>Actions</div>
          <div style={{ display:'flex', gap:8, marginBottom: actionsRef.current.length ? 10 : 0 }}>
            {!isFinalised && !isAlreadyResponded && (
              <>
                <button onClick={() => setModals(m => ({ ...m, rx:true }))}
                  style={{ flex:1, minHeight:44, borderRadius:10, border:'1.5px solid #E2E8F0', background:'white', color:NAVY, fontFamily:FF, fontSize:'.875rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  💊 Prescribe
                </button>
                <button onClick={() => setModals(m => ({ ...m, xr:true }))}
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
          {!isFinalised && !isAlreadyResponded && actionsRef.current.length === 0 && (
            <div style={{ fontSize:'.8125rem', color:'#9CA3AF', fontStyle:'italic' }}>No prescriptions or imaging ordered yet</div>
          )}
        </div>

        {/* Clinical note — labelled 'internal' for async */}
        <div style={{ background:'white', borderRadius:14, border:`1.5px solid ${noteConfirmed?'#BBF7D0':'#E2E8F0'}`, marginBottom:12, overflow:'hidden' }}>
          <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:10 }}>
            {noteConfirmed
              ? <span style={{ width:22, height:22, borderRadius:'50%', background:GREEN, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><span style={{ color:'white', fontSize:12, fontWeight:700 }}>✓</span></span>
              : <span style={{ width:22, height:22, borderRadius:'50%', border:'2px solid #E2E8F0', display:'inline-block', flexShrink:0 }} />
            }
            <span style={{ fontWeight:700, fontSize:'.9375rem', color:noteConfirmed?GREEN:NAVY }}>
              {isAsyncMessage ? 'Internal clinical note' : 'Clinical note'}
            </span>
            {isAsyncMessage && <span style={{ fontSize:'.6875rem', color:'#9CA3AF' }}>— not sent to patient</span>}
            {generating && <span style={{ fontSize:'.6875rem', color:'#9CA3AF', marginLeft:4 }}>Generating…</span>}
          </div>
          <div style={{ borderTop:'1px solid #F3F4F6' }}>
            <textarea
              value={noteText}
              onChange={e => { setNoteText(e.target.value); setNoteConfirmed(false) }}
              readOnly={isFinalised || isAlreadyResponded}
              rows={22}
              style={{ width:'100%', boxSizing:'border-box', border:'none', padding:'12px 16px', fontFamily:FF, fontSize:'.9375rem', lineHeight:1.7, resize:'vertical', outline:'none', color:'#1A2A33', background:noteConfirmed?'#F0FDF4':isFinalised||isAlreadyResponded?'#F8FAFC':'white' }}
            />
            {!noteConfirmed && !isFinalised && !isAlreadyResponded && (
              <div style={{ padding:'0 16px 14px' }}>
                <button onClick={() => setNoteConfirmed(true)}
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
              { val:'fit',      label:'Fit',      color:GREEN,     bg:'#F0FDF4', border:'#BBF7D0' },
              { val:'modified', label:'Modified', color:'#D97706', bg:'#FFFBEB', border:'#FDE68A' },
              { val:'unfit',    label:'Unfit',    color:'#DC2626', bg:'#FEF2F2', border:'#FECACA' },
            ].map(o => (
              <button key={o.val} onClick={() => !(isFinalised||isAlreadyResponded) && setWorkCapacity(o.val)}
                style={{ flex:1, minHeight:52, borderRadius:10, border:`1.5px solid ${workCapacity===o.val?o.border:'#E2E8F0'}`, background:workCapacity===o.val?o.bg:'white', color:workCapacity===o.val?o.color:'#9CA3AF', fontFamily:FF, fontSize:'.8125rem', fontWeight:700, cursor:isFinalised||isAlreadyResponded?'default':'pointer' }}>
                {o.label}
              </button>
            ))}
          </div>

          {workCapacity === 'modified' && (
            <div style={{ marginTop:12 }}>
              <label style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#D97706', display:'block', marginBottom:8 }}>Duty level</label>
              <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                {[{val:'sedentary',label:'Sedentary'},{val:'light',label:'Light'},{val:'moderate',label:'Moderate'}].map(o => (
                  <button key={o.val} onClick={() => !(isFinalised||isAlreadyResponded) && setDutyLevel(o.val)}
                    style={{ flex:1, minHeight:44, borderRadius:8, border:`1.5px solid ${dutyLevel===o.val?'#F59E0B':'#E2E8F0'}`, background:dutyLevel===o.val?'#FFFBEB':'white', color:dutyLevel===o.val?'#D97706':'#9CA3AF', fontFamily:FF, fontSize:'.8125rem', fontWeight:700, cursor:isFinalised||isAlreadyResponded?'default':'pointer' }}>
                    {o.label}
                  </button>
                ))}
              </div>
              <label style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#9CA3AF', display:'block', marginBottom:6 }}>Limitations / restrictions</label>
              <textarea value={workLimitation} onChange={e => setWorkLimitation(e.target.value)} readOnly={isFinalised||isAlreadyResponded} rows={3}
                placeholder="e.g. No lifting over 5kg, no prolonged standing, avoid repetitive bending…"
                style={{ width:'100%', boxSizing:'border-box', border:'1.5px solid #E2E8F0', borderRadius:8, padding:'10px 12px', fontFamily:FF, fontSize:'.9375rem', lineHeight:1.6, resize:'none', outline:'none', background:isFinalised||isAlreadyResponded?'#F8FAFC':'white' }} />
            </div>
          )}

          {workCapacity !== 'fit' && (
            <div style={{ marginTop:10 }}>
              <label style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#9CA3AF', display:'block', marginBottom:6 }}>Return to work date</label>
              <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} readOnly={isFinalised||isAlreadyResponded}
                style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, fontFamily:FF, fontSize:'1rem', outline:'none', background:isFinalised||isAlreadyResponded?'#F8FAFC':'white' }} />
            </div>
          )}
        </div>

        {/* ACC section — only for video/phone; message consultations cannot lodge ACC claims */}
        {isAcc && !isAsyncMessage && (
          <div style={{ background:'#EFF6FF', borderRadius:14, padding:'1.25rem', marginBottom:12, border:'1px solid #BFDBFE' }}>
            <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#1D4ED8', marginBottom:12 }}>ACC section</div>
            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#3B82F6', display:'block', marginBottom:6 }}>Read code</label>
              <select value={accReadCode} onChange={e => setAccReadCode(e.target.value)} disabled={isFinalised||isAlreadyResponded}
                style={{ width:'100%', padding:'10px 12px', border:'1.5px solid #BFDBFE', borderRadius:8, fontFamily:FF, fontSize:'1rem', outline:'none', background:isFinalised||isAlreadyResponded?'#F0F6FF':'white', WebkitAppearance:'none', appearance:'none' }}>
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
                <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} readOnly={isFinalised||isAlreadyResponded}
                  style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', border:'1.5px solid #BFDBFE', borderRadius:8, fontFamily:FF, fontSize:'1rem', outline:'none', background:isFinalised||isAlreadyResponded?'#F0F6FF':'white' }} />
              </div>
            ))}
            <div style={{ fontSize:'.8125rem', color:'#1D4ED8', fontWeight:600 }}>✓ Three-part ACC45 consent obtained at triage</div>
          </div>
        )}

        {/* Outcome */}
        <div style={{ background:'white', borderRadius:14, padding:'1.25rem', marginBottom:12, border:`1.5px solid ${!outcome&&!isFinalised&&!isAlreadyResponded?'#FDE68A':'#E2E8F0'}` }}>
          <label style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#9CA3AF', display:'block', marginBottom:10 }}>
            Consultation outcome {!isAsyncMessage && <span style={{ color:'#DC2626' }}>*</span>}
          </label>
          <select value={outcome} onChange={e => setOutcome(e.target.value)} disabled={isFinalised||isAlreadyResponded}
            style={{ width:'100%', padding:'12px', border:`1.5px solid ${!outcome&&!isAsyncMessage?'#FDE68A':'#E2E8F0'}`, borderRadius:10, fontFamily:FF, fontSize:'1rem', color:outcome?'#1A2A33':'#9CA3AF', background:isFinalised||isAlreadyResponded?'#F8FAFC':'white', outline:'none', WebkitAppearance:'none', appearance:'none' }}>
            <option value="">Select outcome…</option>
            {OUTCOMES.filter(o => !isAsyncMessage || o.value !== 'acc_lodged').map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Method selector — video / phone only */}
        {!isAsyncMessage && !isFinalised && (
          <div style={{ background:'white', borderRadius:14, padding:'1.25rem', marginBottom:12, border:'1px solid #E2E8F0' }}>
            <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#9CA3AF', marginBottom:10 }}>
              Method used <span style={{ color:'#9CA3AF', fontWeight:400, textTransform:'none', letterSpacing:0 }}>— patient charged this amount</span>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {[
                { val:'video', label:'Video', price: isAcc ? 25 : 65 },
                { val:'phone', label:'Phone', price: isAcc ? 25 : 45 },
                { val:'message', label:'Message', price: 25 },
              ].map(o => (
                <button key={o.val} onClick={() => setActualMethod(o.val)}
                  style={{ flex:1, minHeight:52, borderRadius:10, border:`1.5px solid ${actualMethod===o.val?TEAL:'#E2E8F0'}`, background:actualMethod===o.val?'#EFF9F9':'white', color:actualMethod===o.val?TEAL:'#9CA3AF', fontFamily:FF, fontSize:'.8125rem', fontWeight:700, cursor:'pointer' }}>
                  <div>{o.val==='video'?'📹':o.val==='phone'?'📞':'💬'} {o.label}</div>
                  <div style={{ fontSize:'.6875rem', fontWeight:400, marginTop:2 }}>${o.price}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Attestation + Finalise — video / phone only */}
        {!isAsyncMessage && (
          !isFinalised ? (
            <div style={{ background:attested?'#F0FDF4':'white', borderRadius:14, padding:'1.25rem', marginBottom:12, border:`1.5px solid ${attested?'#BBF7D0':'#E2E8F0'}` }}>
              <label style={{ display:'flex', gap:12, alignItems:'flex-start', cursor:'pointer', marginBottom:'1rem' }} onClick={() => setAttested(v => !v)}>
                <div style={{ width:24, height:24, borderRadius:6, flexShrink:0, border:`2px solid ${attested?GREEN:'#D1D5DB'}`, background:attested?GREEN:'white', display:'flex', alignItems:'center', justifyContent:'center', marginTop:2 }}>
                  {attested && <span style={{ color:'white', fontSize:14, fontWeight:700 }}>✓</span>}
                </div>
                <span style={{ fontSize:'.875rem', lineHeight:1.6, color:'#374151' }}>
                  I, <strong>{providerName}</strong>, confirm these notes accurately reflect the telehealth consultation I conducted with <strong>{patientName}</strong> and accept clinical responsibility for this record.
                </span>
              </label>
              <button onClick={finalise} disabled={!canFinalise || finalising}
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
          )
        )}

        {/* Done banner — async */}
        {isAsyncMessage && isAlreadyResponded && (
          <div style={{ background:'#F0FDF4', borderRadius:14, padding:'1.5rem', border:'1.5px solid #BBF7D0', textAlign:'center', marginBottom:12 }}>
            <div style={{ fontSize:'2rem', marginBottom:8 }}>✓</div>
            <div style={{ fontWeight:800, color:GREEN, fontSize:'1.125rem', marginBottom:4 }}>Response sent to patient</div>
            {consult.async_responded_at && <div style={{ fontSize:'.875rem', color:'#6B7280' }}>{new Date(consult.async_responded_at).toLocaleString('en-NZ')}</div>}
            <button onClick={() => navigate('/provider')}
              style={{ marginTop:'1rem', background:TEAL, color:'white', border:'none', padding:'12px 24px', borderRadius:10, fontFamily:FF, fontWeight:700, fontSize:'.9375rem', cursor:'pointer', minHeight:48 }}>
              ← Back to queue
            </button>
          </div>
        )}

      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Escalation bottom sheet ─────────────────────────────────────────────── */}
      {escalate && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:200, display:'flex', alignItems:'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) { setEscalate(null); setEscalateNote('') } }}>
          <div style={{ background:'white', borderRadius:'18px 18px 0 0', padding:'1.5rem 1.25rem calc(1.5rem + env(safe-area-inset-bottom))', width:'100%', maxWidth:520, margin:'0 auto' }}>

            <div style={{ fontWeight:800, fontSize:'1.0625rem', color:NAVY, marginBottom:16 }}>
              {escalate === 'gp' || escalate === 'er' ? 'Refer patient in person' : 'Upgrade to live call'}
            </div>

            {/* Call type toggle */}
            {(escalate === 'phone' || escalate === 'video') && (
              <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                {[{val:'phone',label:'📞 Phone call'},{val:'video',label:'📹 Video call'}].map(o => (
                  <button key={o.val} onClick={() => setEscalate(o.val)}
                    style={{ flex:1, minHeight:44, borderRadius:10, border:`1.5px solid ${escalate===o.val?TEAL:'#E2E8F0'}`, background:escalate===o.val?'#EFF9F9':'white', color:escalate===o.val?TEAL:'#6B7280', fontFamily:FF, fontSize:'.9rem', fontWeight:700, cursor:'pointer' }}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}

            {/* In-person type toggle */}
            {(escalate === 'gp' || escalate === 'er') && (
              <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                {[{val:'gp',label:'🏥 GP'},{val:'er',label:'🚨 Emergency Dept'}].map(o => (
                  <button key={o.val} onClick={() => setEscalate(o.val)}
                    style={{ flex:1, minHeight:44, borderRadius:10, border:`1.5px solid ${escalate===o.val?'#DC2626':'#E2E8F0'}`, background:escalate===o.val?'#FEF2F2':'white', color:escalate===o.val?'#DC2626':'#6B7280', fontFamily:FF, fontSize:'.9rem', fontWeight:700, cursor:'pointer' }}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}

            <label style={{ fontSize:'.8125rem', fontWeight:700, color:'#6B7280', display:'block', marginBottom:6 }}>
              {escalate === 'gp' || escalate === 'er' ? 'Notes for patient (optional)' : 'Message to patient explaining why'}
            </label>
            <textarea
              value={escalateNote}
              onChange={e => setEscalateNote(e.target.value)}
              rows={3}
              placeholder={escalate === 'gp' || escalate === 'er'
                ? 'e.g. Your condition requires hands-on examination…'
                : "e.g. I'd like to talk through your symptoms in more detail…"}
              style={{ width:'100%', boxSizing:'border-box', border:'1.5px solid #E2E8F0', borderRadius:10, padding:'10px 12px', fontFamily:FF, fontSize:'.9375rem', lineHeight:1.6, resize:'none', outline:'none', marginBottom:14 }}
            />

            {escalate === 'er' && (
              <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'10px 12px', fontSize:'.8125rem', color:'#DC2626', marginBottom:14, lineHeight:1.5 }}>
                🚨 Patient will be advised to go to ED immediately. Payment will be cancelled — no charge.
              </div>
            )}
            {(escalate === 'gp') && (
              <div style={{ background:'#FEF9EC', border:'1px solid #FDE68A', borderRadius:10, padding:'10px 12px', fontSize:'.8125rem', color:'#92400E', marginBottom:14, lineHeight:1.5 }}>
                Payment will be cancelled — no charge for in-person referral.
              </div>
            )}

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => { setEscalate(null); setEscalateNote('') }}
                style={{ flex:1, minHeight:48, borderRadius:10, border:'1.5px solid #E2E8F0', background:'white', color:'#6B7280', fontFamily:FF, fontSize:'.9375rem', fontWeight:700, cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={sendEscalate} disabled={escalateSending}
                style={{ flex:2, minHeight:48, borderRadius:10, border:'none', background: escalate==='er' ? '#DC2626' : TEAL, color:'white', fontFamily:FF, fontSize:'.9375rem', fontWeight:800, cursor:'pointer', opacity: escalateSending ? .7 : 1 }}>
                {escalateSending ? 'Sending…'
                  : escalate === 'gp' ? 'Refer to GP — no charge'
                  : escalate === 'er' ? 'Refer to ED — no charge'
                  : `Request ${escalate} call`}
              </button>
            </div>
          </div>
        </div>
      )}

      <PrescribeModal
        open={modals.rx}
        onClose={() => setModals(m => ({ ...m, rx:false }))}
        consult={consult}
        onDone={action => { addAction(action); setModals(m => ({ ...m, rx:false })) }}
      />
      <XrayModal
        open={modals.xr}
        onClose={() => setModals(m => ({ ...m, xr:false }))}
        consult={consult}
        onDone={action => { addAction(action); setModals(m => ({ ...m, xr:false })) }}
      />
    </div>
  )
}
