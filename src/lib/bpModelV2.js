// BP model v2 — parallel pipeline, not wired into live /vitals yet.
//
// Shipped 2026-10-02 after confirming v15 is a mean-emitter (dashboard
// pred SBP SD = 1.1 vs cuff SD 12.5). The v15 problem is architectural:
//   - naive peak detection → garbage pulse morphology features
//   - 50K-param MLP on 150 samples → L2 wins, output collapses to bias
//   - 15 generations of continue-training reinforced the collapse basin
//
// v2 rebuilds the whole BP path on three principles:
//   1. Clean the signal first (CHROM + bandpass + robust landmark detection)
//      so morphology features actually reflect the pulse waveform.
//   2. Hand-craft 6 physiologically grounded features that the rPPG-BP
//      literature says carry BP information (upstroke time, augmentation
//      index, pulse width, area ratio, notch delay, 2nd-deriv b/a ratio).
//   3. Match model capacity to data: 8 inputs, 2 outputs, ridge regression
//      = 18 params on 155 samples = ~9 samples per parameter.
//
// This file is self-contained — nothing in bpModel.js (v15) or rppg.js
// touched. v2 persists to localStorage only; no Supabase sync yet. The
// VitalsValidate dashboard gets an A/B button to run v2 over the 157
// stored signals so Patrick can compare prediction SD vs v15. If v2
// shows real variance AND the scatter plot climbs the diagonal, we
// promote to live.

// ─── Signal processing primitives ─────────────────────────────────────────────

function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p }

// In-place Cooley-Tukey radix-2 FFT. Length must be a power of 2.
function fft(re, im) {
  const n = re.length
  // Bit-reverse permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1
    const wRe = Math.cos(-2 * Math.PI / len)
    const wIm = Math.sin(-2 * Math.PI / len)
    for (let i = 0; i < n; i += len) {
      let cRe = 1, cIm = 0
      for (let k = 0; k < half; k++) {
        const idxA = i + k, idxB = i + k + half
        const tRe = cRe * re[idxB] - cIm * im[idxB]
        const tIm = cRe * im[idxB] + cIm * re[idxB]
        re[idxB] = re[idxA] - tRe; im[idxB] = im[idxA] - tIm
        re[idxA] = re[idxA] + tRe; im[idxA] = im[idxA] + tIm
        const nRe = cRe * wRe - cIm * wIm
        cIm = cRe * wIm + cIm * wRe
        cRe = nRe
      }
    }
  }
}

// Zero-phase FFT bandpass. Pads to next power of 2, zeros bins outside
// [lowHz, highHz], inverse-transforms.
function bandpass(signal, fps, lowHz, highHz) {
  const n = nextPow2(signal.length)
  const re = new Array(n).fill(0)
  const im = new Array(n).fill(0)
  for (let i = 0; i < signal.length; i++) re[i] = signal[i]
  fft(re, im)
  const freqRes = fps / n
  for (let i = 0; i < n; i++) {
    const freq = i <= n / 2 ? i * freqRes : (n - i) * freqRes
    if (freq < lowHz || freq > highHz) { re[i] = 0; im[i] = 0 }
  }
  for (let i = 0; i < n; i++) im[i] = -im[i]
  fft(re, im)
  return re.slice(0, signal.length).map(v => v / n)
}

// Linear detrend (removes drift, keeps pulsatile component).
function detrend(signal) {
  const n = signal.length
  const xMean = (n - 1) / 2
  let yMean = 0
  for (let i = 0; i < n; i++) yMean += signal[i]
  yMean /= n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    const dx = i - xMean
    num += dx * (signal[i] - yMean)
    den += dx * dx
  }
  const slope = den > 0 ? num / den : 0
  const intercept = yMean - slope * xMean
  return signal.map((v, i) => v - (slope * i + intercept))
}

// CHROM method (de Haan 2013). Combines R/G/B into a pulse signal with
// strong motion rejection by projecting onto a chrominance plane.
// Returns a 1D rPPG waveform the same length as the input frames.
function chromRppg(rgbFrames) {
  const n = rgbFrames.length
  if (n < 10) return []
  let rMean = 0, gMean = 0, bMean = 0
  for (const f of rgbFrames) { rMean += f.r; gMean += f.g; bMean += f.b }
  rMean /= n; gMean /= n; bMean /= n
  const rn = rgbFrames.map(f => f.r / rMean)
  const gn = rgbFrames.map(f => f.g / gMean)
  const bn = rgbFrames.map(f => f.b / bMean)
  // X = 3Rn - 2Gn ; Y = 1.5Rn + Gn - 1.5Bn
  const X = rn.map((r, i) => 3 * r - 2 * gn[i])
  const Y = rn.map((r, i) => 1.5 * r + gn[i] - 1.5 * bn[i])
  let stdX = 0, stdY = 0
  const mX = X.reduce((a, b) => a + b, 0) / n
  const mY = Y.reduce((a, b) => a + b, 0) / n
  for (let i = 0; i < n; i++) {
    stdX += (X[i] - mX) ** 2
    stdY += (Y[i] - mY) ** 2
  }
  stdX = Math.sqrt(stdX / n); stdY = Math.sqrt(stdY / n)
  const alpha = stdY > 0 ? stdX / stdY : 1
  return X.map((x, i) => x - alpha * Y[i])
}

// Normalise to zero mean, unit variance (z-score).
function zscore(signal) {
  const n = signal.length
  if (n === 0) return signal
  let m = 0
  for (const v of signal) m += v
  m /= n
  let s = 0
  for (const v of signal) s += (v - m) ** 2
  s = Math.sqrt(s / n) || 1
  return signal.map(v => (v - m) / s)
}

// First-order central difference (derivative).
function diff(signal) {
  const out = new Array(signal.length).fill(0)
  for (let i = 1; i < signal.length - 1; i++) out[i] = (signal[i + 1] - signal[i - 1]) / 2
  return out
}

// ─── Landmark detection (peaks, feet, dicrotic notches) ───────────────────────

// Peaks: local maxima above 0 with min 0.4s separation (physiological HR < 150).
function findPeaks(signal, fps) {
  const minDist = Math.floor(fps * 0.4)
  const peaks = []
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > 0 && signal[i] > signal[i - 1] && signal[i] > signal[i + 1]) {
      if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDist) {
        peaks.push(i)
      } else if (signal[i] > signal[peaks[peaks.length - 1]]) {
        peaks[peaks.length - 1] = i  // merge: keep taller
      }
    }
  }
  return peaks
}

// Foot = minimum between two adjacent peaks. Returns one foot per inter-peak
// interval (so len = peaks.length - 1).
function findFeet(signal, peaks) {
  const feet = []
  for (let p = 0; p < peaks.length - 1; p++) {
    const a = peaks[p], b = peaks[p + 1]
    let minIdx = a, minVal = signal[a]
    for (let i = a + 1; i < b; i++) if (signal[i] < minVal) { minVal = signal[i]; minIdx = i }
    feet.push(minIdx)
  }
  return feet
}

// Dicrotic notch = local minimum in 2nd-derivative between a peak and the
// NEXT foot (i.e. on the downstroke). Returns null for pulses where no
// clear notch is detectable.
function findNotches(signal, peaks, feet) {
  const sdppg = diff(diff(signal))
  const notches = []
  for (let p = 0; p < peaks.length - 1; p++) {
    const peakIdx = peaks[p]
    const footIdx = feet[p]
    if (footIdx - peakIdx < 4) { notches.push(null); continue }
    // Look at the downstroke region (peak+2 → foot-1), find max of 2nd deriv
    // (upward inflection = notch).
    let notchIdx = null, notchVal = -Infinity
    for (let i = peakIdx + 2; i < footIdx; i++) {
      if (sdppg[i] > notchVal) { notchVal = sdppg[i]; notchIdx = i }
    }
    notches.push(notchIdx)
  }
  return notches
}

// ─── Pulse morphology features ────────────────────────────────────────────────

function median(arr) {
  const clean = arr.filter(v => Number.isFinite(v))
  if (clean.length === 0) return null
  const sorted = [...clean].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Width at 50% of (peak - foot) amplitude, in seconds. Narrower pulse =
// higher BP (stiffer artery). Reported as median across all pulses.
function pulseWidth50(signal, peaks, feet, fps) {
  const widths = []
  for (let p = 0; p < peaks.length - 1; p++) {
    const peakIdx = peaks[p]
    const footStart = p > 0 ? feet[p - 1] : Math.max(0, peakIdx - Math.floor(fps * 0.5))
    const footEnd = feet[p]
    const peakVal = signal[peakIdx]
    const base = Math.min(signal[footStart], signal[footEnd])
    const half = base + (peakVal - base) / 2
    // Left crossing: scan footStart → peak.
    let left = null
    for (let i = footStart; i < peakIdx; i++) {
      if (signal[i] <= half && signal[i + 1] > half) { left = i; break }
    }
    // Right crossing: scan peak → footEnd.
    let right = null
    for (let i = peakIdx; i < footEnd; i++) {
      if (signal[i] >= half && signal[i + 1] < half) { right = i; break }
    }
    if (left != null && right != null) widths.push((right - left) / fps)
  }
  return median(widths)
}

// Extract 6 pulse-morphology features + age + sex. Returns null if the
// signal doesn't produce enough valid pulses to compute them.
export function extractBpV2Features(cleanSignal, fps, subject = {}) {
  const peaks = findPeaks(cleanSignal, fps)
  if (peaks.length < 4) return null
  const feet = findFeet(cleanSignal, peaks)
  const notches = findNotches(cleanSignal, peaks, feet)
  const sdppg = diff(diff(cleanSignal))

  // Upstroke time (foot → next peak), median, seconds. Shorter = stiffer artery.
  const upstrokes = []
  for (let p = 1; p < peaks.length; p++) {
    const foot = feet[p - 1]
    if (foot != null && peaks[p] > foot) upstrokes.push((peaks[p] - foot) / fps)
  }

  // Augmentation index: height of reflected wave at the notch, relative to
  // peak amplitude. Higher = higher central BP.
  const aiVals = []
  for (let p = 0; p < peaks.length - 1; p++) {
    const notchIdx = notches[p]
    if (notchIdx == null) continue
    const base = signal2Base(cleanSignal, feet, p)
    const peakAmp = cleanSignal[peaks[p]] - base
    const notchAmp = cleanSignal[notchIdx] - base
    if (peakAmp > 0.01) aiVals.push(notchAmp / peakAmp)
  }

  // Pulse width at 50% amplitude. Narrower = higher BP.
  const pw50 = pulseWidth50(cleanSignal, peaks, feet, fps)

  // Area ratio = (systolic phase AUC) / (diastolic phase AUC). Vascular
  // tone proxy — shifts with BP.
  const areaRatios = []
  for (let p = 0; p < peaks.length - 1; p++) {
    const notchIdx = notches[p]
    if (notchIdx == null) continue
    const footStart = p > 0 ? feet[p - 1] : peaks[p] - Math.floor(fps * 0.3)
    const footEnd = feet[p]
    let sysAuc = 0, diaAuc = 0
    const base = signal2Base(cleanSignal, feet, p)
    for (let i = footStart; i < notchIdx; i++) sysAuc += Math.max(0, cleanSignal[i] - base)
    for (let i = notchIdx; i < footEnd; i++) diaAuc += Math.max(0, cleanSignal[i] - base)
    if (diaAuc > 0.1) areaRatios.push(sysAuc / diaAuc)
  }

  // Dicrotic notch delay (peak → notch), median seconds.
  const notchDelays = []
  for (let p = 0; p < peaks.length - 1; p++) {
    const notchIdx = notches[p]
    if (notchIdx == null) continue
    notchDelays.push((notchIdx - peaks[p]) / fps)
  }

  // SDPPG b/a ratio — 2nd derivative wave characteristic. Classic age-adjusted
  // stiffness marker.
  const sdppgRatios = []
  for (let p = 0; p < peaks.length - 1; p++) {
    const peakIdx = peaks[p]
    // 'a' = max of 2nd deriv just after foot (systolic acceleration)
    // 'b' = min of 2nd deriv just after a (systolic deceleration)
    const windowA = sdppg.slice(Math.max(0, peakIdx - Math.floor(fps * 0.1)), peakIdx)
    const windowB = sdppg.slice(peakIdx, Math.min(sdppg.length, peakIdx + Math.floor(fps * 0.15)))
    if (!windowA.length || !windowB.length) continue
    const aVal = Math.max(...windowA)
    const bVal = Math.min(...windowB)
    if (Math.abs(aVal) > 0.001) sdppgRatios.push(bVal / aVal)
  }

  const upstrokeTime = median(upstrokes)
  const augIndex    = median(aiVals)
  const areaRatio   = median(areaRatios)
  const notchDelay  = median(notchDelays)
  const sdppgBA     = median(sdppgRatios)

  // Need all six waveform features to produce a prediction. If any failed,
  // the signal isn't clean enough — bail.
  if (upstrokeTime == null || augIndex == null || pw50 == null ||
      areaRatio == null || notchDelay == null || sdppgBA == null) return null

  const age = Number(subject.age) || Number(subject.patient_age) || 40
  const sex = (subject.sex === 'male' || subject.patient_sex === 'male') ? 1 : 0

  return {
    upstrokeTime, augIndex, pulseWidth50: pw50, areaRatio, notchDelay, sdppgBA,
    age, sex,
    _nPulses: peaks.length - 1,
    _signalLength: cleanSignal.length / fps,
  }
}

function signal2Base(signal, feet, p) {
  const a = p > 0 ? signal[feet[p - 1]] : signal[Math.max(0, feet[p] - 1)]
  const b = signal[feet[p]]
  return (a + b) / 2
}

// ─── Pipeline: raw frames → clean signal → features ───────────────────────────

export function framesToCleanSignal(frames, fps) {
  if (!Array.isArray(frames) || frames.length < 60) return null
  const chrom = chromRppg(frames)
  const detrended = detrend(chrom)
  const filtered = bandpass(detrended, fps, 0.7, 4.0)
  return zscore(filtered)
}

export function framesToV2Features(frames, fps, subject) {
  const clean = framesToCleanSignal(frames, fps)
  if (!clean) return null
  return extractBpV2Features(clean, fps, subject)
}

// ─── Ridge regression (closed-form) ───────────────────────────────────────────
//
// Weights = (XᵀX + λI)⁻¹ Xᵀy
// Training on 155 samples with 8 features (6 waveform + age + sex) + bias
// = 9 columns including intercept. 155 ≫ 9² = 81, well-conditioned.

const FEATURE_NAMES_V2 = ['upstrokeTime', 'augIndex', 'pulseWidth50', 'areaRatio', 'notchDelay', 'sdppgBA', 'age', 'sex']

function featureVector(f) {
  return [f.upstrokeTime, f.augIndex, f.pulseWidth50, f.areaRatio, f.notchDelay, f.sdppgBA, f.age, f.sex, 1]
}

// Standardise feature columns (zero mean, unit SD) so ridge penalty treats
// them equally. Returns { X_std, means, stds }.
function standardize(X) {
  const n = X.length
  const d = X[0].length - 1  // last column is bias (never standardised)
  const means = new Array(d).fill(0)
  const stds  = new Array(d).fill(0)
  for (let j = 0; j < d; j++) {
    for (let i = 0; i < n; i++) means[j] += X[i][j]
    means[j] /= n
  }
  for (let j = 0; j < d; j++) {
    for (let i = 0; i < n; i++) stds[j] += (X[i][j] - means[j]) ** 2
    stds[j] = Math.sqrt(stds[j] / n) || 1
  }
  const X_std = X.map(row => {
    const r = new Array(row.length)
    for (let j = 0; j < d; j++) r[j] = (row[j] - means[j]) / stds[j]
    r[d] = 1  // bias column stays
    return r
  })
  return { X_std, means, stds }
}

// Matrix helpers for the ridge solve.
function transpose(A) {
  const r = A.length, c = A[0].length
  const T = Array.from({ length: c }, () => new Array(r))
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) T[j][i] = A[i][j]
  return T
}

function matmul(A, B) {
  const r = A.length, c = B[0].length, k = B.length
  const C = Array.from({ length: r }, () => new Array(c).fill(0))
  for (let i = 0; i < r; i++)
    for (let j = 0; j < c; j++) {
      let s = 0
      for (let m = 0; m < k; m++) s += A[i][m] * B[m][j]
      C[i][j] = s
    }
  return C
}

function matvec(A, v) {
  const r = A.length, c = v.length
  const out = new Array(r).fill(0)
  for (let i = 0; i < r; i++) {
    let s = 0
    for (let j = 0; j < c; j++) s += A[i][j] * v[j]
    out[i] = s
  }
  return out
}

// Gauss-Jordan matrix inversion. OK for a 9x9 matrix.
function invert(M) {
  const n = M.length
  const A = M.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)])
  for (let i = 0; i < n; i++) {
    let pivot = i
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[pivot][i])) pivot = r
    if (Math.abs(A[pivot][i]) < 1e-12) throw new Error('singular')
    if (pivot !== i) [A[i], A[pivot]] = [A[pivot], A[i]]
    const p = A[i][i]
    for (let j = 0; j < 2 * n; j++) A[i][j] /= p
    for (let r = 0; r < n; r++) {
      if (r === i) continue
      const f = A[r][i]
      for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[i][j]
    }
  }
  return A.map(row => row.slice(n))
}

// Ridge regression: solve (XᵀX + λI)⁻¹ Xᵀy for each output column independently.
// X: n × (d+1) (includes bias column of 1s), Y: n × 2 (sys, dia).
function ridge(X, Y, lambda) {
  const Xt = transpose(X)
  const XtX = matmul(Xt, X)
  const d = XtX.length
  // Add λI (but NOT on the bias term — standard practice).
  for (let i = 0; i < d - 1; i++) XtX[i][i] += lambda
  const inv = invert(XtX)
  const XtY = matmul(Xt, Y)
  return matmul(inv, XtY)  // (d+1) × 2
}

// Train on paired (features, [sys, dia]) samples. Returns a model object:
//   { W: 9×2, means, stds, meta: { n, mae, valMae, trainedAt } }
export function trainRidgeBp(features, labels, { lambda = 1.0, valFrac = 0.2 } = {}) {
  if (features.length < 20) throw new Error('need ≥20 training samples')
  const n = features.length
  const nVal = Math.max(1, Math.round(n * valFrac))
  // Shuffle deterministically (seeded by n so repeat trains are stable).
  const order = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = (i * 2654435761 >>> 0) % (i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const trainIdx = order.slice(nVal)
  const valIdx   = order.slice(0, nVal)

  const Xraw = trainIdx.map(i => featureVector(features[i]))
  const Y    = trainIdx.map(i => labels[i])
  const { X_std, means, stds } = standardize(Xraw)

  const W = ridge(X_std, Y, lambda)

  // Train MAE
  const predsTrain = matmul(X_std, W)
  let maeSysT = 0, maeDiaT = 0
  for (let i = 0; i < Y.length; i++) {
    maeSysT += Math.abs(predsTrain[i][0] - Y[i][0])
    maeDiaT += Math.abs(predsTrain[i][1] - Y[i][1])
  }
  maeSysT /= Y.length; maeDiaT /= Y.length

  // Validation MAE (standardise val features using training means/stds)
  const Xval_raw = valIdx.map(i => featureVector(features[i]))
  const Yval = valIdx.map(i => labels[i])
  const Xval_std = Xval_raw.map(row => {
    const r = new Array(row.length)
    for (let j = 0; j < means.length; j++) r[j] = (row[j] - means[j]) / stds[j]
    r[means.length] = 1
    return r
  })
  const predsVal = matmul(Xval_std, W)
  let maeSysV = 0, maeDiaV = 0
  for (let i = 0; i < Yval.length; i++) {
    maeSysV += Math.abs(predsVal[i][0] - Yval[i][0])
    maeDiaV += Math.abs(predsVal[i][1] - Yval[i][1])
  }
  maeSysV /= Yval.length; maeDiaV /= Yval.length

  return {
    W, means, stds,
    featureNames: FEATURE_NAMES_V2,
    meta: {
      n: Y.length,
      nVal: Yval.length,
      trainMae: { sys: +maeSysT.toFixed(1), dia: +maeDiaT.toFixed(1) },
      valMae:   { sys: +maeSysV.toFixed(1), dia: +maeDiaV.toFixed(1) },
      lambda,
      trainedAt: new Date().toISOString(),
    },
  }
}

export function predictRidgeBp(model, features) {
  const vec = featureVector(features)
  const stdVec = new Array(vec.length)
  for (let j = 0; j < model.means.length; j++) stdVec[j] = (vec[j] - model.means[j]) / model.stds[j]
  stdVec[model.means.length] = 1
  const out = matvec(transpose(model.W), stdVec)  // W is (d+1)×2 → Wᵀ is 2×(d+1)
  const sys = Math.round(Math.max(70, Math.min(200, out[0])))
  const dia = Math.round(Math.max(40, Math.min(130, out[1])))
  return { systolic: sys, diastolic: dia, source: 'v2-ridge' }
}

// ─── Persistence (localStorage only — v2 does not touch Supabase) ─────────────

const V2_MODEL_KEY = 'tere-bp-v2-ridge'

export function saveV2Model(model) {
  try { localStorage.setItem(V2_MODEL_KEY, JSON.stringify(model)) } catch {}
}

export function loadV2Model() {
  try {
    const s = localStorage.getItem(V2_MODEL_KEY)
    return s ? JSON.parse(s) : null
  } catch { return null }
}

// ─── Convenience: predict directly from stored frames + subject ───────────────

export function predictV2FromFrames(model, frames, fps, subject) {
  const features = framesToV2Features(frames, fps, subject)
  if (!features) return { skipped: true, reason: 'insufficient_pulses_or_signal' }
  return { ...predictRidgeBp(model, features), features }
}
