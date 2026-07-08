import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MultiPassMeasurement, inspectDevice, calibrateRPPG, processStoredFrames, calculatePTT } from '../../lib/rppg'
import { updateVitals, patientUpdateConsultation } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'
import { calculateSpO2, formatSpO2Display } from '../../lib/spo2'

const STATES = {
  REQUESTING: 'requesting',
  INSPECTING: 'inspecting',
  CHECKLIST:  'checklist',
  READY:      'ready',
  MEASURING:  'measuring',
  DONE:       'done',
  ERROR:      'error',
}

const PREP_TIPS = [
  { icon: '💡', text: 'Good lighting on your face' },
  { icon: '📱', text: 'Hold phone at arm\'s length' },
  { icon: '🧘', text: 'Stay still and breathe normally' },
  { icon: '👓', text: 'Remove glasses if you wear them' },
]

function QualityIndicator({ deviceInfo }) {
  if (!deviceInfo) return null
  const { fps, brightness, quality } = deviceInfo
  const issues = []
  if (fps < 20)         issues.push('Low frame rate detected — results may be less accurate')
  if (brightness < 60)  issues.push('Too dark — face a window or turn on more lights')
  if (brightness > 200) issues.push('Overexposed — avoid direct sunlight behind you')
  if (quality < 50)     issues.push('Camera quality is low — results may be less accurate')

  if (issues.length === 0) {
    return (
      <div style={{ background:'#D1FAE5', borderRadius:8, padding:'10px 14px', marginBottom:12, color:'#065F46', fontSize:'0.875rem' }}>
        ✓ Camera quality is good — ready to scan
      </div>
    )
  }
  return (
    <div style={{ background:'#FEF3C7', borderRadius:8, padding:'10px 14px', marginBottom:12, color:'#92400E', fontSize:'0.875rem' }}>
      ⚠️ For best results:
      <ul style={{ margin:'4px 0 0 16px', padding:0 }}>
        {issues.map((issue, i) => <li key={i}>{issue}</li>)}
      </ul>
    </div>
  )
}

function ConfidenceBadge({ numericConfidence }) {
  if (numericConfidence == null) return null
  const high = numericConfidence >= 80
  const mid  = numericConfidence >= 60
  return (
    <div style={{
      background: high ? '#D1FAE5' : '#FEF3C7',
      color:      high ? '#065F46' : '#92400E',
      borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:'0.875rem'
    }}>
      {high ? '✓ High quality reading' : mid ? '⚠️ Moderate quality — reading may vary slightly' : '⚠️ Low quality — consider retaking for accuracy'}
      <span style={{ color:'var(--muted)', marginLeft:8, fontSize:'0.8rem' }}>({numericConfidence}/100)</span>
    </div>
  )
}

export default function VitalsCapture() {
  const navigate = useNavigate()
  // On mount, ensure the latest trained BP model + SpO2 calibration are cached locally so
  // BP + SpO2 render calibrated on the summary. Both fetch from Supabase and no-op if local
  // is already current.
  useEffect(() => {
    import('../../lib/bpModel').then(async ({ loadModelFromSupabase, getLocalMeta }) => {
      const local = getLocalMeta()
      const meta  = await loadModelFromSupabase()
      if (meta && local && meta.version === local.version) return // already current
    }).catch(() => {})
    import('../../lib/spo2').then(({ loadSpO2CalibrationFromSupabase }) => loadSpO2CalibrationFromSupabase()).catch(() => {})
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
  const [scanLabel,  setScanLabel]  = useState('Start scan')
  const [passNum,    setPassNum]    = useState(1)
  const [totalPasses,setTotalPasses]= useState(3)
  const [motionPct,  setMotionPct]  = useState(0)
  const [ovalColor,  setOvalColor]  = useState('#F59E0B')  // amber default
  const [bpEstimate,   setBpEstimate]   = useState(null)
  const [spo2Estimate, setSpo2Estimate] = useState(null)
  const [scanMode,     setScanMode]     = useState('face') // 'face' | 'finger'
  const [faceBox,      setFaceBox]      = useState(null)   // normalised { x,y,w,h } from FaceMesh
  const rearStreamRef  = useRef(null)
  const faceFramesRef  = useRef(null)  // stores raw frames from face scan for PTT

  // Request camera → inspect → checklist (or use background frames if available)
  useEffect(() => {
    async function requestCamera() {
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
        setUiState(STATES.INSPECTING)

        try {
          const info = await inspectDevice(videoRef.current)
          setDeviceInfo(info)
          const cal = calibrateRPPG(info)
          setScanLabel(`Start ${cal.windowSec}-second scan (3 passes)`)
        } catch {
          setScanLabel('Start 80-second scan (4 passes)')
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
        setError('Camera access denied. Please allow camera access and refresh, or use manual entry below.')
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
          setTimeout(() => {
            const result = processStoredFrames(frames, storedFPS)
            if (result && !result.faceWarning) {
              setVitals(result); setUiState(STATES.DONE)
              const id = sessionStorage.getItem('consultationId')
              if (id && !id.startsWith('demo')) {
                import('../../lib/supabase').then(({ updateVitals }) => updateVitals(id, result)).catch(() => {})
                import('../../lib/api').then(({ apiFetch }) =>
                  apiFetch('/api/push-notify', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type:'vitals_ready', consultationId:id }) }).catch(() => {})
                ).catch(() => {})
              } else {
                sessionStorage.setItem('vitals', JSON.stringify(result))
              }
              if (result.rawFrames?.length) {
                import('../../lib/bpModel').then(({ isBPReliable, predictBP }) => {
                  if (!isBPReliable()) return
                  return predictBP({ frames: result.rawFrames, fps: result.actualFps }, {})
                }).then(bp => { if (bp) setBpEstimate(bp) }).catch(() => {})
                try { const spo2 = calculateSpO2(result.rawFrames); if (spo2) setSpo2Estimate(spo2) } catch {}
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
      streamRef.current?.getTracks().forEach(t => t.stop())
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
        // BP estimate from locally trained model (dynamic import keeps TF.js out of main bundle)
        // Runs async; when it resolves we PATCH the consult with the BP so it
        // shows in the provider's vitals bar. Previously the estimate lived
        // only in local React state and never persisted.
        const consultIdForBp = sessionStorage.getItem('consultationId')
        if (result.rawFrames?.length) {
          import('../../lib/bpModel').then(({ bpModelReady, predictBP, isBPReliable }) => {
            if (!isBPReliable()) return
            return predictBP({ frames: result.rawFrames, fps: result.actualFps }, {})
          }).then(bp => {
            if (!bp) return
            setBpEstimate(bp)
            if (consultIdForBp && !consultIdForBp.startsWith('demo')) {
              // Merge into existing vitals payload.
              const bpString = bp.systolic && bp.diastolic ? `${bp.systolic}/${bp.diastolic}` : (bp.value || null)
              if (bpString) {
                updateVitals(consultIdForBp, { bp: bpString }).catch(() => {})
              }
            }
          }).catch(() => {})
        }
        // SpO2: compute synchronously so it's saved with vitals (provider-only, not shown to patient)
        let spo2Result = null
        if (result.rawFrames?.length) {
          try { spo2Result = calculateSpO2(result.rawFrames) } catch {}
          if (spo2Result) setSpo2Estimate(spo2Result)
        }
        const id = sessionStorage.getItem('consultationId')
        if (id && !id.startsWith('demo')) {
          try {
            await updateVitals(id, { ...result, spo2: spo2Result?.estimate || null })
            apiFetch('/api/push-notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type:'vitals_ready', consultationId:id }),
            }).catch(() => {})
          } catch {}
        } else {
          sessionStorage.setItem('vitals', JSON.stringify({ ...result, spo2: spo2Result?.estimate || null }))
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
        const id = sessionStorage.getItem('consultationId')
        if (id && !id.startsWith('demo')) {
          const { updateVitals } = await import('../../lib/supabase')
          await updateVitals(id, finalResult)
        } else { sessionStorage.setItem('vitals', JSON.stringify(finalResult)) }
      } else {
        setError('Finger scan failed. Try again or use face scan.'); setUiState(STATES.ERROR); setScanMode('face')
      }
    } catch (e) {
      setError('Rear camera unavailable: ' + e.message); setUiState(STATES.ERROR); setScanMode('face')
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
    const cId = sessionStorage.getItem('consultationId')
    if (cId && !cId.startsWith('demo')) {
      try {
        await updateVitals(cId, result)
        apiFetch('/api/push-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type:'vitals_ready', consultationId:cId }),
        }).catch(() => {})
      } catch {}
    } else {
      sessionStorage.setItem('vitals', JSON.stringify(result))
    }
    navigate(`/waiting/${sessionStorage.getItem('consultationId') || 'demo'}`)
  }

  async function skip() {
    try {
      const cId = sessionStorage.getItem('consultationId')
      if (cId && !cId.startsWith('demo')) {
        await patientUpdateConsultation(cId, {
          status: 'vitals_complete',
          vitals: { skipped: true },
          vitals_at: new Date().toISOString(),
        })
      } else {
        sessionStorage.setItem('vitals', JSON.stringify({ skipped: true }))
      }
    } catch {}
    navigate(`/waiting/${sessionStorage.getItem('consultationId') || 'demo'}`)
  }

  const hrStatus = vitals?.hr ? (vitals.hr < 60 || vitals.hr > 100 ? 'warning' : 'normal') : 'normal'
  const rrStatus = vitals?.rr ? (vitals.rr < 12 || vitals.rr > 20 ? 'warning' : 'normal') : 'normal'
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
        <span className="navbar-brand" onClick={() => navigate('/')} style={{cursor:'pointer',userSelect:'none',transition:'opacity .15s'}} onMouseEnter={e=>e.currentTarget.style.opacity='.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'} role="link" aria-label="Tere Health — go to home">Tere</span>
        <span style={{color:'rgba(255,255,255,.5)',fontSize:'.875rem'}}>Vital signs</span>
      </nav>

      <div className="container" style={{paddingTop:'1.75rem',paddingBottom:'5rem'}}>

        {!manualMode ? (
          <div className="card">
            <h2 style={{marginBottom:'.375rem'}}>
              {hasBackgroundFrames
                ? (uiState === STATES.DONE ? 'Vitals captured' : 'Analysing your vitals…')
                : 'Vital signs scan'}
            </h2>
            <p style={{marginBottom:'1.25rem',fontSize:'.9375rem',color:'var(--muted)'}}>
              {hasBackgroundFrames
                ? (uiState === STATES.DONE ? 'Captured during triage — no scan needed.' : 'We captured readings during your consultation — processing now.')
                : 'Your camera measures your heart rate, breathing, and blood pressure. Takes about 80 seconds.'}
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
                    Checking camera quality…
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
                    Pass {passNum} of {totalPasses}
                  </div>

                  {/* Motion indicator */}
                  <div style={{display:'flex',alignItems:'center',gap:6,fontSize:'.8125rem',color:'white',opacity:.85}}>
                    <div style={{
                      width:10, height:10, borderRadius:'50%',
                      background: motionPct > 30 ? '#EF4444' : '#10B981',
                      transition:'background .3s'
                    }} />
                    {motionPct > 30 ? 'Hold still' : 'Hold still — measuring'}
                  </div>
                </div>
              )}

              {/* Ready — alignment hint */}
              {(uiState === STATES.READY || uiState === STATES.CHECKLIST) && (
                <div style={{position:'absolute',bottom:'10px',left:0,right:0,textAlign:'center',zIndex:11}}>
                  <div style={{background:'rgba(0,0,0,.55)',color:'white',fontSize:'.8125rem',padding:'4px 12px',borderRadius:'99px',display:'inline-block',backdropFilter:'blur(4px)'}}>
                    Align your face with the oval
                  </div>
                </div>
              )}
            </div>

            {/* Finger scan overlay */}
            {scanMode === 'finger' && isMeasuring && (
              <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,.85)',zIndex:5,gap:12}}>
                <div style={{fontSize:'3.5rem'}}>👆</div>
                <div style={{color:'white',fontWeight:700,fontSize:'1rem'}}>Cover the rear camera with your finger</div>
                <div style={{color:'rgba(255,255,255,.7)',fontSize:'.8125rem'}}>Press gently — don't block the flash</div>
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
                    <div style={{fontWeight:700,color:'#92400E',marginBottom:6}}>⚠️ Poor signal detected</div>
                    <p style={{fontSize:'.875rem',color:'#92400E',margin:'0 0 12px'}}>
                      Low lighting or camera quality may affect accuracy. Try the finger scan for a more reliable reading.
                    </p>
                    <button onClick={startFingerScan} style={{width:'100%',padding:12,background:'#F59E0B',color:'white',borderRadius:8,border:'none',fontWeight:700,cursor:'pointer',fontSize:'.9375rem'}}>
                      👆 Switch to finger scan
                    </button>
                    <p style={{fontSize:'.75rem',color:'#92400E',margin:'8px 0 0',textAlign:'center'}}>
                      Cover the rear camera lens with your fingertip
                    </p>
                  </div>
                )}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.5rem'}}>
                  {PREP_TIPS.map(({ icon, text }) => (
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
                  <strong style={{color:'var(--text)',display:'block',marginBottom:'.375rem'}}>For best results:</strong>
                  Good lighting on your face · Stay still during the scan · Remove glasses if possible
                </div>
              </div>
            )}

            {/* Done — results */}
            {uiState === STATES.DONE && vitals && (
              <>
                {vitals.backgroundDurationSec && (
                  <div style={{ background:'#EFF6FF', borderRadius:8, padding:'10px 14px', marginBottom:12, color:'#1E40AF', fontSize:'.875rem' }}>
                    ✓ Analysed {vitals.backgroundDurationSec} seconds of data from triage
                    <div style={{ fontSize:'.8125rem', color:'#3B82F6', marginTop:2 }}>More data = more accurate readings</div>
                  </div>
                )}
                {vitals.ptt && vitals.ptt.pttMs > 0 && (
                  <div style={{ background:'#F0FDF4', borderRadius:8, padding:'10px 14px', marginBottom:12, color:'#15803D', fontSize:'.875rem' }}>
                    ✓ Pulse transit time: {vitals.ptt.pttMs}ms
                    {vitals.ptt.systolicEstimate && <span style={{ marginLeft:8, color:'#166534' }}>· BP estimate enhanced with vascular timing</span>}
                  </div>
                )}
                <ConfidenceBadge numericConfidence={vitals.numericConfidence} />
                <div className="vitals-grid" style={{marginBottom:'1.25rem'}}>
                  <div className={`vital-card ${hrStatus}`}>
                    <div className="vital-label">Heart Rate</div>
                    <div className={`vital-value ${hrStatus}`}>{vitals.hr ?? '—'}</div>
                    <div className="vital-unit">bpm</div>
                  </div>
                  <div className={`vital-card ${rrStatus}`}>
                    <div className="vital-label">Resp. Rate</div>
                    <div className={`vital-value ${rrStatus}`}>{vitals.rr ?? '—'}</div>
                    <div className="vital-unit">breaths/min</div>
                  </div>
                  {bpEstimate && (
                    <div className="vital-card" style={{gridColumn:'1 / -1'}}>
                      <div className="vital-label">Blood Pressure{bpEstimate.confidence === 'medium' ? ' ⚠️' : ''}</div>
                      <div className="vital-value" style={{ color: bpEstimate.confidence === 'low' ? '#F59E0B' : undefined }}>
                        {bpEstimate.systolic}/{bpEstimate.diastolic}
                      </div>
                      <div className="vital-unit">
                        mmHg · AI estimate{bpEstimate.calibrated ? ' (calibrated)' : ''}{bpEstimate.confidence === 'medium' ? ' · may vary' : bpEstimate.confidence === 'low' ? ' · low confidence' : ''}
                      </div>
                    </div>
                  )}
                  {/* SpO2: use formatSpO2Display() to hide low/unreliable estimates rather than misrendering them */}
                  {(() => {
                    const disp = formatSpO2Display(spo2Estimate)
                    if (!disp?.show) return null
                    return (
                      <div className="vital-card">
                        <div className="vital-label">SpO₂{disp.warning ? ' ⚠️' : ''}</div>
                        <div className="vital-value" style={{ color: disp.warning ? disp.color : undefined }}>
                          {disp.value}
                        </div>
                        <div className="vital-unit">
                          % · screening estimate{disp.warning ? ' · may vary' : ''}
                        </div>
                      </div>
                    )
                  })()}
                </div>
                {vitals.passes && (
                  <div style={{fontSize:'.8125rem',color:'var(--muted)',marginBottom:'.75rem',textAlign:'center'}}>
                    {vitals.passes} passes · {vitals.frames} frames · {vitals.actualFps} fps
                  </div>
                )}
                <div style={{fontSize:'.8125rem',color:'var(--muted)',marginBottom:'1.25rem',background:'#FEF3C7',border:'1px solid #FDE68A',borderRadius:8,padding:'.625rem .875rem'}}>
                  <strong>Tere Vitals</strong> provides indicative screening estimates only. Results are not a substitute for medical-grade devices and must be interpreted by a registered clinician.
                </div>
              </>
            )}

            {/* Error */}
            {uiState === STATES.ERROR && error && (
              <div className="alert alert-warning" style={{marginBottom:'1.25rem'}}>
                <strong>Camera issue — </strong>{error}
              </div>
            )}

            {/* Actions */}
            <div style={{display:'flex',flexDirection:'column',gap:'.75rem'}}>

              {uiState === STATES.CHECKLIST && (
                <button
                  className="btn btn-primary btn-full"
                  onClick={startMeasurement}
                >
                  I'm ready — start vital signs scan
                </button>
              )}

              {uiState === STATES.READY && (
                <button className="btn btn-primary btn-full" onClick={startMeasurement}>
                  {scanLabel}
                </button>
              )}

              {isInspecting && (
                <button className="btn btn-primary btn-full" disabled style={{opacity:.5}}>
                  Checking camera…
                </button>
              )}

              {isMeasuring && (
                <button className="btn btn-secondary btn-full" onClick={() => { measureRef.current?.stop(); setUiState(STATES.ERROR); setError('Measurement cancelled.') }}>
                  Cancel
                </button>
              )}

              {uiState === STATES.DONE && (
                <>
                  <button className="btn btn-primary btn-full" onClick={() => navigate(`/waiting/${sessionStorage.getItem('consultationId') || 'demo'}`)}>
                    Continue to consultation
                  </button>
                  {vitals?.numericConfidence < 50 && (
                    <button className="btn btn-secondary btn-full" onClick={retake}>
                      Retake for better accuracy
                    </button>
                  )}
                </>
              )}

              {(uiState === STATES.ERROR || uiState === STATES.DONE) && (
                <button className="btn btn-secondary btn-full" onClick={() => setManualMode(true)}>
                  Enter vitals manually instead
                </button>
              )}


              {uiState !== STATES.MEASURING && (
                <button className="btn btn-secondary btn-full" onClick={() => {
                  streamRef.current?.getTracks().forEach(t => t.stop())
                  navigate('/triage')
                }}>
                  ← Back to intake form
                </button>
              )}
            </div>

            <button onClick={() => setManualMode(true)} style={{background:'none',border:'none',color:'var(--muted)',fontSize:'.8125rem',marginTop:'1rem',cursor:'pointer',textDecoration:'underline',width:'100%',textAlign:'center'}}>
              Have a pulse oximeter or BP cuff? Enter your own readings
            </button>
          </div>
        ) : (
          <div className="card">
            <h2 style={{marginBottom:'.375rem'}}>Enter vital signs manually</h2>
            <p style={{marginBottom:'1.25rem',fontSize:'.9375rem'}}>
              If you have a pulse oximeter or blood pressure cuff, enter your readings here.
              All fields are optional.
            </p>
            <div className="form-row">
              <div className="form-group">
                <label>Heart Rate <span className="label-opt">(bpm)</span></label>
                <input type="number" min="30" max="250" placeholder="e.g. 80"
                  value={manual.hr} onChange={e => setManual(m => ({...m, hr: e.target.value}))} />
              </div>
              <div className="form-group">
                <label>Resp. Rate <span className="label-opt">(breaths/min)</span></label>
                <input type="number" min="5" max="50" placeholder="e.g. 16"
                  value={manual.rr} onChange={e => setManual(m => ({...m, rr: e.target.value}))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>SpO₂ <span className="label-opt">(%)</span></label>
                <input type="number" min="70" max="100" placeholder="e.g. 98"
                  value={manual.spo2} onChange={e => setManual(m => ({...m, spo2: e.target.value}))} />
              </div>
              <div className="form-group">
                <label>Blood Pressure</label>
                <input type="text" placeholder="e.g. 120/80"
                  value={manual.bp} onChange={e => setManual(m => ({...m, bp: e.target.value}))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Temperature <span className="label-opt">(°C)</span></label>
                <input type="number" step="0.1" min="34" max="42" placeholder="e.g. 37.2"
                  value={manual.temperature} onChange={e => setManual(m => ({...m, temperature: e.target.value}))} />
              </div>
              <div className="form-group" />
            </div>
            <div style={{display:'flex',gap:'.75rem',marginTop:'.5rem'}}>
              <button className="btn btn-secondary" onClick={() => setManualMode(false)}>Back</button>
              <button className="btn btn-primary" style={{flex:1}} onClick={saveManual}>
                Continue with these readings
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{position:'fixed',bottom:0,left:0,right:0,background:'rgba(255,255,255,.95)',borderTop:'1px solid var(--border)',padding:'.5rem 1rem',paddingBottom:'max(.5rem, env(safe-area-inset-bottom))',display:'flex',flexWrap:'wrap',gap:'.5rem 1rem',justifyContent:'center',fontSize:'.8125rem',color:'var(--muted)'}}>
        <span>Emergency? Call <strong>111</strong></span>
        <span>Mental health crisis? Call or text <strong>1737</strong></span>
      </div>
    </div>
  )
}
