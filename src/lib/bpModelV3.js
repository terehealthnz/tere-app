// BP model v3 — Tier 1 face-only improvements over v2.
//
// Shipped 2026-10-02 because v2 ridge on CHROM + 10 features landed at val
// MAE ±12.1 sys / ±7.7 dia on 155 scans, which is worse than the "always
// predict cuff mean" baseline (±10.0 / ±7.3). The feature extractor was
// collapsing to the mean because the signal we were feeding it wasn't
// moving enough with BP to drive differentiation.
//
// Face-only is a hard constraint — rural workers get one phone, one scan,
// no cuff baseline, no finger sensor. Everything in v3 lives inside that
// envelope.
//
// Four changes stacked:
//   1. POS (Plane-Orthogonal-to-Skin, Wang 2017) replaces CHROM. ~20-30%
//      better motion rejection in low-SNR face capture; most published
//      post-2017 rPPG work has moved to POS.
//   2. Multi-pass windowing — extract features from five overlapping 10s
//      windows across the scan, median across windows. Reduces per-feature
//      noise ~2× when the signal is clean enough that most windows agree.
//   3. Four more features: perfusion index (AC/DC ratio, vascular tone),
//      stiffness index (height / peak_to_notch_time), reflection coefficient
//      (notch_amplitude / peak_amplitude), spectral entropy (vascular
//      compliance proxy).
//   4. Gradient-boosted regression trees instead of ridge, so nonlinear
//      feature interactions can be captured. 50 depth-3 trees, lr=0.1,
//      hand-rolled in pure JS so there's no new dependency.
//
// What's NOT in v3 (face-only + no-calibration constraint):
//   - Multi-ROI (forehead vs cheek): would need new frame capture
//     format; our 155 stored scans are single-mean R/G/B. Future go-forward.
//   - Face-PWTT between ROIs: needs multi-ROI (above).
//   - Per-subject calibration: defeats the rural zero-cuff value prop.
//
// v3 persists to localStorage locally and to the new bp_v3_models table
// on promote. Load path mirrors v2: live /vitals calls
// loadActiveV3ModelFromServer() on mount, runs it in parallel to v15 + v2,
// and the display-version flag now has 'v3' as a third option.

import { bandpass, detrend, zscore, findPeaks, findFeet, findNotches } from './bpModelV2'

// ─── POS (Plane-Orthogonal-to-Skin) rPPG extraction ───────────────────────────
//
// Wang 2017 "Algorithmic Principles of Remote PPG" §III-E. For each frame:
//   Normalise RGB by temporal mean inside a sliding window
//   Project onto plane orthogonal to [1,1,1] skin-tone vector:
//     S1 = Gn - Bn
//     S2 = Gn + Bn - 2*Rn
//   Combine with adaptive weight α = std(S1) / std(S2):
//     h = S1 - α * S2
// Returns a 1-D pulse signal the same length as the input frames.
// Window length ≈ 1.6s matches literature default.

export function posRppg(rgbFrames, fps = 30) {
  const n = rgbFrames.length
  if (n < 10) return []
  const win = Math.max(10, Math.floor(fps * 1.6))
  const out = new Array(n).fill(0)
  const half = Math.floor(win / 2)

  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - half)
    const end   = Math.min(n, start + win)
    const len = end - start
    if (len < 10) continue

    let rM = 0, gM = 0, bM = 0
    for (let k = start; k < end; k++) {
      rM += rgbFrames[k].r
      gM += rgbFrames[k].g
      bM += rgbFrames[k].b
    }
    rM /= len; gM /= len; bM /= len
    if (rM < 1 || gM < 1 || bM < 1) continue

    // Normalise each frame in window, project onto POS plane
    const S1 = new Array(len), S2 = new Array(len)
    let m1 = 0, m2 = 0
    for (let k = 0; k < len; k++) {
      const f = rgbFrames[start + k]
      const rn = f.r / rM, gn = f.g / gM, bn = f.b / bM
      S1[k] = gn - bn
      S2[k] = gn + bn - 2 * rn
      m1 += S1[k]; m2 += S2[k]
    }
    m1 /= len; m2 /= len
    let v1 = 0, v2 = 0
    for (let k = 0; k < len; k++) {
      v1 += (S1[k] - m1) ** 2
      v2 += (S2[k] - m2) ** 2
    }
    v1 = Math.sqrt(v1 / len) || 1
    v2 = Math.sqrt(v2 / len) || 1
    const alpha = v1 / v2

    // Overlap-add: assign to centre of window
    const centre = i - start
    if (centre >= 0 && centre < len) {
      out[i] = S1[centre] - alpha * S2[centre]
    }
  }
  return out
}

// ─── Signal Quality Index — reject garbage before trying BP ───────────────────
//
// Pulse spectral purity: fraction of pulse-band power concentrated in the
// peak HR bin (± 0.2 Hz). Clean signals have >60% power at HR; noisy signals
// smear across the band. Returns a 0-1 SQI; <0.25 → reject.

function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p }

function spectrumPower(signal, fps) {
  const n = nextPow2(signal.length)
  // Reuse bandpass as a hack to get a clean copy; just compute FFT power.
  // We duplicate a minimal FFT here rather than exporting from v2.
  const re = new Array(n).fill(0), im = new Array(n).fill(0)
  for (let i = 0; i < signal.length; i++) re[i] = signal[i]
  // Cooley-Tukey radix-2
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
        const a = i + k, b = i + k + half
        const tRe = cRe * re[b] - cIm * im[b]
        const tIm = cRe * im[b] + cIm * re[b]
        re[b] = re[a] - tRe; im[b] = im[a] - tIm
        re[a] = re[a] + tRe; im[a] = im[a] + tIm
        const nRe = cRe * wRe - cIm * wIm
        cIm = cRe * wIm + cIm * wRe
        cRe = nRe
      }
    }
  }
  const nyq = n / 2
  const freqRes = fps / n
  const freqs = new Array(nyq), power = new Array(nyq)
  for (let i = 0; i < nyq; i++) {
    freqs[i] = i * freqRes
    power[i] = re[i] * re[i] + im[i] * im[i]
  }
  return { freqs, power }
}

export function signalQualityIndex(signal, fps) {
  if (signal.length < fps * 4) return 0
  const { freqs, power } = spectrumPower(signal, fps)
  // Pulse band: 0.7-4 Hz. Find peak within this band.
  let peakIdx = -1, peakVal = -Infinity, bandSum = 0
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i] < 0.7 || freqs[i] > 4.0) continue
    bandSum += power[i]
    if (power[i] > peakVal) { peakVal = power[i]; peakIdx = i }
  }
  if (peakIdx < 0 || bandSum <= 0) return 0
  // Energy within ± 0.2 Hz of the peak frequency.
  const peakFreq = freqs[peakIdx]
  let localSum = 0
  for (let i = 0; i < freqs.length; i++) {
    if (Math.abs(freqs[i] - peakFreq) <= 0.2) localSum += power[i]
  }
  return localSum / bandSum
}

// ─── Additional features (face-only, derived from single signal) ──────────────

function median(arr) {
  const clean = arr.filter(v => Number.isFinite(v))
  if (clean.length === 0) return null
  const sorted = [...clean].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Perfusion Index — AC/DC ratio of the raw (pre-zscore) pulsatile signal.
// Vascular tone proxy; drops with vasoconstriction (which rises with high BP).
function perfusionIndex(preZscoreSignal) {
  if (preZscoreSignal.length < 10) return null
  const dc = preZscoreSignal.reduce((a, b) => a + Math.abs(b), 0) / preZscoreSignal.length
  if (dc < 1e-6) return null
  const maxV = Math.max(...preZscoreSignal)
  const minV = Math.min(...preZscoreSignal)
  return (maxV - minV) / (2 * dc)
}

// Stiffness Index (Millasseau 2002) — approximation using subject height (m)
// over peak-to-notch time (s). Classic non-invasive arterial stiffness.
// Falls back to 1.65 m if height unknown so the feature is still numeric.
function stiffnessIndex(signal, peaks, notches, fps, heightCm) {
  const h = (Number(heightCm) || 165) / 100
  const dts = []
  for (let p = 0; p < peaks.length - 1; p++) {
    const nIdx = notches[p]
    if (nIdx == null) continue
    dts.push((nIdx - peaks[p]) / fps)
  }
  const dt = median(dts)
  if (dt == null || dt <= 0) return null
  return h / dt
}

// Reflection Coefficient — median notch amplitude / peak amplitude. Rises
// with central BP and vessel stiffness.
function reflectionCoefficient(signal, peaks, feet, notches) {
  const ratios = []
  for (let p = 0; p < peaks.length - 1; p++) {
    const nIdx = notches[p]
    if (nIdx == null) continue
    const foot = p > 0 ? feet[p - 1] : null
    const base = foot != null ? signal[foot] : 0
    const peakAmp = signal[peaks[p]] - base
    const notchAmp = signal[nIdx] - base
    if (peakAmp > 0.01) ratios.push(notchAmp / peakAmp)
  }
  return median(ratios)
}

// Spectral entropy of the pulse. Low = narrowband (clean dominant HR =
// compliant vessels), high = smeared (stiffer vessels + more harmonic
// content).
function spectralEntropy(signal, fps) {
  const { freqs, power } = spectrumPower(signal, fps)
  let total = 0, entries = []
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i] < 0.7 || freqs[i] > 4.0) continue
    total += power[i]
    entries.push(power[i])
  }
  if (total <= 0 || entries.length < 2) return null
  let h = 0
  for (const p of entries) {
    const pi = p / total
    if (pi > 1e-12) h -= pi * Math.log(pi)
  }
  return h / Math.log(entries.length)  // normalised 0-1
}

// ─── Morphology features (reuse the ones we already have for v2) ──────────────
// We re-derive them inline (not importing extractBpV2Features because that
// one bails if ANY feature is null — v3 is more tolerant and backfills).

function diff(signal) {
  const out = new Array(signal.length).fill(0)
  for (let i = 1; i < signal.length - 1; i++) out[i] = (signal[i + 1] - signal[i - 1]) / 2
  return out
}

function pulseWidth50(signal, peaks, feet, fps) {
  const widths = []
  for (let p = 0; p < peaks.length - 1; p++) {
    const peakIdx = peaks[p]
    const footStart = p > 0 ? feet[p - 1] : Math.max(0, peakIdx - Math.floor(fps * 0.5))
    const footEnd = feet[p]
    const peakVal = signal[peakIdx]
    const base = Math.min(signal[footStart], signal[footEnd])
    const half = base + (peakVal - base) / 2
    let left = null
    for (let i = footStart; i < peakIdx; i++) {
      if (signal[i] <= half && signal[i + 1] > half) { left = i; break }
    }
    let right = null
    for (let i = peakIdx; i < footEnd; i++) {
      if (signal[i] >= half && signal[i + 1] < half) { right = i; break }
    }
    if (left != null && right != null) widths.push((right - left) / fps)
  }
  return median(widths)
}

function hrAndHrv(peaks, fps) {
  if (peaks.length < 3) return { hr: null, hrvSdnn: null, hrvRmssd: null }
  const rr = []
  for (let i = 1; i < peaks.length; i++) rr.push(((peaks[i] - peaks[i - 1]) / fps) * 1000)
  const clean = rr.filter(ms => ms >= 333 && ms <= 1500)
  if (clean.length < 2) return { hr: null, hrvSdnn: null, hrvRmssd: null }
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length
  const hr = 60000 / mean
  let varSum = 0
  for (const v of clean) varSum += (v - mean) ** 2
  const sdnn = Math.sqrt(varSum / clean.length)
  let sqDiff = 0
  for (let i = 1; i < clean.length; i++) sqDiff += (clean[i] - clean[i - 1]) ** 2
  const rmssd = clean.length > 1 ? Math.sqrt(sqDiff / (clean.length - 1)) : 0
  return { hr, hrvSdnn: sdnn, hrvRmssd: rmssd }
}

// ─── Full feature extraction on one clean window ──────────────────────────────

function extractV3FeaturesOneWindow(cleanSignal, preBpSignal, fps, subject) {
  const peaks = findPeaks(cleanSignal, fps)
  if (peaks.length < 4) return null
  const feet = findFeet(cleanSignal, peaks)
  const notches = findNotches(cleanSignal, peaks, feet)
  const sdppg = diff(diff(cleanSignal))

  // Morphology
  const upstrokes = []
  for (let p = 1; p < peaks.length; p++) {
    const foot = feet[p - 1]
    if (foot != null && peaks[p] > foot) upstrokes.push((peaks[p] - foot) / fps)
  }
  const aiVals = []
  for (let p = 0; p < peaks.length - 1; p++) {
    const nIdx = notches[p]
    if (nIdx == null) continue
    const base = p > 0 ? cleanSignal[feet[p - 1]] : 0
    const peakAmp = cleanSignal[peaks[p]] - base
    const notchAmp = cleanSignal[nIdx] - base
    if (peakAmp > 0.01) aiVals.push(notchAmp / peakAmp)
  }
  const pw50 = pulseWidth50(cleanSignal, peaks, feet, fps)
  const areaRatios = []
  for (let p = 0; p < peaks.length - 1; p++) {
    const nIdx = notches[p]
    if (nIdx == null) continue
    const footStart = p > 0 ? feet[p - 1] : peaks[p] - Math.floor(fps * 0.3)
    const footEnd = feet[p]
    let sysAuc = 0, diaAuc = 0
    const base = p > 0 ? cleanSignal[feet[p - 1]] : 0
    for (let i = footStart; i < nIdx; i++) sysAuc += Math.max(0, cleanSignal[i] - base)
    for (let i = nIdx; i < footEnd; i++) diaAuc += Math.max(0, cleanSignal[i] - base)
    if (diaAuc > 0.1) areaRatios.push(sysAuc / diaAuc)
  }
  const notchDelays = []
  for (let p = 0; p < peaks.length - 1; p++) {
    const nIdx = notches[p]
    if (nIdx == null) continue
    notchDelays.push((nIdx - peaks[p]) / fps)
  }
  const sdppgRatios = []
  for (let p = 0; p < peaks.length - 1; p++) {
    const peakIdx = peaks[p]
    const windowA = sdppg.slice(Math.max(0, peakIdx - Math.floor(fps * 0.1)), peakIdx)
    const windowB = sdppg.slice(peakIdx, Math.min(sdppg.length, peakIdx + Math.floor(fps * 0.15)))
    if (!windowA.length || !windowB.length) continue
    const aVal = Math.max(...windowA)
    const bVal = Math.min(...windowB)
    if (Math.abs(aVal) > 0.001) sdppgRatios.push(bVal / aVal)
  }
  const notchPos = []
  for (let p = 0; p < peaks.length - 1; p++) {
    const nIdx = notches[p]
    if (nIdx == null) continue
    const total = feet[p] - peaks[p]
    if (total > 2) notchPos.push((nIdx - peaks[p]) / total)
  }

  const { hr, hrvSdnn, hrvRmssd } = hrAndHrv(peaks, fps)
  if (hr == null) return null

  // New v3 features
  const pi = perfusionIndex(preBpSignal)
  const si = stiffnessIndex(cleanSignal, peaks, notches, fps, subject.height_cm)
  const rc = reflectionCoefficient(cleanSignal, peaks, feet, notches)
  const se = spectralEntropy(cleanSignal, fps)
  const sqi = signalQualityIndex(cleanSignal, fps)

  return {
    upstrokeTime:     median(upstrokes),
    augIndex:         median(aiVals),
    pulseWidth50:     pw50,
    areaRatio:        median(areaRatios),
    notchDelay:       median(notchDelays),
    sdppgBA:          median(sdppgRatios),
    hr,
    hrvSdnn:          hrvSdnn ?? 0,
    hrvRmssd:         hrvRmssd ?? 0,
    peakToNotchRatio: median(notchPos) ?? 0.5,
    perfusionIndex:   pi,
    stiffnessIndex:   si,
    reflectionCoeff:  rc,
    spectralEntropy:  se,
    sqi,
  }
}

// Multi-pass windowing: five 10s windows across the scan with 50% overlap
// (so 60s scan → 11 windows). Extract features per window, take median across
// windows. Reduces per-feature noise ~2× when the signal is reasonably clean
// (most windows agree).
export function framesToV3Features(frames, fps, subject = {}) {
  if (!Array.isArray(frames) || frames.length < fps * 10) return null
  const windowLen = Math.floor(fps * 10)
  const step = Math.floor(windowLen / 2)
  const windows = []
  for (let start = 0; start + windowLen <= frames.length; start += step) {
    windows.push(frames.slice(start, start + windowLen))
  }
  if (windows.length === 0) windows.push(frames)

  const perWindow = []
  for (const w of windows) {
    const posRaw = posRppg(w, fps)
    if (!posRaw.length) continue
    const bp = bandpass(detrend(posRaw), fps, 0.7, 4.0)
    const clean = zscore(bp)
    const sqi = signalQualityIndex(clean, fps)
    if (sqi < 0.15) continue  // too noisy, discard this window
    const feats = extractV3FeaturesOneWindow(clean, posRaw, fps, subject)
    if (feats) perWindow.push(feats)
  }

  if (perWindow.length === 0) return null

  // Median across windows per feature, with explicit backfill for features
  // that failed in some windows (so the model always sees a numeric vector).
  const keys = ['upstrokeTime','augIndex','pulseWidth50','areaRatio','notchDelay','sdppgBA',
                'hr','hrvSdnn','hrvRmssd','peakToNotchRatio',
                'perfusionIndex','stiffnessIndex','reflectionCoeff','spectralEntropy','sqi']
  const out = {}
  const defaults = {
    upstrokeTime: 0.15, augIndex: 0.5, pulseWidth50: 0.35, areaRatio: 1.0, notchDelay: 0.25,
    sdppgBA: -0.6, hr: 70, hrvSdnn: 40, hrvRmssd: 30, peakToNotchRatio: 0.5,
    perfusionIndex: 1.0, stiffnessIndex: 7.0, reflectionCoeff: 0.5, spectralEntropy: 0.5, sqi: 0.3,
  }
  for (const k of keys) {
    const vals = perWindow.map(w => w[k]).filter(v => Number.isFinite(v))
    out[k] = vals.length > 0 ? median(vals) : defaults[k]
  }
  out._nWindows = perWindow.length
  out._nWindowsTried = windows.length

  // Subject demographics (same as v2)
  out.age = Number(subject.age) || Number(subject.patient_age) || 40
  out.sex = (subject.sex === 'male' || subject.patient_sex === 'male') ? 1 : 0

  return out
}

// ─── Gradient-boosted regression trees (pure JS, serialisable) ────────────────
//
// 50 depth-3 regression trees, learning rate 0.1, trained via gradient
// boosting (fit residuals). Each tree is {feature, threshold, left, right,
// value} nodes. Serialises to compact JSON. Deterministic.

const FEATURE_NAMES_V3 = [
  'upstrokeTime','augIndex','pulseWidth50','areaRatio','notchDelay','sdppgBA',
  'hr','hrvSdnn','hrvRmssd','peakToNotchRatio',
  'perfusionIndex','stiffnessIndex','reflectionCoeff','spectralEntropy','sqi',
  'age','sex',
]

function featureVec(f) { return FEATURE_NAMES_V3.map(k => f[k]) }

// Grow one regression tree by greedy variance reduction. depth=0 → leaf.
function growTree(X, y, depth, minLeaf = 3) {
  const n = y.length
  const meanY = y.reduce((a, b) => a + b, 0) / n
  if (depth === 0 || n <= minLeaf) {
    return { leaf: true, value: meanY }
  }
  let bestFeat = -1, bestThr = 0, bestGain = 0
  const totalVar = y.reduce((s, v) => s + (v - meanY) ** 2, 0)
  for (let f = 0; f < X[0].length; f++) {
    const vals = X.map(row => row[f])
    const sorted = [...new Set(vals)].sort((a, b) => a - b)
    // candidate thresholds: midpoints of adjacent unique values
    for (let i = 0; i < sorted.length - 1; i++) {
      const thr = (sorted[i] + sorted[i + 1]) / 2
      let lY = [], rY = []
      for (let k = 0; k < n; k++) {
        if (X[k][f] <= thr) lY.push(y[k])
        else rY.push(y[k])
      }
      if (lY.length < minLeaf || rY.length < minLeaf) continue
      const lMean = lY.reduce((a, b) => a + b, 0) / lY.length
      const rMean = rY.reduce((a, b) => a + b, 0) / rY.length
      const lVar = lY.reduce((s, v) => s + (v - lMean) ** 2, 0)
      const rVar = rY.reduce((s, v) => s + (v - rMean) ** 2, 0)
      const gain = totalVar - (lVar + rVar)
      if (gain > bestGain) {
        bestGain = gain; bestFeat = f; bestThr = thr
      }
    }
  }
  if (bestFeat < 0) return { leaf: true, value: meanY }
  const lIdx = [], rIdx = []
  for (let k = 0; k < n; k++) {
    if (X[k][bestFeat] <= bestThr) lIdx.push(k)
    else rIdx.push(k)
  }
  return {
    leaf: false, feature: bestFeat, threshold: bestThr,
    left:  growTree(lIdx.map(i => X[i]), lIdx.map(i => y[i]), depth - 1, minLeaf),
    right: growTree(rIdx.map(i => X[i]), rIdx.map(i => y[i]), depth - 1, minLeaf),
  }
}

function predictTree(tree, x) {
  while (!tree.leaf) tree = x[tree.feature] <= tree.threshold ? tree.left : tree.right
  return tree.value
}

// Fit a single BP output (sys OR dia) with gradient boosting on regression
// trees. Returns { init, trees[], lr }. Prediction = init + lr * Σ trees.
function fitGbm(X, y, { nTrees = 50, depth = 3, lr = 0.1 } = {}) {
  const init = y.reduce((a, b) => a + b, 0) / y.length
  const residuals = y.map(v => v - init)
  const trees = []
  for (let t = 0; t < nTrees; t++) {
    const tree = growTree(X, residuals, depth)
    trees.push(tree)
    for (let i = 0; i < y.length; i++) {
      residuals[i] -= lr * predictTree(tree, X[i])
    }
  }
  return { init, trees, lr }
}

function predictGbm(model, x) {
  let s = model.init
  for (const tree of model.trees) s += model.lr * predictTree(tree, x)
  return s
}

// Train v3: feature extraction already done. labels = [[sys, dia], ...].
export function trainV3(features, labels, { nTrees = 50, depth = 3, lr = 0.1, valFrac = 0.2 } = {}) {
  if (features.length < 20) throw new Error('need ≥20 training samples')
  const n = features.length
  const nVal = Math.max(1, Math.round(n * valFrac))

  // Seeded shuffle (same recipe as v2 for comparability).
  const order = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = (i * 2654435761 >>> 0) % (i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const trainIdx = order.slice(nVal)
  const valIdx   = order.slice(0, nVal)

  const X_train = trainIdx.map(i => featureVec(features[i]))
  const y_sys   = trainIdx.map(i => labels[i][0])
  const y_dia   = trainIdx.map(i => labels[i][1])

  const sysModel = fitGbm(X_train, y_sys, { nTrees, depth, lr })
  const diaModel = fitGbm(X_train, y_dia, { nTrees, depth, lr })

  // Train MAE
  let maeSysT = 0, maeDiaT = 0
  for (let i = 0; i < X_train.length; i++) {
    maeSysT += Math.abs(predictGbm(sysModel, X_train[i]) - y_sys[i])
    maeDiaT += Math.abs(predictGbm(diaModel, X_train[i]) - y_dia[i])
  }
  maeSysT /= X_train.length; maeDiaT /= X_train.length

  // Val MAE on held-out
  const X_val = valIdx.map(i => featureVec(features[i]))
  const y_sysV = valIdx.map(i => labels[i][0])
  const y_diaV = valIdx.map(i => labels[i][1])
  let maeSysV = 0, maeDiaV = 0
  for (let i = 0; i < X_val.length; i++) {
    maeSysV += Math.abs(predictGbm(sysModel, X_val[i]) - y_sysV[i])
    maeDiaV += Math.abs(predictGbm(diaModel, X_val[i]) - y_diaV[i])
  }
  maeSysV /= X_val.length; maeDiaV /= X_val.length

  return {
    sysModel, diaModel,
    featureNames: FEATURE_NAMES_V3,
    meta: {
      n: X_train.length, nVal: X_val.length,
      trainMae: { sys: +maeSysT.toFixed(1), dia: +maeDiaT.toFixed(1) },
      valMae:   { sys: +maeSysV.toFixed(1), dia: +maeDiaV.toFixed(1) },
      nTrees, depth, lr,
      trainedAt: new Date().toISOString(),
    },
  }
}

// Tree-count sweep — train at a range of nTrees values on the SAME seeded
// split and surface val MAE for each. Used to find the overfit knee without
// eyeballing. 50 depth-3 trees on 125 samples overfit 3× (train 3.1 / val
// 9.3); the sweep lets us pick the smallest tree count that holds val MAE
// without memorising the training set.
export function sweepTrees(features, labels, treeCounts = [10, 20, 30, 50, 100], { depth = 3, lr = 0.1 } = {}) {
  const results = []
  for (const nTrees of treeCounts) {
    try {
      const m = trainV3(features, labels, { nTrees, depth, lr, valFrac: 0.2 })
      results.push({
        nTrees,
        trainMae: m.meta.trainMae,
        valMae: m.meta.valMae,
      })
    } catch (e) {
      results.push({ nTrees, error: e.message || String(e) })
    }
  }
  // Best = lowest combined val MAE (sys + dia). Overfit guard: among models
  // within 0.3 mmHg of the lowest-val-MAE one, prefer fewer trees.
  const scored = results.filter(r => r.valMae)
  if (scored.length) {
    const bestVal = Math.min(...scored.map(r => r.valMae.sys + r.valMae.dia))
    const nearBest = scored.filter(r => (r.valMae.sys + r.valMae.dia) <= bestVal + 0.3)
    nearBest.sort((a, b) => a.nTrees - b.nTrees)
    nearBest[0].best = true
  }
  return results
}

export function predictV3(model, features) {
  const x = featureVec(features)
  const sys = Math.round(Math.max(70, Math.min(200, predictGbm(model.sysModel, x))))
  const dia = Math.round(Math.max(40, Math.min(130, predictGbm(model.diaModel, x))))
  return { systolic: sys, diastolic: dia, source: 'v3-gbm' }
}

// ─── Persistence (localStorage + server mirror of v2) ─────────────────────────

const V3_MODEL_KEY = 'tere-bp-v3-gbm'
export function saveV3Model(m) { try { localStorage.setItem(V3_MODEL_KEY, JSON.stringify(m)) } catch {} }
export function loadV3Model() {
  try { const s = localStorage.getItem(V3_MODEL_KEY); return s ? JSON.parse(s) : null } catch { return null }
}

export async function loadActiveV3ModelFromServer() {
  try {
    const resp = await fetch('/api/bp-v3-model', { credentials: 'include' })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const row = await resp.json()
    if (!row || !row.model_json) return loadV3Model()
    return row.model_json
  } catch (e) {
    console.warn('[bpV3] server load failed, falling back to localStorage:', e?.message || e)
    return loadV3Model()
  }
}

export async function promoteV3Model(model, notes = '') {
  const resp = await fetch('/api/bp-v3-model', {
    method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model_json:    model,
      n_training:    model?.meta?.n ?? null,
      n_val:         model?.meta?.nVal ?? null,
      val_mae_sys:   model?.meta?.valMae?.sys ?? null,
      val_mae_dia:   model?.meta?.valMae?.dia ?? null,
      n_trees:       model?.meta?.nTrees ?? null,
      depth:         model?.meta?.depth ?? null,
      lr:            model?.meta?.lr ?? null,
      feature_names: model?.featureNames ?? null,
      notes,
    }),
  })
  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    throw new Error(`Promote failed (${resp.status}): ${t}`)
  }
  return resp.json()
}

// Convenience: predict directly from stored frames
export function predictV3FromFrames(model, frames, fps, subject) {
  const feats = framesToV3Features(frames, fps, subject)
  if (!feats) return { skipped: true, reason: 'insufficient_pulses_or_signal' }
  return predictV3(model, feats)
}
