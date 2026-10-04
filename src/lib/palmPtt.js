// Dual-ROI Pulse Transit Time (PTT) tracker — measures the time delay between
// the pulse arrival at the forehead and at the palm, from a single front-camera
// video where the patient holds their palm up next to their face.
//
// Based on Qiu et al., ICMI '25 (DOI 10.1145/3716553.3750789), who showed that
// 1/PTT linearly correlates with systolic BP via the Moens-Korteweg equation.
// For Tere this is complementary to BP v3 (which learns waveform morphology);
// PTT is a different physiological signal from a different mechanism.
//
// Phase 1 (this file): capture PTT only. No BP regression yet — we need paired
// cuff + PTT data on Tere subjects first before fitting the regression.
//
// Runs in parallel to RppgMeasurement during a VitalsValidate scan. Uses the
// same video element but owns its own face + hand landmarker instances so the
// classical path (face scan) is never blocked.

const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'

// Band-pass + peak detection — mirrors rppg.js so the two tracks compare
// apples-to-apples. 4th-order zero-phase band-pass 0.5-3 Hz (HR 30-180 bpm).
function bandpass(signal, fps, low = 0.5, high = 3.0) {
  if (signal.length < 10) return signal
  // Simple IIR band-pass by subtracting a wide moving average (low-cut) then
  // smoothing with a narrow one (high-cut). Fast + good-enough for peak timing.
  const lowWin = Math.max(2, Math.round(fps / low))
  const highWin = Math.max(2, Math.round(fps / high / 2))
  const out = new Array(signal.length).fill(0)
  for (let i = 0; i < signal.length; i++) {
    let lo = 0, loN = 0, hi = 0, hiN = 0
    for (let j = Math.max(0, i - lowWin); j < Math.min(signal.length, i + lowWin + 1); j++) { lo += signal[j]; loN++ }
    for (let j = Math.max(0, i - highWin); j < Math.min(signal.length, i + highWin + 1); j++) { hi += signal[j]; hiN++ }
    out[i] = (hi / hiN) - (lo / loN)
  }
  return out
}

// Peak detection: timestamp (ms) of local maxima above zero after band-pass.
function findPeakTimes(signal, timestamps) {
  const peaks = []
  for (let i = 2; i < signal.length - 2; i++) {
    if (signal[i] > 0 &&
        signal[i] > signal[i-1] && signal[i] > signal[i-2] &&
        signal[i] > signal[i+1] && signal[i] > signal[i+2]) {
      peaks.push(timestamps[i])
    }
  }
  return peaks
}

// Palm ROI = bounding box of wrist + 5 knuckles (landmarks 0, 1, 5, 9, 13, 17).
// Excludes fingers (which move independently and bias the pulse signal).
const PALM_LANDMARK_IDS = [0, 1, 5, 9, 13, 17]

// Forehead ROI = 30-70% horizontal × 0-18% vertical of the face bbox. Same patch
// the classical pipeline weights highest in sampleROI.
function foreheadBbox(faceLandmarks, w, h) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0
  for (const l of faceLandmarks) {
    if (l.x < minX) minX = l.x; if (l.y < minY) minY = l.y
    if (l.x > maxX) maxX = l.x; if (l.y > maxY) maxY = l.y
  }
  const fx = minX * w, fy = minY * h, fw = (maxX - minX) * w, fh = (maxY - minY) * h
  return {
    x: Math.round(fx + fw * 0.30),
    y: Math.round(fy),
    w: Math.round(fw * 0.40),
    h: Math.round(fh * 0.18),
  }
}

function palmBbox(handLandmarks, w, h) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0
  for (const id of PALM_LANDMARK_IDS) {
    const l = handLandmarks[id]
    if (!l) continue
    if (l.x < minX) minX = l.x; if (l.y < minY) minY = l.y
    if (l.x > maxX) maxX = l.x; if (l.y > maxY) maxY = l.y
  }
  const px = minX * w, py = minY * h, pw = (maxX - minX) * w, ph = (maxY - minY) * h
  // Expand by 10% to catch skin outside the strict landmark hull
  return {
    x: Math.max(0, Math.round(px - pw * 0.05)),
    y: Math.max(0, Math.round(py - ph * 0.05)),
    w: Math.min(w, Math.round(pw * 1.1)),
    h: Math.min(h, Math.round(ph * 1.1)),
  }
}

function sampleGreen(ctx, bbox) {
  if (bbox.w < 5 || bbox.h < 5) return null
  try {
    const d = ctx.getImageData(bbox.x, bbox.y, bbox.w, bbox.h).data
    let g = 0, cnt = 0
    for (let i = 0; i < d.length; i += 4) {
      const bri = (d[i] + d[i+1] + d[i+2]) / 3
      if (bri < 30 || bri > 240) continue  // skip pure-black or saturated pixels
      g += d[i+1]
      cnt++
    }
    return cnt > 0 ? g / cnt : null
  } catch { return null }
}

export class PalmPttTracker {
  constructor() {
    this.faceLandmarker = null
    this.handLandmarker = null
    this.running = false
    this.videoEl = null
    this.canvas = null
    this.startTime = 0
    this.foreheadSignal = []
    this.palmSignal = []
    this.foreheadT = []
    this.palmT = []
    this.palmSeenFrames = 0
    this.totalFrames = 0
    this.rafId = null
    this.lastHandDetectMs = 0
  }

  async init() {
    const { FilesetResolver, FaceLandmarker, HandLandmarker } = await import('@mediapipe/tasks-vision')
    const vision = await FilesetResolver.forVisionTasks(WASM_URL)
    const common = { runningMode: 'VIDEO' }
    try {
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        ...common, numFaces: 1, baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'GPU' },
      })
    } catch {
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        ...common, numFaces: 1, baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'CPU' },
      })
    }
    try {
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        ...common, numHands: 1, baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'GPU' },
      })
    } catch {
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        ...common, numHands: 1, baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'CPU' },
      })
    }
  }

  async start(videoEl) {
    if (!this.faceLandmarker || !this.handLandmarker) throw new Error('PalmPttTracker.init() first')
    this.videoEl = videoEl
    this.canvas = document.createElement('canvas')
    this.canvas.width = videoEl.videoWidth || 640
    this.canvas.height = videoEl.videoHeight || 480
    this.running = true
    this.startTime = performance.now()
    this._tick()
  }

  _tick() {
    if (!this.running) return
    const now = performance.now()
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    try {
      ctx.drawImage(this.videoEl, 0, 0, this.canvas.width, this.canvas.height)
      this.totalFrames++

      const faceRes = this.faceLandmarker.detectForVideo(this.videoEl, now)
      const faceLms = faceRes?.faceLandmarks?.[0]
      if (faceLms) {
        const bbox = foreheadBbox(faceLms, this.canvas.width, this.canvas.height)
        const g = sampleGreen(ctx, bbox)
        if (g != null) { this.foreheadSignal.push(g); this.foreheadT.push(now - this.startTime) }
      }

      // Hand detection is ~3× slower than face — only run every 2nd frame.
      // Interpolate ROI position between detections.
      if (now - this.lastHandDetectMs > 50) {
        this.lastHandDetectMs = now
        const handRes = this.handLandmarker.detectForVideo(this.videoEl, now)
        const handLms = handRes?.landmarks?.[0]
        if (handLms) {
          this.palmSeenFrames++
          const bbox = palmBbox(handLms, this.canvas.width, this.canvas.height)
          this._lastPalmBbox = bbox
        } else {
          this._lastPalmBbox = null
        }
      }
      if (this._lastPalmBbox) {
        const g = sampleGreen(ctx, this._lastPalmBbox)
        if (g != null) { this.palmSignal.push(g); this.palmT.push(now - this.startTime) }
      }
    } catch { /* keep going */ }

    this.rafId = requestAnimationFrame(() => this._tick())
  }

  stop() {
    this.running = false
    if (this.rafId) cancelAnimationFrame(this.rafId)
    return this._computePtt()
  }

  _computePtt() {
    const palmDetectionRate = this.totalFrames > 0 ? this.palmSeenFrames / this.totalFrames : 0
    if (this.foreheadSignal.length < 60 || this.palmSignal.length < 60) {
      return {
        pttMs: null, pttStdMs: null, pttOrder: null, beatsMatched: 0,
        palmDetectionRate, foreheadSamples: this.foreheadSignal.length, palmSamples: this.palmSignal.length,
        reason: 'insufficient-samples',
      }
    }

    // Resample both to common timestamps via linear interp
    const fps = this.foreheadT.length / ((this.foreheadT[this.foreheadT.length - 1] - this.foreheadT[0]) / 1000)
    const foreheadBp = bandpass(this.foreheadSignal, fps)
    const palmBp = bandpass(this.palmSignal, fps)
    const foreheadPeaks = findPeakTimes(foreheadBp, this.foreheadT)
    const palmPeaks = findPeakTimes(palmBp, this.palmT)

    if (foreheadPeaks.length < 3 || palmPeaks.length < 3) {
      return {
        pttMs: null, pttStdMs: null, pttOrder: null,
        beatsMatched: 0, palmDetectionRate,
        foreheadPeaks: foreheadPeaks.length, palmPeaks: palmPeaks.length,
        reason: 'too-few-peaks',
      }
    }

    // For each forehead peak find the nearest palm peak within ±200ms
    // (physiological PTT between forehead and palm is 50-150ms typically;
    // ±200ms window catches direction-flipped subjects).
    const delays = []
    for (const ft of foreheadPeaks) {
      let bestDt = null
      let bestAbs = Infinity
      for (const pt of palmPeaks) {
        const dt = pt - ft
        if (Math.abs(dt) < bestAbs && Math.abs(dt) <= 200) {
          bestAbs = Math.abs(dt); bestDt = dt
        }
      }
      if (bestDt != null) delays.push(bestDt)
    }

    if (delays.length < 3) {
      return {
        pttMs: null, pttStdMs: null, pttOrder: null,
        beatsMatched: delays.length, palmDetectionRate,
        reason: 'too-few-matched-beats',
      }
    }

    const mean = delays.reduce((s, v) => s + v, 0) / delays.length
    const variance = delays.reduce((s, v) => s + (v - mean) ** 2, 0) / delays.length
    const std = Math.sqrt(variance)

    // Order: majority sign of delays. PF = palm-first (negative), FP = face-first (positive).
    const pos = delays.filter(d => d > 0).length
    const order = pos > delays.length * 0.7 ? 'face_first'
                 : pos < delays.length * 0.3 ? 'palm_first'
                 : 'mixed'

    return {
      pttMs: Math.round(Math.abs(mean) * 10) / 10,
      pttStdMs: Math.round(std * 10) / 10,
      pttOrder: order,
      beatsMatched: delays.length,
      palmDetectionRate: Number(palmDetectionRate.toFixed(3)),
      foreheadPeaks: foreheadPeaks.length,
      palmPeaks: palmPeaks.length,
      rawDelays: delays.map(d => Math.round(d)),
    }
  }

  close() {
    try { this.faceLandmarker?.close() } catch {}
    try { this.handLandmarker?.close() } catch {}
    this.faceLandmarker = null
    this.handLandmarker = null
  }
}
