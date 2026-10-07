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

// ─── 2026-10 additions: features surfaced by 2024-26 rPPG → BP literature ─────

// Full SDPPG fiducial set (Takazawa 1998, re-validated Al-Fahoum/Rizzi 2024-25).
// Returns per-beat {a,b,c,d,e} amplitudes extracted from the second derivative.
// a = first positive peak (early systolic acceleration), b = first negative
// valley after a (deceleration), c = next positive peak (reflected wave early),
// d = next negative valley (late reflected), e = last positive peak (dicrotic
// marker). Beat window = foot_i → foot_{i+1}. Returns {ca,da,ea,agi} medians.
//
// Captures the compliant-aorta regime where hypotensive readings live — the
// single feature `sdppgBA` already in use collapses most of this signal.
function sdppgFullIndices(sdppg, peaks, feet) {
  const cas = [], das = [], eas = [], agis = []
  for (let p = 0; p < peaks.length - 1; p++) {
    const footStart = p > 0 ? feet[p - 1] : null
    const footEnd = feet[p]
    if (footStart == null || footEnd == null || footEnd - footStart < 10) continue
    const extrema = []
    for (let i = footStart + 1; i < footEnd - 1; i++) {
      const prev = sdppg[i - 1], here = sdppg[i], next = sdppg[i + 1]
      if (here > prev && here > next) extrema.push({ idx: i, val: here, sign: +1 })
      else if (here < prev && here < next) extrema.push({ idx: i, val: here, sign: -1 })
    }
    if (extrema.length < 5) continue
    let a = null, b = null, c = null, d = null, e = null
    for (const ex of extrema) {
      if (a == null && ex.sign === +1) { a = ex.val; continue }
      if (a != null && b == null && ex.sign === -1) { b = ex.val; continue }
      if (b != null && c == null && ex.sign === +1) { c = ex.val; continue }
      if (c != null && d == null && ex.sign === -1) { d = ex.val; continue }
      if (d != null && e == null && ex.sign === +1) { e = ex.val; break }
    }
    if (a == null || b == null || c == null || d == null || e == null) continue
    if (Math.abs(a) < 1e-4) continue
    cas.push(c / a)
    das.push(d / a)
    eas.push(e / a)
    agis.push((b - c - d - e) / a)
  }
  return { sdppgCA: median(cas), sdppgDA: median(das), sdppgEA: median(eas), agi: median(agis) }
}

// Inflection-Point Area (Elgendi 2012, re-used Heliyon 2024 top-10 PPG features).
// Three sub-areas across the pulse: A1=foot→peak (systolic rise), A2=peak→notch
// (systolic decay), A3=notch→next-foot (diastolic). IPA = A3 / (A1 + A2). High
// IPA correlates with lower peripheral resistance / more compliant vessels.
function inflectionPointArea(signal, peaks, feet, notches) {
  const ipas = [], a12s = [], a23s = []
  for (let p = 0; p < peaks.length - 1; p++) {
    const nIdx = notches[p]
    const footStart = p > 0 ? feet[p - 1] : null
    const footEnd = feet[p]
    if (nIdx == null || footStart == null || footEnd == null) continue
    if (!(footStart < peaks[p] && peaks[p] < nIdx && nIdx < footEnd)) continue
    const base = Math.min(signal[footStart], signal[footEnd])
    let a1 = 0, a2 = 0, a3 = 0
    for (let i = footStart; i < peaks[p]; i++) a1 += Math.max(0, signal[i] - base)
    for (let i = peaks[p]; i < nIdx; i++)       a2 += Math.max(0, signal[i] - base)
    for (let i = nIdx; i < footEnd; i++)        a3 += Math.max(0, signal[i] - base)
    const denom12 = a1 + a2
    if (denom12 > 0.1) {
      ipas.push(a3 / denom12)
      if (a2 > 0.1) a12s.push(a1 / a2)
      if (a3 > 0.1) a23s.push(a2 / a3)
    }
  }
  return { ipa: median(ipas), a1Over2: median(a12s), a2Over3: median(a23s) }
}

// Generalised pulse-width at an arbitrary height fraction (default 0.5 = PW50).
// PW25 captures late-systolic shoulder shape; PW75 captures peak sharpness. The
// ratio PW75/PW25 is a dimensionless "pulse peakedness" that varies with
// vascular compliance.
function pulseWidthAt(signal, peaks, feet, fps, fraction = 0.5) {
  const widths = []
  for (let p = 0; p < peaks.length - 1; p++) {
    const peakIdx = peaks[p]
    const footStart = p > 0 ? feet[p - 1] : Math.max(0, peakIdx - Math.floor(fps * 0.5))
    const footEnd = feet[p]
    if (footEnd <= peakIdx || peakIdx <= footStart) continue
    const peakVal = signal[peakIdx]
    const base = Math.min(signal[footStart], signal[footEnd])
    const thresh = base + (peakVal - base) * fraction
    let left = null, right = null
    for (let i = footStart; i < peakIdx; i++) {
      if (signal[i] <= thresh && signal[i + 1] > thresh) { left = i; break }
    }
    for (let i = peakIdx; i < footEnd; i++) {
      if (signal[i] >= thresh && signal[i + 1] < thresh) { right = i; break }
    }
    if (left != null && right != null) widths.push((right - left) / fps)
  }
  return median(widths)
}

// Autonomic / baroreflex proxy: ratio of pulse-spectrum power in LF
// (0.04-0.15 Hz) vs HF (0.15-0.4 Hz) sub-cardiac bands. True PRV LF/HF needs
// ≥25 s of IBI series which we do not have per window; the sub-cardiac
// envelope captures a related signal (baroreflex at ~0.1 Hz, respiration
// at ~0.25 Hz). Hypovolaemia + vagal-dominant states (which trend hypotensive)
// shift this ratio.
function autonomicLfHf(signal, fps) {
  const { freqs, power } = spectrumPower(signal, fps)
  let lf = 0, hf = 0
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i] >= 0.04 && freqs[i] < 0.15) lf += power[i]
    else if (freqs[i] >= 0.15 && freqs[i] < 0.40) hf += power[i]
  }
  if (hf < 1e-9) return null
  return lf / hf
}

// Signal moments on the clean pulse — Elgendi "optimal SQI" 2016. Skewness is
// the single best SQI discriminator in that work; low-perfusion (hypotensive)
// beats have characteristically different skew/kurt vs normotensive clean beats.
function signalMoments(signal) {
  const n = signal.length
  if (n < 10) return { skew: null, kurt: null }
  let m = 0
  for (const v of signal) m += v
  m /= n
  let m2 = 0, m3 = 0, m4 = 0
  for (const v of signal) {
    const d = v - m
    m2 += d * d; m3 += d * d * d; m4 += d * d * d * d
  }
  m2 /= n; m3 /= n; m4 /= n
  const sd = Math.sqrt(m2)
  if (sd < 1e-9) return { skew: null, kurt: null }
  return { skew: m3 / (sd * sd * sd), kurt: m4 / (sd * sd * sd * sd) - 3 }
}

// Augmentation Index normalised to HR=75 bpm (Townsend 2015). Classic
// Vicorder/Mobil-O-Graph BP correlate; removes the HR confound of raw AugIndex
// so the gradient-boost can use AugIndex-shape without re-learning HR dependence.
function aix75(augIndexVal, hrVal) {
  if (!Number.isFinite(augIndexVal) || !Number.isFinite(hrVal)) return null
  return augIndexVal + 0.39 * (75 - hrVal) / 100  // scaled to similar magnitude as augIndex
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

  // 2026-10 additions from rPPG literature survey
  const augIndexMed = median(aiVals)
  const sdppgFull = sdppgFullIndices(sdppg, peaks, feet)
  const ipaOut = inflectionPointArea(cleanSignal, peaks, feet, notches)
  const pw25 = pulseWidthAt(cleanSignal, peaks, feet, fps, 0.25)
  const pw75 = pulseWidthAt(cleanSignal, peaks, feet, fps, 0.75)
  const pwRatio = (pw25 != null && pw75 != null && pw25 > 1e-6) ? pw75 / pw25 : null
  const lfhf = autonomicLfHf(cleanSignal, fps)
  const { skew, kurt } = signalMoments(cleanSignal)
  const aixN = aix75(augIndexMed, hr)

  return {
    upstrokeTime:     median(upstrokes),
    augIndex:         augIndexMed,
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
    // 2026-10 additions
    sdppgCA:          sdppgFull.sdppgCA,
    sdppgDA:          sdppgFull.sdppgDA,
    sdppgEA:          sdppgFull.sdppgEA,
    agi:              sdppgFull.agi,
    ipa:              ipaOut.ipa,
    a1Over2:          ipaOut.a1Over2,
    a2Over3:          ipaOut.a2Over3,
    pw25,
    pw75,
    pwRatio,
    lfhf,
    pulseSkew:        skew,
    pulseKurt:        kurt,
    aix75:            aixN,
  }
}

// 2026-10 addition: BP feature extraction from an already-extracted pulse
// waveform (e.g. ME-rPPG output, PhysNet, or any other 1-D BVP signal). Skips
// the POS stage used by framesToV3Features and runs the same window-based
// morphology/HRV/spectral/SDPPG extractor as the POS path. Returned feature
// shape is identical to framesToV3Features so trainV3VariantSweep is a drop-in
// swap.
//
// Called by the rPPG Replay dashboard's "Compare BP variants on ME-rPPG
// features" button once per reading, after replayVideoThroughMeRppgForBp
// decodes the stored scan video.
export function pulseToV3Features(pulseSamples, fps, subject = {}) {
  if (!pulseSamples || pulseSamples.length < fps * 10) return null
  const windowLen = Math.floor(fps * 10)
  const step = Math.floor(windowLen / 2)
  const windows = []
  for (let start = 0; start + windowLen <= pulseSamples.length; start += step) {
    windows.push(Array.from(pulseSamples.slice(start, start + windowLen)))
  }
  if (windows.length === 0) windows.push(Array.from(pulseSamples))

  const perWindow = []
  for (const w of windows) {
    // Treat the input waveform as our "posRaw" — bandpass+zscore matches the
    // POS path so downstream morphology code sees the same signal shape.
    const bp = bandpass(detrend(w), fps, 0.7, 4.0)
    const clean = zscore(bp)
    const sqi = signalQualityIndex(clean, fps)
    if (sqi < 0.15) continue
    const feats = extractV3FeaturesOneWindow(clean, w, fps, subject)
    if (feats) perWindow.push(feats)
  }
  if (perWindow.length === 0) return null

  const keys = ['upstrokeTime','augIndex','pulseWidth50','areaRatio','notchDelay','sdppgBA',
                'hr','hrvSdnn','hrvRmssd','peakToNotchRatio',
                'perfusionIndex','stiffnessIndex','reflectionCoeff','spectralEntropy','sqi',
                'sdppgCA','sdppgDA','sdppgEA','agi',
                'ipa','a1Over2','a2Over3',
                'pw25','pw75','pwRatio',
                'lfhf','pulseSkew','pulseKurt','aix75']
  const out = {}
  const defaults = {
    upstrokeTime: 0.15, augIndex: 0.5, pulseWidth50: 0.35, areaRatio: 1.0, notchDelay: 0.25,
    sdppgBA: -0.6, hr: 70, hrvSdnn: 40, hrvRmssd: 30, peakToNotchRatio: 0.5,
    perfusionIndex: 1.0, stiffnessIndex: 7.0, reflectionCoeff: 0.5, spectralEntropy: 0.5, sqi: 0.3,
    sdppgCA: -0.3, sdppgDA: -0.2, sdppgEA: 0.1, agi: -0.5,
    ipa: 2.0, a1Over2: 0.5, a2Over3: 0.5,
    pw25: 0.5, pw75: 0.2, pwRatio: 0.4,
    lfhf: 1.5, pulseSkew: 0, pulseKurt: 0, aix75: 0.5,
  }
  for (const k of keys) {
    const vals = perWindow.map(w => w[k]).filter(v => Number.isFinite(v))
    out[k] = vals.length > 0 ? median(vals) : defaults[k]
  }
  out._nWindows = perWindow.length
  out._nWindowsTried = windows.length
  out.age = Number(subject.age) || Number(subject.patient_age) || 40
  out.sex = (subject.sex === 'male' || subject.patient_sex === 'male') ? 1 : 0
  return out
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
                'perfusionIndex','stiffnessIndex','reflectionCoeff','spectralEntropy','sqi',
                // 2026-10 additions
                'sdppgCA','sdppgDA','sdppgEA','agi',
                'ipa','a1Over2','a2Over3',
                'pw25','pw75','pwRatio',
                'lfhf','pulseSkew','pulseKurt','aix75']
  const out = {}
  const defaults = {
    upstrokeTime: 0.15, augIndex: 0.5, pulseWidth50: 0.35, areaRatio: 1.0, notchDelay: 0.25,
    sdppgBA: -0.6, hr: 70, hrvSdnn: 40, hrvRmssd: 30, peakToNotchRatio: 0.5,
    perfusionIndex: 1.0, stiffnessIndex: 7.0, reflectionCoeff: 0.5, spectralEntropy: 0.5, sqi: 0.3,
    // 2026-10 defaults — SDPPG ratios anchored to healthy-adult norms (Takazawa);
    // morphology ratios + widths anchored to the dataset-wide expected medians.
    sdppgCA: -0.3, sdppgDA: -0.2, sdppgEA: 0.1, agi: -0.5,
    ipa: 2.0, a1Over2: 0.5, a2Over3: 0.5,
    pw25: 0.5, pw75: 0.2, pwRatio: 0.4,
    lfhf: 1.5, pulseSkew: 0, pulseKurt: 0, aix75: 0.5,
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

// IMPORTANT: features are index-addressed in trained models — new features MUST
// be appended, never inserted mid-list. The current prod model's trees reference
// `age`/`sex` at indices 15/16; shifting those indices silently serves wrong
// predictions. All 2026-10 additions therefore go AFTER age/sex.
const FEATURE_NAMES_V3 = [
  'upstrokeTime','augIndex','pulseWidth50','areaRatio','notchDelay','sdppgBA',
  'hr','hrvSdnn','hrvRmssd','peakToNotchRatio',
  'perfusionIndex','stiffnessIndex','reflectionCoeff','spectralEntropy','sqi',
  'age','sex',
  // 2026-10 additions from rPPG literature survey (14 new features — appended
  // so index-addressed prod models trained pre-2026-10 keep working)
  'sdppgCA','sdppgDA','sdppgEA','agi',
  'ipa','a1Over2','a2Over3',
  'pw25','pw75','pwRatio',
  'lfhf','pulseSkew','pulseKurt','aix75',
]

function featureVec(f) { return FEATURE_NAMES_V3.map(k => f[k]) }

// Grow one regression tree by greedy weighted variance reduction. depth=0 → leaf.
// Weights allow tail samples (hypertensives) to pull more at every split so the
// leaves don't average them into mean-regression. Pass weights=null for unweighted.
function growTree(X, y, w, depth, minLeaf = 3) {
  const n = y.length
  const weights = w || new Array(n).fill(1)
  let totalW = 0, sumWY = 0
  for (let i = 0; i < n; i++) { totalW += weights[i]; sumWY += weights[i] * y[i] }
  const meanY = totalW > 0 ? sumWY / totalW : 0
  if (depth === 0 || n <= minLeaf) {
    return { leaf: true, value: meanY }
  }
  let bestFeat = -1, bestThr = 0, bestGain = 0
  let totalVar = 0
  for (let i = 0; i < n; i++) totalVar += weights[i] * (y[i] - meanY) ** 2
  for (let f = 0; f < X[0].length; f++) {
    const vals = X.map(row => row[f])
    const sorted = [...new Set(vals)].sort((a, b) => a - b)
    for (let i = 0; i < sorted.length - 1; i++) {
      const thr = (sorted[i] + sorted[i + 1]) / 2
      let lY = [], rY = [], lW = [], rW = []
      for (let k = 0; k < n; k++) {
        if (X[k][f] <= thr) { lY.push(y[k]); lW.push(weights[k]) }
        else                { rY.push(y[k]); rW.push(weights[k]) }
      }
      if (lY.length < minLeaf || rY.length < minLeaf) continue
      let lTotW = 0, lSumWY = 0, rTotW = 0, rSumWY = 0
      for (let m = 0; m < lY.length; m++) { lTotW += lW[m]; lSumWY += lW[m] * lY[m] }
      for (let m = 0; m < rY.length; m++) { rTotW += rW[m]; rSumWY += rW[m] * rY[m] }
      const lMean = lTotW > 0 ? lSumWY / lTotW : 0
      const rMean = rTotW > 0 ? rSumWY / rTotW : 0
      let lVar = 0, rVar = 0
      for (let m = 0; m < lY.length; m++) lVar += lW[m] * (lY[m] - lMean) ** 2
      for (let m = 0; m < rY.length; m++) rVar += rW[m] * (rY[m] - rMean) ** 2
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
    left:  growTree(lIdx.map(i => X[i]), lIdx.map(i => y[i]), lIdx.map(i => weights[i]), depth - 1, minLeaf),
    right: growTree(rIdx.map(i => X[i]), rIdx.map(i => y[i]), rIdx.map(i => weights[i]), depth - 1, minLeaf),
  }
}

function predictTree(tree, x) {
  while (!tree.leaf) tree = x[tree.feature] <= tree.threshold ? tree.left : tree.right
  return tree.value
}

// Fit a single BP output (sys OR dia) with gradient boosting on regression
// trees. Returns { init, trees[], lr }. Prediction = init + lr * Σ trees.
// `weights` lets tail samples pull leaves harder — critical to stop the GBM
// from mean-regressing hypertensives into the training mean. Pass null for
// uniform weighting.
//
// 2026-10 additions from imbalanced-regression survey:
//
// lossMode:
//   'mse'      (default) — pseudo-residual = y − ŷ (standard GBM / L2 boosting)
//   'quantile' — pseudo-residual = sign(y − ŷ) at τ=0.5 (L1/LAD boosting,
//                converges to conditional median; less mean-pulled than MSE
//                on skewed targets).
//
// asymPenaltyMode:
//   'highOnly' (legacy) — amplify residual whenever (y > ŷ). Only correct for
//                         hypertensive misses. Keeps backward-compat.
//   'tailAware'         — amplify over-prediction on the low tail AND
//                         under-prediction on the high tail, with per-head
//                         thresholds supplied in `lowThr` / `highThr`. Fixes
//                         the paradox where the one-sided penalty actively
//                         degrades Low MAE because it pushes predictions up.
function fitGbm(X, y, weights, {
  nTrees = 50, depth = 3, lr = 0.1,
  asymmetricPenalty = 1.0,
  asymPenaltyMode = 'highOnly',
  lowThr = 110, highThr = 140,
  lossMode = 'mse',
} = {}) {
  // Weighted mean for init so the first tree's residuals aren't biased.
  let totalW = 0, sumWY = 0
  const w = weights || new Array(y.length).fill(1)
  for (let i = 0; i < y.length; i++) { totalW += w[i]; sumWY += w[i] * y[i] }
  const init = totalW > 0 ? sumWY / totalW : y.reduce((a, b) => a + b, 0) / y.length
  // Running predictions so we can detect under-prediction per round.
  const preds = new Array(y.length).fill(init)
  const residuals = new Array(y.length)
  for (let i = 0; i < y.length; i++) residuals[i] = y[i] - preds[i]
  const trees = []
  for (let t = 0; t < nTrees; t++) {
    // Convert residuals to pseudo-residuals per loss mode.
    let working
    if (lossMode === 'quantile') {
      // L1-boosting at τ=0.5. Each sample contributes a unit step in the
      // sign of its residual; leaves converge to the weighted median.
      working = residuals.map(r => Math.sign(r) * 0.5)
    } else {
      working = residuals
    }
    // Apply asymmetric penalty on top of the chosen loss mode.
    if (asymmetricPenalty > 1) {
      if (asymPenaltyMode === 'tailAware') {
        working = working.map((r, i) => {
          const yi = y[i]
          // Over-predicting a hypotensive (we think they're normal, they're not)
          if (yi < lowThr && r < 0) return r * asymmetricPenalty
          // Under-predicting a hypertensive (we think they're normal, they're not)
          if (yi >= highThr && r > 0) return r * asymmetricPenalty
          return r
        })
      } else {
        working = working.map(r => r > 0 ? r * asymmetricPenalty : r)
      }
    }
    const tree = growTree(X, working, w, depth)
    trees.push(tree)
    for (let i = 0; i < y.length; i++) {
      const step = lr * predictTree(tree, X[i])
      preds[i] += step
      residuals[i] = y[i] - preds[i]
    }
  }
  return { init, trees, lr }
}

// ─── Phi-relevance + SERA weighting (Silva/Ribeiro 2022) ──────────────────────
//
// Relevance function phi(y) ∈ [0,1] that assigns high weight to tail labels and
// low weight to normotensive mass. Implemented as a double-sigmoid centred on
// the clinical tail boundaries (low 110, high 160 for SBP; low 60, high 90 for
// DBP). Softer than a hard-threshold phi so the gradient stays smooth and the
// GBM doesn't develop a step at the boundary.
//
// SERA (Squared-Error-Relevance-Area): gradient becomes 2·phi(y)·(ŷ−y) and
// hessian 2·phi(y). In our weight-based GBM that is exactly equivalent to
// per-sample weight = phi(y) — hence SERA slots in as a `weightingMode='sera'`
// instead of needing a bespoke loss. Reference: Silva/Ribeiro et al. 2022
// "Model Optimization in Imbalanced Regression" (arXiv:2206.09991), TMLR.
function phiRelevance(labelsSubset, idx, lowCentre, highCentre, slope = 5) {
  // Base weight 0.2 for normals, up to ~1.0 at the tail centres and beyond.
  // Keeps a nonzero contribution from normals so leaves can still estimate the
  // conditional mean in the dense band.
  return labelsSubset.map(l => {
    const y = l[idx]
    const lowSig  = 1 / (1 + Math.exp((y - lowCentre) / slope))
    const highSig = 1 / (1 + Math.exp((highCentre - y) / slope))
    return 0.2 + 0.8 * Math.max(lowSig, highSig)
  })
}

// ─── SMOGN (Branco 2017) tail synthesis — model-agnostic preprocessing ────────
//
// For each rare training sample (phi(y) above a relevance threshold) generate K
// synthetic rows by linearly interpolating between the sample and one of its
// k-NN rare neighbours, then adding small Gaussian noise. Target label is
// interpolated too. Used BEFORE training so any downstream GBM/loss sees the
// expanded dataset.
//
// 2026 benchmarks (CARTGen-IR, WSMOTER papers) consistently show preprocessing
// synthesis is the single biggest tail-MAE win per hour of work.
function smognAugment(features, labels, subjectIds, {
  k = 5, oversampleFactor = 3, noiseFrac = 0.05,
  lowThrSys = 110, highThrSys = 160,
} = {}) {
  const idxs = []
  for (let i = 0; i < labels.length; i++) {
    const s = labels[i][0]
    if (s < lowThrSys || s >= highThrSys) idxs.push(i)
  }
  if (idxs.length < 2) return { features, labels, subjectIds }  // nothing to synthesise

  const outF = [...features]
  const outL = [...labels]
  const outS = subjectIds ? [...subjectIds] : null

  // Pre-vectorise features for distance calc (reuse featureVec).
  const vecs = idxs.map(i => featureVec(features[i]))

  // Simple z-score normalisation per feature across the rare pool.
  const dim = vecs[0].length
  const mu = new Array(dim).fill(0), sd = new Array(dim).fill(0)
  for (let d = 0; d < dim; d++) {
    for (const v of vecs) mu[d] += (Number.isFinite(v[d]) ? v[d] : 0)
    mu[d] /= vecs.length
  }
  for (let d = 0; d < dim; d++) {
    for (const v of vecs) sd[d] += ((Number.isFinite(v[d]) ? v[d] : mu[d]) - mu[d]) ** 2
    sd[d] = Math.sqrt(sd[d] / vecs.length) || 1
  }
  const znorm = v => v.map((x, d) => ((Number.isFinite(x) ? x : mu[d]) - mu[d]) / sd[d])
  const zvecs = vecs.map(znorm)

  for (let anchor = 0; anchor < idxs.length; anchor++) {
    const anchorIdx = idxs[anchor]
    // k-NN among other rare samples (euclidean on z-normalised features).
    const dists = []
    for (let j = 0; j < zvecs.length; j++) {
      if (j === anchor) continue
      let d2 = 0
      for (let f = 0; f < dim; f++) {
        const diff = zvecs[anchor][f] - zvecs[j][f]
        d2 += diff * diff
      }
      dists.push({ j, d: d2 })
    }
    dists.sort((a, b) => a.d - b.d)
    const neighbours = dists.slice(0, Math.min(k, dists.length))

    for (let r = 0; r < oversampleFactor; r++) {
      if (neighbours.length === 0) break
      const nb = neighbours[r % neighbours.length]
      const partner = idxs[nb.j]
      const t = Math.random()  // interpolation factor
      const newF = {}
      for (const key of Object.keys(features[anchorIdx])) {
        const a = features[anchorIdx][key]
        const b = features[partner][key]
        if (typeof a === 'number' && typeof b === 'number') {
          const base = a + t * (b - a)
          const noise = (Math.random() - 0.5) * noiseFrac * Math.abs(base || 1)
          newF[key] = base + noise
        } else {
          newF[key] = a  // non-numeric fields copied as-is (e.g. _nWindows)
        }
      }
      const newSys = labels[anchorIdx][0] + t * (labels[partner][0] - labels[anchorIdx][0])
      const newDia = labels[anchorIdx][1] + t * (labels[partner][1] - labels[anchorIdx][1])
      outF.push(newF)
      outL.push([newSys, newDia])
      if (outS) outS.push(subjectIds[anchorIdx] + '_syn')
    }
  }
  return { features: outF, labels: outL, subjectIds: outS }
}

// ─── Stratified-by-SBP-band + subject-grouped val split ───────────────────────
//
// Replaces the random seeded shuffle. Buckets labels into (<110, 110-139, ≥140)
// and takes `valFrac` from each bucket, ensuring the Low band is never empty.
// If subjectIds supplied, ensures no subject appears in both train and val.
// Deterministic via multiplicative hash (same seed recipe as the random path).
function stratifiedSplit(labels, valFrac = 0.2, subjectIds = null, lowThr = 110, highThr = 140) {
  const n = labels.length
  const buckets = { low: [], mid: [], high: [] }
  for (let i = 0; i < n; i++) {
    const s = labels[i][0]
    if (s < lowThr) buckets.low.push(i)
    else if (s >= highThr) buckets.high.push(i)
    else buckets.mid.push(i)
  }
  // Deterministic shuffle per bucket.
  const shuf = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (i * 2654435761 >>> 0) % (i + 1)
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }
  const trainIdx = [], valIdx = []
  const seenValSubjects = new Set()
  for (const key of ['low', 'mid', 'high']) {
    const b = shuf([...buckets[key]])
    const nValBucket = Math.max(1, Math.round(b.length * valFrac))
    let placed = 0
    for (let i = 0; i < b.length; i++) {
      const idx = b[i]
      const subj = subjectIds ? subjectIds[idx] : null
      if (placed < nValBucket && (!subj || !seenValSubjects.has(subj))) {
        valIdx.push(idx)
        if (subj) seenValSubjects.add(subj)
        placed++
      } else {
        trainIdx.push(idx)
      }
    }
  }
  // If subject grouping bumped a sample from val to train, enforce train-side
  // subject exclusion too.
  if (subjectIds) {
    const trainFiltered = []
    for (const idx of trainIdx) {
      if (!seenValSubjects.has(subjectIds[idx])) trainFiltered.push(idx)
    }
    return { trainIdx: trainFiltered, valIdx }
  }
  return { trainIdx, valIdx }
}

// Per-sample tail weights for sys-BP training. Anchored to NZ adult population
// (SBP mean 120, SD 15) NOT the training mean — attackers (or imbalanced data)
// can't shift the anchor. Linear growth beyond ~0.7σ from the mean so normals
// stay at weight 1 and hypertensives (sys≈170 → z≈3.3) get ~6-7× pull.
//
// tailBoost controls aggressiveness: 0 = uniform (unchanged behaviour), 2 =
// strong tail pull (default), higher = model follows tails harder but risks
// overshooting normal patients. 2 is a sane start for the current dataset.
function tailWeightsSys(labels, tailBoost = 2.0) {
  const SYS_MEAN = 120, SYS_SIGMA = 15
  return labels.map(l => {
    const z = Math.abs(l[0] - SYS_MEAN) / SYS_SIGMA
    return 1 + tailBoost * Math.max(0, z - 0.7)
  })
}

// Same recipe for dia. Anchor DBP mean 75, SD 10. Hypertensive-urgency DBP
// 115 → z=4 → weight ~7.6× at default boost.
function tailWeightsDia(labels, tailBoost = 2.0) {
  const DIA_MEAN = 75, DIA_SIGMA = 10
  return labels.map(l => {
    const z = Math.abs(l[1] - DIA_MEAN) / DIA_SIGMA
    return 1 + tailBoost * Math.max(0, z - 0.7)
  })
}

// LDS (Label Distribution Smoothing, Yang et al. ICML 2021). Instead of
// linearly amplifying by z-score (what tailBoost does), LDS estimates the
// EFFECTIVE label density by Gaussian-kernel-smoothing the empirical
// histogram, then weights each sample inversely proportional to its smoothed
// density. Normotensive-dense regions get down-weighted; sparse hypertensive
// and low-normal tails get up-weighted. More formally correct than tailBoost
// for mixed-sparsity distributions. Returns weights normalised so mean = 1.
function tailWeightsLDS(labels, idx, { kernelSigma = 12, maxWeight = 10, binWidth = 5 } = {}) {
  const vals = labels.map(l => l[idx])
  const minV = Math.min(...vals), maxV = Math.max(...vals)
  // Bin the labels.
  const nBins = Math.max(2, Math.ceil((maxV - minV) / binWidth) + 1)
  const bins = new Array(nBins).fill(0)
  for (const v of vals) {
    const b = Math.min(nBins - 1, Math.floor((v - minV) / binWidth))
    bins[b]++
  }
  // Gaussian-smooth the histogram.
  const kernelRadius = Math.max(1, Math.ceil(kernelSigma / binWidth * 3))
  const smoothed = new Array(nBins).fill(0)
  for (let i = 0; i < nBins; i++) {
    let num = 0, den = 0
    for (let j = Math.max(0, i - kernelRadius); j <= Math.min(nBins - 1, i + kernelRadius); j++) {
      const dist = (j - i) * binWidth
      const k = Math.exp(-(dist * dist) / (2 * kernelSigma * kernelSigma))
      num += k * bins[j]
      den += k
    }
    smoothed[i] = den > 0 ? num / den : 0
  }
  // Weight = 1 / smoothed_density (inverse of effective frequency).
  const rawWeights = vals.map(v => {
    const b = Math.min(nBins - 1, Math.floor((v - minV) / binWidth))
    return smoothed[b] > 0 ? 1 / smoothed[b] : maxWeight
  })
  // Clamp + normalise so mean weight = 1 (keeps overall learning rate stable).
  const clamped = rawWeights.map(w => Math.min(maxWeight, w))
  const mean = clamped.reduce((a, b) => a + b, 0) / clamped.length
  return clamped.map(w => w / mean)
}

// Subject-level reweighting. Each unique subject contributes equally to the
// training signal — stops longitudinal subjects (TERE-003 with 20 scans)
// from dominating single-scan subjects (TERE-190 with 1 scan). Pass
// subjectIds parallel to labels. Weight = 1 / countOfSubject.
function subjectLevelWeights(subjectIds) {
  const counts = {}
  for (const id of subjectIds) counts[id] = (counts[id] || 0) + 1
  return subjectIds.map(id => 1 / counts[id])
}

function predictGbm(model, x) {
  let s = model.init
  for (const tree of model.trees) s += model.lr * predictTree(tree, x)
  return s
}

// Train v3: feature extraction already done. labels = [[sys, dia], ...].
// tailBoost controls hypertensive sample weighting. 0 = uniform (legacy
// behaviour before this change). Default 2.0 = ~6-7× pull at sys 170 /
// dia 115. Set via `tailBoost: n` in the options object.
//
// weightingMode:
//   'tailBoost' (default) — linear z-score amplification, capped by tailBoost
//   'lds'                 — kernel-smoothed inverse density (Yang 2021).
//                           More principled on multi-tail distributions.
//   'subject'             — equalise contribution per unique subject, needs
//                           subjectIds option.
//   'none'                — uniform weights.
//
// asymmetricPenalty > 1 amplifies under-prediction residuals during training.
// 3.0 is a reasonable clinical setting (missing high BP is 3× worse than
// over-flagging). Default 1.0 = symmetric.
export function trainV3(features, labels, {
  nTrees = 50, depth = 3, lr = 0.1, valFrac = 0.2,
  tailBoost = 2.0,
  weightingMode = 'tailBoost',
  asymmetricPenalty = 1.0,
  asymPenaltyMode = 'highOnly',
  lossMode = 'mse',
  splitMode = 'random',      // 'random' | 'stratified'
  subjectIds = null,
  smogn = false,             // run SMOGN tail synthesis on the training half
  smognOversample = 3,
} = {}) {
  if (features.length < 20) throw new Error('need ≥20 training samples')
  const n = features.length
  const nVal = Math.max(1, Math.round(n * valFrac))

  // Choose split strategy.
  let trainIdx, valIdx
  if (splitMode === 'stratified') {
    const sp = stratifiedSplit(labels, valFrac, subjectIds)
    trainIdx = sp.trainIdx; valIdx = sp.valIdx
  } else {
    // Seeded shuffle (same recipe as v2 for comparability).
    const order = Array.from({ length: n }, (_, i) => i)
    for (let i = n - 1; i > 0; i--) {
      const j = (i * 2654435761 >>> 0) % (i + 1)
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    trainIdx = order.slice(nVal)
    valIdx   = order.slice(0, nVal)
  }

  // Build train-side arrays. SMOGN runs on the train split only — val must
  // stay untouched for honest MAE.
  let trainFeats = trainIdx.map(i => features[i])
  let trainLabels = trainIdx.map(i => labels[i])
  let trainSubjectIds = subjectIds ? trainIdx.map(i => subjectIds[i]) : null
  if (smogn) {
    const aug = smognAugment(trainFeats, trainLabels, trainSubjectIds, { oversampleFactor: smognOversample })
    trainFeats = aug.features
    trainLabels = aug.labels
    trainSubjectIds = aug.subjectIds
  }

  const X_train = trainFeats.map(f => featureVec(f))
  const y_sys   = trainLabels.map(l => l[0])
  const y_dia   = trainLabels.map(l => l[1])

  // Choose weighting strategy. Each sys/dia head gets its own weight vector
  // because the two tails live at different distances from mean.
  let sysW, diaW
  if (weightingMode === 'lds') {
    sysW = tailWeightsLDS(trainLabels, 0, { kernelSigma: 12 })
    diaW = tailWeightsLDS(trainLabels, 1, { kernelSigma: 8 })
  } else if (weightingMode === 'sera') {
    sysW = phiRelevance(trainLabels, 0, 110, 160, 5)
    diaW = phiRelevance(trainLabels, 1, 60, 90, 3)
  } else if (weightingMode === 'subject' && trainSubjectIds) {
    const subjW = subjectLevelWeights(trainSubjectIds)
    sysW = subjW; diaW = subjW
  } else if (weightingMode === 'none') {
    sysW = null; diaW = null
  } else {
    sysW = tailBoost > 0 ? tailWeightsSys(trainLabels, tailBoost) : null
    diaW = tailBoost > 0 ? tailWeightsDia(trainLabels, tailBoost) : null
  }

  const sysOpts = { nTrees, depth, lr, asymmetricPenalty, asymPenaltyMode, lossMode, lowThr: 110, highThr: 140 }
  const diaOpts = { nTrees, depth, lr, asymmetricPenalty, asymPenaltyMode, lossMode, lowThr: 60,  highThr: 90  }
  const sysModel = fitGbm(X_train, y_sys, sysW, sysOpts)
  const diaModel = fitGbm(X_train, y_dia, diaW, diaOpts)

  // Train MAE
  let maeSysT = 0, maeDiaT = 0
  for (let i = 0; i < X_train.length; i++) {
    maeSysT += Math.abs(predictGbm(sysModel, X_train[i]) - y_sys[i])
    maeDiaT += Math.abs(predictGbm(diaModel, X_train[i]) - y_dia[i])
  }
  maeSysT /= X_train.length; maeDiaT /= X_train.length

  // Val MAE on held-out — overall + split by BP band so we can see if the
  // tail-boost actually improved hypertensive accuracy without regressing normals.
  const X_val = valIdx.map(i => featureVec(features[i]))
  const y_sysV = valIdx.map(i => labels[i][0])
  const y_diaV = valIdx.map(i => labels[i][1])
  let maeSysV = 0, maeDiaV = 0
  let errSysHigh = [], errSysNorm = [], errSysLow = []
  let errSysHighSigned = []  // signed error for high band — negative = under-predict (clinical risk)
  let errSysLowSigned = []   // signed error for low band  — positive = over-predict (clinical risk)
  for (let i = 0; i < X_val.length; i++) {
    const predS = predictGbm(sysModel, X_val[i])
    const predD = predictGbm(diaModel, X_val[i])
    const eS = Math.abs(predS - y_sysV[i])
    const eD = Math.abs(predD - y_diaV[i])
    maeSysV += eS
    maeDiaV += eD
    if (y_sysV[i] >= 140) { errSysHigh.push(eS); errSysHighSigned.push(predS - y_sysV[i]) }
    else if (y_sysV[i] < 110) { errSysLow.push(eS); errSysLowSigned.push(predS - y_sysV[i]) }
    else errSysNorm.push(eS)
  }
  maeSysV /= X_val.length; maeDiaV /= X_val.length
  const mean = arr => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null
  const maeSysHigh = mean(errSysHigh)
  const maeSysNorm = mean(errSysNorm)
  const maeSysLow  = mean(errSysLow)
  const biasSysHigh = mean(errSysHighSigned)  // negative = systematic under-prediction (bad)
  const biasSysLow  = mean(errSysLowSigned)   // positive = systematic over-prediction (bad — collapses hypotensives into mean)

  return {
    sysModel, diaModel,
    featureNames: FEATURE_NAMES_V3,
    meta: {
      n: X_train.length, nVal: X_val.length,
      trainMae: { sys: +maeSysT.toFixed(1), dia: +maeDiaT.toFixed(1) },
      valMae:   { sys: +maeSysV.toFixed(1), dia: +maeDiaV.toFixed(1) },
      valMaeSysByBand: {
        high_ge_140: maeSysHigh,
        normal_110_139: maeSysNorm,
        low_lt_110: maeSysLow,
        nHigh: errSysHigh.length, nNormal: errSysNorm.length, nLow: errSysLow.length,
        biasHigh: biasSysHigh,
        biasLow: biasSysLow,
      },
      weightingMode, tailBoost, asymmetricPenalty,
      asymPenaltyMode, lossMode, splitMode, smogn,
      nTrees, depth, lr,
      trainedAt: new Date().toISOString(),
    },
  }
}

// ─── Mixture-of-Experts BP model (Dec 2025 cuffless-BP MoE paper) ─────────────
//
// Trains three sub-models on the SAME split:
//   (a) router        — binary GBM, labels = {y_sys < 110}, predicts P(low)
//   (b) low specialist — regression GBM trained ONLY on sys<115 (buffer=+5)
//                        with SMOGN augmentation; dedicated to the hypotensive
//                        regime where the generalist collapses to the mean
//   (c) generalist     — standard LDS-weighted GBM across the full dataset
//
// At inference: predict P(low) via router; if > 0.5 use specialist, else
// generalist. Soft-blend variant below.
export function trainV3MoE(features, labels, subjectIds, {
  nTrees = 20, depth = 3, lr = 0.1, valFrac = 0.2,
  routerThreshold = 0.5,
  lowBuffer = 5,
} = {}) {
  if (features.length < 20) throw new Error('need ≥20 training samples')
  const sp = stratifiedSplit(labels, valFrac, subjectIds)
  const trainIdx = sp.trainIdx, valIdx = sp.valIdx
  const trainFeats  = trainIdx.map(i => features[i])
  const trainLabels = trainIdx.map(i => labels[i])
  const trainSubjs  = subjectIds ? trainIdx.map(i => subjectIds[i]) : null

  // Router: binary GBM, isLow = sys < 110.
  const routerY = trainLabels.map(l => l[0] < 110 ? 1 : 0)
  const X_all = trainFeats.map(f => featureVec(f))
  const routerModel = fitGbm(X_all, routerY, null, { nTrees, depth, lr })

  // Low specialist: only sys < 115 (+5 buffer); SMOGN-augmented.
  const lowKeep = []
  for (let i = 0; i < trainLabels.length; i++) if (trainLabels[i][0] < 110 + lowBuffer) lowKeep.push(i)
  let lowFeats = lowKeep.map(i => trainFeats[i])
  let lowLabels = lowKeep.map(i => trainLabels[i])
  let lowSubjs = trainSubjs ? lowKeep.map(i => trainSubjs[i]) : null
  if (lowFeats.length >= 10) {
    const aug = smognAugment(lowFeats, lowLabels, lowSubjs, { oversampleFactor: 4 })
    lowFeats = aug.features; lowLabels = aug.labels; lowSubjs = aug.subjectIds
  }
  const X_low = lowFeats.map(f => featureVec(f))
  const sysSpec = lowFeats.length >= 10
    ? fitGbm(X_low, lowLabels.map(l => l[0]), phiRelevance(lowLabels, 0, 110, 160), { nTrees, depth, lr })
    : null
  const diaSpec = lowFeats.length >= 10
    ? fitGbm(X_low, lowLabels.map(l => l[1]), phiRelevance(lowLabels, 1, 60, 90),   { nTrees, depth, lr })
    : null

  // Generalist: LDS-weighted on full training set.
  const sysGen = fitGbm(X_all, trainLabels.map(l => l[0]), tailWeightsLDS(trainLabels, 0, { kernelSigma: 12 }),
    { nTrees, depth, lr })
  const diaGen = fitGbm(X_all, trainLabels.map(l => l[1]), tailWeightsLDS(trainLabels, 1, { kernelSigma: 8  }),
    { nTrees, depth, lr })

  const predMoE = (x) => {
    const p = predictGbm(routerModel, x)
    const useSpec = sysSpec && p > routerThreshold
    const sys = useSpec ? predictGbm(sysSpec, x) : predictGbm(sysGen, x)
    const dia = useSpec ? predictGbm(diaSpec, x) : predictGbm(diaGen, x)
    return { sys, dia, pLow: p, routed: useSpec ? 'specialist' : 'generalist' }
  }

  // Val MAE under the MoE routing.
  const X_val = valIdx.map(i => featureVec(features[i]))
  const y_sysV = valIdx.map(i => labels[i][0])
  const y_diaV = valIdx.map(i => labels[i][1])
  let maeSysV = 0, maeDiaV = 0
  let errHigh = [], errNorm = [], errLow = [], errHighS = [], errLowS = []
  let routedSpec = 0
  for (let i = 0; i < X_val.length; i++) {
    const out = predMoE(X_val[i])
    if (out.routed === 'specialist') routedSpec++
    const eS = Math.abs(out.sys - y_sysV[i])
    const eD = Math.abs(out.dia - y_diaV[i])
    maeSysV += eS; maeDiaV += eD
    if      (y_sysV[i] >= 140) { errHigh.push(eS); errHighS.push(out.sys - y_sysV[i]) }
    else if (y_sysV[i] <  110) { errLow.push(eS);  errLowS.push(out.sys - y_sysV[i])  }
    else                        errNorm.push(eS)
  }
  maeSysV /= X_val.length; maeDiaV /= X_val.length
  const mean = arr => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null

  return {
    routerModel, sysSpec, diaSpec, sysGen, diaGen,
    featureNames: FEATURE_NAMES_V3,
    predMoE,
    meta: {
      n: trainIdx.length, nVal: X_val.length,
      valMae: { sys: +maeSysV.toFixed(1), dia: +maeDiaV.toFixed(1) },
      valMaeSysByBand: {
        high_ge_140: mean(errHigh),
        normal_110_139: mean(errNorm),
        low_lt_110: mean(errLow),
        nHigh: errHigh.length, nNormal: errNorm.length, nLow: errLow.length,
        biasHigh: mean(errHighS),
        biasLow:  mean(errLowS),
      },
      weightingMode: 'moe',
      routedSpec, routedGen: X_val.length - routedSpec,
      specialistTrainN: lowFeats.length,
      nTrees, depth, lr,
      trainedAt: new Date().toISOString(),
    },
  }
}

// Variant sweep — train multiple weighting/loss combinations on the SAME
// seeded split and surface per-variant val MAE across BP bands. Use this to
// A/B test imbalanced-regression methods without having to promote models
// to prod. Returns an array of { label, meta } ready for leaderboard display.
export function trainV3VariantSweep(features, labels, subjectIds, { nTrees = 20, depth = 3, lr = 0.1 } = {}) {
  const common = { nTrees, depth, lr, valFrac: 0.2 }
  const variants = [
    // ─── Legacy variants (kept for continuity with the pre-2026-10 leaderboard) ───
    { label: 'Baseline (tailBoost=2)',       opts: { ...common, weightingMode: 'tailBoost', tailBoost: 2 } },
    { label: 'tailBoost=4 (cap)',            opts: { ...common, weightingMode: 'tailBoost', tailBoost: 4 } },
    { label: 'tailBoost=6 (over-cap)',       opts: { ...common, weightingMode: 'tailBoost', tailBoost: 6 } },
    { label: 'tailBoost=8 (aggressive)',     opts: { ...common, weightingMode: 'tailBoost', tailBoost: 8 } },
    { label: 'LDS (kernel density)',         opts: { ...common, weightingMode: 'lds' } },
    { label: 'LDS + asymmetric 3×',          opts: { ...common, weightingMode: 'lds', asymmetricPenalty: 3 } },
    { label: 'tailBoost=4 + asymmetric 3×',  opts: { ...common, weightingMode: 'tailBoost', tailBoost: 4, asymmetricPenalty: 3 } },
    { label: 'Subject-equalised + tB=2',     opts: { ...common, weightingMode: 'subject', tailBoost: 2, subjectIds } },

    // ─── 2026-10 additions from literature survey ──────────────────────────────
    // Fix for the one-sided asymmetric bug: amplify over-prediction on low tail
    // AND under-prediction on high tail. Expected to lift Low MAE where the
    // previous "LDS + asymmetric 3×" variant actively degraded it.
    { label: 'LDS + tail-aware asym 3×',     opts: { ...common, weightingMode: 'lds',
                                                     asymmetricPenalty: 3, asymPenaltyMode: 'tailAware' } },
    // SERA loss (Silva/Ribeiro 2022, TMLR) — phi-weighted gradient, tree-native,
    // the single most-cited GBM-native imbalanced-regression loss.
    { label: 'SERA (phi-weighted)',          opts: { ...common, weightingMode: 'sera' } },
    { label: 'SERA + tail-aware asym 3×',    opts: { ...common, weightingMode: 'sera',
                                                     asymmetricPenalty: 3, asymPenaltyMode: 'tailAware' } },
    // SMOGN preprocessing (Branco 2017; 2026 benchmarks confirm top-of-family) —
    // synthesises 3× extra low-tail samples before training.
    { label: 'SMOGN + tB=2',                 opts: { ...common, weightingMode: 'tailBoost', tailBoost: 2,
                                                     smogn: true, smognOversample: 3, subjectIds } },
    { label: 'SMOGN + SERA',                 opts: { ...common, weightingMode: 'sera',
                                                     smogn: true, smognOversample: 3, subjectIds } },
    // Quantile GBM at τ=0.5 (L1/LAD boosting). Median prediction less mean-pulled
    // than MSE conditional mean on skewed targets.
    { label: 'Quantile τ=0.5 + LDS',         opts: { ...common, weightingMode: 'lds', lossMode: 'quantile' } },
    // Stratified-by-SBP-band val split — fixes the Low MAE 22.5 tie across many
    // variants (same ~2-5 low val samples each time). Also honest baseline for CI.
    { label: 'Stratified val + LDS',         opts: { ...common, weightingMode: 'lds', splitMode: 'stratified', subjectIds } },
    { label: 'Stratified + SMOGN + SERA',    opts: { ...common, weightingMode: 'sera',
                                                     splitMode: 'stratified',
                                                     smogn: true, smognOversample: 3, subjectIds } },
    // Full stack: everything the two surveys recommend, in one bundle.
    { label: '★ Full stack (strat+SMOGN+SERA+tailAware)',
      opts: { ...common, weightingMode: 'sera', splitMode: 'stratified',
              smogn: true, smognOversample: 3,
              asymmetricPenalty: 3, asymPenaltyMode: 'tailAware', subjectIds } },
  ]
  const results = []
  for (const v of variants) {
    try {
      const m = trainV3(features, labels, v.opts)
      // Keep the trained models so a winner can be promoted straight from the
      // sweep leaderboard without re-training. Previously we dropped them —
      // RppgReplay.jsx needs them to call promoteV3Model.
      results.push({
        label: v.label,
        meta: m.meta,
        sysModel: m.sysModel,
        diaModel: m.diaModel,
        featureNames: m.featureNames,
        ok: true,
      })
    } catch (e) {
      results.push({ label: v.label, error: e?.message || String(e), ok: false })
    }
  }

  // Mixture-of-Experts variant — different model shape (router + two sub-models),
  // so trained via its own function and reported without a Promote button
  // (promote path doesn't yet handle composite models).
  try {
    const moe = trainV3MoE(features, labels, subjectIds, { nTrees, depth, lr })
    results.push({
      label: 'MoE (router + low-specialist + generalist)',
      meta: moe.meta,
      sysModel: null,  // composite — no single sysModel to promote
      diaModel: null,
      featureNames: moe.featureNames,
      ok: true,
      isMoE: true,
    })
  } catch (e) {
    results.push({ label: 'MoE (router + low-specialist + generalist)', error: e?.message || String(e), ok: false })
  }
  return results
}

// Tree-count sweep — train at a range of nTrees values on the SAME seeded
// split and surface val MAE for each. Used to find the overfit knee without
// eyeballing. 50 depth-3 trees on 125 samples overfit 3× (train 3.1 / val
// 9.3); the sweep lets us pick the smallest tree count that holds val MAE
// without memorising the training set.
export function sweepTrees(features, labels, treeCounts = [10, 20, 30, 50, 100], { depth = 3, lr = 0.1, tailBoost = 2.0 } = {}) {
  const results = []
  for (const nTrees of treeCounts) {
    try {
      const m = trainV3(features, labels, { nTrees, depth, lr, valFrac: 0.2, tailBoost })
      results.push({
        nTrees,
        trainMae: m.meta.trainMae,
        valMae: m.meta.valMae,
        valMaeSysByBand: m.meta.valMaeSysByBand,
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
  // Use the MODEL's own featureNames (not the module constant) so a model
  // trained with a different feature count — e.g. a pre-2026-10 prod model
  // with 17 features vs the current 31-feature extractor — still serves
  // correctly after the extractor was expanded.
  const names = Array.isArray(model.featureNames) && model.featureNames.length > 0
    ? model.featureNames
    : FEATURE_NAMES_V3
  const x = names.map(k => features[k])
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
