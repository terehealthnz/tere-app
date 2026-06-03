import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { getConsultation } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'

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

export default function ProviderNotes() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [consult, setConsult]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [generating, setGenerating] = useState(false)
  const [finalising, setFinalising] = useState(false)
  const [genError, setGenError]     = useState(null)

  const [sections, setSections] = useState({
    presentingHistory:'', medicalHistory:'', allergies:'',
    socialHistory:'', mdm:'', plan:'',
  })
  const [exam, setExam] = useState({
    general:'', vitals:'', msk:'',
  })
  const [confirmed, setConfirmed] = useState({
    presentingHistory:false, medicalHistory:false, allergies:false,
    socialHistory:false, examination:false, mdm:false, plan:false,
  })

  const [workCapacity, setWorkCapacity] = useState('fit')
  const [returnDate, setReturnDate]     = useState('')
  const [accReadCode, setAccReadCode]   = useState('')
  const [accMechanism, setAccMechanism] = useState('')
  const [accBodyPart, setAccBodyPart]   = useState('')
  const [outcome, setOutcome]           = useState('')
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
    if (d.sections) setSections(s => ({ ...s, ...d.sections }))
    if (d.exam)     setExam(e => ({ ...e, ...d.exam }))
    if (d.workCapacity) setWorkCapacity(d.workCapacity)
    if (d.returnDate)   setReturnDate(d.returnDate)
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

      setSections(s => ({
        ...s,
        presentingHistory: data.presentingHistory || s.presentingHistory,
        medicalHistory:    data.medicalHistory    || s.medicalHistory,
        allergies:         data.allergies         || s.allergies,
        socialHistory:     data.socialHistory     || s.socialHistory,
        mdm:               data.mdm               || s.mdm,
        plan:              data.plan              || s.plan,
      }))
      if (data.examination) {
        const { highlighted:_, ...fields } = data.examination
        setExam(e => ({ ...e, ...fields }))
      }
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
    const draft = { sections, exam, workCapacity, returnDate, accReadCode, accMechanism, accBodyPart, outcome }
    localStorage.setItem(draftKey, JSON.stringify(draft))
  }, [sections, exam, workCapacity, returnDate, accReadCode, accMechanism, accBodyPart, outcome])

  const allConfirmed = Object.values(confirmed).every(Boolean)
  const canFinalise  = allConfirmed && !!outcome && attested

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
        sections, exam, workCapacity, returnDate, accReadCode,
        accSection: { mechanism:accMechanism, bodyPart:accBodyPart },
        outcome, providerName, attestedAt: now,
        actions: actionsRef.current,
      }

      await supabase.from('consultations').update({
        notes_final:         JSON.stringify(finalNote),
        notes_draft:         null,
        notes_finalised:     true,
        notes_finalised_at:  now,
        note_finalised_at:   now,
        note_finalised_by:   providerName,
        acc_read_code:       accReadCode,
        work_capacity:       workCapacity,
        return_to_work_date: workCapacity !== 'fit' && returnDate ? returnDate : null,
        billing_code:        durationSec >= 1800 ? 'CS2T' : 'CS1T',
        outcome,
        status:              'complete',
        completed_at:        consult.completed_at || now,
        consultation_duration_seconds: durationSec,
        payment_amount:      consult.payment_amount || (consult.acc_eligible === 'yes' ? 2500 : 6500),
        is_acc:              consult.acc_eligible === 'yes',
      }).eq('id', id)

      // Patient summary email
      if (consult.patient_email) {
        apiFetch('/api/send-email', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            to: consult.patient_email,
            name: `${consult.patient_first_name} ${consult.patient_last_name}`,
            sections, notes:{}, actions: actionsRef.current,
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

        {/* Note sections */}
        <NoteSection
          title="1. Presenting history"
          value={sections.presentingHistory}
          onChange={v => setSections(s => ({ ...s, presentingHistory:v }))}
          confirmed={confirmed.presentingHistory}
          onConfirm={() => setConfirmed(c => ({ ...c, presentingHistory:true }))}
          loading={generating}
        />
        <NoteSection
          title="2. Medical history"
          value={sections.medicalHistory}
          onChange={v => setSections(s => ({ ...s, medicalHistory:v }))}
          confirmed={confirmed.medicalHistory}
          onConfirm={() => setConfirmed(c => ({ ...c, medicalHistory:true }))}
          loading={generating}
        />
        <NoteSection
          title="3. Allergies"
          value={sections.allergies}
          onChange={v => setSections(s => ({ ...s, allergies:v }))}
          confirmed={confirmed.allergies}
          onConfirm={() => setConfirmed(c => ({ ...c, allergies:true }))}
          loading={generating}
        />
        <NoteSection
          title="4. Social history"
          value={sections.socialHistory}
          onChange={v => setSections(s => ({ ...s, socialHistory:v }))}
          confirmed={confirmed.socialHistory}
          onConfirm={() => setConfirmed(c => ({ ...c, socialHistory:true }))}
          loading={generating}
        />

        {/* Examination — simplified for mobile */}
        <div style={{ background:'white', borderRadius:14, border:`1.5px solid ${confirmed.examination?'#BBF7D0':'#E2E8F0'}`, marginBottom:12, overflow:'hidden' }}>
          <button
            onClick={() => {}}
            style={{ width:'100%', padding:'14px 16px', background:'none', border:'none', display:'flex', alignItems:'center', gap:10, fontFamily:FF, cursor:'default' }}>
            {confirmed.examination
              ? <span style={{ width:22, height:22, borderRadius:'50%', background:GREEN, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ color:'white', fontSize:12, fontWeight:700 }}>✓</span>
                </span>
              : <span style={{ width:22, height:22, borderRadius:'50%', border:'2px solid #E2E8F0', display:'inline-block', flexShrink:0 }} />
            }
            <span style={{ fontWeight:700, fontSize:'.9375rem', color:confirmed.examination?GREEN:NAVY }}>5. Examination</span>
            {generating && <span style={{ fontSize:'.6875rem', color:'#9CA3AF' }}>Generating…</span>}
          </button>
          <div style={{ borderTop:'1px solid #F3F4F6', padding:'0 16px 14px' }}>
            {[
              { key:'general', label:'General' },
              { key:'vitals',  label:'Vitals' },
              { key:'msk',     label:'MSK' },
            ].map(({ key, label }) => (
              <div key={key} style={{ marginBottom:10 }}>
                <div style={{ fontSize:'.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#9CA3AF', marginBottom:4 }}>{label}</div>
                <textarea
                  value={exam[key] || ''}
                  onChange={e => setExam(ex => ({ ...ex, [key]:e.target.value }))}
                  rows={2}
                  readOnly={isFinalised}
                  style={{ width:'100%', boxSizing:'border-box', border:'1.5px solid #E2E8F0', borderRadius:8, padding:'10px', fontFamily:FF, fontSize:'1rem', lineHeight:1.6, resize:'none', outline:'none', background:isFinalised?'#F8FAFC':'white' }}
                />
              </div>
            ))}
            {!confirmed.examination && (
              <button
                onClick={() => setConfirmed(c => ({ ...c, examination:true }))}
                style={{ width:'100%', minHeight:48, borderRadius:10, border:`1.5px solid ${GREEN}`, background:'#F0FDF4', color:GREEN, fontFamily:FF, fontWeight:700, fontSize:'.9375rem', cursor:'pointer' }}>
                ✓ Confirm section
              </button>
            )}
          </div>
        </div>

        <NoteSection
          title="6. Medical decision making"
          value={sections.mdm}
          onChange={v => setSections(s => ({ ...s, mdm:v }))}
          confirmed={confirmed.mdm}
          onConfirm={() => setConfirmed(c => ({ ...c, mdm:true }))}
          loading={generating}
        />
        <NoteSection
          title="7. Plan"
          value={sections.plan}
          onChange={v => setSections(s => ({ ...s, plan:v }))}
          confirmed={confirmed.plan}
          onConfirm={() => setConfirmed(c => ({ ...c, plan:true }))}
          loading={generating}
        />

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

            {!allConfirmed && <div style={{ textAlign:'center', fontSize:'.8125rem', color:'#D97706', marginTop:8 }}>Confirm all note sections above to continue</div>}
            {allConfirmed && !outcome && <div style={{ textAlign:'center', fontSize:'.8125rem', color:'#D97706', marginTop:8 }}>Select a consultation outcome to continue</div>}
            {allConfirmed && outcome && !attested && <div style={{ textAlign:'center', fontSize:'.8125rem', color:'#9CA3AF', marginTop:8 }}>Tick the attestation above to finalise</div>}
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
    </div>
  )
}
