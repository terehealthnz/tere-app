// ME-rPPG per-frame BVP worker
// Adapted from Health-HCI-Group/ME-rPPG-demo (Apache-2.0).
// Changes vs upstream:
//   - WASM paths point at self-hosted /me-rppg/ort/ (we don't allowlist jsdelivr on terehealth CSP)
//   - All asset URLs are absolute from /me-rppg/ so this works regardless of the mount route
importScripts('/me-rppg/ort/ort.min.js')

let onnxSession = null
let state = {}
let lastTimestamp = null

ort.env.wasm.wasmPaths = '/me-rppg/ort/'
ort.env.wasm.numThreads = 1
ort.env.wasm.simd = true

ort.InferenceSession.create('/me-rppg/model.onnx', { executionProviders: ['wasm'] }).then((session) => {
  onnxSession = session
  self.postMessage({ type: 'ready', which: 'model' })
}).catch((err) => {
  self.postMessage({ type: 'error', which: 'model', message: String(err?.message || err) })
})

function shapeOf(array) {
  const shape = []
  let current = array
  while (Array.isArray(current)) {
    shape.push(current.length)
    current = current[0]
  }
  return shape
}

fetch('/me-rppg/state.json')
  .then((res) => res.json())
  .then((data) => {
    for (const [key, value] of Object.entries(data)) {
      const shape = shapeOf(value)
      const array = new Float32Array(value.flat(Infinity))
      state[key] = new ort.Tensor('float32', array, shape)
    }
    self.postMessage({ type: 'ready', which: 'state' })
  })
  .catch((err) => {
    self.postMessage({ type: 'error', which: 'state', message: String(err?.message || err) })
  })

self.onmessage = async (event) => {
  if (event.data?.type === 'reset') {
    lastTimestamp = null
    return
  }
  if (!onnxSession || !state) return
  const startTime = Date.now()
  const { input, timestamp, lambda } = event.data
  const inputData = new ort.Tensor('float32', input, [1, 1, 36, 36, 3])
  const dtVal = Math.max((lastTimestamp ? (timestamp - lastTimestamp) / (lambda || 1) : 1 / 30), 1 / 90)
  const dt = new ort.Tensor('float32', [dtVal], [])
  lastTimestamp = timestamp
  const feeds = {}
  feeds[onnxSession.inputNames[0]] = inputData
  for (const [key, value] of Object.entries(state)) feeds[key] = value
  feeds[onnxSession.inputNames[37]] = dt
  try {
    const outputs = await onnxSession.run(feeds)
    const output = outputs[onnxSession.outputNames[0]].cpuData[0]
    for (let i = 1; i < onnxSession.outputNames.length; i++) {
      state[onnxSession.inputNames[i]] = outputs[onnxSession.outputNames[i]]
    }
    const delay = Date.now() - startTime
    self.postMessage({ type: 'data', output, delay, timestamp: Date.now() })
  } catch (err) {
    self.postMessage({ type: 'error', which: 'inference', message: String(err?.message || err) })
  }
}
