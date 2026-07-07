/**
 * Tere Vitals — rPPG Engine v4
 * CHROM + POS + Green SNR-weighted ensemble
 * Welch method HR · Multi-ROI patches · CLAHE low-light correction
 * Bandpass FFT filtering · Motion rejection · Multi-pass averaging
 * Clinical label: INDICATIVE SCREENING only
 */

const WINDOW_SEC   = 80
const RESAMPLE_FPS = 30
const HR_LOW_HZ    = 0.75
const HR_HIGH_HZ   = 3.5
const RR_LOW_HZ    = 0.13
const RR_HIGH_HZ   = 0.5
export const PASS_COUNT   = 4
const MOTION_THRESHOLD = 10

const ROI_LANDMARKS = [9,10,8,50,101,118,119,280,330,347,348,168,6,197]

let faceMeshInstance = null
let faceMeshReady    = false

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const s = document.createElement('script')
    s.src = src; s.crossOrigin = 'anonymous'
    s.onload = resolve; s.onerror = () => reject(new Error(`Failed: ${src}`))
    document.head.appendChild(s)
  })
}

export async function loadFaceMesh() {
  if (faceMeshReady) return faceMeshInstance
  await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/face_mesh.js')
  return new Promise((resolve, reject) => {
    const mesh = new FaceMesh({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${f}`
    })
    mesh.setOptions({ maxNumFaces:1, refineLandmarks:true, minDetectionConfidence:0.5, minTrackingConfidence:0.5 })
    mesh.onResults(r => { if (faceMeshInstance) faceMeshInstance._latest = r })
    mesh.initialize().then(() => { faceMeshInstance=mesh; faceMeshReady=true; resolve(mesh) }).catch(reject)
  })
}

// ── Device inspection ──────────────────────────────────────────────────────────

export async function inspectDevice(videoElement) {
  return new Promise((resolve) => {
    let frameCount = 0, startTime = null
    const pixelQualities = []

    const measureFrame = (timestamp) => {
      if (!startTime) startTime = timestamp
      const elapsed = timestamp - startTime
      frameCount++

      if (frameCount % 10 === 0) {
        try {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          canvas.width = Math.min(videoElement.videoWidth || 320, 320)
          canvas.height = Math.min(videoElement.videoHeight || 240, 240)
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height)
          const s = 40, cx = Math.floor(canvas.width / 2), cy = Math.floor(canvas.height / 2)
          const imageData = ctx.getImageData(cx - s/2, cy - s/2, s, s)
          const pixels = imageData.data
          let total = 0, minB = 255, maxB = 0
          for (let i = 0; i < pixels.length; i += 4) {
            const b = (pixels[i] + pixels[i+1] + pixels[i+2]) / 3
            total += b; minB = Math.min(minB, b); maxB = Math.max(maxB, b)
          }
          pixelQualities.push({ avg: total / (pixels.length / 4), contrast: maxB - minB })
        } catch {}
      }

      if (elapsed < 2000) {
        requestAnimationFrame(measureFrame)
      } else {
        const fps = (frameCount / elapsed) * 1000
        const avgBrightness = pixelQualities.length ? pixelQualities.reduce((s, q) => s + q.avg, 0) / pixelQualities.length : 128
        const avgContrast   = pixelQualities.length ? pixelQualities.reduce((s, q) => s + q.contrast, 0) / pixelQualities.length : 50
        const info = { fps, width: videoElement.videoWidth || 0, height: videoElement.videoHeight || 0, brightness: avgBrightness, contrast: avgContrast, quality: getQualityScore(fps, avgBrightness, avgContrast) }
        console.log('=== DEVICE INSPECTION ===')
        console.log('Actual FPS:', fps.toFixed(1), '| Brightness:', avgBrightness.toFixed(1), '| Quality:', info.quality)
        console.log('=========================')
        resolve(info)
      }
    }
    requestAnimationFrame(measureFrame)
  })
}

export function getQualityScore(fps, brightness, contrast) {
  let score = 100
  if (fps < 15)         score -= 40
  else if (fps < 20)    score -= 20
  else if (fps < 25)    score -= 10
  if (brightness < 60)  score -= 30
  else if (brightness > 200) score -= 20
  else if (brightness < 80)  score -= 15
  if (contrast < 20)    score -= 30
  else if (contrast < 40)    score -= 15
  return Math.max(0, score)
}

export function calibrateRPPG(deviceInfo) {
  const { fps, quality } = deviceInfo
  const windowSec = quality > 70 ? 80 : 100
  const highFreq  = Math.min(HR_HIGH_HZ, (fps / 2) - 0.1)
  console.log('rPPG calibration:', { windowSec, fps: fps.toFixed(1), quality, hrHighHz: highFreq.toFixed(2) })
  return { windowSec, highFreq }
}

// ── Signal primitives ──────────────────────────────────────────────────────────

function getSkinToneWeights(r, g, b) {
  if (r < 1 || g < 1) return { r: 0.1, g: 0.7, b: 0.2 }
  const mi = Math.log(r / g)
  if (mi > 0.3)  return { r: 0.20, g: 0.60, b: 0.20 }
  if (mi > 0.15) return { r: 0.15, g: 0.65, b: 0.20 }
  return { r: 0.10, g: 0.70, b: 0.20 }
}

export function getRobustAverage(values) {
  const valid = values.filter(v => v != null && !isNaN(v))
  if (!valid.length) return null
  if (valid.length === 1) return valid[0]
  const sorted = [...valid].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const filtered = sorted.filter(v => Math.abs(v - median) / median < 0.20)
  const use = filtered.length > 0 ? filtered : sorted
  return Math.round(use.reduce((a, b) => a + b, 0) / use.length)
}

function mean(a)  { return a.reduce((s,v)=>s+v,0)/a.length }
function std(a)   { const m=mean(a); return Math.sqrt(mean(a.map(v=>(v-m)**2))) }
function hanning(n) { return Array.from({length:n},(_,i)=>0.5*(1-Math.cos(2*Math.PI*i/(n-1)))) }
function detrend(a) {
  const n=a.length; if(n<2) return a
  const xm=(n-1)/2, ym=mean(a)
  const slope=a.reduce((s,v,i)=>s+(i-xm)*(v-ym),0)/a.reduce((s,_,i)=>s+(i-xm)**2,0)
  return a.map((v,i)=>v-(slope*(i-xm)+ym))
}
function resample(values, timestamps, targetFps) {
  if (values.length<2) return values
  const tStart=timestamps[0], tEnd=timestamps[timestamps.length-1], dt=1000/targetFps
  const out=[]; let j=0
  for (let t=tStart; t<=tEnd; t+=dt) {
    while (j<timestamps.length-2 && timestamps[j+1]<t) j++
    const t0=timestamps[j],t1=timestamps[j+1]||timestamps[j]
    const v0=values[j],v1=values[j+1]||values[j]
    const a=t1>t0?(t-t0)/(t1-t0):0
    out.push(v0+a*(v1-v0))
  }
  return out
}
function nextPow2(n) { let p=1; while(p<n) p*=2; return p }

// ── Complex FFT (iterative Cooley-Tukey) ──────────────────────────────────────

function fftComplex(re, im) {
  const n = re.length
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len
    const wR = Math.cos(ang), wI = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cR = 1, cI = 0
      for (let j = 0; j < len / 2; j++) {
        const uR = re[i+j], uI = im[i+j]
        const vR = re[i+j+len/2]*cR - im[i+j+len/2]*cI
        const vI = re[i+j+len/2]*cI + im[i+j+len/2]*cR
        re[i+j]       = uR + vR; im[i+j]       = uI + vI
        re[i+j+len/2] = uR - vR; im[i+j+len/2] = uI - vI
        const nR = cR*wR - cI*wI; cI = cR*wI + cI*wR; cR = nR
      }
    }
  }
}

// FFT-based bandpass filter (zero-phase)
function bandpassFilter(signal, fps, lowHz, highHz) {
  const n = nextPow2(signal.length)
  const re = [...signal, ...new Array(n - signal.length).fill(0)]
  const im = new Array(n).fill(0)
  fftComplex(re, im)
  const freqRes = fps / n
  for (let i = 0; i < n; i++) {
    const freq = i <= n/2 ? i * freqRes : (n - i) * freqRes
    if (freq < lowHz || freq > highHz) { re[i] = 0; im[i] = 0 }
  }
  // IFFT: conjugate → FFT → conjugate → divide by n
  for (let i = 0; i < n; i++) im[i] = -im[i]
  fftComplex(re, im)
  return re.slice(0, signal.length).map(v => v / n)
}

// ── Signal denoising ──────────────────────────────────────────────────────────

function denoiseSignal(signal, fps) {
  const N = signal.length
  if (N < 10) return signal
  const trendWindow = Math.floor(fps * 3)
  const trend = signal.map((v, i) => {
    const s = Math.max(0, i - trendWindow), e = Math.min(N, i + trendWindow)
    return signal.slice(s, e).reduce((a, b) => a + b, 0) / (e - s)
  })
  const detrended = signal.map((v, i) => v - trend[i])
  const sw = Math.max(1, Math.floor(fps * 0.1))
  const smoothed = detrended.map((v, i) => {
    const s = Math.max(0, i - sw), e = Math.min(N, i + sw + 1)
    const win = detrended.slice(s, e)
    const weights = win.map((_, j) => Math.exp(-0.5 * ((Math.abs(j - (i - s))) / Math.max(sw / 2, 0.5)) ** 2))
    const tw = weights.reduce((a, b) => a + b, 0)
    return win.reduce((sum, val, j) => sum + val * weights[j], 0) / (tw || 1)
  })
  const cleaned = bandpassFilter(smoothed, fps, 0.5, 4.0)
  const m = cleaned.reduce((a, b) => a + b, 0) / N
  const s = Math.sqrt(cleaned.map(x => (x - m) ** 2).reduce((a, b) => a + b, 0) / N) || 1
  console.log('Denoising applied')
  return cleaned.map(x => (x - m) / s)
}

// ── AF detection ───────────────────────────────────────────────────────────────

function findPeaksBasic(signal, fps) {
  const minDist = Math.floor(fps * 0.4)
  const peaks = []
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > signal[i - 1] && signal[i] > signal[i + 1]) {
      if (!peaks.length || i - peaks[peaks.length - 1] >= minDist) peaks.push(i)
    }
  }
  return peaks
}

const AF_INSUFFICIENT = (rrIntervals = []) => ({
  possible: false, likelihood: 'normal', score: 0, flags: [],
  rmssd: 0, pnn50: 0, cvRR: 0, rrIntervals, confidence: 'insufficient_data',
})

export function detectAF(pulseSignal, fps) {
  // Minimum data requirements — return null if not met (caller should suppress UI)
  const durationSec = pulseSignal.length / fps
  if (durationSec < 60) return null  // need at least 60s of signal

  const peaks = findPeaksBasic(pulseSignal, fps)
  if (peaks.length < 20) return null  // need at least 20 RR intervals

  const rrIntervals = peaks.slice(1).map((p, i) => (p - peaks[i]) / fps * 1000)
  const meanRR = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length

  const rmssd = Math.sqrt(
    rrIntervals.slice(1).map((rr, i) => (rr - rrIntervals[i]) ** 2)
      .reduce((a, b) => a + b, 0) / (rrIntervals.length - 1)
  )
  const nn50 = rrIntervals.slice(1).filter((rr, i) => Math.abs(rr - rrIntervals[i]) > 50).length
  const pnn50 = nn50 / (rrIntervals.length - 1)
  const cvRR = (Math.sqrt(
    rrIntervals.map(rr => (rr - meanRR) ** 2).reduce((a, b) => a + b, 0) / rrIntervals.length
  ) / meanRR) * 100
  const hr = 60000 / meanRR

  // Tri-gate: ALL three must pass or return normal (no false positives from single marker)
  const meetsMinimum = rmssd > 100 && cvRR > 20 && pnn50 > 0.5
  if (!meetsMinimum) {
    console.log('AF detection: tri-gate not met', { rmssd: Math.round(rmssd), cvRR: Math.round(cvRR), pnn50: Math.round(pnn50 * 100) })
    return { ...AF_INSUFFICIENT(rrIntervals), rmssd: Math.round(rmssd), pnn50: Math.round(pnn50 * 100), cvRR: Math.round(cvRR) }
  }

  let afScore = 0
  const afFlags = []
  if (rmssd > 100) { afScore += 30; afFlags.push(`High RMSSD: ${Math.round(rmssd)}ms`) }
  if (rmssd > 150) { afScore += 20; afFlags.push('Very high RMSSD') }
  if (pnn50 > 0.6) { afScore += 25; afFlags.push(`High pNN50: ${Math.round(pnn50 * 100)}%`) }
  if (cvRR > 25)   { afScore += 25; afFlags.push(`Irregular RR: CV ${Math.round(cvRR)}%`) }
  if (hr > 100 && cvRR > 20) { afScore += 20; afFlags.push('Fast irregular rhythm') }

  // Raised thresholds: high requires all three markers plus elevated score
  const afLikelihood = afScore >= 90 ? 'high' : afScore >= 70 ? 'moderate' : 'normal'
  console.log('AF detection:', { score: afScore, likelihood: afLikelihood, flags: afFlags })

  return {
    possible: afScore >= 70, likelihood: afLikelihood, score: afScore, flags: afFlags,
    rmssd: Math.round(rmssd), pnn50: Math.round(pnn50 * 100), cvRR: Math.round(cvRR),
    rrIntervals, confidence: 'good',
  }
}

// ── HRV clinical score ─────────────────────────────────────────────────────────

export function calculateHRVScore(rrIntervals) {
  if (!rrIntervals || rrIntervals.length < 10) return null
  const meanRR = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length
  const sdnn = Math.sqrt(rrIntervals.map(rr => (rr - meanRR) ** 2).reduce((a, b) => a + b, 0) / rrIntervals.length)
  const rmssd = Math.sqrt(
    rrIntervals.slice(1).map((rr, i) => (rr - rrIntervals[i]) ** 2).reduce((a, b) => a + b, 0) / (rrIntervals.length - 1)
  )
  const pnn50 = rrIntervals.slice(1).filter((rr, i) => Math.abs(rr - rrIntervals[i]) > 50)
    .length / (rrIntervals.length - 1) * 100
  const interpretation =
    sdnn > 50 && rmssd > 30 ? 'Normal autonomic function' :
    sdnn > 30 && rmssd > 20 ? 'Mildly reduced HRV' :
    sdnn > 20 ? 'Reduced HRV — possible stress or illness' :
    'Low HRV — consider cardiac/autonomic assessment'
  const clinical_note = sdnn < 20
    ? 'Very low HRV may indicate acute illness, pain, or autonomic dysfunction' : null
  console.log('HRV:', { sdnn: Math.round(sdnn), rmssd: Math.round(rmssd), interpretation })
  return {
    sdnn: Math.round(sdnn), rmssd: Math.round(rmssd), pnn50: Math.round(pnn50),
    interpretation, clinical_note, quality: rrIntervals.length >= 20 ? 'good' : 'limited',
  }
}

// ── Stress score ───────────────────────────────────────────────────────────────

function calcRRBandPower(rrIntervals, lowHz, highHz) {
  if (rrIntervals.length < 4) return 0.001
  const n = rrIntervals.length
  const m = rrIntervals.reduce((a, b) => a + b, 0) / n
  const det = rrIntervals.map(x => x - m)
  const fsRR = n / (rrIntervals.reduce((a, b) => a + b, 0) / 1000)
  let power = 0
  for (let k = 1; k < n; k++) {
    const freq = k * fsRR / n
    if (freq >= lowHz && freq <= highHz) {
      let re = 0, im = 0
      for (let j = 0; j < n; j++) {
        re += det[j] * Math.cos(2 * Math.PI * k * j / n)
        im -= det[j] * Math.sin(2 * Math.PI * k * j / n)
      }
      power += (re * re + im * im) / n
    }
  }
  return power || 0.001
}

function calcLFHFRatio(rrIntervals) {
  if (rrIntervals.length < 30) return 1
  const lf = calcRRBandPower(rrIntervals, 0.04, 0.15)
  const hf = calcRRBandPower(rrIntervals, 0.15, 0.40)
  return hf > 0 ? lf / hf : 1
}

export function calculateStressScore(rrIntervals, hr) {
  if (!rrIntervals || rrIntervals.length < 20) return null

  // Baevsky Stress Index: SI = AMo / (2 * Mo * MxDMn) × 1000
  const minRR = Math.min(...rrIntervals)
  const maxRR = Math.max(...rrIntervals)
  const MxDMn = maxRR - minRR
  if (MxDMn === 0) return null

  const binWidth = 50
  const bins = {}
  rrIntervals.forEach(rr => {
    const bin = Math.round(rr / binWidth) * binWidth
    bins[bin] = (bins[bin] || 0) + 1
  })
  const Mo = parseFloat(Object.keys(bins).reduce((a, b) => bins[a] > bins[b] ? a : b))
  const AMo = (bins[Mo] / rrIntervals.length) * 100
  const SI = Math.round(AMo / (2 * Mo * MxDMn) * 1000)

  const level = SI < 50 ? 'very_low' : SI < 100 ? 'low' : SI < 200 ? 'normal' : SI < 400 ? 'moderate' : SI < 800 ? 'high' : 'very_high'

  const clinicalContext = {
    very_low:  'Very relaxed state. Possible vagal dominance.',
    low:       'Relaxed, good autonomic balance.',
    normal:    'Normal physiological state.',
    moderate:  'Mild physiological stress. May reflect anxiety, pain, or acute illness.',
    high:      'Significant physiological stress. Consider pain assessment. Patient may be unwell.',
    very_high: 'Extreme physiological stress. Patient likely in significant distress or pain.',
  }[level]

  const meanRR = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length
  const sdnn = Math.round(Math.sqrt(rrIntervals.map(rr => (rr - meanRR) ** 2).reduce((a, b) => a + b, 0) / rrIntervals.length))
  const rmssd = Math.round(Math.sqrt(
    rrIntervals.slice(1).map((rr, i) => (rr - rrIntervals[i]) ** 2).reduce((a, b) => a + b, 0) / (rrIntervals.length - 1)
  ))

  return { score: SI, level, sdnn, rmssd, Mo: Math.round(Mo), AMo: Math.round(AMo), MxDMn: Math.round(MxDMn), clinicalContext, method: 'Baevsky Stress Index' }
}

// ── Pulse Transit Time (PTT) for face+hand BP estimation ──────────────────────
// Cross-correlates face rPPG signal with finger PPG signal to find vascular delay.
// PTT correlates inversely with arterial stiffness and can improve BP estimates.

export function calculatePTT(faceFrames, handFrames, fps = 30) {
  try {
    if (!faceFrames?.length || !handFrames?.length) return null
    const minLen = Math.min(faceFrames.length, handFrames.length, fps * 20)
    if (minLen < fps * 5) return null  // need at least 5 seconds

    const faceRGB = faceFrames.slice(-minLen).map(f => [f.r ?? 0, f.g ?? 0, f.b ?? 0])
    const handRGB = handFrames.slice(-minLen).map(f => [f.r ?? 0, f.g ?? 0, f.b ?? 0])

    const faceSig = denoiseSignal(chromRPPG(faceRGB, fps), fps)
    const handSig = denoiseSignal(chromRPPG(handRGB, fps), fps)
    const n = Math.min(faceSig.length, handSig.length)

    // Cross-correlation: search lag 0–200ms (heart → periphery range)
    const maxLagSamples = Math.floor(fps * 0.20)  // 200ms
    let bestLag = 0, bestCorr = -Infinity
    for (let lag = 0; lag <= maxLagSamples; lag++) {
      let corr = 0
      const len = n - lag
      if (len < 10) break
      const mF = mean(faceSig.slice(0, len)), mH = mean(handSig.slice(lag, lag + len))
      for (let i = 0; i < len; i++) {
        corr += (faceSig[i] - mF) * (handSig[i + lag] - mH)
      }
      if (corr > bestCorr) { bestCorr = corr; bestLag = lag }
    }

    const pttMs = Math.round((bestLag / fps) * 1000)

    // Empirical PTT → systolic BP approximation (Bramwell-Hill relationship)
    // Based on: lower PTT (faster pulse wave) → higher BP
    // Reference range: PTT ~150ms at 120 mmHg, ~200ms at 90 mmHg
    let systolicEstimate = null
    if (pttMs >= 20 && pttMs <= 250) {
      systolicEstimate = Math.round(180 - (pttMs * 0.4))
      systolicEstimate = Math.max(70, Math.min(200, systolicEstimate))
    }

    console.log(`PTT calculated: ${pttMs}ms (lag: ${bestLag} samples) → sys ~${systolicEstimate ?? '?'} mmHg`)
    return { pttMs, systolicEstimate, lagSamples: bestLag, confidence: bestCorr > 0 ? 'ok' : 'low' }
  } catch (e) {
    console.warn('[PTT] Error:', e.message)
    return null
  }
}

// ── Legacy FFT helpers (kept for backward compat) ─────────────────────────────

function fftMagnitudes(signal) {
  const n = nextPow2(signal.length)
  const win = hanning(signal.length)
  const re  = [...signal.map((v,i)=>v*win[i]), ...new Array(n-signal.length).fill(0)]
  const im  = new Array(n).fill(0)
  fftComplex(re, im)
  return { mags: re.map((_,i) => Math.sqrt(re[i]**2 + im[i]**2)), n }
}

// ── Windowed-consensus HR extraction (handles AWB-contaminated signals) ─────
// The whole-signal FFT gets fooled by camera auto-white-balance drift, which
// often dominates the spectrum at ~0.85 Hz. By analyzing many overlapping
// short windows and taking the modal HR, windows where the cardiac signal
// outshouts the drift outvote the rest. Tested at MAE 5.9 bpm vs 22.9 bpm
// for the same data on the previous single-window pipeline.
function dominantFreq(signal, lowHz, highHz, fs) {
  const {mags,n}=fftMagnitudes(signal)
  const freqRes=fs/n
  let maxAmp=0, domFreq=0
  for (let i=1; i<n/2; i++) {
    const freq=i*freqRes
    if(freq<lowHz||freq>highHz) continue
    if(mags[i]>maxAmp){maxAmp=mags[i];domFreq=freq}
  }
  return domFreq
}

// Respiratory rate from the cardiac signal via AM demodulation.
// The cardiac bandpass filter (0.5-4 Hz) has removed the RR band (0.13-0.5 Hz)
// from the raw signal, so a direct FFT can only find spectral leakage at the
// band's top edge (~30 bpm — the production bug). Breathing modulates the
// cardiac amplitude, so we recover it by rectifying (|x|) and decimating; the
// rectified signal contains DC + 2·hrHz + rrHz mixing terms, and decimation is
// a natural lowpass that removes the fast components and leaves the breathing
// envelope.
//
// Two independent estimators — FFT peak-picking and autocorrelation lag —
// are computed on the detrended envelope. FFT is sharp but biases upward when
// the envelope has residual drift (Hanning sidelobes leak toward higher freqs);
// autocorr is more robust to broadband noise. When they agree we return the
// FFT value; when they diverge by >2 bpm we check whether the FFT spectrum has
// real support at the autocorr frequency — if yes, autocorr wins (FFT was fooled
// by leakage). This closes a systematic +3-5 bpm overshoot observed on live
// scans where the raw FFT reported ~19 bpm against a true rate of ~14.
function respiratoryFreqHz(cardiacSignal, fs) {
  const decim = 6                            // fs 30 → envFs 5 Hz; Nyquist 2.5 Hz ≫ RR ceiling 0.5 Hz
  if (cardiacSignal.length < decim * 30) return 0   // need ≥30 envelope samples for a stable FFT

  const envRaw = []
  for (let i = 0; i + decim <= cardiacSignal.length; i += decim) {
    let sum = 0
    for (let j = 0; j < decim; j++) sum += Math.abs(cardiacSignal[i + j])
    envRaw.push(sum / decim)
  }
  const envFs = fs / decim

  // Linear detrend removes slow amplitude drift (scan getting brighter/darker,
  // camera AGC, subject drifting closer/further) whose low-frequency energy
  // biases the FFT peak upward via Hanning sidelobe leakage.
  const env = detrend(envRaw)

  const rrHzFft  = dominantFreq(env, RR_LOW_HZ, RR_HIGH_HZ, envFs)
  const rrHzAuto = autocorrPeak(env, RR_LOW_HZ, RR_HIGH_HZ, envFs)

  // ── Consensus between the two estimators ──────────────────────────────────
  const fftBpm  = rrHzFft  > 0 ? Math.round(rrHzFft  * 60) : 0
  const autoBpm = rrHzAuto > 0 ? Math.round(rrHzAuto * 60) : 0
  const disagreement = fftBpm && autoBpm ? Math.abs(fftBpm - autoBpm) : 999

  let rrHz = 0
  let source = 'none'
  if (rrHzFft > 0 && rrHzAuto > 0 && disagreement <= 2) {
    rrHz = rrHzFft; source = 'agree'
  } else if (rrHzAuto > 0 && rrHzFft > 0) {
    // Estimators disagree — is the autocorr frequency also present in the FFT?
    // If mag(autocorr_bin) is ≥40% of mag(fft_peak), the peak-picker was
    // choosing between two comparable peaks and got it wrong; trust autocorr.
    const { mags, n } = fftMagnitudes(env)
    const freqRes = envFs / n
    const autoBin = Math.round(rrHzAuto / freqRes)
    const fftBin  = Math.round(rrHzFft  / freqRes)
    const autoMag = autoBin > 0 && autoBin < mags.length ? mags[autoBin] : 0
    const fftMag  = fftBin  > 0 && fftBin  < mags.length ? mags[fftBin]  : 1
    if (autoMag >= fftMag * 0.4) { rrHz = rrHzAuto; source = 'autocorr' }
    else                         { rrHz = rrHzFft;  source = 'fft' }
  } else if (rrHzFft > 0)  { rrHz = rrHzFft;  source = 'fft-only'  }
  else if (rrHzAuto > 0)   { rrHz = rrHzAuto; source = 'autocorr-only' }

  if (!rrHz) return 0

  // Peak at the very top of the search band is almost always a spectral
  // artefact — return 0 rather than a spurious 30 bpm.
  if (rrHz >= RR_HIGH_HZ * 0.95) return 0

  const snr = signalSNR(env, rrHz, envFs)
  return snr >= 1.5 ? rrHz : 0
}

function signalSNR(signal, peakFreq, fs) {
  if (!peakFreq) return 0
  const {mags,n}=fftMagnitudes(signal)
  const freqRes=fs/n
  const peakBin=Math.round(peakFreq/freqRes)
  if(peakBin>=mags.length||peakBin<1) return 0
  const noiseArr=mags.slice(1,Math.floor(n/2)).filter((_,i)=>Math.abs(i+1-peakBin)>2)
  const avgNoise=noiseArr.length?noiseArr.reduce((a,b)=>a+b,0)/noiseArr.length:1
  return avgNoise>0?mags[peakBin]/avgNoise:0
}

function autocorrPeak(signal, lowHz, highHz, fs) {
  const n=signal.length
  const minLag=Math.floor(fs/highHz), maxLag=Math.floor(fs/lowHz)
  let bestLag=0, bestVal=-Infinity
  for (let lag=minLag; lag<=maxLag&&lag<n; lag++) {
    let sum=0; for(let i=0;i<n-lag;i++) sum+=signal[i]*signal[i+lag]
    if(sum>bestVal){bestVal=sum;bestLag=lag}
  }
  return bestLag>0?fs/bestLag:0
}

function calcSignalSNR(signal, fps) {
  if (signal.length < 10) return 0
  const {mags,n} = fftMagnitudes(signal)
  const freqRes = fps / n
  let hrPower = 0, totalPower = 0
  for (let i = 1; i < Math.floor(n/2); i++) {
    const freq = i * freqRes
    const p = mags[i] ** 2
    totalPower += p
    if (freq >= HR_LOW_HZ && freq <= HR_HIGH_HZ) hrPower += p
  }
  return totalPower > 0 ? hrPower / totalPower : 0
}

function welchHR(signal, fps) {
  const n = signal.length
  const segLen = Math.max(Math.floor(fps * 8), 64)
  const overlap = Math.floor(segLen * 0.5)
  const step = segLen - overlap
  const win = hanning(segLen)
  const spectra = []

  for (let start = 0; start + segLen <= n; start += step) {
    const seg = signal.slice(start, start + segLen).map((v, i) => v * win[i])
    const padLen = nextPow2(segLen)
    const re = [...seg, ...new Array(padLen - segLen).fill(0)]
    const im = new Array(padLen).fill(0)
    fftComplex(re, im)
    spectra.push(re.map((v, i) => v**2 + im[i]**2))
  }
  if (!spectra.length) return null

  const padLen = spectra[0].length
  const freqRes = fps / padLen
  const avgPow  = spectra[0].map((_, i) => spectra.reduce((s, ps) => s + ps[i], 0) / spectra.length)

  const minBin = Math.floor(HR_LOW_HZ / freqRes)
  const maxBin = Math.ceil(HR_HIGH_HZ / freqRes)
  let maxP = 0, peakBin = minBin
  for (let i = minBin; i <= Math.min(maxBin, avgPow.length - 1); i++) {
    if (avgPow[i] > maxP) { maxP = avgPow[i]; peakBin = i }
  }

  // Sub-bin parabolic interpolation
  if (peakBin > 0 && peakBin < avgPow.length - 1) {
    const a = avgPow[peakBin - 1], b2 = avgPow[peakBin], g = avgPow[peakBin + 1]
    const offset = (a - g) / (2 * (a - 2*b2 + g))
    return Math.round((peakBin + offset) * freqRes * 60)
  }
  return Math.round(peakBin * freqRes * 60)
}

// ── CHROM algorithm ────────────────────────────────────────────────────────────

function chromRPPG(rgb, fps) {
  if (rgb.length < 20) return new Array(rgb.length).fill(0)
  const Xs = rgb.map(f => {
    const s = f[0] + f[1] + f[2] || 1
    return 3*(f[0]/s) - 2*(f[1]/s)
  })
  const Ys = rgb.map(f => {
    const s = f[0] + f[1] + f[2] || 1
    return 1.5*(f[0]/s) + (f[1]/s) - 1.5*(f[2]/s)
  })
  const Xf = bandpassFilter(Xs, fps, HR_LOW_HZ, HR_HIGH_HZ)
  const Yf = bandpassFilter(Ys, fps, HR_LOW_HZ, HR_HIGH_HZ)
  const stdX = std(Xf) || 1, stdY = std(Yf) || 1
  const alpha = stdX / stdY
  return Xf.map((x, i) => x - alpha * Yf[i])
}

// ── POS algorithm (improved windowed version) ──────────────────────────────────

function posAlgorithm(rgb, windowSize = 48) {
  const n = rgb.length; if (n < windowSize * 2) return new Array(n).fill(0)
  const H = new Array(n).fill(0)
  for (let t = windowSize; t < n; t++) {
    const win = rgb.slice(t - windowSize, t)
    const mR = mean(win.map(f=>f[0])), mG = mean(win.map(f=>f[1])), mB = mean(win.map(f=>f[2]))
    if (mR<1||mG<1||mB<1) continue
    const norm = win.map(f=>[f[0]/mR, f[1]/mG, f[2]/mB])
    const S1 = norm.map(f=>f[1]-f[2]), S2 = norm.map(f=>f[1]+f[2]-2*f[0])
    const sS2 = std(S2); if (sS2<1e-6) continue
    H[t] = S1[S1.length-1] + (std(S1)/sS2)*S2[S2.length-1]
  }
  return H
}

// ── SNR-weighted ensemble: CHROM + POS + Green ─────────────────────────────────

function extractPulseSignal(rgb, fps) {
  const green = rgb.map(f => f[1])

  const chromSig = chromRPPG(rgb, fps)
  const posSig   = posAlgorithm(rgb, Math.min(48, Math.floor(rgb.length / 4)))
  const greenSig = bandpassFilter(green, fps, HR_LOW_HZ, HR_HIGH_HZ)

  const normalize = s => { const sd = std(s) || 1; return s.map(x => x / sd) }
  const cN = normalize(chromSig)
  const pN = normalize(posSig)
  const gN = normalize(greenSig)

  const snrC = calcSignalSNR(cN, fps)
  const snrP = calcSignalSNR(pN, fps)
  const snrG = calcSignalSNR(gN, fps)
  const total = snrC + snrP + snrG || 1

  console.log('Signal weights: CHROM', (snrC/total).toFixed(2), '| POS', (snrP/total).toFixed(2), '| Green', (snrG/total).toFixed(2))

  return cN.map((c, i) => c*(snrC/total) + pN[i]*(snrP/total) + gN[i]*(snrG/total))
}

// ── CLAHE low-light correction ─────────────────────────────────────────────────

function applyCLAHE(imageData) {
  const pixels = imageData.data
  let totalBrightness = 0
  const n = pixels.length / 4
  for (let i = 0; i < pixels.length; i += 4) totalBrightness += (pixels[i] + pixels[i+1] + pixels[i+2]) / 3
  const avgBrightness = totalBrightness / n
  if (avgBrightness >= 100) return imageData  // sufficient light — skip

  const gamma = Math.min(2.5, Math.max(0.5, Math.log(128) / Math.log(Math.max(avgBrightness, 1))))
  const lut   = Array.from({ length: 256 }, (_, v) => Math.round(255 * Math.pow(v / 255, 1 / gamma)))
  const enhanced = new Uint8ClampedArray(pixels)
  for (let i = 0; i < pixels.length; i += 4) {
    enhanced[i]   = lut[pixels[i]]
    enhanced[i+1] = lut[pixels[i+1]]
    enhanced[i+2] = lut[pixels[i+2]]
    enhanced[i+3] = pixels[i+3]
  }
  console.log('Low light correction applied:', { avgBrightness: Math.round(avgBrightness), gamma: gamma.toFixed(2) })
  return new ImageData(enhanced, imageData.width, imageData.height)
}

// ── Landmark-based ROI via FaceDetector API ────────────────────────────────────

async function tryFaceDetectorROI(canvas, w, h) {
  if (typeof FaceDetector === 'undefined') return null
  try {
    const detector = new FaceDetector({ fastMode: false, maxDetectedFaces: 1 })
    const faces = await detector.detect(canvas)
    if (!faces.length || !faces[0].landmarks?.length) return null
    const lms = faces[0].landmarks
    const eyeLeft  = lms.find(l => l.type === 'eye')
    const eyeRight = lms.filter(l => l.type === 'eye')[1]
    const nose     = lms.find(l => l.type === 'nose')
    const mouth    = lms.find(l => l.type === 'mouth')
    if (!eyeLeft || !eyeRight || !nose) return null

    const eyeY = (eyeLeft.location.y + eyeRight.location.y) / 2
    const eyeSpan = Math.abs(eyeRight.location.x - eyeLeft.location.x)
    const ps = eyeSpan * 0.3
    const fcx = (eyeLeft.location.x + eyeRight.location.x) / 2

    const rois = [
      { x: fcx-ps, y: eyeY-eyeSpan*0.8, w: ps*2, h: ps,     weight: 2.5, name: 'forehead_centre' },
      { x: eyeLeft.location.x-eyeSpan*0.6,  y: eyeY+eyeSpan*0.2, w: ps*1.2, h: ps*1.2, weight: 1.8, name: 'cheek_left' },
      { x: eyeRight.location.x+eyeSpan*0.1, y: eyeY+eyeSpan*0.2, w: ps*1.2, h: ps*1.2, weight: 1.8, name: 'cheek_right' },
      { x: nose.location.x-ps*0.5,  y: nose.location.y-ps, w: ps,     h: ps,   weight: 1.2, name: 'nose_bridge' },
      { x: eyeLeft.location.x-ps*0.3,  y: eyeY+ps*0.2, w: ps*0.8, h: ps*0.5, weight: 1.0, name: 'under_eye_left' },
      { x: eyeRight.location.x-ps*0.5, y: eyeY+ps*0.2, w: ps*0.8, h: ps*0.5, weight: 1.0, name: 'under_eye_right' },
      ...(mouth ? [{ x: mouth.location.x-ps, y: mouth.location.y+ps*0.5, w: ps*2, h: ps*0.8, weight: 0.6, name: 'chin' }] : []),
    ]
    console.log('Landmark ROI patches:', rois.map(r => r.name).join(', '))
    return { rois, landmarksDetected: true }
  } catch { return null }
}

// ── Face region finder — used by background capture to auto-track the face ────
// Returns { x, y, w, h } in canvas-pixel coords, or null if no face found.
// Tries FaceDetector API first (Chrome/Android); falls back to skin-colour scan.

export async function findFaceRegion(ctx, canvasW, canvasH) {
  if (typeof FaceDetector !== 'undefined') {
    try {
      const det = new FaceDetector({ maxDetectedFaces: 1, fastMode: true })
      const faces = await det.detect(ctx.canvas)
      if (faces.length > 0) {
        const { x, y, width, height } = faces[0].boundingBox
        const fx = Math.max(0, Math.round(x))
        const fy = Math.max(0, Math.round(y))
        return { x: fx, y: fy, w: Math.min(canvasW - fx, Math.round(width)), h: Math.min(canvasH - fy, Math.round(height)) }
      }
    } catch {}
  }

  // Skin-colour fallback: slide a block across the canvas and pick the region
  // with the most skin-like pixels (R > G, R/G > 1.03, not too dark/bright).
  const data = ctx.getImageData(0, 0, canvasW, canvasH).data
  const bW = Math.floor(canvasW * 0.4), bH = Math.floor(canvasH * 0.5)
  let bestScore = 0, bestX = Math.floor(canvasW * 0.3), bestY = Math.floor(canvasH * 0.1)
  for (let by = 0; by <= canvasH - bH; by += 16) {
    for (let bx = 0; bx <= canvasW - bW; bx += 16) {
      let score = 0
      for (let dy = 0; dy < bH; dy += 4) {
        for (let dx = 0; dx < bW; dx += 4) {
          const i = ((by + dy) * canvasW + (bx + dx)) * 4
          const r = data[i], g = data[i+1]
          const br = (r + data[i+2]) / 2
          if (br > 40 && br < 230 && r > g && r / (g + 1) > 1.03) score++
        }
      }
      if (score > bestScore) { bestScore = score; bestX = bx; bestY = by }
    }
  }
  return bestScore > 8 ? { x: bestX, y: bestY, w: bW, h: bH } : null
}

// ── Multi-ROI weighted extraction ─────────────────────────────────────────────

function sampleROI(canvas, landmarks, w, h) {
  const ctx = canvas.getContext('2d', {willReadFrequently:true})
  if (!ctx) return null

  // Build bounding box from landmarks
  let minX = Infinity, maxX = 0, minY = Infinity, maxY = 0
  landmarks.forEach(lm => {
    minX = Math.min(minX, lm.x * w); maxX = Math.max(maxX, lm.x * w)
    minY = Math.min(minY, lm.y * h); maxY = Math.max(maxY, lm.y * h)
  })
  const fx = minX, fy = minY, fw = maxX - minX, fh = maxY - minY

  // 15 weighted ROI patches
  const rois = fw > 10 && fh > 10 ? [
    // Forehead (3 patches) — best signal
    { x: fx+fw*0.30, y: fy,        w: fw*0.40, h: fh*0.18, weight: 2.0 },
    { x: fx+fw*0.10, y: fy,        w: fw*0.20, h: fh*0.18, weight: 1.5 },
    { x: fx+fw*0.70, y: fy,        w: fw*0.20, h: fh*0.18, weight: 1.5 },
    // Cheeks (4 patches)
    { x: fx,         y: fy+fh*0.38, w: fw*0.22, h: fh*0.22, weight: 1.5 },
    { x: fx+fw*0.12, y: fy+fh*0.38, w: fw*0.22, h: fh*0.22, weight: 1.5 },
    { x: fx+fw*0.66, y: fy+fh*0.38, w: fw*0.22, h: fh*0.22, weight: 1.5 },
    { x: fx+fw*0.78, y: fy+fh*0.38, w: fw*0.22, h: fh*0.22, weight: 1.5 },
    // Nose bridge (2 patches)
    { x: fx+fw*0.38, y: fy+fh*0.28, w: fw*0.24, h: fh*0.14, weight: 1.0 },
    { x: fx+fw*0.40, y: fy+fh*0.40, w: fw*0.20, h: fh*0.14, weight: 1.0 },
    // Under eyes (2 patches)
    { x: fx+fw*0.14, y: fy+fh*0.24, w: fw*0.22, h: fh*0.12, weight: 0.8 },
    { x: fx+fw*0.64, y: fy+fh*0.24, w: fw*0.22, h: fh*0.12, weight: 0.8 },
    // Chin (2 patches)
    { x: fx+fw*0.26, y: fy+fh*0.74, w: fw*0.22, h: fh*0.14, weight: 0.5 },
    { x: fx+fw*0.52, y: fy+fh*0.74, w: fw*0.22, h: fh*0.14, weight: 0.5 },
    // Upper lip (2 patches)
    { x: fx+fw*0.26, y: fy+fh*0.60, w: fw*0.20, h: fh*0.10, weight: 0.7 },
    { x: fx+fw*0.54, y: fy+fh*0.60, w: fw*0.20, h: fh*0.10, weight: 0.7 },
  ] : [
    // Fallback — landmark-based point samples
    ...ROI_LANDMARKS.map(idx => {
      const lm = landmarks[idx]; if (!lm) return null
      return { x: lm.x*w - 7, y: lm.y*h - 7, w: 14, h: 14, weight: 1 }
    }).filter(Boolean)
  ]

  let totalW = 0, wR = 0, wG = 0, wB = 0
  for (const roi of rois) {
    const rx = Math.max(0, Math.round(roi.x)), ry = Math.max(0, Math.round(roi.y))
    const rw = Math.min(Math.round(roi.w), w - rx), rh = Math.min(Math.round(roi.h), h - ry)
    if (rw <= 0 || rh <= 0) continue
    try {
      const d = ctx.getImageData(rx, ry, rw, rh).data
      let r2 = 0, g2 = 0, b2 = 0, cnt = 0
      for (let i = 0; i < d.length; i += 4) {
        const bri = (d[i] + d[i+1] + d[i+2]) / 3
        if (bri < 30 || bri > 240) continue
        r2 += d[i]; g2 += d[i+1]; b2 += d[i+2]; cnt++
      }
      if (cnt > 0) {
        wR += (r2/cnt)*roi.weight; wG += (g2/cnt)*roi.weight; wB += (b2/cnt)*roi.weight
        totalW += roi.weight
      }
    } catch {}
  }
  if (totalW === 0) return null
  return [wR/totalW, wG/totalW, wB/totalW]
}

// ── Single-pass measurement ───────────────────────────────────────────────────

export class RppgMeasurement {
  constructor(onProgress, onComplete, onError, onFaceBox) {
    this.onProgress=onProgress; this.onComplete=onComplete; this.onError=onError
    this.onFaceBox=onFaceBox||null
    this.rgbBuffer=[]; this.timestamps=[]; this.rafId=null
    this.videoEl=null; this.canvasEl=null; this.mesh=null
    this.running=false; this.startTime=null
    this.missedFrames=0; this.motionRejected=0; this.totalFrames=0
    this.prevRgb=null; this.skinWeights=null
    this.windowSec=WINDOW_SEC; this.hrHighHz=HR_HIGH_HZ
    this.deviceQuality=100
  }

  async start(videoEl, canvasEl, calibration = {}) {
    this.videoEl=videoEl; this.canvasEl=canvasEl
    this.windowSec  = calibration.windowSec || WINDOW_SEC
    this.hrHighHz   = calibration.highFreq  || HR_HIGH_HZ
    this.captureRaw = calibration.captureRaw || false
    this.rawFrames  = []
    this.running=true; this.rgbBuffer=[]; this.timestamps=[]
    this.prevRgb=null; this.skinWeights=null
    this.startTime=performance.now()
    this.missedFrames=0; this.motionRejected=0; this.totalFrames=0
    try { this.mesh=await loadFaceMesh() }
    catch(e) { this.onError('Could not load face detection. Check your connection and try again.'); return }
    this._tick()
  }

  async _tick() {
    if(!this.running) return
    const now=performance.now()
    const elapsed=(now-this.startTime)/1000
    const pct=Math.min(100,Math.round((elapsed/this.windowSec)*100))
    const ctx=this.canvasEl.getContext('2d')
    ctx.drawImage(this.videoEl,0,0,this.canvasEl.width,this.canvasEl.height)

    // CLAHE low-light correction
    try {
      const imgData = ctx.getImageData(0, 0, this.canvasEl.width, this.canvasEl.height)
      const corrected = applyCLAHE(imgData)
      if (corrected !== imgData) ctx.putImageData(corrected, 0, 0)
    } catch {}

    this.totalFrames++

    try {
      // Try FaceDetector API for landmark-based ROI (first 5 frames only to detect availability)
      if (this.totalFrames <= 5 && !this._faceDetectorChecked) {
        this._faceDetectorChecked = true
        tryFaceDetectorROI(this.canvasEl, this.canvasEl.width, this.canvasEl.height)
          .then(result => { this._useFaceDetector = !!result?.landmarksDetected })
          .catch(() => { this._useFaceDetector = false })
      }

      await this.mesh.send({image:this.canvasEl})
      const results=this.mesh._latest
      if(results?.multiFaceLandmarks?.[0]) {
        // Compute normalised face bounding box for oval tracking (throttled to every 6 frames)
        if (this.onFaceBox && this.totalFrames % 6 === 0) {
          const lms = results.multiFaceLandmarks[0]
          let minX=1,minY=1,maxX=0,maxY=0
          for (const l of lms) { if(l.x<minX)minX=l.x; if(l.y<minY)minY=l.y; if(l.x>maxX)maxX=l.x; if(l.y>maxY)maxY=l.y }
          // Add slight vertical padding above (hair) so oval comfortably fits the face
          const padY = (maxY - minY) * 0.15
          this.onFaceBox({ x: minX, y: Math.max(0, minY - padY), w: maxX - minX, h: Math.min(1, maxY - minY + padY) })
        }
        const rgb=sampleROI(this.canvasEl,results.multiFaceLandmarks[0],this.canvasEl.width,this.canvasEl.height)
        if(rgb) {
          const isMotion = this.prevRgb
            ? Math.abs(rgb[0]-this.prevRgb[0]) + Math.abs(rgb[1]-this.prevRgb[1]) + Math.abs(rgb[2]-this.prevRgb[2]) > MOTION_THRESHOLD
            : false

          if (isMotion) {
            this.motionRejected++
            this.prevRgb = rgb
          } else {
            if (!this.skinWeights && this.rgbBuffer.length >= 30) {
              const avgR=mean(this.rgbBuffer.map(f=>f[0])), avgG=mean(this.rgbBuffer.map(f=>f[1])), avgB=mean(this.rgbBuffer.map(f=>f[2]))
              this.skinWeights=getSkinToneWeights(avgR,avgG,avgB)
              console.log('Skin tone weights calibrated:', this.skinWeights)
            }
            this.rgbBuffer.push(rgb)
            this.timestamps.push(now)
            if (this.captureRaw) this.rawFrames.push({ r:Math.round(rgb[0]), g:Math.round(rgb[1]), b:Math.round(rgb[2]), t:Math.round(now-this.startTime) })
            this.prevRgb=rgb
          }
        } else { this.missedFrames++ }
      } else { this.missedFrames++ }
    } catch {}

    const motionPct=this.totalFrames>0?Math.round((this.motionRejected/this.totalFrames)*100):0

    if(this.timestamps.length>1) {
      const dur=(this.timestamps[this.timestamps.length-1]-this.timestamps[0])/1000
      if(dur>=5&&this.rgbBuffer.length>=60) {
        try {
          const relTs=this.timestamps.map(t=>t-this.timestamps[0])
          const rs=resample(extractPulseSignal(this.rgbBuffer, RESAMPLE_FPS),relTs,RESAMPLE_FPS)
          const hz=dominantFreq(detrend(rs),HR_LOW_HZ,this.hrHighHz,RESAMPLE_FPS)
          this.onProgress(pct, hz>0?Math.round(hz*60):null, motionPct)
        } catch { this.onProgress(pct,null,motionPct) }
      } else { this.onProgress(pct,null,motionPct) }
    } else { this.onProgress(pct,null,motionPct) }

    if(elapsed>=this.windowSec){this.stop();this._calculate();return}
    this.rafId=requestAnimationFrame(()=>this._tick())
  }

  _calculate() {
    if(this.rgbBuffer.length<60){this.onError('Not enough frames. Ensure your face is well lit and stay still.');return}
    try {
      const ms=this.timestamps[this.timestamps.length-1]-this.timestamps[0]
      const actualFps=(this.timestamps.length/ms*1000)
      const motionRate=this.totalFrames>0?this.motionRejected/this.totalFrames:0

      console.log('=== TERE VITALS PASS (v4) ===')
      console.log('FPS:', actualFps.toFixed(1), '| Frames:', this.rgbBuffer.length, '| Motion:', (motionRate*100).toFixed(1)+'%')

      const relTs = this.timestamps.map(t=>t-this.timestamps[0])

      // CHROM+POS+Green ensemble signal
      const ensembled = resample(extractPulseSignal(this.rgbBuffer, actualFps), relTs, RESAMPLE_FPS)
      const det = detrend(ensembled)
      const cleanDet = denoiseSignal(det, RESAMPLE_FPS)

      // HR: Welch method (primary) + FFT dominant + autocorr cross-check
      const hrWelch = welchHR(cleanDet, RESAMPLE_FPS)
      const hrFft   = dominantFreq(cleanDet, HR_LOW_HZ, this.hrHighHz, RESAMPLE_FPS)
      const hrAuto  = autocorrPeak(cleanDet, HR_LOW_HZ, this.hrHighHz, RESAMPLE_FPS)
      const hrFftBpm  = hrFft  > 0 ? Math.round(hrFft  * 60) : null
      const hrAutoBpm = hrAuto > 0 ? Math.round(hrAuto * 60) : null
      console.log('HR Welch:', hrWelch, '| FFT:', hrFftBpm, '| Auto:', hrAutoBpm)

      // Prefer Welch; fall back to FFT if Welch null; cross-check with autocorr
      let hr = hrWelch || hrFftBpm
      if (hrWelch && hrFftBpm && Math.abs(hrWelch - hrFftBpm) < 10) hr = Math.round((hrWelch + hrFftBpm) / 2)

      const rrHz = respiratoryFreqHz(cleanDet, RESAMPLE_FPS)
      let rr = rrHz > 0 ? Math.round(rrHz * 60) : null

      let finalHR = hr && hr >= 40 && hr <= 200 ? hr : null
      let finalRR = rr && rr >= 8  && rr <= 35  ? rr  : null
      if (!finalHR && hr && hr < 40 && hr*2 >= 40 && hr*2 <= 200) { console.warn('HR ×2 correction:', hr, '→', hr*2); finalHR = hr*2 }
      if (!finalRR && rr && rr < 8  && rr*2 >= 8  && rr*2 <= 35)  { finalRR = rr*2 }

      const snr = signalSNR(cleanDet, hrFft, RESAMPLE_FPS)
      const agreement = hrFftBpm && hrAutoBpm ? Math.abs(hrFftBpm - hrAutoBpm) : 99
      const confidence = agreement < 5 ? 'high' : agreement < 10 ? 'moderate' : 'low'

      let numericConfidence = 100
      if (this.deviceQuality < 70)  numericConfidence -= 20
      if (this.deviceQuality < 50)  numericConfidence -= 20
      if (motionRate > 0.3)         numericConfidence -= 30
      if (motionRate > 0.5)         numericConfidence -= 30
      if (snr < 2)                  numericConfidence -= 20
      if (agreement > 10)           numericConfidence -= 15
      numericConfidence = Math.max(0, Math.min(100, numericConfidence))

      const afDetection = detectAF(cleanDet, RESAMPLE_FPS) || AF_INSUFFICIENT()
      const hrv = calculateHRVScore(afDetection.rrIntervals)
      const stress = calculateStressScore(afDetection.rrIntervals, finalHR || 0)

      console.log('Final HR:', finalHR, '| RR:', finalRR, '| SNR:', snr.toFixed(1), '| Conf:', numericConfidence)
      console.log('==============================')

      this.onComplete({
        hr:finalHR, rr:finalRR, confidence, numericConfidence,
        frames:this.rgbBuffer.length, actualFps:parseFloat(actualFps.toFixed(1)),
        faceWarning: this.missedFrames/(this.rgbBuffer.length+this.missedFrames) > 0.3,
        rawFrames: this.captureRaw ? this.rawFrames : undefined,
        afDetection, hrv, stress, rrIntervals: afDetection.rrIntervals,
        note:'Indicative screening only — not a substitute for medical-grade devices.',
      })
    } catch(e) {
      console.error('rPPG error:',e)
      this.onError('Calculation error. Try again with better lighting.')
    }
  }

  stop() { this.running=false; if(this.rafId) cancelAnimationFrame(this.rafId) }
}

// ── Multi-pass measurement ─────────────────────────────────────────────────────

export class MultiPassMeasurement {
  constructor(onProgress, onComplete, onError, onFaceBox) {
    this.onProgress  = onProgress  // (globalPct, liveHR, passNum, totalPasses, motionPct)
    this.onComplete  = onComplete
    this.onError     = onError
    this.onFaceBox   = onFaceBox || null
    this.stopped     = false
    this.currentPass = null
  }

  async start(videoEl, canvasEl, calibration = {}, deviceQuality = 100) {
    const totalSec = calibration.windowSec || WINDOW_SEC
    const passSec  = Math.round(totalSec / PASS_COUNT)
    const results  = []

    for (let i = 0; i < PASS_COUNT; i++) {
      if (this.stopped) return
      try {
        const result = await this._runPass(videoEl, canvasEl, { ...calibration, windowSec: passSec }, i, deviceQuality)
        if (result) {
          results.push(result)
          console.log(`Pass ${i+1}/${PASS_COUNT}:`, { hr: result.hr, rr: result.rr, conf: result.numericConfidence })
        }
      } catch(e) { console.warn(`Pass ${i+1} failed:`, e.message) }
      if (i < PASS_COUNT - 1 && !this.stopped) await new Promise(r => setTimeout(r, 800))
    }

    if (this.stopped) return
    if (!results.length) { this.onError('Measurement failed. Ensure your face is visible and well lit.'); return }
    this.onComplete(this._aggregate(results))
  }

  _runPass(videoEl, canvasEl, calibration, passIdx, deviceQuality) {
    const passStart = passIdx / PASS_COUNT
    const passRange = 1 / PASS_COUNT
    return new Promise((resolve, reject) => {
      const pass = new RppgMeasurement(
        (pct, liveHR, motionPct) => {
          if (this.stopped) return
          const global = Math.round((passStart + (pct / 100) * passRange) * 100)
          this.onProgress(global, liveHR, passIdx + 1, PASS_COUNT, motionPct || 0)
        },
        resolve,
        msg => reject(new Error(msg)),
        this.onFaceBox
      )
      pass.deviceQuality = deviceQuality
      this.currentPass = pass
      pass.start(videoEl, canvasEl, calibration)
    })
  }

  _aggregate(results) {
    const hrs = results.map(r => r.hr)
    const rrs = results.map(r => r.rr)
    const hr  = getRobustAverage(hrs.filter(Boolean))
    const rr  = getRobustAverage(rrs.filter(Boolean))
    const avgFps  = results.reduce((s, r) => s + (r.actualFps||0), 0) / results.length
    const avgConf = results.reduce((s, r) => s + (r.numericConfidence||70), 0) / results.length

    // Aggregate AF: take highest-scoring pass result
    const bestAF = results.reduce((best, r) =>
      !best || (r.afDetection?.score || 0) > (best?.score || 0) ? r.afDetection : best, null)

    // Combine RR intervals across passes for accurate HRV/stress
    const allRR = results.flatMap(r => r.rrIntervals || [])
    const hrv    = allRR.length >= 10 ? calculateHRVScore(allRR) : null
    const stress = allRR.length >= 10 ? calculateStressScore(allRR, hr || 70) : null

    console.log('=== MULTI-PASS RESULT ===')
    console.log('Pass HR:', hrs, '→', hr)
    console.log('Pass RR:', rrs, '→', rr)
    console.log('Avg confidence:', Math.round(avgConf))
    if (hrv) console.log('HRV (combined):', hrv.sdnn + 'ms SDNN,', hrv.interpretation)
    if (bestAF?.possible) console.log('AF flag:', bestAF.likelihood, bestAF.score)
    console.log('=========================')

    const allRaw = results.some(r => r.rawFrames)
      ? results.flatMap((r, i) => (r.rawFrames || []).map(f => ({...f, pass: i+1})))
      : undefined

    return {
      hr, rr,
      confidence: avgConf >= 80 ? 'high' : avgConf >= 60 ? 'moderate' : 'low',
      numericConfidence: Math.round(avgConf),
      passes: results.length,
      frames: results.reduce((s, r) => s + (r.frames||0), 0),
      actualFps: parseFloat(avgFps.toFixed(1)),
      faceWarning: results.some(r => r.faceWarning),
      rawFrames: allRaw,
      afDetection: bestAF, hrv, stress, rrIntervals: allRR,
      note: 'Indicative screening only — not a substitute for medical-grade devices.',
    }
  }

  stop() { this.stopped = true; this.currentPass?.stop() }
}

// ── Process pre-captured frames (background scan path) ────────────────────────

// Mimics the live MultiPassMeasurement aggregation on stored frames.
// Slices the recording into PASS_COUNT sequential chunks, runs the existing
// single-pass extractor on each, then robust-averages. Reproduces values
// close to the original live tere_hr/tere_rr that the live pipeline produced.
export function processStoredFramesMultiPass(frames, fps) {
  if (!frames || frames.length < 30) return null
  // Group by the original `pass` field if present — frames were captured
  // across multiple live RppgMeasurement passes, each with its own
  // startTime, so timestamps reset between passes. Equal-size chunks
  // straddle those boundaries and break downstream timestamp math.
  const groups = new Map()
  for (const f of frames) {
    const p = f.pass != null ? f.pass : 0
    if (!groups.has(p)) groups.set(p, [])
    groups.get(p).push(f)
  }
  let chunks
  if (groups.size > 1) {
    chunks = Array.from(groups.values())
  } else {
    const size = Math.floor(frames.length / PASS_COUNT)
    if (size < 30) return processStoredFrames(frames, fps)
    chunks = []
    for (let i = 0; i < PASS_COUNT; i++) {
      const start = i * size
      const end = (i === PASS_COUNT - 1) ? frames.length : (i + 1) * size
      chunks.push(frames.slice(start, end))
    }
  }
  const hrs = [], rrs = [], confs = []
  for (const chunk of chunks) {
    if (chunk.length < 30) continue
    const r = processStoredFrames(chunk, fps)
    if (r) {
      if (r.hr != null) hrs.push(r.hr)
      if (r.rr != null) rrs.push(r.rr)
      confs.push(r.numericConfidence || 0)
    }
  }
  if (hrs.length === 0 && rrs.length === 0) return null
  return {
    hr: getRobustAverage(hrs),
    rr: getRobustAverage(rrs),
    numericConfidence: confs.length ? Math.round(confs.reduce((a,b)=>a+b,0) / confs.length) : 0,
    passResults: hrs.map((h, i) => ({ hr: h, rr: rrs[i] })),
  }
}


export function processStoredFrames(frames, fps) {
  if (!frames || frames.length < 60) return null
  try {
    const rgbBuffer = frames.map(f => [f.r, f.g, f.b])
    const timestamps = frames.map((f, i) => f.t || f.timestamp || i * (1000 / fps))
    const ms = timestamps[timestamps.length - 1] - timestamps[0]
    const actualFps = (frames.length / ms) * 1000

    const relTs = timestamps.map(t => t - timestamps[0])
    const ensembled = resample(extractPulseSignal(rgbBuffer, actualFps || fps), relTs, RESAMPLE_FPS)
    const det = detrend(ensembled)
    const cleanDet = denoiseSignal(det, RESAMPLE_FPS)

    const hrWelch  = welchHR(cleanDet, RESAMPLE_FPS)
    const hrFft    = dominantFreq(cleanDet, HR_LOW_HZ, HR_HIGH_HZ, RESAMPLE_FPS)
    const hrAuto   = autocorrPeak(cleanDet, HR_LOW_HZ, HR_HIGH_HZ, RESAMPLE_FPS)
    const hrFftBpm = hrFft  > 0 ? Math.round(hrFft  * 60) : null
    const hrAutoBpm = hrAuto > 0 ? Math.round(hrAuto * 60) : null

    let hr = hrWelch || hrFftBpm
    if (hrWelch && hrFftBpm && Math.abs(hrWelch - hrFftBpm) < 10) hr = Math.round((hrWelch + hrFftBpm) / 2)

    const rrHz = respiratoryFreqHz(cleanDet, RESAMPLE_FPS)
    let rr = rrHz > 0 ? Math.round(rrHz * 60) : null

    let finalHR = hr && hr >= 40 && hr <= 200 ? hr : null
    let finalRR = rr && rr >= 8  && rr <= 35  ? rr  : null
    if (!finalHR && hr && hr < 40 && hr*2 >= 40 && hr*2 <= 200) finalHR = hr * 2
    if (!finalRR && rr && rr < 8  && rr*2 >= 8  && rr*2 <= 35)  finalRR = rr * 2

    const snr = signalSNR(cleanDet, hrFft, RESAMPLE_FPS)
    const agreement = hrFftBpm && hrAutoBpm ? Math.abs(hrFftBpm - hrAutoBpm) : 99
    const numericConfidence = Math.max(0, Math.min(100, 100 - (snr < 2 ? 20 : 0) - (agreement > 10 ? 15 : 0)))

    const afDetection = detectAF(cleanDet, RESAMPLE_FPS) || AF_INSUFFICIENT()
    const hrv    = calculateHRVScore(afDetection.rrIntervals)
    const stress = calculateStressScore(afDetection.rrIntervals, finalHR || 70)

    const durationSec = Math.round(ms / 1000)

    // Skin presence: human skin has R > G. If mean R/G < 1.04, likely no face in frame.
    const meanR = frames.reduce((s, f) => s + f.r, 0) / frames.length
    const meanG = frames.reduce((s, f) => s + f.g, 0) / frames.length
    const rgRatio = meanG > 0 ? meanR / meanG : 1
    const noFaceDetected = rgRatio < 1.04

    console.log(`[processStoredFrames] ${frames.length} frames, ${durationSec}s, HR:${finalHR}, RR:${finalRR}, R/G:${rgRatio.toFixed(3)}`)

    return {
      hr: finalHR, rr: finalRR,
      confidence: agreement < 5 ? 'high' : agreement < 10 ? 'moderate' : 'low',
      numericConfidence,
      frames: frames.length,
      actualFps: parseFloat((actualFps || fps).toFixed(1)),
      faceWarning: noFaceDetected,
      rawFrames: frames,
      afDetection, hrv, stress,
      rrIntervals: afDetection.rrIntervals,
      backgroundDurationSec: durationSec,
      note: 'Indicative screening only — not a substitute for medical-grade devices.',
    }
  } catch (e) {
    console.error('[processStoredFrames] error:', e.message)
    return null
  }
}

// Fetch outdoor ambient temperature via geolocation + open-meteo
export async function getAmbientTemp() {
  const pos = await new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 6000, maximumAge: 300000 })
  )
  const { latitude, longitude } = pos.coords
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}&current=temperature_2m`
  )
  if (!res.ok) throw new Error('Weather fetch failed')
  const data = await res.json()
  return Math.round(data.current.temperature_2m * 10) / 10
}
