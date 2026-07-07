/**
 * Camera-based SpO2 estimation — multi-channel ratio-of-ratios (SHINE-inspired, 2025)
 *
 * Uses all 3 RGB channel pairs (R/G, R/B, G/B) weighted by signal quality (SNR).
 * Includes per-device calibration framework: once ≥5 paired oximeter readings are
 * stored, a linear correction is fitted and applied automatically.
 *
 * References:
 *   SHINE (2025)       — doi.org/10.1016/j.eswa.2025.028064
 *   Grimaldi (2015)    — G/B and R/G Beer-Lambert coefficients
 *   Verkruysse (2008)  — rPPG SpO2 via ratio-of-ratios
 *
 * INDICATIVE ESTIMATE ONLY — not a medical device.
 */

// ── Linear model coefficients per channel pair ────────────────────────────────
// SpO2 ≈ a − b × R, where R = (AC/DC)_ch1 / (AC/DC)_ch2
const CHANNEL_MODELS = {
  rg: { a: 104.0, b: 17.0 },  // Red / Green  (Grimaldi 2015)
  rb: { a: 107.0, b: 21.0 },  // Red / Blue   (SHINE dataset)
  gb: { a: 110.0, b: 25.0 },  // Green / Blue (Grimaldi 2015)
}

// Physiologically valid ratio ranges — outside this → reject
const RATIO_BOUNDS = {
  rg: [0.4, 3.4],
  rb: [0.3, 3.0],
  gb: [0.5, 2.0],
}

// Fitzpatrick skin tone bias per channel (types 1–6, index = type − 1)
// Darker skin absorbs more red; G/B is most stable across tones
const FITZ_BIAS = {
  rg: [ 0,  0, -0.5, -1.2, -2.0, -3.0],
  rb: [ 0,  0, -0.3, -0.8, -1.5, -2.5],
  gb: [ 0,  0, -0.2, -0.5, -1.0, -1.5],
}

// ── Signal processing ─────────────────────────────────────────────────────────

function bandpass(signal) {
  // Dual moving-average subtraction — approximates 0.5–4 Hz bandpass at ~30fps.
  // Better than single SMA: rejects both DC offset and slow drift simultaneously.
  const n    = signal.length
  const mean = signal.reduce((a, b) => a + b, 0) / n
  const det  = signal.map(x => x - mean)
  const wS   = Math.max(1, Math.round(n * 0.03))  // ~1s window
  const wL   = Math.max(1, Math.round(n * 0.12))  // ~4s window
  return det.map((_, i) => {
    const sliceS = det.slice(Math.max(0, i - wS), Math.min(n, i + wS + 1))
    const sliceL = det.slice(Math.max(0, i - wL), Math.min(n, i + wL + 1))
    const avgS   = sliceS.reduce((a, b) => a + b, 0) / sliceS.length
    const avgL   = sliceL.reduce((a, b) => a + b, 0) / sliceL.length
    return avgS - avgL
  })
}

function getACDC(raw, filtered) {
  const dc  = raw.reduce((a, b) => a + b, 0) / raw.length || 0.001
  const ac  = Math.sqrt(filtered.reduce((s, x) => s + x * x, 0) / filtered.length) || 0.001
  const snr = ac / dc  // pulsatility index — proxy for signal quality
  return { ac, dc, snr }
}

// ── Multi-channel RoR estimation ──────────────────────────────────────────────

function fitzCorrection(channel, fitzpatrick) {
  const idx = Math.min(5, Math.max(0, (fitzpatrick || 2) - 1))
  return FITZ_BIAS[channel][idx] || 0
}

function estimateFromChannels(r, g, b, fitzpatrick) {
  const RoR = {
    rg: (r.ac / r.dc) / (g.ac / g.dc),
    rb: (r.ac / r.dc) / (b.ac / b.dc),
    gb: (g.ac / g.dc) / (b.ac / b.dc),
  }
  // SNR weight = product of constituent channel SNRs (SHINE quality-weighted consolidation)
  const snrWeight = {
    rg: r.snr * g.snr,
    rb: r.snr * b.snr,
    gb: g.snr * b.snr,
  }

  const valid = []
  let totalWeight = 0

  for (const [key, model] of Object.entries(CHANNEL_MODELS)) {
    const ratio = RoR[key]
    const [lo, hi] = RATIO_BOUNDS[key]
    if (ratio < lo || ratio > hi) continue

    const spo2 = model.a - model.b * ratio + fitzCorrection(key, fitzpatrick)
    if (spo2 < 70 || spo2 > 100) continue

    const weight = snrWeight[key]
    valid.push({ spo2, weight, channel: key, ratio })
    totalWeight += weight
  }

  if (!valid.length || totalWeight === 0) return null

  const weighted = valid.reduce((sum, e) => sum + e.spo2 * e.weight, 0) / totalWeight
  const values   = valid.map(e => e.spo2)
  const spread   = valid.length > 1 ? Math.max(...values) - Math.min(...values) : 0

  const confidence = valid.length < 2 || spread > 8 ? 'low'
    : spread > 4 ? 'medium' : 'high'

  return { spo2: weighted, confidence, spread, nChannels: valid.length, channels: valid }
}

function estimateWindowSpO2(frames, fitzpatrick) {
  if (frames.length < 20) return null

  const rRaw = frames.map(f => f.r)
  const gRaw = frames.map(f => f.g)
  const bRaw = frames.map(f => f.b)

  // Reject very dark frames — camera signal unreliable below DC of 10
  const rDC = rRaw.reduce((a, b) => a + b, 0) / rRaw.length
  const gDC = gRaw.reduce((a, b) => a + b, 0) / gRaw.length
  const bDC = bRaw.reduce((a, b) => a + b, 0) / bRaw.length
  if (rDC < 10 || gDC < 10 || bDC < 10) return null

  const r = getACDC(rRaw, bandpass(rRaw))
  const g = getACDC(gRaw, bandpass(gRaw))
  const b = getACDC(bRaw, bandpass(bRaw))

  return estimateFromChannels(r, g, b, fitzpatrick)
}

// ── Per-device calibration (linear regression on paired oximeter readings) ────

export function getSpO2Calibration() {
  try {
    const raw = localStorage.getItem('tere_spo2_cal')
    return raw ? JSON.parse(raw) : { slope: 1.0, intercept: 0.0, n: 0 }
  } catch {
    return { slope: 1.0, intercept: 0.0, n: 0 }
  }
}

/**
 * Fit calibration from paired readings stored in Supabase validation_readings.
 * Call this from VitalsValidate after fetching readings with both tere_spo2 and manual_spo2.
 * pairedReadings: [{ estimated: number, reference: number }]
 */
export function fitSpO2Calibration(pairedReadings) {
  const valid = pairedReadings.filter(r => r.estimated > 0 && r.reference > 0)
  if (valid.length < 5) return null

  const xs = valid.map(r => r.estimated)
  const ys = valid.map(r => r.reference)
  const n  = valid.length
  const xm = xs.reduce((a, b) => a + b, 0) / n
  const ym = ys.reduce((a, b) => a + b, 0) / n
  const num = xs.reduce((s, x, i) => s + (x - xm) * (ys[i] - ym), 0)
  const den = xs.reduce((s, x) => s + (x - xm) ** 2, 0)
  if (den === 0) return null

  const slope     = num / den
  const intercept = ym - slope * xm
  const residuals = valid.map(r => r.reference - (slope * r.estimated + intercept))
  const rmse      = Math.sqrt(residuals.reduce((s, e) => s + e * e, 0) / n)
  const cal = { slope, intercept, n, rmse: Math.round(rmse * 10) / 10, updatedAt: Date.now() }
  try { localStorage.setItem('tere_spo2_cal', JSON.stringify(cal)) } catch {}

  // Propagate to Supabase so any patient device can pull the same calibration.
  // Fire-and-forget — local calibration is authoritative for this device.
  saveSpO2CalibrationToSupabase(cal).catch(e => console.warn('[spo2] Supabase save failed:', e?.message))

  return cal
}

async function saveSpO2CalibrationToSupabase(cal) {
  const { saveSpo2Calibration } = await import('./supabase')
  const ok = await saveSpo2Calibration({
    slope: cal.slope, intercept: cal.intercept, n: cal.n, rmse: cal.rmse ?? null,
  })
  if (!ok) throw new Error('spo2 calibration save failed')
}

/**
 * Sync SpO2 calibration with Supabase on VitalsCapture mount.
 *
 * Order of preference:
 *   1. If Supabase has a calibration row → pull it → localStorage.
 *   2. Else if local calibration exists (n≥5) → push it up.
 *   3. Else fit a calibration from paired validation_readings on-the-fly, push up, cache.
 *
 * Option 3 is the key: it means the shared calibration exists as soon as ≥5 paired
 * oximeter readings live in validation_readings, without depending on any particular
 * browser's localStorage or on a manual retrain step.
 *
 * Returns the calibration in effect after the sync, or null if <5 pairs exist yet.
 */
export async function loadSpO2CalibrationFromSupabase() {
  try {
    const { getLatestSpo2Calibration, saveSpo2Calibration } = await import('./supabase')

    // 1. Try the shared calibration table first
    const existing = await getLatestSpo2Calibration()

    if (existing) {
      const cal = {
        slope: Number(existing.slope), intercept: Number(existing.intercept),
        n: existing.n, rmse: existing.rmse, updatedAt: new Date(existing.created_at).getTime(),
      }
      try { localStorage.setItem('tere_spo2_cal', JSON.stringify(cal)) } catch {}
      return cal
    }

    // 2. No shared row yet — fall back to local
    const local = getSpO2Calibration()
    if (local && local.n >= 5) {
      const ok = await saveSpo2Calibration({
        slope: local.slope, intercept: local.intercept, n: local.n, rmse: local.rmse ?? null,
      })
      if (!ok) console.warn('[spo2] push local calibration failed')
      return local
    }

    // 3. No shared row and no usable local — try to fit from paired validation_readings.
    // Goes through /api/validation-readings so the anon SELECT policy on that table
    // stays deniable. This only runs on the /vitals-validate route where the caller
    // is a signed-in provider, so the JWT will be present.
    const { apiFetch } = await import('./api')
    const pairsRes = await apiFetch('/api/validation-readings?filter=paired-spo2')
    if (!pairsRes.ok) throw new Error(`paired-spo2 fetch failed HTTP ${pairsRes.status}`)
    const { pairs } = await pairsRes.json()
    if (!pairs || pairs.length < 5) return null

    const paired = pairs.map(r => ({ estimated: Number(r.tere_spo2), reference: Number(r.manual_spo2) }))
    const fitted = fitSpO2Calibration(paired) // also writes localStorage + fires Supabase insert
    return fitted
  } catch (e) {
    console.warn('[spo2] sync failed:', e?.message)
    return null
  }
}

function applyCal(spo2, cal) {
  if (!cal || cal.n < 5) return spo2
  return cal.slope * spo2 + cal.intercept
}

// ── Public API ────────────────────────────────────────────────────────────────

export function calculateSpO2(frames, fitzpatrick = 2) {
  if (!frames?.length || frames.length < 60) return null

  const cal = getSpO2Calibration()
  const n   = frames.length
  const w   = Math.floor(n / 3)

  const windows = [0, 1, 2]
    .map(i => estimateWindowSpO2(frames.slice(i * w, (i + 1) * w), fitzpatrick))
    .filter(Boolean)

  if (windows.length < 2) return null  // need at least 2 agreeing windows

  const raw       = windows.map(win => win.spo2)
  const calibrated = raw.map(s => applyCal(s, cal))
  const sorted     = [...calibrated].sort((a, b) => a - b)
  const median     = sorted.length === 3 ? sorted[1] : (sorted[0] + sorted[1]) / 2
  const spread     = sorted[sorted.length - 1] - sorted[0]

  if (spread > 5) return null  // windows disagree too much

  const bestConf = windows.every(w => w.confidence === 'high') ? 'high'
    : windows.some(w => w.confidence === 'high' || w.confidence === 'medium') ? 'medium' : 'low'

  return {
    estimate:      Math.min(100, Math.max(70, Math.round(median))),
    confidence:    bestConf,
    windows:       windows.length,
    maxWindowDiff: Math.round(spread * 10) / 10,
    nChannels:     Math.round(windows.reduce((s, w) => s + w.nChannels, 0) / windows.length),
    calibrated:    cal.n >= 5,
    calN:          cal.n,
  }
}

export function formatSpO2Display(result, hasBreathingConcerns = false) {
  if (!result) return null

  const { estimate, confidence, calibrated } = result
  const breathingNote = hasBreathingConcerns
    ? 'If you have difficulty breathing call 111 immediately.' : ''
  const calNote = calibrated ? 'Calibrated to your device.' : 'Uncalibrated — add oximeter readings to improve accuracy.'

  if (estimate < 90 || confidence === 'low') {
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
      note: `Low confidence — ${calNote} ${breathingNote}`.trim(),
      color: '#F59E0B',
    }
  }

  return {
    show: true,
    value: estimate,
    label: `~${estimate}%`,
    warning: false,
    text: `SpO2: ~${estimate}%`,
    note: `Estimated via camera. ${calNote} ${breathingNote}`.trim(),
    color: '#10B981',
  }
}
