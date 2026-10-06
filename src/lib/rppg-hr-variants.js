// HR algorithm A/B variants for the VitalsValidate replay harness.
//
// Each variant takes stored frames + fps + optional subject metadata and
// returns a predicted HR in bpm. Variants reuse the same preprocessing
// pipeline (extract → resample → detrend → denoise) so the only thing
// that differs is the peak-pick / aggregation step. That makes the
// comparison apples-to-apples — any MAE delta is attributable to the
// algorithmic change, not noise in preprocessing.
//
// Variants implemented (Patrick 2026-10-03):
//   #1 multiWindow — compute HR in overlapping 10-sec sub-windows,
//      take the mode. Robust to noise peaks that happen to dominate
//      the whole-scan average but aren't present in every window.
//   #2 harmonic   — current pipeline + bidirectional sub-harmonic check:
//      if dominant peak at f has a peak at f/2 (within physiological
//      range) with ≥40% magnitude, prefer f/2. Specifically targets
//      period-doubling failures like TERE-336.
//   #5 bayesian   — multiply spectrum by age-conditional Gaussian prior
//      before argmax. Needs subject.age; falls back to adult prior if
//      missing.
//   #6 dl (placeholder — not implemented, deferred to task #517).
//
// Baseline for comparison is `processStoredFrames` (current live algo).

import {
  RESAMPLE_FPS,
  HR_LOW_HZ,
  HR_HIGH_HZ,
  extractPulseSignal,
  resample,
  detrend,
  denoiseSignal,
  fftMagnitudes,
  dominantFreq,
  autocorrPeak,
  welchHR,
  processStoredFrames,
  chromRPPG,
  posAlgorithm,
} from './rppg.js'

// Preprocess once; variants share this output.
function preprocess(frames, fps) {
  const rgb = frames.map(f => [f.r, f.g, f.b])
  const ts  = frames.map((f, i) => f.t || f.timestamp || i * (1000 / fps))
  const actualFps = ts.length > 1 ? (ts.length / (ts[ts.length - 1] - ts[0]) * 1000) : fps
  const relTs = ts.map(t => t - ts[0])
  const pulse = extractPulseSignal(rgb, actualFps)
  const resampled = resample(pulse, relTs, RESAMPLE_FPS)
  const det = detrend(resampled)
  const clean = denoiseSignal(det, RESAMPLE_FPS)
  return { clean, actualFps }
}

// ── Variant #1: multi-window voting ──────────────────────────────────────────
// Slice the stored frames into overlapping 10-sec windows (5-sec step),
// run the baseline HR pipeline on each, round to 2-bpm bins, return the
// mode. Catches cases where a noise peak dominates the whole-scan FFT
// but is absent in most sub-windows.
export function hrVariant1_multiWindow(frames, fps) {
  const windowSec = 10
  const stepSec = 5
  const windowFrames = Math.round(windowSec * fps)
  const stepFrames = Math.round(stepSec * fps)
  if (frames.length < windowFrames) return null
  const estimates = []
  for (let start = 0; start + windowFrames <= frames.length; start += stepFrames) {
    const slice = frames.slice(start, start + windowFrames)
    try {
      const r = processStoredFrames(slice, fps)
      if (r?.hr && r.hr >= 40 && r.hr <= 200) estimates.push(r.hr)
    } catch {}
  }
  if (!estimates.length) return null
  // Mode in 2-bpm bins to tolerate ±1 bpm noise.
  const binned = estimates.map(h => Math.round(h / 2) * 2)
  const counts = {}
  for (const b of binned) counts[b] = (counts[b] || 0) + 1
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return parseInt(sorted[0][0], 10)
}

// ── Variant #2: bidirectional harmonic check ─────────────────────────────────
// Run the baseline preprocess, inspect the full FFT, find all peaks ≥40%
// of the dominant peak within HR band. If the dominant is at freq f and
// a peak exists at f/2 within physiological range, prefer f/2 — that
// indicates period-doubling (true fundamental was weaker but still
// present). Specifically targets TERE-336-style failures.
export function hrVariant2_harmonic(frames, fps) {
  const { clean } = preprocess(frames, fps)
  const { mags, n } = fftMagnitudes(clean)
  const binHz = RESAMPLE_FPS / n
  const lowBin  = Math.floor(HR_LOW_HZ  / binHz)
  const highBin = Math.ceil (HR_HIGH_HZ / binHz)
  // Dominant peak in HR band
  let maxMag = 0, maxBin = -1
  for (let i = lowBin; i <= highBin && i < mags.length; i++) {
    if (mags[i] > maxMag) { maxMag = mags[i]; maxBin = i }
  }
  if (maxBin < 0) return null
  const dominantHz  = maxBin * binHz
  const dominantBpm = dominantHz * 60
  // Sub-harmonic check: does f/2 have significant magnitude?
  const halfBin = Math.round(maxBin / 2)
  const halfHz  = halfBin * binHz
  const halfBpm = halfHz * 60
  if (halfBin >= lowBin && halfBin <= highBin && halfBpm >= 40 && halfBpm <= 200) {
    const halfMag = mags[halfBin] || 0
    if (halfMag >= 0.40 * maxMag) {
      // Period-doubling detected — true HR is likely half the dominant.
      return Math.round(halfBpm)
    }
  }
  // Also check the opposite: if dominant is low AND 2× is in range AND
  // has significant mag, prefer 2× (classic ×2 correction with higher
  // threshold than the clamp at 40 bpm).
  const doubleBin = maxBin * 2
  if (dominantBpm < 70 && doubleBin < mags.length && doubleBin * binHz * 60 <= 200) {
    const doubleMag = mags[doubleBin] || 0
    if (doubleMag >= 0.50 * maxMag) {
      return Math.round(doubleBin * binHz * 60)
    }
  }
  return Math.round(dominantBpm)
}

// ── Variant #5: Bayesian prior ───────────────────────────────────────────────
// Multiply the FFT magnitude spectrum by a Gaussian prior centred on the
// age-expected resting HR. Prior narrows the plausible range so noise
// peaks far from expected are down-weighted. Requires subject.age; if
// missing, falls back to adult-wide prior (mean 70, sigma 25). Only
// moves predictions when the dominant peak is in the tails of the
// physiological distribution.
export function hrVariant5_bayesian(frames, fps, subject = {}) {
  const { clean } = preprocess(frames, fps)
  const { mags, n } = fftMagnitudes(clean)
  const binHz = RESAMPLE_FPS / n
  const lowBin  = Math.floor(HR_LOW_HZ  / binHz)
  const highBin = Math.ceil (HR_HIGH_HZ / binHz)
  // Age-conditional prior. Resting HR drops ~0.5 bpm per decade past 20;
  // sigma widens with uncertainty when age is unknown.
  const age = Number(subject?.age) || null
  const priorMean  = age ? (70 - Math.max(0, (age - 40)) * 0.3) : 70
  const priorSigma = age ? 20 : 25
  let maxWeighted = 0, maxBin = -1
  for (let i = lowBin; i <= highBin && i < mags.length; i++) {
    const bpm = i * binHz * 60
    const priorWeight = Math.exp(-0.5 * Math.pow((bpm - priorMean) / priorSigma, 2))
    const weighted = mags[i] * priorWeight
    if (weighted > maxWeighted) { maxWeighted = weighted; maxBin = i }
  }
  if (maxBin < 0) return null
  return Math.round(maxBin * binHz * 60)
}

// ── Variant #6: DL model (placeholder, task #517) ────────────────────────────
// Not implemented — needs EfficientPhys ONNX model trained + browser
// runtime (onnxruntime-web). Reserved slot so the UI shows a column
// stub, keeps the harness extensible.
export function hrVariant6_dl(/* frames, fps, subject */) {
  return null
}

// ── Variant #7: PBV (Plane-orthogonal / Blood Volume vector, Wang 2016) ──────
// Project RGB onto the known blood-volume signature direction. Classical
// method often reported to beat CHROM/POS on darker Fitzpatrick skin
// tones. Uses the covariance-based projection W = C^-1 * v where v is
// the normalized skin PBV vector [0.329, 0.712, 0.619] and C is the
// RGB covariance over the scan window. Pulse is then W^T * [Rn, Gn, Bn].
// Feeds the same resample → detrend → denoise → dominantFreq tail as
// the other variants so the only thing changing is the pulse extraction.
export function hrVariant7_pbv(frames, fps) {
  const rgb = frames.map(f => [f.r, f.g, f.b])
  const ts  = frames.map((f, i) => f.t || f.timestamp || i * (1000 / fps))
  const actualFps = ts.length > 1 ? (ts.length / (ts[ts.length - 1] - ts[0]) * 1000) : fps
  const relTs = ts.map(t => t - ts[0])
  const pulse = pbvPulse(rgb)
  if (!pulse) return null
  const resampled = resample(pulse, relTs, RESAMPLE_FPS)
  const det = detrend(resampled)
  const clean = denoiseSignal(det, RESAMPLE_FPS)
  const hz = dominantFreq(clean, HR_LOW_HZ, HR_HIGH_HZ, RESAMPLE_FPS)
  if (!hz || hz <= 0) return null
  return Math.round(hz * 60)
}

function pbvPulse(rgb) {
  const n = rgb.length
  if (n < 30) return null
  let mR = 0, mG = 0, mB = 0
  for (const [r, g, b] of rgb) { mR += r; mG += g; mB += b }
  mR /= n; mG /= n; mB /= n
  if (mR <= 0 || mG <= 0 || mB <= 0) return null
  const Rn = rgb.map(([r]) => r / mR - 1)
  const Gn = rgb.map(([,g]) => g / mG - 1)
  const Bn = rgb.map(([,,b]) => b / mB - 1)
  // Known skin PBV vector (Wang 2016).
  const pbv = [0.329, 0.712, 0.619]
  const nrm = Math.hypot(...pbv)
  const v = pbv.map(x => x / nrm)
  // 3x3 covariance matrix of [Rn, Gn, Bn].
  const C = [[0,0,0],[0,0,0],[0,0,0]]
  for (let i = 0; i < n; i++) {
    const c = [Rn[i], Gn[i], Bn[i]]
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[j][k] += c[j] * c[k]
  }
  for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[j][k] /= n
  // Solve W = C^-1 * v.
  const Cinv = invert3x3(C)
  if (!Cinv) return null
  const W = [
    Cinv[0][0]*v[0] + Cinv[0][1]*v[1] + Cinv[0][2]*v[2],
    Cinv[1][0]*v[0] + Cinv[1][1]*v[1] + Cinv[1][2]*v[2],
    Cinv[2][0]*v[0] + Cinv[2][1]*v[1] + Cinv[2][2]*v[2],
  ]
  const pulse = new Array(n)
  for (let i = 0; i < n; i++) pulse[i] = W[0]*Rn[i] + W[1]*Gn[i] + W[2]*Bn[i]
  return pulse
}

function invert3x3(M) {
  const [[a,b,c],[d,e,f],[g,h,i]] = M
  const det = a*(e*i - f*h) - b*(d*i - f*g) + c*(d*h - e*g)
  if (Math.abs(det) < 1e-12) return null
  const inv = 1 / det
  return [
    [ (e*i - f*h)*inv, -(b*i - c*h)*inv,  (b*f - c*e)*inv],
    [-(d*i - f*g)*inv,  (a*i - c*g)*inv, -(a*f - c*d)*inv],
    [ (d*h - e*g)*inv, -(a*h - b*g)*inv,  (a*e - b*d)*inv],
  ]
}

// ── Variant #8: multi-ROI (STUB — not testable on stored data) ──────────────
// Would split face into forehead + L cheek + R cheek, extract pulse from
// each separately, median-vote HR per region. Catches localised noise
// (shadow on one cheek) that whole-face mean averages into the signal.
// NOT TESTABLE on existing validation_readings: raw_rppg_signal.frames
// stores a single [r,g,b] per frame (whole-face mean), not per-region.
// Would need upstream capture change in rppg.js to store per-ROI RGB.
// Returns null so the leaderboard shows "needs capture change" status.
export function hrVariant8_multiROI(/* frames, fps */) {
  return null
}

// ── Variant #9: IBI direct peak detection ───────────────────────────────────
// Instead of FFT peak-pick in frequency domain, find systolic peaks in
// the time-domain pulse signal and compute HR from the median inter-beat
// interval. Robust to amplitude modulation that fools FFT (where strong
// AM at a given frequency can create spurious spectral peaks). Rouast
// 2018. Uses the same preprocess as baseline then switches to time-domain.
export function hrVariant9_ibi(frames, fps) {
  const { clean } = preprocess(frames, fps)
  if (!clean || clean.length < 60) return null
  const peaks = findPulsePeaks(clean, RESAMPLE_FPS)
  if (peaks.length < 3) return null
  const ibis = []
  for (let i = 1; i < peaks.length; i++) {
    const dtSec = (peaks[i] - peaks[i-1]) / RESAMPLE_FPS
    // Keep only intervals within physiological HR range (40–200 bpm).
    if (dtSec >= 60/200 && dtSec <= 60/40) ibis.push(dtSec)
  }
  if (!ibis.length) return null
  // Median IBI → HR (robust to outlier beats from noise).
  const sorted = [...ibis].sort((a, b) => a - b)
  const medianIBI = sorted[Math.floor(sorted.length / 2)]
  return Math.round(60 / medianIBI)
}

function findPulsePeaks(sig, fs) {
  // Minimum spacing between peaks: 40 bpm → 1.5 sec → 1.5*fs samples.
  // Enforce this to avoid double-counting the dicrotic notch as a beat.
  const minSpacing = Math.round(0.3 * fs)  // 0.3 sec ≈ 200 bpm max
  // Amplitude threshold: 40% of max absolute value (keep real beats,
  // drop noise ripples).
  let maxAbs = 0
  for (const x of sig) { const a = Math.abs(x); if (a > maxAbs) maxAbs = a }
  const threshold = 0.3 * maxAbs
  const peaks = []
  for (let i = 1; i < sig.length - 1; i++) {
    if (sig[i] > sig[i-1] && sig[i] >= sig[i+1] && sig[i] > threshold) {
      if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minSpacing) {
        peaks.push(i)
      } else if (sig[i] > sig[peaks[peaks.length - 1]]) {
        // Replace the previous peak if this one is taller within the spacing window.
        peaks[peaks.length - 1] = i
      }
    }
  }
  return peaks
}

// ── Variants #10/#11/#12: single-method isolation (Patrick 2026-10-03) ──────
// The CHILL paper (Nature NPJ Digital Medicine 2025) found POS alone beat
// their 4-method ensemble AND all 4 DL methods, scoring 1.1 bpm MAE on
// their low-light dataset. Our current baseline blends CHROM+POS+Green
// SNR-weighted — if that ensemble is hurting us (noise averaging in on
// scans where one method is clearly cleanest), isolating each method tells
// us. Pipeline is same for all three: extract one pulse → resample →
// detrend → denoise → dominantFreq.
function hrSingleMethodHR(frames, fps, extractor) {
  const rgb = frames.map(f => [f.r, f.g, f.b])
  const ts  = frames.map((f, i) => f.t || f.timestamp || i * (1000 / fps))
  const actualFps = ts.length > 1 ? (ts.length / (ts[ts.length - 1] - ts[0]) * 1000) : fps
  const relTs = ts.map(t => t - ts[0])
  const pulse = extractor(rgb, actualFps)
  if (!pulse || !pulse.length) return null
  const resampled = resample(pulse, relTs, RESAMPLE_FPS)
  const det = detrend(resampled)
  const clean = denoiseSignal(det, RESAMPLE_FPS)
  const hz = dominantFreq(clean, HR_LOW_HZ, HR_HIGH_HZ, RESAMPLE_FPS)
  if (!hz || hz <= 0) return null
  return Math.round(hz * 60)
}

export function hrVariant10_posOnly(frames, fps) {
  return hrSingleMethodHR(frames, fps, (rgb) => posAlgorithm(rgb, 48))
}

export function hrVariant11_chromOnly(frames, fps) {
  return hrSingleMethodHR(frames, fps, (rgb, actualFps) => chromRPPG(rgb, actualFps))
}

export function hrVariant12_greenOnly(frames, fps) {
  // Green channel alone — classical rPPG baseline, just the inverted G channel.
  return hrSingleMethodHR(frames, fps, (rgb) => rgb.map(([, g]) => -g))
}

// ── Variant #13: POS + peak counting (ETL path replica) (Patrick 2026-10-05) ──
// Mirrors run_v3_on_vv_subject.mjs's HR extraction. Diagnosed on VV-SUB01:
// the live processStoredFrames pipeline gave HR 45 bpm (spectral latched onto
// a sub-harmonic artefact) while this ETL path gave 73 bpm (ground truth 79).
// Difference: this uses POS-only (no CHROM/Green blend) + direct peak counting
// (not Welch/FFT), which is harmonic-resistant by construction. Baseline uses
// a blended-signal spectral peak so can lock onto strong sub-harmonic noise.
// If this variant beats baseline on hyper-error cases across the full 170-row
// corpus without regressing low-SQI cases, port it into processStoredFrames.
export function hrVariant13_posPeakCount(frames, fps) {
  const rgb = frames.map(f => [f.r, f.g, f.b])
  const ts  = frames.map((f, i) => f.t || f.timestamp || i * (1000 / fps))
  const actualFps = ts.length > 1 ? (ts.length / (ts[ts.length - 1] - ts[0]) * 1000) : fps
  const relTs = ts.map(t => t - ts[0])

  // POS algorithm only — matches posRppg from bpModelV3.js used by the ETL.
  const pulse = posAlgorithm(rgb, 48)
  if (!pulse || !pulse.length) return null

  const resampled = resample(pulse, relTs, RESAMPLE_FPS)
  const det = detrend(resampled)
  const clean = denoiseSignal(det, RESAMPLE_FPS)

  // Direct peak counting on the clean POS waveform. 60/median(IBI) → HR.
  const peaks = findPulsePeaks(clean, RESAMPLE_FPS)
  if (peaks.length < 3) return null
  const ibis = []
  for (let i = 1; i < peaks.length; i++) {
    const dtSec = (peaks[i] - peaks[i - 1]) / RESAMPLE_FPS
    if (dtSec >= 60 / 200 && dtSec <= 60 / 40) ibis.push(dtSec)
  }
  if (!ibis.length) return null
  const sorted = [...ibis].sort((a, b) => a - b)
  const medianIBI = sorted[Math.floor(sorted.length / 2)]
  return Math.round(60 / medianIBI)
}

// Convenience: run all variants + return a dict for the replay table.
export function runAllHRVariants(frames, fps, subject = {}) {
  const out = {}
  try { out.variant1 = hrVariant1_multiWindow(frames, fps) } catch { out.variant1 = null }
  try { out.variant2 = hrVariant2_harmonic(frames, fps) } catch { out.variant2 = null }
  try { out.variant5 = hrVariant5_bayesian(frames, fps, subject) } catch { out.variant5 = null }
  out.variant6 = null  // deferred DL (task #517)
  try { out.variant7 = hrVariant7_pbv(frames, fps) } catch { out.variant7 = null }
  out.variant8 = null  // not testable on stored data (whole-face RGB only)
  try { out.variant9 = hrVariant9_ibi(frames, fps) } catch { out.variant9 = null }
  try { out.variant10 = hrVariant10_posOnly(frames, fps) } catch { out.variant10 = null }
  try { out.variant11 = hrVariant11_chromOnly(frames, fps) } catch { out.variant11 = null }
  try { out.variant12 = hrVariant12_greenOnly(frames, fps) } catch { out.variant12 = null }
  try { out.variant13 = hrVariant13_posPeakCount(frames, fps) } catch { out.variant13 = null }
  return out
}
