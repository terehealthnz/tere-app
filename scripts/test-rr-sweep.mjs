// Sweeps the envelope-window length and envelope-extraction method to find
// the combination that recovers RR across the whole physiological range.
//
// Motivation: the "widen to 3s" patch works only for very slow breathing.
// At 15 bpm (period 4s), a 3s min-max window covers 75% of a breath and
// saturates near the envelope maximum every window → weak 0.25 Hz signal → SNR
// too low → algorithm returns 0.

const RR_LOW_HZ  = 0.13
const RR_HIGH_HZ = 0.5

// ── FFT math (same as rppg.js) ───────────────────────────────────────────────
function hanning(n) { return Array.from({ length: n }, (_, i) => 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)))) }
function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p }
function fftComplex(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len
    const wR = Math.cos(ang), wI = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cR = 1, cI = 0
      for (let j = 0; j < len / 2; j++) {
        const uR = re[i+j], uI = im[i+j]
        const vR = re[i+j+len/2]*cR - im[i+j+len/2]*cI
        const vI = re[i+j+len/2]*cI + im[i+j+len/2]*cR
        re[i+j]       = uR + vR; im[i+j]       = uI + vI
        re[i+j+len/2] = uR - vR; im[i+j+len/2] = uI - vI
        const nR = cR*wR - cI*wI; cI = cR*wI + cI*wR; cR = nR
      }
    }
  }
}
function fftMagnitudes(signal) {
  const n = nextPow2(signal.length)
  const win = hanning(signal.length)
  const re  = [...signal.map((v, i) => v * win[i]), ...new Array(n - signal.length).fill(0)]
  const im  = new Array(n).fill(0)
  fftComplex(re, im)
  return { mags: re.map((_, i) => Math.sqrt(re[i]**2 + im[i]**2)), n }
}
function dominantFreq(signal, lowHz, highHz, fs) {
  const { mags, n } = fftMagnitudes(signal)
  const freqRes = fs / n
  let maxAmp = 0, domFreq = 0
  for (let i = 1; i < n / 2; i++) {
    const freq = i * freqRes
    if (freq < lowHz || freq > highHz) continue
    if (mags[i] > maxAmp) { maxAmp = mags[i]; domFreq = freq }
  }
  return domFreq
}
function signalSNR(signal, peakFreq, fs) {
  if (!peakFreq) return 0
  const { mags, n } = fftMagnitudes(signal)
  const freqRes = fs / n
  const peakBin = Math.round(peakFreq / freqRes)
  if (peakBin >= mags.length || peakBin < 1) return 0
  const noiseArr = mags.slice(1, Math.floor(n / 2)).filter((_, i) => Math.abs(i + 1 - peakBin) > 2)
  const avgNoise = noiseArr.length ? noiseArr.reduce((a, b) => a + b, 0) / noiseArr.length : 1
  return avgNoise > 0 ? mags[peakBin] / avgNoise : 0
}

// ── Method A: min-max envelope (current patched approach) ──
function methodMinMax(signal, fs, winSec) {
  const winN = Math.max(16, Math.floor(fs * winSec))
  const stride = Math.max(1, Math.floor(winN / 4))
  const env = []
  for (let i = 0; i + winN <= signal.length; i += stride) {
    let mn = signal[i], mx = signal[i]
    for (let j = i + 1; j < i + winN; j++) {
      const v = signal[j]
      if (v < mn) mn = v
      if (v > mx) mx = v
    }
    env.push(mx - mn)
  }
  return { env, envFs: fs / stride }
}

// ── Method B: |x| downsampled (rectify + decimate) ──
// |x| for a bandpass'd cardiac signal has DC + 2·hrHz + (rrHz mixing) components.
// Decimating by ~5-10× naturally lowpasses, leaving the breathing envelope.
function methodAbsDownsample(signal, fs, decim) {
  const abs = signal.map(v => Math.abs(v))
  const env = []
  for (let i = 0; i + decim <= abs.length; i += decim) {
    let s = 0
    for (let j = 0; j < decim; j++) s += abs[i + j]
    env.push(s / decim)
  }
  return { env, envFs: fs / decim }
}

// ── Synthetic signal (same as before) ──
function synthCardiacSignal({ durationSec, fs, hrBpm, rrBpm, noiseAmp = 0.05, seed = 42 }) {
  const n = Math.floor(durationSec * fs)
  const hrHz = hrBpm / 60
  const rrHz = rrBpm / 60
  let s = seed >>> 0
  const rand = () => { s = (1664525 * s + 1013904223) >>> 0; return (s / 4294967295) - 0.5 }
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / fs
    const envelope = 1 + 0.4 * Math.sin(2 * Math.PI * rrHz * t)
    out[i] = envelope * Math.sin(2 * Math.PI * hrHz * t) + noiseAmp * rand()
  }
  return out
}

function runOne(env, envFs) {
  const rrHz = dominantFreq(env, RR_LOW_HZ, RR_HIGH_HZ, envFs)
  const snr  = rrHz ? signalSNR(env, rrHz, envFs) : 0
  return { rrHz, rrBpm: rrHz ? Math.round(rrHz * 60) : 0, snr }
}

const cases = [
  { label: 'Slow    (RR 10)', hrBpm: 55,  rrBpm: 10 },
  { label: 'Rest    (RR 15)', hrBpm: 65,  rrBpm: 15 },
  { label: 'Active  (RR 20)', hrBpm: 90,  rrBpm: 20 },
  { label: 'Fast    (RR 25)', hrBpm: 110, rrBpm: 25 },
  { label: 'Tachy   (RR 28)', hrBpm: 130, rrBpm: 28 },
]

const fs = 30
const durationSec = 60

console.log(`\nSweep — 60s @ 30Hz, RR band [${RR_LOW_HZ}..${RR_HIGH_HZ}] Hz\n`)

console.log('Method A: min-max envelope, various window lengths')
console.log('  window     ' + cases.map(c => c.label.padEnd(16)).join(''))
for (const winSec of [0.8, 1.0, 1.5, 2.0, 3.0]) {
  let row = `  ${winSec.toFixed(1)}s`.padEnd(13)
  for (const c of cases) {
    const sig = synthCardiacSignal({ durationSec, fs, ...c })
    const { env, envFs } = methodMinMax(sig, fs, winSec)
    const { rrBpm, snr } = runOne(env, envFs)
    const err = rrBpm ? Math.abs(rrBpm - c.rrBpm) : Infinity
    const marker = err <= 3 ? '✓' : err === Infinity ? '×' : '~'
    row += `${marker} ${String(rrBpm).padStart(3)} snr${snr.toFixed(1)}`.padEnd(16)
  }
  console.log(row)
}

console.log('\nMethod B: |x| downsampled (decimate factor)')
console.log('  decim      ' + cases.map(c => c.label.padEnd(16)).join(''))
for (const decim of [4, 6, 8, 10, 12]) {
  let row = `  /${decim}`.padEnd(13)
  for (const c of cases) {
    const sig = synthCardiacSignal({ durationSec, fs, ...c })
    const { env, envFs } = methodAbsDownsample(sig, fs, decim)
    const { rrBpm, snr } = runOne(env, envFs)
    const err = rrBpm ? Math.abs(rrBpm - c.rrBpm) : Infinity
    const marker = err <= 3 ? '✓' : err === Infinity ? '×' : '~'
    row += `${marker} ${String(rrBpm).padStart(3)} snr${snr.toFixed(1)}`.padEnd(16)
  }
  console.log(row)
}

console.log('\nLegend: ✓ within 3 bpm  ~ off by more  × rejected (0)\n')
