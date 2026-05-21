import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Tere Vitals — Proprietary rPPG Engine
// 
// Uses POS (Plane-Orthogonal-to-Skin) algorithm for heart rate extraction.
// Reference: Wang et al. (2017) "Algorithmic Principles of Remote PPG"
//
// Pipeline:
//   1. MediaPipe FaceMesh → detect forehead region of interest (ROI)
//   2. Sample mean RGB values from ROI at ~30fps for 30 seconds
//   3. Normalise and apply POS algorithm to extract rPPG signal
//   4. Bandpass filter (0.75–4 Hz = 45–240 BPM)
//   5. FFT → dominant frequency → Heart Rate
//   6. Respiratory rate estimated from signal envelope (0.1–0.5 Hz)
//
// CLINICAL NOTE: All readings are indicative screening estimates.
// Tere Vitals is not a medical-grade device. Readings should be
// interpreted in clinical context by the treating clinician.
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_DURATION_MS = 30000  // 30 seconds
const SAMPLE_RATE_HZ     = 30
const TOTAL_SAMPLES      = SAMPLE_DURATION_MS / 1000 * SAMPLE_RATE_HZ // ~900

// ── Signal processing helpers ──────────────────────────────────────────────

function detrend(signal) {
  const n = signal.length
  const mean = signal.reduce((a, b) => a + b, 0) / n
  return signal.map(v => v - mean)
}

function normalise(signal) {
  const mean = signal.reduce((a, b) => a + b, 0) / signal.length
  const std  = Math.sqrt(signal.reduce((a, b) => a + (b - mean) ** 2, 0) / signal.length) || 1
  return signal.map(v => (v - mean) / std)
}

// Moving average bandpass: highpass then lowpass
function bandpassFilter(signal, fs = 30) {
  const n = signal.length
  // Highpass: remove slow drift (below 0.75 Hz = 45 BPM)
  const lpWindow = Math.round(fs / 0.75)
  const lp = signal.map((_, i) => {
    const start = Math.max(0, i - lpWindow)
    const slice = signal.slice(start, i + 1)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
  const hp = signal.map((v, i) => v - lp[i])
  // Lowpass: remove high freq noise (above 4 Hz = 240 BPM)
  const lpWindow2 = Math.round(fs / 4.0)
  return hp.map((_, i) => {
    const start = Math.max(0, i - lpWindow2)
    const slice = hp.slice(start, i + 1)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

// Hamming window to reduce spectral leakage
function hammingWindow(signal) {
  const n = signal.length
  return signal.map((v, i) => v * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (n - 1))))
}

// FFT (Cooley-Tukey, power of 2 length)
function fft(re) {
  const n = re.length
  if (n <= 1) return { re, im: new Array(n).fill(0) }
  // Pad to power of 2
  let N = 1
  while (N < n) N *= 2
  const r = new Float64Array(N)
  const im = new Float64Array(N)
  re.forEach((v, i) => { r[i] = v })
  // DFT for smaller signals
  const mag = new Array(Math.floor(N/2))
  for (let k = 0; k < N/2; k++) {
    let rk = 0, ik = 0
    for (let t = 0; t < N; t++) {
      const angle = 2 * Math.PI * k * t / N
      rk += r[t] * Math.cos(angle)
      ik -= r[t] * Math.sin(angle)
    }
    mag[k] = Math.sqrt(rk*rk + ik*ik)
  }
  return mag
}

// Motion rejection — remove frames where signal jumps suddenly
function rejectMotion(r, g, b) {
  const n = r.length
  if (n < 3) return { r, g, b }
  // Compute frame-to-frame delta for green channel (most sensitive)
  const deltas = g.map((v, i) => i === 0 ? 0 : Math.abs(v - g[i-1]))
  const meanDelta = deltas.reduce((a, b) => a + b, 0) / n
  const stdDelta = Math.sqrt(deltas.reduce((a, v) => a + (v - meanDelta) ** 2, 0) / n)
  const threshold = meanDelta + 2.5 * stdDelta
  // Keep only stable frames
  const keep = deltas.map(d => d < threshold)
  return {
    r: r.filter((_, i) => keep[i]),
    g: g.filter((_, i) => keep[i]),
    b: b.filter((_, i) => keep[i]),
  }
}

// POS algorithm (Wang et al. 2017)
function posAlgorithm(rBuffer, gBuffer, bBuffer) {
  const n = rBuffer.length
  // Normalise each channel
  const rN = normalise(rBuffer)
  const gN = normalise(gBuffer)
  const bN = normalise(bBuffer)
  // POS: P = [0, 1, -1] * RGB_norm; Q = [-2, 1, 1] * RGB_norm
  const P = gN.map((g, i) => g - bN[i])
  const Q = rN.map((r, i) => -2*r + gN[i] + bN[i])
  // Combine: S = P + (std(P)/std(Q)) * Q
  const stdP = Math.sqrt(P.reduce((a,b) => a+(b**2),0)/n) || 1
  const stdQ = Math.sqrt(Q.reduce((a,b) => a+(b**2),0)/n) || 1
  const alpha = stdP / stdQ
  return P.map((p, i) => p + alpha * Q[i])
}

function extractHeartRate(signal, fs = 30) {
  const filtered = hammingWindow(bandpassFilter(detrend(signal), fs))
  const mag = fft(filtered)
  // Frequency resolution
  const freqRes = fs / (mag.length * 2)
  // Find peak in 0.75–4 Hz range (45–240 BPM)
  const minIdx = Math.floor(0.75 / freqRes)
  const maxIdx = Math.ceil(4.0 / freqRes)
  let peakIdx = minIdx, peakVal = 0
  for (let i = minIdx; i <= Math.min(maxIdx, mag.length - 1); i++) {
    if (mag[i] > peakVal) { peakVal = mag[i]; peakIdx = i }
  }
  const hrHz = peakIdx * freqRes
  return Math.round(hrHz * 60)
}

function extractRespiratoryRate(signal, fs = 30) {
  // Respiratory rate from signal envelope (0.1–0.5 Hz = 6–30 breaths/min)
  const env = signal.map(Math.abs)
  const mag = fft(detrend(env))
  const freqRes = fs / (mag.length * 2)
  const minIdx = Math.floor(0.1 / freqRes)
  const maxIdx = Math.ceil(0.5 / freqRes)
  let peakIdx = minIdx, peakVal = 0
  for (let i = minIdx; i <= Math.min(maxIdx, mag.length - 1); i++) {
    if (mag[i] > peakVal) { peakVal = mag[i]; peakIdx = i }
  }
  const rrHz = peakIdx * freqRes
  const rr = Math.round(rrHz * 60)
  return rr >= 6 && rr <= 30 ? rr : null
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Vitals() {
  const { id } = useParams()
  const navigate = useNavigate()

  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const streamRef   = useRef(null)
  const faceMeshRef = useRef(null)
  const samplesRef  = useRef({ r: [], g: [], b: [] })
  const animFrameRef= useRef(null)
  const startTimeRef= useRef(null)

  const [phase, setPhase]   = useState('intro')    // intro | permission | scanning | result | manual | done
  const [progress, setProgress] = useState(0)       // 0–100
  const [result, setResult] = useState(null)         // { hr, rr, quality }
  const [manual, setManual] = useState({ spo2: '', bp_sys: '', bp_dia: '' })
  const [error, setError]   = useState(null)
  const [saving, setSaving] = useState(false)
  const [scanHint, setScanHint] = useState(null)  // null | 'dark' | 'move' | 'good'
  const lastGRef = useRef(null)

  // ── MediaPipe FaceMesh setup ───────────────────────────────────────────
  const setupFaceMesh = useCallback(async () => {
    const { FaceMesh } = await import('@mediapipe/face_mesh')
    const mesh = new FaceMesh({
      locateFile: file =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`
    })
    mesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
    mesh.onResults(onFaceMeshResults)
    faceMeshRef.current = mesh
    return mesh
  }, [])

  // Called each frame with FaceMesh results
  const onFaceMeshResults = useCallback((results) => {
    if (!results.multiFaceLandmarks?.length) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const w = canvas.width || 640
    const h = canvas.height || 480

    // Video already drawn in processFrame loop

    // Get forehead ROI from landmarks (points 10, 338, 297, 67)
    const lm = results.multiFaceLandmarks[0]
    const foreheadPoints = [10, 338, 297, 67, 109, 108]
    const xs = foreheadPoints.map(i => lm[i].x * w)
    const ys = foreheadPoints.map(i => lm[i].y * h)
    const roiX = Math.max(0, Math.min(...xs))
    const roiY = Math.max(0, Math.min(...ys))
    const roiW = Math.max(...xs) - roiX
    const roiH = Math.max(...ys) - roiY

    if (roiW < 10 || roiH < 10) return

    // Draw face guide circle
    const centerX = w / 2
    const centerY = h / 2.2
    const radius = Math.min(w, h) * 0.38
    const faceX = (Math.min(...xs) + Math.max(...xs)) / 2
    const faceY = (Math.min(...ys) + Math.max(...ys)) / 2
    const faceInCircle = Math.hypot(faceX - centerX, faceY - centerY) < radius * 0.5
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI)
    ctx.strokeStyle = faceInCircle ? 'rgba(11,110,118,0.9)' : 'rgba(220,38,38,0.8)'
    ctx.lineWidth = 3
    ctx.setLineDash(faceInCircle ? [] : [10, 6])
    ctx.stroke()
    ctx.setLineDash([])
    // Label
    ctx.font = '13px sans-serif'
    ctx.fillStyle = faceInCircle ? 'rgba(11,110,118,0.9)' : 'rgba(220,38,38,0.9)'
    ctx.textAlign = 'center'
    ctx.fillText(faceInCircle ? 'Hold still' : 'Move face into circle', centerX, centerY + radius + 20)

    // Draw ROI highlight
    ctx.strokeStyle = 'rgba(11,110,118,0.6)'
    ctx.lineWidth = 2
    ctx.setLineDash([])
    ctx.strokeRect(roiX, roiY, roiW, roiH)

    // Sample mean RGB from ROI
    const pixel = ctx.getImageData(roiX, roiY, roiW, roiH)
    let r = 0, g = 0, bv = 0
    const nPx = pixel.data.length / 4
    for (let i = 0; i < pixel.data.length; i += 4) {
      r += pixel.data[i]; g += pixel.data[i+1]; bv += pixel.data[i+2]
    }
    const meanR = r / nPx
    const meanG = g / nPx
    const meanB = bv / nPx
    samplesRef.current.r.push(meanR)
    samplesRef.current.g.push(meanG)
    samplesRef.current.b.push(meanB)

    // Real-time quality feedback
    const brightness = (meanR + meanG + meanB) / 3
    const motionDelta = lastGRef.current !== null ? Math.abs(meanG - lastGRef.current) : 0
    lastGRef.current = meanG
    if (brightness < 60) {
      setScanHint('dark')
    } else if (motionDelta > 8) {
      setScanHint('move')
    } else {
      setScanHint('good')
    }

    // Update progress
    const elapsed = Date.now() - startTimeRef.current
    const pct = Math.min(100, (elapsed / SAMPLE_DURATION_MS) * 100)
    setProgress(Math.round(pct))

    // Check if done
    if (elapsed >= SAMPLE_DURATION_MS) {
      finishScan()
    }
  }, [])

  const startScan = async () => {
    setPhase('permission')
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 }
      })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()

      const container = canvasRef.current.parentElement
      const cw = container?.clientWidth || 640
      const ch = Math.round(cw * 0.75)
      canvasRef.current.width  = cw
      canvasRef.current.height = ch

      const mesh = await setupFaceMesh()
      samplesRef.current = { r: [], g: [], b: [] }
      startTimeRef.current = Date.now()
      setPhase('scanning')

      // Process frames
      const processFrame = async () => {
        if (phase === 'result') return
        const video = videoRef.current
        const canvas = canvasRef.current
        if (video && !video.paused && canvas) {
          // Draw video to canvas first
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          await mesh.send({ image: canvas })
        }
        animFrameRef.current = requestAnimationFrame(processFrame)
      }
      animFrameRef.current = requestAnimationFrame(processFrame)

    } catch (err) {
      console.error(err)
      setError(err.name === 'NotAllowedError'
        ? 'Camera access denied. Please allow camera access and try again.'
        : 'Could not access your camera. Please check it is working.')
      setPhase('intro')
    }
  }

  const finishScan = useCallback(() => {
    // Stop camera
    cancelAnimationFrame(animFrameRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())

    const { r, g, b } = samplesRef.current
    if (r.length < 100) {
      setError('Not enough data — please try again and keep still during the scan.')
      setPhase('intro')
      return
    }

    // Reject motion-corrupted frames then apply POS algorithm
    const clean = rejectMotion(r, g, b)
    const rppgSignal = posAlgorithm(clean.r, clean.g, clean.b)
    const hr = extractHeartRate(rppgSignal, SAMPLE_RATE_HZ)
    const rr = extractRespiratoryRate(rppgSignal, SAMPLE_RATE_HZ)

    // Sanity check
    const hrValid = hr >= 40 && hr <= 200
    const quality = hrValid ? (r.length >= TOTAL_SAMPLES * 0.9 ? 'good' : 'fair') : 'poor'

    setResult({ hr: hrValid ? hr : null, rr, quality })
    setPhase('result')
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await db.consultations.update(id, {
        vitals_hr:     result?.hr || null,
        vitals_rr:     result?.rr || null,
        vitals_spo2:   manual.spo2   ? parseInt(manual.spo2)   : null,
        vitals_bp_sys: manual.bp_sys ? parseInt(manual.bp_sys) : null,
        vitals_bp_dia: manual.bp_dia ? parseInt(manual.bp_dia) : null,
        vitals_source: 'tere_rppg',
      })
      navigate(`/waiting/${id}`)
    } catch (err) {
      setError('Failed to save vitals. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const skipVitals = async () => {
    setSaving(true)
    await db.consultations.update(id, { vitals_source: 'skipped' }).catch(() => {})
    navigate(`/waiting/${id}`)
    setSaving(false)
  }

  // Cleanup on unmount
  useEffect(() => () => {
    cancelAnimationFrame(animFrameRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  return (
    <div className="page-shell">
      <header className="page-header">
        <span className="page-logo">TERE</span>
        <span style={{ fontSize:'0.8rem', color:'rgba(255,255,255,0.45)' }}>Tere Vitals</span>
      </header>

      <div className="page-content">
        <div className="steps">
          {['Your details','Safety check','Vitals','See doctor'].map((s,i) => (
            <><div className="step-item" key={s}>
              <div className={`step-dot ${i<2?'done':i===2?'active':'todo'}`}>{i<2?'✓':i+1}</div>
              <span className={`step-label ${i===2?'active':''}`}>{s}</span>
            </div>{i<3&&<div className={`step-line ${i<2?'done':''}`}></div>}</>
          ))}
        </div>

        {/* INTRO */}
        {phase === 'intro' && (
          <div className="card">
            <div style={{ textAlign:'center', marginBottom:'1.5rem' }}>
              <div style={{
                width:80, height:80, background:'var(--teal-light)',
                borderRadius:'50%', display:'flex', alignItems:'center',
                justifyContent:'center', margin:'0 auto 1rem', fontSize:'2rem'
              }}>❤️</div>
              <h1 style={{ fontSize:'1.4rem', marginBottom:'0.5rem' }}>
                Tere Vitals — Heart rate scan
              </h1>
              <p style={{ color:'var(--muted)', fontSize:'0.9rem' }}>
                Your phone camera measures your heart rate in 30 seconds.
                No attachments needed.
              </p>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:'1.5rem' }}>
              {[
                ['💡', 'Good lighting', 'Sit in a well-lit room. Avoid backlighting.'],
                ['🧍', 'Stay still',    'Keep your face centred and avoid moving.'],
                ['⏱', '30 seconds',    'The scan takes 30 seconds. Results are indicative.'],
              ].map(([icon, title, desc]) => (
                <div key={title} style={{
                  display:'flex', gap:12, alignItems:'flex-start',
                  background:'var(--bg)', padding:'0.875rem', borderRadius:'var(--radius)'
                }}>
                  <span style={{ fontSize:'1.3rem', flexShrink:0 }}>{icon}</span>
                  <div>
                    <strong style={{ fontSize:'0.9rem' }}>{title}</strong>
                    <p style={{ fontSize:'0.85rem', color:'var(--muted)', marginTop:2 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {error && <div className="alert alert-danger" style={{ marginBottom:'1rem' }}>{error}</div>}

            <button onClick={startScan} className="btn btn-primary btn-lg" style={{ width:'100%' }}>
              Start scan
            </button>
            <button onClick={skipVitals} className="btn btn-ghost btn-sm"
              style={{ width:'100%', marginTop:8 }}>
              Skip vital signs
            </button>
          </div>
        )}

        {/* PERMISSION */}
        {phase === 'permission' && (
          <div className="card" style={{ textAlign:'center' }}>
            <div className="spinner spinner-lg" style={{ margin:'2rem auto' }}></div>
            <p>Requesting camera access…</p>
          </div>
        )}

        {/* SCANNING */}
        {phase === 'scanning' && (
          <div className="card" style={{ padding:'1rem' }}>
            <p style={{ textAlign:'center', fontWeight:600, marginBottom:'0.75rem', color:'var(--teal)' }}>
              Scanning… stay still and face the camera
            </p>
            {/* Live camera feed */}
            <div style={{ position:'relative', borderRadius:'var(--radius)', overflow:'hidden', marginBottom:'1rem', background:'#000', minHeight:280 }}>
              <video ref={videoRef} style={{ width:'100%', display:'block', borderRadius:'var(--radius)' }} muted playsInline />
              <canvas ref={canvasRef} style={{ display:'none' }} />
              <div style={{
                position:'absolute', top:'5%', left:'50%', transform:'translateX(-50%)',
                width:'56%', height:'80%',
                border: '3px solid #0B6E76',
                borderRadius:'50%', pointerEvents:'none'
              }} />
              {/* Scanning overlay */}
              <div style={{
                position:'absolute', bottom:0, left:0, right:0,
                background:'linear-gradient(transparent, rgba(0,0,0,0.6))',
                padding:'0.5rem 0.75rem',
              }}>
                <div style={{
                  height:4, background:'rgba(255,255,255,0.2)', borderRadius:2
                }}>
                  <div style={{
                    height:'100%', width:`${progress}%`,
                    background:'var(--teal)', borderRadius:2, transition:'width 0.3s'
                  }} />
                </div>
                <p style={{ color:'white', fontSize:'0.8rem', marginTop:4 }}>
                  {progress}% — {Math.ceil((SAMPLE_DURATION_MS - progress/100*SAMPLE_DURATION_MS)/1000)}s remaining
                </p>
              </div>
            </div>
            <div className="alert" style={{
              background: scanHint === 'dark' ? 'var(--warning-bg)' : scanHint === 'move' ? '#FEF2F2' : 'var(--success-bg)',
              border: `1px solid ${scanHint === 'dark' ? '#FDE68A' : scanHint === 'move' ? '#FECACA' : '#6EE7B7'}`,
              borderRadius: 'var(--radius-sm)', padding: '.75rem', display: 'flex', gap: 8, alignItems: 'center'
            }}>
              <span>{scanHint === 'dark' ? '💡' : scanHint === 'move' ? '🛑' : '✅'}</span>
              <span style={{fontSize: '.875rem'}}>
                {scanHint === 'dark' && 'Lighting too dim — move to a brighter area or turn on a light'}
                {scanHint === 'move' && 'Stay still — movement affects accuracy'}
                {scanHint === 'good' && 'Good — keep still and face the camera'}
                {!scanHint && 'Keep your face in the frame and stay as still as possible'}
              </span>
            </div>
          </div>
        )}

        {/* RESULT */}
        {phase === 'result' && (
          <div className="card">
            <h2 style={{ fontSize:'1.2rem', marginBottom:'1rem' }}>
              Tere Vitals result
            </h2>

            {/* rPPG results */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:'1.25rem' }}>
              <div style={{
                background: result?.hr ? 'var(--success-bg)' : 'var(--bg)',
                border:`1.5px solid ${result?.hr ? 'var(--success)' : 'var(--border)'}`,
                borderRadius:'var(--radius)', padding:'1rem', textAlign:'center'
              }}>
                <div style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', marginBottom:4 }}>Heart Rate</div>
                <div style={{ fontSize:'2.5rem', fontWeight:700, color: result?.hr ? 'var(--success)' : 'var(--muted)', lineHeight:1 }}>
                  {result?.hr ?? '—'}
                </div>
                <div style={{ fontSize:'0.8rem', color:'var(--muted)' }}>bpm</div>
                <div className="badge badge-teal" style={{ marginTop:6, fontSize:'0.7rem' }}>Tere rPPG</div>
              </div>
              <div style={{
                background: result?.rr ? 'var(--success-bg)' : 'var(--bg)',
                border:`1.5px solid ${result?.rr ? 'var(--success)' : 'var(--border)'}`,
                borderRadius:'var(--radius)', padding:'1rem', textAlign:'center'
              }}>
                <div style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', marginBottom:4 }}>Resp. Rate</div>
                <div style={{ fontSize:'2.5rem', fontWeight:700, color: result?.rr ? 'var(--success)' : 'var(--muted)', lineHeight:1 }}>
                  {result?.rr ?? '—'}
                </div>
                <div style={{ fontSize:'0.8rem', color:'var(--muted)' }}>br/min</div>
                <div className="badge badge-teal" style={{ marginTop:6, fontSize:'0.7rem' }}>Tere rPPG</div>
              </div>
            </div>

            {/* Manual entry for SpO2 and BP */}
            <div style={{
              background:'var(--bg)', borderRadius:'var(--radius)',
              padding:'1rem 1.25rem', marginBottom:'1.25rem'
            }}>
              <p style={{ fontSize:'0.85rem', fontWeight:600, marginBottom:'0.75rem' }}>
                Do you have a pulse oximeter or blood pressure cuff?
                <span style={{ fontWeight:400, color:'var(--muted)', display:'block', marginTop:2 }}>
                  Enter your readings below if available.
                </span>
              </p>
              <div className="form-row" style={{ gap:10 }}>
                <div>
                  <label className="form-label" style={{ fontSize:'0.8rem' }}>
                    SpO₂ <span className="optional">(optional)</span>
                  </label>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <input type="number" className="form-input" style={{ fontSize:'0.9rem' }}
                      value={manual.spo2} onChange={e => setManual(m => ({ ...m, spo2: e.target.value }))}
                      placeholder="e.g. 98" min="50" max="100" />
                    <span style={{ color:'var(--muted)', fontSize:'0.85rem', flexShrink:0 }}>%</span>
                  </div>
                </div>
                <div>
                  <label className="form-label" style={{ fontSize:'0.8rem' }}>
                    Blood pressure <span className="optional">(optional)</span>
                  </label>
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <input type="number" className="form-input" style={{ fontSize:'0.9rem' }}
                      value={manual.bp_sys} onChange={e => setManual(m => ({ ...m, bp_sys: e.target.value }))}
                      placeholder="120" min="50" max="250" />
                    <span style={{ color:'var(--muted)' }}>/</span>
                    <input type="number" className="form-input" style={{ fontSize:'0.9rem' }}
                      value={manual.bp_dia} onChange={e => setManual(m => ({ ...m, bp_dia: e.target.value }))}
                      placeholder="80" min="30" max="150" />
                  </div>
                </div>
              </div>
            </div>

            <div className="alert alert-info" style={{ marginBottom:'1.25rem' }}>
              <span>ℹ️</span>
              <span style={{ fontSize:'0.85rem' }}>
                Tere Vitals readings are <strong>indicative screening estimates</strong>, 
                not medical-grade measurements. Your doctor will assess them in context.
              </span>
            </div>

            {error && <div className="alert alert-danger" style={{ marginBottom:'1rem' }}>{error}</div>}

            <button onClick={handleSave} className="btn btn-primary btn-lg"
              style={{ width:'100%' }} disabled={saving}>
              {saving ? <><span className="spinner" style={{ width:18,height:18,borderWidth:2 }} /> Saving…</> : 'Send to my doctor →'}
            </button>

            <button onClick={() => { setPhase('intro'); setResult(null); setProgress(0) }}
              className="btn btn-ghost btn-sm" style={{ width:'100%', marginTop:8 }}>
              Retake scan
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
