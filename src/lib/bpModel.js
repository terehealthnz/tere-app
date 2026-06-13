/**
 * Tere Vitals — Unified vitals model
 * TensorFlow.js neural network predicting systolic BP, diastolic BP, HR, and SpO2
 * from 30 rPPG features (signal + demographic + device).
 * Clinical label: INDICATIVE ESTIMATE ONLY — not validated for clinical use.
 */

import * as tf from '@tensorflow/tfjs'
import { supabase } from './supabase'

const MODEL_KEY  = 'localstorage://tere-vitals-unified'
const NORM_KEY   = 'tere-vitals-norm'
const META_KEY   = 'tere-vitals-meta'
const CALIB_KEY  = 'tere-bp-calibration'

const FEATURE_SIZE = 30  // 5 HR + 3 RR + 4 BP + 5 SpO2 + 5 demographic + 8 device
const OUTPUT_SIZE  = 4   // [systolic, diastolic, hr, spo2]

const DEFAULT_SPO2 = 98   // population mean for readings without pulse oximeter

export const BP_SHOW_THRESHOLD = { samples: 10, valMae: 20 }

// ── Physiological clamping ─────────────────────────────────────────────────────

function clampBP(sys, dia) {
  const s = Math.max(70, Math.min(200, Math.round(sys)))
  const d = Math.max(40, Math.min(130, Math.round(dia)))
  const pp = s - d
  if (pp < 20) return { systolic: s, diastolic: s - 20 }
  if (pp > 100) return { systolic: s, diastolic: s - 100 }
  return { systolic: s, diastolic: d }
}

function isPlausibleBP(sys, dia) {
  return sys >= 60 && sys <= 240 && dia >= 30 && dia <= 150 && dia < sys && sys - dia >= 10
}

export function isBPReliable() {
  const meta = getLocalMeta()
  if (!meta) return false
  return (meta.samples || 0) >= BP_SHOW_THRESHOLD.samples &&
    (meta.valMae == null || meta.valMae <= BP_SHOW_THRESHOLD.valMae)
}

// ── Signal primitives ──────────────────────────────────────────────────────────

function findPeaks(signal, fps) {
  const minDist = Math.floor((fps || 30) * 0.4)
  const peaks = []
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > signal[i - 1] && signal[i] > signal[i + 1]) {
      if (!peaks.length || i - peaks[peaks.length - 1] >= minDist) peaks.push(i)
    }
  }
  return peaks
}

function findTroughs(signal, fps) {
  const minDist = Math.floor((fps || 30) * 0.4)
  const troughs = []
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] < signal[i - 1] && signal[i] < signal[i + 1]) {
      if (!troughs.length || i - troughs[troughs.length - 1] >= minDist) troughs.push(i)
    }
  }
  return troughs
}

function normalizeSignal(signal) {
  const n = signal.length
  const mean = signal.reduce((a, b) => a + b, 0) / n
  const std  = Math.sqrt(signal.map(x => (x - mean) ** 2).reduce((a, b) => a + b, 0) / n) || 1
  return { norm: signal.map(x => (x - mean) / std), mean, std }
}

function calcSignalPower(signal) {
  const n = signal.length, mean = signal.reduce((a, b) => a + b, 0) / n
  return signal.map(x => (x - mean) ** 2).reduce((a, b) => a + b, 0) / n
}

function calcACDC(signal) {
  const n = signal.length, dc = signal.reduce((a, b) => a + b, 0) / n || 1
  const mean2 = signal.reduce((a, b) => a + b, 0) / n
  const det   = signal.map(x => x - mean2)
  const wSize = Math.max(1, Math.round(n * 0.05))
  const bp    = det.map((v, i) => {
    const s = det.slice(Math.max(0, i - wSize), Math.min(n, i + wSize + 1))
    return v - s.reduce((a, b) => a + b, 0) / s.length
  })
  const ac = Math.sqrt(bp.map(x => x * x).reduce((a, b) => a + b, 0) / n) || 0.001
  return { ac, dc }
}

function calcBandPower(rrIntervals, lowHz, highHz) {
  if (rrIntervals.length < 4) return 0.001
  const n = rrIntervals.length
  const mean = rrIntervals.reduce((a, b) => a + b, 0) / n
  const det  = rrIntervals.map(x => x - mean)
  const fsRR = n / (rrIntervals.reduce((a, b) => a + b, 0) / 1000)
  let power  = 0
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

// ── HRV metrics ────────────────────────────────────────────────────────────────

function calcSDNN(rr) {
  if (rr.length < 2) return 0
  const mean = rr.reduce((a, b) => a + b, 0) / rr.length
  return Math.sqrt(rr.map(x => (x - mean) ** 2).reduce((a, b) => a + b, 0) / rr.length)
}

function calcRMSSD(rr) {
  if (rr.length < 3) return 0
  return Math.sqrt(rr.slice(1).map((v, i) => (v - rr[i]) ** 2).reduce((a, b) => a + b, 0) / (rr.length - 1))
}

function calcPNN50(rr) {
  if (rr.length < 3) return 0
  const diffs = rr.slice(1).map((v, i) => Math.abs(v - rr[i]))
  return diffs.filter(d => d > 50).length / diffs.length
}

// ── Pulse wave features ────────────────────────────────────────────────────────

function calculateAugIndex(norm, peaks) {
  if (peaks.length < 2) return 0
  const vals = []
  peaks.forEach((p, i) => {
    if (i >= peaks.length - 1) return
    const seg = norm.slice(p, peaks[i + 1])
    if (seg.length < 10) return
    const mid = Math.floor(seg.length * 0.4), end2 = Math.floor(seg.length * 0.8)
    let minVal = Infinity, minIdx = mid
    for (let j = mid; j < end2; j++) if (seg[j] < minVal) { minVal = seg[j]; minIdx = j }
    const pp = seg[0] - Math.min(...seg)
    if (pp > 0) vals.push((Math.max(...seg.slice(minIdx)) - seg[0]) / pp)
  })
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

function calculatePWVProxy(norm, peaks, fps) {
  if (peaks.length < 2) return 0
  const vals = []
  peaks.forEach((p, i) => {
    if (i >= peaks.length - 1) return
    const seg   = norm.slice(p, peaks[i + 1])
    const deriv = seg.slice(1).map((v, j) => v - seg[j])
    if (!deriv.length) return
    vals.push(deriv.indexOf(Math.max(...deriv)) / fps * 1000)
  })
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

function calcUpstrokeTime(norm, peaks, troughs, fps) {
  const vals = peaks.map((p, i) => troughs[i] != null ? (p - troughs[i]) / fps * 1000 : 0).filter(t => t > 0)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

function calcDiastolicTime(norm, peaks, troughs, fps) {
  const vals = troughs.slice(1).map((t, i) => peaks[i] != null ? (t - peaks[i]) / fps * 1000 : 0).filter(t => t > 0)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

// ── Respiratory features ───────────────────────────────────────────────────────

function calcBreathingRate(signal, fps) {
  // Approximate respiratory rate from slow variation in signal envelope
  if (signal.length < fps * 4) return 0.25  // default ~15 br/min
  const n    = signal.length
  const mean = signal.reduce((a, b) => a + b, 0) / n
  const det  = signal.map(x => x - mean)
  let power  = 0
  // Breathing frequency band: 0.13–0.5 Hz
  for (let k = 1; k < Math.floor(n / 2); k++) {
    const freq = k * fps / n
    if (freq >= 0.13 && freq <= 0.5) {
      let re = 0, im = 0
      for (let j = 0; j < n; j++) {
        re += det[j] * Math.cos(2 * Math.PI * k * j / n)
        im -= det[j] * Math.sin(2 * Math.PI * k * j / n)
      }
      power += (re * re + im * im) / n
    }
  }
  // Normalise by signal power
  const total = calcSignalPower(signal)
  return total > 0 ? Math.min(1, power / total) : 0
}

function calcShoulderMovementProxy(signal, fps) {
  // Slow amplitude modulation of the rPPG signal as proxy for shoulder movement
  if (signal.length < fps * 2) return 0
  const segLen = Math.floor(fps)
  const segs   = []
  for (let i = 0; i + segLen < signal.length; i += segLen) {
    const seg = signal.slice(i, i + segLen)
    segs.push(Math.max(...seg) - Math.min(...seg))
  }
  if (segs.length < 2) return 0
  const mean = segs.reduce((a, b) => a + b, 0) / segs.length
  return Math.sqrt(segs.map(x => (x - mean) ** 2).reduce((a, b) => a + b, 0) / segs.length) / (mean || 1)
}

// ── Device features ────────────────────────────────────────────────────────────

function getDeviceFeatures(devInfo, measuredFPS) {
  const dpr  = devInfo?.pixelRatio || window?.devicePixelRatio || 2
  const ua   = devInfo?.userAgent || devInfo?.ua || navigator?.userAgent || ''
  const isApple   = /iPhone|iPad/.test(ua) ? 1 : 0
  const isSamsung = /Samsung/i.test(ua) ? 1 : 0
  const isGoogle  = /Pixel/.test(ua) ? 1 : 0
  const isOther   = (!isApple && !isSamsung && !isGoogle) ? 1 : 0
  const fpsNorm        = Math.min(2, (measuredFPS || 30) / 30)
  const cameraQuality  = dpr >= 3 ? 1.0 : dpr >= 2 ? 0.66 : 0.33
  const brightnessProxy = Math.min(1, dpr / 3)
  return [fpsNorm, dpr / 4, cameraQuality, brightnessProxy, isApple, isSamsung, isGoogle, isOther]
}

// ── Feature extraction (30 features) ──────────────────────────────────────────

export function extractFeatures(rppgSignal, subject = {}, devInfo = null) {
  const frames = rppgSignal?.frames || []
  const fps    = rppgSignal?.fps || 30
  if (frames.length < 30) throw new Error('Not enough frames')

  const green = frames.map(f => f.g)
  const red   = frames.map(f => f.r)
  const blue  = frames.map(f => f.b)

  const { norm } = normalizeSignal(green)
  const peaks   = findPeaks(norm, fps)
  const troughs = findTroughs(norm, fps)

  const rrInts = peaks.length > 1
    ? peaks.slice(1).map((p, i) => ((p - peaks[i]) / fps) * 1000) : []
  const meanRR = rrInts.length ? rrInts.reduce((a, b) => a + b, 0) / rrInts.length : 0
  const hr     = meanRR > 0 ? 60000 / meanRR : 0

  // Channel AC/DC for SpO2 ratios
  const gAcDc = calcACDC(green)
  const rAcDc = calcACDC(red)
  const bAcDc = calcACDC(blue)
  const R_rg  = (rAcDc.ac / rAcDc.dc) / (gAcDc.ac / gAcDc.dc)
  const R_gb  = (gAcDc.ac / gAcDc.dc) / (bAcDc.ac / bAcDc.dc)
  const R_rb  = (rAcDc.ac / rAcDc.dc) / (bAcDc.ac / bAcDc.dc)
  const gP    = calcSignalPower(green)
  const rP    = calcSignalPower(red)
  const bP    = calcSignalPower(blue)

  const fv = [
    // ── HR features (5) ──
    hr || 0,
    calcSDNN(rrInts),
    calcRMSSD(rrInts),
    calcPNN50(rrInts),
    gP,

    // ── RR / respiratory features (3) ──
    calcBandPower(rrInts, 0.04, 0.15),            // LF HRV (0.04–0.15 Hz)
    calcBreathingRate(green, fps),                  // resp rate proxy
    calcShoulderMovementProxy(green, fps),          // motion amplitude proxy

    // ── BP pulse-wave features (4) ──
    calculateAugIndex(norm, peaks),
    calculatePWVProxy(norm, peaks, fps),
    calcUpstrokeTime(norm, peaks, troughs, fps),
    calcDiastolicTime(norm, peaks, troughs, fps),

    // ── SpO2 channel-ratio features (5) ──
    R_rg || 1, R_gb || 1, R_rb || 1,
    (rP / (gP || 1)), (bP / (gP || 1)),

    // ── Demographic features (5) ──
    Number(subject.age) / 100 || 0.35,
    subject.sex === 'male' ? 1 : 0,
    (Number(subject.height_cm) || 170) / 200,
    (Number(subject.weight_kg) || 75) / 150,
    (Number(subject.fitzpatrick_scale) || 2) / 6,

    // ── Device features (8) ──
    ...getDeviceFeatures(devInfo, fps),
  ]

  return fv.map(v => (isFinite(v) && !isNaN(v)) ? v : 0)
}

// ── PITA-style data augmentation ──────────────────────────────────────────────
// Physiologically-Informed Training Augmentation:
// 1. Gaussian noise on all features (general robustness)
// 2. HR plausible variation (±3 and ±5 bpm shifts) — index 0
// 3. BP range variation (±5 and ±10 mmHg shifts on BP-related features) — indices 3-6
// 4. Device variation (FPS/quality jitter) — indices 22-29

function augmentData(features, labels, factor = 3) {
  const augF = [...features], augL = [...labels]

  features.forEach((feat, i) => {
    const [sys, dia, hr, spo2] = labels[i]

    // Pass 1: Gaussian noise (general robustness)
    for (let a = 0; a < factor; a++) {
      augF.push(feat.map(f => f + (Math.random() - 0.5) * 0.04 * (Math.abs(f) || 1)))
      augL.push(labels[i])
    }

    // Pass 2: HR variation (±3 bpm and ±5 bpm)
    for (const hrDelta of [-5, -3, 3, 5]) {
      const newFeat = [...feat]
      // HR features are at indices 0-4 (hr, rrHz, hrFft, hrAuto, hrWelch)
      for (let k = 0; k < 5; k++) {
        if (newFeat[k] > 0) newFeat[k] = Math.max(0.3, newFeat[k] + hrDelta / 60)
      }
      augF.push(newFeat)
      augL.push([sys, dia, hr + hrDelta, spo2])
    }

    // Pass 3: BP range variation (±5 mmHg and ±10 mmHg)
    for (const bpDelta of [-10, -5, 5, 10]) {
      augF.push(feat)  // features unchanged — label variation tests robustness
      augL.push([
        Math.max(70,  Math.min(200, sys + bpDelta)),
        Math.max(40,  Math.min(130, dia + Math.round(bpDelta * 0.6))),
        hr, spo2,
      ])
    }

    // Pass 4: Device variation (FPS and quality jitter on device feature block)
    const devFeat = [...feat]
    // Device features are last 8 values (indices FEATURE_SIZE-8 to FEATURE_SIZE-1)
    for (let k = feat.length - 8; k < feat.length; k++) {
      devFeat[k] = feat[k] + (Math.random() - 0.5) * 0.1 * (Math.abs(feat[k]) || 1)
    }
    augF.push(devFeat)
    augL.push(labels[i])
  })

  return { augF, augL }
}

// ── Model architecture ─────────────────────────────────────────────────────────

function buildModel() {
  const m = tf.sequential()
  m.add(tf.layers.dense({ inputShape: [FEATURE_SIZE], units: 256, activation: 'relu', kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) }))
  m.add(tf.layers.batchNormalization())
  m.add(tf.layers.dropout({ rate: 0.3 }))
  m.add(tf.layers.dense({ units: 128, activation: 'relu', kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) }))
  m.add(tf.layers.batchNormalization())
  m.add(tf.layers.dropout({ rate: 0.25 }))
  m.add(tf.layers.dense({ units: 64, activation: 'relu' }))
  m.add(tf.layers.batchNormalization())
  m.add(tf.layers.dropout({ rate: 0.2 }))
  m.add(tf.layers.dense({ units: 32, activation: 'relu' }))
  m.add(tf.layers.dropout({ rate: 0.1 }))
  m.add(tf.layers.dense({ units: OUTPUT_SIZE, activation: 'linear' }))
  m.compile({ optimizer: tf.train.adam(0.0003), loss: 'meanSquaredError', metrics: ['mae'] })
  return m
}

// ── Persistence ────────────────────────────────────────────────────────────────

async function saveToSupabase(meta, normParams) {
  try {
    const { error } = await supabase.from('model_versions').insert({
      model_version: meta.version, training_samples: meta.samples,
      final_mae: meta.finalMae, val_mae: meta.valMae,
      val_mae_sys: meta.valMaeSys, val_mae_dia: meta.valMaeDia,
      model_topology: null, weight_specs: null, weight_data: null,
      bp_mean: normParams.mean, bp_std: normParams.std,
    })
    if (error) console.warn('[vitalsModel] Supabase save error:', error.message)
  } catch (e) { console.warn('[vitalsModel] Supabase save failed:', e.message) }
}

export async function loadModelFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('model_versions').select('*').order('trained_at', { ascending: false }).limit(1).single()
    if (error || !data) return null
    const meta = { version: data.model_version, samples: data.training_samples, valMae: data.val_mae, finalMae: data.final_mae, trainedAt: data.trained_at }
    localStorage.setItem(NORM_KEY, JSON.stringify({ mean: data.bp_mean, std: data.bp_std }))
    localStorage.setItem(META_KEY, JSON.stringify(meta))
    return meta
  } catch (e) { console.warn('[vitalsModel] loadFromSupabase failed:', e.message); return null }
}

export function getLocalMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || 'null') } catch { return null }
}

export function bpModelReady() { return isBPReliable() }

// ── Calibration ────────────────────────────────────────────────────────────────

export function setCalibration(manualSys, manualDia, predSys, predDia) {
  const c = { systolicOffset: manualSys - predSys, diastolicOffset: manualDia - predDia, date: new Date().toISOString() }
  localStorage.setItem(CALIB_KEY, JSON.stringify(c)); return c
}

export function getCalibration() {
  try {
    const c = JSON.parse(localStorage.getItem(CALIB_KEY) || 'null')
    if (!c) return null
    if ((Date.now() - new Date(c.date).getTime()) / 86400000 > 90) { localStorage.removeItem(CALIB_KEY); return null }
    return c
  } catch { return null }
}

export function clearCalibration() { localStorage.removeItem(CALIB_KEY) }

// ── Training data quality filter ───────────────────────────────────────────────

function filterQualityReadings(readings) {
  const withData = readings.filter(r =>
    r.raw_rppg_signal?.frames?.length && r.manual_systolic && r.manual_diastolic &&
    isPlausibleBP(r.manual_systolic, r.manual_diastolic)
  )
  if (withData.length < 10) return withData
  const sorted = [...withData].sort((a, b) => a.manual_systolic - b.manual_systolic)
  const median = sorted[Math.floor(sorted.length / 2)].manual_systolic
  return withData.filter(r => {
    if (Math.abs(r.manual_systolic - median) > 30) {
      console.warn('[vitalsModel] Outlier skipped:', r.manual_systolic, '(median:', median + ')')
      return false
    }
    return true
  })
}

// ── Training ───────────────────────────────────────────────────────────────────

export async function trainModel(readings, onProgress, reason = 'manual_trigger') {
  const clean = filterQualityReadings(readings)

  // Split by subject BEFORE augmentation so val set contains unseen subjects
  const subjectIds = [...new Set(clean.map(r => r.subject_id || r.subject_code).filter(Boolean))]
  const nVal = Math.max(1, Math.round(subjectIds.length * 0.2))
  const valSubjects = new Set(subjectIds.slice(-nVal))  // hold out most-recent subjects
  const trainReadings = clean.filter(r => !valSubjects.has(r.subject_id || r.subject_code))
  const valReadings   = clean.filter(r =>  valSubjects.has(r.subject_id || r.subject_code))

  function toFeatLabel(r) {
    const sub     = r.validation_subjects || {}
    const devFull = r.device_info ? { ...r.device_info, pixelRatio: r.device_info.pixelRatio || 2 } : null
    const fv      = extractFeatures(r.raw_rppg_signal, sub, devFull)
    const label   = [r.manual_systolic, r.manual_diastolic, r.manual_hr || 70, r.manual_spo2 || DEFAULT_SPO2]
    return { fv, label }
  }

  const trainRaw = [], trainLabels = []
  for (const r of trainReadings) {
    try { const { fv, label } = toFeatLabel(r); trainRaw.push(fv); trainLabels.push(label) }
    catch (e) { console.warn('[vitalsModel] feature error:', e.message) }
  }

  if (trainRaw.length < 5) return null

  // Augment training data only
  const { augF, augL } = augmentData(trainRaw, trainLabels)
  console.log(`[vitalsModel] ${trainRaw.length} train (${valReadings.length} val subjects held out) → ${augF.length} augmented`)

  const xs     = tf.tensor2d(augF)
  const ys     = tf.tensor2d(augL)
  const yMean  = ys.mean(0)
  const yVar   = ys.sub(yMean).square().mean(0)
  const yStd   = yVar.sqrt().add(tf.scalar(1e-7))
  const ysNorm = ys.sub(yMean).div(yStd)
  const yMeanArr = await yMean.array()
  const yStdArr  = await yStd.array()
  yVar.dispose()

  let model
  try {
    model = await tf.loadLayersModel(MODEL_KEY)
    model.compile({ optimizer: tf.train.adam(0.0003), loss: 'meanSquaredError', metrics: ['mae'] })
    console.log('[vitalsModel] continuing from existing model')
  } catch {
    model = buildModel()
    console.log('[vitalsModel] new model')
  }

  const EPOCHS = 100
  const history = await model.fit(xs, ysNorm, {
    epochs: EPOCHS,
    batchSize: Math.min(32, Math.floor(augF.length / 2)),
    shuffle: true,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        if (epoch % 10 === 0 || epoch === EPOCHS - 1)
          onProgress?.(epoch + 1, EPOCHS, { ...logs, label: 'unified model' })
      },
    },
  })

  const normParams = { mean: yMeanArr, std: yStdArr }
  localStorage.setItem(NORM_KEY, JSON.stringify(normParams))

  const finalMae = history.history.mae.at(-1)

  // Compute honest MAE on held-out subjects (not augmented)
  let valMae = null, valMaeSys = null, valMaeDia = null
  if (valReadings.length > 0) {
    const valF = [], valL = []
    for (const r of valReadings) {
      try { const { fv, label } = toFeatLabel(r); valF.push(fv); valL.push(label) }
      catch {}
    }
    if (valF.length > 0) {
      const xsVal  = tf.tensor2d(valF)
      const predN  = model.predict(xsVal)
      const predArr = await predN.array()
      xsVal.dispose(); predN.dispose()

      const preds = predArr.map(p => p.map((v, i) => v * yStdArr[i] + yMeanArr[i]))
      const sysErrs = preds.map((p, i) => Math.abs(p[0] - valL[i][0]))
      const diaErrs = preds.map((p, i) => Math.abs(p[1] - valL[i][1]))
      valMaeSys = sysErrs.reduce((a, b) => a + b, 0) / sysErrs.length
      valMaeDia = diaErrs.reduce((a, b) => a + b, 0) / diaErrs.length
      valMae    = (valMaeSys + valMaeDia) / 2
      console.log(`[vitalsModel] honest val MAE — sys ±${valMaeSys.toFixed(1)} dia ±${valMaeDia.toFixed(1)} (${valF.length} held-out readings)`)
    }
  }

  const version = `v${Math.floor(trainRaw.length / 10)}`
  const meta    = { version, samples: trainRaw.length, finalMae, valMae, valMaeSys, valMaeDia, retrainReason: reason }
  localStorage.setItem(META_KEY, JSON.stringify({ ...meta, trainedAt: new Date().toISOString() }))
  await model.save(MODEL_KEY)
  await saveToSupabase(meta, normParams)
  xs.dispose(); ys.dispose(); yMean.dispose(); yStd.dispose(); ysNorm.dispose(); model.dispose()

  return meta
}

// ── Prediction ─────────────────────────────────────────────────────────────────

export async function predictBP(rppgSignal, subject = {}, devInfo = null) {
  try {
    const norm = JSON.parse(localStorage.getItem(NORM_KEY) || 'null')
    if (!norm) return null

    const fv    = extractFeatures(rppgSignal, subject, devInfo)
    console.log('[vitalsModel] features (30):', fv.map(v => +v.toFixed(3)))

    const model = await tf.loadLayersModel(MODEL_KEY).catch(() => null)
    if (!model) return null

    const input  = tf.tensor2d([fv])
    const output = model.predict(input)
    const pred   = await output.array()
    input.dispose(); output.dispose(); model.dispose()

    const [sysN, diaN, hrN, spo2N] = pred[0]
    const rawSys  = sysN  * norm.std[0] + norm.mean[0]
    const rawDia  = diaN  * norm.std[1] + norm.mean[1]
    const rawHr   = hrN   * norm.std[2] + norm.mean[2]
    const rawSpo2 = spo2N * norm.std[3] + norm.mean[3]

    console.log('[vitalsModel] raw:', { rawSys: +rawSys.toFixed(1), rawDia: +rawDia.toFixed(1), rawHr: +rawHr.toFixed(1), rawSpo2: +rawSpo2.toFixed(1) })

    const { systolic, diastolic } = clampBP(rawSys, rawDia)
    const hr   = Math.max(40, Math.min(200, Math.round(rawHr)))
    const spo2 = Math.max(70, Math.min(100, Math.round(rawSpo2)))

    const calib  = getCalibration()
    const calSys = calib ? Math.max(70, Math.min(200, systolic + calib.systolicOffset)) : systolic
    const calDia = calib ? Math.max(40, Math.min(130, diastolic + calib.diastolicOffset)) : diastolic

    return { systolic: calSys, diastolic: calDia, hr, spo2, confidence: 'medium', calibrated: !!calib }
  } catch (e) {
    console.warn('[vitalsModel] predict failed:', e.message)
    return null
  }
}
