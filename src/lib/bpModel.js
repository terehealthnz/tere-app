/**
 * Tere Vitals — In-browser BP estimation model
 * TensorFlow.js neural network trained incrementally from validation readings.
 * Clinical label: INDICATIVE ESTIMATE ONLY — not validated for clinical use.
 */

import * as tf from '@tensorflow/tfjs'
import { supabase } from './supabase'

const MODEL_KEY = 'localstorage://tere-bp-model'
const NORM_KEY  = 'tere-bp-norm'
const META_KEY  = 'tere-bp-meta'

// Minimum for showing estimates to patients
export const BP_SHOW_THRESHOLD = { samples: 100, valMae: 15 }

// ── Peak detection ─────────────────────────────────────────────────────────────

function findPeaks(signal, fps) {
  const minDist = Math.floor((fps || 30) * 0.4)
  const peaks = []
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > signal[i - 1] && signal[i] > signal[i + 1]) {
      if (!peaks.length || i - peaks[peaks.length - 1] >= minDist) {
        peaks.push(i)
      }
    }
  }
  return peaks
}

// ── Feature extraction ─────────────────────────────────────────────────────────

export function extractFeatures(rppgSignal, subject = {}) {
  const frames = rppgSignal?.frames || []
  const fps    = rppgSignal?.fps || 30
  if (frames.length < 30) throw new Error('Not enough frames')

  const green = frames.map(f => f.g)
  const n = green.length
  const mean = green.reduce((a, b) => a + b, 0) / n
  const variance = green.map(x => (x - mean) ** 2).reduce((a, b) => a + b, 0) / n
  const std = Math.sqrt(variance) || 1
  const norm = green.map(x => (x - mean) / std)

  const peaks = findPeaks(norm, fps)
  const rrIntervals = peaks.length > 1
    ? peaks.slice(1).map((p, i) => ((p - peaks[i]) / fps) * 1000)
    : []

  const meanRR = rrIntervals.length
    ? rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length : 0
  const hr = meanRR > 0 ? 60000 / meanRR : 0

  const sdnn = rrIntervals.length > 1
    ? Math.sqrt(rrIntervals.map(x => (x - meanRR) ** 2).reduce((a, b) => a + b, 0) / rrIntervals.length)
    : 0

  const rmssd = rrIntervals.length > 2
    ? Math.sqrt(
        rrIntervals.slice(1).map((rr, i) => (rr - rrIntervals[i]) ** 2)
          .reduce((a, b) => a + b, 0) / (rrIntervals.length - 1)
      )
    : 0

  const signalPower = norm.map(x => x * x).reduce((a, b) => a + b, 0) / n

  const fv = [
    hr || 0,
    sdnn || 0,
    rmssd || 0,
    meanRR || 0,
    signalPower,
    Number(subject.age) || 35,
    subject.sex === 'male' ? 1 : 0,
    Number(subject.height_cm) || 170,
    Number(subject.weight_kg) || 75,
    Number(subject.fitzpatrick_scale) || 2,
  ]
  if (fv.some(v => !isFinite(v) || isNaN(v))) throw new Error('Non-finite features extracted')
  return fv
}

// ── Model architecture ─────────────────────────────────────────────────────────

function buildModel() {
  const model = tf.sequential()
  model.add(tf.layers.dense({ inputShape: [10], units: 64, activation: 'relu', kernelInitializer: 'glorotUniform' }))
  model.add(tf.layers.dropout({ rate: 0.2 }))
  model.add(tf.layers.dense({ units: 32, activation: 'relu' }))
  model.add(tf.layers.dropout({ rate: 0.2 }))
  model.add(tf.layers.dense({ units: 16, activation: 'relu' }))
  model.add(tf.layers.dense({ units: 2, activation: 'linear' }))
  model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError', metrics: ['mae'] })
  return model
}

// ── Persistence ────────────────────────────────────────────────────────────────

async function saveToSupabase(model, meta, normParams) {
  return new Promise((resolve) => {
    model.save(tf.io.withSaveHandler(async (artifacts) => {
      try {
        const { error } = await supabase.from('model_versions').insert({
          model_version:    meta.version,
          training_samples: meta.samples,
          final_loss:       meta.finalLoss,
          final_mae:        meta.finalMae,
          val_mae:          meta.valMae,
          model_topology:   artifacts.modelTopology,
          weight_specs:     artifacts.weightSpecs,
          weight_data:      Array.from(new Float32Array(artifacts.weightData)),
          bp_mean:          normParams.mean,
          bp_std:           normParams.std,
        })
        if (error) console.warn('[bpModel] Supabase save error:', error.message)
      } catch (e) {
        console.warn('[bpModel] Supabase save failed:', e.message)
      }
      resolve()
      return { modelArtifactsInfo: { dateSaved: new Date() } }
    }))
  })
}

export async function loadModelFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('model_versions')
      .select('*')
      .order('trained_at', { ascending: false })
      .limit(1)
      .single()
    if (error || !data?.model_topology) return null

    const model = await tf.loadLayersModel(tf.io.fromMemory({
      modelTopology: data.model_topology,
      weightSpecs:   data.weight_specs,
      weightData:    new Float32Array(data.weight_data).buffer,
    }))
    model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError', metrics: ['mae'] })

    const normParams = { mean: data.bp_mean, std: data.bp_std }
    const metaObj = {
      version: data.model_version, samples: data.training_samples,
      valMae: data.val_mae, finalMae: data.final_mae, trainedAt: data.trained_at,
    }
    localStorage.setItem(NORM_KEY, JSON.stringify(normParams))
    localStorage.setItem(META_KEY, JSON.stringify(metaObj))
    await model.save(MODEL_KEY)
    model.dispose()
    return metaObj
  } catch (e) {
    console.warn('[bpModel] loadFromSupabase failed:', e.message)
    return null
  }
}

// ── Local meta accessors ───────────────────────────────────────────────────────

export function getLocalMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || 'null') } catch { return null }
}

export function bpModelReady() {
  const meta = getLocalMeta()
  if (!meta) return false
  return (meta.samples || 0) >= BP_SHOW_THRESHOLD.samples &&
    (meta.valMae == null || meta.valMae <= BP_SHOW_THRESHOLD.valMae)
}

// ── Training ───────────────────────────────────────────────────────────────────

export async function trainModel(readings, onProgress) {
  const featureList = []
  const labelList   = []

  for (const r of readings) {
    if (!r.raw_rppg_signal?.frames?.length) continue
    if (!r.manual_systolic || !r.manual_diastolic) continue
    try {
      const fv = extractFeatures(r.raw_rppg_signal, r.validation_subjects || {})
      featureList.push(fv)
      labelList.push([r.manual_systolic, r.manual_diastolic])
    } catch {}
  }

  if (featureList.length < 5) return null

  const xs = tf.tensor2d(featureList)
  const ys = tf.tensor2d(labelList)

  // Compute normalisation params
  const yMean    = ys.mean(0)
  const yMeanArr = await yMean.array()
  const yVar     = ys.sub(yMean).square().mean(0)
  const yStd     = yVar.sqrt().add(tf.scalar(1e-7))
  const yStdArr  = await yStd.array()
  const ysNorm   = ys.sub(yMean).div(yStd)
  yVar.dispose()

  // Load existing model or build new
  let model
  try {
    model = await tf.loadLayersModel(MODEL_KEY)
    model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError', metrics: ['mae'] })
    console.log('[bpModel] Continuing from existing model')
  } catch {
    model = buildModel()
    console.log('[bpModel] Building new model')
  }

  const useValidation = featureList.length >= 40
  const EPOCHS = 50
  const history = await model.fit(xs, ysNorm, {
    epochs: EPOCHS,
    batchSize: Math.min(16, Math.floor(featureList.length / 2)),
    validationSplit: useValidation ? 0.2 : 0,
    shuffle: true,
    callbacks: {
      onEpochEnd: (epoch, logs) => onProgress?.(epoch, EPOCHS, logs),
    },
  })

  const normParams = { mean: yMeanArr, std: yStdArr }
  localStorage.setItem(NORM_KEY, JSON.stringify(normParams))

  const finalLoss = history.history.loss.at(-1)
  const finalMae  = history.history.mae.at(-1)
  const valMae    = history.history.val_mae?.at(-1) ?? null
  const version   = `v${Math.floor(readings.length / 10)}`

  const meta = { version, samples: featureList.length, finalLoss, finalMae, valMae }
  localStorage.setItem(META_KEY, JSON.stringify({ ...meta, trainedAt: new Date().toISOString() }))
  await model.save(MODEL_KEY)
  await saveToSupabase(model, meta, normParams)

  // Cleanup
  xs.dispose(); ys.dispose(); yMean.dispose(); yStd.dispose(); ysNorm.dispose(); model.dispose()

  return meta
}

// ── Prediction ─────────────────────────────────────────────────────────────────

export async function predictBP(rppgSignal, subject = {}) {
  try {
    const norm = JSON.parse(localStorage.getItem(NORM_KEY) || 'null')
    if (!norm) return null

    const model = await tf.loadLayersModel(MODEL_KEY)
    model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError', metrics: ['mae'] })

    const fv = extractFeatures(rppgSignal, subject)
    const predTensor = model.predict(tf.tensor2d([fv]))
    const predArr    = await predTensor.array()
    predTensor.dispose()
    model.dispose()

    const [sysNorm, diaNorm] = predArr[0]
    const systolic  = Math.round(sysNorm * norm.std[0] + norm.mean[0])
    const diastolic = Math.round(diaNorm * norm.std[1] + norm.mean[1])

    if (systolic < 60 || systolic > 220) return null
    if (diastolic < 30 || diastolic > 140) return null
    if (diastolic >= systolic) return null

    return { systolic, diastolic }
  } catch (e) {
    console.warn('[bpModel] predictBP failed:', e.message)
    return null
  }
}
