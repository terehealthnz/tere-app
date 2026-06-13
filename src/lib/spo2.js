/**
 * Camera-based SpO2 estimation using Green/Blue channel ratio method.
 * INDICATIVE ESTIMATE ONLY — not a medical device.
 */

function bandpass(signal) {
  const n = signal.length
  const mean = signal.reduce((a, b) => a + b, 0) / n
  const detrended = signal.map(x => x - mean)
  const windowSize = Math.max(1, Math.round(n * 0.05))
  return detrended.map((v, i) => {
    const start = Math.max(0, i - windowSize)
    const end   = Math.min(n, i + windowSize + 1)
    const w = detrended.slice(start, end)
    return v - w.reduce((a, b) => a + b, 0) / w.length
  })
}

function getACDC(raw, filtered) {
  const dc = raw.reduce((a, b) => a + b, 0) / raw.length
  const ac = Math.sqrt(filtered.map(x => x * x).reduce((a, b) => a + b, 0) / filtered.length)
  return { ac: ac || 0.001, dc: dc || 0.001 }
}

function getSpO2Confidence(R_gb, R_rg) {
  const spo2_gb = 110 - 25 * R_gb
  const spo2_rg = 104 - 17 * R_rg
  const agreement = Math.abs(spo2_gb - spo2_rg)
  // Tightened R_gb range: 0.5–2.0 (was 0.3–2.5) — outside this is unreliable
  const R_gb_valid = R_gb >= 0.5 && R_gb <= 2.0
  const R_rg_valid = R_rg >= 0.4 && R_rg <= 3.4
  if (!R_gb_valid || !R_rg_valid) return 'invalid'
  if (agreement > 8) return 'low'
  if (agreement > 4) return 'medium'
  return 'high'
}

function estimateWindowSpO2(frames, fitzpatrick = 2) {
  if (frames.length < 20) return null
  const greenSignal = frames.map(f => f.g)
  const blueSignal  = frames.map(f => f.b)
  const redSignal   = frames.map(f => f.r)

  const fGreen = bandpass(greenSignal)
  const fBlue  = bandpass(blueSignal)
  const fRed   = bandpass(redSignal)

  const green = getACDC(greenSignal, fGreen)
  const blue  = getACDC(blueSignal, fBlue)
  const red   = getACDC(redSignal, fRed)

  if (green.dc === 0 || blue.dc === 0) return null

  const R_gb = (green.ac / green.dc) / (blue.ac / blue.dc)
  const R_rg = (red.ac / red.dc) / (green.ac / green.dc)

  const spo2_gb       = 110 - 25 * R_gb
  const spo2_rg       = 104 - 17 * R_rg
  const spo2_combined = spo2_gb * 0.70 + spo2_rg * 0.30

  const fitzCorrections = [0, 0, -0.5, -1.0, -1.5, -2.0]
  const correction = fitzCorrections[Math.min(5, Math.max(0, (fitzpatrick || 2) - 1))] || 0
  const corrected = spo2_combined + correction

  const confidence = getSpO2Confidence(R_gb, R_rg)
  if (confidence === 'invalid') return null

  return {
    estimate:   Math.min(100, Math.max(70, Math.round(corrected))),
    R_gb, R_rg, confidence,
  }
}

export function calculateSpO2(frames, fitzpatrick = 2) {
  if (!frames?.length || frames.length < 60) return null
  const n   = frames.length
  const w   = Math.floor(n / 3)
  const windows = [0, 1, 2].map(i => {
    const seg = frames.slice(i * w, (i + 1) * w)
    return estimateWindowSpO2(seg, fitzpatrick)
  }).filter(Boolean)

  // Need all 3 windows with valid estimates
  if (windows.length < 3) return null

  // All three windows must agree within ±3% of each other
  const estimates = windows.map(w => w.estimate)
  const maxDiff = Math.max(...estimates) - Math.min(...estimates)
  if (maxDiff > 3) return null

  const sorted    = [...windows].sort((a, b) => a.estimate - b.estimate)
  const median    = sorted[1]  // true median of 3
  const bestConf  = windows.every(w => w.confidence === 'high') ? 'high'
    : windows.some(w => w.confidence === 'medium' || w.confidence === 'high') ? 'medium' : 'low'

  return {
    estimate:   median.estimate,
    confidence: bestConf,
    windows:    windows.length,
    maxWindowDiff: maxDiff,
  }
}

export function formatSpO2Display(result, hasBrathingConcerns = false) {
  if (!result) return null

  const { estimate, confidence } = result
  const breathingNote = hasBrathingConcerns
    ? 'If you have difficulty breathing call 111 immediately.' : ''

  if (estimate < 90 || confidence === 'invalid') {
    return {
      show: false,
      text: 'SpO2: Unable to estimate reliably',
      note: `Please use a pulse oximeter to confirm. ${breathingNote}`.trim(),
      color: '#EF4444',
    }
  }

  if (estimate < 95) {
    return {
      show: true,
      value: estimate,
      label: `~${estimate}%`,
      warning: true,
      text: `SpO2: ~${estimate}% — Below normal range`,
      note: `Please use a pulse oximeter to confirm. ${breathingNote}`.trim(),
      color: '#F59E0B',
    }
  }

  if (confidence === 'medium') {
    return {
      show: true,
      value: estimate,
      label: `~${estimate}%`,
      warning: true,
      text: `SpO2: ~${estimate}%`,
      note: `Low confidence — consider using a pulse oximeter. ${breathingNote}`.trim(),
      color: '#F59E0B',
    }
  }

  return {
    show: true,
    value: estimate,
    label: `~${estimate}%`,
    warning: false,
    text: `SpO2: ~${estimate}%`,
    note: `Estimated via camera. ${breathingNote}`.trim(),
    color: '#10B981',
  }
}
