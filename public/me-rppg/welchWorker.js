// ME-rPPG windowed Welch-PSD + HR estimator worker
// Adapted from Health-HCI-Group/ME-rPPG-demo (Apache-2.0).
importScripts('/me-rppg/ort/ort.min.js')

let welchSession = null
let hrSession = null

ort.env.wasm.wasmPaths = '/me-rppg/ort/'
ort.env.wasm.numThreads = 1
ort.env.wasm.simd = true

ort.InferenceSession.create('/me-rppg/welch_psd.onnx', { executionProviders: ['wasm'] }).then((session) => {
  welchSession = session
  self.postMessage({ type: 'ready', which: 'welch' })
})

ort.InferenceSession.create('/me-rppg/get_hr.onnx', { executionProviders: ['wasm'] }).then((session) => {
  hrSession = session
  self.postMessage({ type: 'ready', which: 'hr' })
})

self.onmessage = async (event) => {
  if (!welchSession || !hrSession) return
  const { input } = event.data
  const inputData = new ort.Tensor('float32', input, [1, 1, input.length])
  try {
    const outputs = await welchSession.run({ input: inputData })
    const freqs = outputs.freqs
    const psd = outputs.psd
    const hr = (await hrSession.run({ freqs, psd })).hr.cpuData[0]
    self.postMessage({ type: 'data', hr })
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err?.message || err) })
  }
}
