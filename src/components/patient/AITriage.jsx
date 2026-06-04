import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createConsultation } from '../../lib/supabase'
import TereIntro from './TereIntro'
import ConsentGate from './ConsentGate'
import { t, getLang, getLangMeta } from '../../lib/i18n'
import { apiFetch } from '../../lib/api'

// ── Anonymous analytics helper ─────────────────────────────────────────────────
function trackEvent(event_name, metadata = {}) {
  let sessionId = sessionStorage.getItem('tere_session_id')
  if (!sessionId) {
    sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36)
    sessionStorage.setItem('tere_session_id', sessionId)
  }
  apiFetch('/api/analytics-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_name, session_id: sessionId, metadata }),
  }).catch(() => {})
}

const PHYSICAL_EMERGENCY_KEYWORDS = [
  'chest pain','chest tightness','cant breathe','cannot breathe','difficulty breathing',
  'stroke','face drooping','arm weakness','slurred speech','unconscious','passed out',
  'major bleeding','wont stop bleeding','severe allergic','throat swelling','anaphylaxis',
  'not breathing','no pulse','seizing','seizure','collapsed','paralysis',
  'crushing','pressure in chest','severe bleeding'
]

const MENTAL_HEALTH_KEYWORDS = [
  'suicidal','want to die','kill myself','self harm','hurting myself',
  "can't go on","cant go on",'ending my life',"don't want to be here",
  'no reason to live','end my life','take my life'
]

const ADDICTION_KEYWORDS = [
  'drinking too much','alcohol problem',"can't stop drinking","cant stop drinking",
  'addiction','dependent on alcohol','alcoholic'
]

const CONTROLLED_MED_KEYWORDS = [
  'ozempic','wegovy','semaglutide','weight loss injection','weight loss medication',
  'opiate','opioid','codeine','tramadol','morphine','oxycodone','fentanyl',
  'diazepam','valium','xanax','benzodiazepine','benzo','zopiclone','temazepam',
  'ritalin','adderall','dexamphetamine','sleeping pills',
]

function checkControlledMed(text) {
  const lower = text.toLowerCase()
  return CONTROLLED_MED_KEYWORDS.some(kw => lower.includes(kw))
}

function checkPhysicalEmergency(text) {
  const lower = text.toLowerCase()
  return PHYSICAL_EMERGENCY_KEYWORDS.some(kw => lower.includes(kw))
}

function checkMentalHealthCrisis(text) {
  const lower = text.toLowerCase()
  return MENTAL_HEALTH_KEYWORDS.some(kw => lower.includes(kw))
}

function checkAddiction(text) {
  const lower = text.toLowerCase()
  return ADDICTION_KEYWORDS.some(kw => lower.includes(kw))
}

const ACC_INJURY_KEYWORDS = [
  'fell','fall','fallen','trip','tripped','slipped','slip',
  'hurt','injured','accident','crash','collision','impact',
  'sprain','sprained','strain','strained','fracture','fractured','broken','broke',
  'cut','laceration','wound','bruise','bruised','bump','hit','knocked','banged',
  'twisted','pulled','torn','tore','dislocated','dislocation',
  'sport','sports','playing','lifting','gym','running','cycling','whiplash',
  'bite','bitten','stung','burn','burnt','burned','swollen','bleeding','bleed',
  'gash','graze','scraped','scrape','work accident','car accident'
]

function checkAccEligible(text) {
  const lower = text.toLowerCase()
  return ACC_INJURY_KEYWORDS.some(kw => lower.includes(kw))
}

const STEPS = [
  { id:'greeting', message:"Kia ora! I'm Tere, your health assistant. What's your full name?", field:'patient_name', validate:v=>v.trim().length>1, error:"Can you type your full name?", next:'dob_lookup' },
  { id:'dob_lookup', message:(d)=>`And your date of birth, ${d.patient_name.split(' ')[0]}? (e.g. 14 March 1986)`, field:'patient_dob_raw', validate:v=>v.trim().length>3, error:"Can you give me your date of birth? (e.g. 14 March 1986)", next:'phone' },
  { id:'phone', message:"What's your mobile number?", field:'patient_phone', validate:v=>v.trim().length>6, error:"Can you pop in your mobile number?", next:'email' },
  { id:'email', message:"What's your email? We'll send your consultation summary there.", field:'patient_email', validate:v=>v.includes('@'), error:"Can you double-check that email address?", next:'complaint' },
  { id:'complaint', message:"What's brought you in today? Tell me what's going on — including how long it's been happening.", field:'chief_complaint', validate:v=>v.trim().length>5, error:"Can you tell me a bit more?", next:'acc_check' },
  { id:'acc_check', message:"Is your visit related to an accident or injury? ACC may cover your treatment costs.", field:'is_acc_raw', type:'yesno', validate:()=>true, next:'history' },
  { id:'history', message:"Any relevant medical history? Past conditions, surgeries — say none if not.", field:'medical_history', validate:()=>true, next:'medications' },
  { id:'medications', message:"Are you on any regular medications?", field:'medications', validate:()=>true, next:'allergies' },
  { id:'allergies', message:"Any allergies — medications, foods, anything?", field:'allergies', validate:()=>true, next:'nhi' },
  { id:'acc_description', message:"That sounds like it could be an ACC claim — can you describe exactly how it happened? What were you doing and where?", field:'acc_injury_description', validate:v=>v.trim().length>5, error:"Can you describe how it happened?", next:'acc_date' },
  { id:'acc_date', message:"When did it happen? (e.g. today, yesterday, 3 days ago)", field:'acc_injury_date_raw', validate:v=>v.trim().length>1, next:'acc_employer' },
  { id:'acc_employer', message:"Who's your employer?", field:'employer', validate:()=>true, next:'nhi' },
  { id:'nhi', message:"Do you know your NHI number? It's on your Community Services Card or any hospital letter — looks like ABC1234.", field:'patient_nhi', validate:()=>true, next:'pharmacy', skippable:true, transform:v=>{const l=v.trim().toLowerCase();return ['skip','no','none','n/a','nope','not sure','idk','dont know',"don't know","i don't know"].includes(l)?'':v.trim().toUpperCase().replace(/[^A-Z0-9]/g,'')} },
  { id:'pharmacy', message:"What's your preferred pharmacy? You can search nearby or type the name.", field:'pharmacy', type:'pharmacy', validate:()=>true, next:'gp_name' },
  { id:'gp_name', message:"Do you have a regular GP or family doctor? If so, what's their name?", field:'gp_name', validate:()=>true, next:'gp_clinic', skippable:true, transform:v=>['skip','no','none','n/a','nope','no thanks'].includes(v.trim().toLowerCase())?'':v.trim() },
  { id:'gp_confirm', message:(d)=>`Found ${d.gp_name} at ${d.gp_clinic} — is that right? We'll send them a copy of your notes automatically.`, field:'gp_confirm_raw', type:'yesno', validate:()=>true, next:'tobacco' },
  { id:'gp_clinic', message:"What's the name of their clinic or practice?", field:'gp_clinic', validate:()=>true, next:'tobacco' },
  { id:'tobacco', message:"Do you currently smoke or use tobacco?", field:'tobacco_use_raw', type:'yesno', validate:()=>true, next:'tobacco_amount' },
  { id:'tobacco_amount', message:"How much would you say?", field:'tobacco_amount', type:'choices', choices:['Occasional (social smoker)','1–10 per day','10–20 per day','20+ per day'], validate:()=>true, next:'alcohol' },
  { id:'alcohol', message:"Do you drink alcohol?", field:'alcohol_use_raw', type:'yesno', validate:()=>true, next:'alcohol_amount' },
  { id:'alcohol_amount', message:"Roughly how much per week?", field:'alcohol_amount', type:'choices', choices:['Occasional (1–2 drinks/week)','Moderate (3–7 drinks/week)','Heavy (8–14 drinks/week)','Very heavy (15+ drinks/week)'], validate:()=>true, next:'photo' },
  { id:'photo', message:"Can you take a photo of the affected area? Tap the camera icon — it really helps the doctor.", field:'photo_response', type:'photo', validate:()=>true, next:'recording' },
  { id:'recording', message:"Last thing — do you consent to your consultation being AI-transcribed? The recording is deleted straight after.", field:'recording_consent_raw', type:'yesno', next:'done' },
]

function parseDate(raw) {
  if (!raw) return ''
  const s = raw.trim()
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // DD/MM/YYYY
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slash) return `${slash[3]}-${slash[2].padStart(2,'0')}-${slash[1].padStart(2,'0')}`
  // DD-MM-YYYY (day first, 2-digit day)
  const dashDMY = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dashDMY) return `${dashDMY[3]}-${dashDMY[2].padStart(2,'0')}-${dashDMY[1].padStart(2,'0')}`
  // Natural language: "14 March 1986", "14th March 1986"
  const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11}
  const m = s.toLowerCase().replace(/(\d+)(st|nd|rd|th)\b/,'$1').match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/)
  if (m) {
    const mo = months[m[2].slice(0,3)]
    if (mo !== undefined) {
      // Use local date parts to avoid UTC timezone shift in NZ (UTC+12/13)
      const d = new Date(parseInt(m[3]), mo, parseInt(m[1]))
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    }
  }
  // Last resort — extract local parts to avoid TZ shift
  const d = new Date(s)
  if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  return s
}

// Translate text to English via the server API (for keyword safety checks)
async function translateToEnglish(text, sourceLang) {
  if (sourceLang === 'en') return text
  try {
    const res = await apiFetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source_lang: sourceLang, target_lang: 'en' }),
    })
    const d = await res.json()
    return d.translated_text || text
  } catch {
    return text
  }
}

// Return translated message for a STEPS entry
function getStepMessage(step, lang, data) {
  if (step.id === 'dob_lookup') {
    return t('dob_question', lang, { firstName: data?.patient_name?.split(' ')[0] || '' })
  }
  const msg = t(step.id, lang)
  // If i18n returned the key unchanged, fall back to the hard-coded English string
  if (msg === step.id) {
    return typeof step.message === 'function' ? step.message(data) : step.message
  }
  return msg
}

const TRIAGE_STATE_VERSION = 3

function loadTriageState() {
  try {
    if (sessionStorage.getItem('consultationId')) return null
    const s = JSON.parse(sessionStorage.getItem('tere_triage_state') || 'null')
    if (!s || s.version !== TRIAGE_STATE_VERSION) {
      sessionStorage.removeItem('tere_triage_state')
      return null
    }
    return s
  } catch { return null }
}

export default function AITriage() {
  const navigate = useNavigate()
  const [lang] = useState(() => getLang())
  const [messages, setMessages] = useState(() => { const s = loadTriageState(); return s?.messages || [] })
  const [currentStep, setCurrentStep] = useState(() => { const s = loadTriageState(); return s?.currentStep ?? 0 })
  const [input, setInput] = useState('')
  const [data, setData] = useState(() => { const s = loadTriageState(); return s?.data || {} })
  const [stepHistory, setStepHistory] = useState(() => { const s = loadTriageState(); return s?.stepHistory || [] })
  const [photos, setPhotos] = useState([])
  const [emergency, setEmergency] = useState(null)
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [waitingForPhoto, setWaitingForPhoto] = useState(false)
  const [showIntro, setShowIntro] = useState(() => { try { if (sessionStorage.getItem('consultationId')) return true; return !loadTriageState() } catch { return true } })
  const [showConsentGate, setShowConsentGate] = useState(false)
  const bottomRef = useRef(null)
  const messagesRef = useRef(null)
  const fileRef = useRef(null)
  const inputRef = useRef(null)
  const langMeta = getLangMeta(lang)

  // Auto-submit when done
  useEffect(() => {
    if (done) handleConfirm()
  }, [done])

  // Track triage_started when first message is sent
  const hasTrackedStart = useRef(false)

  useEffect(() => {
    async function init() {
      const existingId = sessionStorage.getItem('consultationId')
      if (existingId) {
        try {
          const { getConsultation } = await import('../../lib/supabase')
          const c = await getConsultation(existingId)
          const ACTIVE = ['waiting','vitals_requested','vitals_complete','ready','in_progress','waitlisted']
          if (ACTIVE.includes(c?.status)) {
            const isAsync = c.consultation_subtype === 'async_message' ||
                            sessionStorage.getItem('consultation_subtype') === 'async_message'
            if (isAsync) {
              navigate(`/async-message/${existingId}`, { replace: true })
            } else {
              navigate('/consultation-type', { replace: true })
            }
            return
          }
        } catch {}
        // Terminal or unknown status — clear stale session and start fresh
        ;['consultationId','tere_triage_state','accEligible','consultationType','paymentAmount',
          'patientName','patientEmail','triage_complaint','triage_returning','patient_language',
          'paymentIntentId','employer_paid','employer_name','employer_id'].forEach(k => sessionStorage.removeItem(k))
      }
      if (sessionStorage.getItem('tere_triage_state')) return
      setTimeout(() => setMessages([{ role:'tere', text: t('greeting', lang) }]), 400)
    }
    init()
  }, [])

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [messages])

  // iOS: keep container anchored to visual viewport when keyboard opens
  const triageContainerRef = useRef(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const el = triageContainerRef.current
      if (!el) return
      el.style.height = vv.height + 'px'
      el.style.top = vv.offsetTop + 'px'
      if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  useEffect(() => {
    if (messages.length > 0 && !done) {
      try { sessionStorage.setItem('tere_triage_state', JSON.stringify({ messages, currentStep, data, stepHistory, version: TRIAGE_STATE_VERSION })) } catch {}
    }
  }, [messages, currentStep, data, stepHistory, done])

  const getStepById = id => STEPS.find(s => s.id === id)

  const [tereTyping, setTereTyping] = useState(false)
  const [accSuggestion, setAccSuggestion] = useState(null) // 'yes' | 'no' | null
  const accAssessTimerRef = useRef(null)

  const advanceToStep = (stepId, newData) => {
    if (stepId === 'done') {
      setTereTyping(true)
      setTimeout(async () => {
        setTereTyping(false)
        setMessages(prev => [...prev, { role:'tere', text: t('sweet_as', lang) }])
        setTimeout(() => setDone(true), 800)
      }, 1200)
      return
    }
    const step = getStepById(stepId)
    if (!step) return
    const idx = STEPS.findIndex(s => s.id === stepId)
    setCurrentStep(idx)
    setTereTyping(true)
    const msg = getStepMessage(step, lang, newData)
    const typingDelay = Math.min(600 + msg.length * 18, 2200)
    setTimeout(() => {
      setTereTyping(false)
      setMessages(prev => [...prev, { role:'tere', text:msg }])
      setWaitingForPhoto(step.type === 'photo')
    }, typingDelay)
  }

  const processAnswer = async (value, step, currentData) => {
    let processed = value
    if (step.type === 'yesno') {
      const l = value.toLowerCase()
      processed = ['y','yes','yeah','yep','yup'].includes(l) ? 'yes' : 'no'
    }
    if (step.transform) processed = step.transform(processed)
    let newData = { ...currentData, [step.field]: processed }

    // AI-powered ACC assessment — fires non-blocking, pre-selects button on acc_check step
    if (step.id === 'complaint') {
      setData(newData)
      setAccSuggestion(null)
      clearTimeout(accAssessTimerRef.current)
      accAssessTimerRef.current = setTimeout(() => setAccSuggestion(null), 2000)
      apiFetch('/api/assess-acc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complaint: processed }),
      }).then(r => r.json())
        .then(({ isLikelyACC }) => {
          clearTimeout(accAssessTimerRef.current)
          setAccSuggestion(isLikelyACC ? 'yes' : 'no')
        })
        .catch(() => clearTimeout(accAssessTimerRef.current))
      advanceToStep('acc_check', newData)
      return
    }

    setData(newData)

    // Returning patient lookup after DOB entry
    if (step.id === 'dob_lookup') {
      try {
        const { supabase } = await import('../../lib/supabase')
        const dob = parseDate(processed)
        const nameParts = (currentData.patient_name || '').trim().split(' ')
        const firstName = nameParts[0]
        const lastName = nameParts.slice(1).join(' ') || ''

        console.log('Looking up patient:', { firstName, lastName, dob })
        // Run patient lookup and employer check in parallel
        const [prevResult, empResult] = await Promise.allSettled([
          supabase
            .from('consultations')
            .select('*')
            .ilike('patient_first_name', firstName)
            .ilike('patient_last_name', lastName)
            .eq('patient_dob', dob)
            .order('created_at', { ascending: false })
            .limit(1),
          apiFetch('/api/employer-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firstName, lastName, dob }),
          }).then(r => r.json()),
        ])

        // Process employer check result
        const empData = {}
        if (empResult.status === 'fulfilled' && empResult.value?.match) {
          const { employerId, employerName } = empResult.value
          sessionStorage.setItem('employer_paid', 'true')
          sessionStorage.setItem('employer_name', employerName)
          sessionStorage.setItem('employer_id', employerId)
          empData.employer_paid = true
          empData.employer_name = employerName
          empData.employer_id = employerId
          setTimeout(() => {
            setMessages(prev => [...prev, { role:'tere', text: `Great news — your consultation is covered by ${employerName}. No payment needed.` }])
          }, 600)
        }

        const prev = prevResult.status === 'fulfilled' ? prevResult.value?.data : null
        console.log('Supabase result:', prev, prevResult.value?.error, { dob })

        if (prev && prev.length > 0) {
          const p = prev[0]
          const prefilled = {
            ...newData,
            ...empData,
            patient_name: `${p.patient_first_name} ${p.patient_last_name}`,
            patient_first_name: p.patient_first_name,
            patient_last_name: p.patient_last_name,
            patient_dob_raw: p.patient_dob,
            patient_phone: p.patient_phone || '',
            patient_email: p.patient_email || '',
            patient_nhi: p.patient_nhi || '',
            patient_location: p.patient_location || '',
            pharmacy: p.pharmacy || '',
            gp_name: p.gp_name || '',
            gp_clinic: p.gp_clinic || '',
            gp_email: p.gp_email || '',
            employer: p.employer || '',
            medical_history: p.medical_history || '',
            medications: p.medications || '',
            allergies: p.allergies || '',
            returning: true,
          }
          setData(prefilled)
          setTereTyping(true)
          setTimeout(() => {
            setTereTyping(false)
            setMessages(prev => [...prev, { role:'tere', text: t('welcome_back', lang, { firstName: p.patient_first_name }) }])
            advanceToStep('complaint', prefilled)
          }, 800)
          return
        }

        if (Object.keys(empData).length) setData({ ...newData, ...empData })
      } catch(e) { console.error('Lookup error:', e) }
      advanceToStep('phone', newData)
      return
    }

    // Clear AI suggestion once patient has answered the acc_check step
    if (step.id === 'acc_check') {
      setAccSuggestion(null)
    }

    // Route allergies: always go to admin questions (nhi); ACC description comes after acc_employer
    if (step.id === 'allergies') {
      setData(newData)
      advanceToStep(newData.is_acc_raw === 'yes' ? 'acc_description' : 'nhi', newData)
      return
    }

    // Skip tobacco_amount if patient doesn't smoke
    if (step.id === 'tobacco') {
      setData(newData)
      advanceToStep(processed === 'yes' ? 'tobacco_amount' : 'alcohol', newData)
      return
    }

    // Skip alcohol_amount if patient doesn't drink
    if (step.id === 'alcohol') {
      setData(newData)
      advanceToStep(processed === 'yes' ? 'alcohol_amount' : 'photo', newData)
      return
    }

    // After acc_employer, go to admin questions (nhi/pharmacy/gp)
    if (step.id === 'acc_employer') {
      setData(newData)
      advanceToStep('nhi', newData)
      return
    }

    // GP name — HPI lookup
    if (step.id === 'gp_name') {
      if (!processed) {
        advanceToStep('tobacco', newData)
        return
      }
      setTereTyping(true)
      try {
        const res = await apiFetch('/api/hpi-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: processed, type: 'gp' }),
        })
        const { results } = await res.json()
        if (results?.length > 0) {
          const match = results[0]
          const updatedData = { ...newData, gp_clinic: match.clinic, gp_email: match.email || '' }
          setData(updatedData)
          setTereTyping(false)
          advanceToStep('gp_confirm', updatedData)
          return
        }
      } catch {}
      setTereTyping(false)
      advanceToStep('gp_clinic', newData)
      return
    }

    // GP confirm (HPI match)
    if (step.id === 'gp_confirm') {
      if (processed === 'yes') {
        advanceToStep('tobacco', newData)
      } else {
        const cleared = { ...newData, gp_clinic: '', gp_email: '' }
        setData(cleared)
        advanceToStep('gp_clinic', cleared)
      }
      return
    }

    const nextId = typeof step.next === 'function' ? step.next(processed) : step.next
    advanceToStep(nextId, newData)
  }

  const handleSendValue = async (value) => {
    const step = STEPS[currentStep]
    if (!step) return
    setStepHistory(prev => [...prev, { stepIdx: currentStep, msgCount: messages.length }])
    setMessages(prev => [...prev, { role:'user', text:value }])

    // Translate to English for keyword safety checks when not English
    let textForCheck = value
    if (lang !== 'en') {
      textForCheck = await translateToEnglish(value, lang)
    }

    if (checkPhysicalEmergency(textForCheck)) { setTimeout(() => setEmergency('physical'), 500); return }
    if (checkMentalHealthCrisis(textForCheck)) { setTimeout(() => setEmergency('mental'), 500); return }
    if (checkAddiction(textForCheck)) { setTimeout(() => setEmergency('addiction'), 500); return }

    if (checkControlledMed(textForCheck) && !data.controlled_medication_mentioned) {
      setData(prev => ({ ...prev, controlled_medication_mentioned: true }))
      setTimeout(() => setMessages(prev => [...prev, {
        role: 'tere',
        text: t('controlled_med_notice', lang),
        style: 'amber',
      }]), 500)
    }

    if (step.validate && !step.validate(value)) {
      const errKey = `${step.id}_error`
      const errMsg = t(errKey, lang) !== errKey ? t(errKey, lang) : (step.error || t('generic_error', lang))
      setTimeout(() => setMessages(prev => [...prev, { role:'tere', text:errMsg }]), 400)
      return
    }
    processAnswer(value, step, data)
  }

  const handleSend = async () => {
    if (!input.trim()) return
    const value = input.trim()
    setInput('')
    if (!hasTrackedStart.current) {
      hasTrackedStart.current = true
      trackEvent('triage_started', { lang })
    }
    await handleSendValue(value)
    inputRef.current?.focus()
  }

  const handlePhoto = (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    const newPhotos = files.map(f => URL.createObjectURL(f))
    setPhotos(prev => [...prev, ...newPhotos])
    setStepHistory(prev => [...prev, { stepIdx: currentStep, msgCount: messages.length }])
    setMessages(prev => [...prev, { role:'user', text:`📷 ${files.length} photo${files.length>1?'s':''} attached` }])
    setWaitingForPhoto(false)
    const newData = { ...data, photo_response:'provided' }
    setData(newData)
    setTimeout(() => setMessages(prev => [...prev, { role:'tere', text: t('cheers_photo', lang) }]), 400)
    setTimeout(() => {
      const step = getStepById('recording')
      setCurrentStep(STEPS.findIndex(s => s.id === 'recording'))
      setMessages(prev => [...prev, { role:'tere', text:step.message }])
    }, 1000)
  }

  const handleConfirm = async () => {
    setSaving(true)
    console.log('[handleConfirm] data snapshot:', JSON.stringify(Object.fromEntries(Object.entries(data).map(([k,v]) => [k, typeof v === 'string' ? v.slice(0,40) : v]))))
    trackEvent('triage_completed', { lang })
    try {
      const nameParts = (data.patient_name||'').trim().split(' ')
      let av = { is_open: true }
      try {
        const avRes = await apiFetch('/api/get-availability?t=' + Date.now())
        if (avRes.ok) av = await avRes.json()
        else av = { is_open: false } // API error → assume closed
      } catch { av = { is_open: false } } // network error → assume closed
      console.log('[triage] av result:', JSON.stringify(av))
      const consultation = await createConsultation({
        firstName: nameParts[0],
        lastName: nameParts.slice(1).join(' '),
        dob: parseDate(data.patient_dob_raw),
        nhi: data.patient_nhi||'',
        phone: data.patient_phone,
        email: data.patient_email||'',
        location: data.patient_location,
        complaint: data.chief_complaint,
        pharmacy: data.pharmacy||'',
        accEligible: data.is_acc_raw==='yes'?'yes':'no',
        employer: data.employer,
        injuryDetails: data.acc_injury_description||'',
        injuryDate: data.acc_injury_date_raw ? parseDate(data.acc_injury_date_raw) : null,
        allergies: data.allergies||'',
        medicalHistory: data.medical_history||'',
        medications: data.medications||'',
        recordingConsent: data.recording_consent_raw==='yes',
        accConsent: data.is_acc_raw==='yes',
        patientLanguage: lang,
        employerPaid: data.employer_paid || false,
        employerId: data.employer_id || null,
        employerName: data.employer_name || null,
        gpName: data.gp_name || '',
        gpEmail: data.gp_email || '',
        gpClinic: data.gp_clinic || '',
        hdcRightsAccepted: true,
        researchConsent: data.research_consent_raw === 'yes' || sessionStorage.getItem('research_consent') === 'yes',
        tobaccoUse: data.tobacco_use_raw === 'yes' ? 'yes' : (data.tobacco_use_raw === 'no' ? 'no' : null),
        tobaccoAmount: data.tobacco_amount || null,
        alcoholUse: data.alcohol_use_raw === 'yes' ? 'yes' : (data.alcohol_use_raw === 'no' ? 'no' : null),
        alcoholAmount: data.alcohol_amount || null,
        status: 'waiting',
      })
      sessionStorage.setItem('consultationId', consultation.id)

      console.log('Clinic status:', av.is_open)


      // Flag controlled medication mention (requires migration: ALTER TABLE consultations ADD COLUMN controlled_medication_mentioned BOOLEAN DEFAULT false)
      if (data.controlled_medication_mentioned) {
        import('../../lib/supabase').then(({ supabase }) => {
          supabase.from('consultations').update({ controlled_medication_mentioned: true }).eq('id', consultation.id)
        }).catch(() => {})
      }

      // research_consent is now included in createConsultation payload

      // Log consent events
      const patientName = `${nameParts[0]} ${nameParts.slice(1).join(' ')}`.trim()
      const consentBase = { consultation_id: consultation.id, patient_name: patientName }
      await Promise.allSettled([
        apiFetch('/api/consents', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...consentBase, consent_type:'hdc_code_of_rights', granted:true }) }),
        apiFetch('/api/consents', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...consentBase, consent_type:'prescribing_limitations_acknowledged', granted:true }) }),
        apiFetch('/api/consents', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...consentBase, consent_type:'recording_consent', granted: data.recording_consent_raw==='yes' }) }),
        apiFetch('/api/consents', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...consentBase, consent_type:'privacy_policy', granted:true }) }),
        apiFetch('/api/consents', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...consentBase, consent_type:'research_consent', granted: data.research_consent_raw === 'yes' || sessionStorage.getItem('research_consent') === 'yes' }) }),
        ...(data.is_acc_raw==='yes' ? [apiFetch('/api/consents', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...consentBase, consent_type:'acc_three_part_consent', granted:true }) })] : []),
      ])
      sessionStorage.setItem('accEligible', data.is_acc_raw==='yes'?'yes':'no')
      sessionStorage.setItem('triage_complaint', data.chief_complaint||'')
      sessionStorage.setItem('triage_returning', data.returning ? 'true' : 'false')
      sessionStorage.setItem('patientEmail', data.patient_email||'')
      sessionStorage.setItem('triage_email', data.patient_email||'')
      sessionStorage.setItem('triage_first_name', nameParts[0]||'')
      sessionStorage.setItem('patientName', [nameParts[0]||'', nameParts.slice(1).join(' ')].filter(Boolean).join(' '))
      sessionStorage.setItem('patient_language', lang)
      sessionStorage.removeItem('tere_triage_state')

      if (!av.is_open) {
        sessionStorage.setItem('consultation_subtype', 'async_message')
        try {
          const { supabase } = await import('../../lib/supabase')
          await supabase.from('consultations').update({
            consultation_type: 'message',
            consultation_subtype: 'async_message',
          }).eq('id', consultation.id)
        } catch {}
        navigate(`/async-message/${consultation.id}`)
      } else {
        sessionStorage.setItem('consultation_subtype', 'live')
        navigate('/consultation-type')
      }
    } catch(e) {
      console.error('[handleConfirm] Save failed: ' + JSON.stringify({
        message: e.message,
        details: e.details,
        hint: e.hint,
        code: e.code,
      }))
      setSaving(false)
      setDone(false)
      sessionStorage.removeItem('consultationId')
      sessionStorage.removeItem('consultation_subtype')
      const errDetail = e?.message || String(e) || 'unknown error'
      setTimeout(() => setMessages(prev => [...prev, { role:'tere', text:`Sorry, something went wrong saving your details (${errDetail}). Please refresh the page to try again.` }]), 100)
    }
  }

  function handleBack() {
    if (stepHistory.length === 0 || tereTyping || saving) return
    const newHistory = [...stepHistory]
    const { stepIdx, msgCount } = newHistory.pop()
    setStepHistory(newHistory)
    setCurrentStep(stepIdx)
    setMessages(prev => prev.slice(0, msgCount))
    const stepToRedo = STEPS[stepIdx]
    if (stepToRedo?.field) {
      setData(prev => { const d = { ...prev }; delete d[stepToRedo.field]; return d })
    }
    setWaitingForPhoto(stepToRedo?.type === 'photo')
    setInput('')
  }

  const step = STEPS[currentStep]

  // ── Pharmacy search widget state ────────────────────────────────────────────
  const [pharmacyQuery, setPharmacyQuery]       = useState('')
  const [pharmacyResults, setPharmacyResults]   = useState([])
  const [pharmacySearching, setPharmacySearching] = useState(false)
  const [pharmacyGeoError, setPharmacyGeoError] = useState('')

  async function searchNearbyPharmacies() {
    setPharmacyGeoError('')
    setPharmacySearching(true)
    setPharmacyResults([])
    if (!navigator.geolocation) {
      setPharmacyGeoError('Geolocation not supported — type your pharmacy name below.')
      setPharmacySearching(false)
      return
    }
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 60000 })
      )
      const { latitude: lat, longitude: lon } = pos.coords

      // Try Overpass with correct Content-Type and a hard 10s abort
      let results = []
      try {
        const ac = new AbortController()
        const t = setTimeout(() => ac.abort(), 10000)
        const q = `[out:json][timeout:10];node["amenity"="pharmacy"](around:5000,${lat},${lon});out 8;`
        const r = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(q)}`,
          signal: ac.signal,
        })
        clearTimeout(t)
        if (r.ok) {
          const d = await r.json()
          results = (d.elements || []).map(el => ({
            name: el.tags?.name || '',
            address: [el.tags?.['addr:housenumber'], el.tags?.['addr:street'], el.tags?.['addr:city']].filter(Boolean).join(' '),
          })).filter(p => p.name)
        }
      } catch {}

      // Nominatim viewbox fallback if Overpass returned nothing
      if (!results.length) {
        const delta = 0.08
        const url = `https://nominatim.openstreetmap.org/search?q=pharmacy&format=json&countrycodes=nz&addressdetails=1&limit=8&viewbox=${lon - delta},${lat + delta},${lon + delta},${lat - delta}&bounded=1`
        const r = await fetch(url, { headers: { 'Accept-Language': 'en' } })
        const d = await r.json()
        results = d.map(item => ({
          name: item.namedetails?.name || item.display_name?.split(',')[0] || '',
          address: [item.address?.road, item.address?.suburb, item.address?.city || item.address?.town].filter(Boolean).join(', '),
        })).filter(p => p.name)
      }

      setPharmacyResults(results.slice(0, 6))
      if (!results.length) setPharmacyGeoError('No pharmacies found nearby. Try typing a name below.')
    } catch (e) {
      setPharmacyGeoError(e.code === 1 ? 'Location access denied — type your pharmacy name below.' : 'Location unavailable — type your pharmacy name below.')
    } finally { setPharmacySearching(false) }
  }

  async function searchPharmacyByName(q) {
    if (!q.trim()) return
    setPharmacySearching(true)
    setPharmacyResults([])
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=pharmacy+${encodeURIComponent(q)}&format=json&countrycodes=nz&addressdetails=1&limit=6`
      const r = await fetch(url, { headers: { 'Accept-Language': 'en' } })
      const d = await r.json()
      const results = d.map(item => ({
        name: item.namedetails?.name || item.display_name?.split(',')[0] || 'Pharmacy',
        address: [item.address?.road, item.address?.suburb, item.address?.city || item.address?.town].filter(Boolean).join(', '),
      }))
      setPharmacyResults(results)
      if (!results.length) setPharmacyGeoError('No results found — try a different name or suburb.')
    } catch { setPharmacyGeoError('Search unavailable — type the pharmacy name and press Send.') }
    finally { setPharmacySearching(false) }
  }

  function selectPharmacy(p) {
    const val = p.address ? `${p.name} — ${p.address}` : p.name
    setPharmacyResults([])
    setPharmacyQuery('')
    setPharmacyGeoError('')
    handleSendValue(val)
  }

  if (showIntro) return <TereIntro onStart={() => { setShowIntro(false); setShowConsentGate(true); trackEvent('intro_viewed', { lang }) }} />
  if (showConsentGate) return <ConsentGate onAccepted={() => setShowConsentGate(false)} lang={lang} patientName={data?.patient_name} />

  if (emergency === 'physical') return (
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',background:'#FEF2F2',fontFamily:'Plus Jakarta Sans, sans-serif',direction:langMeta.rtl?'rtl':'ltr'}}>
      <div style={{background:'#991B1B',padding:'.875rem 1.25rem',paddingTop:'calc(.875rem + env(safe-area-inset-top, 0px))'}}>
        <span onClick={() => navigate('/')} style={{fontFamily:'Cormorant Garamond, serif',fontStyle:'italic',color:'white',fontSize:'1.3rem',cursor:'pointer',userSelect:'none',transition:'opacity .15s'}} onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'} role="link" aria-label="Tere Health — go to home">Tere</span>
      </div>
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'1.5rem'}}>
        <div style={{maxWidth:420,width:'100%',textAlign:'center'}}>
          <div style={{fontSize:'4rem',marginBottom:'1rem'}}>🚨</div>
          <h1 style={{color:'#991B1B',marginBottom:'.75rem',fontSize:'1.75rem'}}>{t('physical_heading', lang)}</h1>
          <p style={{marginBottom:'2rem',lineHeight:1.7,color:'#374151'}}>{t('physical_body', lang)}</p>
          <a href="tel:111" style={{display:'block',background:'#DC2626',color:'white',textDecoration:'none',borderRadius:14,padding:'1.25rem',fontSize:'1.25rem',fontWeight:700,marginBottom:'1rem',boxShadow:'0 4px 12px rgba(220,38,38,0.4)'}}>📞 Call 111</a>
          <button onClick={()=>setEmergency(null)} style={{background:'none',border:'none',color:'#9CA3AF',fontSize:'.8125rem',cursor:'pointer',textDecoration:'underline'}}>{t('physical_back', lang)}</button>
        </div>
      </div>
    </div>
  )

  if (emergency === 'mental') return (
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',background:'#F0F9FF',fontFamily:'Plus Jakarta Sans, sans-serif',direction:langMeta.rtl?'rtl':'ltr'}}>
      <div style={{background:'var(--navy)',padding:'.875rem 1.25rem',paddingTop:'calc(.875rem + env(safe-area-inset-top, 0px))'}}>
        <span onClick={() => navigate('/')} style={{fontFamily:'Cormorant Garamond, serif',fontStyle:'italic',color:'var(--teal-light)',fontSize:'1.3rem',cursor:'pointer',userSelect:'none',transition:'opacity .15s'}} onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'} role="link" aria-label="Tere Health — go to home">Tere</span>
      </div>
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'1.5rem'}}>
        <div style={{maxWidth:420,width:'100%'}}>
          <div style={{fontSize:'2.5rem',marginBottom:'1rem',textAlign:'center'}}>💙</div>
          <h1 style={{color:'var(--navy)',marginBottom:'.75rem',fontSize:'1.5rem',textAlign:'center'}}>{t('mental_heading', lang)}</h1>
          <p style={{marginBottom:'1.5rem',lineHeight:1.8,color:'#374151',textAlign:'center'}}>{t('mental_body', lang)}</p>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <a href="tel:08005433354" style={{display:'block',background:'white',border:'2px solid #0EA5E9',color:'var(--navy)',textDecoration:'none',borderRadius:12,padding:'1rem 1.25rem',fontWeight:600}}>
              <div style={{fontSize:'.75rem',color:'#0EA5E9',marginBottom:2}}>LIFELINE NZ — 24/7</div>
              📞 0800 543 354
            </a>
            <a href="sms:1737" style={{display:'block',background:'white',border:'2px solid #0EA5E9',color:'var(--navy)',textDecoration:'none',borderRadius:12,padding:'1rem 1.25rem',fontWeight:600}}>
              <div style={{fontSize:'.75rem',color:'#0EA5E9',marginBottom:2}}>TEXT SUPPORT — 24/7</div>
              💬 Text or call 1737
            </a>
            <a href="tel:05088288865" style={{display:'block',background:'white',border:'2px solid #0EA5E9',color:'var(--navy)',textDecoration:'none',borderRadius:12,padding:'1rem 1.25rem',fontWeight:600}}>
              <div style={{fontSize:'.75rem',color:'#0EA5E9',marginBottom:2}}>SUICIDE CRISIS HELPLINE</div>
              📞 0508 828 865
            </a>
            <div style={{background:'#FEF3C7',border:'1px solid #F59E0B',borderRadius:12,padding:'1rem 1.25rem',fontSize:'.875rem',color:'#92400E',textAlign:'center'}}>
              {t('emergency_danger', lang)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  if (emergency === 'addiction') return (
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',background:'#F5F3FF',fontFamily:'Plus Jakarta Sans, sans-serif',direction:langMeta.rtl?'rtl':'ltr'}}>
      <div style={{background:'var(--navy)',padding:'.875rem 1.25rem',paddingTop:'calc(.875rem + env(safe-area-inset-top, 0px))'}}>
        <span onClick={() => navigate('/')} style={{fontFamily:'Cormorant Garamond, serif',fontStyle:'italic',color:'var(--teal-light)',fontSize:'1.3rem',cursor:'pointer',userSelect:'none',transition:'opacity .15s'}} onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'} role="link" aria-label="Tere Health — go to home">Tere</span>
      </div>
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'1.5rem'}}>
        <div style={{maxWidth:420,width:'100%'}}>
          <div style={{fontSize:'2.5rem',marginBottom:'1rem',textAlign:'center'}}>🌿</div>
          <h1 style={{color:'var(--navy)',marginBottom:'.75rem',fontSize:'1.5rem',textAlign:'center'}}>{t('addiction_heading', lang)}</h1>
          <p style={{marginBottom:'1.5rem',lineHeight:1.8,color:'#374151',textAlign:'center'}}>{t('addiction_body', lang)}</p>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <a href="tel:08007877797" style={{display:'block',background:'white',border:'2px solid #7C3AED',color:'var(--navy)',textDecoration:'none',borderRadius:12,padding:'1rem 1.25rem',fontWeight:600}}>
              <div style={{fontSize:'.75rem',color:'#7C3AED',marginBottom:2}}>ALCOHOL DRUG HELPLINE — FREE</div>
              📞 0800 787 797
            </a>
            <a href="https://aa.org.nz" target="_blank" rel="noreferrer" style={{display:'block',background:'white',border:'2px solid #7C3AED',color:'var(--navy)',textDecoration:'none',borderRadius:12,padding:'1rem 1.25rem',fontWeight:600}}>
              <div style={{fontSize:'.75rem',color:'#7C3AED',marginBottom:2}}>AA NEW ZEALAND</div>
              🌐 aa.org.nz
            </a>
            <div style={{background:'#FEF3C7',border:'1px solid #F59E0B',borderRadius:12,padding:'1rem 1.25rem',fontSize:'.875rem',color:'#92400E',textAlign:'center'}}>
              {t('emergency_danger', lang)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  if (done) return (
    <div style={{height:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',fontFamily:'Plus Jakarta Sans, sans-serif'}}>
      <div style={{textAlign:'center',color:'var(--muted)'}}>
        <div style={{width:36,height:36,border:'3px solid var(--teal)',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 1rem'}}/>
        <div style={{fontSize:'.9375rem'}}>Setting you up…</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div ref={triageContainerRef} style={{position:'fixed',top:0,left:0,right:0,height:'100dvh',overflow:'hidden',display:'flex',flexDirection:'column',background:'var(--bg)',fontFamily:'Plus Jakarta Sans, sans-serif',direction:langMeta.rtl?'rtl':'ltr'}}>
      <div style={{background:'var(--navy)',paddingTop:'calc(.875rem + env(safe-area-inset-top, 0px))',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',maxWidth:600,margin:'0 auto',padding:'0 1.25rem .875rem'}}>
          <div>
            <span onClick={() => navigate('/')} style={{fontFamily:'Cormorant Garamond, serif',fontStyle:'italic',color:'var(--teal-light)',fontSize:'1.3rem',cursor:'pointer',userSelect:'none',transition:'opacity .15s'}} onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'} role="link" aria-label="Tere Health — go to home">Tere</span>
            <span style={{color:'rgba(255,255,255,.4)',fontSize:'.8rem',marginLeft:8}}>Health Assistant</span>
          </div>
          <span style={{fontSize:'.75rem',color:'rgba(255,255,255,.35)'}}>🔒 Encrypted</span>
        </div>
        <div style={{height:2,background:'rgba(255,255,255,.08)'}}>
          <div style={{height:'100%',background:'var(--teal)',width:`${Math.round((currentStep / Math.max(STEPS.length - 1, 1)) * 100)}%`,transition:'width .4s ease'}} />
        </div>
      </div>

      <div ref={messagesRef} style={{flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch',padding:'1rem',maxWidth:600,width:'100%',margin:'0 auto',boxSizing:'border-box'}}>
        {messages.map((m,i)=>(
          <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start',marginBottom:'.875rem'}}>
            {m.role==='tere'&&<div style={{width:32,height:32,borderRadius:'50%',background:'var(--teal)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1rem',flexShrink:0,marginRight:8,marginTop:2}}>🩺</div>}
            <div style={{maxWidth:'80%',padding:'.75rem 1rem',borderRadius:m.role==='user'?'18px 18px 4px 18px':'18px 18px 18px 4px',background:m.role==='user'?'var(--teal)':m.style==='amber'?'#FEF3C7':'white',color:m.role==='user'?'white':m.style==='amber'?'#78350F':'var(--text)',fontSize:'.9375rem',lineHeight:1.6,boxShadow:'0 1px 3px rgba(0,0,0,0.08)',border:m.role==='tere'?(m.style==='amber'?'1px solid #FDE68A':'1px solid var(--border)'):'none'}}>
              {m.text}
            </div>
          </div>
        ))}
        {tereTyping && (
          <div style={{ display:'flex', justifyContent:'flex-start', marginBottom:'.875rem' }}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--teal)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0, marginRight:8 }}>🩺</div>
            <div style={{ background:'white', border:'1px solid var(--border)', borderRadius:'18px 18px 18px 4px', padding:'.75rem 1rem', boxShadow:'0 1px 3px rgba(0,0,0,0.08)', display:'flex', gap:4, alignItems:'center' }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width:7, height:7, borderRadius:'50%', background:'var(--teal)', animation:`bounce 1.2s ${i*0.2}s infinite` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {step?.type==='yesno'&&(
        <div style={{padding:'0 1rem .5rem',maxWidth:600,margin:'0 auto',width:'100%',boxSizing:'border-box'}}>
          {step.id === 'acc_check' && accSuggestion && (
            <div style={{textAlign:'center',fontSize:'.75rem',color:'#6B7280',marginBottom:6,fontFamily:'Plus Jakarta Sans, sans-serif'}}>
              Based on your description, we think this {accSuggestion === 'yes' ? 'is' : 'may not be'} injury related — please confirm
            </div>
          )}
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>handleSendValue('yes')} className="btn"
              style={{
                flex:1,
                background: step.id === 'acc_check' && accSuggestion === 'no' ? 'transparent' : 'var(--teal)',
                color: step.id === 'acc_check' && accSuggestion === 'no' ? 'var(--muted)' : 'white',
                border: step.id === 'acc_check' && accSuggestion === 'no' ? '1.5px solid var(--border)' : 'none',
                boxShadow: step.id === 'acc_check' && accSuggestion === 'no' ? 'none' : undefined,
                fontWeight: step.id === 'acc_check' && accSuggestion === 'yes' ? 700 : 600,
              }}>
              {t('yes_label', lang)}{step.id === 'acc_check' && accSuggestion === 'yes' ? ' ✓' : ''}
            </button>
            <button onClick={()=>handleSendValue('no')} className="btn"
              style={{
                flex:1,
                background: step.id === 'acc_check' && accSuggestion === 'no' ? 'var(--teal)' : 'transparent',
                color: step.id === 'acc_check' && accSuggestion === 'no' ? 'white' : 'var(--text)',
                border: step.id === 'acc_check' && accSuggestion === 'no' ? 'none' : '1.5px solid var(--border)',
                boxShadow: step.id === 'acc_check' && accSuggestion === 'no' ? '0 4px 16px rgba(11,110,118,.25)' : 'none',
                fontWeight: step.id === 'acc_check' && accSuggestion === 'no' ? 700 : 600,
              }}>
              {t('no_label', lang)}{step.id === 'acc_check' && accSuggestion === 'no' ? ' ✓' : ''}
            </button>
          </div>
        </div>
      )}

      {step?.type==='choices' && !tereTyping && (
        <div style={{padding:'0 1rem .5rem',maxWidth:600,margin:'0 auto',width:'100%',boxSizing:'border-box',display:'flex',flexDirection:'column',gap:6}}>
          {step.choices.map(choice => (
            <button key={choice} onClick={()=>handleSendValue(choice)} className="btn"
              style={{width:'100%',background:'white',border:'1.5px solid var(--border)',color:'var(--text)',fontWeight:500,textAlign:'left',justifyContent:'flex-start'}}>
              {choice}
            </button>
          ))}
        </div>
      )}

      {step?.type==='pharmacy' && !tereTyping && (
        <div style={{padding:'0 1rem .5rem',maxWidth:600,margin:'0 auto',width:'100%',boxSizing:'border-box'}}>
          {/* Nearby search button */}
          <button onClick={searchNearbyPharmacies} disabled={pharmacySearching}
            style={{width:'100%',background:'var(--teal)',color:'white',border:'none',borderRadius:10,padding:'11px',fontWeight:700,fontSize:'.9rem',cursor:'pointer',fontFamily:'Plus Jakarta Sans, sans-serif',marginBottom:6,opacity:pharmacySearching?.7:1}}>
            {pharmacySearching ? '🔍 Searching…' : '📍 Find nearby pharmacies'}
          </button>
          {/* Text search */}
          <div style={{display:'flex',gap:6,marginBottom:6}}>
            <input value={pharmacyQuery} onChange={e=>setPharmacyQuery(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')searchPharmacyByName(pharmacyQuery)}}
              placeholder="Or type pharmacy name…"
              style={{flex:1,padding:'.6rem .75rem',border:'1.5px solid var(--border)',borderRadius:8,fontFamily:'Plus Jakarta Sans, sans-serif',fontSize:'.9rem',outline:'none'}} />
            <button onClick={()=>searchPharmacyByName(pharmacyQuery)} disabled={pharmacySearching||!pharmacyQuery.trim()}
              style={{background:'var(--teal)',color:'white',border:'none',borderRadius:8,padding:'8px 14px',fontWeight:700,cursor:'pointer',fontSize:'.85rem',opacity:pharmacyQuery.trim()?1:.5}}>
              Search
            </button>
          </div>
          {pharmacyGeoError && <div style={{fontSize:'.8rem',color:'#6B7280',marginBottom:4}}>{pharmacyGeoError}</div>}
          {pharmacyResults.length>0 && (
            <div style={{display:'flex',flexDirection:'column',gap:5,maxHeight:220,overflowY:'auto'}}>
              {pharmacyResults.map((p,i)=>(
                <button key={i} onClick={()=>selectPharmacy(p)}
                  style={{background:'white',border:'1.5px solid var(--border)',borderRadius:10,padding:'.625rem .875rem',textAlign:'left',cursor:'pointer',fontFamily:'Plus Jakarta Sans, sans-serif'}}>
                  <div style={{fontWeight:600,fontSize:'.9rem',color:'var(--navy)'}}>{p.name}</div>
                  {p.address&&<div style={{fontSize:'.775rem',color:'#6B7280',marginTop:2}}>{p.address}</div>}
                </button>
              ))}
            </div>
          )}
          <button onClick={()=>handleSendValue('skip')}
            style={{width:'100%',background:'transparent',border:'1.5px solid var(--border)',color:'var(--muted)',borderRadius:10,padding:'9px',fontWeight:600,fontSize:'.875rem',cursor:'pointer',fontFamily:'Plus Jakarta Sans, sans-serif',marginTop:6}}>
            Skip →
          </button>
        </div>
      )}

      {step?.skippable && step?.type !== 'pharmacy' && !tereTyping && (
        <div style={{padding:'0 1rem .5rem',maxWidth:600,margin:'0 auto',width:'100%',boxSizing:'border-box'}}>
          <button onClick={()=>handleSendValue('skip')} className="btn"
            style={{width:'100%',background:'transparent',border:'1.5px solid var(--border)',color:'var(--muted)',fontWeight:600}}>
            Skip →
          </button>
        </div>
      )}

      {photos.length>0&&(
        <div style={{padding:'0 1rem',maxWidth:600,margin:'0 auto',width:'100%',boxSizing:'border-box'}}>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
            {photos.map((p,i)=><img key={i} src={p} alt="" style={{width:48,height:48,objectFit:'cover',borderRadius:6,border:'2px solid var(--teal)'}}/>)}
          </div>
        </div>
      )}

      <div style={{padding:'1rem',paddingBottom:'max(1rem, env(safe-area-inset-bottom))',background:'white',borderTop:'1px solid var(--border)',flexShrink:0}}>
        {stepHistory.length > 0 && !tereTyping && !saving && (
          <div style={{maxWidth:600,margin:'0 auto 8px',display:'flex'}}>
            <button onClick={handleBack} style={{background:'none',border:'none',color:'#9CA3AF',fontSize:'.8125rem',cursor:'pointer',padding:'0',display:'flex',alignItems:'center',gap:3,fontFamily:'Plus Jakarta Sans, sans-serif'}}>
              ← Undo last answer
            </button>
          </div>
        )}
        <div style={{maxWidth:600,margin:'0 auto',display:'flex',gap:8,alignItems:'flex-end'}}>
          {waitingForPhoto&&(
            <>
              <button onClick={()=>fileRef.current?.click()} style={{background:'var(--teal)',border:'none',borderRadius:12,padding:'10px 14px',cursor:'pointer',flexShrink:0,fontSize:'1.1rem',color:'white'}}>📷</button>
              <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" style={{display:'none'}} onChange={handlePhoto}/>
              <button onClick={()=>handleSendValue('skip')} style={{background:'white',border:'1.5px solid var(--border)',borderRadius:12,padding:'10px 16px',cursor:'pointer',flexShrink:0,color:'var(--muted)',fontWeight:600,fontSize:'.9rem',fontFamily:'Plus Jakarta Sans, sans-serif'}}>Skip</button>
            </>
          )}
          <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend()}}}
            onFocus={()=>setTimeout(()=>{if(messagesRef.current)messagesRef.current.scrollTop=messagesRef.current.scrollHeight},320)}
            placeholder={waitingForPhoto?"Tap 📷 to attach a photo…":"Type your reply…"}
            rows={1} autoComplete="off" autoCorrect="off" autoCapitalize="sentences" spellCheck="false"
            style={{flex:1,padding:'.75rem 1rem',border:'1.5px solid var(--border)',borderRadius:12,fontFamily:'Plus Jakarta Sans, sans-serif',fontSize:'1rem',resize:'none',outline:'none',lineHeight:1.5,maxHeight:120,overflowY:'auto'}}
          />
          <button onClick={handleSend} disabled={!input.trim()} style={{background:'var(--teal)',border:'none',borderRadius:12,padding:'10px 16px',cursor:'pointer',flexShrink:0,color:'white',fontWeight:700,fontSize:'1rem',opacity:!input.trim()?0.5:1}}>↑</button>
        </div>
      </div>
    <style>{`@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}`}</style>
    </div>
  )
}