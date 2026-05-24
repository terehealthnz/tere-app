import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createConsultation } from '../../lib/supabase'
import TereIntro from './TereIntro'
import HDCRightsGate from './HDCRightsGate'
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
  { id:'email', message:"What's your email? We'll send your consultation summary there.", field:'patient_email', validate:v=>v.includes('@'), error:"Can you double-check that email address?", next:'nhi' },
  { id:'nhi', message:"Do you know your NHI number? It's on your Community Services Card or any hospital letter — looks like ABC1234. Say skip if you don't have it.", field:'patient_nhi', validate:()=>true, next:'pharmacy', transform:v=>v.trim().toUpperCase().replace(/[^A-Z0-9]/g,'')||'' },
  { id:'pharmacy', message:"What's your preferred pharmacy? (e.g. Havelock Pharmacy)", field:'pharmacy', validate:()=>true, next:'gp_name' },
  { id:'gp_name', message:"Do you have a regular GP or family doctor? If so, what's their name and clinic? We'll send them a copy of your notes today. (Say 'skip' if not.)", field:'gp_name', validate:()=>true, next:'gp_email', transform:v=>['skip','no','none','n/a','nope','no thanks'].includes(v.trim().toLowerCase())?'':v.trim() },
  { id:'gp_email', message:"And their email address if you have it? (Say 'skip' if not.)", field:'gp_email', validate:()=>true, next:'complaint', transform:v=>['skip','no','none','n/a','nope'].includes(v.trim().toLowerCase())?'':v.trim() },
  { id:'complaint', message:"What's brought you in today? Tell me what's going on — including how long it's been happening.", field:'chief_complaint', validate:v=>v.trim().length>5, error:"Can you tell me a bit more?", next:'history' },
  { id:'history', message:"Any relevant medical history? Past conditions, surgeries — say none if not.", field:'medical_history', validate:()=>true, next:'medications' },
  { id:'medications', message:"Are you on any regular medications?", field:'medications', validate:()=>true, next:'allergies' },
  { id:'allergies', message:"Any allergies — medications, foods, anything?", field:'allergies', validate:()=>true, next:'interpreter' },
  { id:'interpreter', message:"Would you like a professional interpreter on your call? (recommended if English is not your first language)", field:'interpreter_raw', type:'yesno', next:'photo' },
  { id:'acc_description', message:"That sounds like it could be an ACC claim — can you describe exactly how it happened? What were you doing and where?", field:'acc_injury_description', validate:v=>v.trim().length>5, error:"Can you describe how it happened?", next:'acc_date' },
  { id:'acc_date', message:"When did it happen? (e.g. today, yesterday, 3 days ago)", field:'acc_injury_date_raw', validate:v=>v.trim().length>1, next:'acc_employer' },
  { id:'acc_employer', message:"Who's your employer?", field:'employer', validate:()=>true, next:'photo' },
  { id:'photo', message:"Can you take a photo of the affected area? Tap the camera icon — it really helps the doctor. Or type skip.", field:'photo_response', type:'photo', validate:()=>true, next:'recording' },
  { id:'recording', message:"Last one — do you consent to your consultation being AI-transcribed? The recording is deleted straight after.", field:'recording_consent_raw', type:'yesno', next:'done' },
]

function parseDate(raw) {
  if (!raw) return ''
  const d = new Date(raw)
  if (!isNaN(d)) return d.toISOString().split('T')[0]
  const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11}
  const m = raw.toLowerCase().match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/)
  if (m) { const mo = months[m[2].slice(0,3)]; if (mo!==undefined) return new Date(parseInt(m[3]),mo,parseInt(m[1])).toISOString().split('T')[0] }
  return raw
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

export default function AITriage() {
  const navigate = useNavigate()
  const [lang] = useState(() => getLang())
  const [messages, setMessages] = useState([])
  const [currentStep, setCurrentStep] = useState(0)
  const [input, setInput] = useState('')
  const [data, setData] = useState({})
  const [photos, setPhotos] = useState([])
  const [emergency, setEmergency] = useState(null) // null | 'physical' | 'mental' | 'addiction'
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [waitingForPhoto, setWaitingForPhoto] = useState(false)
  const [clinicOpen, setClinicOpen] = useState(null)
  const [showIntro, setShowIntro] = useState(true)
  const [showHdcRights, setShowHdcRights] = useState(false)
  const bottomRef = useRef(null)
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
      const baseGreeting = t('greeting', lang)
      try {
        const { getAvailability } = await import('../../lib/supabase')
        const av = await getAvailability()
        setClinicOpen(av.is_open)
        const greeting = av.is_open
          ? baseGreeting
          : baseGreeting + t('clinic_closed_suffix', lang)
        setTimeout(() => setMessages([{ role:'tere', text:greeting }]), 400)
      } catch {
        setTimeout(() => setMessages([{ role:'tere', text:baseGreeting }]), 400)
      }
    }
    init()
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  const getStepById = id => STEPS.find(s => s.id === id)

  const [tereTyping, setTereTyping] = useState(false)

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

    // Smart ACC detection from complaint text
    if (step.id === 'complaint') {
      newData = { ...newData, is_acc_raw: checkAccEligible(processed) ? 'yes' : 'no' }
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

        // Run patient lookup and employer check in parallel
        const [prevResult, empResult] = await Promise.allSettled([
          supabase
            .from('consultations')
            .select('*')
            .ilike('patient_first_name', firstName)
            .eq('patient_dob', dob)
            .in('status', ['complete', 'waiting', 'waitlisted', 'in_progress'])
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

        if (prev && prev.length > 0) {
          const p = prev[0]
          const prefilled = {
            ...newData,
            ...empData,
            patient_name: `${p.patient_first_name} ${p.patient_last_name}`,
            patient_first_name: p.patient_first_name,
            patient_last_name: p.patient_last_name,
            patient_dob_raw: p.patient_dob,
            patient_nhi: p.patient_nhi || '',
            patient_location: p.patient_location,
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

    // Route allergies to ACC questions or interpreter step based on complaint detection
    if (step.id === 'allergies') {
      advanceToStep(newData.is_acc_raw === 'yes' ? 'acc_description' : 'interpreter', newData)
      return
    }

    // After interpreter question, go to photo
    if (step.id === 'interpreter') {
      advanceToStep('photo', newData)
      return
    }

    // After acc_employer, go to interpreter
    if (step.id === 'acc_employer') {
      advanceToStep('interpreter', newData)
      return
    }

    const nextId = typeof step.next === 'function' ? step.next(processed) : step.next
    advanceToStep(nextId, newData)
  }

  const handleSendValue = async (value) => {
    const step = STEPS[currentStep]
    if (!step) return
    setMessages(prev => [...prev, { role:'user', text:value }])

    // Translate to English for keyword safety checks when not English
    let textForCheck = value
    if (lang !== 'en') {
      textForCheck = await translateToEnglish(value, lang)
    }

    if (checkPhysicalEmergency(textForCheck)) { setTimeout(() => setEmergency('physical'), 500); return }
    if (checkMentalHealthCrisis(textForCheck)) { setTimeout(() => setEmergency('mental'), 500); return }
    if (checkAddiction(textForCheck)) { setTimeout(() => setEmergency('addiction'), 500); return }

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
    trackEvent('triage_completed', { lang })
    try {
      const nameParts = (data.patient_name||'').trim().split(' ')
      const { getAvailability } = await import('../../lib/supabase')
      const av = await getAvailability().catch(() => ({ is_open: true }))
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
        gpClinic: '',
        interpreterRequested: data.interpreter_raw==='yes',
        hdcRightsAccepted: true,
        status: av.is_open ? 'waiting' : 'waitlisted',
      })
      sessionStorage.setItem('consultationId', consultation.id)

      // Log consent events
      const patientName = `${nameParts[0]} ${nameParts.slice(1).join(' ')}`.trim()
      const consentBase = { consultation_id: consultation.id, patient_name: patientName }
      await Promise.allSettled([
        apiFetch('/api/consents', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...consentBase, consent_type:'hdc_code_of_rights', granted:true }) }),
        apiFetch('/api/consents', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...consentBase, consent_type:'recording_consent', granted: data.recording_consent_raw==='yes' }) }),
        apiFetch('/api/consents', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...consentBase, consent_type:'privacy_policy', granted:true }) }),
        ...(data.is_acc_raw==='yes' ? [apiFetch('/api/consents', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...consentBase, consent_type:'acc_three_part_consent', granted:true }) })] : []),
      ])
      sessionStorage.setItem('accEligible', data.is_acc_raw==='yes'?'yes':'no')
      sessionStorage.setItem('triage_complaint', data.chief_complaint||'')
      sessionStorage.setItem('triage_returning', data.returning ? 'true' : 'false')
      sessionStorage.setItem('patientEmail', data.patient_email||'')
      sessionStorage.setItem('patientName', (nameParts[0]||'') + ' ' + (nameParts.slice(1).join(' ')||''))
      sessionStorage.setItem('patient_language', lang)
      if (av.is_open) {
        navigate('/consultation-type')
      } else {
        navigate(`/waitlisted/${consultation.id}`)
      }
    } catch(e) { console.error(e); setSaving(false) }
  }

  const step = STEPS[currentStep]

  if (showIntro) return <TereIntro onStart={() => { setShowIntro(false); setShowHdcRights(true); trackEvent('intro_viewed', { lang }) }} />
  if (showHdcRights) return <HDCRightsGate onAccepted={() => setShowHdcRights(false)} lang={lang} patientName={data?.patient_name} />

  if (emergency === 'physical') return (
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',background:'#FEF2F2',fontFamily:'Plus Jakarta Sans, sans-serif',direction:langMeta.rtl?'rtl':'ltr'}}>
      <div style={{background:'#991B1B',padding:'.875rem 1.25rem'}}>
        <span style={{fontFamily:'Cormorant Garamond, serif',fontStyle:'italic',color:'white',fontSize:'1.3rem'}}>Tere</span>
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
      <div style={{background:'var(--navy)',padding:'.875rem 1.25rem'}}>
        <span style={{fontFamily:'Cormorant Garamond, serif',fontStyle:'italic',color:'var(--teal-light)',fontSize:'1.3rem'}}>Tere</span>
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
      <div style={{background:'var(--navy)',padding:'.875rem 1.25rem'}}>
        <span style={{fontFamily:'Cormorant Garamond, serif',fontStyle:'italic',color:'var(--teal-light)',fontSize:'1.3rem'}}>Tere</span>
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
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',background:'var(--bg)',fontFamily:'Plus Jakarta Sans, sans-serif',direction:langMeta.rtl?'rtl':'ltr'}}>
      <div style={{background:'var(--navy)',padding:'.875rem 1.25rem',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',maxWidth:600,margin:'0 auto'}}>
          <div>
            <span style={{fontFamily:'Cormorant Garamond, serif',fontStyle:'italic',color:'var(--teal-light)',fontSize:'1.3rem'}}>Tere</span>
            <span style={{color:'rgba(255,255,255,.4)',fontSize:'.8rem',marginLeft:8}}>Health Assistant</span>
          </div>
          <span style={{fontSize:'.75rem',color:'rgba(255,255,255,.35)'}}>🔒 Encrypted</span>
        </div>
      </div>

      <div style={{flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch',padding:'1rem',maxWidth:600,width:'100%',margin:'0 auto',boxSizing:'border-box'}}>
        {messages.map((m,i)=>(
          <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start',marginBottom:'.875rem'}}>
            {m.role==='tere'&&<div style={{width:32,height:32,borderRadius:'50%',background:'var(--teal)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1rem',flexShrink:0,marginRight:8,marginTop:2}}>🩺</div>}
            <div style={{maxWidth:'80%',padding:'.75rem 1rem',borderRadius:m.role==='user'?'18px 18px 4px 18px':'18px 18px 18px 4px',background:m.role==='user'?'var(--teal)':'white',color:m.role==='user'?'white':'var(--text)',fontSize:'.9375rem',lineHeight:1.6,boxShadow:'0 1px 3px rgba(0,0,0,0.08)',border:m.role==='tere'?'1px solid var(--border)':'none'}}>
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
        <div style={{padding:'0 1rem .5rem',maxWidth:600,margin:'0 auto',width:'100%',boxSizing:'border-box',display:'flex',gap:8}}>
          <button onClick={()=>handleSendValue('yes')} className="btn btn-primary" style={{flex:1}}>{t('yes_label', lang)}</button>
          <button onClick={()=>handleSendValue('no')} className="btn btn-secondary" style={{flex:1}}>{t('no_label', lang)}</button>
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
        <div style={{maxWidth:600,margin:'0 auto',display:'flex',gap:8,alignItems:'flex-end'}}>
          {waitingForPhoto&&(
            <>
              <button onClick={()=>fileRef.current?.click()} style={{background:'var(--teal)',border:'none',borderRadius:12,padding:'10px 14px',cursor:'pointer',flexShrink:0,fontSize:'1.1rem',color:'white'}}>📷</button>
              <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" style={{display:'none'}} onChange={handlePhoto}/>
            </>
          )}
          <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend()}}}
            placeholder={waitingForPhoto?"Tap 📷 for photo, or type 'skip'…":"Type your reply…"}
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