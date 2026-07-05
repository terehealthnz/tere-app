// Deterministic test for the RR extraction patch.
//
// Reproduces the exact math from src/lib/rppg.js in isolation (no camera, no
// browser). Feeds a synthetic cardiac signal that mimics what the pipeline sees
// AFTER the cardiac bandpass filter — a ~65 bpm tone whose amplitude is
// modulated by breathing at 15 bpm — and compares:
//
//   OLD path : dominantFreq(cardiac, RR_LOW_HZ..RR_HIGH_HZ, fs)
//              → the code prod is currently running. Expected: pins near 30 bpm.
//
//   NEW path : respiratoryFreqHz(cardiac, fs)  (envelope FFT, patched version)
//              → uncommitted local fix. Expected: recovers ~15 bpm.
//
// Run:  node scripts/test-rr-patch.mjs

const RR_LOW_HZ  = 0.13
const RR_HIGH_HZ = 0.5

// ── Math (copied verbatim from src/lib/rppg.js so the test hits the same code) ──
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

// Duplicates of detrend/autocorrPeak from rppg.js so the test hits the same math.
function mean(a)  { return a.reduce((s,v)=>s+v,0)/a.length }
function detrend(a) {
  const n=a.length; if(n<2) return a
  const xm=(n-1)/2, ym=mean(a)
  const slope=a.reduce((s,v,i)=>s+(i-xm)*(v-ym),0)/a.reduce((s,_,i)=>s+(i-xm)**2,0)
  return a.map((v,i)=>v-(slope*(i-xm)+ym))
}
function autocorrPeak(signal, lowHz, highHz, fs) {
  const n = signal.length
  const minLag = Math.floor(fs / highHz), maxLag = Math.floor(fs / lowHz)
  let bestLag = 0, bestVal = -Infinity
  for (let lag = minLag; lag <= maxLag && lag < n; lag++) {
    let sum = 0; for (let i = 0; i < n - lag; i++) sum += signal[i] * signal[i + lag]
    if (sum > bestVal) { bestVal = sum; bestLag = lag }
  }
  return bestLag ? fs / bestLag : 0
}

// ── Patched respiratoryFreqHz — detrended envelope + FFT/autocorr consensus ──
function respiratoryFreqHz_NEW(cardiacSignal, fs) {
  const decim = 6
  if (cardiacSignal.length < decim * 30) return { rrHz: 0, snr: 0, reason: 'signal too short', source: 'none', fftBpm: 0, autoBpm: 0 }
  const envRaw = []
  for (let i = 0; i + decim <= cardiacSignal.length; i += decim) {
    let sum = 0
    for (let j = 0; j < decim; j++) sum += Math.abs(cardiacSignal[i + j])
    envRaw.push(sum / decim)
  }
  const envFs = fs / decim
  const env = detrend(envRaw)
  const rrHzFft  = dominantFreq(env, RR_LOW_HZ, RR_HIGH_HZ, envFs)
  const rrHzAuto = autocorrPeak(env, RR_LOW_HZ, RR_HIGH_HZ, envFs)
  const fftBpm  = rrHzFft  > 0 ? Math.round(rrHzFft  * 60) : 0
  const autoBpm = rrHzAuto > 0 ? Math.round(rrHzAuto * 60) : 0
  const disagreement = fftBpm && autoBpm ? Math.abs(fftBpm - autoBpm) : 999
  let rrHz = 0, source = 'none'
  if (rrHzFft > 0 && rrHzAuto > 0 && disagreement <= 2) {
    rrHz = rrHzFft; source = 'agree'
  } else if (rrHzAuto > 0 && rrHzFft > 0) {
    const { mags, n } = fftMagnitudes(env)
    const freqRes = envFs / n
    const autoBin = Math.round(rrHzAuto / freqRes)
    const fftBin  = Math.round(rrHzFft  / freqRes)
    const autoMag = autoBin > 0 && autoBin < mags.length ? mags[autoBin] : 0
    const fftMag  = fftBin  > 0 && fftBin  < mags.length ? mags[fftBin]  : 1
    if (autoMag >= fftMag * 0.4) { rrHz = rrHzAuto; source = 'autocorr' }
    else                         { rrHz = rrHzFft;  source = 'fft' }
  } else if (rrHzFft > 0)  { rrHz = rrHzFft;  source = 'fft-only' }
  else if (rrHzAuto > 0)   { rrHz = rrHzAuto; source = 'autocorr-only' }
  if (!rrHz) return { rrHz: 0, snr: 0, reason: 'no peak in RR band', source, fftBpm, autoBpm }
  if (rrHz >= RR_HIGH_HZ * 0.95) return { rrHz: 0, snr: 0, reason: 'ceiling guard', source, fftBpm, autoBpm }
  const snr = signalSNR(env, rrHz, envFs)
  return snr >= 1.5 ? { rrHz, snr, reason: 'ok', source, fftBpm, autoBpm } : { rrHz: 0, snr, reason: `snr too low (${snr.toFixed(2)})`, source, fftBpm, autoBpm }
}

// ── OLD path — what production currently does with the RR question ──
// The committed processStoredFrames calls this same expression. It's broken
// because the cardiac bandpass filter has already stripped 0.13–0.5 Hz out of
// the signal, so any peak the FFT finds in that band is spectral leakage.
function respiratoryFreqHz_OLD(cardiacSignal, fs) {
  const rrHz = dominantFreq(cardiacSignal, RR_LOW_HZ, RR_HIGH_HZ, fs)
  return { rrHz, rrBpm: Math.round(rrHz * 60) }
}

// ── Synthetic signal generator ──────────────────────────────────────────────
function synthCardiacSignal({ durationSec, fs, hrBpm, rrBpm, noiseAmp = 0.05, seed = 42, driftAmp = 0 }) {
  const n = Math.floor(durationSec * fs)
  const hrHz = hrBpm / 60
  const rrHz = rrBpm / 60
  let s = seed >>> 0
  const rand = () => { s = (1664525 * s + 1013904223) >>> 0; return (s / 4294967295) - 0.5 }
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / fs
    // Slow linear amplitude drift (mimics real face-scan brightness/AGC change over 30-60s).
    const drift    = 1 + driftAmp * (t / durationSec - 0.5) * 2
    const envelope = 1 + 0.4 * Math.sin(2 * Math.PI * rrHz * t)
    const cardiac  = drift * envelope * Math.sin(2 * Math.PI * hrHz * t)
    const noise    = noiseAmp * rand()
    out[i] = cardiac + noise
  }
  return out
}

// ── Test cases ──────────────────────────────────────────────────────────────
const cases = [
  { label: 'Adult at rest',        hrBpm: 65,  rrBpm: 15 },
  { label: 'Post-exercise',        hrBpm: 110, rrBpm: 22 },
  { label: 'Bradycardic + slow',   hrBpm: 48,  rrBpm: 10 },
  { label: 'Tachy + tachypneic',   hrBpm: 130, rrBpm: 28 },
  // Real-face-like: 14 bpm true RR + significant amplitude drift + higher noise.
  // Reproduces Patrick's 19-vs-14 overshoot on the deployed version.
  { label: 'Live-like (drift+noise)', hrBpm: 68, rrBpm: 14, driftAmp: 0.6, noiseAmp: 0.15 },
]

const fs = 30
const durationSec = 60

console.log(`\nRR patch synthetic test — ${durationSec}s @ ${fs} Hz, RR band [${RR_LOW_HZ}..${RR_HIGH_HZ}] Hz\n`)
console.log('  Scenario                     True RR   OLD (prod)   NEW (patched)   Verdict')
console.log('  ' + '─'.repeat(84))

let pass = 0, fail = 0
for (const c of cases) {
  const sig = synthCardiacSignal({ durationSec, fs, hrBpm: c.hrBpm, rrBpm: c.rrBpm })
  const oldRes = respiratoryFreqHz_OLD(sig, fs)
  const newRes = respiratoryFreqHz_NEW(sig, fs)
  const newBpm = newRes.rrHz ? Math.round(newRes.rrHz * 60) : 0
  const oldBpm = oldRes.rrBpm
  const err = newBpm > 0 ? Math.abs(newBpm - c.rrBpm) : Infinity
  const ok = err <= 3
  ok ? pass++ : fail++
  const label = c.label.padEnd(28)
  const trueRR = String(c.rrBpm).padStart(3)
  const oldStr = `${String(oldBpm).padStart(3)} bpm`.padEnd(12)
  const newStr = newBpm ? `${String(newBpm).padStart(3)} bpm`.padEnd(15) : 'rejected'.padEnd(15)
  const verdict = ok ? `PASS (err ${err} bpm)` : `FAIL (err ${err === Infinity ? '∞' : err} bpm)`
  console.log(`  ${label} ${trueRR}      ${oldStr} ${newStr} ${verdict}`)
  console.log(`      diag: source=${newRes.source} fftBpm=${newRes.fftBpm} autoBpm=${newRes.autoBpm} snr=${newRes.snr.toFixed(2)} reason="${newRes.reason}"`)
}

console.log('  ' + '─'.repeat(84))
console.log(`\n  Result: ${pass} pass, ${fail} fail\n`)

console.log('  Interpretation:')
console.log('  • OLD column: what the currently-deployed algorithm returns. Should pin near 30 bpm')
console.log('    regardless of true RR — that\'s the production bug you\'re seeing on tere.co.nz.')
console.log('  • NEW column: what the patched algorithm returns. Should be within ±3 bpm of true RR')
console.log('    across the physiological range.\n')

process.exit(fail === 0 ? 0 : 1)
