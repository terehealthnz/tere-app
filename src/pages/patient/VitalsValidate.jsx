import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadFaceMesh, inspectDevice, calibrateRPPG, MultiPassMeasurement, getAmbientTemp } from '../../lib/rppg'
import { saveValidationSubject, saveValidationReading, getTrainableReadings, getValidationReadingCount, getValidationReadings, getValidationSubjectsWithLastScan, supabase } from '../../lib/supabase'
import { trainModel, predictBP, getLocalMeta } from '../../lib/bpModel'
import { calculateSpO2, fitSpO2Calibration } from '../../lib/spo2'

const TEAL = '#0B6E76'
const NAVY = '#0D2B45'
const BG = '#F7F5F0'

const FITZPATRICK = [
  { scale: 1, color: '#FDDBB4' },
  { scale: 2, color: '#EAA882' },
  { scale: 3, color: '#D08B5B' },
  { scale: 4, color: '#AE5D29' },
  { scale: 5, color: '#694D3D' },
  { scale: 6, color: '#2C1503' },
]

function genCode() {
  return `TERE-${String(Math.floor(Math.random() * 900) + 100)}`
}

function lastScanLabel(lastScanAt) {
  if (!lastScanAt) return 'no scans yet'
  const now = new Date()
  const then = new Date(lastScanAt)
  const diffMs = now - then
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return 'last scan: today'
  if (diffDays === 1) return 'last scan: yesterday'
  return `last scan: ${diffDays} days ago`
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: 'white', borderRadius: 16, padding: '1.5rem', boxShadow: '0 2px 12px rgba(0,0,0,.06)', ...style }}>
      {children}
    </div>
  )
}

function Btn({ onClick, disabled, children, secondary = false, style = {} }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: secondary ? 'transparent' : TEAL, color: secondary ? TEAL : 'white',
      border: secondary ? `2px solid ${TEAL}` : 'none',
      borderRadius: 99, padding: '.75rem 2rem', fontWeight: 700, fontSize: '1rem',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .5 : 1, ...style,
    }}>
      {children}
    </button>
  )
}

function Toggle({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
      {options.map(([val, label]) => (
        <button key={val} onClick={() => onChange(val)}
          style={{
            background: value === val ? TEAL : 'white', color: value === val ? 'white' : NAVY,
            border: `1.5px solid ${value === val ? TEAL : '#E5E7EB'}`, borderRadius: 99,
            padding: '.4rem 1rem', fontSize: '.9rem', fontWeight: 600, cursor: 'pointer',
            fontFamily: 'Plus Jakarta Sans, sans-serif', transition: 'all .15s',
          }}>
          {label}
        </button>
      ))}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder = '', min, max }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
      <label style={{ fontSize: '.85rem', fontWeight: 600, color: NAVY }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} min={min} max={max}
        style={{ border: '1.5px solid #E5E7EB', borderRadius: 10, padding: '.65rem .9rem', fontSize: '1rem', fontFamily: 'Plus Jakarta Sans, sans-serif', color: NAVY, outline: 'none', width: '100%', boxSizing: 'border-box' }}
      />
    </div>
  )
}

function StepHeader({ step, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: TEAL, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.9rem', flexShrink: 0 }}>
        {step}
      </div>
      <div style={{ fontWeight: 700, fontSize: '1rem', color: NAVY }}>{label}</div>
    </div>
  )
}

function SubjectBadge({ subject, onSwitch }) {
  if (!subject) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.75rem', background: 'white', borderRadius: 10, padding: '.6rem 1rem', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
      <div style={{ fontWeight: 700, color: NAVY, fontSize: '.9rem' }}>{subject.first_name}</div>
      {subject.age && <div style={{ fontSize: '.8rem', color: '#6B7280' }}>{subject.age}y{subject.sex ? ` · ${subject.sex}` : ''}</div>}
      {onSwitch && (
        <button onClick={onSwitch} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: TEAL, fontWeight: 600, cursor: 'pointer', fontSize: '.8rem', padding: 0 }}>
          Change
        </button>
      )}
    </div>
  )
}

function PageWrap({ children }) {
  return (
    <div style={{ minHeight: '100dvh', background: BG, fontFamily: 'Plus Jakarta Sans, sans-serif', padding: '2rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '1.5rem' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'white', fontSize: '1.1rem', fontWeight: 900 }}>V</span>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: NAVY, fontSize: '1.05rem' }}>Tere Vitals Validation</div>
            <div style={{ fontSize: '.75rem', color: '#6B7280' }}>Clinical data collection</div>
          </div>
          <Link to="/vitals-validate/dashboard" style={{ marginLeft: 'auto', fontSize: '.8rem', color: TEAL, fontWeight: 600, textDecoration: 'none' }}>
            Dashboard →
          </Link>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function VitalsValidate() {
  const navigate = useNavigate()
  const [authChecked, setAuthChecked] = useState(false)

  // Auth gate — accepts either the existing PIN clinician login (sessionStorage
  // clinicianAuth + providerId, per Login.jsx) or a Supabase auth session.
  // Server-side requireProvider() honours the same two paths (x-provider-id
  // header vs Authorization bearer JWT).
  useEffect(() => {
    let cancelled = false
    const goLogin = () => navigate('/clinician?redirect=/vitals-validate', { replace: true })
    const hasClinicianSession = () => {
      try { return sessionStorage.getItem('clinicianAuth') === 'true' && !!sessionStorage.getItem('providerId') }
      catch { return false }
    }
    if (hasClinicianSession()) { setAuthChecked(true); return }
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (data?.session || hasClinicianSession()) setAuthChecked(true)
      else goLogin()
    }).catch(() => { if (!cancelled) { hasClinicianSession() ? setAuthChecked(true) : goLogin() } })
    return () => { cancelled = true }
  }, [navigate])

  const [phase, setPhase] = useState('select')

  // Subjects
  const [subjects, setSubjects]           = useState([])
  const [subjectsLoaded, setSubjectsLoaded] = useState(false)
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [selectedSubject, setSelectedSubject]     = useState(null)

  // Create form
  const [newSub, setNewSub] = useState({
    firstName: '', age: '', sex: '', heightCm: '', weightKg: '',
    fitzpatrickScale: null, hasHypertension: 'unknown',
    conditions: [],
  })
  const [savingSubject, setSavingSubject] = useState(false)
  const [subjectError, setSubjectError]   = useState(null)

  // Step 1
  const [manual, setManual] = useState({ systolic: '', diastolic: '', hr: '', temperature: '', notes: '' })

  // Step 2
  const videoRef   = useRef(null)
  const canvasRef  = useRef(null)
  const streamRef  = useRef(null)
  const measureRef = useRef(null)
  const [cameraError, setCameraError] = useState(null)
  const [scanPhase, setScanPhase]     = useState('idle')
  const [scanError, setScanError]     = useState(null)
  const [progress, setProgress]       = useState(0)
  const [liveHR, setLiveHR]           = useState(null)
  const [passNum, setPassNum]         = useState(1)
  const [motionPct, setMotionPct]     = useState(0)
  const [deviceInfo, setDeviceInfo]   = useState(null)
  const [vitals, setVitals]           = useState(null)

  // Step 3
  const [reviewNotes, setReviewNotes] = useState('')
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState(null)

  // Training
  const [trainingPhase, setTrainingPhase]   = useState('idle')
  const [trainingStatus, setTrainingStatus] = useState('')
  const [trainingResult, setTrainingResult] = useState(null)

  // BP estimation
  const [bpEstimate, setBpEstimate]   = useState(null)
  const [bpModelMeta, setBpModelMeta] = useState(() => getLocalMeta())

  // SpO2
  const [manualSpO2, setManualSpO2]   = useState('')
  const [spo2Estimate, setSpo2Estimate] = useState(null)
  const [afConfirmed, setAfConfirmed]   = useState(null) // true/false/null
  const [afConfirmedBy, setAfConfirmedBy] = useState('')

  // Ambient temperature
  const [ambientTemp, setAmbientTemp] = useState(null)

  // Load subjects + ambient temp on mount
  useEffect(() => {
    getValidationSubjectsWithLastScan()
      .then(list => { setSubjects(list); setSubjectsLoaded(true) })
      .catch(() => setSubjectsLoaded(true))
    getAmbientTemp().then(setAmbientTemp).catch(() => {})
  }, [])

  const selectedSubjectFromId = useCallback((id, list) => {
    return (list || subjects).find(s => s.id === id) || null
  }, [subjects])

  const stopCamera = useCallback(() => {
    measureRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    // Stop any existing stream before requesting a new one
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false,
      })
      streamRef.current = stream
      const v = videoRef.current
      if (v) {
        v.srcObject = stream
        // Only wait for loadedmetadata if not already loaded; use addEventListener to avoid
        // the race where metadata loads before the handler is assigned
        if (v.readyState < 1) {
          await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('Camera timed out')), 8000)
            v.addEventListener('loadedmetadata', () => { clearTimeout(t); resolve() }, { once: true })
          })
        }
        await v.play().catch(() => {})
        if (canvasRef.current) {
          canvasRef.current.width = v.videoWidth || 640
          canvasRef.current.height = v.videoHeight || 480
        }
      }
    } catch (e) {
      setCameraError('Camera error: ' + e.message)
    }
  }, [])

  useEffect(() => {
    if (phase === 'step2') { startCamera(); return stopCamera }
  }, [phase])

  const startScan = useCallback(async () => {
    setScanError(null); setScanPhase('inspecting'); setProgress(0); setLiveHR(null); setBpEstimate(null)
    try {
      await loadFaceMesh()
      const info = await inspectDevice(videoRef.current)
      setDeviceInfo(info)
      const calibration = { ...calibrateRPPG(info), captureRaw: true }
      setScanPhase('measuring')
      const m = new MultiPassMeasurement(
        (pct, hr, pass, _t, mPct) => { setProgress(pct); setLiveHR(hr); setPassNum(pass); setMotionPct(mPct || 0) },
        (result) => {
          setVitals(result); setScanPhase('done'); stopCamera(); setPhase('step3')
          if (result.rawFrames) {
            const signal = { frames: result.rawFrames, fps: result.actualFps }
            predictBP(signal, selectedSubject || {})
              .then(est => { if (est) setBpEstimate(est) })
              .catch(() => {})
            try {
              const spo2 = calculateSpO2(result.rawFrames, selectedSubject?.fitzpatrick_scale)
              if (spo2) setSpo2Estimate(spo2)
            } catch {}
          }
          setBpModelMeta(getLocalMeta())
        },
        (msg) => { setScanError(msg); setScanPhase('error'); stopCamera() },
      )
      measureRef.current = m
      m.start(videoRef.current, canvasRef.current, calibration, info.quality)
    } catch (e) {
      setScanError(e.message || 'Scan failed'); setScanPhase('error')
    }
  }, [stopCamera, selectedSubject])

  const handleCreateSubject = async () => {
    if (!newSub.firstName.trim()) { setSubjectError('First name is required'); return }
    setSavingSubject(true); setSubjectError(null)
    try {
      const conds = newSub.conditions || []
      const sub = await saveValidationSubject({
        subjectCode: genCode(), firstName: newSub.firstName.trim(),
        age: newSub.age ? parseInt(newSub.age) : null,
        sex: newSub.sex || null,
        heightCm: newSub.heightCm ? parseFloat(newSub.heightCm) : null,
        weightKg: newSub.weightKg ? parseFloat(newSub.weightKg) : null,
        fitzpatrickScale: newSub.fitzpatrickScale,
        hasHypertension: conds.includes('hypertension') ? 'high' : conds.includes('hypotension') ? 'low' : newSub.hasHypertension,
        hasDiabetes: conds.includes('diabetes') ? 'yes' : 'unknown',
        hasRegularMedications: false,
        conditions: conds.join(',') || null,
      })
      const updated = [{ ...sub, last_scan_at: null }, ...subjects]
      setSubjects(updated)
      setSelectedSubjectId(sub.id)
      setSelectedSubject(sub)
      setPhase('step1')
    } catch (e) {
      setSubjectError('Could not save: ' + e.message)
    } finally {
      setSavingSubject(false)
    }
  }

  const triggerTraining = useCallback(async (reason = 'manual_trigger') => {
    setTrainingPhase('running'); setTrainingStatus('Fetching training data…')
    localStorage.setItem('tere_last_train_ms', Date.now().toString())
    try {
      const trainable = await getTrainableReadings()
      if (trainable.length < 5) { setTrainingPhase('idle'); return }
      setTrainingStatus(`Training on ${trainable.length} readings… [${reason}]`)
      const result = await trainModel(trainable, (epoch, total, logs) => {
        const pct = Math.round((epoch + 1) / total * 100)
        setTrainingStatus(`Training… ${pct}% (loss ${logs.loss?.toFixed(3) || '?'})`)
      }, reason)
      if (result) { setTrainingResult(result); setTrainingPhase('done'); setBpModelMeta(getLocalMeta()) }
      else setTrainingPhase('idle')
    } catch (e) {
      console.warn('[VitalsValidate] training failed:', e.message)
      setTrainingPhase('error'); setTrainingStatus('Training failed: ' + e.message)
    }
  }, [])

  const smartRetrain = useCallback(async () => {
    if (trainingPhase === 'running') return
    const lastTrainMs = parseInt(localStorage.getItem('tere_last_train_ms') || '0')
    if (Date.now() - lastTrainMs < 60000) return // skip if trained < 1 min ago
    try {
      const count = await getValidationReadingCount()
      if (count < 5) return
      let reason = null
      // 1. Every 5 readings
      if (count % 5 === 0) reason = 'scheduled_5_readings'
      // 2. New subject reaches 3 readings
      if (!reason && selectedSubject?.id) {
        const subjectReadings = await getValidationReadings(selectedSubject.id)
        if (subjectReadings.length === 3) reason = 'new_subject_added'
      }
      // 3. MAE degradation — current reading error much worse than model MAE
      if (!reason && bpEstimate && manual.systolic) {
        const currentErr = Math.abs(bpEstimate.systolic - parseInt(manual.systolic))
        const modelMae = bpModelMeta?.valMae || bpModelMeta?.finalMae
        if (modelMae && currentErr > modelMae + 5) reason = 'mae_degradation'
      }
      if (reason) triggerTraining(reason)
    } catch {}
  }, [trainingPhase, selectedSubject, bpEstimate, manual, bpModelMeta, triggerTraining])

  const handleSave = async () => {
    setSaving(true); setSaveError(null)
    try {
      await saveValidationReading({
        subjectId:       selectedSubject?.id,
        subjectCode:     selectedSubject?.subject_code,
        manualSystolic:  manual.systolic  ? parseInt(manual.systolic)  : null,
        manualDiastolic: manual.diastolic ? parseInt(manual.diastolic) : null,
        manualHr:          manual.hr          ? parseInt(manual.hr)            : null,
        manualTemperature: manual.temperature ? parseFloat(manual.temperature) : null,
        ambientTemp:     ambientTemp ?? null,
        tereHr:          vitals?.hr || null,
        tereRr:          vitals?.rr || null,
        manualSpO2:      manualSpO2 ? parseInt(manualSpO2) : null,
        tereSpo2:        spo2Estimate?.estimate || null,
        rawRppgSignal:   vitals?.rawFrames
          ? { frames: vitals.rawFrames, fps: vitals.actualFps, numericConfidence: vitals.numericConfidence }
          : null,
        deviceInfo,
        notes:             reviewNotes.trim() || null,
        sessionConditions: manual.notes.trim() || null,
        hrvSdnn:    vitals?.hrv?.sdnn   || null,
        hrvRmssd:   vitals?.hrv?.rmssd  || null,
        hrvPnn50:   vitals?.hrv?.pnn50  || null,
        afScore:    vitals?.afDetection?.score        || null,
        afLikelihood: vitals?.afDetection?.likelihood || null,
        afConfirmed:    afConfirmed ?? null,
        afConfirmedBy:  afConfirmedBy || null,
      })
      setPhase('saved')
      smartRetrain()
      // Refit SpO2 calibration from all paired readings
      getValidationReadings().then(rows => {
        const pairs = rows
          .filter(r => r.tere_spo2 && r.manual_spo2)
          .map(r => ({ estimated: r.tere_spo2, reference: r.manual_spo2 }))
        if (pairs.length >= 5) fitSpO2Calibration(pairs)
      }).catch(() => {})
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const resetForScanAgain = () => {
    setManual({ systolic: '', diastolic: '', hr: '', temperature: '', notes: '' })
    setVitals(null); setDeviceInfo(null); setScanPhase('idle')
    setProgress(0); setReviewNotes(''); setSaveError(null)
    setTrainingPhase('idle'); setTrainingResult(null)
    setBpEstimate(null); setSpo2Estimate(null); setManualSpO2('')
    setAfConfirmed(null); setAfConfirmedBy('')
    setPhase('step1')
  }

  const goToSelect = () => {
    setManual({ systolic: '', diastolic: '', hr: '', temperature: '', notes: '' })
    setVitals(null); setDeviceInfo(null); setScanPhase('idle')
    setProgress(0); setReviewNotes(''); setSaveError(null)
    setTrainingPhase('idle'); setTrainingResult(null)
    setSelectedSubjectId(''); setSelectedSubject(null)
    // Refresh subjects list to update last_scan_at
    getValidationSubjectsWithLastScan()
      .then(list => setSubjects(list))
      .catch(() => {})
    setPhase('select')
  }

  // ── Select profile ────────────────────────────────────────────────────────────

  if (!authChecked) return null

  if (phase === 'select') {
    const canStart = !!selectedSubjectId

    return (
      <PageWrap>
        <Card>
          <div style={{ fontWeight: 700, fontSize: '1.15rem', color: NAVY, marginBottom: '.25rem' }}>Who are you?</div>
          <div style={{ color: '#6B7280', fontSize: '.9rem', marginBottom: '1.25rem' }}>Select your profile to start a scan.</div>

          {!subjectsLoaded ? (
            <div style={{ color: '#6B7280', textAlign: 'center', padding: '1.5rem 0' }}>Loading profiles…</div>
          ) : (
            <>
              {subjects.length > 0 ? (
                <select value={selectedSubjectId} onChange={e => {
                  const id = e.target.value
                  setSelectedSubjectId(id)
                  setSelectedSubject(id ? subjects.find(s => s.id === id) || null : null)
                }} style={{
                  width: '100%', border: '1.5px solid #E5E7EB', borderRadius: 10,
                  padding: '.75rem .9rem', fontSize: '1rem',
                  fontFamily: 'Plus Jakarta Sans, sans-serif', color: NAVY,
                  background: 'white', outline: 'none', marginBottom: '1.25rem',
                }}>
                  <option value=''>— Select profile —</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.first_name}{s.age ? `, ${s.age}` : ''} ({lastScanLabel(s.last_scan_at)})
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ color: '#6B7280', fontSize: '.9rem', marginBottom: '1.25rem' }}>
                  No profiles yet — create the first one below.
                </div>
              )}

              <Btn onClick={() => setPhase('step1')} disabled={!canStart} style={{ width: '100%', marginBottom: '1rem' }}>
                Start scan →
              </Btn>

              <button onClick={() => {
                setNewSub({ firstName: '', age: '', sex: '', heightCm: '', weightKg: '', fitzpatrickScale: null, hasHypertension: 'unknown', conditions: [] })
                setSubjectError(null)
                setPhase('create')
              }} style={{
                background: 'none', border: 'none', color: TEAL, fontWeight: 700,
                fontSize: '.9rem', cursor: 'pointer', padding: 0, fontFamily: 'Plus Jakarta Sans, sans-serif',
              }}>
                + Create new profile
              </button>
            </>
          )}
        </Card>
      </PageWrap>
    )
  }

  // ── Create profile ────────────────────────────────────────────────────────────

  if (phase === 'create') {
    return (
      <PageWrap>
        <Card>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: NAVY, marginBottom: '1.25rem' }}>Create profile</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
            <Field label="First name *" value={newSub.firstName} onChange={v => setNewSub(p => ({ ...p, firstName: v }))} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
              <Field label="Age" value={newSub.age} onChange={v => setNewSub(p => ({ ...p, age: v }))} type="number" min="1" max="120" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                <label style={{ fontSize: '.85rem', fontWeight: 600, color: NAVY }}>Height (cm)</label>
                <input type="number" value={newSub.heightCm} onChange={e => setNewSub(p => ({ ...p, heightCm: e.target.value }))}
                  style={{ border: '1.5px solid #E5E7EB', borderRadius: 10, padding: '.65rem .9rem', fontSize: '1rem', fontFamily: 'Plus Jakarta Sans, sans-serif', color: NAVY, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
              <Field label="Weight (kg)" value={newSub.weightKg} onChange={v => setNewSub(p => ({ ...p, weightKg: v }))} type="number" />
              <div />
            </div>

            <div>
              <label style={{ fontSize: '.85rem', fontWeight: 600, color: NAVY, display: 'block', marginBottom: '.5rem' }}>Sex</label>
              <Toggle
                options={[['male', 'Male'], ['female', 'Female'], ['other', 'Other']]}
                value={newSub.sex}
                onChange={v => setNewSub(p => ({ ...p, sex: v === p.sex ? '' : v }))}
              />
            </div>

            <div>
              <label style={{ fontSize: '.85rem', fontWeight: 600, color: NAVY, display: 'block', marginBottom: '.5rem' }}>Skin tone (Fitzpatrick)</label>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                {FITZPATRICK.map(f => (
                  <button key={f.scale} onClick={() => setNewSub(p => ({ ...p, fitzpatrickScale: f.scale === p.fitzpatrickScale ? null : f.scale }))}
                    title={`Type ${f.scale}`}
                    style={{ width: 40, height: 40, borderRadius: '50%', background: f.color, border: 'none', cursor: 'pointer', outline: newSub.fitzpatrickScale === f.scale ? `3px solid ${TEAL}` : '2px solid transparent', outlineOffset: 2 }}
                  />
                ))}
              </div>
              {newSub.fitzpatrickScale && <div style={{ fontSize: '.8rem', color: '#6B7280', marginTop: '.35rem' }}>Type {newSub.fitzpatrickScale} selected</div>}
            </div>

            <div>
              <label style={{ fontSize: '.85rem', fontWeight: 600, color: NAVY, display: 'block', marginBottom: '.5rem' }}>Blood pressure history</label>
              <Toggle
                options={[['high', 'High'], ['normal', 'Normal'], ['low', 'Low'], ['unknown', 'Unknown']]}
                value={newSub.hasHypertension}
                onChange={v => setNewSub(p => ({ ...p, hasHypertension: v }))}
              />
            </div>

            <div>
              <label style={{ fontSize: '.85rem', fontWeight: 600, color: NAVY, display: 'block', marginBottom: '.5rem' }}>Known conditions</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
                {[['hypertension','Hypertension'],['hypotension','Hypotension'],['diabetes','Diabetes'],['af','Atrial fibrillation'],['heart_failure','Heart failure'],['none','None']].map(([val, label]) => {
                  const checked = (newSub.conditions || []).includes(val)
                  return (
                    <button key={val} type="button"
                      onClick={() => setNewSub(p => {
                        const prev = p.conditions || []
                        if (val === 'none') return { ...p, conditions: checked ? [] : ['none'] }
                        const without = prev.filter(c => c !== val && c !== 'none')
                        return { ...p, conditions: checked ? without : [...without, val] }
                      })}
                      style={{ padding: '.4rem .85rem', borderRadius: 99, fontSize: '.82rem', fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif', cursor: 'pointer', border: `1.5px solid ${checked ? TEAL : '#E5E7EB'}`, background: checked ? TEAL + '18' : 'white', color: checked ? TEAL : '#6B7280', transition: 'all .15s' }}>
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {subjectError && <div style={{ color: '#EF4444', fontSize: '.85rem' }}>{subjectError}</div>}
            <div style={{ display: 'flex', gap: '.75rem', marginTop: '.25rem' }}>
              <Btn secondary onClick={() => setPhase('select')}>Cancel</Btn>
              <Btn onClick={handleCreateSubject} disabled={savingSubject}>{savingSubject ? 'Saving…' : 'Create profile'}</Btn>
            </div>
          </div>
        </Card>
      </PageWrap>
    )
  }

  // ── Step 1: Manual readings ───────────────────────────────────────────────────

  if (phase === 'step1') {
    const canProceed = manual.systolic && manual.diastolic && manual.hr
    return (
      <PageWrap>
        <SubjectBadge subject={selectedSubject} onSwitch={goToSelect} />
        <Card>
          <StepHeader step={1} label="Manual cuff readings" />
          {ambientTemp !== null && (
            <div style={{ marginTop: '.75rem', background: '#EFF6FF', borderRadius: 8, padding: '8px 12px', fontSize: '.8rem', color: '#1E40AF', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🌡</span>
              <span>Outdoor ambient: <strong>{ambientTemp}°C</strong> — saved automatically</span>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
              <Field label="Systolic (mmHg)" value={manual.systolic} onChange={v => setManual(p => ({ ...p, systolic: v }))} type="number" min="60" max="250" placeholder="120" />
              <Field label="Diastolic (mmHg)" value={manual.diastolic} onChange={v => setManual(p => ({ ...p, diastolic: v }))} type="number" min="40" max="150" placeholder="80" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
              <label style={{ fontSize: '.85rem', fontWeight: 700, color: NAVY }}>Heart rate * <span style={{ fontWeight: 400, color: '#EF4444' }}>(required)</span></label>
              <p style={{ fontSize: '.75rem', color: '#6B7280', margin: '2px 0 6px' }}>
                Count your pulse for 30 seconds and multiply by 2, or use a smartwatch reading.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number" min="30" max="220" value={manual.hr}
                  onChange={e => setManual(p => ({ ...p, hr: e.target.value }))}
                  placeholder="e.g. 72"
                  required
                  style={{ width: 110, padding: '8px 12px', borderRadius: 8, border: manual.hr ? '1.5px solid #D1D5DB' : '2px solid #F59E0B', fontSize: '1rem', fontFamily: 'Plus Jakarta Sans, sans-serif', outline: 'none', boxSizing: 'border-box' }}
                />
                <span style={{ fontSize: '.875rem', color: '#6B7280' }}>bpm</span>
              </div>
            </div>
            <Field label="Temperature (°C, optional)" value={manual.temperature} onChange={v => setManual(p => ({ ...p, temperature: v }))} type="number" min="34" max="42" placeholder="37.2" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', background: '#FFF7ED', border: '1.5px solid #F59E0B', borderRadius: 10, padding: '1rem' }}>
              <label style={{ fontSize: '.85rem', fontWeight: 700, color: '#92400E' }}>
                SpO2 reference <span style={{ background: '#F59E0B', color: 'white', fontSize: '.625rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, marginLeft: 4 }}>HIGH PRIORITY</span>
              </label>
              <p style={{ fontSize: '.75rem', color: '#92400E', margin: '2px 0 6px' }}>
                Do you have a pulse oximeter? SpO2 readings are the highest priority data we need right now. Even 5 paired readings will significantly improve accuracy.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number" min="70" max="100" value={manualSpO2}
                  onChange={e => setManualSpO2(e.target.value)}
                  placeholder="e.g. 98"
                  style={{ width: 100, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #F59E0B', fontSize: '1rem', fontFamily: 'Plus Jakarta Sans, sans-serif', outline: 'none', boxSizing: 'border-box' }}
                />
                <span style={{ fontSize: '.875rem', color: '#92400E' }}>%</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
              <label style={{ fontSize: '.85rem', fontWeight: 600, color: NAVY }}>Session conditions (optional)</label>
              <textarea value={manual.notes} onChange={e => setManual(p => ({ ...p, notes: e.target.value }))}
                placeholder="e.g. Morning, seated 5 min, post-exercise…" rows={2}
                style={{ border: '1.5px solid #E5E7EB', borderRadius: 10, padding: '.65rem .9rem', fontSize: '.95rem', fontFamily: 'Plus Jakarta Sans, sans-serif', color: NAVY, resize: 'vertical', outline: 'none' }}
              />
            </div>
            <Btn onClick={() => setPhase('step2')} disabled={!canProceed} style={{ width: '100%' }}>Next: Face scan →</Btn>
          </div>
        </Card>
      </PageWrap>
    )
  }

  // ── Step 2: rPPG scan ─────────────────────────────────────────────────────────

  if (phase === 'step2') {
    const isScanning = scanPhase === 'measuring' || scanPhase === 'inspecting'
    const ovalColor = motionPct > 30 ? '#EF4444' : scanPhase === 'measuring' ? TEAL : '#F59E0B'

    return (
      <PageWrap>
        <SubjectBadge subject={selectedSubject} />
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem 0' }}><StepHeader step={2} label="Face scan" /></div>
          {cameraError ? (
            <div style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ color: '#EF4444', marginBottom: '1rem', fontSize: '.9rem' }}>{cameraError}</div>
              <Btn onClick={startCamera}>Retry camera</Btn>
            </div>
          ) : (
            <div style={{ position: 'relative', background: '#000', marginTop: '1rem', aspectRatio: '4/3' }}>
              <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -58%)', width: '50%', paddingBottom: '65%', border: `3px solid ${ovalColor}`, borderRadius: '50%', pointerEvents: 'none', transition: 'border-color .4s', zIndex: 10 }} />
              {isScanning && motionPct > 20 && (
                <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: '#EF4444', color: 'white', borderRadius: 99, padding: '.35rem .85rem', fontSize: '.8rem', fontWeight: 700 }}>
                  Keep still
                </div>
              )}
              {isScanning && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '1rem', background: 'linear-gradient(transparent, rgba(0,0,0,.7))' }}>
                  <div style={{ color: 'white', fontSize: '.8rem', marginBottom: '.4rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Pass {passNum}/3</span>
                    {liveHR && <span>~{liveHR} bpm</span>}
                  </div>
                  <div style={{ background: 'rgba(255,255,255,.25)', borderRadius: 99, height: 6 }}>
                    <div style={{ background: TEAL, height: 6, borderRadius: 99, width: `${progress}%`, transition: 'width .3s' }} />
                  </div>
                </div>
              )}
            </div>
          )}
          <div style={{ padding: '1.25rem 1.5rem' }}>
            {scanPhase === 'idle' && !cameraError && <Btn onClick={startScan} style={{ width: '100%' }}>Start scan</Btn>}
            {scanPhase === 'inspecting' && <div style={{ textAlign: 'center', color: '#6B7280', fontSize: '.9rem' }}>Inspecting camera…</div>}
            {scanPhase === 'measuring' && <div style={{ textAlign: 'center', color: '#6B7280', fontSize: '.9rem' }}>Hold still…</div>}
            {scanPhase === 'error' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                <div style={{ color: '#EF4444', fontSize: '.9rem' }}>{scanError}</div>
                <Btn onClick={() => { stopCamera(); setScanPhase('idle'); setScanError(null); startCamera() }}>Retry scan</Btn>
              </div>
            )}
          </div>
        </Card>
      </PageWrap>
    )
  }

  // ── Step 3: Review + save ─────────────────────────────────────────────────────

  if (phase === 'step3') {
    const hrDiff = vitals?.hr && manual.hr ? Math.abs(vitals.hr - parseInt(manual.hr)) : null
    const hrDiffColor = hrDiff == null ? '#6B7280' : hrDiff <= 5 ? '#10B981' : hrDiff <= 10 ? '#F59E0B' : '#EF4444'
    const sysDiff = bpEstimate?.systolic && manual.systolic ? Math.abs(bpEstimate.systolic - parseInt(manual.systolic)) : null
    const diaDiff = bpEstimate?.diastolic && manual.diastolic ? Math.abs(bpEstimate.diastolic - parseInt(manual.diastolic)) : null
    const bpDiffColor = sysDiff == null ? '#6B7280' : sysDiff <= 5 ? '#10B981' : sysDiff <= 10 ? '#F59E0B' : '#EF4444'
    const modelSamples = bpModelMeta?.samples ?? 0
    const modelMae = bpModelMeta?.valMae ?? bpModelMeta?.finalMae

    return (
      <PageWrap>
        <SubjectBadge subject={selectedSubject} />
        <Card>
          <StepHeader step={3} label="Review & save" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', margin: '1.25rem 0', textAlign: 'center' }}>
            <div style={{ background: '#F0FDF4', borderRadius: 12, padding: '1rem' }}>
              <div style={{ fontSize: '.75rem', color: '#6B7280', fontWeight: 700, marginBottom: '.4rem', letterSpacing: '.05em' }}>MANUAL CUFF</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: NAVY }}>{manual.systolic}/{manual.diastolic}</div>
              <div style={{ fontSize: '.8rem', color: '#6B7280' }}>mmHg</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: NAVY, marginTop: '.5rem' }}>{manual.hr} bpm</div>
            </div>
            <div style={{ background: '#EFF6FF', borderRadius: 12, padding: '1rem' }}>
              <div style={{ fontSize: '.75rem', color: '#6B7280', fontWeight: 700, marginBottom: '.4rem', letterSpacing: '.05em' }}>TERE rPPG</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: NAVY }}>{vitals?.hr ?? '—'}</div>
              <div style={{ fontSize: '.8rem', color: '#6B7280' }}>bpm HR</div>
              {vitals?.rr && <div style={{ fontSize: '.95rem', fontWeight: 600, color: '#6B7280', marginTop: '.5rem' }}>{vitals.rr} br/min</div>}
              <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: '.3rem' }}>Conf: {vitals?.numericConfidence ?? '?'}%</div>
            </div>
          </div>
          {hrDiff != null && (
            <div style={{ textAlign: 'center', marginBottom: '1rem', padding: '.7rem', background: '#F9FAFB', borderRadius: 10 }}>
              <span style={{ fontWeight: 700, color: hrDiffColor, fontSize: '1.05rem' }}>HR difference: ±{hrDiff} bpm</span>
            </div>
          )}

          {/* BP estimate panel */}
          <div style={{ background: bpEstimate ? '#FFF7ED' : '#F9FAFB', borderRadius: 12, padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: '.75rem', color: '#6B7280', fontWeight: 700, letterSpacing: '.05em', marginBottom: '.5rem' }}>
              BP ESTIMATE {modelSamples > 0 ? `· model v${bpModelMeta?.version ?? '?'} · ${modelSamples} samples${modelMae != null ? ` · MAE ±${modelMae.toFixed(1)}` : ''}` : '· no model yet'}
            </div>
            {bpEstimate ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: NAVY }}>{bpEstimate.systolic}/{bpEstimate.diastolic}</div>
                  <div style={{ fontSize: '.8rem', color: '#6B7280' }}>mmHg (estimated)</div>
                </div>
                {sysDiff != null && (
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: bpDiffColor, fontSize: '.95rem' }}>SYS ±{sysDiff}</div>
                    {diaDiff != null && <div style={{ fontWeight: 700, color: bpDiffColor, fontSize: '.95rem' }}>DIA ±{diaDiff}</div>}
                    <div style={{ fontSize: '.75rem', color: '#9CA3AF' }}>vs cuff</div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: '.85rem', color: '#9CA3AF' }}>
                {modelSamples === 0 ? 'Train the model by collecting 5+ readings.' : 'Could not estimate — signal may be too short.'}
              </div>
            )}
          </div>

          {/* SpO2 comparison */}
          {(manualSpO2 || spo2Estimate) && (
            <div style={{ background: '#F0F9FA', borderRadius: 12, padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '.75rem', color: '#6B7280', fontWeight: 700, letterSpacing: '.05em', marginBottom: '.5rem' }}>SpO2 COMPARISON</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: '.875rem' }}>
                <div>
                  <div style={{ color: '#6B7280' }}>Manual</div>
                  <div style={{ fontWeight: 700, color: NAVY }}>{manualSpO2 ? `${manualSpO2}%` : '—'}</div>
                </div>
                <div>
                  <div style={{ color: '#6B7280' }}>Tere</div>
                  <div style={{ fontWeight: 700, color: NAVY }}>{spo2Estimate ? `~${spo2Estimate.estimate}%` : '—'}</div>
                </div>
                <div>
                  <div style={{ color: '#6B7280' }}>Error</div>
                  <div style={{ fontWeight: 700, color: (() => {
                    if (!spo2Estimate || !manualSpO2) return '#6B7280'
                    const e = Math.abs(spo2Estimate.estimate - parseInt(manualSpO2))
                    return e <= 2 ? '#065F46' : e <= 4 ? '#92400E' : '#991B1B'
                  })() }}>
                    {spo2Estimate && manualSpO2
                      ? `${spo2Estimate.estimate - parseInt(manualSpO2) >= 0 ? '+' : ''}${spo2Estimate.estimate - parseInt(manualSpO2)}%`
                      : '—'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* HRV assessment */}
          {vitals?.hrv && (
            <div style={{ background: '#F9FAFB', borderRadius: 12, padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '.75rem', color: '#6B7280', fontWeight: 700, letterSpacing: '.05em', marginBottom: '.5rem' }}>HRV ASSESSMENT</div>
              <div style={{ fontSize: '.875rem', color: NAVY, fontWeight: 600 }}>
                SDNN: {vitals.hrv.sdnn}ms | RMSSD: {vitals.hrv.rmssd}ms | pNN50: {vitals.hrv.pnn50}%
              </div>
              <div style={{ fontSize: '.8125rem', color: '#6B7280', marginTop: 4 }}>{vitals.hrv.interpretation}</div>
              {vitals.hrv.clinical_note && (
                <div style={{ fontSize: '.75rem', color: '#B45309', marginTop: 4, fontStyle: 'italic' }}>{vitals.hrv.clinical_note}</div>
              )}
            </div>
          )}

          {/* AF screening */}
          {vitals?.afDetection && (
            <>
              <div style={{ background: vitals.afDetection.possible ? '#FEF3C7' : '#F0FDF4', borderRadius: 12, padding: '1rem', marginBottom: '.5rem', border: vitals.afDetection.possible ? '1px solid #F59E0B' : 'none' }}>
                <div style={{ fontSize: '.75rem', color: '#6B7280', fontWeight: 700, letterSpacing: '.05em', marginBottom: '.5rem' }}>AF SCREENING</div>
                <div style={{ fontSize: '.875rem', fontWeight: 600, color: vitals.afDetection.possible ? '#92400E' : '#065F46' }}>
                  {vitals.afDetection.possible ? '⚠️ HRV pattern flagged — warrants attention' : '✓ Rhythm appears regular'}
                </div>
                <div style={{ fontSize: '.8125rem', color: '#6B7280', marginTop: 4 }}>
                  RMSSD: {vitals.afDetection.rmssd}ms | RR variability: {vitals.afDetection.cvRR}% | Score: {vitals.afDetection.score}
                </div>
              </div>
              {vitals.afDetection.possible && (
                <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '.875rem', marginBottom: '1rem', border: '1px solid #E5E7EB' }}>
                  <div style={{ fontSize: '.8125rem', fontWeight: 700, color: NAVY, marginBottom: '.625rem' }}>
                    AF screening flagged — was this confirmed by external check?
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.375rem', marginBottom: '.625rem' }}>
                    {[
                      { val: true,  label: 'Yes — confirmed irregular rhythm' },
                      { val: false, label: 'No — pulse felt regular / watch showed normal' },
                      { val: null,  label: 'Not checked' },
                    ].map(opt => (
                      <label key={String(opt.val)} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.875rem', cursor: 'pointer' }}>
                        <input type="radio" name="afConfirmed"
                          checked={afConfirmed === opt.val}
                          onChange={() => setAfConfirmed(opt.val)}
                          style={{ accentColor: TEAL }}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                  {afConfirmed !== null && (
                    <div>
                      <div style={{ fontSize: '.8125rem', color: '#6B7280', marginBottom: '.25rem' }}>Confirmed by (optional)</div>
                      <select value={afConfirmedBy} onChange={e => setAfConfirmedBy(e.target.value)}
                        style={{ border: '1.5px solid #E5E7EB', borderRadius: 8, padding: '.5rem .75rem', fontSize: '.875rem', fontFamily: 'Plus Jakarta Sans, sans-serif', width: '100%' }}>
                        <option value=''>— Select —</option>
                        <option value='apple_watch'>Apple Watch</option>
                        <option value='ecg'>ECG</option>
                        <option value='holter'>Holter monitor</option>
                        <option value='manual_pulse'>Manual pulse check</option>
                        <option value='clinical'>Clinical assessment</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '.85rem', fontWeight: 600, color: NAVY }}>Notes (optional)</label>
            <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)}
              placeholder="Any observations, conditions, or context…" rows={3}
              style={{ border: '1.5px solid #E5E7EB', borderRadius: 10, padding: '.65rem .9rem', fontSize: '.95rem', fontFamily: 'Plus Jakarta Sans, sans-serif', color: NAVY, resize: 'vertical', outline: 'none' }}
            />
          </div>
          {saveError && <div style={{ color: '#EF4444', fontSize: '.85rem', marginBottom: '.75rem' }}>{saveError}</div>}
          <Btn onClick={handleSave} disabled={saving} style={{ width: '100%' }}>{saving ? 'Saving…' : 'Save reading'}</Btn>
        </Card>
      </PageWrap>
    )
  }

  // ── Saved ─────────────────────────────────────────────────────────────────────

  if (phase === 'saved') {
    return (
      <PageWrap>
        <Card style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', lineHeight: 1, marginBottom: '.5rem', color: '#10B981' }}>✓</div>
          <div style={{ fontWeight: 700, fontSize: '1.15rem', color: NAVY, marginBottom: '.35rem' }}>Reading saved</div>
          <div style={{ color: '#6B7280', fontSize: '.9rem', marginBottom: '1.25rem' }}>
            {selectedSubject?.first_name} · {new Date().toLocaleTimeString()}
          </div>

          {trainingPhase === 'running' && (
            <div style={{ background: '#F0F9FF', borderRadius: 10, padding: '.85rem', marginBottom: '1rem', textAlign: 'left' }}>
              <div style={{ fontWeight: 700, fontSize: '.85rem', color: NAVY, marginBottom: '.3rem' }}>Updating BP model…</div>
              <div style={{ fontSize: '.8rem', color: '#6B7280' }}>{trainingStatus}</div>
            </div>
          )}
          {trainingPhase === 'done' && trainingResult && (
            <div style={{ background: '#F0FDF4', borderRadius: 10, padding: '.85rem', marginBottom: '1rem', textAlign: 'left' }}>
              <div style={{ fontWeight: 700, fontSize: '.85rem', color: '#065F46' }}>
                Model {trainingResult.version} ready · {trainingResult.samples} samples
                {trainingResult.finalMae != null && ` · MAE ±${trainingResult.finalMae.toFixed(1)} mmHg`}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
            <Btn onClick={resetForScanAgain} style={{ width: '100%' }}>Scan again</Btn>
            <Btn secondary onClick={goToSelect} style={{ width: '100%' }}>Switch profile</Btn>
            <Link to="/vitals-validate/dashboard" style={{ color: TEAL, fontWeight: 600, fontSize: '.9rem', textDecoration: 'none' }}>
              View dashboard →
            </Link>
          </div>
        </Card>
      </PageWrap>
    )
  }

  return null
}
