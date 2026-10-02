import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MultiPassMeasurement, inspectDevice, calibrateRPPG, processStoredFrames, calculatePTT } from '../../lib/rppg'
import { updateVitals, patientUpdateConsultation, patientGetConsultation } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'
import { calculateSpO2, formatSpO2Display } from '../../lib/spo2'
import { makeConsultUrl } from '../../lib/consultUrl'
import { useAutoT } from '../../lib/i18n'

const STATES = {
  REQUESTING: 'requesting',
  INSPECTING: 'inspecting',
  CHECKLIST:  'checklist',
  READY:      'ready',
  MEASURING:  'measuring',
  DONE:       'done',
  ERROR:      'error',
}

function QualityIndicator({ deviceInfo }) {
  const tq = useAutoT({
    lowFps: 'Low frame rate detected — results may be less accurate',
    tooDark: 'Too dark — face a window or turn on more lights',
    overexposed: 'Overexposed — avoid direct sunlight behind you',
    lowQuality: 'Camera quality is low — results may be less accurate',
    goodReady: '✓ Camera quality is good — ready to scan',
    forBest: '⚠️ For best results:',
  })
  if (!deviceInfo) return null
  const { fps, brightness, quality } = deviceInfo
  const issues = []
  if (fps < 20)         issues.push(tq.lowFps)
  if (brightness < 60)  issues.push(tq.tooDark)
  if (brightness > 200) issues.push(tq.overexposed)
  if (quality < 50)     issues.push(tq.lowQuality)

  if (issues.length === 0) {
    return (
      <div style={{ background:'#D1FAE5', borderRadius:8, padding:'10px 14px', marginBottom:12, color:'#065F46', fontSize:'0.875rem' }}>
        {tq.goodReady}
      </div>
    )
  }
  return (
    <div style={{ background:'#FEF3C7', borderRadius:8, padding:'10px 14px', marginBottom:12, color:'#92400E', fontSize:'0.875rem' }}>
      {tq.forBest}
      <ul style={{ margin:'4px 0 0 16px', padding:0 }}>
        {issues.map((issue, i) => <li key={i}>{issue}</li>)}
      </ul>
    </div>
  )
}

function ConfidenceBadge({ numericConfidence }) {
  const tc = useAutoT({
    high: '✓ High quality reading',
    mid: '⚠️ Moderate quality — reading may vary slightly',
    low: '⚠️ Low quality — consider retaking for accuracy',
  })
  if (numericConfidence == null) return null
  const high = numericConfidence >= 80
  const mid  = numericConfidence >= 60
  return (
    <div style={{
      background: high ? '#D1FAE5' : '#FEF3C7',
      color:      high ? '#065F46' : '#92400E',
      borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:'0.875rem'
    }}>
      {high ? tc.high : mid ? tc.mid : tc.low}
      <span style={{ color:'var(--muted)', marginLeft:8, fontSize:'0.8rem' }}>({numericConfidence}/100)</span>
    </div>
  )
}

export default function VitalsCapture() {
  const navigate = useNavigate()
  // On mount, ensure the latest shared BP model + SpO2 calibration are cached
  // locally so BP + SpO2 render calibrated on the summary. loadModelFromSupabase
  // verifies the IndexedDB weights match the latest model_versions row and
  // re-restores if they don't. Also compares the server trained_at against
  // the last-synced bust key and force-resets the cache if the server has
  // moved on — fixes the case where Justin's browser kept predicting 120/80
  // because a stale NORM was overriding the latest v15 (150-sample) network.
  //
  // We track modelReady so predictBP is never called on stale NORM: the
  // background-frames + live scan paths gate their BP dispatch on this
  // promise resolving before starting.
  const modelReadyRef = useRef(null)
  // Patient demographics for BP prediction. Previously the live /vitals flow
  // passed subject={} to predictBP, which made all 5 demographic features
  // in extractFeatures fall back to population defaults — identical for every
  // patient. The BP model (trained on the VV dataset where demographics vary)
  // leans heavily on those slots for its BP output, so constant demographics
  // = constant mean prediction. Threading at least the DOB-derived age lets
  // the model emit at least one varying feature per patient.
  const subjectRef = useRef({})
  useEffect(() => {
    modelReadyRef.current = import('../../lib/bpModel')
      .then(({ loadModelFromSupabase }) => loadModelFromSupabase())
      .catch(() => null)
    import('../../lib/spo2').then(({ loadSpO2CalibrationFromSupabase }) => loadSpO2CalibrationFromSupabase()).catch(() => {})

    // If the patient previously reached /waiting then came back to vitals (back
    // nav, retake, bookmark reload), the WaitingRoom mount flipped
    // in_waiting_room=true and never cleared it, so they'd keep showing in the
    // provider queue as "Vitals ready" while actually mid-rescan. Clear the
    // flag on vitals mount — if you're on the vitals page you aren't waiting.
    // Idempotent and safe on fresh consults where the flag was already false.
    const cId = (sessionStorage.getItem('consultationId') || sessionStorage.getItem('consultation_id'))
    if (cId && !cId.startsWith('demo')) {
      patientUpdateConsultation(cId, { in_waiting_room: false }).catch(() => {})
      // Fetch DOB + sex off the consult once so BP prediction gets a varying
      // demographic feature per patient. Fire-and-forget; if it hasn't
      // resolved by the time predictBP runs we just fall back to {}.
      patientGetConsultation(cId).then(c => {
        if (!c) return
        const sub = {}
        if (c.patient_dob) {
          const birth = new Date(c.patient_dob)
          if (!isNaN(birth)) {
            const diffMs = Date.now() - birth.getTime()
            const age = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000))
            if (age > 0 && age < 120) sub.age = age
          }
        }
        if (c.patient_sex) sub.sex = c.patient_sex   // 'male' | 'female' | other
        if (c.patient_weight_kg != null) sub.weight_kg = Number(c.patient_weight_kg)
        if (c.patient_height_cm != null) sub.height_cm = Number(c.patient_height_cm)
        subjectRef.current = sub
      }).catch(() => {})
    }
  }, [])
  const videoRef   = useRef(null)
  const canvasRef  = useRef(null)
  const measureRef       = useRef(null)
  const streamRef        = useRef(null)
  const qualityIntervalRef = useRef(null)

  // If background frames are already available with good skin signal, skip straight to processing
  const hasBackgroundFrames = (() => {
    try {
      const s = sessionStorage.getItem('background_rppg_frames')
      if (!s) return false
      const frames = JSON.parse(s)
      if (frames.length <= 450) return false
      // Quick skin check: R/G ratio — below 1.04 means no face was in frame
      const meanR = frames.reduce((acc, f) => acc + f.r, 0) / frames.length
      const meanG = frames.reduce((acc, f) => acc + f.g, 0) / frames.length
      return meanG > 0 && meanR / meanG >= 1.04
    } catch { return false }
  })()

  const [uiState,    setUiState]    = useState(hasBackgroundFrames ? STATES.MEASURING : STATES.REQUESTING)
  const [progress,   setProgress]   = useState(0)
  const [liveHR,     setLiveHR]     = useState(null)
  const [vitals,     setVitals]     = useState(null)
  const [error,      setError]      = useState('')
  const [manualMode, setManualMode] = useState(false)
  const [manual,     setManual]     = useState({ hr:'', rr:'', spo2:'', bp:'', temperature:'' })
  const [deviceInfo, setDeviceInfo] = useState(null)
  const [scanLabel,  setScanLabel]  = useState(null)  // null = fall back to t.startScan
  const [passNum,    setPassNum]    = useState(1)
  const [totalPasses,setTotalPasses]= useState(3)
  const [motionPct,  setMotionPct]  = useState(0)
  const [ovalColor,  setOvalColor]  = useState('#F59E0B')  // amber default
  const [bpEstimate,   setBpEstimate]   = useState(null)
  const [spo2Estimate, setSpo2Estimate] = useState(null)
  const [scanMode,     setScanMode]     = useState('face') // 'face' | 'finger'
  const [faceBox,      setFaceBox]      = useState(null)   // normalised { x,y,w,h } from FaceMesh
  const [attemptCount,   setAttemptCount]   = useState(0)     // Increments each DONE. Abnormal-retake gate uses this: first abnormal blocks Continue, second attempt lets it through so genuinely sick patients aren't looped forever.
  const [showAbnormalGate, setShowAbnormalGate] = useState(false)
  const rearStreamRef  = useRef(null)
  const faceFramesRef  = useRef(null)  // stores raw frames from face scan for PTT

  const t = useAutoT({
    // Header
    navVitals: 'Vital signs',
    homeLabel: 'Tere Health — go to home',
    // Card titles + copy
    scanTitle: 'Vital signs scan',
    scanSubtitle: 'Your camera measures your heart rate, breathing, and blood pressure. Takes about 80 seconds.',
    analysingTitle: 'Analysing your vitals…',
    analysingSubtitle: 'We captured readings during your consultation — processing now.',
    capturedTitle: 'Vitals captured',
    capturedSubtitle: 'Captured during triage — no scan needed.',
    // Prep tips
    prepLighting: 'Good lighting on your face',
    prepArmsLength: 'Hold phone at arm\'s length',
    prepStill: 'Stay still and breathe normally',
    prepGlasses: 'Remove glasses if you wear them',
    // Errors
    cameraDenied: 'Camera access denied. Please allow camera access and refresh, or use manual entry below.',
    measurementCancelled: 'Measurement cancelled.',
    fingerFailed: 'Finger scan failed. Try again or use face scan.',
    rearUnavailable: 'Rear camera unavailable',
    vitalsSaveFail: 'Vitals didn\'t save — {msg}. Try retake or continue without vitals.',
    vitalsManualFail: 'Vitals didn\'t save — {msg}. Fix and try again.',
    serverError: 'server error',
    // Overlays
    checkingCamera: 'Checking camera quality…',
    holdStill: 'Hold still',
    holdStillMeasuring: 'Hold still — measuring',
    passOf: 'Pass {n} of {total}',
    alignFace: 'Align your face with the oval',
    // Finger scan
    coverFinger: 'Cover the rear camera with your finger',
    pressGently: 'Press gently — don\'t block the flash',
    // Signal warning
    poorSignal: '⚠️ Poor signal detected',
    poorSignalBody: 'Low lighting or camera quality may affect accuracy. Try the finger scan for a more reliable reading.',
    switchFinger: '👆 Switch to finger scan',
    coverLens: 'Cover the rear camera lens with your fingertip',
    // For best results box
    forBestResults: 'For best results:',
    bestResultsBody: 'Good lighting on your face · Stay still during the scan · Remove glasses if possible',
    // Results
    analysedSecs: '✓ Analysed {n} seconds of data from triage',
    moreDataMore: 'More data = more accurate readings',
    pttMs: '✓ Pulse transit time: {n}ms',
    bpEnhanced: '· BP estimate enhanced with vascular timing',
    heartRate: 'Heart Rate',
    bpm: 'bpm',
    respRate: 'Resp. Rate',
    breathsMin: 'breaths/min',
    bloodPressure: 'Blood Pressure',
    aiEstimate: 'AI estimate',
    calibrated: 'calibrated',
    mayVary: 'may vary',
    lowConfidence: 'low confidence',
    screeningEstimate: 'screening estimate',
    passesFrames: '{passes} passes · {frames} frames · {fps} fps',
    disclaimer: 'provides indicative screening estimates only. Results are not a substitute for medical-grade devices and must be interpreted by a registered clinician.',
    cameraIssue: 'Camera issue — ',
    // Actions
    imReady: 'I\'m ready — start vital signs scan',
    startScan: 'Start scan',
    startScanWindow: 'Start {sec}-second scan (3 passes)',
    startScan80: 'Start 80-second scan (4 passes)',
    checkingCameraBtn: 'Checking camera…',
    cancelBtn: 'Cancel',
    missingReadings: 'Missing readings:',
    missingHelp: 'Please retake for a complete set — hold still and keep your face well-lit. Or enter the numbers manually if you have a home device.',
    continueBtn: 'Continue to consultation',
    retakeScan: '🔄 Retake scan',
    retakeBetter: 'Retake for better accuracy',
    enterManual: 'Enter vitals manually instead',
    backIntake: '← Back to intake form',
    havePulseOx: 'Have a pulse oximeter or BP cuff? Enter your own readings',
    // Manual entry
    manualTitle: 'Enter vital signs manually',
    manualIntro: 'If you have a pulse oximeter or blood pressure cuff, enter your readings here. All fields are optional.',
    hrLabel: 'Heart Rate',
    hrUnit: '(bpm)',
    hrPh: 'e.g. 80',
    rrLabel: 'Resp. Rate',
    rrUnit: '(breaths/min)',
    rrPh: 'e.g. 16',
    spo2Label: 'SpO₂',
    spo2Unit: '(%)',
    spo2Ph: 'e.g. 98',
    bpLabel: 'Blood Pressure',
    bpPh: 'e.g. 120/80',
    tempLabel: 'Temperature',
    tempUnit: '(°C)',
    tempPh: 'e.g. 37.2',
    backBtn: 'Back',
    continueReadings: 'Continue with these readings',
    // Bottom bar
    emergency: 'Emergency? Call',
    mentalHealth: 'Mental health crisis? Call or text',
    // Abnormal dialog
    tryOnceMore: 'Let\'s try that once more',
    outsideRangeBody: 'looks outside the usual range. This is often a measurement error — small movements or lighting can throw the reading off. A second scan helps your provider see the real trend.',
    yourValue: 'Your',
    manualHint: 'If you already know your readings from a pulse oximeter or BP cuff, you can enter them instead.',
    retakeBtn: 'Retake scan',
    gotOwnReadings: 'I\'ve got my own readings',
  })

  // Request camera → inspect → checklist (or use background frames if available)
  useEffect(() => {
    // `unmounted` races against the async getUserMedia resolution. Previously,
    // if the user navigated to /waiting before the camera prompt resolved,
    // cleanup fired with streamRef.current still null → when the stream later
    // resolved it was assigned to streamRef with nothing left to stop it →
    // camera stayed on in the waiting room. Checking this flag inside the
    // async closure lets us stop a stream that resolved post-unmount.
    let unmounted = false
    async function requestCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode:'user', width:640, height:480, frameRate:30 },
          audio: false,
        })
        if (unmounted) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setUiState(STATES.INSPECTING)

        try {
          const info = await inspectDevice(videoRef.current)
          setDeviceInfo(info)
          const cal = calibrateRPPG(info)
          setScanLabel(t.startScanWindow.replace('{sec}', String(cal.windowSec)))
        } catch {
          setScanLabel(t.startScan80)
        }
        setUiState(STATES.CHECKLIST)

        // Re-check quality every 3s so lighting warnings update live
        const qualityInterval = setInterval(async () => {
          if (!videoRef.current) return
          try {
            const info = await inspectDevice(videoRef.current)
            setDeviceInfo(info)
          } catch {}
        }, 3000)
        qualityIntervalRef.current = qualityInterval
      } catch {
        setError(t.cameraDenied)
        setUiState(STATES.ERROR)
      }
    }

    // Check for background frames collected during triage
    const storedFrames = sessionStorage.getItem('background_rppg_frames')
    const storedFPS    = parseFloat(sessionStorage.getItem('background_rppg_fps') || '15')
    if (storedFrames) {
      try {
        const frames = JSON.parse(storedFrames)
        if (frames.length > 450) { // at least 30 seconds at 15fps
          sessionStorage.removeItem('background_rppg_frames')
          sessionStorage.removeItem('background_rppg_fps')
          setTimeout(async () => {
            const result = processStoredFrames(frames, storedFPS)
            if (result && !result.faceWarning) {
              setVitals(result); setUiState(STATES.DONE)
              const id = (sessionStorage.getItem('consultationId') || sessionStorage.getItem('consultation_id'))

              // Compute SpO2 + BP synchronously so both land in the SAME
              // updateVitals PATCH as HR/RR. Previously BP was fire-and-forget
              // and often lost to navigation. Live-camera path uses the same
              // await-race-with-timeout pattern; keep them in sync.
              let spo2Result = null
              if (result.rawFrames?.length) {
                try { spo2Result = calculateSpO2(result.rawFrames); if (spo2Result) setSpo2Estimate(spo2Result) } catch {}
              }

              let bpString = null
              if (result.rawFrames?.length) {
                try {
                  const bp = await Promise.race([
                    (async () => {
                      await Promise.resolve(modelReadyRef.current)
                      const { predictBP } = await import('../../lib/bpModel')
                      return predictBP({ frames: result.rawFrames, fps: result.actualFps }, subjectRef.current || {})
                    })(),
                    new Promise(resolve => setTimeout(() => resolve(null), 8000)),
                  ])
                  if (bp) {
                    setBpEstimate(bp)
                    bpString = bp.systolic && bp.diastolic
                      ? `${bp.systolic}/${bp.diastolic}`
                      : (bp.value || null)
                  }
                } catch (e) {
                  console.warn('[vitals] BP prediction failed (bg-frames path):', e?.message || e)
                }
              }

              const payload = { ...result, spo2: spo2Result?.estimate || null, bp: bpString }
              if (id && !id.startsWith('demo')) {
                import('../../lib/supabase').then(({ updateVitals }) =>
                  updateVitals(id, payload)
                ).catch(() => {})
                import('../../lib/api').then(({ apiFetch }) =>
                  apiFetch('/api/push-notify', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type:'vitals_ready', consultationId:id }) }).catch(() => {})
                ).catch(() => {})
              } else {
                sessionStorage.setItem('vitals', JSON.stringify(payload))
              }

              console.log(`Using background frames: ${frames.length} (${result.backgroundDurationSec}s)`)
              return
            }
            // Background processing failed — fall back to live camera scan
            requestCamera()
          }, 100)
          return
        }
      } catch {}
    }

    requestCamera()
    return () => {
      unmounted = true
      // Stop every stream VitalsCapture may have opened. rearStreamRef is set
      // by startFingerScan() and was previously only stopped on scan-complete;
      // a mid-scan unmount leaked the rear camera into whatever page the user
      // landed on next. Explicit null-after-stop so we don't double-stop
      // tracks that are already ended.
      try { streamRef.current?.getTracks().forEach(t => t.stop()) } catch {}
      try { rearStreamRef.current?.getTracks().forEach(t => t.stop()) } catch {}
      streamRef.current = null
      rearStreamRef.current = null
      measureRef.current?.stop()
      clearInterval(qualityIntervalRef.current)
    }
  }, [])

  async function startMeasurement() {
    clearInterval(qualityIntervalRef.current)
    setUiState(STATES.MEASURING)
    setProgress(0)
    setLiveHR(null)
    setOvalColor('#0B6E76')

    const calibration = deviceInfo ? { ...calibrateRPPG(deviceInfo), captureRaw: true } : { captureRaw: true }
    const quality     = deviceInfo?.quality ?? 100

    measureRef.current = new MultiPassMeasurement(
      (pct, rawHR, pass, passes, mPct) => {
        setProgress(pct)
        if (rawHR) setLiveHR(rawHR)
        setPassNum(pass)
        setTotalPasses(passes)
        setMotionPct(mPct)
        // Turn oval red briefly on motion, back to green otherwise
        setOvalColor(mPct > 30 ? '#EF4444' : '#0B6E76')
      },
      async (result) => {
        setVitals(result)
        setUiState(STATES.DONE)
        // Store face frames so finger scan can compute PTT
        if (result.rawFrames?.length) faceFramesRef.current = result.rawFrames

        // SpO2: compute synchronously so it lands in the single save below.
        let spo2Result = null
        if (result.rawFrames?.length) {
          try { spo2Result = calculateSpO2(result.rawFrames) } catch {}
          if (spo2Result) setSpo2Estimate(spo2Result)
        }

        // BP: await the model instead of firing-and-forgetting. Previously
        // this raced navigation — patient would leave /vitals before the
        // async .then() resolved, so the BP PATCH never made it. Verified
        // 2026-09-30 consult ab43681c saved HR+RR but no bp/spo2. Timeout
        // caps the wait so a stuck model doesn't strand the patient.
        let bpString = null
        if (result.rawFrames?.length) {
          try {
            const bp = await Promise.race([
              (async () => {
                await Promise.resolve(modelReadyRef.current)
                const { predictBP } = await import('../../lib/bpModel')
                return predictBP({ frames: result.rawFrames, fps: result.actualFps }, subjectRef.current || {})
              })(),
              new Promise(resolve => setTimeout(() => resolve(null), 8000)),
            ])
            if (bp) {
              setBpEstimate(bp)
              bpString = bp.systolic && bp.diastolic
                ? `${bp.systolic}/${bp.diastolic}`
                : (bp.value || null)
            }
          } catch (e) {
            console.warn('[vitals] BP prediction failed:', e?.message || e)
          }
        }

        const id = (sessionStorage.getItem('consultationId') || sessionStorage.getItem('consultation_id'))
        const payload = { ...result, spo2: spo2Result?.estimate || null, bp: bpString }
        if (id && !id.startsWith('demo')) {
          try {
            await updateVitals(id, payload)
            apiFetch('/api/push-notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type:'vitals_ready', consultationId:id }),
            }).catch(() => {})
          } catch (e) {
            // Bug hunt (task #526): vitals were silently dropped when the
            // PATCH failed (typically a stale patient_access_token from an
            // earlier consult attempt in the same tab, returning 403). Log
            // and surface a warning so the patient knows to retry rather
            // than presenting an empty vitals row to the provider queue.
            console.error('[vitals] save failed:', e?.message || e, { consultationId: id })
            setError(t.vitalsSaveFail.replace('{msg}', e?.message || t.serverError))
          }
        } else {
          sessionStorage.setItem('vitals', JSON.stringify(payload))
        }
        streamRef.current?.getTracks().forEach(t => t.stop())
      },
      (msg) => {
        setError(msg)
        setUiState(STATES.ERROR)
      },
      (box) => setFaceBox(box)
    )

    await measureRef.current.start(videoRef.current, canvasRef.current, calibration, quality)
  }

  async function retake() {
    setVitals(null)
    setProgress(0)
    setLiveHR(null)
    setFaceBox(null)
    setError('')
    setShowAbnormalGate(false)
    // Re-open camera if closed
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode:'user', width:640, height:480, frameRate:30 },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch {}
    setUiState(STATES.READY)
    setOvalColor('#F59E0B')
  }

  async function startFingerScan() {
    setScanMode('finger')
    setUiState(STATES.MEASURING); setProgress(0); setLiveHR(null); setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width:{ ideal:320 }, height:{ ideal:240 }, frameRate:{ ideal:30 } },
        audio: false,
      })
      rearStreamRef.current = stream
      const video = document.createElement('video')
      video.srcObject = stream; video.autoplay = true; video.playsInline = true; video.muted = true
      video.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0'
      document.body.appendChild(video)
      await new Promise(r => { video.onloadedmetadata = r })

      const frames = []; const startMs = Date.now(); const durationMs = 30000
      await new Promise(resolve => {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 320; canvas.height = video.videoHeight || 240
        const ctx = canvas.getContext('2d')
        const capture = () => {
          const elapsed = Date.now() - startMs
          setProgress(Math.min(100, Math.round(elapsed / durationMs * 100)))
          if (elapsed >= durationMs) { resolve(); return }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data
          let r = 0, g = 0, b = 0, cnt = 0
          for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i+1]; b += d[i+2]; cnt++ }
          if (cnt) frames.push({ r: r/cnt, g: g/cnt, b: b/cnt, t: elapsed })
          requestAnimationFrame(capture)
        }
        requestAnimationFrame(capture)
      })
      stream.getTracks().forEach(t => t.stop()); video.remove()

      const result = processStoredFrames(frames, 30)
      if (result) {
        // Compute PTT if we have face frames from a prior scan
        let pttResult = null
        if (faceFramesRef.current?.length) {
          try { pttResult = calculatePTT(faceFramesRef.current, frames, 30) } catch {}
        }
        const finalResult = { ...result, source: 'finger_ppg', ptt: pttResult || undefined }
        setVitals(finalResult); setUiState(STATES.DONE); setScanMode('face')
        const id = (sessionStorage.getItem('consultationId') || sessionStorage.getItem('consultation_id'))
        if (id && !id.startsWith('demo')) {
          const { updateVitals } = await import('../../lib/supabase')
          await updateVitals(id, finalResult)
        } else { sessionStorage.setItem('vitals', JSON.stringify(finalResult)) }
      } else {
        setError(t.fingerFailed); setUiState(STATES.ERROR); setScanMode('face')
      }
    } catch (e) {
      setError(t.rearUnavailable + ': ' + e.message); setUiState(STATES.ERROR); setScanMode('face')
    }
  }

  async function saveManual() {
    const result = {
      hr:          manual.hr          ? parseInt(manual.hr)          : null,
      rr:          manual.rr          ? parseInt(manual.rr)          : null,
      spo2:        manual.spo2        ? parseInt(manual.spo2)        : null,
      bp:          manual.bp          || null,
      temperature: manual.temperature ? parseFloat(manual.temperature) : null,
      source: 'manual',
      note: 'Manually entered by patient',
    }
    const cId = (sessionStorage.getItem('consultationId') || sessionStorage.getItem('consultation_id'))
    if (cId && !cId.startsWith('demo')) {
      try {
        await updateVitals(cId, result)
        apiFetch('/api/push-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type:'vitals_ready', consultationId:cId }),
        }).catch(() => {})
      } catch (e) {
        console.error('[vitals] manual save failed:', e?.message || e, { consultationId: cId })
        setError(t.vitalsManualFail.replace('{msg}', e?.message || t.serverError))
        return
      }
    } else {
      sessionStorage.setItem('vitals', JSON.stringify(result))
    }
    navigate(makeConsultUrl('/waiting', (sessionStorage.getItem('consultationId') || sessionStorage.getItem('consultation_id')) || sessionStorage.getItem('consultation_id') || 'demo'))
  }

  async function skip(reason = 'user_declined') {
    try {
      const cId = (sessionStorage.getItem('consultationId') || sessionStorage.getItem('consultation_id'))
      if (cId && !cId.startsWith('demo')) {
        await patientUpdateConsultation(cId, {
          status: 'vitals_complete',
          vitals: { skipped: true, skip_reason: reason, skipped_at: new Date().toISOString() },
          vitals_at: new Date().toISOString(),
        })
      } else {
        sessionStorage.setItem('vitals', JSON.stringify({ skipped: true, skip_reason: reason }))
      }
    } catch {}
    navigate(makeConsultUrl('/waiting', (sessionStorage.getItem('consultationId') || sessionStorage.getItem('consultation_id')) || sessionStorage.getItem('consultation_id') || 'demo'))
  }

  // Patient refuses vitals capture entirely. Documents the refusal on
  // the consult (vitals.skipped=true, skip_reason='patient_refused') so
  // the provider chart shows "Patient declined vitals" instead of an
  // empty vitals panel. See EncounterActionBar / ClinicianPatient render.
  function skipRefused() {
    if (!window.confirm("Skip vitals for this consultation? The provider will see 'Patient declined vitals' on the chart.")) return
    skip('patient_refused')
  }

  const hrStatus = vitals?.hr ? (vitals.hr < 60 || vitals.hr > 100 ? 'warning' : 'normal') : 'normal'
  const rrStatus = vitals?.rr ? (vitals.rr < 12 || vitals.rr > 20 ? 'warning' : 'normal') : 'normal'

  // Any-vital-abnormal detector. Bands intentionally err on the wider
  // side of typical adult reference ranges — we only want to flag things
  // a provider would care to double-check, not every borderline reading.
  //   HR:    < 60 or > 100  (bradycardia / tachycardia)
  //   RR:    < 12 or > 20   (bradypnoea / tachypnoea)
  //   SpO2:  < 95            (hypoxia)
  //   Temp:  < 35.5 or > 37.8 (hypo/fever)
  //   BP:    sys < 90 or > 160 (hypo/severe hypertension)
  function detectAbnormal(v) {
    if (!v || v.skipped) return { abnormal: false, reasons: [] }
    const reasons = []
    if (v.hr   != null && (v.hr < 60 || v.hr > 100))          reasons.push(`heart rate ${v.hr} bpm`)
    if (v.rr   != null && (v.rr < 12 || v.rr > 20))           reasons.push(`respiratory rate ${v.rr}`)
    if (v.spo2 != null && v.spo2 > 0 && v.spo2 < 95)          reasons.push(`SpO₂ ${v.spo2}%`)
    if (v.temperature != null && (v.temperature < 35.5 || v.temperature > 37.8)) reasons.push(`temperature ${v.temperature}°C`)
    if (typeof v.bp === 'string' && /^\d+\/\d+$/.test(v.bp)) {
      const sys = parseInt(v.bp.split('/')[0], 10)
      if (sys && (sys < 90 || sys > 160)) reasons.push(`blood pressure ${v.bp}`)
    }
    return { abnormal: reasons.length > 0, reasons }
  }
  const abnormalCheck = detectAbnormal(vitals)

  // Completeness gate — Patrick's rule: if any of HR/RR/SpO₂/BP is missing
  // the patient must retake (or manually enter) before continuing. Provider
  // shouldn't be handed a chart with half the vitals empty. Second attempt
  // still allows Continue-anyway so the flow doesn't lock out patients whose
  // devices genuinely can't capture everything.
  const spo2Display = formatSpO2Display(spo2Estimate)
  const missingVitals = []
  if (uiState === STATES.DONE && vitals && !vitals.skipped) {
    if (vitals.hr == null || vitals.hr <= 0) missingVitals.push(t.heartRate)
    if (vitals.rr == null || vitals.rr <= 0) missingVitals.push(t.respRate)
    if (!spo2Display?.show) missingVitals.push('SpO₂')
    if (!bpEstimate || !bpEstimate.systolic || !bpEstimate.diastolic) missingVitals.push(t.bloodPressure)
  }
  // One attempt is enough — workers on boats, in poor light, or with any
  // movement will always have partial readings. Provider will re-take
  // manually during the call if a specific value is needed. Any completed
  // capture (attemptCount >= 1) unlocks Continue regardless of missing.
  const canContinue = missingVitals.length === 0 || attemptCount >= 1

  // On each transition into DONE with a fresh reading, bump the attempt
  // counter and — if this was the FIRST attempt and readings are
  // abnormal — open the retake gate. Second attempt lets Continue
  // through regardless (see rationale on state decl above).
  //
  // countedRef guards against double-firing (StrictMode dev, or any
  // future refactor that changes deps) by keying on the vitals object
  // identity — we only count a given `vitals` reference once.
  const countedRef = useRef(null)
  useEffect(() => {
    if (uiState !== STATES.DONE || !vitals || vitals.skipped) return
    if (countedRef.current === vitals) return
    countedRef.current = vitals
    const nextCount = attemptCount + 1
    setAttemptCount(nextCount)
    if (nextCount === 1 && abnormalCheck.abnormal) setShowAbnormalGate(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiState, vitals])

  const isInspecting = uiState === STATES.INSPECTING
  const isMeasuring  = uiState === STATES.MEASURING

  // Face oval — tracks detected face when FaceMesh is running, otherwise static centre guide
  const OVAL_STYLE = faceBox ? {
    position:'absolute',
    left:`${Math.round(faceBox.x * 100)}%`,
    top:`${Math.round(faceBox.y * 100)}%`,
    width:`${Math.round(faceBox.w * 100)}%`,
    paddingBottom:`${Math.round(faceBox.h * 100)}%`,
    transform:'none',
    border:`3px solid ${ovalColor}`,
    borderRadius:'50%',
    pointerEvents:'none',
    transition:'left .2s,top .2s,width .2s,padding-bottom .2s,border-color .4s',
    zIndex:10,
  } : {
    position:'absolute', top:'50%', left:'50%',
    transform:'translate(-50%, -60%)',
    width:'55%', paddingBottom:'70%',
    border:`3px solid ${ovalColor}`,
    borderRadius:'50%',
    pointerEvents:'none',
    transition:'border-color .4s',
    zIndex:10,
  }

  return (
    <div className="page">
      <nav className="navbar">
        <span className="navbar-brand" onClick={() => navigate('/')} style={{cursor:'pointer',userSelect:'none',transition:'opacity .15s'}} onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'} role="link" aria-label={t.homeLabel}>Tere</span>
        <span style={{color:'rgba(255,255,255,.5)',fontSize:'.875rem'}}>{t.navVitals}</span>
      </nav>

      <div className="container" style={{paddingTop:'1.75rem',paddingBottom:'5rem'}}>

        {!manualMode ? (
          <div className="card">
            <h2 style={{marginBottom:'.375rem'}}>
              {hasBackgroundFrames
                ? (uiState === STATES.DONE ? t.capturedTitle : t.analysingTitle)
                : t.scanTitle}
            </h2>
            <p style={{marginBottom:'1.25rem',fontSize:'.9375rem',color:'var(--muted)'}}>
              {hasBackgroundFrames
                ? (uiState === STATES.DONE ? t.capturedSubtitle : t.analysingSubtitle)
                : t.scanSubtitle}
            </p>

            {/* Camera preview — hidden when processing background frames */}
            <div style={{position:'relative',borderRadius:'var(--radius-sm)',overflow:'hidden',background:'#0D1117',marginBottom:'1.25rem',aspectRatio:'4/3',maxHeight:'280px',display: hasBackgroundFrames ? 'none' : undefined}}>
              {/* Face-tracking zoom wrapper — matches VitalsValidate step 2 */}
              {(() => {
                let videoTransform = { transform: 'none', transformOrigin: 'center', transition: 'transform .4s ease-out' }
                if (faceBox && faceBox.w > 0.05 && faceBox.h > 0.05) {
                  const cx = Math.max(0.25, Math.min(0.75, faceBox.x + faceBox.w / 2))
                  const cy = Math.max(0.25, Math.min(0.75, faceBox.y + faceBox.h / 2))
                  const scale = Math.min(2.2, Math.max(1, 0.55 / faceBox.h))
                  videoTransform = {
                    transformOrigin: `${cx * 100}% ${cy * 100}%`,
                    transform: `translate(${(0.5 - cx) * 100}%, ${(0.5 - cy) * 100}%) scale(${scale})`,
                    transition: 'transform .4s ease-out',
                  }
                }
                return (
                  <div style={{position:'absolute',inset:0,...videoTransform}}>
                    <video ref={videoRef} style={{width:'100%',height:'100%',objectFit:'cover'}} muted playsInline />
                    {uiState !== STATES.DONE && uiState !== STATES.ERROR && <div style={OVAL_STYLE} />}
                  </div>
                )
              })()}
              <canvas ref={canvasRef} width={640} height={480} style={{display:'none'}} />

              {/* Inspecting overlay */}
              {isInspecting && (
                <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,.45)',zIndex:5}}>
                  <div style={{color:'white',fontSize:'.875rem',textAlign:'center'}}>
                    <div style={{marginBottom:6,fontSize:'1.25rem'}}>🔍</div>
                    {t.checkingCamera}
                  </div>
                </div>
              )}

              {/* Measuring overlay */}
              {isMeasuring && (
                <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,.35)',zIndex:5}}>
                  <svg width="100" height="100" style={{marginBottom:'12px'}}>
                    <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="6" />
                    <circle cx="50" cy="50" r="44" fill="none" stroke="#0B6E76" strokeWidth="6"
                      strokeDasharray={`${2*Math.PI*44}`}
                      strokeDashoffset={`${2*Math.PI*44 * (1 - progress/100)}`}
                      strokeLinecap="round"
                      style={{transform:'rotate(-90deg)',transformOrigin:'50px 50px',transition:'stroke-dashoffset .5s'}} />
                    <text x="50" y="50" textAnchor="middle" dominantBaseline="central"
                      style={{fill:'white',fontSize:'18px',fontWeight:'700',fontFamily:'Plus Jakarta Sans'}}>
                      {progress}%
                    </text>
                  </svg>

                  {/* Pass indicator */}
                  <div style={{color:'white',fontSize:'.8125rem',marginBottom:8,opacity:.85}}>
                    {t.passOf.replace('{n}', String(passNum)).replace('{total}', String(totalPasses))}
                  </div>

                  {/* Motion indicator */}
                  <div style={{display:'flex',alignItems:'center',gap:6,fontSize:'.8125rem',color:'white',opacity:.85}}>
                    <div style={{
                      width:10, height:10, borderRadius:'50%',
                      background: motionPct > 30 ? '#EF4444' : '#10B981',
                      transition:'background .3s'
                    }} />
                    {motionPct > 30 ? t.holdStill : t.holdStillMeasuring}
                  </div>
                </div>
              )}

              {/* Ready — alignment hint */}
              {(uiState === STATES.READY || uiState === STATES.CHECKLIST) && (
                <div style={{position:'absolute',bottom:'10px',left:0,right:0,textAlign:'center',zIndex:11}}>
                  <div style={{background:'rgba(0,0,0,.55)',color:'white',fontSize:'.8125rem',padding:'4px 12px',borderRadius:'99px',display:'inline-block',backdropFilter:'blur(4px)'}}>
                    {t.alignFace}
                  </div>
                </div>
              )}
            </div>

            {/* Finger scan overlay */}
            {scanMode === 'finger' && isMeasuring && (
              <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,.85)',zIndex:5,gap:12}}>
                <div style={{fontSize:'3.5rem'}}>👆</div>
                <div style={{color:'white',fontWeight:700,fontSize:'1rem'}}>{t.coverFinger}</div>
                <div style={{color:'rgba(255,255,255,.7)',fontSize:'.8125rem'}}>{t.pressGently}</div>
                <svg width="80" height="80" style={{marginTop:8}}>
                  <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="5"/>
                  <circle cx="40" cy="40" r="34" fill="none" stroke="#0B6E76" strokeWidth="5"
                    strokeDasharray={`${2*Math.PI*34}`} strokeDashoffset={`${2*Math.PI*34*(1-progress/100)}`}
                    strokeLinecap="round" style={{transform:'rotate(-90deg)',transformOrigin:'40px 40px',transition:'stroke-dashoffset .5s'}}/>
                  <text x="40" y="40" textAnchor="middle" dominantBaseline="central" style={{fill:'white',fontSize:'15px',fontWeight:'700',fontFamily:'Plus Jakarta Sans'}}>
                    {progress}%
                  </text>
                </svg>
              </div>
            )}

            {/* Pre-scan tips */}
            {uiState === STATES.CHECKLIST && (
              <div style={{marginBottom:'1.25rem'}}>
                <QualityIndicator deviceInfo={deviceInfo} />
                {deviceInfo && deviceInfo.quality < 30 && (
                  <div style={{background:'#FEF3C7',border:'1px solid #F59E0B',borderRadius:12,padding:16,marginBottom:12}}>
                    <div style={{fontWeight:700,color:'#92400E',marginBottom:6}}>{t.poorSignal}</div>
                    <p style={{fontSize:'.875rem',color:'#92400E',margin:'0 0 12px'}}>
                      {t.poorSignalBody}
                    </p>
                    <button onClick={startFingerScan} style={{width:'100%',padding:12,background:'#F59E0B',color:'white',borderRadius:8,border:'none',fontWeight:700,cursor:'pointer',fontSize:'.9375rem'}}>
                      {t.switchFinger}
                    </button>
                    <p style={{fontSize:'.75rem',color:'#92400E',margin:'8px 0 0',textAlign:'center'}}>
                      {t.coverLens}
                    </p>
                  </div>
                )}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.5rem'}}>
                  {[
                    { icon: '💡', text: t.prepLighting },
                    { icon: '📱', text: t.prepArmsLength },
                    { icon: '🧘', text: t.prepStill },
                    { icon: '👓', text: t.prepGlasses },
                  ].map(({ icon, text }) => (
                    <div key={text} style={{background:'var(--bg)',borderRadius:10,padding:'.75rem',display:'flex',alignItems:'center',gap:'.625rem',fontSize:'.875rem',color:'var(--text)'}}>
                      <span style={{fontSize:'1.25rem',flexShrink:0}}>{icon}</span>
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quality indicator on READY */}
            {uiState === STATES.READY && <QualityIndicator deviceInfo={deviceInfo} />}

            {/* Instructions */}
            {(uiState === STATES.REQUESTING || isInspecting) && (
              <div style={{background:'var(--bg)',borderRadius:'var(--radius-sm)',padding:'1rem',marginBottom:'1.25rem'}}>
                <div style={{fontSize:'.875rem',color:'var(--muted)',lineHeight:1.6}}>
                  <strong style={{color:'var(--text)',display:'block',marginBottom:'.375rem'}}>{t.forBestResults}</strong>
                  {t.bestResultsBody}
                </div>
              </div>
            )}

            {/* Done — results */}
            {uiState === STATES.DONE && vitals && (
              <>
                {vitals.backgroundDurationSec && (
                  <div style={{ background:'#EFF6FF', borderRadius:8, padding:'10px 14px', marginBottom:12, color:'#1E40AF', fontSize:'.875rem' }}>
                    {t.analysedSecs.replace('{n}', String(vitals.backgroundDurationSec))}
                    <div style={{ fontSize:'.8125rem', color:'#3B82F6', marginTop:2 }}>{t.moreDataMore}</div>
                  </div>
                )}
                {vitals.ptt && vitals.ptt.pttMs > 0 && (
                  <div style={{ background:'#F0FDF4', borderRadius:8, padding:'10px 14px', marginBottom:12, color:'#15803D', fontSize:'.875rem' }}>
                    {t.pttMs.replace('{n}', String(vitals.ptt.pttMs))}
                    {vitals.ptt.systolicEstimate && <span style={{ marginLeft:8, color:'#166534' }}>{t.bpEnhanced}</span>}
                  </div>
                )}
                <ConfidenceBadge numericConfidence={vitals.numericConfidence} />
                <div className="vitals-grid" style={{marginBottom:'1.25rem'}}>
                  <div className={`vital-card ${hrStatus}`}>
                    <div className="vital-label">{t.heartRate}</div>
                    <div className={`vital-value ${hrStatus}`}>{vitals.hr ?? '—'}</div>
                    <div className="vital-unit">{t.bpm}</div>
                  </div>
                  <div className={`vital-card ${rrStatus}`}>
                    <div className="vital-label">{t.respRate}</div>
                    <div className={`vital-value ${rrStatus}`}>{vitals.rr ?? '—'}</div>
                    <div className="vital-unit">{t.breathsMin}</div>
                  </div>
                  {bpEstimate && (
                    <div className="vital-card" style={{gridColumn:'1 / -1'}}>
                      <div className="vital-label">{t.bloodPressure}{bpEstimate.confidence === 'medium' ? ' ⚠️' : ''}</div>
                      <div className="vital-value" style={{ color: bpEstimate.confidence === 'low' ? '#F59E0B' : undefined }}>
                        {bpEstimate.systolic}/{bpEstimate.diastolic}
                      </div>
                      <div className="vital-unit">
                        mmHg · {t.aiEstimate}{bpEstimate.calibrated ? ` (${t.calibrated})` : ''}{bpEstimate.confidence === 'medium' ? ` · ${t.mayVary}` : bpEstimate.confidence === 'low' ? ` · ${t.lowConfidence}` : ''}
                      </div>
                    </div>
                  )}
                  {/* SpO2 — show whatever the algorithm returned. Same value
                      gets saved and shown to the provider. Provider judges
                      plausibility; no client-side hide. */}
                  {spo2Estimate?.estimate && (
                    <div className="vital-card">
                      <div className="vital-label">SpO₂</div>
                      <div className="vital-value">{spo2Estimate.estimate}</div>
                      <div className="vital-unit">% · {t.screeningEstimate}</div>
                    </div>
                  )}
                </div>
                {vitals.passes && (
                  <div style={{fontSize:'.8125rem',color:'var(--muted)',marginBottom:'.75rem',textAlign:'center'}}>
                    {t.passesFrames.replace('{passes}', String(vitals.passes)).replace('{frames}', String(vitals.frames)).replace('{fps}', String(vitals.actualFps))}
                  </div>
                )}
                <div style={{fontSize:'.8125rem',color:'var(--muted)',marginBottom:'1.25rem',background:'#FEF3C7',border:'1px solid #FDE68A',borderRadius:8,padding:'.625rem .875rem'}}>
                  <strong>Tere Vitals</strong> {t.disclaimer}
                </div>
              </>
            )}

            {/* Error */}
            {uiState === STATES.ERROR && error && (
              <div className="alert alert-warning" style={{marginBottom:'1.25rem'}}>
                <strong>{t.cameraIssue}</strong>{error}
              </div>
            )}

            {/* Actions */}
            <div style={{display:'flex',flexDirection:'column',gap:'.75rem'}}>

              {uiState === STATES.CHECKLIST && (
                <button
                  className="btn btn-primary btn-full"
                  onClick={startMeasurement}
                >
                  {t.imReady}
                </button>
              )}

              {uiState === STATES.READY && (
                <button className="btn btn-primary btn-full" onClick={startMeasurement}>
                  {scanLabel || t.startScan}
                </button>
              )}

              {isInspecting && (
                <button className="btn btn-primary btn-full" disabled style={{opacity:.5}}>
                  {t.checkingCameraBtn}
                </button>
              )}

              {isMeasuring && (
                <button className="btn btn-secondary btn-full" onClick={() => { measureRef.current?.stop(); setUiState(STATES.ERROR); setError(t.measurementCancelled) }}>
                  {t.cancelBtn}
                </button>
              )}

              {uiState === STATES.DONE && (
                <>
                  {missingVitals.length > 0 && (
                    <div style={{background:'#FEF3C7',border:'1px solid #FDE68A',borderRadius:8,padding:'.75rem .875rem',marginBottom:'.75rem',fontSize:'.875rem',color:'#78350F'}}>
                      <strong>{t.missingReadings}</strong> {missingVitals.join(', ')}.
                      <div style={{marginTop:4,fontSize:'.8125rem'}}>
                        {t.missingHelp}
                      </div>
                    </div>
                  )}
                  {canContinue ? (
                    <button className="btn btn-primary btn-full" onClick={async () => {
                      if (abnormalCheck.abnormal && attemptCount < 2) {
                        setShowAbnormalGate(true)
                        return
                      }
                      if (attemptCount > 1 && vitals) {
                        try {
                          const cId = (sessionStorage.getItem('consultationId') || sessionStorage.getItem('consultation_id'))
                          if (cId && !cId.startsWith('demo')) {
                            await updateVitals(cId, { ...vitals, attempts: attemptCount, retake_reason: 'abnormal_first_reading' })
                          }
                        } catch {}
                      }
                      navigate(makeConsultUrl('/waiting', (sessionStorage.getItem('consultationId') || sessionStorage.getItem('consultation_id')) || sessionStorage.getItem('consultation_id') || 'demo'))
                    }}>
                      {t.continueBtn}
                    </button>
                  ) : (
                    <button className="btn btn-primary btn-full" onClick={retake}>
                      {t.retakeScan}
                    </button>
                  )}
                  {canContinue && vitals?.numericConfidence < 50 && (
                    <button className="btn btn-secondary btn-full" onClick={retake}>
                      {t.retakeBetter}
                    </button>
                  )}
                </>
              )}

              {(uiState === STATES.ERROR || uiState === STATES.DONE) && (
                <button className="btn btn-secondary btn-full" onClick={() => setManualMode(true)}>
                  {t.enterManual}
                </button>
              )}

              {/* Patient-refuses-vitals escape hatch. Small text link so it
                  doesn't compete with the primary capture flow, but always
                  present so vitals is never a hard blocker. Documents the
                  refusal on the consult record. */}
              {uiState !== STATES.MEASURING && !manualMode && (
                <button
                  type="button"
                  onClick={skipRefused}
                  style={{ background:'none', border:'none', color:'#6B7280', fontSize:'.8125rem', textDecoration:'underline', cursor:'pointer', padding:'.5rem', marginTop:'.25rem' }}
                >
                  Skip — I don't want to do vitals
                </button>
              )}


              {uiState !== STATES.MEASURING && (
                <button className="btn btn-secondary btn-full" onClick={() => {
                  streamRef.current?.getTracks().forEach(track => track.stop())
                  // Employee flow routes back to its own /work/[slug]/intake
                  // form, not the public AI triage. WorkIntake stashes the
                  // slug in sessionStorage before navigating here.
                  const empSlug = sessionStorage.getItem('employee_intake_slug')
                  navigate(empSlug ? `/work/${empSlug}` : '/triage')
                }}>
                  {t.backIntake}
                </button>
              )}
            </div>

            <button onClick={() => setManualMode(true)} style={{background:'none',border:'none',color:'var(--muted)',fontSize:'.8125rem',marginTop:'1rem',cursor:'pointer',textDecoration:'underline',width:'100%',textAlign:'center'}}>
              {t.havePulseOx}
            </button>
          </div>
        ) : (
          <div className="card">
            <h2 style={{marginBottom:'.375rem'}}>{t.manualTitle}</h2>
            <p style={{marginBottom:'1.25rem',fontSize:'.9375rem'}}>
              {t.manualIntro}
            </p>
            <div className="form-row">
              <div className="form-group">
                <label>{t.hrLabel} <span className="label-opt">{t.hrUnit}</span></label>
                <input type="number" min="30" max="250" placeholder={t.hrPh}
                  value={manual.hr} onChange={e => setManual(m => ({...m, hr: e.target.value}))} />
              </div>
              <div className="form-group">
                <label>{t.rrLabel} <span className="label-opt">{t.rrUnit}</span></label>
                <input type="number" min="5" max="50" placeholder={t.rrPh}
                  value={manual.rr} onChange={e => setManual(m => ({...m, rr: e.target.value}))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>{t.spo2Label} <span className="label-opt">{t.spo2Unit}</span></label>
                <input type="number" min="70" max="100" placeholder={t.spo2Ph}
                  value={manual.spo2} onChange={e => setManual(m => ({...m, spo2: e.target.value}))} />
              </div>
              <div className="form-group">
                <label>{t.bpLabel}</label>
                <input type="text" placeholder={t.bpPh}
                  value={manual.bp} onChange={e => setManual(m => ({...m, bp: e.target.value}))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>{t.tempLabel} <span className="label-opt">{t.tempUnit}</span></label>
                <input type="number" step="0.1" min="34" max="42" placeholder={t.tempPh}
                  value={manual.temperature} onChange={e => setManual(m => ({...m, temperature: e.target.value}))} />
              </div>
              <div className="form-group" />
            </div>
            <div style={{display:'flex',gap:'.75rem',marginTop:'.5rem'}}>
              <button className="btn btn-secondary" onClick={() => setManualMode(false)}>{t.backBtn}</button>
              <button className="btn btn-primary" style={{flex:1}} onClick={saveManual}>
                {t.continueReadings}
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{position:'fixed',bottom:0,left:0,right:0,background:'rgba(255,255,255,.95)',borderTop:'1px solid var(--border)',padding:'.5rem 1rem',paddingBottom:'max(.5rem, env(safe-area-inset-bottom))',display:'flex',flexWrap:'wrap',gap:'.5rem 1rem',justifyContent:'center',fontSize:'.8125rem',color:'var(--muted)'}}>
        <span>{t.emergency} <strong>111</strong></span>
        <span>{t.mentalHealth} <strong>1737</strong></span>
      </div>

      {showAbnormalGate && (
        <div role="dialog" aria-modal="true" aria-labelledby="abnormal-gate-title"
          style={{position:'fixed',inset:0,background:'rgba(15,23,42,.55)',display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem',zIndex:1000}}>
          <div style={{background:'white',borderRadius:14,maxWidth:440,width:'100%',padding:'1.5rem',boxShadow:'0 20px 40px rgba(0,0,0,.2)'}}>
            <div style={{fontSize:'1.75rem',marginBottom:'.5rem'}}>🔁</div>
            <h2 id="abnormal-gate-title" style={{fontSize:'1.2rem',marginBottom:'.5rem',color:'#111827'}}>{t.tryOnceMore}</h2>
            <p style={{color:'#374151',lineHeight:1.5,fontSize:'.95rem',marginBottom:'.75rem'}}>
              {t.yourValue} <strong>{abnormalCheck.reasons.join(', ')}</strong> {t.outsideRangeBody}
            </p>
            <p style={{color:'#6B7280',fontSize:'.8125rem',marginBottom:'1.25rem'}}>
              {t.manualHint}
            </p>
            <div style={{display:'flex',flexDirection:'column',gap:'.5rem'}}>
              <button
                className="btn btn-primary btn-full"
                onClick={() => { setShowAbnormalGate(false); retake() }}>
                {t.retakeBtn}
              </button>
              <button
                className="btn btn-secondary btn-full"
                onClick={() => { setShowAbnormalGate(false); setManualMode(true) }}>
                {t.gotOwnReadings}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
