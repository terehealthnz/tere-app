import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateVitals } from '../../lib/supabase'

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

// ── Signal processing ─────────────────────────────────────────────────────────

function detrend(signal) {
  const mean = signal.reduce((a, b) => a + b, 0) / signal.length
  return signal.map(v => v - mean)
}

function normalise(signal) {
  const mean = signal.reduce((a, b) => a + b, 0) / signal.length
  const std  = Math.sqrt(signal.reduce((a, v) => a + (v - mean) ** 2, 0) / signal.length) || 1
  return signal.map(v => (v - mean) / std)
}

// ── Butterworth IIR bandpass with filtfilt (zero-phase, no distortion) ────────

function butter2(fc, fs, type) {
  const K    = Math.tan(Math.PI * fc / fs)
  const norm = 1 / (1 + K * Math.SQRT2 + K * K)
  const a1   = 2 * (K * K - 1) * norm
  const a2   = (1 - K * Math.SQRT2 + K * K) * norm
  if (type === 'lp') return { b: [K*K*norm, 2*K*K*norm, K*K*norm], a: [1, a1, a2] }
  return { b: [norm, -2*norm, norm], a: [1, a1, a2] }
}

function iirFilter(sig, { b, a }) {
  const out = new Float64Array(sig.length)
  let z1 = 0, z2 = 0
  for (let i = 0; i < sig.length; i++) {
    const x = sig[i]
    out[i] = b[0]*x + z1
    z1 = b[1]*x - a[1]*out[i] + z2
    z2 = b[2]*x - a[2]*out[i]
  }
  return Array.from(out)
}

function filtfilt(sig, filt) {
  // Reflection-pad to suppress edge transients
  const pad    = Math.min(Math.floor(sig.length / 3), 200)
  const padded = [...sig.slice(0, pad).reverse(), ...sig, ...sig.slice(-pad).reverse()]
  const fwd    = iirFilter(padded, filt)
  const bwd    = iirFilter([...fwd].reverse(), filt).reverse()
  return bwd.slice(pad, pad + sig.length)
}

function bandpass(sig, fs, flo, fhi) {
  return filtfilt(filtfilt(sig, butter2(flo, fs, 'hp')), butter2(fhi, fs, 'lp'))
}

// ── Hamming window ────────────────────────────────────────────────────────────

function hammingWindow(signal) {
  const n = signal.length
  return signal.map((v, i) => v * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (n - 1))))
}

// ── DFT magnitude spectrum (zero-padded to next power of 2) ──────────────────

function magnitudeSpectrum(signal, fs) {
  let N = 1
  while (N < signal.length) N *= 2
  const n   = signal.length
  const mag = new Float64Array(N >> 1)
  for (let k = 0; k < N >> 1; k++) {
    let rk = 0, ik = 0
    for (let t = 0; t < n; t++) {
      const a = 2 * Math.PI * k * t / N
      rk += signal[t] * Math.cos(a)
      ik -= signal[t] * Math.sin(a)
    }
    mag[k] = Math.sqrt(rk*rk + ik*ik)
  }
  return { mag, freqRes: fs / N }
}

// Peak index with quadratic interpolation + SNR vs noise floor in band
function spectrumPeak(mag, freqRes, fMin, fMax) {
  const lo = Math.max(1, Math.floor(fMin / freqRes))
  const hi = Math.min(mag.length - 2, Math.ceil(fMax / freqRes))
  let peakIdx = lo, peakVal = 0
  for (let i = lo; i <= hi; i++) {
    if (mag[i] > peakVal) { peakVal = mag[i]; peakIdx = i }
  }
  const y1 = mag[peakIdx - 1], y2 = mag[peakIdx], y3 = mag[peakIdx + 1]
  const delta = (y3 - y1) / (2 * (2*y2 - y1 - y3) || 1)
  let sum = 0
  for (let i = lo; i <= hi; i++) sum += mag[i]
  const snr = sum > 0 ? peakVal / (sum / (hi - lo + 1)) : 0
  return { freq: (peakIdx + delta) * freqRes, snr }
}

// ── Motion rejection — replace bad frames, preserving uniform sampling ────────

function rejectMotion(r, g, b) {
  const n = r.length
  if (n < 3) return { r: [...r], g: [...g], b: [...b] }
  const deltas = g.map((v, i) => i === 0 ? 0 : Math.abs(v - g[i-1]))
  const meanD  = deltas.reduce((a, v) => a + v, 0) / n
  const stdD   = Math.sqrt(deltas.reduce((a, v) => a + (v - meanD)**2, 0) / n)
  const thresh = meanD + 2.5 * stdD
  const mR = r.reduce((a, v) => a + v, 0) / n
  const mG = g.reduce((a, v) => a + v, 0) / n
  const mB = b.reduce((a, v) => a + v, 0) / n
  return {
    r: r.map((v, i) => deltas[i] < thresh ? v : mR),
    g: g.map((v, i) => deltas[i] < thresh ? v : mG),
    b: b.map((v, i) => deltas[i] < thresh ? v : mB),
  }
}

// ── Windowed POS (Wang et al. 2017) — short windows remove illumination drift ──
// Each output sample is computed from its own ~1.6 s window with fresh normalisation.

function windowedPOS(r, g, b, fs) {
  const L = Math.max(Math.round(1.6 * fs), 16)
  const n = r.length
  if (n < L * 2) {
    // Short signal fallback: full-signal z-score POS
    const rN = normalise(r), gN = normalise(g), bN = normalise(b)
    const P = gN.map((v, i) => v - bN[i])
    const Q = rN.map((v, i) => -2*v + gN[i] + bN[i])
    const sP = Math.sqrt(P.reduce((a,v)=>a+v**2,0)/n)||1
    const sQ = Math.sqrt(Q.reduce((a,v)=>a+v**2,0)/n)||1
    return P.map((v,i)=>v+(sP/sQ)*Q[i])
  }
  const out = new Array(n - L).fill(0)
  for (let t = L; t < n; t++) {
    const rw = r.slice(t - L, t), gw = g.slice(t - L, t), bw = b.slice(t - L, t)
    const mR = rw.reduce((a,v)=>a+v,0)/L||1
    const mG = gw.reduce((a,v)=>a+v,0)/L||1
    const mB = bw.reduce((a,v)=>a+v,0)/L||1
    const rN = rw.map(v=>v/mR), gN = gw.map(v=>v/mG), bN = bw.map(v=>v/mB)
    const P = gN.map((v,i)=>v-bN[i])
    const Q = rN.map((v,i)=>-2*v+gN[i]+bN[i])
    const sP = Math.sqrt(P.reduce((a,v)=>a+v**2,0)/L)||1
    const sQ = Math.sqrt(Q.reduce((a,v)=>a+v**2,0)/L)||1
    out[t - L] = P[L-1] + (sP/sQ) * Q[L-1]
  }
  return out
}

// ── Windowed CHROM (De Haan & Jeanne 2013) ───────────────────────────────────

function windowedCHROM(r, g, b, fs) {
  const L = Math.max(Math.round(1.6 * fs), 16)
  const n = r.length
  if (n < L * 2) {
    const rN = normalise(r), gN = normalise(g), bN = normalise(b)
    const S1 = rN.map((v,i)=>3*v-2*gN[i])
    const S2 = rN.map((v,i)=>1.5*v+gN[i]-1.5*bN[i])
    const s1 = Math.sqrt(S1.reduce((a,v)=>a+v**2,0)/n)||1
    const s2 = Math.sqrt(S2.reduce((a,v)=>a+v**2,0)/n)||1
    return S1.map((v,i)=>v+(s1/s2)*S2[i])
  }
  const out = new Array(n - L).fill(0)
  for (let t = L; t < n; t++) {
    const rw = r.slice(t-L,t), gw = g.slice(t-L,t), bw = b.slice(t-L,t)
    const mR = rw.reduce((a,v)=>a+v,0)/L||1
    const mG = gw.reduce((a,v)=>a+v,0)/L||1
    const mB = bw.reduce((a,v)=>a+v,0)/L||1
    const rN = rw.map(v=>v/mR), gN = gw.map(v=>v/mG), bN = bw.map(v=>v/mB)
    const S1 = rN.map((v,i)=>3*v-2*gN[i])
    const S2 = rN.map((v,i)=>1.5*v+gN[i]-1.5*bN[i])
    const s1 = Math.sqrt(S1.reduce((a,v)=>a+v**2,0)/L)||1
    const s2 = Math.sqrt(S2.reduce((a,v)=>a+v**2,0)/L)||1
    out[t - L] = S1[L-1] + (s1/s2) * S2[L-1]
  }
  return out
}

// ── Peak detection HR — counts heartbeat peaks, avoids spectral aliasing ──────

function peakDetectHR(signal, fs) {
  const filtered = bandpass(signal, fs, 0.65, 3.5)
  const minGap = Math.round(fs / 3.5)  // minimum samples between peaks
  const peaks = []
  for (let i = 1; i < filtered.length - 1; i++) {
    if (filtered[i] > filtered[i-1] && filtered[i] > filtered[i+1]) {
      if (!peaks.length || i - peaks[peaks.length-1] >= minGap) {
        peaks.push(i)
      } else if (filtered[i] > filtered[peaks[peaks.length-1]]) {
        peaks[peaks.length-1] = i
      }
    }
  }
  if (peaks.length < 5) return null
  const ibis = []
  for (let i = 1; i < peaks.length; i++) ibis.push((peaks[i] - peaks[i-1]) / fs)
  ibis.sort((a,b)=>a-b)
  const med = ibis[Math.floor(ibis.length/2)]
  const good = ibis.filter(v => Math.abs(v - med) < 0.3 * med)
  if (good.length < 4) return null
  const bpm = 60 / (good.reduce((a,v)=>a+v,0)/good.length)
  return bpm >= 40 && bpm <= 210 ? bpm : null
}

// ── HR from spectral peak ─────────────────────────────────────────────────────

function extractHRFromSignal(raw, fs) {
  const filtered = hammingWindow(bandpass(raw, fs, 0.65, 3.5))
  const { mag, freqRes } = magnitudeSpectrum(filtered, fs)
  const { freq, snr }    = spectrumPeak(mag, freqRes, 0.65, 3.5)
  const bpm = freq * 60
  return { bpm: bpm >= 40 && bpm <= 210 ? bpm : null, snr }
}

// ── RR from raw rPPG in respiratory band (separate bandpass, not HR-filtered) ─

function extractRRFromSignal(raw, fs) {
  const filtered = hammingWindow(bandpass(raw, fs, 0.1, 0.5))
  const { mag, freqRes } = magnitudeSpectrum(filtered, fs)
  const { freq, snr }    = spectrumPeak(mag, freqRes, 0.1, 0.5)
  if (snr < 1.5) return null
  const rr = Math.round(freq * 60)
  return rr >= 6 && rr <= 30 ? rr : null
}

// ── Mode of numeric estimates ─────────────────────────────────────────────────

function modeOf(values, binW) {
  if (!values.length) return null
  const bins = {}
  for (const v of values) {
    const k = Math.round(v / binW) * binW
    bins[k] = (bins[k] || 0) + 1
  }
  let bestK = null, bestC = 0
  for (const [k, c] of Object.entries(bins)) {
    if (c > bestC) { bestC = c; bestK = +k }
  }
  const inBin = values.filter(v => Math.abs(v - bestK) <= binW)
  return inBin.reduce((a, v) => a + v, 0) / inBin.length
}

// ── Main analysis ─────────────────────────────────────────────────────────────

function analyzeRPPG(r, g, b, fs) {
  const clean = rejectMotion(r, g, b)
  const N = clean.r.length

  // Windowed POS and CHROM signals (short-window normalisation)
  const posRaw   = windowedPOS(clean.r, clean.g, clean.b, fs)
  const chromRaw = windowedCHROM(clean.r, clean.g, clean.b, fs)

  // Spectral HR estimates
  const posHR   = extractHRFromSignal(posRaw, fs)
  const chromHR = extractHRFromSignal(chromRaw, fs)

  // Peak-detection HR estimates (independent of spectral method)
  const posPeak   = peakDetectHR(posRaw, fs)
  const chromPeak = peakDetectHR(chromRaw, fs)

  // Sliding-window spectral estimates for additional votes
  const winLen = Math.min(Math.floor(N * 0.5), Math.round(12 * fs))
  const step   = Math.max(1, Math.floor(winLen / 3))
  const hrEsts = []
  for (let start = 0; start + winLen <= N; start += step) {
    const rw = clean.r.slice(start, start + winLen)
    const gw = clean.g.slice(start, start + winLen)
    const bw = clean.b.slice(start, start + winLen)
    const pw = windowedPOS(rw, gw, bw, fs)
    const cw = windowedCHROM(rw, gw, bw, fs)
    for (const sig of [pw, cw]) {
      const { bpm, snr } = extractHRFromSignal(sig, fs)
      if (bpm && snr > 1.5) hrEsts.push(bpm)
    }
  }

  // Full-signal spectral (extra weight — push twice)
  if (posHR.bpm   && posHR.snr   > 1.5) hrEsts.push(posHR.bpm,   posHR.bpm)
  if (chromHR.bpm && chromHR.snr > 1.5) hrEsts.push(chromHR.bpm, chromHR.bpm)

  // Peak detection estimates (direct IBI — most accurate when SNR allows)
  if (posPeak)   hrEsts.push(posPeak,   posPeak,   posPeak)   // peak gets 3× weight
  if (chromPeak) hrEsts.push(chromPeak, chromPeak, chromPeak)

  const hrMode = modeOf(hrEsts, 3)
  const hr = hrMode !== null ? Math.round(hrMode) : null

  const bestRaw = chromHR.snr >= posHR.snr ? chromRaw : posRaw
  const rr      = extractRRFromSignal(bestRaw, fs)

  const maxSnr  = Math.max(posHR.snr, chromHR.snr)
  const quality = maxSnr > 3 ? 'good' : maxSnr > 1.5 ? 'fair' : 'poor'
  return { hr, rr, quality }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Vitals() {
  const consultationId = sessionStorage.getItem('consultationId')
  const navigate = useNavigate()

  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const streamRef   = useRef(null)
  const faceMeshRef = useRef(null)
  const samplesRef  = useRef({ r: [], g: [], b: [] })
  const animFrameRef= useRef(null)
  const startTimeRef= useRef(null)
  const tsRef       = useRef([])   // frame timestamps for actual-fps measurement

  const [phase, setPhase]   = useState('intro')    // intro | permission | scanning | result | manual | done
  const [progress, setProgress] = useState(0)       // 0–100
  const [result, setResult] = useState(null)         // { hr, rr, quality }
  const [manual, setManual] = useState({ spo2: '', bp_sys: '', bp_dia: '' })
  const [error, setError]   = useState(null)
  const [saving, setSaving] = useState(false)
  const [scanHint, setScanHint] = useState(null)  // null | 'dark' | 'move' | 'good'
  const lastGRef = useRef(null)

  // ── MediaPipe FaceLandmarker (tasks-vision) setup ──────────────────────
  // Swapped from @mediapipe/face_mesh (which hangs on WASM asset load) to the
  // newer @mediapipe/tasks-vision FaceLandmarker. Wrapped so callers keep the
  // familiar .send({image}) shape and the results callback still fires with
  // { multiFaceLandmarks }.
  const setupFaceMesh = useCallback(async () => {
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    )
    const landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    })
    const mesh = {
      async send({ image }) {
        try {
          const r = landmarker.detect(image)
          onFaceMeshResults({ multiFaceLandmarks: r?.faceLandmarks || [] })
        } catch {}
      },
      close() { try { landmarker.close() } catch {} },
    }
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

    // ── Sample pixels FIRST (before any guide drawing touches the canvas) ────
    const pixel = ctx.getImageData(roiX, roiY, roiW, roiH)
    let rv = 0, gv = 0, bv = 0
    const nPx = pixel.data.length / 4
    for (let i = 0; i < pixel.data.length; i += 4) {
      rv += pixel.data[i]; gv += pixel.data[i+1]; bv += pixel.data[i+2]
    }
    const meanR = rv / nPx
    const meanG = gv / nPx
    const meanB = bv / nPx
    samplesRef.current.r.push(meanR)
    samplesRef.current.g.push(meanG)
    samplesRef.current.b.push(meanB)
    tsRef.current.push(Date.now())

    // ── Draw guide AFTER sampling ─────────────────────────────────────────────
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
    ctx.font = '13px sans-serif'
    ctx.fillStyle = faceInCircle ? 'rgba(11,110,118,0.9)' : 'rgba(220,38,38,0.9)'
    ctx.textAlign = 'center'
    ctx.fillText(faceInCircle ? 'Hold still' : 'Move face into circle', centerX, centerY + radius + 20)
    ctx.strokeStyle = 'rgba(11,110,118,0.6)'
    ctx.lineWidth = 2
    ctx.strokeRect(roiX, roiY, roiW, roiH)

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
      tsRef.current = []
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
    cancelAnimationFrame(animFrameRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())

    const { r, g, b } = samplesRef.current
    if (r.length < 100) {
      setError('Not enough data — please try again and keep still during the scan.')
      setPhase('intro')
      return
    }

    // Measure actual capture rate from timestamps (requestAnimationFrame ≠ 30 fps)
    const ts = tsRef.current
    const actualFs = ts.length > 1
      ? (ts.length - 1) / ((ts[ts.length - 1] - ts[0]) / 1000)
      : SAMPLE_RATE_HZ

    const { hr, rr, quality } = analyzeRPPG(r, g, b, actualFs)
    setResult({ hr, rr, quality })
    setPhase('result')
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateVitals(consultationId, {
        hr:     result?.hr || null,
        rr:     result?.rr || null,
        spo2:   manual.spo2   ? parseInt(manual.spo2)   : null,
        bp_sys: manual.bp_sys ? parseInt(manual.bp_sys) : null,
        bp_dia: manual.bp_dia ? parseInt(manual.bp_dia) : null,
        source: 'tere_rppg',
      })
      navigate('/waiting')
    } catch (err) {
      setError('Failed to save vitals. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const skipVitals = async () => {
    setSaving(true)
    try {
      await updateVitals(consultationId, { skipped: true })
    } catch {}
    navigate('/waiting')
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
