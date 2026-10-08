// ME-rPPG tracker — runs the Memory-efficient rPPG model (arXiv 2504.01774,
// Health-HCI-Group/ME-rPPG-demo, Apache-2.0) as a parallel HR estimation track
// during VitalsValidate scans so we can compare its predictions against the
// classical pipeline on paired-ground-truth data.
//
// Not production patient-facing yet — gated to validation flows only.

// Mirrors demo's Kalman smoother used on both BVP and HR streams.
class KalmanFilter1D {
  constructor(processNoise, measurementNoise, initialState, initialEstimateError) {
    this.processNoise = processNoise
    this.measurementNoise = measurementNoise
    this.estimate = initialState
    this.estimateError = initialEstimateError
  }
  update(measurement) {
    const prediction = this.estimate
    const predictionError = this.estimateError + this.processNoise
    const kalmanGain = predictionError / (predictionError + this.measurementNoise)
    this.estimate = prediction + kalmanGain * (measurement - prediction)
    this.estimateError = (1 - kalmanGain) * predictionError
    return this.estimate
  }
}

export class MeRppgTracker {
  constructor() {
    this.onnxWorker = null
    this.welchWorker = null
    this.ready = { model: false, state: false, welch: false, hr: false }
    this.readyPromise = null
    this.readyResolve = null
    this.inputQueueCount = 0
    this.dropCount = 30
    this.bvpBuffer = new Array(300).fill(0)
    this.bvpBufferFill = 0
    this.sampleCountSinceWelch = 300 - 90  // match demo warmup
    this.kfBvp = null
    this.kfHr = null
    this.meanHrErr = 0.04
    this.latestHrRaw = null
    this.latestHrSmoothed = null
    this.frameTimestamps = []  // last ~300 for fps correction
    this.lambda = 1
    this.bvpSeries = []  // full log for debugging
    this.errored = false
    this.errorMessage = null
  }

  async init() {
    if (this.readyPromise) return this.readyPromise
    this.readyPromise = new Promise((resolve) => { this.readyResolve = resolve })
    this.onnxWorker = new Worker('/me-rppg/onnxWorker.js')
    this.welchWorker = new Worker('/me-rppg/welchWorker.js')

    this.onnxWorker.onmessage = (e) => this._onOnnxMessage(e)
    this.welchWorker.onmessage = (e) => this._onWelchMessage(e)
    this.onnxWorker.onerror = (e) => { this.errored = true; this.errorMessage = e.message }
    this.welchWorker.onerror = (e) => { this.errored = true; this.errorMessage = e.message }

    return this.readyPromise
  }

  isReady() {
    return this.ready.model && this.ready.state && this.ready.welch && this.ready.hr
  }

  _checkReady() {
    if (this.isReady() && this.readyResolve) {
      const r = this.readyResolve
      this.readyResolve = null
      r(true)
    }
  }

  _onOnnxMessage(event) {
    const { type } = event.data
    if (type === 'ready') {
      const { which } = event.data
      if (which === 'model') this.ready.model = true
      if (which === 'state') this.ready.state = true
      this._checkReady()
      return
    }
    if (type === 'error') {
      this.errored = true
      this.errorMessage = event.data.message
      return
    }
    this.inputQueueCount--
    const { output, timestamp } = event.data
    if (this.dropCount > 0) { this.dropCount--; return }
    if (!this.kfBvp) {
      this.kfBvp = new KalmanFilter1D(1, 0.5, output, 1)
    } else {
      this.kfBvp.update(output)
    }
    const smoothedBvp = this.kfBvp.estimate
    this.bvpSeries.push({ bvp: smoothedBvp, t: timestamp })
    // Push into 300-sample circular buffer
    if (this.bvpBufferFill < 300) {
      this.bvpBuffer[this.bvpBufferFill] = smoothedBvp
      this.bvpBufferFill++
    } else {
      this.bvpBuffer.shift()
      this.bvpBuffer.push(smoothedBvp)
    }
    this.sampleCountSinceWelch++
    if (this.sampleCountSinceWelch >= 300 && this.bvpBufferFill >= 300) {
      this.welchWorker.postMessage({ input: new Float32Array(this.bvpBuffer) })
      this.sampleCountSinceWelch = 270  // next welch after +30 samples
    }
  }

  _onWelchMessage(event) {
    const { type } = event.data
    if (type === 'ready') {
      const { which } = event.data
      if (which === 'welch') this.ready.welch = true
      if (which === 'hr') this.ready.hr = true
      this._checkReady()
      return
    }
    if (type === 'error') {
      this.errored = true
      this.errorMessage = event.data.message
      return
    }
    let { hr } = event.data
    // Fps correction — demo assumes 30fps, scales by actual
    if (this.frameTimestamps.length > 300) {
      const recent = this.frameTimestamps.slice(-301)
      let totalDuration = 0, validIntervals = 0
      for (let i = 1; i < recent.length; i++) {
        const delta = recent[i] - recent[i - 1]
        if (delta > 0 && delta <= 0.5) {
          totalDuration += delta
          validIntervals++
        }
      }
      const averageFps = totalDuration > 0 ? validIntervals / totalDuration : 30
      hr = (hr / 30) * averageFps
    }
    this.latestHrRaw = hr
    if (!this.kfHr) {
      this.kfHr = new KalmanFilter1D(1.0, 2.0, hr, 1)
    } else {
      this.kfHr.update(hr)
    }
    this.latestHrSmoothed = this.kfHr.estimate
    this.meanHrErr = 0.8 * this.meanHrErr + 0.2 * Math.abs(this.kfHr.estimate - hr) / Math.max(hr, 1)
  }

  // imageData36x36: Uint8ClampedArray of length 36*36*4 (RGBA) from a 36×36 canvas
  // timestampMs: performance.now() when the frame was captured
  pushFrame(imageData36x36, timestampMs) {
    if (!this.isReady() || this.errored) return
    if (this.inputQueueCount >= 5) return  // backpressure — demo drops silently
    const input = new Float32Array(36 * 36 * 3)
    for (let i = 0; i < imageData36x36.length; i += 4) {
      const idx = i / 4
      input[idx * 3]     = imageData36x36[i]     / 255
      input[idx * 3 + 1] = imageData36x36[i + 1] / 255
      input[idx * 3 + 2] = imageData36x36[i + 2] / 255
    }
    const tSec = timestampMs / 1000
    this.frameTimestamps.push(tSec)
    if (this.frameTimestamps.length > 301) this.frameTimestamps.shift()
    this.inputQueueCount++
    this.onnxWorker.postMessage({ input, timestamp: tSec, lambda: this.lambda })
  }

  getLatestHR() {
    if (this.latestHrSmoothed == null) return null
    return {
      hr: this.latestHrSmoothed,
      hrRaw: this.latestHrRaw,
      confidence: this.meanHrErr < 0.025 ? 'high' : this.meanHrErr < 0.05 ? 'medium' : 'low',
      meanErr: this.meanHrErr,
      bvpSamples: this.bvpSeries.length,
    }
  }

  // 2026-10 addition: expose the Kalman-smoothed BVP waveform so BP feature
  // extraction (bpModelV3.pulseToV3Features) can run on ME-rPPG output instead
  // of POS. Returns {bvp: Float64Array, t: Float64Array (ms epoch), fps}.
  //
  // NOTE: the fps field returned here is unreliable because onnxWorker.js
  // stamps each output with `Date.now()` (ms epoch), not the input frame
  // timestamp. Prefer passing a known video-rate override from the caller
  // (e.g. framesProcessed / video.duration). We still compute an estimate so
  // standalone callers get something sane.
  getBvpWaveform() {
    if (!this.bvpSeries.length) return null
    const n = this.bvpSeries.length
    const bvp = new Float64Array(n)
    const t = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      bvp[i] = this.bvpSeries[i].bvp
      t[i] = this.bvpSeries[i].t
    }
    // t[] is ms epoch (worker uses Date.now). Convert to seconds for fps.
    let fps = 30
    if (n >= 2) {
      const durSec = (t[n - 1] - t[0]) / 1000
      if (durSec > 0.5) fps = (n - 1) / durSec
    }
    if (!Number.isFinite(fps) || fps < 5 || fps > 240) fps = 30
    return { bvp, t, fps }
  }

  reset() {
    this.inputQueueCount = 0
    this.dropCount = 30
    this.bvpBuffer = new Array(300).fill(0)
    this.bvpBufferFill = 0
    this.sampleCountSinceWelch = 300 - 90
    this.kfBvp = null
    this.kfHr = null
    this.meanHrErr = 0.04
    this.latestHrRaw = null
    this.latestHrSmoothed = null
    this.frameTimestamps = []
    this.bvpSeries = []
    if (this.onnxWorker) this.onnxWorker.postMessage({ type: 'reset' })
  }

  terminate() {
    this.onnxWorker?.terminate()
    this.welchWorker?.terminate()
    this.onnxWorker = null
    this.welchWorker = null
  }
}
