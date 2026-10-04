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

// Convenience: run all variants + return a dict for the replay table.
export function runAllHRVariants(frames, fps, subject = {}) {
  const out = {}
  try { out.variant1 = hrVariant1_multiWindow(frames, fps) } catch { out.variant1 = null }
  try { out.variant2 = hrVariant2_harmonic(frames, fps) } catch { out.variant2 = null }
  try { out.variant5 = hrVariant5_bayesian(frames, fps, subject) } catch { out.variant5 = null }
  out.variant6 = null  // deferred
  return out
}
