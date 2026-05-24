import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { getConsultation } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'

// ── Constants ─────────────────────────────────────────────────────────────────

const ACC_READ_CODES = [
  { code: 'S30', label: 'Ankle sprain' },
  { code: 'S39', label: 'Other ankle injury' },
  { code: 'M13', label: 'Laceration' },
  { code: 'M10', label: 'Contusion / bruise' },
  { code: 'N17', label: 'UTI' },
  { code: 'H05', label: 'URTI' },
  { code: 'H06', label: 'Tonsillitis' },
  { code: 'K22', label: 'Chest pain' },
  { code: 'A84', label: 'Back pain' },
  { code: 'S20', label: 'Wrist sprain' },
  { code: 'F29', label: 'Eye injury' },
  { code: 'S60', label: 'Finger injury' },
  { code: 'T14', label: 'Burn' },
  { code: 'A09', label: 'Headache' },
  { code: 'R05', label: 'Cough' },
  { code: 'J06', label: 'Nausea / vomiting' },
]

const EXAM_SUBSECTIONS = [
  { key: 'general',      label: 'General',      hint: 'Appearance, distress, orientation' },
  { key: 'vitals',       label: 'Vitals',        hint: 'HR, RR, SpO2, BP, Temp' },
  { key: 'heent',        label: 'HEENT',         hint: 'Head, eyes, ears, nose, throat' },
  { key: 'cardiac',      label: 'Cardiac',       hint: 'Heart sounds, rhythm, perfusion' },
  { key: 'respiratory',  label: 'Respiratory',   hint: 'Breath sounds, work of breathing' },
  { key: 'abdomen',      label: 'Abdomen',       hint: 'Inspection, palpation, bowel sounds' },
  { key: 'skin',         label: 'Skin',          hint: 'Colour, rashes, wounds, lesions' },
  { key: 'msk',          label: 'MSK',           hint: 'ROM, tenderness, swelling, neurovascular' },
  { key: 'neurological', label: 'Neurological',  hint: 'GCS, focal deficits, coordination' },
]

const SECTION_LABELS = {
  presentingHistory: '1. Presenting History',
  medicalHistory:    '2. Medical History',
  allergies:         '3. Allergies',
  socialHistory:     '4. Social History',
  examination:       '5. Examination',
  mdm:               '6. Medical Decision Making',
  plan:              '7. Plan',
}

const SECTION_SOURCES = {
  presentingHistory: 'auto-populated from triage + transcript',
  medicalHistory:    'auto-populated from triage',
  allergies:         'auto-populated from triage',
  socialHistory:     'auto-populated from triage',
  examination:       'auto-populated from transcript',
  mdm:               'auto-populated from transcript',
  plan:              'auto-populated from transcript + actions',
}

const SECTION_ROWS = {
  presentingHistory: 6,
  medicalHistory:    4,
  allergies:         2,
  socialHistory:     3,
  mdm:               7,
  plan:              6,
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NoteSection({ sectionKey, value, onChange, disabled, onRegenerate, regenerating }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', marginBottom: '1rem', overflow: 'hidden' }}>
      <div style={{ padding: '.875rem 1.25rem', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAFA' }}>
        <div>
          <span style={{ fontSize: '.8125rem', fontWeight: 700, color: '#0D2B45' }}>{SECTION_LABELS[sectionKey]}</span>
          <span style={{ fontSize: '.7rem', color: '#9CA3AF', marginLeft: 8 }}>{SECTION_SOURCES[sectionKey]}</span>
        </div>
        {!disabled && onRegenerate && (
          <button onClick={() => onRegenerate(sectionKey)} disabled={regenerating}
            style={{ background: 'none', border: '1px solid #E2E8F0', color: regenerating ? '#9CA3AF' : '#0B6E76', padding: '3px 10px', borderRadius: 6, cursor: regenerating ? 'default' : 'pointer', fontSize: '.7rem', fontFamily: 'Plus Jakarta Sans, sans-serif', display: 'flex', alignItems: 'center', gap: 4 }}>
            {regenerating ? '⟳ Regenerating…' : '↺ Regenerate'}
          </button>
        )}
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={SECTION_ROWS[sectionKey] || 4}
        readOnly={disabled}
        style={{ width: '100%', boxSizing: 'border-box', border: 'none', padding: '1rem 1.25rem', fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.9375rem', lineHeight: 1.7, resize: 'vertical', outline: 'none', background: disabled ? '#F8FAFC' : 'white', color: '#1A2A33' }}
      />
    </div>
  )
}

function ExamCard({ exam, setExam, highlighted, disabled, onRegenerate, regenerating }) {
  const [expanded, setExpanded] = useState({})

  function toggle(key) {
    setExpanded(e => ({ ...e, [key]: !e[key] }))
  }

  const isVisible = key => highlighted.includes(key) || expanded[key]

  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', marginBottom: '1rem', overflow: 'hidden' }}>
      <div style={{ padding: '.875rem 1.25rem', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAFA' }}>
        <div>
          <span style={{ fontSize: '.8125rem', fontWeight: 700, color: '#0D2B45' }}>{SECTION_LABELS.examination}</span>
          <span style={{ fontSize: '.7rem', color: '#9CA3AF', marginLeft: 8 }}>{SECTION_SOURCES.examination}</span>
        </div>
        {!disabled && onRegenerate && (
          <button onClick={() => onRegenerate('examination')} disabled={regenerating}
            style={{ background: 'none', border: '1px solid #E2E8F0', color: regenerating ? '#9CA3AF' : '#0B6E76', padding: '3px 10px', borderRadius: 6, cursor: regenerating ? 'default' : 'pointer', fontSize: '.7rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {regenerating ? '⟳ Regenerating…' : '↺ Regenerate'}
          </button>
        )}
      </div>
      <div style={{ padding: '.75rem 1.25rem' }}>
        {highlighted.length > 0 && (
          <div style={{ marginBottom: '.75rem', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {highlighted.map(k => {
              const s = EXAM_SUBSECTIONS.find(s => s.key === k)
              return s ? (
                <span key={k} style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: 4, padding: '1px 7px', fontSize: '.7rem', fontWeight: 600 }}>
                  {s.label} — clinically relevant
                </span>
              ) : null
            })}
          </div>
        )}

        {EXAM_SUBSECTIONS.map(({ key, label, hint }) => {
          const isHighlighted = highlighted.includes(key)
          const isOpen = isVisible(key)
          const content = exam[key] || ''
          const isNA = content.includes('N/A') || content.includes('not clinically indicated')

          return (
            <div key={key} style={{ marginBottom: '.5rem', borderRadius: 8, border: `1.5px solid ${isHighlighted ? '#BFDBFE' : '#F3F4F6'}`, background: isHighlighted ? '#F8FBFF' : 'white', overflow: 'hidden' }}>
              <button
                onClick={() => !isHighlighted && toggle(key)}
                style={{ width: '100%', padding: '.5rem .875rem', background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: isHighlighted ? 'default' : 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '.8125rem', fontWeight: 700, color: isHighlighted ? '#1D4ED8' : '#374151' }}>{label}</span>
                  <span style={{ fontSize: '.7rem', color: '#9CA3AF' }}>{hint}</span>
                </div>
                {!isHighlighted && (
                  <span style={{ fontSize: '.8125rem', color: '#9CA3AF' }}>{isOpen ? '▲' : (isNA ? 'N/A ▼' : '▼')}</span>
                )}
              </button>
              {isOpen && (
                <textarea
                  value={content}
                  onChange={e => !disabled && setExam(ex => ({ ...ex, [key]: e.target.value }))}
                  rows={key === 'vitals' ? 1 : 3}
                  readOnly={disabled}
                  style={{ width: '100%', boxSizing: 'border-box', border: 'none', borderTop: '1px solid #F3F4F6', padding: '.625rem .875rem', fontFamily: key === 'vitals' ? 'monospace' : 'Plus Jakarta Sans, sans-serif', fontSize: '.875rem', lineHeight: 1.6, resize: 'vertical', outline: 'none', background: disabled ? '#F8FAFC' : 'white', color: '#1A2A33' }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ReadCodePicker({ value, onChange, disabled }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const selected = ACC_READ_CODES.find(c => c.code === value)
  const filtered = ACC_READ_CODES.filter(c =>
    !search || c.code.toLowerCase().includes(search.toLowerCase()) || c.label.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    if (selected) setSearch(`${selected.code} — ${selected.label}`)
  }, [value])

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function select(code) {
    onChange(code)
    const c = ACC_READ_CODES.find(x => x.code === code)
    setSearch(c ? `${c.code} — ${c.label}` : code)
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true) }}
        onFocus={() => { setSearch(''); setOpen(true) }}
        readOnly={disabled}
        placeholder="Search Read codes…"
        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: `1.5px solid ${value ? '#0B6E76' : '#E2E8F0'}`, borderRadius: 8, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.875rem', outline: 'none', background: disabled ? '#F8FAFC' : 'white' }}
      />
      {open && !disabled && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.1)', zIndex: 100, maxHeight: 200, overflowY: 'auto', marginTop: 2 }}>
          {filtered.map(c => (
            <button key={c.code} onClick={() => select(c.code)}
              style={{ width: '100%', padding: '8px 12px', border: 'none', background: c.code === value ? '#EFF6FF' : 'white', color: '#1A2A33', fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.8125rem', cursor: 'pointer', display: 'flex', gap: 8, textAlign: 'left' }}>
              <span style={{ fontWeight: 700, color: '#0B6E76', width: 36, flexShrink: 0 }}>{c.code}</span>
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function WorkCapacityPicker({ value, onChange, disabled }) {
  const options = [
    { val: 'fit',      label: 'Fit for work',    color: '#059669', bg: '#F0FDF4', border: '#BBF7D0' },
    { val: 'modified', label: 'Modified duties', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
    { val: 'unfit',    label: 'Unfit for work',  color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  ]
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {options.map(o => (
        <button key={o.val} onClick={() => !disabled && onChange(o.val)}
          style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: `1.5px solid ${value === o.val ? o.border : '#E2E8F0'}`, background: value === o.val ? o.bg : 'white', color: value === o.val ? o.color : '#9CA3AF', fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.75rem', fontWeight: 700, cursor: disabled ? 'default' : 'pointer', transition: 'all .15s' }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Checkbox({ checked, onChange, disabled }) {
  return (
    <div onClick={() => !disabled && onChange(!checked)}
      style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0, border: `2px solid ${checked ? '#059669' : '#D1D5DB'}`, background: checked ? '#059669' : 'white', cursor: disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {checked && <span style={{ color: 'white', fontSize: 12, fontWeight: 700, lineHeight: 1 }}>✓</span>}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function NotesCompletion() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [consult, setConsult]           = useState(null)
  const [loading, setLoading]           = useState(true)
  const [generating, setGenerating]     = useState(false)
  const [generationError, setGenerationError] = useState(null)
  const [saving, setSaving]             = useState(false)
  const [lastSaved, setLastSaved]       = useState(null)
  const [finalising, setFinalising]     = useState(false)

  // Note sections
  const [sections, setSections] = useState({
    presentingHistory: '',
    medicalHistory:    '',
    allergies:         '',
    socialHistory:     '',
    mdm:               '',
    plan:              '',
  })
  const [exam, setExam] = useState({
    general: '', vitals: '', heent: '', cardiac: '',
    respiratory: '', abdomen: '', skin: '', msk: '', neurological: '',
  })
  const [examHighlighted, setExamHighlighted] = useState(['general', 'vitals'])

  // ACC fields
  const [accReadCode, setAccReadCode]   = useState('')
  const [accSection, setAccSection]     = useState({
    claimType: 'New injury', mechanism: '', bodyPart: '',
    injuryDate: '', incapacityForWork: false, returnToWorkDate: '', restrictions: '',
  })

  // Billing (display only)
  const [billing, setBilling]           = useState({ serviceCode: '', durationMinutes: 0, consultationType: 'Video' })

  // Work capacity
  const [workCapacity, setWorkCapacity] = useState('fit')
  const [returnToWorkDate, setReturnToWorkDate] = useState('')

  // Workflow
  const [outcome, setOutcome]           = useState('')
  const [emailDone, setEmailDone]       = useState(null)
  const [attested, setAttested]         = useState(false)
  const [regenerating, setRegenerating] = useState({})

  // GP send
  const [showGpModal, setShowGpModal]   = useState(false)
  const [gpName, setGpName]             = useState('')
  const [gpEmail, setGpEmail]           = useState('')
  const [sendingGp, setSendingGp]       = useState(false)
  const [gpSent, setGpSent]             = useState(false)
  const [sendGpOnFinalise, setSendGpOnFinalise] = useState(false)

  // Recall / follow-up
  const [recallDate, setRecallDate]         = useState('')
  const [recallNote, setRecallNote]         = useState('')

  // Discharge letter (free-text to GP)
  const [dischargeLetter, setDischargeLetter] = useState('')
  const [sendDischargeOnFinalise, setSendDischargeOnFinalise] = useState(false)

  // Medical certificate
  const [showMedCertModal, setShowMedCertModal] = useState(false)
  const [medCertFrom, setMedCertFrom]   = useState(new Date().toISOString().slice(0, 10))
  const [medCertTo, setMedCertTo]       = useState('')
  const [medCertRestrictions, setMedCertRestrictions] = useState('')
  const [medCertDiagnosis, setMedCertDiagnosis] = useState('')
  const [generatingMedCert, setGeneratingMedCert] = useState(false)
  const [medCertIssued, setMedCertIssued] = useState(false)

  // Refs for auto-save
  const draftRef = useRef({})
  const consultRef = useRef(null)
  const actionsRef = useRef([])
  const transcriptRef = useRef('')

  useEffect(() => {
    draftRef.current = { sections, exam, examHighlighted, accReadCode, accSection, billing, workCapacity, returnToWorkDate, outcome, emailDone }
  }, [sections, exam, examHighlighted, accReadCode, accSection, billing, workCapacity, returnToWorkDate, outcome, emailDone])

  // ── Load & auto-generate ──────────────────────────────────────────────────

  useEffect(() => {
    if (!sessionStorage.getItem('clinicianAuth')) { navigate('/clinician'); return }

    async function load() {
      try {
        const data = await getConsultation(id)
        setConsult(data)
        consultRef.current = data
        if (data.gp_name)  setGpName(data.gp_name)
        if (data.gp_email) { setGpEmail(data.gp_email); setSendGpOnFinalise(true) }
        if (data.medical_certificate_issued) setMedCertIssued(true)

        // Actions from route state or notes_draft
        const rs = location.state
        const actions = rs?.actions || data.notes_draft?.actions || []
        actionsRef.current = actions

        // Transcript from route state or DB column
        const transcript = rs?.transcript || data.transcript || ''
        transcriptRef.current = transcript

        // If already finalised, load final note
        if (data.notes_finalised && data.notes_final) {
          try {
            const final = typeof data.notes_final === 'string' ? JSON.parse(data.notes_final) : data.notes_final
            restoreFromSaved(final, data)
          } catch {}
          setLoading(false)
          return
        }

        // If previously drafted, restore
        if (data.notes_draft && data.note_generated_at) {
          const draft = data.notes_draft
          if (draft.sections) restoreFromSaved(draft, data)
          setLoading(false)
          return
        }

        // Otherwise auto-generate
        setLoading(false)
        await runGenerateNotes(data, transcript, actions)
      } catch (e) { console.error(e); setLoading(false) }
    }
    load()
  }, [id, navigate])

  function restoreFromSaved(saved, data) {
    if (saved.sections)  setSections(s => ({ ...s, ...saved.sections }))
    if (saved.exam)      setExam(e => ({ ...e, ...saved.exam }))
    if (saved.examHighlighted) setExamHighlighted(saved.examHighlighted)
    if (saved.accReadCode)     setAccReadCode(saved.accReadCode)
    if (saved.accSection)      setAccSection(a => ({ ...a, ...saved.accSection }))
    if (saved.billing)         setBilling(saved.billing)
    if (saved.workCapacity)    setWorkCapacity(saved.workCapacity)
    if (saved.returnToWorkDate) setReturnToWorkDate(saved.returnToWorkDate)
    if (saved.outcome || data?.outcome) setOutcome(saved.outcome || data?.outcome || '')
    if (saved.emailDone !== undefined)  setEmailDone(saved.emailDone)
  }

  async function buildContext(consultData, transcript, actions) {
    const prescriptions = (actions || []).filter(a => a.type === 'prescription')
    const referrals     = (actions || []).filter(a => a.type === 'radiology')

    let chatMessages = []
    try {
      const { supabase } = await import('../../lib/supabase')
      const { data: msgs } = await supabase.from('messages').select('sender, message').eq('consultation_id', consultData.id).order('created_at')
      chatMessages = msgs || []
    } catch {}

    const durationMinutes = consultData.consultation_duration_seconds
      ? Math.round(consultData.consultation_duration_seconds / 60)
      : 0

    return {
      transcript: transcript || '',
      triage: {
        patientName:          `${consultData.patient_first_name} ${consultData.patient_last_name}`,
        patientDob:           consultData.patient_dob,
        patientNhi:           consultData.patient_nhi,
        patientPhone:         consultData.patient_phone,
        patientEmail:         consultData.patient_email,
        patientLocation:      consultData.patient_location,
        chiefComplaint:       consultData.chief_complaint,
        medicalHistory:       consultData.medical_history,
        medications:          consultData.medications,
        allergies:            consultData.patient_allergies,
        pharmacy:             consultData.pharmacy,
        accEligible:          consultData.acc_eligible === 'yes',
        accInjuryDescription: consultData.acc_injury_details,
        accInjuryDate:        consultData.acc_injury_date,
        accEmployer:          consultData.acc_employer,
      },
      vitals:         consultData.vitals,
      prescriptions,
      referrals,
      chatMessages,
      durationMinutes,
      providerName:        sessionStorage.getItem('providerDisplayName') || consultData.provider_display_name || '',
      providerCredentials: [
        sessionStorage.getItem('prescriberNumber') ? `Prescriber #${sessionStorage.getItem('prescriberNumber')}` : null,
        sessionStorage.getItem('providerCpn')       ? `HPI CPN: ${sessionStorage.getItem('providerCpn')}` : null,
      ].filter(Boolean).join(' | '),
      consultationDate: consultData.created_at,
    }
  }

  async function runGenerateNotes(consultData, transcript, actions) {
    setGenerating(true)
    setGenerationError(null)
    try {
      const body = await buildContext(consultData, transcript, actions)
      const res = await apiFetch('/api/generate-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Generation failed')

      populateFromGenerated(data)

      const { supabase } = await import('../../lib/supabase')
      await supabase.from('consultations').update({ note_generated_at: new Date().toISOString() }).eq('id', id)
    } catch (e) {
      console.error(e)
      setGenerationError(e.message)
    }
    setGenerating(false)
  }

  function populateFromGenerated(data) {
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
      const { highlighted = [], ...examFields } = data.examination
      setExam(e => ({ ...e, ...examFields }))
      setExamHighlighted(highlighted.length ? highlighted : ['general', 'vitals'])
    }
    if (data.accSection) {
      setAccSection(a => ({
        ...a,
        claimType:        data.accSection.claimType        || a.claimType,
        mechanism:        data.accSection.mechanism        || a.mechanism,
        bodyPart:         data.accSection.bodyPart         || a.bodyPart,
        injuryDate:       data.accSection.injuryDate       || a.injuryDate,
        incapacityForWork: data.accSection.incapacityForWork ?? a.incapacityForWork,
        returnToWorkDate:  data.accSection.returnToWorkDate || a.returnToWorkDate,
        restrictions:     data.accSection.restrictions     || a.restrictions,
      }))
    }
    if (data.billing)          setBilling(data.billing)
    if (data.suggestedReadCode) setAccReadCode(data.suggestedReadCode)
    if (data.workCapacity)     setWorkCapacity(data.workCapacity)
  }

  async function regenerateSection(sectionKey) {
    setRegenerating(r => ({ ...r, [sectionKey]: true }))
    try {
      const body = await buildContext(consultRef.current, transcriptRef.current, actionsRef.current)
      const res = await apiFetch('/api/generate-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error)
      if (sectionKey === 'examination') {
        if (data.examination) {
          const { highlighted = [], ...examFields } = data.examination
          setExam(e => ({ ...e, ...examFields }))
          if (highlighted.length) setExamHighlighted(highlighted)
        }
      } else if (data[sectionKey] !== undefined) {
        setSections(s => ({ ...s, [sectionKey]: data[sectionKey] }))
      }
    } catch (e) { alert('Regeneration failed: ' + e.message) }
    setRegenerating(r => ({ ...r, [sectionKey]: false }))
  }

  // ── Auto-save ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const timer = setInterval(async () => {
      if (!id || consult?.notes_finalised) return
      setSaving(true)
      try {
        const { supabase } = await import('../../lib/supabase')
        await supabase.from('consultations').update({ notes_draft: draftRef.current }).eq('id', id)
        setLastSaved(new Date())
      } catch {}
      setSaving(false)
    }, 30000)
    return () => clearInterval(timer)
  }, [id, consult?.notes_finalised])

  async function saveDraft() {
    setSaving(true)
    try {
      const { supabase } = await import('../../lib/supabase')
      await supabase.from('consultations').update({ notes_draft: draftRef.current }).eq('id', id)
      setLastSaved(new Date())
    } catch {}
    setSaving(false)
  }

  // ── Finalise ──────────────────────────────────────────────────────────────

  async function finalise() {
    if (!attested || !outcome) return
    setFinalising(true)
    try {
      const now = new Date().toISOString()
      const { supabase } = await import('../../lib/supabase')

      const finalNote = {
        sections, exam, examHighlighted,
        accSection, billing, accReadCode,
        workCapacity, returnToWorkDate, outcome,
        providerName:        sessionStorage.getItem('providerDisplayName') || '',
        providerCredentials: [
          sessionStorage.getItem('prescriberNumber') ? `Prescriber #${sessionStorage.getItem('prescriberNumber')}` : null,
          sessionStorage.getItem('providerCpn') ? `HPI CPN: ${sessionStorage.getItem('providerCpn')}` : null,
        ].filter(Boolean).join(' | '),
        attestedAt: now,
        actions: actionsRef.current,
      }

      const durSec = consult.consultation_duration_seconds ||
        (consult.started_at ? Math.round((Date.now() - new Date(consult.started_at)) / 1000) : null)

      await supabase.from('consultations').update({
        notes_final:         JSON.stringify(finalNote),
        notes_draft:         null,
        notes_finalised:     true,
        notes_finalised_at:  now,
        note_finalised_at:   now,
        note_finalised_by:   sessionStorage.getItem('providerDisplayName') || '',
        acc_read_code:       accReadCode,
        work_capacity:       workCapacity,
        return_to_work_date: (workCapacity !== 'fit' && returnToWorkDate) ? returnToWorkDate : null,
        billing_code:        billing.serviceCode || (durSec >= 1800 ? 'CS2T' : 'CS1T'),
        outcome,
        status:              'complete',
        completed_at:        consult.completed_at || now,
        consultation_duration_seconds: durSec,
        payment_amount:      consult.payment_amount || (consult.acc_eligible === 'yes' ? 2500 : 6500),
        is_acc:              consult.acc_eligible === 'yes',
        ...(recallDate ? { recall_date: recallDate, recall_note: recallNote || null } : {}),
        ...(dischargeLetter ? { discharge_letter: dischargeLetter } : {}),
      }).eq('id', id)

      // Auto-send patient summary email with rating link
      if (consult.patient_email) {
        apiFetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: consult.patient_email,
            name: `${consult.patient_first_name} ${consult.patient_last_name}`,
            sections,
            notes: {},
            actions: actionsRef.current,
            consult: { chief_complaint: consult.chief_complaint },
            consultationId: id,
          }),
        }).catch(e => console.error('Email error:', e))
      }

      // Auto-send GP letter if toggled on
      if (sendGpOnFinalise && gpEmail.trim()) {
        apiFetch('/api/send-to-gp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consultationId: id,
            gpName: gpName.trim(),
            gpEmail: gpEmail.trim(),
            patientName: `${consult.patient_first_name} ${consult.patient_last_name}`,
            patientNhi: consult.patient_nhi,
            patientDob: consult.patient_dob ? new Date(consult.patient_dob).toLocaleDateString('en-NZ') : '',
            consultationDate: consult.created_at,
            providerName: sessionStorage.getItem('providerDisplayName') || '',
            providerCredentials: sessionStorage.getItem('prescriberNumber') ? `Prescriber #${sessionStorage.getItem('prescriberNumber')}` : '',
            chiefComplaint: consult.chief_complaint,
            noteContent: { ...sections, examination: exam },
          }),
        }).then(() => setGpSent(true)).catch(e => console.error('GP letter error:', e))
      }

      // Auto-send discharge letter to GP if toggled on (and not already sending GP letter above)
      if (sendDischargeOnFinalise && dischargeLetter && gpEmail.trim() && !sendGpOnFinalise) {
        apiFetch('/api/send-to-gp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consultationId: id,
            gpName: gpName.trim(),
            gpEmail: gpEmail.trim(),
            patientName: `${consult.patient_first_name} ${consult.patient_last_name}`,
            patientNhi: consult.patient_nhi,
            patientDob: consult.patient_dob ? new Date(consult.patient_dob).toLocaleDateString('en-NZ') : '',
            consultationDate: consult.created_at,
            providerName: sessionStorage.getItem('providerDisplayName') || '',
            providerCredentials: sessionStorage.getItem('prescriberNumber') ? `Prescriber #${sessionStorage.getItem('prescriberNumber')}` : '',
            chiefComplaint: consult.chief_complaint,
            noteContent: { ...sections, examination: exam },
            dischargeLetter,
          }),
        }).then(() => setGpSent(true)).catch(e => console.error('Discharge letter error:', e))
      }

      navigate('/clinician/dashboard')
    } catch (e) { console.error(e); setFinalising(false) }
  }

  // ── Send to GP ────────────────────────────────────────────────────────────

  async function sendToGp() {
    if (!gpEmail.trim()) return
    setSendingGp(true)
    try {
      const res = await apiFetch('/api/send-to-gp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultationId: id,
          gpName: gpName.trim(),
          gpEmail: gpEmail.trim(),
          patientName:    `${consult.patient_first_name} ${consult.patient_last_name}`,
          patientNhi:     consult.patient_nhi,
          patientDob:     consult.patient_dob ? new Date(consult.patient_dob).toLocaleDateString('en-NZ') : '',
          consultationDate: consult.created_at,
          providerName:   sessionStorage.getItem('providerDisplayName') || '',
          providerCredentials: sessionStorage.getItem('prescriberNumber') ? `Prescriber #${sessionStorage.getItem('prescriberNumber')}` : '',
          chiefComplaint: consult.chief_complaint,
          noteContent: { ...sections, examination: exam },
        }),
      })
      const data = await res.json()
      if (data.ok) { setGpSent(true); setShowGpModal(false) }
      else alert('Failed to send: ' + data.error)
    } catch (e) { alert('Error: ' + e.message) }
    setSendingGp(false)
  }

  // ── Medical certificate ───────────────────────────────────────────────────

  async function generateMedCert() {
    if (!consult.patient_email) { alert('No patient email on file'); return }
    setGeneratingMedCert(true)
    try {
      const res = await apiFetch('/api/generate-med-cert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultationId: id,
          patientName:  `${consult.patient_first_name} ${consult.patient_last_name}`,
          patientDob:   consult.patient_dob ? new Date(consult.patient_dob).toLocaleDateString('en-NZ') : '',
          patientEmail: consult.patient_email,
          patientNhi:   consult.patient_nhi,
          employer:     consult.acc_employer || consult.employer_name || '',
          consultationDate: consult.created_at,
          providerName: sessionStorage.getItem('providerDisplayName') || providerName,
          providerReg:  providerReg,
          workCapacity,
          certFrom: medCertFrom,
          certTo:   medCertTo,
          restrictions: medCertRestrictions,
          diagnosis: medCertDiagnosis || consult.chief_complaint,
        }),
      })
      const data = await res.json()
      if (data.ok) { setMedCertIssued(true); setShowMedCertModal(false) }
      else alert('Failed: ' + data.error)
    } catch (e) { alert('Error: ' + e.message) }
    setGeneratingMedCert(false)
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F2F5' }}>
      <div className="spinner" />
    </div>
  )

  if (!consult) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      Consultation not found.
    </div>
  )

  const isFinalised   = !!consult.notes_finalised
  const isAcc         = consult.acc_eligible === 'yes'
  const canFinalise   = attested && !!outcome
  const durationMin   = consult.consultation_duration_seconds ? Math.round(consult.consultation_duration_seconds / 60) : billing.durationMinutes || 0
  const serviceCode   = billing.serviceCode || (durationMin >= 30 ? 'CS2T' : 'CS1T')
  const providerName  = sessionStorage.getItem('providerDisplayName') || consult.provider_display_name || 'Treating clinician'
  const providerReg   = [
    sessionStorage.getItem('prescriberNumber') ? `Prescriber #${sessionStorage.getItem('prescriberNumber')}` : null,
    sessionStorage.getItem('providerCpn') ? `HPI CPN: ${sessionStorage.getItem('providerCpn')}` : null,
  ].filter(Boolean).join(' · ')

  const card = { background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', padding: '1rem 1.25rem', marginBottom: '1rem' }
  const label = { fontSize: '.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#6B7280', marginBottom: '.625rem', display: 'block' }

  const OUTCOMES = [
    { value: 'discharged',        label: 'Discharged — no further action' },
    { value: 'prescription_only', label: 'Prescription only' },
    { value: 'acc_lodged',        label: 'ACC claim lodged' },
    { value: 'referred_gp',       label: 'Referred to GP' },
    { value: 'referred_ed',       label: 'Referred to ED' },
    { value: 'follow_up',         label: 'Follow-up arranged' },
    { value: 'watchful_waiting',  label: 'Watchful waiting' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>

      {/* Generating overlay */}
      {generating && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,43,69,.85)', zIndex: 999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
          <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} />
          <div style={{ color: 'white', fontSize: '1.125rem', fontWeight: 600 }}>Generating clinical notes…</div>
          <div style={{ color: 'rgba(255,255,255,.55)', fontSize: '.875rem', textAlign: 'center', maxWidth: 360 }}>
            Tere Scribe is parsing the transcript and triage data.<br />This takes about 20 seconds.
          </div>
        </div>
      )}

      {/* Medical certificate modal */}
      {showMedCertModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 16, padding: '1.5rem', width: 440, boxShadow: '0 20px 40px rgba(0,0,0,.2)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0D2B45', marginBottom: '1rem' }}>Medical certificate</h3>
            <div style={{ marginBottom: '.75rem' }}>
              <label style={label}>Work capacity</label>
              <div style={{ fontWeight: 700, color: workCapacity === 'unfit' ? '#DC2626' : '#D97706', fontSize: '.9375rem' }}>
                {workCapacity === 'unfit' ? 'Unfit for work' : 'Modified duties only'}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', marginBottom: '.75rem' }}>
              <div>
                <label style={label}>From date</label>
                <input type="date" value={medCertFrom} onChange={e => setMedCertFrom(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.875rem', outline: 'none' }} />
              </div>
              <div>
                <label style={label}>To date</label>
                <input type="date" value={medCertTo} onChange={e => setMedCertTo(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.875rem', outline: 'none' }} />
              </div>
            </div>
            <div style={{ marginBottom: '.75rem' }}>
              <label style={label}>Diagnosis (general terms)</label>
              <input value={medCertDiagnosis} onChange={e => setMedCertDiagnosis(e.target.value)}
                placeholder={consult.chief_complaint || 'e.g. Acute musculoskeletal injury'}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.875rem', outline: 'none' }} />
            </div>
            {workCapacity === 'modified' && (
              <div style={{ marginBottom: '.75rem' }}>
                <label style={label}>Restrictions</label>
                <textarea value={medCertRestrictions} onChange={e => setMedCertRestrictions(e.target.value)}
                  rows={2} placeholder="e.g. No heavy lifting, limited standing"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.875rem', outline: 'none', resize: 'vertical' }} />
              </div>
            )}
            <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginBottom: '1rem' }}>
              Certificate will be emailed to <strong>{consult.patient_email}</strong>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowMedCertModal(false)} style={{ flex: 1, padding: '10px', border: '1px solid #E2E8F0', borderRadius: 8, background: 'white', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600, color: '#6B7280' }}>Cancel</button>
              <button onClick={generateMedCert} disabled={generatingMedCert}
                style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 8, background: '#0B6E76', color: 'white', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700 }}>
                {generatingMedCert ? 'Sending…' : 'Generate & email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GP modal */}
      {showGpModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 16, padding: '1.5rem', width: 420, boxShadow: '0 20px 40px rgba(0,0,0,.2)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0D2B45', marginBottom: '1rem' }}>Send to GP</h3>
            <div style={{ marginBottom: '.75rem' }}>
              <label style={{ ...label }}>GP Name</label>
              <input value={gpName} onChange={e => setGpName(e.target.value)} placeholder="Smith"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.9375rem', outline: 'none' }} />
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ ...label }}>GP Email <span style={{ color: '#DC2626' }}>*</span></label>
              <input value={gpEmail} onChange={e => setGpEmail(e.target.value)} placeholder="dr.smith@practice.co.nz" type="email"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.9375rem', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowGpModal(false)} style={{ flex: 1, padding: '10px', border: '1px solid #E2E8F0', borderRadius: 8, background: 'white', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 600, color: '#6B7280' }}>Cancel</button>
              <button onClick={sendToGp} disabled={!gpEmail.trim() || sendingGp}
                style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 8, background: !gpEmail.trim() ? '#E2E8F0' : '#0B6E76', color: !gpEmail.trim() ? '#9CA3AF' : 'white', cursor: !gpEmail.trim() ? 'default' : 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700 }}>
                {sendingGp ? 'Sending…' : 'Send letter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav style={{ background: '#0D2B45', padding: '.875rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#D4EEF0', fontSize: '1.3rem' }}>Tere</span>
          <span style={{ color: 'rgba(255,255,255,.45)', fontSize: '.8125rem' }}>
            Clinical notes — {consult.patient_first_name} {consult.patient_last_name}
          </span>
          {isFinalised && <span style={{ background: '#065F46', color: '#6EE7B7', fontSize: '.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>FINALISED</span>}
          {generating && <span style={{ color: 'rgba(255,255,255,.4)', fontSize: '.75rem' }}>Tere Scribe generating…</span>}
        </div>
        <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
          {saving && <span style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.35)' }}>Saving…</span>}
          {lastSaved && !saving && <span style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.35)' }}>Saved {lastSaved.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })}</span>}
          {!isFinalised && (
            <button onClick={async () => { await saveDraft(); navigate('/clinician/dashboard') }}
              style={{ background: 'rgba(255,255,255,.1)', border: 'none', color: 'rgba(255,255,255,.7)', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '.8125rem' }}>
              Save draft & return
            </button>
          )}
          {isFinalised && (
            <button onClick={() => navigate('/clinician/dashboard')}
              style={{ background: 'rgba(255,255,255,.1)', border: 'none', color: 'rgba(255,255,255,.7)', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '.8125rem' }}>
              ← Dashboard
            </button>
          )}
        </div>
      </nav>

      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem', alignItems: 'start' }}>

        {/* ── Left: Clinical document ── */}
        <div>

          {/* Document header */}
          <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem 2rem', marginBottom: '1rem', border: '1px solid #E2E8F0', borderTop: '4px solid #0B6E76' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', color: '#0B6E76', fontSize: '1rem', marginBottom: '.25rem' }}>Tere Health — Clinical Record</div>
                <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: '#0D2B45', margin: '0 0 .25rem' }}>
                  {consult.patient_first_name} {consult.patient_last_name}
                </h2>
                <div style={{ fontSize: '.875rem', color: '#6B7280' }}>
                  NHI: {consult.patient_nhi || '—'} &nbsp;·&nbsp; DOB: {consult.patient_dob ? new Date(consult.patient_dob).toLocaleDateString('en-NZ') : '—'}
                  {consult.patient_allergies && consult.patient_allergies.toLowerCase() !== 'none' && (
                    <span style={{ color: '#DC2626', fontWeight: 600, marginLeft: '.75rem' }}>⚠ {consult.patient_allergies}</span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '.8125rem', color: '#6B7280' }}>
                <div style={{ fontWeight: 600, color: '#0D2B45' }}>{new Date(consult.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                <div>{new Date(consult.created_at).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })}</div>
                <div style={{ marginTop: 4 }}>Video telehealth · {durationMin > 0 ? `${durationMin} min` : '—'}</div>
                {consult.notes_finalised_at && <div style={{ color: '#059669', fontWeight: 600, marginTop: 4 }}>Finalised {new Date(consult.notes_finalised_at).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })}</div>}
              </div>
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '.875rem', fontSize: '.9375rem', color: '#374151', lineHeight: 1.6 }}>
              <strong>Presenting complaint:</strong> {consult.chief_complaint}
            </div>

            {generationError && (
              <div style={{ marginTop: '.75rem', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '.75rem 1rem', fontSize: '.8125rem', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Note generation failed: {generationError}</span>
                <button onClick={() => runGenerateNotes(consult, transcriptRef.current, actionsRef.current)}
                  style={{ background: '#DC2626', color: 'white', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.75rem', fontWeight: 600 }}>Retry</button>
              </div>
            )}
          </div>

          {/* Note sections 1–4 */}
          {(['presentingHistory', 'medicalHistory', 'allergies', 'socialHistory']).map(key => (
            <NoteSection key={key} sectionKey={key}
              value={sections[key]}
              onChange={v => setSections(s => ({ ...s, [key]: v }))}
              disabled={isFinalised}
              onRegenerate={regenerateSection}
              regenerating={regenerating[key]}
            />
          ))}

          {/* Section 5: Examination */}
          <ExamCard
            exam={exam} setExam={setExam}
            highlighted={examHighlighted}
            disabled={isFinalised}
            onRegenerate={regenerateSection}
            regenerating={regenerating.examination}
          />

          {/* Sections 6–7: MDM + Plan */}
          {(['mdm', 'plan']).map(key => (
            <NoteSection key={key} sectionKey={key}
              value={sections[key]}
              onChange={v => setSections(s => ({ ...s, [key]: v }))}
              disabled={isFinalised}
              onRegenerate={regenerateSection}
              regenerating={regenerating[key]}
            />
          ))}

          {/* Footer attestation text */}
          <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '.875rem 1.25rem', fontSize: '.75rem', color: '#9CA3AF', lineHeight: 1.6, marginBottom: '1rem' }}>
            Record created {new Date(consult.created_at).toLocaleString('en-NZ')} · {providerName}{providerReg ? ` · ${providerReg}` : ''}
            {consult.notes_finalised_at && ` · Finalised ${new Date(consult.notes_finalised_at).toLocaleString('en-NZ')}`}
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div>

          {/* Patient info */}
          <div style={card}>
            <span style={label}>Patient</span>
            {[
              ['Phone',    consult.patient_phone],
              ['Email',    consult.patient_email],
              ['Location', consult.patient_location],
              ['Allergies', consult.patient_allergies || 'None documented'],
              ['Pharmacy', consult.pharmacy || '—'],
            ].filter(([, v]) => v && v !== '—').map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #F9FAFB', fontSize: '.8125rem' }}>
                <span style={{ color: '#9CA3AF' }}>{k}</span>
                <span style={{ fontWeight: 500, color: k === 'Allergies' && v !== 'None documented' ? '#DC2626' : '#1A2A33' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* 8. ACC Section */}
          {isAcc && (
            <div style={{ ...card, borderColor: '#BFDBFE' }}>
              <span style={{ ...label, color: '#1D4ED8' }}>8. ACC Section</span>
              <div style={{ marginBottom: '.625rem' }}>
                <div style={{ fontSize: '.7rem', color: '#9CA3AF', marginBottom: 4 }}>Claim type</div>
                <select value={accSection.claimType} onChange={e => setAccSection(a => ({ ...a, claimType: e.target.value }))} disabled={isFinalised}
                  style={{ width: '100%', padding: '6px 8px', border: '1.5px solid #E2E8F0', borderRadius: 6, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.8125rem', outline: 'none', background: isFinalised ? '#F8FAFC' : 'white' }}>
                  <option>New injury</option>
                  <option>Gradual process</option>
                  <option>Treatment injury</option>
                </select>
              </div>
              {[
                { key: 'mechanism', label: 'Injury mechanism' },
                { key: 'bodyPart',  label: 'Body part injured' },
              ].map(({ key, label: lbl }) => (
                <div key={key} style={{ marginBottom: '.625rem' }}>
                  <div style={{ fontSize: '.7rem', color: '#9CA3AF', marginBottom: 4 }}>{lbl}</div>
                  <input value={accSection[key] || ''} onChange={e => setAccSection(a => ({ ...a, [key]: e.target.value }))} readOnly={isFinalised}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1.5px solid #E2E8F0', borderRadius: 6, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.8125rem', outline: 'none', background: isFinalised ? '#F8FAFC' : 'white' }} />
                </div>
              ))}
              <div style={{ marginBottom: '.625rem' }}>
                <div style={{ fontSize: '.7rem', color: '#9CA3AF', marginBottom: 4 }}>ACC Read code</div>
                <ReadCodePicker value={accReadCode} onChange={setAccReadCode} disabled={isFinalised} />
              </div>
              <div style={{ marginBottom: '.625rem' }}>
                <div style={{ fontSize: '.7rem', color: '#9CA3AF', marginBottom: 4 }}>Injury date</div>
                <input type="date" value={accSection.injuryDate || ''} onChange={e => setAccSection(a => ({ ...a, injuryDate: e.target.value }))} readOnly={isFinalised}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1.5px solid #E2E8F0', borderRadius: 6, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.8125rem', outline: 'none', background: isFinalised ? '#F8FAFC' : 'white' }} />
              </div>
              <div style={{ marginBottom: '.625rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: isFinalised ? 'default' : 'pointer' }}>
                  <Checkbox checked={accSection.incapacityForWork} onChange={v => !isFinalised && setAccSection(a => ({ ...a, incapacityForWork: v }))} disabled={isFinalised} />
                  <span style={{ fontSize: '.8125rem', color: '#374151' }}>Incapacity for work</span>
                </label>
              </div>
              <div style={{ marginBottom: 0 }}>
                <div style={{ fontSize: '.7rem', color: '#6B7280', marginBottom: 4 }}>Consent recorded</div>
                <div style={{ fontSize: '.8125rem', color: '#059669', fontWeight: 600 }}>✓ Three-part ACC consent at triage</div>
              </div>
            </div>
          )}

          {/* Work capacity */}
          <div style={card}>
            <span style={label}>Work capacity</span>
            <WorkCapacityPicker value={workCapacity} onChange={setWorkCapacity} disabled={isFinalised} />
            {workCapacity !== 'fit' && (
              <div style={{ marginTop: '.625rem' }}>
                <div style={{ fontSize: '.7rem', color: '#9CA3AF', marginBottom: 4 }}>Return to work date</div>
                <input type="date" value={returnToWorkDate} onChange={e => setReturnToWorkDate(e.target.value)} readOnly={isFinalised}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1.5px solid #E2E8F0', borderRadius: 6, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.8125rem', outline: 'none', background: isFinalised ? '#F8FAFC' : 'white' }} />
              </div>
            )}
          </div>

          {/* 9. Billing */}
          <div style={{ ...card, background: '#F8FAFC', borderStyle: 'dashed' }}>
            <span style={label}>9. Billing (auto-populated)</span>
            {[
              ['Service date', new Date(consult.created_at).toLocaleDateString('en-NZ')],
              ['Duration',     durationMin > 0 ? `${durationMin} min` : '—'],
              ['Service code', serviceCode],
              ['Consult type', 'Video telehealth'],
              ['Patient NHI',  consult.patient_nhi || '—'],
              ['Provider CPN', sessionStorage.getItem('providerCpn') || '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '.8125rem' }}>
                <span style={{ color: '#9CA3AF' }}>{k}</span>
                <span style={{ fontWeight: 600, color: '#374151' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Outcome */}
          <div style={{ ...card, borderColor: !outcome && !isFinalised ? '#FDE68A' : '#E2E8F0' }}>
            <span style={label}>Consultation outcome <span style={{ color: '#DC2626' }}>*</span></span>
            <select value={outcome} onChange={e => setOutcome(e.target.value)} disabled={isFinalised}
              style={{ width: '100%', padding: '.75rem', border: `1.5px solid ${!outcome && !isFinalised ? '#FDE68A' : '#E2E8F0'}`, borderRadius: 8, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.875rem', color: outcome ? '#1A2A33' : '#9CA3AF', background: isFinalised ? '#F8FAFC' : 'white', outline: 'none' }}>
              <option value="">Select outcome…</option>
              {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Patient email confirmation */}
          <div style={card}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: isFinalised ? 'default' : 'pointer' }}>
              <Checkbox checked={emailDone === true} onChange={v => !isFinalised && setEmailDone(v ? true : null)} disabled={isFinalised} />
              <span style={{ fontSize: '.875rem', color: '#374151' }}>Patient summary email sent</span>
            </label>
            {consult.patient_email && <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: 4, paddingLeft: 28 }}>{consult.patient_email}</div>}
          </div>

          {/* Medical certificate */}
          {(workCapacity === 'modified' || workCapacity === 'unfit') && (
            <div style={card}>
              <span style={label}>Medical certificate</span>
              {medCertIssued || consult.medical_certificate_issued ? (
                <div style={{ fontSize: '.875rem', color: '#059669', fontWeight: 600 }}>✓ Certificate emailed to patient</div>
              ) : (
                <button onClick={() => setShowMedCertModal(true)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #D97706', borderRadius: 8, background: '#FFFBEB', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.875rem', color: '#92400E', fontWeight: 600 }}>
                  📄 Generate medical certificate
                </button>
              )}
            </div>
          )}

          {/* Send to GP */}
          <div style={card}>
            <span style={label}>GP letter</span>
            {gpSent || consult.gp_letter_sent_at ? (
              <div style={{ fontSize: '.875rem', color: '#059669', fontWeight: 600 }}>✓ Sent to {consult.gp_email || gpEmail}</div>
            ) : (
              <>
                {gpEmail && !isFinalised && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: '.625rem' }}>
                    <Checkbox checked={sendGpOnFinalise} onChange={setSendGpOnFinalise} />
                    <span style={{ fontSize: '.8125rem', color: '#374151' }}>Auto-send on finalise</span>
                  </label>
                )}
                {gpEmail && (
                  <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginBottom: '.625rem' }}>{gpEmail}</div>
                )}
                <button onClick={() => setShowGpModal(true)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #E2E8F0', borderRadius: 8, background: 'white', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.875rem', color: '#374151', fontWeight: 600 }}>
                  ✉ {gpEmail ? 'Edit & send to GP' : 'Send to GP'}
                </button>
              </>
            )}
          </div>

          {/* Recall / follow-up */}
          <div style={card}>
            <span style={label}>Recall / follow-up</span>
            <div style={{ marginBottom: '.625rem' }}>
              <div style={{ fontSize: '.7rem', color: '#9CA3AF', marginBottom: 4 }}>Follow-up date</div>
              <input type="date" value={recallDate} onChange={e => setRecallDate(e.target.value)} readOnly={isFinalised}
                style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: `1.5px solid ${recallDate ? '#0B6E76' : '#E2E8F0'}`, borderRadius: 6, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.8125rem', outline: 'none', background: isFinalised ? '#F8FAFC' : 'white' }} />
            </div>
            <div>
              <div style={{ fontSize: '.7rem', color: '#9CA3AF', marginBottom: 4 }}>Follow-up note</div>
              <textarea value={recallNote} onChange={e => setRecallNote(e.target.value)} readOnly={isFinalised}
                rows={2} placeholder="e.g. Review blood pressure in 2 weeks"
                style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1.5px solid #E2E8F0', borderRadius: 6, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.8125rem', resize: 'vertical', outline: 'none', background: isFinalised ? '#F8FAFC' : 'white' }} />
            </div>
          </div>

          {/* Discharge letter */}
          <div style={card}>
            <span style={label}>Discharge letter</span>
            <textarea value={dischargeLetter} onChange={e => setDischargeLetter(e.target.value)} readOnly={isFinalised}
              rows={4} placeholder="Optional free-text letter to GP on discharge…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1.5px solid #E2E8F0', borderRadius: 6, fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.8125rem', lineHeight: 1.6, resize: 'vertical', outline: 'none', background: isFinalised ? '#F8FAFC' : 'white', marginBottom: '.625rem' }} />
            {dischargeLetter && gpEmail && !isFinalised && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <Checkbox checked={sendDischargeOnFinalise} onChange={setSendDischargeOnFinalise} />
                <span style={{ fontSize: '.8125rem', color: '#374151' }}>Email discharge letter to GP on finalise</span>
              </label>
            )}
            {dischargeLetter && !gpEmail && !isFinalised && (
              <div style={{ fontSize: '.75rem', color: '#9CA3AF' }}>Add GP email above to auto-send on finalise</div>
            )}
          </div>

          {/* Attestation + Finalise */}
          {!isFinalised && (
            <div style={{ ...card, background: attested ? '#F0FDF4' : 'white', borderColor: attested ? '#BBF7D0' : '#E2E8F0' }}>
              <label style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-start', cursor: 'pointer', marginBottom: '1rem' }}>
                <Checkbox checked={attested} onChange={setAttested} />
                <span style={{ fontSize: '.8125rem', lineHeight: 1.6, color: '#374151' }}>
                  I, <strong>{providerName}</strong>{providerReg ? `, ${providerReg},` : ','} confirm these notes accurately reflect the telehealth consultation I conducted on <strong>{new Date(consult.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}</strong> with <strong>{consult.patient_first_name} {consult.patient_last_name}</strong>{consult.patient_nhi ? ` (NHI: ${consult.patient_nhi})` : ''}. I accept clinical and legal responsibility for this record. Consultation conducted via Tere Health telehealth platform in accordance with MCNZ/Paramedicine Council telehealth standards.
                </span>
              </label>
              <button onClick={finalise} disabled={!canFinalise || finalising}
                style={{ width: '100%', padding: '.875rem', borderRadius: 8, border: 'none', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: '.9375rem', cursor: canFinalise ? 'pointer' : 'default', background: canFinalise ? '#059669' : '#E2E8F0', color: canFinalise ? 'white' : '#9CA3AF', transition: 'all .2s' }}>
                {finalising ? 'Finalising…' : '✓ Finalise & complete'}
              </button>
              {!outcome && <div style={{ fontSize: '.75rem', color: '#D97706', marginTop: '.5rem', textAlign: 'center' }}>Select an outcome to enable finalise</div>}
              {!attested && outcome && <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: '.5rem', textAlign: 'center' }}>Tick the attestation to enable finalise</div>}
            </div>
          )}

          {/* Finalised state */}
          {isFinalised && (
            <div style={{ ...card, background: '#F0FDF4', borderColor: '#BBF7D0', textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', marginBottom: '.5rem' }}>✓</div>
              <div style={{ fontWeight: 700, color: '#059669', marginBottom: '.25rem' }}>Notes finalised</div>
              {consult.notes_finalised_at && (
                <div style={{ fontSize: '.8125rem', color: '#6B7280' }}>{new Date(consult.notes_finalised_at).toLocaleString('en-NZ')}</div>
              )}
            </div>
          )}

          <div style={{ fontSize: '.75rem', color: '#9CA3AF', textAlign: 'center' }}>
            {isFinalised ? 'Notes are finalised and locked' : lastSaved ? `Draft saved ${lastSaved.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })}` : 'Auto-saves every 30 seconds'}
          </div>
        </div>
      </div>
    </div>
  )
}
