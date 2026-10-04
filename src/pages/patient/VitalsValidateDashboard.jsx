import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getValidationReadings, getValidationSubjects, getModelVersions, getTrainableReadings, updateValidationSpo2, updateValidationHrRr, updateValidationMeRppg, deleteValidationReading, supabase } from '../../lib/supabase'
import { processStoredFrames, processStoredFramesMultiPass } from '../../lib/rppg'
import { trainModel, getLocalMeta, BP_SHOW_THRESHOLD, predictBP, isBPReliable, resetLocalModel } from '../../lib/bpModel'
import { trainRidgeBp, predictRidgeBp, framesToV2Features, saveV2Model, loadV2Model, sweepLambda, promoteV2Model } from '../../lib/bpModelV2'
import { trainV3, predictV3, framesToV3Features, saveV3Model, loadV3Model, promoteV3Model, sweepTrees } from '../../lib/bpModelV3'
import { fitSpO2Calibration } from '../../lib/spo2'
const TEAL = '#0B6E76'
const NAVY = '#0D2B45'
const BG   = '#F7F5F0'

const FITZ_COLORS = ['#FDDBB4','#EAA882','#D08B5B','#AE5D29','#694D3D','#2C1503']

const MILESTONES = [
  { min: 0,    max: 30,       emoji: '🔴', label: 'Baseline' },
  { min: 31,   max: 100,      emoji: '🟡', label: 'Early data' },
  { min: 101,  max: 300,      emoji: '🟠', label: 'Building' },
  { min: 301,  max: 500,      emoji: '🟢', label: 'Strong dataset' },
  { min: 501,  max: 999,      emoji: '⭐',  label: 'Model-ready' },
  { min: 1000, max: Infinity, emoji: '⭐⭐', label: 'Excellent' },
]

function getMilestone(n) {
  return MILESTONES.find(m => n >= m.min && n <= m.max) || MILESTONES[0]
}

function computeHRMAE(readings) {
  const valid = readings.filter(r => r.manual_hr && r.tere_hr)
  if (!valid.length) return null
  return (valid.reduce((s, r) => s + Math.abs(r.manual_hr - r.tere_hr), 0) / valid.length).toFixed(1)
}

function computeBPStats(bpPreds) {
  if (!bpPreds.length) return null
  const sysErrs = bpPreds.map(p => Math.abs(p.predSys - p.actualSys))
  const diaErrs = bpPreds.map(p => Math.abs(p.predDia - p.actualDia))
  const sysMae  = (sysErrs.reduce((a, b) => a + b, 0) / sysErrs.length).toFixed(1)
  const diaMae  = (diaErrs.reduce((a, b) => a + b, 0) / diaErrs.length).toFixed(1)
  const n       = bpPreds.length
  const within10Sys = bpPreds.filter(p => Math.abs(p.predSys - p.actualSys) <= 10).length
  const within15Sys = bpPreds.filter(p => Math.abs(p.predSys - p.actualSys) <= 15).length
  const within10Dia = bpPreds.filter(p => Math.abs(p.predDia - p.actualDia) <= 10).length
  const within15Dia = bpPreds.filter(p => Math.abs(p.predDia - p.actualDia) <= 15).length
  // Mean-collapse signal. If pred SD is small (<5) while cuff SD is wide
  // (>12), the model is emitting the training mean regardless of input.
  // Shown on the dashboard so we don't have to eyeball 150+ rows.
  const sd = (arr) => {
    const m = arr.reduce((a, b) => a + b, 0) / arr.length
    return Math.sqrt(arr.map(x => (x - m) ** 2).reduce((a, b) => a + b, 0) / arr.length)
  }
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length
  const predSys = bpPreds.map(p => p.predSys)
  const cuffSys = bpPreds.map(p => p.actualSys)
  const predDia = bpPreds.map(p => p.predDia)
  const cuffDia = bpPreds.map(p => p.actualDia)
  const predSysSd = +sd(predSys).toFixed(1)
  const cuffSysSd = +sd(cuffSys).toFixed(1)
  const predDiaSd = +sd(predDia).toFixed(1)
  const cuffDiaSd = +sd(cuffDia).toFixed(1)
  const predSysMean = +mean(predSys).toFixed(1)
  const cuffSysMean = +mean(cuffSys).toFixed(1)
  const predDiaMean = +mean(predDia).toFixed(1)
  const cuffDiaMean = +mean(cuffDia).toFixed(1)
  const collapsed = predSysSd < 5 && cuffSysSd > 12
  return {
    sysMae, diaMae, n,
    within10Pct: Math.round(((within10Sys + within10Dia) / (n * 2)) * 100),
    within15Pct: Math.round(((within15Sys + within15Dia) / (n * 2)) * 100),
    within10SysPct: Math.round((within10Sys / n) * 100),
    within10DiaPct: Math.round((within10Dia / n) * 100),
    predSysSd, cuffSysSd, predDiaSd, cuffDiaSd,
    predSysMean, cuffSysMean, predDiaMean, cuffDiaMean,
    collapsed,
  }
}

function exportCSV(readings, subjects) {
  const subMap = Object.fromEntries(subjects.map(s => [s.id, s]))
  const rows = [
    ['Date','Subject','Age','Sex','Fitzpatrick','Systolic','Diastolic','Manual HR','Tere HR','HR Diff','ME-rPPG HR','ME-rPPG Diff','ME-rPPG Conf','Tere RR','Confidence %','Notes','Conditions'],
    ...readings.map(r => {
      const sub = r.subject_id ? subMap[r.subject_id] : null
      const meDiff = (r.manual_hr && r.me_rppg_hr) ? Math.abs(r.manual_hr - r.me_rppg_hr) : null
      return [
        new Date(r.recorded_at).toISOString(),
        r.subject_code || '',
        sub?.age || '', sub?.sex || '', sub?.fitzpatrick_scale || '',
        r.manual_systolic || '', r.manual_diastolic || '', r.manual_hr || '',
        r.tere_hr || '', r.hr_difference != null ? r.hr_difference : '',
        r.me_rppg_hr || '', meDiff != null ? meDiff : '', r.me_rppg_confidence || '',
        r.tere_rr || '', r.raw_rppg_signal?.numericConfidence || '',
        (r.notes || '').replace(/,/g, ';').replace(/\n/g, ' '),
        (r.session_conditions || '').replace(/,/g, ';').replace(/\n/g, ' '),
      ]
    })
  ]
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `tere-vitals-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function HRChart({ readings }) {
  const valid = readings.filter(r => r.manual_hr && r.tere_hr)
  if (!valid.length) {
    return <div style={{ color: '#6B7280', fontSize: '.9rem', textAlign: 'center', padding: '3rem 0' }}>No HR comparison data yet.</div>
  }
  const W = 380, H = 270, ml = 44, mr = 20, mt = 16, mb = 38
  const chartW = W - ml - mr, chartH = H - mt - mb
  const MIN = 40, MAX = 200
  const scl = (v) => Math.max(0, Math.min(1, (v - MIN) / (MAX - MIN)))
  const px = (v) => ml + scl(v) * chartW
  const py = (v) => mt + chartH - scl(v) * chartH
  const ticks = [50, 75, 100, 125, 150, 175]

  return (
    <div>
      <div style={{ fontSize: '.85rem', fontWeight: 600, color: NAVY, marginBottom: '.75rem' }}>Tere HR vs Manual HR</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: W, display: 'block' }}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={px(v)} y1={mt} x2={px(v)} y2={mt + chartH} stroke="#F3F4F6" strokeWidth={1} />
            <line x1={ml} y1={py(v)} x2={ml + chartW} y2={py(v)} stroke="#F3F4F6" strokeWidth={1} />
            <text x={px(v)} y={mt + chartH + 14} textAnchor="middle" fontSize={9} fill="#9CA3AF">{v}</text>
            <text x={ml - 5} y={py(v) + 3} textAnchor="end" fontSize={9} fill="#9CA3AF">{v}</text>
          </g>
        ))}
        <line x1={px(MIN)} y1={py(MIN)} x2={px(MAX)} y2={py(MAX)} stroke="#D1FAE5" strokeWidth={1.5} strokeDasharray="5 3" />
        {valid.map((r, i) => (
          <circle key={i} cx={px(r.manual_hr)} cy={py(r.tere_hr)} r={4} fill={TEAL} fillOpacity={.75} stroke="white" strokeWidth={1} />
        ))}
        <text x={ml + chartW / 2} y={H - 2} textAnchor="middle" fontSize={10} fill="#6B7280">Manual HR (bpm)</text>
        <text x={9} y={mt + chartH / 2} textAnchor="middle" fontSize={10} fill="#6B7280" transform={`rotate(-90,9,${mt + chartH / 2})`}>Tere HR (bpm)</text>
        <line x1={ml} y1={mt} x2={ml} y2={mt + chartH} stroke="#E5E7EB" strokeWidth={1} />
        <line x1={ml} y1={mt + chartH} x2={ml + chartW} y2={mt + chartH} stroke="#E5E7EB" strokeWidth={1} />
      </svg>
      <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: '.5rem' }}>{valid.length} readings · dashed = perfect agreement</div>
    </div>
  )
}

function BPScatterChart({ bpPreds }) {
  if (!bpPreds.length) return null
  const W = 380, H = 260, ml = 44, mr = 20, mt = 16, mb = 38
  const chartW = W - ml - mr, chartH = H - mt - mb
  const MIN = 50, MAX = 210
  const scl = v => Math.max(0, Math.min(1, (v - MIN) / (MAX - MIN)))
  const px  = v => ml + scl(v) * chartW
  const py  = v => mt + chartH - scl(v) * chartH
  const ticks = [60, 80, 100, 120, 140, 160, 180, 200]
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: W, display: 'block' }}>
      {ticks.map(v => (
        <g key={v}>
          <line x1={px(v)} y1={mt} x2={px(v)} y2={mt + chartH} stroke="#F3F4F6" strokeWidth={1} />
          <line x1={ml} y1={py(v)} x2={ml + chartW} y2={py(v)} stroke="#F3F4F6" strokeWidth={1} />
          <text x={px(v)} y={mt + chartH + 14} textAnchor="middle" fontSize={9} fill="#9CA3AF">{v}</text>
          <text x={ml - 5} y={py(v) + 3} textAnchor="end" fontSize={9} fill="#9CA3AF">{v}</text>
        </g>
      ))}
      <line x1={px(MIN)} y1={py(MIN)} x2={px(MAX)} y2={py(MAX)} stroke="#D1FAE5" strokeWidth={1.5} strokeDasharray="5 3" />
      {bpPreds.map((p, i) => (
        <g key={i}>
          <circle cx={px(p.actualSys)} cy={py(p.predSys)} r={4} fill={TEAL} fillOpacity={.7} stroke="white" strokeWidth={1} />
          <circle cx={px(p.actualDia)} cy={py(p.predDia)} r={4} fill="#F59E0B" fillOpacity={.7} stroke="white" strokeWidth={1} />
        </g>
      ))}
      <text x={ml + chartW / 2} y={H - 2} textAnchor="middle" fontSize={10} fill="#6B7280">Actual BP (mmHg)</text>
      <text x={9} y={mt + chartH / 2} textAnchor="middle" fontSize={10} fill="#6B7280" transform={`rotate(-90,9,${mt + chartH / 2})`}>Predicted (mmHg)</text>
      <line x1={ml} y1={mt} x2={ml} y2={mt + chartH} stroke="#E5E7EB" strokeWidth={1} />
      <line x1={ml} y1={mt + chartH} x2={ml + chartW} y2={mt + chartH} stroke="#E5E7EB" strokeWidth={1} />
      <circle cx={W - 80} cy={mt + 10} r={4} fill={TEAL} /><text x={W - 73} y={mt + 14} fontSize={9} fill="#6B7280">Systolic</text>
      <circle cx={W - 40} cy={mt + 10} r={4} fill="#F59E0B" /><text x={W - 33} y={mt + 14} fontSize={9} fill="#6B7280">Dia</text>
    </svg>
  )
}

function BPAnalysisPanel({ readings, subjects }) {
  const [running, setRunning]   = useState(false)
  const [bpPreds, setBpPreds]   = useState([])
  const [latestPred, setLatestPred] = useState(null)
  const [progress, setProgress] = useState('')

  // v2 ridge model — runs completely in parallel to the v15 MLP. Separate
  // state, separate storage (localStorage only, no Supabase). Purpose: A/B
  // against v15 on the same 155+ stored signals to see if a 9-param ridge
  // on waveform morphology beats the mean-collapsed v15 MLP. If it does,
  // we promote it; until then, nothing in the live /vitals flow changes.
  const [v2Model, setV2Model]       = useState(() => loadV2Model())
  const [v2Preds, setV2Preds]       = useState([])
  const [v2Running, setV2Running]   = useState(false)
  const [v2Progress, setV2Progress] = useState('')
  const [v2Error, setV2Error]       = useState('')
  const [v2Lambda, setV2Lambda]     = useState(1.0)
  const [v2Sweep, setV2Sweep]       = useState(null)      // [{lambda, trainMae, valMae, best?}]
  const [v2Promoting, setV2Promoting] = useState(false)
  const [v2ActiveServer, setV2ActiveServer] = useState(null)  // row returned from /api/bp-v2-model
  // Default display is v3 since the 2026-10-02 promote — v15 is a mean
  // emitter, v2 is marginal. Flag only exists to force v15 or v2 for
  // A/B testing on a specific device.
  const [v2Display, setV2Display]   = useState(() => {
    if (typeof window === 'undefined') return 'v3'
    const v = localStorage.getItem('tere_bp_display_version')
    return v === 'v15' || v === 'v2' ? v : 'v3'
  })

  // v3 state — gradient-boost model on POS + multi-window features. Trained
  // and promoted independently of v2 (separate table, separate flag value).
  const [v3Model, setV3Model]       = useState(() => loadV3Model())
  const [v3Preds, setV3Preds]       = useState([])
  const [v3Running, setV3Running]   = useState(false)
  const [v3Progress, setV3Progress] = useState('')
  const [v3Error, setV3Error]       = useState('')
  const [v3Promoting, setV3Promoting] = useState(false)
  const [v3ActiveServer, setV3ActiveServer] = useState(null)
  const [v3Trees, setV3Trees]       = useState(50)
  const [v3Depth, setV3Depth]       = useState(3)
  const [v3Lr, setV3Lr]             = useState(0.1)
  // Tail-boost: multiplier on how much hypertensive samples pull the GBM
  // leaves away from mean regression. 0 = legacy uniform weighting; 2 is
  // the current default. Higher values follow tails harder but can over-
  // shoot normals.
  const [v3TailBoost, setV3TailBoost] = useState(2)
  const [v3Sweep, setV3Sweep]       = useState(null)  // [{nTrees, trainMae, valMae, best?}]

  // Keep the display-version localStorage flag in sync with the toggle.
  // Live /vitals reads this on every scan to decide which model's number to
  // show the patient — v15 remains the default.
  function toggleDisplay(ver) {
    setV2Display(ver)
    if (typeof window !== 'undefined') localStorage.setItem('tere_bp_display_version', ver)
  }

  // Load whatever model is currently promoted on the server so the dashboard
  // shows "server has X, local has Y" context before you promote. Hits the
  // endpoint directly (not loadActiveV2ModelFromServer, which strips the row
  // metadata we need for the status line) so we see trained_at + val MAE.
  useEffect(() => {
    fetch('/api/bp-v2-model', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(row => setV2ActiveServer(row))
      .catch(() => {})
    fetch('/api/bp-v3-model', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(row => setV3ActiveServer(row))
      .catch(() => {})
  }, [])

  const ready = isBPReliable()

  async function runAnalysis() {
    setRunning(true); setProgress('Starting…')
    const results = []
    const subMap  = Object.fromEntries(subjects.map(s => [s.id, s]))

    const withBoth = readings.filter(r =>
      r.raw_rppg_signal?.frames?.length && r.manual_systolic && r.manual_diastolic
    )

    for (let i = 0; i < withBoth.length; i++) {
      const r   = withBoth[i]
      const sub = r.subject_id ? subMap[r.subject_id] : {}
      setProgress(`Predicting ${i + 1}/${withBoth.length}…`)
      try {
        const pred = await predictBP(r.raw_rppg_signal, sub || {})
        if (pred) {
          results.push({
            id: r.id, date: r.recorded_at, subject: r.subject_code,
            actualSys: r.manual_systolic, actualDia: r.manual_diastolic,
            predSys: pred.systolic, predDia: pred.diastolic,
            confidence: pred.confidence,
          })
        }
      } catch {}
    }

    setBpPreds(results)
    if (results.length) setLatestPred(results[0])
    setProgress('')
    setRunning(false)
  }

  // Train the ridge-v2 model on every stored (frames + cuff) pair, then
  // predict over the same set so we can A/B against v15 side-by-side.
  // Deterministic 80/20 split happens inside trainRidgeBp.
  async function trainAndRunV2() {
    setV2Running(true); setV2Error(''); setV2Progress('Collecting signals…')
    const subMap = Object.fromEntries(subjects.map(s => [s.id, s]))
    const withBoth = readings.filter(r =>
      r.raw_rppg_signal?.frames?.length && r.manual_systolic && r.manual_diastolic
    )

    const features = []
    const labels   = []
    const indexedForPred = []  // keep rows that produced features for later pred

    for (let i = 0; i < withBoth.length; i++) {
      const r   = withBoth[i]
      const sub = r.subject_id ? subMap[r.subject_id] : {}
      const fps = r.raw_rppg_signal?.fps || 30
      setV2Progress(`Extracting features ${i + 1}/${withBoth.length}…`)
      // yield to the event loop every 10 rows so the UI stays responsive
      if (i % 10 === 0) await new Promise(res => setTimeout(res, 0))
      try {
        const feats = framesToV2Features(r.raw_rppg_signal.frames, fps, sub)
        if (feats) {
          features.push(feats)
          labels.push([r.manual_systolic, r.manual_diastolic])
          indexedForPred.push({ r, sub, fps, feats })
        }
      } catch {}
    }

    if (features.length < 20) {
      setV2Error(`Only ${features.length} usable signals — need ≥20 to train.`)
      setV2Running(false); setV2Progress('')
      return
    }

    setV2Progress(`Training ridge on ${features.length} samples…`)
    await new Promise(res => setTimeout(res, 0))

    let model
    try {
      model = trainRidgeBp(features, labels, { lambda: v2Lambda, valFrac: 0.2 })
    } catch (e) {
      setV2Error(`Train failed: ${e.message || e}`)
      setV2Running(false); setV2Progress('')
      return
    }
    saveV2Model(model)
    setV2Model(model)

    setV2Progress('Predicting…')
    await new Promise(res => setTimeout(res, 0))
    const preds = indexedForPred.map(({ r, feats }) => {
      const p = predictRidgeBp(model, feats)
      return {
        id: r.id, date: r.recorded_at, subject: r.subject_code,
        actualSys: r.manual_systolic, actualDia: r.manual_diastolic,
        predSys: p.systolic, predDia: p.diastolic,
      }
    })
    setV2Preds(preds)
    setV2Progress('')
    setV2Running(false)
  }

  // λ sweep — train at [0.01, 0.1, 1, 10, 100] on the current feature set,
  // show val MAE for each, auto-pick the knee. Shares the seeded split with
  // trainRidgeBp so differences across rows reflect ridge strength not noise.
  async function runLambdaSweep() {
    setV2Running(true); setV2Error(''); setV2Progress('Collecting features…')
    const subMap = Object.fromEntries(subjects.map(s => [s.id, s]))
    const withBoth = readings.filter(r =>
      r.raw_rppg_signal?.frames?.length && r.manual_systolic && r.manual_diastolic
    )
    const features = []
    const labels = []
    for (let i = 0; i < withBoth.length; i++) {
      const r = withBoth[i]
      const sub = r.subject_id ? subMap[r.subject_id] : {}
      const fps = r.raw_rppg_signal?.fps || 30
      if (i % 10 === 0) await new Promise(res => setTimeout(res, 0))
      try {
        const feats = framesToV2Features(r.raw_rppg_signal.frames, fps, sub)
        if (feats) { features.push(feats); labels.push([r.manual_systolic, r.manual_diastolic]) }
      } catch {}
    }
    if (features.length < 20) {
      setV2Error(`Only ${features.length} usable signals — need ≥20 for sweep.`)
      setV2Running(false); setV2Progress('')
      return
    }
    setV2Progress('Sweeping λ…')
    await new Promise(res => setTimeout(res, 0))
    const results = sweepLambda(features, labels, [0.01, 0.1, 1, 10, 100])
    setV2Sweep(results)
    const best = results.find(r => r.best)
    if (best) setV2Lambda(best.lambda)
    setV2Progress('')
    setV2Running(false)
  }

  // Train + run v3 (gradient boost on POS multi-window features). Separate
  // state so you can A/B v2 vs v3 side-by-side on the same 155 scans.
  async function trainAndRunV3() {
    setV3Running(true); setV3Error(''); setV3Progress('Extracting features (POS + multi-window)…')
    const subMap = Object.fromEntries(subjects.map(s => [s.id, s]))
    const withBoth = readings.filter(r =>
      r.raw_rppg_signal?.frames?.length && r.manual_systolic && r.manual_diastolic
    )
    const features = []
    const labels = []
    const indexed = []
    for (let i = 0; i < withBoth.length; i++) {
      const r = withBoth[i]
      const sub = r.subject_id ? subMap[r.subject_id] : {}
      const fps = r.raw_rppg_signal?.fps || 30
      setV3Progress(`Features ${i + 1}/${withBoth.length}…`)
      if (i % 5 === 0) await new Promise(res => setTimeout(res, 0))
      try {
        const feats = framesToV3Features(r.raw_rppg_signal.frames, fps, sub)
        if (feats) {
          features.push(feats)
          labels.push([r.manual_systolic, r.manual_diastolic])
          indexed.push({ r, feats })
        }
      } catch {}
    }
    if (features.length < 20) {
      setV3Error(`Only ${features.length} usable signals — need ≥20 to train.`)
      setV3Running(false); setV3Progress('')
      return
    }
    setV3Progress(`Training ${v3Trees} trees depth=${v3Depth} lr=${v3Lr} tailBoost=${v3TailBoost} on ${features.length}…`)
    await new Promise(res => setTimeout(res, 0))
    let model
    try {
      model = trainV3(features, labels, { nTrees: v3Trees, depth: v3Depth, lr: v3Lr, valFrac: 0.2, tailBoost: v3TailBoost })
    } catch (e) {
      setV3Error(`Train failed: ${e.message || e}`)
      setV3Running(false); setV3Progress('')
      return
    }
    saveV3Model(model)
    setV3Model(model)

    setV3Progress('Predicting…')
    await new Promise(res => setTimeout(res, 0))
    const preds = indexed.map(({ r, feats }) => {
      const p = predictV3(model, feats)
      return {
        id: r.id, date: r.recorded_at, subject: r.subject_code,
        actualSys: r.manual_systolic, actualDia: r.manual_diastolic,
        predSys: p.systolic, predDia: p.diastolic,
      }
    })
    setV3Preds(preds)
    setV3Progress('')
    setV3Running(false)
  }

  // Tree-count sweep for v3 — mirror of the λ sweep for v2. Trains at
  // [10, 20, 30, 50, 100] on the same seeded split so val MAE differences
  // reflect model capacity, not resampling noise.
  async function runTreeSweep() {
    setV3Running(true); setV3Error(''); setV3Progress('Extracting features…')
    const subMap = Object.fromEntries(subjects.map(s => [s.id, s]))
    const withBoth = readings.filter(r =>
      r.raw_rppg_signal?.frames?.length && r.manual_systolic && r.manual_diastolic
    )
    const features = []
    const labels = []
    for (let i = 0; i < withBoth.length; i++) {
      const r = withBoth[i]
      const sub = r.subject_id ? subMap[r.subject_id] : {}
      const fps = r.raw_rppg_signal?.fps || 30
      if (i % 5 === 0) await new Promise(res => setTimeout(res, 0))
      try {
        const feats = framesToV3Features(r.raw_rppg_signal.frames, fps, sub)
        if (feats) { features.push(feats); labels.push([r.manual_systolic, r.manual_diastolic]) }
      } catch {}
    }
    if (features.length < 20) {
      setV3Error(`Only ${features.length} usable signals — need ≥20 for sweep.`)
      setV3Running(false); setV3Progress('')
      return
    }
    setV3Progress('Sweeping tree counts (10/20/30/50/100)…')
    await new Promise(res => setTimeout(res, 0))
    const results = sweepTrees(features, labels, [10, 20, 30, 50, 100], { depth: v3Depth, lr: v3Lr, tailBoost: v3TailBoost })
    setV3Sweep(results)
    const best = results.find(r => r.best)
    if (best) setV3Trees(best.nTrees)
    setV3Progress('')
    setV3Running(false)
  }

  async function handlePromoteV3() {
    if (!v3Model) return
    setV3Promoting(true); setV3Error('')
    try {
      await promoteV3Model(v3Model, `Promoted from VV dashboard · n=${v3Model.meta?.n} · val MAE sys ${v3Model.meta?.valMae?.sys} dia ${v3Model.meta?.valMae?.dia}`)
      const resp = await fetch('/api/bp-v3-model', { credentials: 'include' })
      if (resp.ok) setV3ActiveServer(await resp.json())
    } catch (e) {
      setV3Error(`Promote failed: ${e.message || e}`)
    } finally {
      setV3Promoting(false)
    }
  }

  // One-shot: train v3 at knee defaults (20 trees, tailBoost=2 — same recipe
  // as nightly cron), compare to server-active val MAE, auto-promote if
  // better. For when Patrick wants latest data in prod without clicking
  // through tree sweep → train → promote. Mirrors the gated behaviour of
  // api/_cron-retrain-bp-v3.js but trainable + promotable from the UI.
  async function oneShotRetrainV3() {
    setV3Running(true); setV3Error(''); setV3Progress('Retrain v3: extracting features…')
    try {
      const subMap = Object.fromEntries(subjects.map(s => [s.id, s]))
      const withBoth = readings.filter(r =>
        r.raw_rppg_signal?.frames?.length && r.manual_systolic && r.manual_diastolic
      )
      const features = []
      const labels = []
      const indexed = []
      for (let i = 0; i < withBoth.length; i++) {
        const r = withBoth[i]
        const sub = r.subject_id ? subMap[r.subject_id] : {}
        const fps = r.raw_rppg_signal?.fps || 30
        if (i % 5 === 0) await new Promise(res => setTimeout(res, 0))
        try {
          const feats = framesToV3Features(r.raw_rppg_signal.frames, fps, sub)
          if (feats) { features.push(feats); labels.push([r.manual_systolic, r.manual_diastolic]); indexed.push({ r, feats }) }
        } catch {}
      }
      if (features.length < 20) {
        setV3Error(`Only ${features.length} usable signals — need ≥20 to retrain.`)
        return
      }
      setV3Progress(`Retrain v3: training 20 trees tailBoost=2 on ${features.length}…`)
      await new Promise(res => setTimeout(res, 0))
      const model = trainV3(features, labels, { nTrees: 20, depth: 3, lr: 0.1, valFrac: 0.2, tailBoost: 2 })
      saveV3Model(model)
      setV3Model(model)
      // Populate the preds table so the scatter + readings column reflect
      // the new model regardless of promote outcome.
      setV3Preds(indexed.map(({ r, feats }) => {
        const p = predictV3(model, feats)
        return { id: r.id, date: r.recorded_at, subject: r.subject_code, actualSys: r.manual_systolic, actualDia: r.manual_diastolic, predSys: p.systolic, predDia: p.diastolic }
      }))
      // Promote gate: new val sys MAE must be ≤ server active sys MAE, dia
      // within +0.5 tolerance. Same thresholds as the nightly cron so manual
      // and automated runs can't disagree about what's safe to promote.
      const newSys = model.meta?.valMae?.sys
      const newDia = model.meta?.valMae?.dia
      const activeSys = v3ActiveServer?.meta?.valMae?.sys
      const activeDia = v3ActiveServer?.meta?.valMae?.dia
      if (activeSys != null && (newSys > activeSys || newDia > activeDia + 0.5)) {
        setV3Progress(`Trained val ${newSys}/${newDia} vs active ${activeSys}/${activeDia} — not promoting (regression).`)
        return
      }
      setV3Progress(`Trained val ${newSys}/${newDia} — promoting…`)
      await promoteV3Model(model, `Retrain-v3 button · n=${model.meta?.n} · val sys ${newSys} dia ${newDia} · tailBoost=2`)
      const resp = await fetch('/api/bp-v3-model', { credentials: 'include' })
      if (resp.ok) setV3ActiveServer(await resp.json())
      setV3Progress(`✓ Promoted · val sys ±${newSys} dia ±${newDia}`)
    } catch (e) {
      setV3Error(`Retrain v3 failed: ${e.message || e}`)
    } finally {
      setV3Running(false)
      // Leave the status line showing for a few seconds so Patrick can read
      // the promote/regression outcome, then clear.
      setTimeout(() => setV3Progress(''), 6000)
    }
  }

  async function handlePromoteV2() {
    if (!v2Model) return
    setV2Promoting(true); setV2Error('')
    try {
      await promoteV2Model(v2Model, `Promoted from VV dashboard · n=${v2Model.meta?.n} · val MAE sys ${v2Model.meta?.valMae?.sys} dia ${v2Model.meta?.valMae?.dia}`)
      // Re-fetch server-active to update the status line.
      const resp = await fetch('/api/bp-v2-model', { credentials: 'include' })
      if (resp.ok) setV2ActiveServer(await resp.json())
    } catch (e) {
      setV2Error(`Promote failed: ${e.message || e}`)
    } finally {
      setV2Promoting(false)
    }
  }

  const stats   = computeBPStats(bpPreds)
  const v2Stats = computeBPStats(v2Preds)

  // "Mean baseline" — what MAE would we get if we just predicted the cuff
  // mean for every reading? Any v2/v3 model only earns a promote if it beats
  // this. Compute directly from the readings table (not from v15 preds) so
  // the baseline is available even if nobody clicked "Run v15" — otherwise
  // the Promote button stays hidden on v2 and v3 banners until someone runs
  // the v15 model, which has nothing to do with the gate.
  const meanBaseline = (() => {
    const withCuff = readings.filter(r => r.manual_systolic && r.manual_diastolic)
    if (!withCuff.length) return null
    const cuffSysMean = withCuff.reduce((s, r) => s + r.manual_systolic, 0) / withCuff.length
    const cuffDiaMean = withCuff.reduce((s, r) => s + r.manual_diastolic, 0) / withCuff.length
    const sysErrs = withCuff.map(r => Math.abs(r.manual_systolic - cuffSysMean))
    const diaErrs = withCuff.map(r => Math.abs(r.manual_diastolic - cuffDiaMean))
    return {
      sysMae: +(sysErrs.reduce((a, b) => a + b, 0) / sysErrs.length).toFixed(1),
      diaMae: +(diaErrs.reduce((a, b) => a + b, 0) / diaErrs.length).toFixed(1),
    }
  })()
  // v2 "beats mean?" check — compare val MAE (held-out numbers) against the
  // mean-emitter baseline. Both must be lower before promotion is sensible.
  const v2BeatsMean = meanBaseline && v2Model?.meta?.valMae
    ? (v2Model.meta.valMae.sys <= meanBaseline.sysMae && v2Model.meta.valMae.dia <= meanBaseline.diaMae)
    : null

  return (
    <div>
      {/* Latest prediction hero display */}
      {latestPred && (
        <div style={{ background: '#F0F9FA', border: '1px solid #D4EEF0', borderRadius: 16, padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ fontWeight: 700, color: NAVY, marginBottom: '.75rem', fontSize: '.85rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Latest — {latestPred.subject || 'Unknown'} · {new Date(latestPred.date).toLocaleDateString()}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {[
              { label: 'Actual', sys: latestPred.actualSys, dia: latestPred.actualDia, color: NAVY },
              { label: 'Predicted', sys: latestPred.predSys, dia: latestPred.predDia, color: TEAL },
            ].map(({ label, sys, dia, color }) => (
              <div key={label} style={{ background: 'white', borderRadius: 12, padding: '1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '.7rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.4rem' }}>{label}</div>
                <div style={{ fontWeight: 900, fontSize: '2.2rem', color, lineHeight: 1 }}>{sys}/{dia}</div>
                <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: '.25rem' }}>mmHg</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '.75rem', display: 'flex', gap: '.75rem', justifyContent: 'center', fontSize: '.8rem' }}>
            <span style={{ color: '#6B7280' }}>
              Sys error: <strong style={{ color: Math.abs(latestPred.predSys - latestPred.actualSys) <= 10 ? '#10B981' : '#EF4444' }}>
                {latestPred.predSys > latestPred.actualSys ? '+' : ''}{latestPred.predSys - latestPred.actualSys} mmHg
              </strong>
            </span>
            <span style={{ color: '#6B7280' }}>
              Dia error: <strong style={{ color: Math.abs(latestPred.predDia - latestPred.actualDia) <= 10 ? '#10B981' : '#EF4444' }}>
                {latestPred.predDia > latestPred.actualDia ? '+' : ''}{latestPred.predDia - latestPred.actualDia} mmHg
              </strong>
            </span>
            {latestPred.confidence && (
              <span style={{ color: '#6B7280' }}>Confidence: <strong>{latestPred.confidence}</strong></span>
            )}
          </div>
        </div>
      )}

      {/* Run button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button onClick={runAnalysis} disabled={running || !ready}
          style={{ background: ready ? TEAL : '#9CA3AF', color: 'white', border: 'none', borderRadius: 99, padding: '.5rem 1.25rem', fontWeight: 700, fontSize: '.85rem', cursor: ready && !running ? 'pointer' : 'not-allowed', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          {running ? progress : 'Run BP analysis (v15 MLP)'}
        </button>
        <button onClick={runLambdaSweep} disabled={v2Running}
          style={{ background: 'white', color: NAVY, border: `1.5px solid ${NAVY}`, borderRadius: 99, padding: '.5rem 1.25rem', fontWeight: 700, fontSize: '.85rem', cursor: v2Running ? 'not-allowed' : 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          {v2Running && v2Progress.includes('Sweep') ? v2Progress : 'λ sweep'}
        </button>
        <label style={{ fontSize: '.8rem', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          λ =
          <select value={v2Lambda} onChange={e => setV2Lambda(parseFloat(e.target.value))}
            style={{ padding: '.3rem .5rem', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: '.8rem' }}>
            {[0.01, 0.1, 1, 10, 100].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <button onClick={trainAndRunV2} disabled={v2Running}
          style={{ background: NAVY, color: 'white', border: 'none', borderRadius: 99, padding: '.5rem 1.25rem', fontWeight: 700, fontSize: '.85rem', cursor: v2Running ? 'not-allowed' : 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          {v2Running && !v2Progress.includes('Sweep') ? v2Progress : `Train & run v2 (λ=${v2Lambda})`}
        </button>
        <button onClick={runTreeSweep} disabled={v3Running}
          style={{ background: 'white', color: '#7C3AED', border: `1.5px solid #7C3AED`, borderRadius: 99, padding: '.5rem 1.25rem', fontWeight: 700, fontSize: '.85rem', cursor: v3Running ? 'not-allowed' : 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          {v3Running && v3Progress.includes('Sweeping tree') ? v3Progress : 'v3 tree sweep'}
        </button>
        <label style={{ fontSize: '.8rem', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          v3 trees =
          <select value={v3Trees} onChange={e => setV3Trees(parseInt(e.target.value, 10))}
            style={{ padding: '.3rem .5rem', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: '.8rem' }}>
            {[10, 20, 30, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label style={{ fontSize: '.8rem', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '.4rem' }}
          title="How hard the GBM leans toward hypertensive/hypotensive samples. 0 = uniform. 2 = default. Higher = follows tails harder but risks overshooting normals.">
          tailBoost =
          <select value={v3TailBoost} onChange={e => setV3TailBoost(parseFloat(e.target.value))}
            style={{ padding: '.3rem .5rem', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: '.8rem' }}>
            {[0, 1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button onClick={trainAndRunV3} disabled={v3Running}
          style={{ background: '#7C3AED', color: 'white', border: 'none', borderRadius: 99, padding: '.5rem 1.25rem', fontWeight: 700, fontSize: '.85rem', cursor: v3Running ? 'not-allowed' : 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          {v3Running && !v3Progress.includes('Sweeping tree') ? v3Progress : `Train & run v3 (${v3Trees} trees)`}
        </button>
        <button onClick={oneShotRetrainV3} disabled={v3Running}
          title="One-click: train v3 at the proven knee (20 trees, tailBoost=2) and auto-promote if it beats the current prod model. Same gates as the nightly cron."
          style={{ background: '#059669', color: 'white', border: 'none', borderRadius: 99, padding: '.5rem 1.25rem', fontWeight: 700, fontSize: '.85rem', cursor: v3Running ? 'not-allowed' : 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          {v3Running && v3Progress.startsWith('Retrain v3') ? v3Progress : '🔄 Retrain v3'}
        </button>
        {!ready && <span style={{ fontSize: '.8rem', color: '#9CA3AF' }}>v15 not yet trained or insufficient samples</span>}
        {bpPreds.length > 0 && !running && <span style={{ fontSize: '.8rem', color: '#6B7280' }}>v15: {bpPreds.length}</span>}
        {v2Preds.length > 0 && !v2Running && <span style={{ fontSize: '.8rem', color: '#6B7280' }}>v2: {v2Preds.length}</span>}
        {v2Error && <span style={{ fontSize: '.8rem', color: '#EF4444' }}>{v2Error}</span>}
      </div>

      {/* Aggregate stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.75rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Sys MAE', value: `±${stats.sysMae} mmHg`, color: parseFloat(stats.sysMae) <= 10 ? '#10B981' : parseFloat(stats.sysMae) <= 15 ? '#F59E0B' : '#EF4444' },
            { label: 'Dia MAE', value: `±${stats.diaMae} mmHg`, color: parseFloat(stats.diaMae) <= 10 ? '#10B981' : parseFloat(stats.diaMae) <= 15 ? '#F59E0B' : '#EF4444' },
            { label: 'Within ±10', value: `${stats.within10Pct}%`, color: stats.within10Pct >= 70 ? '#10B981' : '#F59E0B' },
            { label: 'Within ±15', value: `${stats.within15Pct}%`, color: stats.within15Pct >= 85 ? '#10B981' : '#F59E0B' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: '#F9FAFB', borderRadius: 12, padding: '.75rem', textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', color }}>{value}</div>
              <div style={{ fontSize: '.7rem', color: '#6B7280', marginTop: '.2rem' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Mean-collapse diagnostic. If pred-SD is tight while cuff-SD is
          wide, the model is emitting the training mean regardless of
          input. Shown here so it's visible at a glance instead of having
          to eyeball 150+ rows. */}
      {stats && (
        <div style={{
          background: stats.collapsed ? '#FEF2F2' : '#F0FDF4',
          border: `1px solid ${stats.collapsed ? '#FECACA' : '#BBF7D0'}`,
          borderRadius: 12, padding: '1rem', marginBottom: '1.5rem',
        }}>
          <div style={{ fontSize: '.7rem', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: stats.collapsed ? '#991B1B' : '#065F46', marginBottom: '.5rem' }}>
            {stats.collapsed ? '⚠ Mean-collapse detected' : '✓ Model varies with input'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.5rem', fontSize: '.75rem', color: NAVY }}>
            <div>
              <div style={{ color: '#6B7280', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Pred SBP</div>
              <div style={{ fontWeight: 700 }}>{stats.predSysMean} ± {stats.predSysSd}</div>
            </div>
            <div>
              <div style={{ color: '#6B7280', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Cuff SBP</div>
              <div style={{ fontWeight: 700 }}>{stats.cuffSysMean} ± {stats.cuffSysSd}</div>
            </div>
            <div>
              <div style={{ color: '#6B7280', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Pred DBP</div>
              <div style={{ fontWeight: 700 }}>{stats.predDiaMean} ± {stats.predDiaSd}</div>
            </div>
            <div>
              <div style={{ color: '#6B7280', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Cuff DBP</div>
              <div style={{ fontWeight: 700 }}>{stats.cuffDiaMean} ± {stats.cuffDiaSd}</div>
            </div>
          </div>
          <div style={{ marginTop: '.5rem', fontSize: '.7rem', color: '#6B7280', lineHeight: 1.4 }}>
            {stats.collapsed
              ? `Prediction spread (SD ${stats.predSysSd}) is tight while cuff spread (SD ${stats.cuffSysSd}) is wide — model is emitting ~${stats.predSysMean}/${stats.predDiaMean} regardless of patient. Likely training-mean collapse (narrow-variance training data).`
              : `Prediction spread (SD ${stats.predSysSd}) tracks cuff spread (SD ${stats.cuffSysSd}) — model is differentiating across patients.`}
          </div>
        </div>
      )}

      {/* Scatter chart */}
      {bpPreds.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '.85rem', fontWeight: 600, color: NAVY, marginBottom: '.75rem' }}>v15 — Predicted vs Actual BP</div>
          <BPScatterChart bpPreds={bpPreds} />
          <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: '.5rem' }}>Teal = systolic · amber = diastolic · dashed = perfect agreement</div>
        </div>
      )}

      {/* v2 panel — ridge regression on 10 waveform + HR/HRV features + age +
          sex. Runs on exactly the same stored signals so numbers are directly
          comparable to v15. Local-only until promoted; promote writes to
          bp_v2_models in Supabase and live /vitals mounts load it. */}
      {(v2Model || v2Preds.length > 0 || v2Sweep || v2ActiveServer) && (
        <div style={{
          borderTop: '2px solid #E5E7EB',
          paddingTop: '1.5rem',
          marginTop: '2rem',
          marginBottom: '1.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '.5rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '.95rem', fontWeight: 800, color: NAVY }}>
              v2 ridge regression — waveform morphology + HR/HRV
            </div>
            {/* Live-display toggle. Flips the localStorage flag read by
                VitalsCapture on next scan. Only affects THIS device. */}
            <div style={{ display: 'flex', gap: 4, background: '#F3F4F6', borderRadius: 99, padding: 3 }}>
              {['v15', 'v2', 'v3'].map(v => (
                <button key={v} onClick={() => toggleDisplay(v)}
                  style={{
                    padding: '.3rem .8rem', border: 'none', borderRadius: 99, fontSize: '.72rem', fontWeight: 700,
                    background: v2Display === v ? NAVY : 'transparent',
                    color:      v2Display === v ? 'white' : '#6B7280',
                    cursor: 'pointer',
                  }}>
                  Live display: {v}
                </button>
              ))}
            </div>
          </div>
          <div style={{ fontSize: '.78rem', color: '#6B7280', marginBottom: '1rem', lineHeight: 1.5 }}>
            Closed-form ridge on 10 physiology features (upstroke time, augmentation index, pulse width ½, area ratio, dicrotic notch delay, SDPPG b/a, HR, HRV SDNN, HRV RMSSD, notch position) + age + sex. 13 parameters vs v15's ~50k. Promote writes to bp_v2_models; live /vitals shows the promoted model's number if "Live display: v2" is set on the device.
          </div>

          {/* Server-active status */}
          <div style={{ fontSize: '.72rem', color: '#6B7280', marginBottom: '.75rem' }}>
            {v2ActiveServer
              ? <>Server active: trained {v2ActiveServer.trained_at ? new Date(v2ActiveServer.trained_at).toLocaleString() : '—'} · val MAE ±{v2ActiveServer.val_mae_sys ?? '?'}/±{v2ActiveServer.val_mae_dia ?? '?'} · λ={v2ActiveServer.lambda ?? '?'} · n={v2ActiveServer.n_training ?? '?'}</>
              : <>No v2 model promoted on server yet. Live /vitals is v15-only until a model is promoted.</>}
          </div>

          {/* λ sweep results */}
          {v2Sweep && (
            <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '.75rem 1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '.72rem', fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>λ sweep (val MAE on held-out 20%)</div>
              <table style={{ width: '100%', fontSize: '.78rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr><th style={{ textAlign: 'left', color: '#6B7280', fontWeight: 700, padding: '.25rem .5rem' }}>λ</th>
                      <th style={{ textAlign: 'left', color: '#6B7280', fontWeight: 700, padding: '.25rem .5rem' }}>Train sys/dia</th>
                      <th style={{ textAlign: 'left', color: '#6B7280', fontWeight: 700, padding: '.25rem .5rem' }}>Val sys/dia</th>
                      <th style={{ textAlign: 'left', color: '#6B7280', fontWeight: 700, padding: '.25rem .5rem' }}></th></tr>
                </thead>
                <tbody>
                  {v2Sweep.map(r => (
                    <tr key={r.lambda} style={{ background: r.best ? '#F0FDF4' : 'transparent' }}>
                      <td style={{ padding: '.25rem .5rem', fontWeight: 700, color: NAVY }}>{r.lambda}</td>
                      <td style={{ padding: '.25rem .5rem', color: '#6B7280' }}>{r.trainMae ? `±${r.trainMae.sys}/±${r.trainMae.dia}` : '—'}</td>
                      <td style={{ padding: '.25rem .5rem', color: NAVY, fontWeight: 600 }}>{r.valMae ? `±${r.valMae.sys}/±${r.valMae.dia}` : (r.error || '—')}</td>
                      <td style={{ padding: '.25rem .5rem' }}>{r.best && <span style={{ color: '#065F46', fontWeight: 700, fontSize: '.7rem' }}>↳ best</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: '.7rem', color: '#6B7280', marginTop: '.4rem' }}>Picked best λ into dropdown — click "Train & run v2" to retrain at that setting.</div>
            </div>
          )}

          {/* Beats mean baseline + Promote button */}
          {v2Model?.meta && meanBaseline && (
            <div style={{
              background: v2BeatsMean ? '#F0FDF4' : '#FEF2F2',
              border: `1px solid ${v2BeatsMean ? '#BBF7D0' : '#FECACA'}`,
              borderRadius: 10, padding: '.75rem 1rem', marginBottom: '1rem',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.75rem',
            }}>
              <div style={{ fontSize: '.78rem', color: v2BeatsMean ? '#065F46' : '#991B1B', lineHeight: 1.5 }}>
                <strong>{v2BeatsMean ? '✓ v2 beats mean baseline' : '✗ v2 does NOT beat mean baseline'}</strong><br />
                v2 val MAE: ±{v2Model.meta.valMae.sys}/±{v2Model.meta.valMae.dia} &nbsp;·&nbsp;
                "always predict mean" MAE: ±{meanBaseline.sysMae}/±{meanBaseline.diaMae}
                {!v2BeatsMean && <> &nbsp;→ v2 is adding noise, not signal. Don't promote.</>}
              </div>
              <button onClick={handlePromoteV2}
                disabled={v2Promoting || !v2BeatsMean}
                title={v2BeatsMean ? 'Promote this model to prod (admin only)' : 'Promote disabled — v2 does not beat mean baseline'}
                style={{
                  background: v2BeatsMean && !v2Promoting ? NAVY : '#D1D5DB',
                  color: 'white', border: 'none', borderRadius: 99,
                  padding: '.5rem 1rem', fontWeight: 700, fontSize: '.78rem',
                  cursor: v2BeatsMean && !v2Promoting ? 'pointer' : 'not-allowed',
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                  whiteSpace: 'nowrap',
                }}>
                {v2Promoting ? 'Promoting…' : 'Promote to prod'}
              </button>
            </div>
          )}

          {v2Model?.meta && (
            <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '.75rem 1rem', marginBottom: '1rem', fontSize: '.78rem', color: NAVY }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.5rem' }}>
                <div><span style={{ color: '#6B7280' }}>Train MAE sys:</span> <strong>±{v2Model.meta.trainMae?.sys}</strong></div>
                <div><span style={{ color: '#6B7280' }}>Train MAE dia:</span> <strong>±{v2Model.meta.trainMae?.dia}</strong></div>
                <div><span style={{ color: '#6B7280' }}>Val MAE sys:</span> <strong style={{ color: v2Model.meta.valMae?.sys <= 10 ? '#10B981' : '#F59E0B' }}>±{v2Model.meta.valMae?.sys}</strong></div>
                <div><span style={{ color: '#6B7280' }}>Val MAE dia:</span> <strong style={{ color: v2Model.meta.valMae?.dia <= 8 ? '#10B981' : '#F59E0B' }}>±{v2Model.meta.valMae?.dia}</strong></div>
              </div>
              <div style={{ marginTop: '.4rem', fontSize: '.7rem', color: '#9CA3AF' }}>
                Trained on {v2Model.meta.n} / val on {v2Model.meta.nVal} · λ={v2Model.meta.lambda} · {v2Model.meta.trainedAt ? new Date(v2Model.meta.trainedAt).toLocaleString() : '—'}
              </div>
            </div>
          )}

          {v2Stats && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.75rem', marginBottom: '1rem' }}>
                {[
                  { label: 'v2 Sys MAE', value: `±${v2Stats.sysMae} mmHg`, color: parseFloat(v2Stats.sysMae) <= 10 ? '#10B981' : parseFloat(v2Stats.sysMae) <= 15 ? '#F59E0B' : '#EF4444' },
                  { label: 'v2 Dia MAE', value: `±${v2Stats.diaMae} mmHg`, color: parseFloat(v2Stats.diaMae) <= 10 ? '#10B981' : parseFloat(v2Stats.diaMae) <= 15 ? '#F59E0B' : '#EF4444' },
                  { label: 'v2 Within ±10', value: `${v2Stats.within10Pct}%`, color: v2Stats.within10Pct >= 70 ? '#10B981' : '#F59E0B' },
                  { label: 'v2 Within ±15', value: `${v2Stats.within15Pct}%`, color: v2Stats.within15Pct >= 85 ? '#10B981' : '#F59E0B' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: '#F9FAFB', borderRadius: 12, padding: '.75rem', textAlign: 'center' }}>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color }}>{value}</div>
                    <div style={{ fontSize: '.7rem', color: '#6B7280', marginTop: '.2rem' }}>{label}</div>
                  </div>
                ))}
              </div>

              <div style={{
                background: v2Stats.collapsed ? '#FEF2F2' : '#F0FDF4',
                border: `1px solid ${v2Stats.collapsed ? '#FECACA' : '#BBF7D0'}`,
                borderRadius: 12, padding: '1rem', marginBottom: '1.5rem',
              }}>
                <div style={{ fontSize: '.7rem', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: v2Stats.collapsed ? '#991B1B' : '#065F46', marginBottom: '.5rem' }}>
                  {v2Stats.collapsed ? '⚠ v2 mean-collapse too' : '✓ v2 varies with input'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.5rem', fontSize: '.75rem', color: NAVY }}>
                  <div>
                    <div style={{ color: '#6B7280', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Pred SBP</div>
                    <div style={{ fontWeight: 700 }}>{v2Stats.predSysMean} ± {v2Stats.predSysSd}</div>
                  </div>
                  <div>
                    <div style={{ color: '#6B7280', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Cuff SBP</div>
                    <div style={{ fontWeight: 700 }}>{v2Stats.cuffSysMean} ± {v2Stats.cuffSysSd}</div>
                  </div>
                  <div>
                    <div style={{ color: '#6B7280', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Pred DBP</div>
                    <div style={{ fontWeight: 700 }}>{v2Stats.predDiaMean} ± {v2Stats.predDiaSd}</div>
                  </div>
                  <div>
                    <div style={{ color: '#6B7280', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Cuff DBP</div>
                    <div style={{ fontWeight: 700 }}>{v2Stats.cuffDiaMean} ± {v2Stats.cuffDiaSd}</div>
                  </div>
                </div>
                <div style={{ marginTop: '.5rem', fontSize: '.7rem', color: '#6B7280', lineHeight: 1.4 }}>
                  v15 pred SD was {stats?.predSysSd ?? '—'} vs v2 pred SD {v2Stats.predSysSd}. v2 is {v2Stats.predSysSd > (stats?.predSysSd || 0) ? 'spreading wider' : 'at least as flat'} than v15.
                </div>
              </div>

              {v2Preds.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '.85rem', fontWeight: 600, color: NAVY, marginBottom: '.75rem' }}>v2 — Predicted vs Actual BP</div>
                  <BPScatterChart bpPreds={v2Preds} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* v3 panel — Tier 1 face-only: POS, multi-pass windowing, 4 added features,
          gradient-boost trees. Separate server table + promote, same mean-baseline
          gate as v2. Compact layout: stats row + beats-mean banner + scatter. */}
      {(v3Model || v3Preds.length > 0 || v3ActiveServer) && (() => {
        const v3Stats = computeBPStats(v3Preds)
        const v3BeatsMean = meanBaseline && v3Model?.meta?.valMae
          ? (v3Model.meta.valMae.sys <= meanBaseline.sysMae && v3Model.meta.valMae.dia <= meanBaseline.diaMae)
          : null
        return (
          <div style={{
            borderTop: '2px solid #E5E7EB',
            paddingTop: '1.5rem',
            marginTop: '2rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{ fontSize: '.95rem', fontWeight: 800, color: NAVY, marginBottom: '.5rem' }}>
              v3 gradient-boost — POS + multi-pass windowing (face-only)
            </div>
            <div style={{ fontSize: '.78rem', color: '#6B7280', marginBottom: '1rem', lineHeight: 1.5 }}>
              POS (Wang 2017) replaces CHROM. Features extracted from 5+ overlapping 10s windows per scan, median across windows. Added perfusion index, stiffness index, reflection coefficient, spectral entropy. 50 depth-3 regression trees, lr=0.1. No per-subject calibration, no second sensor.
            </div>

            <div style={{ fontSize: '.72rem', color: '#6B7280', marginBottom: '.75rem' }}>
              {v3ActiveServer
                ? <>Server active: trained {v3ActiveServer.trained_at ? new Date(v3ActiveServer.trained_at).toLocaleString() : '—'} · val MAE ±{v3ActiveServer.val_mae_sys ?? '?'}/±{v3ActiveServer.val_mae_dia ?? '?'} · {v3ActiveServer.n_trees ?? '?'} trees · n={v3ActiveServer.n_training ?? '?'}</>
                : <>No v3 model promoted on server yet.</>}
            </div>

            {v3Error && <div style={{ fontSize: '.78rem', color: '#EF4444', marginBottom: '.5rem' }}>{v3Error}</div>}

            {/* Tree-count sweep results. Picks the knee (fewest trees within
                0.3 mmHg of best val MAE) to reduce overfitting. */}
            {v3Sweep && (
              <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '.75rem 1rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '.72rem', fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>Tree-count sweep (val MAE on held-out 20%)</div>
                <table style={{ width: '100%', fontSize: '.78rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr><th style={{ textAlign: 'left', color: '#6B7280', fontWeight: 700, padding: '.25rem .5rem' }}>trees</th>
                        <th style={{ textAlign: 'left', color: '#6B7280', fontWeight: 700, padding: '.25rem .5rem' }}>Train sys/dia</th>
                        <th style={{ textAlign: 'left', color: '#6B7280', fontWeight: 700, padding: '.25rem .5rem' }}>Val sys/dia</th>
                        <th style={{ textAlign: 'left', color: '#6B7280', fontWeight: 700, padding: '.25rem .5rem' }}>Overfit (val/train)</th>
                        <th style={{ textAlign: 'left', color: '#6B7280', fontWeight: 700, padding: '.25rem .5rem' }}></th></tr>
                  </thead>
                  <tbody>
                    {v3Sweep.map(r => {
                      const overfit = r.trainMae && r.valMae ? (r.valMae.sys / r.trainMae.sys).toFixed(1) : '—'
                      return (
                        <tr key={r.nTrees} style={{ background: r.best ? '#F0FDF4' : 'transparent' }}>
                          <td style={{ padding: '.25rem .5rem', fontWeight: 700, color: NAVY }}>{r.nTrees}</td>
                          <td style={{ padding: '.25rem .5rem', color: '#6B7280' }}>{r.trainMae ? `±${r.trainMae.sys}/±${r.trainMae.dia}` : '—'}</td>
                          <td style={{ padding: '.25rem .5rem', color: NAVY, fontWeight: 600 }}>{r.valMae ? `±${r.valMae.sys}/±${r.valMae.dia}` : (r.error || '—')}</td>
                          <td style={{ padding: '.25rem .5rem', color: overfit !== '—' && parseFloat(overfit) > 2 ? '#EF4444' : '#6B7280' }}>{overfit !== '—' ? `${overfit}×` : '—'}</td>
                          <td style={{ padding: '.25rem .5rem' }}>{r.best && <span style={{ color: '#065F46', fontWeight: 700, fontSize: '.7rem' }}>↳ best (knee)</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div style={{ fontSize: '.7rem', color: '#6B7280', marginTop: '.4rem' }}>Picked knee into dropdown — click "Train & run v3" to retrain at that setting. Lower overfit (val/train) = model generalises better to unseen patients.</div>
              </div>
            )}

            {v3Model?.meta && (
              <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '.75rem 1rem', marginBottom: '1rem', fontSize: '.78rem', color: NAVY }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.5rem' }}>
                  <div><span style={{ color: '#6B7280' }}>Train MAE sys:</span> <strong>±{v3Model.meta.trainMae?.sys}</strong></div>
                  <div><span style={{ color: '#6B7280' }}>Train MAE dia:</span> <strong>±{v3Model.meta.trainMae?.dia}</strong></div>
                  <div><span style={{ color: '#6B7280' }}>Val MAE sys:</span> <strong style={{ color: v3Model.meta.valMae?.sys <= 10 ? '#10B981' : '#F59E0B' }}>±{v3Model.meta.valMae?.sys}</strong></div>
                  <div><span style={{ color: '#6B7280' }}>Val MAE dia:</span> <strong style={{ color: v3Model.meta.valMae?.dia <= 7.5 ? '#10B981' : '#F59E0B' }}>±{v3Model.meta.valMae?.dia}</strong></div>
                </div>
                <div style={{ marginTop: '.4rem', fontSize: '.7rem', color: '#9CA3AF' }}>
                  n={v3Model.meta.n} / val={v3Model.meta.nVal} · {v3Model.meta.nTrees} trees · depth={v3Model.meta.depth} · lr={v3Model.meta.lr} · {v3Model.meta.trainedAt ? new Date(v3Model.meta.trainedAt).toLocaleString() : '—'}
                </div>
              </div>
            )}

            {v3Stats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.75rem', marginBottom: '1rem' }}>
                {[
                  { label: 'v3 Sys MAE (all)', value: `±${v3Stats.sysMae}`, color: parseFloat(v3Stats.sysMae) <= 10 ? '#10B981' : '#F59E0B' },
                  { label: 'v3 Dia MAE (all)', value: `±${v3Stats.diaMae}`, color: parseFloat(v3Stats.diaMae) <= 7.5 ? '#10B981' : '#F59E0B' },
                  { label: 'Pred SBP SD',      value: `${v3Stats.predSysSd}`,  color: v3Stats.predSysSd > 5 ? '#10B981' : '#EF4444' },
                  { label: 'Pred DBP SD',      value: `${v3Stats.predDiaSd}`,  color: v3Stats.predDiaSd > 4 ? '#10B981' : '#EF4444' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: '#F9FAFB', borderRadius: 12, padding: '.75rem', textAlign: 'center' }}>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color }}>{value}</div>
                    <div style={{ fontSize: '.68rem', color: '#6B7280', marginTop: '.2rem' }}>{label}</div>
                  </div>
                ))}
              </div>
            )}

            {v3Model?.meta && meanBaseline && (
              <div style={{
                background: v3BeatsMean ? '#F0FDF4' : '#FEF2F2',
                border: `1px solid ${v3BeatsMean ? '#BBF7D0' : '#FECACA'}`,
                borderRadius: 10, padding: '.75rem 1rem', marginBottom: '1rem',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.75rem',
              }}>
                <div style={{ fontSize: '.78rem', color: v3BeatsMean ? '#065F46' : '#991B1B', lineHeight: 1.5 }}>
                  <strong>{v3BeatsMean ? '✓ v3 beats mean baseline' : '✗ v3 does NOT beat mean baseline'}</strong><br />
                  v3 val MAE: ±{v3Model.meta.valMae.sys}/±{v3Model.meta.valMae.dia} &nbsp;·&nbsp;
                  mean baseline: ±{meanBaseline.sysMae}/±{meanBaseline.diaMae}
                </div>
                <button onClick={handlePromoteV3}
                  disabled={v3Promoting || !v3BeatsMean}
                  title={v3BeatsMean ? 'Promote v3 to prod (admin only)' : 'Promote disabled — v3 does not beat mean baseline'}
                  style={{
                    background: v3BeatsMean && !v3Promoting ? '#7C3AED' : '#D1D5DB',
                    color: 'white', border: 'none', borderRadius: 99,
                    padding: '.5rem 1rem', fontWeight: 700, fontSize: '.78rem',
                    cursor: v3BeatsMean && !v3Promoting ? 'pointer' : 'not-allowed',
                    whiteSpace: 'nowrap',
                  }}>
                  {v3Promoting ? 'Promoting…' : 'Promote v3 to prod'}
                </button>
              </div>
            )}

            {v3Preds.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '.85rem', fontWeight: 600, color: NAVY, marginBottom: '.75rem' }}>v3 — Predicted vs Actual BP</div>
                <BPScatterChart bpPreds={v3Preds} />
              </div>
            )}
          </div>
        )
      })()}

      {/* Per-reading table */}
      {bpPreds.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
          <thead>
            <tr>
              {['Date','Subject','Actual','Predicted','Sys err','Dia err','Conf'].map(h => (
                <th key={h} style={{ padding: '.4rem .6rem', textAlign: 'left', borderBottom: '1px solid #F3F4F6', color: '#6B7280', fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bpPreds.map(p => {
              const sysErr = p.predSys - p.actualSys
              const diaErr = p.predDia - p.actualDia
              const sysOk  = Math.abs(sysErr) <= 10
              const diaOk  = Math.abs(diaErr) <= 10
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid #F9FAFB' }}>
                  <td style={{ padding: '.4rem .6rem', color: '#6B7280' }}>{new Date(p.date).toLocaleDateString()}</td>
                  <td style={{ padding: '.4rem .6rem', fontWeight: 700, color: TEAL }}>{p.subject || '—'}</td>
                  <td style={{ padding: '.4rem .6rem', color: NAVY }}>{p.actualSys}/{p.actualDia}</td>
                  <td style={{ padding: '.4rem .6rem', color: NAVY }}>{p.predSys}/{p.predDia}</td>
                  <td style={{ padding: '.4rem .6rem', fontWeight: 700, color: sysOk ? '#10B981' : '#EF4444' }}>{sysErr > 0 ? '+' : ''}{sysErr}</td>
                  <td style={{ padding: '.4rem .6rem', fontWeight: 700, color: diaOk ? '#10B981' : '#EF4444' }}>{diaErr > 0 ? '+' : ''}{diaErr}</td>
                  <td style={{ padding: '.4rem .6rem', color: '#6B7280', fontSize: '.75rem' }}>{p.confidence || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function DiversityTracker({ subjects }) {
  if (!subjects.length) return <div style={{ color: '#6B7280', fontSize: '.9rem' }}>No subjects yet.</div>
  const ages = subjects.filter(s => s.age).map(s => s.age)
  const ageRange = ages.length ? `${Math.min(...ages)}–${Math.max(...ages)}` : '—'
  const sexCounts = subjects.reduce((acc, s) => { if (s.sex) acc[s.sex] = (acc[s.sex] || 0) + 1; return acc }, {})
  const fitzCovered = new Set(subjects.filter(s => s.fitzpatrick_scale).map(s => s.fitzpatrick_scale))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '.75rem', textAlign: 'center' }}>
        {[['Subjects', subjects.length], ['Age range', ageRange], ['Skin types', `${fitzCovered.size}/6`]].map(([lbl, val]) => (
          <div key={lbl} style={{ background: '#F9FAFB', borderRadius: 10, padding: '.75rem' }}>
            <div style={{ fontWeight: 800, fontSize: '1.15rem', color: NAVY }}>{val}</div>
            <div style={{ fontSize: '.75rem', color: '#6B7280' }}>{lbl}</div>
          </div>
        ))}
      </div>
      {Object.keys(sexCounts).length > 0 && (
        <div>
          <div style={{ fontSize: '.8rem', fontWeight: 600, color: NAVY, marginBottom: '.4rem' }}>Sex distribution</div>
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
            {Object.entries(sexCounts).map(([sex, count]) => (
              <div key={sex} style={{ background: '#F0F9FF', borderRadius: 99, padding: '.3rem .7rem', fontSize: '.8rem', color: NAVY }}>
                {sex}: {Math.round((count / subjects.length) * 100)}%
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <div style={{ fontSize: '.8rem', fontWeight: 600, color: NAVY, marginBottom: '.5rem' }}>Fitzpatrick coverage</div>
        <div style={{ display: 'flex', gap: '.4rem' }}>
          {FITZ_COLORS.map((color, i) => (
            <div key={i} title={`Type ${i + 1}`} style={{
              width: 32, height: 32, borderRadius: '50%', background: color,
              border: fitzCovered.has(i + 1) ? `3px solid ${TEAL}` : '2px solid #E5E7EB',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '.7rem', fontWeight: 700, color: i >= 3 ? 'rgba(255,255,255,.9)' : '#4B5563',
            }}>{i + 1}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SkinToneGapPanel({ readings, subjects }) {
  const TARGET = 15
  const FITZ_LABELS = ['I (very fair)', 'II (fair)', 'III (medium)', 'IV (olive)', 'V (brown)', 'VI (dark)']
  const subjectsByType = [0, 0, 0, 0, 0, 0]
  const readingsByType = [0, 0, 0, 0, 0, 0]
  subjects.forEach(s => { if (s.fitzpatrick_scale >= 1 && s.fitzpatrick_scale <= 6) subjectsByType[s.fitzpatrick_scale - 1]++ })
  readings.forEach(r => {
    const fitz = r.validation_subjects?.fitzpatrick_scale
    if (fitz >= 1 && fitz <= 6) readingsByType[fitz - 1]++
  })
  const vCount = readingsByType[4] + readingsByType[5]
  const vTarget = TARGET * 2
  const criticalGap = vCount < 5
  const someGap = vCount < vTarget

  return (
    <div style={{
      background: criticalGap ? '#FEF2F2' : someGap ? '#FFFBEB' : '#F0FDF4',
      border: `1.5px solid ${criticalGap ? '#FCA5A5' : someGap ? '#FCD34D' : '#86EFAC'}`,
      borderRadius: 16, padding: '1.25rem', marginBottom: '1.25rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
        <span style={{ fontSize: '1.1rem' }}>{criticalGap ? '⚠️' : someGap ? '⚡' : '✓'}</span>
        <div style={{ fontWeight: 700, fontSize: '.95rem', color: criticalGap ? '#991B1B' : someGap ? '#92400E' : '#065F46' }}>
          {criticalGap ? 'Critical data gap — skin tone coverage' : someGap ? 'Skin tone coverage below target' : 'Skin tone coverage on target'}
        </div>
      </div>
      {someGap && (
        <div style={{ fontSize: '.85rem', color: criticalGap ? '#991B1B' : '#92400E', marginBottom: '.85rem', lineHeight: 1.45 }}>
          HR accuracy can be up to 4× worse for darker skin tones without representative training data. Priority: recruit Māori and Pacific volunteers (typically Fitzpatrick V/VI).
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
        {FITZ_LABELS.map((lbl, i) => {
          const reads = readingsByType[i]
          const subs = subjectsByType[i]
          const pct = Math.min(100, (reads / TARGET) * 100)
          const isVVI = i >= 4
          const barColor = reads >= TARGET ? '#10B981' : isVVI && reads < 5 ? '#EF4444' : reads < TARGET / 2 ? '#F59E0B' : '#0B6E76'
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '8rem 1fr 5rem', alignItems: 'center', gap: '.75rem', fontSize: '.8rem' }}>
              <div style={{ color: isVVI ? NAVY : '#6B7280', fontWeight: isVVI ? 700 : 500 }}>Type {lbl}</div>
              <div style={{ background: '#E5E7EB', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                <div style={{ background: barColor, height: 6, width: `${pct}%`, transition: 'width .3s' }} />
              </div>
              <div style={{ color: '#6B7280', textAlign: 'right' }}>{reads} / {TARGET} ({subs} subj)</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ModelPanel({ readings, modelVersions, training, trainingStatus, onTrain, onReset }) {
  const localMeta   = getLocalMeta()
  const latestDB    = modelVersions[0]
  const meta        = localMeta || latestDB
  const totalReadings = readings.length

  const mae     = meta?.val_mae ?? meta?.final_mae ?? meta?.valMae ?? meta?.finalMae ?? null
  const maeSys  = meta?.valMaeSys ?? meta?.val_mae_sys ?? null
  const maeDia  = meta?.valMaeDia ?? meta?.val_mae_dia ?? null
  const samples = meta?.training_samples ?? meta?.samples ?? 0

  const status = !meta ? 'none'
    : mae == null ? 'training'
    : mae > 20 ? 'building'
    : mae > 15 ? 'improving'
    : mae > 10 ? 'active'
    : 'clinical'

  const statusInfo = {
    none:     { bg: '#F3F4F6', color: '#6B7280', label: 'No model yet' },
    training: { bg: '#FEF3C7', color: '#92400E', label: 'Training — not ready for patients' },
    building: { bg: '#FEE2E2', color: '#991B1B', label: 'Training — not ready for patients' },
    improving:{ bg: '#FEF3C7', color: '#92400E', label: 'Improving — not ready yet' },
    active:   { bg: '#D1FAE5', color: '#065F46', label: '✓ Active — showing estimates to patients' },
    clinical: { bg: '#D1FAE5', color: '#065F46', label: '⭐ Clinical accuracy achieved (MAE ≤10 mmHg)' },
  }[status] || {}

  const patientPct = Math.min(100, Math.round((samples / BP_SHOW_THRESHOLD.samples) * 100))
  const nextAt = (Math.floor(totalReadings / 5) + 1) * 5
  const version = meta?.model_version ?? meta?.version ?? '—'

  return (
    <div style={{ background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 1px 6px rgba(0,0,0,.05)', marginBottom: '1.25rem' }}>
      {(() => {
        // Prefer meta.trainedAt — that's stamped inside trainModel() every
        // retrain, whichever caller triggered it. Fall back to the legacy
        // tere_last_train_ms key for anything trained before this fix.
        const trainedAtMs = meta?.trainedAt ? new Date(meta.trainedAt).getTime()
          : parseInt(localStorage.getItem('tere_last_train_ms') || '0')
        const minsAgo = trainedAtMs ? Math.round((Date.now() - trainedAtMs) / 60000) : null
        const retrainReason = meta?.retrainReason || null
        return (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '.85rem' }}>
            <div>
              <div style={{ fontWeight: 700, color: NAVY, fontSize: '.95rem' }}>BP model</div>
              {meta && (
                <div style={{ fontSize: '.8rem', color: '#6B7280', marginTop: '.2rem' }}>
                  {version} · {samples} samples{mae != null ? ` · MAE ±${Number(mae).toFixed(1)} mmHg` : ''}
                  {maeSys != null && maeDia != null && ` (sys ±${Number(maeSys).toFixed(1)} / dia ±${Number(maeDia).toFixed(1)})`}
                </div>
              )}
              {minsAgo != null && (
                <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: '.15rem' }}>
                  Last trained: {minsAgo === 0 ? 'just now' : `${minsAgo}m ago`}
                  {retrainReason && ` · ${retrainReason.replace(/_/g, ' ')}`}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '.4rem' }}>
              <button onClick={onTrain} disabled={!!training || totalReadings < 5}
                style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 99, padding: '.4rem 1rem', fontWeight: 700, fontSize: '.8rem', cursor: (training || totalReadings < 5) ? 'not-allowed' : 'pointer', opacity: (training || totalReadings < 5) ? .5 : 1, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                {training ? 'Training…' : '🔄 Retrain now'}
              </button>
              {onReset && (
                <button onClick={onReset} disabled={!!training || totalReadings < 5} title="Discard current local model and train fresh"
                  style={{ background: 'white', color: '#B91C1C', border: '1.5px solid #FCA5A5', borderRadius: 99, padding: '.4rem 1rem', fontWeight: 700, fontSize: '.8rem', cursor: (training || totalReadings < 5) ? 'not-allowed' : 'pointer', opacity: (training || totalReadings < 5) ? .5 : 1, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  🗑️ Reset & retrain
                </button>
              )}
            </div>
          </div>
        )
      })()}

      <div style={{ background: statusInfo.bg, color: statusInfo.color, borderRadius: 8, padding: '.5rem .75rem', fontSize: '.85rem', marginBottom: '1rem' }}>
        {statusInfo.label || ''}
      </div>

      {!meta && totalReadings < 5 && (
        <div style={{ fontSize: '.85rem', color: '#6B7280', marginBottom: '1rem' }}>
          Training begins at 5 readings — {5 - totalReadings} more needed.
        </div>
      )}

      <div style={{ marginBottom: training ? '1rem' : 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', color: '#6B7280', marginBottom: '.35rem' }}>
          <span>Patient visibility ({BP_SHOW_THRESHOLD.samples} samples + MAE ≤{BP_SHOW_THRESHOLD.valMae} mmHg)</span>
          <span>{samples}/{BP_SHOW_THRESHOLD.samples}</span>
        </div>
        <div style={{ background: '#F3F4F6', borderRadius: 99, height: 6 }}>
          <div style={{ background: TEAL, height: 6, borderRadius: 99, width: `${patientPct}%`, transition: 'width .5s' }} />
        </div>
        {!training && totalReadings >= 30 && (
          <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: '.4rem' }}>Next auto-train at {nextAt} readings</div>
        )}
      </div>

      {training && (
        <div style={{ fontSize: '.8rem', color: '#6B7280', fontStyle: 'italic', marginTop: '.75rem' }}>{trainingStatus}</div>
      )}
    </div>
  )
}

function FitzpatrickAccuracyPanel({ readings, subjects }) {
  const subMap = Object.fromEntries(subjects.map(s => [s.id, s]))

  // Group readings by Fitzpatrick type
  const groups = {}
  for (const r of readings) {
    const sub = r.subject_id ? subMap[r.subject_id] : null
    const fitz = sub?.fitzpatrick_scale
    if (!fitz) continue
    if (!groups[fitz]) groups[fitz] = []
    groups[fitz].push(r)
  }

  const overallHRMAE = (() => {
    const valid = readings.filter(r => r.manual_hr && r.tere_hr)
    if (!valid.length) return null
    return valid.reduce((s, r) => s + Math.abs(r.manual_hr - r.tere_hr), 0) / valid.length
  })()

  const rows = [1, 2, 3, 4, 5, 6].map(fitz => {
    const group = groups[fitz] || []
    const hrValid = group.filter(r => r.manual_hr && r.tere_hr)
    const hrMae = hrValid.length >= 3
      ? hrValid.reduce((s, r) => s + Math.abs(r.manual_hr - r.tere_hr), 0) / hrValid.length
      : null
    const bpValid = group.filter(r => r.manual_systolic && r.raw_rppg_signal?.bpPredSys)
    const bpMae = bpValid.length >= 3
      ? bpValid.reduce((s, r) => s + Math.abs((r.raw_rppg_signal.bpPredSys || 0) - r.manual_systolic), 0) / bpValid.length
      : null
    const flag = overallHRMAE && hrMae && hrMae > overallHRMAE * 1.5
    return { fitz, n: group.length, hrMae, bpMae, flag }
  })

  const hasSomeData = rows.some(r => r.n > 0)

  return (
    <div>
      <div style={{ fontSize: '.85rem', fontWeight: 600, color: NAVY, marginBottom: '.75rem' }}>
        HR accuracy by Fitzpatrick skin type
        <span style={{ fontWeight: 400, color: '#9CA3AF', marginLeft: '.5rem' }}>(≥3 readings required)</span>
      </div>
      {!hasSomeData ? (
        <div style={{ color: '#6B7280', fontSize: '.875rem', padding: '1.5rem 0', textAlign: 'center' }}>
          No readings with skin type assigned. Tag subjects with Fitzpatrick type to see breakdown.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          {rows.map(({ fitz, n, hrMae, bpMae, flag }) => (
            <div key={fitz} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.6rem .75rem', borderRadius: 10, background: flag ? '#FEF3C7' : '#F9FAFB', border: flag ? '1px solid #F59E0B' : '1px solid transparent' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: FITZ_COLORS[fitz - 1], flexShrink: 0, border: '2px solid rgba(0,0,0,.08)' }} />
              <div style={{ fontSize: '.82rem', color: '#6B7280', minWidth: 48 }}>Type {fitz}</div>
              <div style={{ fontSize: '.82rem', color: '#6B7280', minWidth: 60 }}>{n} readings</div>
              <div style={{ flex: 1, fontSize: '.85rem', fontWeight: 700, color: hrMae == null ? '#9CA3AF' : hrMae <= 5 ? '#10B981' : hrMae <= 10 ? '#F59E0B' : '#EF4444' }}>
                {hrMae != null ? `HR MAE ±${hrMae.toFixed(1)} bpm` : n < 3 ? `Need ${3 - n} more` : '—'}
              </div>
              {bpMae != null && (
                <div style={{ fontSize: '.82rem', color: bpMae <= 10 ? '#10B981' : '#F59E0B' }}>
                  BP ±{bpMae.toFixed(1)} mmHg
                </div>
              )}
              {flag && <div style={{ fontSize: '.75rem', color: '#92400E', fontWeight: 700 }}>⚠️ High error</div>}
            </div>
          ))}
          {overallHRMAE && (
            <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: '.5rem' }}>
              Overall HR MAE: ±{overallHRMAE.toFixed(1)} bpm · Flag threshold: &gt;1.5× overall
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BPRangeAccuracyPanel({ readings }) {
  const RANGES = [
    { label: 'Hypotension', key: 'hypo',  min: 0,   max: 89,  color: '#3B82F6' },
    { label: 'Normal',      key: 'normal', min: 90,  max: 129, color: '#10B981' },
    { label: 'Elevated',    key: 'elev',   min: 130, max: 139, color: '#F59E0B' },
    { label: 'Hypertension',key: 'htn',   min: 140, max: 999, color: '#EF4444' },
  ]

  const groups = Object.fromEntries(RANGES.map(r => [r.key, []]))
  for (const reading of readings) {
    const sys = reading.manual_systolic
    if (!sys) continue
    const range = RANGES.find(r => sys >= r.min && sys <= r.max)
    if (range) groups[range.key].push(reading)
  }

  return (
    <div>
      <div style={{ fontSize: '.85rem', fontWeight: 600, color: NAVY, marginBottom: '.75rem' }}>
        Readings by BP category
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        {RANGES.map(range => {
          const group = groups[range.key]
          const n = group.length
          const total = readings.filter(r => r.manual_systolic).length
          const pct = total ? Math.round((n / total) * 100) : 0
          const bpValid = group.filter(r => r.raw_rppg_signal?.bpPredSys && r.manual_systolic)
          const bpMae = bpValid.length >= 2
            ? (bpValid.reduce((s, r) => s + Math.abs((r.raw_rppg_signal.bpPredSys || 0) - r.manual_systolic), 0) / bpValid.length).toFixed(1)
            : null
          return (
            <div key={range.key} style={{ padding: '.6rem .75rem', borderRadius: 10, background: '#F9FAFB', border: `1px solid ${range.color}30` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.35rem' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: range.color, flexShrink: 0 }} />
                <div style={{ fontSize: '.85rem', fontWeight: 700, color: NAVY, flex: 1 }}>{range.label}</div>
                <div style={{ fontSize: '.8rem', color: '#6B7280' }}>{n} readings ({pct}%)</div>
                {bpMae && (
                  <div style={{ fontSize: '.8rem', fontWeight: 700, color: parseFloat(bpMae) <= 10 ? '#10B981' : '#F59E0B' }}>
                    ±{bpMae} mmHg
                  </div>
                )}
              </div>
              <div style={{ background: '#E5E7EB', borderRadius: 99, height: 5 }}>
                <div style={{ background: range.color, height: 5, borderRadius: 99, width: `${pct}%`, transition: 'width .5s' }} />
              </div>
              <div style={{ fontSize: '.72rem', color: '#9CA3AF', marginTop: '.25rem' }}>
                {range.min}–{range.max === 999 ? '∞' : range.max} mmHg systolic
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ClinicalGradePanel({ readings, bpPreds }) {
  const n = readings.length
  const nWithBP = readings.filter(r => r.manual_systolic && r.manual_diastolic).length
  const hrValid = readings.filter(r => r.manual_hr && r.tere_hr)
  const hrMae = hrValid.length
    ? hrValid.reduce((s, r) => s + Math.abs(r.manual_hr - r.tere_hr), 0) / hrValid.length
    : null

  const bpStats = computeBPStats(bpPreds)

  const checks = [
    {
      category: 'Dataset size',
      standard: 'ISO 81060-2 requires ≥85 subjects, ≥3 readings each',
      current: `${n} readings`,
      pass: n >= 255,
      tip: n < 255 ? `Need ${255 - n} more readings across ≥85 subjects` : null,
    },
    {
      category: 'HR accuracy',
      standard: 'BHS Grade A: ≥60% within ±5 bpm, ≥85% within ±10 bpm',
      current: hrMae != null ? `MAE ±${hrMae.toFixed(1)} bpm (${hrValid.length} pairs)` : 'No HR data',
      pass: hrMae != null && hrMae <= 5,
      tip: hrMae != null && hrMae > 5 ? 'Improve face positioning, lighting, and signal quality' : null,
    },
    {
      category: 'BP systolic accuracy',
      standard: 'AAMI / BHS Grade A: MAE ≤5 mmHg',
      current: bpStats ? `MAE ±${bpStats.sysMae} mmHg (${bpStats.n} pairs)` : 'Run BP analysis first',
      pass: bpStats ? parseFloat(bpStats.sysMae) <= 5 : false,
      tip: bpStats && parseFloat(bpStats.sysMae) > 5 ? 'Collect more diverse BP ranges to improve model' : null,
    },
    {
      category: 'BP diastolic accuracy',
      standard: 'AAMI / BHS Grade A: MAE ≤5 mmHg',
      current: bpStats ? `MAE ±${bpStats.diaMae} mmHg` : 'Run BP analysis first',
      pass: bpStats ? parseFloat(bpStats.diaMae) <= 5 : false,
      tip: null,
    },
    {
      category: 'Within ±10 mmHg',
      standard: 'ISO 81060-2: ≥85% of readings within ±10 mmHg',
      current: bpStats ? `${bpStats.within10Pct}% within ±10 mmHg` : 'Run BP analysis first',
      pass: bpStats ? bpStats.within10Pct >= 85 : false,
      tip: null,
    },
    {
      category: 'Skin tone diversity',
      standard: 'Fitzpatrick types I–VI all represented',
      current: (() => {
        const types = new Set(readings.map(r => r.raw_rppg_signal?.fitzpatrick).filter(Boolean))
        return `${types.size}/6 skin types covered`
      })(),
      pass: false,
      tip: 'Recruit subjects across all 6 Fitzpatrick types',
    },
  ]

  return (
    <div>
      <div style={{ fontSize: '.85rem', fontWeight: 600, color: NAVY, marginBottom: '.25rem' }}>Clinical validation requirements</div>
      <div style={{ fontSize: '.78rem', color: '#9CA3AF', marginBottom: '1rem' }}>ISO 81060-2 · AAMI SP10 · BHS Protocol</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
        {checks.map(({ category, standard, current, pass, tip }) => (
          <div key={category} style={{ padding: '.75rem', borderRadius: 10, background: pass ? '#F0FDF4' : '#F9FAFB', border: `1px solid ${pass ? '#BBF7D0' : '#E5E7EB'}` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem' }}>
              <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '.05rem' }}>{pass ? '✅' : '○'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '.85rem', fontWeight: 700, color: pass ? '#15803D' : NAVY, marginBottom: '.2rem' }}>{category}</div>
                <div style={{ fontSize: '.78rem', color: '#6B7280', marginBottom: '.2rem' }}>{standard}</div>
                <div style={{ fontSize: '.82rem', fontWeight: 600, color: pass ? '#15803D' : '#374151' }}>{current}</div>
                {tip && <div style={{ fontSize: '.75rem', color: '#92400E', marginTop: '.25rem' }}>→ {tip}</div>}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: '1rem', background: '#F9FAFB', borderRadius: 8, padding: '.6rem .75rem' }}>
        Note: rPPG screening is not a medical device under TGA/MEDSAFE regulations. Clinical grade targets are for research benchmarking only.
      </div>
    </div>
  )
}

function AfScreeningPanel({ readings }) {
  const flagged  = readings.filter(r => r.af_likelihood === 'moderate' || r.af_likelihood === 'high')
  const confirmed = flagged.filter(r => r.af_confirmed === true)
  const falsePos  = flagged.filter(r => r.af_confirmed === false)
  const unchecked = flagged.filter(r => r.af_confirmed === null || r.af_confirmed === undefined)
  const assessed  = confirmed.length + falsePos.length
  const fpRate    = assessed > 0 ? Math.round((falsePos.length / assessed) * 100) : null

  return (
    <div style={{ background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 1px 6px rgba(0,0,0,.05)', marginBottom: '1.25rem' }}>
      <div style={{ fontWeight: 700, color: NAVY, marginBottom: '.25rem', fontSize: '.95rem' }}>AF screening results</div>
      <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginBottom: '1rem' }}>HRV pattern analysis (RMSSD/pNN50/cvRR tri-gate)</div>
      {readings.length === 0 ? (
        <div style={{ color: '#6B7280', fontSize: '.875rem' }}>No readings yet.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.75rem', textAlign: 'center' }}>
          {[
            { label: 'Flagged', value: `${flagged.length}/${readings.length}`, color: flagged.length > 0 ? '#F59E0B' : '#10B981' },
            { label: 'Confirmed AF', value: confirmed.length, sub: 'irregular rhythm', color: confirmed.length > 0 ? '#EF4444' : '#6B7280' },
            { label: 'False positive', value: falsePos.length, sub: 'normal on check', color: '#10B981' },
            { label: 'FP rate', value: fpRate != null ? `${fpRate}%` : '—', sub: fpRate != null ? `${assessed} assessed` : 'need assessments', color: fpRate != null && fpRate > 20 ? '#F59E0B' : '#10B981' },
          ].map(({ label, value, sub, color }) => (
            <div key={label} style={{ background: '#F9FAFB', borderRadius: 12, padding: '.75rem' }}>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', color }}>{value}</div>
              <div style={{ fontSize: '.7rem', color: '#6B7280', marginTop: '.2rem' }}>{label}</div>
              {sub && <div style={{ fontSize: '.68rem', color: '#9CA3AF', marginTop: '.15rem' }}>{sub}</div>}
            </div>
          ))}
        </div>
      )}
      {flagged.length > 0 && unchecked.length > 0 && (
        <div style={{ marginTop: '.75rem', background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 8, padding: '.6rem .75rem', fontSize: '.78rem', color: '#92400E' }}>
          ⚠️ {unchecked.length} flagged reading{unchecked.length !== 1 ? 's' : ''} not yet assessed — confirm with pulse or Apple Watch at next scan.
        </div>
      )}
    </div>
  )
}

function Spo2CalibrationPanel({ readings, onReprocess, reprocessing, reprocessStatus }) {
  const MIN_PAIRED = 10
  const paired = readings.filter(r => r.manual_spo2 != null && r.tere_spo2 != null)
  const mae    = paired.length
    ? (paired.reduce((s, r) => s + Math.abs(r.tere_spo2 - r.manual_spo2), 0) / paired.length).toFixed(1)
    : null

  const withRaw = readings.filter(r => r.raw_rppg_signal?.frames?.length)

  const status = paired.length === 0 ? 'none'
    : paired.length < 5  ? 'minimal'
    : paired.length < MIN_PAIRED ? 'building'
    : parseFloat(mae) <= 2 ? 'calibrated'
    : 'needs_improvement'

  const { label: statusLabel, bg, border, color: statusColor } = {
    none:             { label: 'No paired readings yet — enter SpO2 from a pulse oximeter during validation scans', bg: '#F9FAFB', border: '#E5E7EB', color: '#6B7280' },
    minimal:          { label: `Only ${paired.length} paired reading${paired.length !== 1 ? 's' : ''} — need at least 5 to compute MAE`, bg: '#FEF3C7', border: '#F59E0B', color: '#92400E' },
    building:         { label: `Building — ${MIN_PAIRED - paired.length} more paired readings needed for full calibration`, bg: '#FEF3C7', border: '#F59E0B', color: '#92400E' },
    calibrated:       { label: '✓ Well calibrated — camera SpO2 matches oximeter within ±2%', bg: '#D1FAE5', border: '#10B981', color: '#065F46' },
    needs_improvement:{ label: `Sufficient data but MAE ±${mae}% exceeds ±2% target — collect more readings across SpO2 range`, bg: '#FEF3C7', border: '#F59E0B', color: '#92400E' },
  }[status]

  return (
    <div style={{ background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 1px 6px rgba(0,0,0,.05)', marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '.25rem' }}>
        <div style={{ fontWeight: 700, color: NAVY, fontSize: '.95rem' }}>SpO2 calibration status</div>
        {withRaw.length > 0 && (
          <button onClick={onReprocess} disabled={reprocessing}
            style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 99, padding: '.4rem 1rem', fontWeight: 700, fontSize: '.8rem', cursor: reprocessing ? 'not-allowed' : 'pointer', opacity: reprocessing ? .5 : 1, fontFamily: 'Plus Jakarta Sans, sans-serif', whiteSpace: 'nowrap' }}>
            {reprocessing ? 'Reprocessing…' : '🔄 Reprocess all'}
          </button>
        )}
      </div>
      <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginBottom: '1rem' }}>Camera SpO2 vs pulse oximeter ground truth</div>
      {reprocessStatus && (
        <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '.5rem .75rem', fontSize: '.78rem', color: '#1E40AF', marginBottom: '.75rem' }}>
          {reprocessStatus}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '.75rem', textAlign: 'center', marginBottom: '.75rem' }}>
        {[
          { label: 'Paired readings', value: `${paired.length}/${MIN_PAIRED}`, color: paired.length >= MIN_PAIRED ? '#10B981' : paired.length >= 5 ? '#F59E0B' : '#EF4444' },
          { label: 'Current MAE', value: mae != null ? `±${mae}%` : '—', color: mae != null ? (parseFloat(mae) <= 2 ? '#10B981' : parseFloat(mae) <= 4 ? '#F59E0B' : '#EF4444') : '#6B7280' },
          { label: 'Target MAE', value: '±2%', color: '#6B7280' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#F9FAFB', borderRadius: 12, padding: '.75rem' }}>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color }}>{value}</div>
            <div style={{ fontSize: '.7rem', color: '#6B7280', marginTop: '.2rem' }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '.6rem .75rem', fontSize: '.78rem', color: statusColor }}>
        {statusLabel}
      </div>
    </div>
  )
}

export default function VitalsValidateDashboard() {
  const navigate = useNavigate()
  // `null` = still checking, `false` = redirecting to login, `true` = active session.
  const [authed, setAuthed]       = useState(null)

  useEffect(() => {
    let cancelled = false
    const goLogin = () => navigate('/clinician?redirect=/vitals-validate/dashboard', { replace: true })
    // Accept either the PIN clinician login (sessionStorage) or a Supabase session.
    const hasClinicianSession = () => {
      try { return sessionStorage.getItem('clinicianAuth') === 'true' && !!sessionStorage.getItem('providerId') }
      catch { return false }
    }
    if (hasClinicianSession()) { setAuthed(true); return }
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (data?.session || hasClinicianSession()) setAuthed(true)
      else { setAuthed(false); goLogin() }
    }).catch(() => { if (!cancelled) { hasClinicianSession() ? setAuthed(true) : (setAuthed(false), goLogin()) } })
    return () => { cancelled = true }
  }, [navigate])

  const [readings, setReadings]   = useState([])
  const [subjects, setSubjects]   = useState([])
  const [modelVersions, setModelVersions] = useState([])
  const [loading, setLoading]     = useState(false)
  const [loadError, setLoadError] = useState(null)  // { message, isRateLimit } — distinguish 429 from real empty
  const [tab, setTab]             = useState('readings')
  const [filterSubject, setFilterSubject] = useState('')
  const [training, setTraining]         = useState(false)
  const [trainingStatus, setTrainingStatus] = useState('')
  const [reprocessing, setReprocessing] = useState(false)
  const [reprocessStatus, setReprocessStatus] = useState('')
  const [reprocessingHr, setReprocessingHr] = useState(false)
  const [reprocessHrStatus, setReprocessHrStatus] = useState('')
  // v3-rerun predictions keyed by reading id, for the Readings-tab comparison
  // column. Computed in the background after readings load so the table paints
  // fast and v3 numbers trickle in. Uses the currently-promoted server model
  // (same as live /vitals) so the column shows what prod would say now.
  const [v3Rerun, setV3Rerun] = useState({})
  const [v3RerunStatus, setV3RerunStatus] = useState('')
  // ME-rPPG DL replay — per-row running state + bulk-replay progress label.
  const [meRunning, setMeRunning] = useState({})
  const [meBatchStatus, setMeBatchStatus] = useState('')
  useEffect(() => {
    if (!readings.length) return
    let cancelled = false
    async function run() {
      setV3RerunStatus('loading model…')
      try {
        const [{ loadActiveV3ModelFromServer, predictV3FromFrames }] = await Promise.all([
          import('../../lib/bpModelV3'),
        ])
        const model = await loadActiveV3ModelFromServer()
        if (cancelled) return
        if (!model) { setV3RerunStatus('no v3 model promoted'); return }
        const subMap = Object.fromEntries(subjects.map(s => [s.id, s]))
        const withFrames = readings.filter(r => r.raw_rppg_signal?.frames?.length)
        setV3RerunStatus(`predicting ${withFrames.length}…`)
        const out = {}
        for (let i = 0; i < withFrames.length; i++) {
          if (cancelled) return
          const r = withFrames[i]
          const sub = r.subject_id ? subMap[r.subject_id] : {}
          const fps = r.raw_rppg_signal?.fps || 30
          if (i % 10 === 0) await new Promise(res => setTimeout(res, 0))
          try {
            const pred = predictV3FromFrames(model, r.raw_rppg_signal.frames, fps, sub)
            if (pred && !pred.skipped) out[r.id] = { sys: pred.systolic, dia: pred.diastolic }
            else out[r.id] = { skipped: true, reason: pred?.reason }
          } catch { out[r.id] = { skipped: true, reason: 'error' } }
        }
        if (!cancelled) {
          setV3Rerun(out)
          setV3RerunStatus(`done · ${Object.values(out).filter(v => !v.skipped).length}/${withFrames.length} predicted`)
        }
      } catch (e) {
        if (!cancelled) setV3RerunStatus(`load failed: ${e.message || e}`)
      }
    }
    run()
    return () => { cancelled = true }
  }, [readings, subjects])

  const loadData = useCallback(() => {
    setLoading(true); setLoadError(null)
    return Promise.all([getValidationReadings(), getValidationSubjects(), getModelVersions()])
      .then(([r, s, mv]) => { setReadings(r); setSubjects(s); setModelVersions(mv) })
      .catch(e => {
        const msg = e?.message || String(e)
        console.error('[Dashboard] load error:', msg)
        // Detect 429 explicitly so the UI can show "rate limited, not empty".
        const isRateLimit = /429|too many requests/i.test(msg)
        setLoadError({ message: msg, isRateLimit })
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (authed !== true) return
    loadData()
  }, [authed, loadData])

  const handleTrain = useCallback(async () => {
    setTraining(true); setTrainingStatus('Fetching training data…')
    try {
      const trainable = await getTrainableReadings()
      if (trainable.length < 5) { setTrainingStatus('Not enough data (need 5 readings with raw signal)'); return }
      setTrainingStatus(`Training on ${trainable.length} readings…`)
      const result = await trainModel(trainable, (done, total, info) => {
        const pct = Math.round(done / total * 100)
        setTrainingStatus(`${info?.label || 'Training'}… ${pct}%`)
      })
      if (result) {
        const sysStr = result.valMaeSys != null ? ` sys ±${result.valMaeSys.toFixed(1)}` : ''
        const diaStr = result.valMaeDia != null ? ` dia ±${result.valMaeDia.toFixed(1)}` : ''
        setTrainingStatus(`✓ Trained: ${result.version} · ${result.samples} samples ·${sysStr}${diaStr} mmHg · just now`)
        const mv = await getModelVersions()
        setModelVersions(mv)
      } else {
        // trainModel returns null when it can't proceed — most commonly when
        // fewer than 5 readings survive filterQualityReadings() + feature
        // extraction (missing raw_rppg_signal, implausible BP, or feature
        // extraction errors). Previously this failure was silent; the button
        // spinner stopped but nothing on-screen said the train didn't happen.
        setTrainingStatus('Training did not run — fewer than 5 readings have usable raw signal + valid cuff BP. Check the readings table for missing raw_rppg_signal or implausible values.')
      }
      // Also refit SpO2 calibration from all paired readings
      const allReadings = await getValidationReadings()
      const pairs = allReadings
        .filter(r => r.tere_spo2 != null && r.manual_spo2 != null)
        .map(r => ({ estimated: r.tere_spo2, reference: r.manual_spo2 }))
      if (pairs.length >= 5) fitSpO2Calibration(pairs)
    } catch (e) {
      setTrainingStatus('Training failed: ' + e.message)
    } finally {
      setTraining(false)
    }
  }, [])

  const handleResetAndTrain = useCallback(async () => {
    if (training) return
    if (!window.confirm('This will discard the existing local BP model weights and train a fresh model from all readings. Continue?')) return
    setTraining(true)
    setTrainingStatus('Clearing local model…')
    try { await resetLocalModel() } catch {}
    setTraining(false)
    handleTrain()
  }, [training, handleTrain])

  const handleReprocessHrRr = useCallback(async () => {
    if (reprocessingHr) return
    if (!window.confirm('This will re-derive Tere HR & RR from stored raw frames for every reading, using the current rPPG pipeline (post-fix). Cuff/manual values are not touched. Continue?')) return
    setReprocessingHr(true)
    setReprocessHrStatus('Loading readings…')
    try {
      const all = await getValidationReadings()
      const withRaw = all.filter(r => r.raw_rppg_signal?.frames?.length)
      let updated = 0, nullResult = 0, failed = 0, noRaw = all.length - withRaw.length
      for (let i = 0; i < withRaw.length; i++) {
        const r = withRaw[i]
        setReprocessHrStatus(`Reprocessing ${i + 1}/${withRaw.length} (updated ${updated}, null ${nullResult}, failed ${failed})…`)
        try {
          const fps = r.raw_rppg_signal.fps || 30
          const result = processStoredFramesMultiPass(r.raw_rppg_signal.frames, fps)
          if (result) {
            // Force overwrite — the latest WinConsensus algorithm should fully
            // replace any prior artifact values left over from older runs.
            const newQuality = result.hr != null ? 'extracted' : 'no_signal'
            await updateValidationHrRr(r.id, result.hr ?? null, result.rr ?? null, r.manual_hr ?? null, { forceOverwrite: true, hrQuality: newQuality })
            if (result.hr == null && result.rr == null) nullResult++
            else updated++
          } else { nullResult++ }
        } catch (e) { console.warn('[reprocess HR/RR] failed for', r.id, e.message); failed++ }
        // Yield to UI every few iterations so the browser stays responsive
        if (i % 3 === 2) await new Promise(res => setTimeout(res, 0))
      }
      const fresh = await getValidationReadings()
      setReadings(fresh)
      setReprocessHrStatus(`Done — updated ${updated}, null ${nullResult}, no raw signal ${noRaw}${failed ? `, failed ${failed}` : ''}.`)
    } catch (e) {
      setReprocessHrStatus('Failed: ' + e.message)
    } finally {
      setReprocessingHr(false)
    }
  }, [reprocessingHr])

  const handleReprocessSpo2 = useCallback(async () => {
    setReprocessing(true)
    setReprocessStatus('Loading readings with raw signal…')
    try {
      const { calculateSpO2 } = await import('../../lib/spo2')
      const allReadings = await getValidationReadings()
      const withRaw = allReadings.filter(r => r.raw_rppg_signal?.frames?.length)
      setReprocessStatus(`Reprocessing ${withRaw.length} readings with 3-channel algorithm…`)

      let updated = 0, failed = 0
      for (const r of withRaw) {
        try {
          const fitz = r.validation_subjects?.fitzpatrick_scale ?? 2
          const result = calculateSpO2(r.raw_rppg_signal.frames, fitz)
          if (result) {
            await updateValidationSpo2(r.id, result.estimate)
            updated++
          } else {
            failed++
          }
        } catch { failed++ }
      }

      // Reload readings and refit calibration
      const fresh = await getValidationReadings()
      setReadings(fresh)
      const pairs = fresh
        .filter(r => r.tere_spo2 != null && r.manual_spo2 != null)
        .map(r => ({ estimated: r.tere_spo2, reference: r.manual_spo2 }))
      if (pairs.length >= 5) fitSpO2Calibration(pairs)

      setReprocessStatus(`Done — updated ${updated} readings${failed ? `, ${failed} no signal` : ''}. Calibration refitted.`)
    } catch (e) {
      setReprocessStatus('Failed: ' + e.message)
    } finally {
      setReprocessing(false)
    }
  }, [])

  const wrap = (children) => (
    <div style={{ minHeight: '100dvh', background: BG, fontFamily: 'Plus Jakarta Sans, sans-serif', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '1.5rem' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'white', fontSize: '1.1rem', fontWeight: 900 }}>V</span>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: NAVY, fontSize: '1.05rem' }}>Vitals Validation Dashboard</div>
            <div style={{ fontSize: '.75rem', color: '#6B7280' }}>Clinical data collection</div>
          </div>
          <Link to="/rppg-replay" style={{ marginLeft: 'auto', fontSize: '.85rem', color: NAVY, fontWeight: 600, textDecoration: 'none', background: 'white', border: '1.5px solid #E5E7EB', borderRadius: 99, padding: '.4rem 1rem' }}>
            rPPG replay
          </Link>
          <Link to="/vitals-validate" style={{ fontSize: '.85rem', color: TEAL, fontWeight: 700, textDecoration: 'none', background: TEAL + '15', borderRadius: 99, padding: '.4rem 1rem' }}>
            + New reading
          </Link>
        </div>
        {children}
      </div>
    </div>
  )

  // While the auth check is pending or a redirect is in flight, render nothing.
  if (authed !== true) return null

  const mae         = computeHRMAE(readings)
  const milestone   = getMilestone(readings.length)
  const oldest      = readings.length ? readings[readings.length - 1] : null
  const daysActive  = oldest ? Math.max(1, Math.ceil((Date.now() - new Date(oldest.recorded_at).getTime()) / 86400000)) : 0

  return wrap(
    <>
      {/* Load error banner — distinguishes 429 / auth / network failure
          from a genuinely empty dataset, which used to render identically. */}
      {loadError && (
        <div style={{
          background: loadError.isRateLimit ? '#FEF3C7' : '#FEE2E2',
          border: `1px solid ${loadError.isRateLimit ? '#FDE68A' : '#FCA5A5'}`,
          color: loadError.isRateLimit ? '#78350F' : '#991B1B',
          borderRadius: 12,
          padding: '.75rem 1rem',
          marginBottom: '1rem',
          fontSize: '.875rem',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          display: 'flex',
          alignItems: 'center',
          gap: '.75rem',
          justifyContent: 'space-between',
        }}>
          <div>
            <strong>{loadError.isRateLimit ? '⏳ Rate limited' : '⚠️ Failed to load'}</strong>
            <div style={{ fontSize: '.8125rem', opacity: .85, marginTop: 2 }}>
              {loadError.isRateLimit
                ? 'Too many requests from this IP in the last 15 minutes. Data below may be stale or empty — this is not the real state. Retry in a few minutes.'
                : `The dashboard could not load its data (${loadError.message}). The values below may be incomplete.`}
            </div>
          </div>
          <button onClick={loadData} disabled={loading}
            style={{ background: 'white', border: '1px solid currentColor', borderRadius: 8, padding: '6px 12px', fontWeight: 700, fontSize: '.8125rem', cursor: loading ? 'wait' : 'pointer', color: 'inherit', fontFamily: 'Plus Jakarta Sans, sans-serif', flexShrink: 0 }}>
            {loading ? '…' : 'Retry'}
          </button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.75rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'Readings',    value: readings.length, sub: `${milestone.emoji} ${milestone.label}` },
          { label: 'Subjects',    value: subjects.length,  sub: '' },
          { label: 'HR MAE',      value: mae ? `${mae} bpm` : '—', sub: 'mean abs error' },
          { label: 'Days active', value: daysActive || '—', sub: '' },
        ].map(({ label, value, sub }) => (
          <div key={label} style={{ background: 'white', borderRadius: 14, padding: '1rem', boxShadow: '0 1px 6px rgba(0,0,0,.05)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: NAVY }}>{value}</div>
            <div style={{ fontSize: '.75rem', fontWeight: 600, color: '#6B7280' }}>{label}</div>
            {sub && <div style={{ fontSize: '.7rem', color: '#9CA3AF', marginTop: '.2rem' }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* BP Model panel */}
      <ModelPanel
        readings={readings} modelVersions={modelVersions}
        training={training} trainingStatus={trainingStatus}
        onTrain={handleTrain} onReset={handleResetAndTrain}
      />

      {/* Data collection targets */}
      {(() => {
        const BP_RANGES = [
          { label: 'Hypotension', range: '<90 sys',    min: 0,   max: 89,  target: 15 },
          { label: 'Low normal',  range: '90–109 sys', min: 90,  max: 109, target: 15 },
          { label: 'Normal',      range: '110–129 sys',min: 110, max: 129, target: 15 },
          { label: 'Elevated',    range: '130–139 sys',min: 130, max: 139, target: 15 },
          { label: 'Hypertension',range: '≥140 sys',   min: 140, max: 999, target: 15 },
        ]
        const withSys = readings.filter(r => r.manual_systolic)
        const rangeCounts = BP_RANGES.map(r => ({
          ...r,
          count: withSys.filter(rd => rd.manual_systolic >= r.min && rd.manual_systolic <= r.max).length,
        }))
        const anyGap = rangeCounts.some(r => r.count < 5)

        // Subject concentration
        const subjectCounts = {}
        for (const r of readings) {
          if (r.subject_code) subjectCounts[r.subject_code] = (subjectCounts[r.subject_code] || 0) + 1
        }
        const topSubject = Object.entries(subjectCounts).sort((a, b) => b[1] - a[1])[0]
        const topPct = readings.length ? Math.round((topSubject?.[1] || 0) / readings.length * 100) : 0
        const skewed = topPct >= 50 && readings.length >= 5

        return (
          <div style={{ background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 1px 6px rgba(0,0,0,.05)', marginBottom: '1.25rem' }}>
            <div style={{ fontWeight: 700, color: NAVY, marginBottom: '.25rem', fontSize: '.95rem' }}>Data collection targets</div>
            <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginBottom: '1rem' }}>Need readings in all BP ranges for clinical validation (ISO 81060-2)</div>

            {/* BP range coverage */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', marginBottom: '1.25rem' }}>
              {rangeCounts.map(({ label, range, count, target }) => {
                const color = count === 0 ? '#EF4444' : count < 5 ? '#F59E0B' : '#10B981'
                const pct = Math.min(100, Math.round(count / target * 100))
                return (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                    <div style={{ width: 90, fontSize: '.78rem', fontWeight: 600, color: NAVY, flexShrink: 0 }}>{label}</div>
                    <div style={{ flex: 1, background: '#F3F4F6', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                      <div style={{ background: color, height: 8, borderRadius: 99, width: `${pct}%`, transition: 'width .5s' }} />
                    </div>
                    <div style={{ width: 48, fontSize: '.78rem', fontWeight: 700, color, textAlign: 'right', flexShrink: 0 }}>
                      {count}/{target}
                    </div>
                    <div style={{ width: 70, fontSize: '.72rem', color: '#9CA3AF', flexShrink: 0 }}>{range}</div>
                    {count === 0 && <span style={{ fontSize: '.8rem' }}>⚠️</span>}
                  </div>
                )
              })}
            </div>

            {/* Subject diversity */}
            <div style={{ fontSize: '.8rem', fontWeight: 600, color: NAVY, marginBottom: '.5rem' }}>
              Subject diversity — need ≥85 for ISO 81060-2
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.4rem' }}>
              <div style={{ flex: 1, background: '#F3F4F6', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                <div style={{ background: subjects.length >= 85 ? '#10B981' : subjects.length >= 30 ? '#F59E0B' : '#EF4444', height: 8, borderRadius: 99, width: `${Math.min(100, Math.round(subjects.length / 85 * 100))}%`, transition: 'width .5s' }} />
              </div>
              <div style={{ fontSize: '.82rem', fontWeight: 700, color: subjects.length >= 85 ? '#10B981' : '#EF4444', flexShrink: 0 }}>
                {subjects.length}/85
              </div>
            </div>

            {skewed && (
              <div style={{ background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 8, padding: '.6rem .75rem', fontSize: '.78rem', color: '#92400E' }}>
                ⚠️ Most readings from one subject: <strong>{topSubject[0]}</strong> {topSubject[1]}/{readings.length} ({topPct}%) — prioritise recruiting new subjects over more readings from existing ones.
              </div>
            )}
          </div>
        )
      })()}

      {/* Reprocess from stored raw signal */}
      <div style={{ background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 1px 6px rgba(0,0,0,.05)', marginBottom: '1.25rem' }}>
        <div style={{ fontWeight: 700, color: NAVY, fontSize: '.95rem', marginBottom: '.5rem' }}>Reprocess from stored raw signal</div>
        <div style={{ fontSize: '.85rem', color: '#6B7280', marginBottom: '.85rem', lineHeight: 1.45 }}>
          Re-derive Tere HR &amp; RR for every reading using the current rPPG pipeline. Use after fixing a signal-processing bug to refresh historical numbers in place (rather than waiting for new readings).
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button onClick={handleReprocessHrRr} disabled={!!reprocessingHr || !readings.length}
            style={{ background: 'white', color: '#0B6E76', border: '1.5px solid #0B6E76', borderRadius: 99, padding: '.4rem 1rem', fontWeight: 700, fontSize: '.8rem', cursor: (reprocessingHr || !readings.length) ? 'not-allowed' : 'pointer', opacity: (reprocessingHr || !readings.length) ? .5 : 1, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {reprocessingHr ? 'Reprocessing HR/RR…' : '🔁 Reprocess HR & RR'}
          </button>
        </div>
        {reprocessHrStatus && (
          <div style={{ fontSize: '.8rem', color: '#6B7280', fontStyle: 'italic', marginTop: '.6rem' }}>{reprocessHrStatus}</div>
        )}
      </div>

      {/* Skin tone gap warning */}
      <SkinToneGapPanel readings={readings} subjects={subjects} />

      {/* Diversity tracker */}
      <div style={{ background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 1px 6px rgba(0,0,0,.05)', marginBottom: '1.25rem' }}>
        <div style={{ fontWeight: 700, color: NAVY, marginBottom: '1rem', fontSize: '.95rem' }}>Subject diversity</div>
        <DiversityTracker subjects={subjects} />
      </div>

      {/* AF screening panel */}
      <AfScreeningPanel readings={readings} />

      {/* SpO2 calibration panel */}
      <Spo2CalibrationPanel readings={readings} onReprocess={handleReprocessSpo2} reprocessing={reprocessing} reprocessStatus={reprocessStatus} />

      {/* Tabs */}
      <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 1px 6px rgba(0,0,0,.05)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1.5px solid #F3F4F6', alignItems: 'center', overflowX: 'auto' }}>
          {[['readings', 'Readings'], ['bp', 'BP Analysis'], ['accuracy', 'Accuracy'], ['clinical', 'Clinical grade'], ['subjects', 'Subjects'], ['chart', 'HR Chart'], ['model', 'Model history']].map(([id, lbl]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: '.85rem 1.1rem', fontWeight: 700, fontSize: '.85rem', color: tab === id ? TEAL : '#6B7280',
              background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              borderBottom: tab === id ? `2px solid ${TEAL}` : '2px solid transparent',
              marginBottom: -1.5, fontFamily: 'Plus Jakarta Sans, sans-serif',
            }}>{lbl}</button>
          ))}
          <button onClick={() => exportCSV(readings, subjects)} style={{ marginLeft: 'auto', padding: '.85rem 1.1rem', background: 'none', border: 'none', color: TEAL, fontWeight: 700, fontSize: '.85rem', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', whiteSpace: 'nowrap' }}>
            Export CSV
          </button>
        </div>

        <div style={{ padding: '1.25rem', overflowX: 'auto' }}>
          {loading && <div style={{ textAlign: 'center', color: '#6B7280', padding: '3rem' }}>Loading…</div>}

          {!loading && tab === 'readings' && (
            readings.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#6B7280', padding: '2rem' }}>
                No readings yet. <Link to="/vitals-validate" style={{ color: TEAL, fontWeight: 600 }}>Take the first one →</Link>
              </div>
            ) : (() => {
              const subjectCodes = [...new Set(readings.map(r => r.subject_code).filter(Boolean))].sort()
              const filtered = filterSubject ? readings.filter(r => r.subject_code === filterSubject) : readings
              return (
              <>
                <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                  <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)}
                    style={{ border: '1.5px solid #E5E7EB', borderRadius: 8, padding: '.4rem .75rem', fontSize: '.85rem', fontFamily: 'Plus Jakarta Sans, sans-serif', color: NAVY, background: 'white', outline: 'none' }}>
                    <option value=''>All subjects ({readings.length})</option>
                    {subjectCodes.map(code => {
                      const sub = subjects.find(s => s.subject_code === code)
                      const name = sub ? ` — ${sub.first_name}` : ''
                      const count = readings.filter(r => r.subject_code === code).length
                      return <option key={code} value={code}>{code}{name} ({count})</option>
                    })}
                  </select>
                  {filterSubject && (
                    <button onClick={() => setFilterSubject('')}
                      style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: '.85rem', padding: 0 }}>
                      Clear
                    </button>
                  )}
                </div>
              {v3RerunStatus && (
                <div style={{ fontSize: '.72rem', color: '#6B7280', marginBottom: '.5rem' }}>v3 rerun — {v3RerunStatus}</div>
              )}
              {/* Batch ME-rPPG replay — iterates rows that have a stored video
                  but no DL prediction yet, decodes each video and backfills.
                  ~15s per video, sequential (parallel replays blow the ONNX
                  worker memory on phones). Patrick 2026-10-03 — the "we save
                  video, so use it" ask. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '.5rem' }}>
                <button
                  disabled={!!meBatchStatus}
                  onClick={async () => {
                    const todo = readings.filter(r => r.video_url && r.me_rppg_hr == null)
                    if (!todo.length) { alert('All readings with a stored video already have ME-rPPG predictions.'); return }
                    if (!window.confirm(`Replay ${todo.length} video${todo.length>1?'s':''} through ME-rPPG? Takes ~15s each (~${Math.ceil(todo.length*17/60)} min total).`)) return
                    setMeBatchStatus(`0/${todo.length}`)
                    const { replayVideoThroughMeRppg } = await import('../../lib/meRppgReplay')
                    let done = 0, failed = 0
                    for (const r of todo) {
                      setMeBatchStatus(`${done+1}/${todo.length}${failed ? ` (${failed} failed)` : ''}`)
                      try {
                        const out = await replayVideoThroughMeRppg(r.video_url)
                        await updateValidationMeRppg(r.id, { hr: out.hr, confidence: out.confidence, meanErr: out.meanErr })
                        setReadings(prev => prev.map(x => x.id === r.id ? { ...x, me_rppg_hr: out.hr, me_rppg_confidence: out.confidence, me_rppg_mean_err: out.meanErr } : x))
                        done++
                      } catch (e) {
                        console.warn(`[me-rppg batch] row ${r.id} failed:`, e?.message || e)
                        failed++
                      }
                    }
                    setMeBatchStatus('')
                    alert(`ME-rPPG batch replay complete: ${done} filled${failed ? `, ${failed} failed (check console)` : ''}.`)
                  }}
                  style={{ background: meBatchStatus ? '#F3F4F6' : 'white', color: '#3730A3', border: '1.5px solid #A5B4FC', borderRadius: 6, padding: '.3rem .7rem', fontSize: '.75rem', fontWeight: 700, cursor: meBatchStatus ? 'wait' : 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  {meBatchStatus ? `🧠 ME-rPPG batch — ${meBatchStatus}` : '🧠 Replay all missing ME-rPPG'}
                </button>
                <span style={{ fontSize: '.7rem', color: '#6B7280' }}>
                  {readings.filter(r => r.video_url && r.me_rppg_hr == null).length} row(s) with stored video need backfill
                </span>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                <thead>
                  <tr>
                    {['Date','Subject','Cuff BP','v3 BP','BP err','Manual HR','Tere HR','Diff','ME-HR','ME diff','PTT (ms)','RR','Conf %','Notes','Actions'].map(h => (
                      <th key={h} style={{ padding: '.5rem .75rem', textAlign: 'left', borderBottom: '1px solid #F3F4F6', color: '#6B7280', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const diff = r.hr_difference
                    const dc = diff == null ? '#6B7280' : diff <= 5 ? '#10B981' : diff <= 10 ? '#F59E0B' : '#EF4444'
                    const v3 = v3Rerun[r.id]
                    const v3Str = v3?.skipped ? `skip` : v3 ? `${v3.sys}/${v3.dia}` : '…'
                    const sysErr = v3 && !v3.skipped && r.manual_systolic ? v3.sys - r.manual_systolic : null
                    const sysErrAbs = sysErr != null ? Math.abs(sysErr) : null
                    const sysErrColor = sysErr == null ? '#9CA3AF' : sysErrAbs <= 5 ? '#10B981' : sysErrAbs <= 10 ? '#F59E0B' : '#EF4444'
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid #F9FAFB' }}>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280', whiteSpace: 'nowrap' }}>{new Date(r.recorded_at).toLocaleDateString()}</td>
                        <td style={{ padding: '.5rem .75rem', fontWeight: 700, color: TEAL }}>{r.subject_code || '—'}</td>
                        <td style={{ padding: '.5rem .75rem', color: NAVY }}>{r.manual_systolic && r.manual_diastolic ? `${r.manual_systolic}/${r.manual_diastolic}` : '—'}</td>
                        <td style={{ padding: '.5rem .75rem', color: v3?.skipped ? '#9CA3AF' : NAVY, fontStyle: v3?.skipped ? 'italic' : 'normal' }}>{v3Str}</td>
                        <td style={{ padding: '.5rem .75rem', fontWeight: 700, color: sysErrColor }}>{sysErr != null ? `${sysErr > 0 ? '+' : ''}${sysErr}` : '—'}</td>
                        <td style={{ padding: '.5rem .75rem', color: NAVY }}>{r.manual_hr ?? '—'}</td>
                        <td style={{ padding: '.5rem .75rem', color: NAVY }}>{r.tere_hr ?? '—'}</td>
                        <td style={{ padding: '.5rem .75rem', fontWeight: 700, color: dc }}>{diff != null ? `±${diff}` : '—'}</td>
                        {/* ME-rPPG DL parallel track — compare at a glance to the classical Diff.
                            Shows "—" for pre-2026-10-03 rows that pre-date the column. */}
                        <td style={{ padding: '.5rem .75rem', color: NAVY }}>{r.me_rppg_hr ?? '—'}</td>
                        {(() => {
                          const meDiff = (r.manual_hr && r.me_rppg_hr) ? Math.abs(r.manual_hr - r.me_rppg_hr) : null
                          const mc = meDiff == null ? '#6B7280' : meDiff <= 5 ? '#10B981' : meDiff <= 10 ? '#F59E0B' : '#EF4444'
                          return <td style={{ padding: '.5rem .75rem', fontWeight: 700, color: mc }}>{meDiff != null ? `±${meDiff}` : '—'}</td>
                        })()}
                        {/* Dual-ROI PTT (Qiu et al. ICMI'25). Shows mean ms ± std,
                            with order code: FF = face-first, PF = palm-first, MX = mixed.
                            Mean <20ms + low std + decent beat count = reliable signal. */}
                        {(() => {
                          if (r.palm_ptt_ms == null) return <td style={{ padding: '.5rem .75rem', color: '#9CA3AF' }}>—</td>
                          const code = r.palm_ptt_order === 'face_first' ? 'FF' : r.palm_ptt_order === 'palm_first' ? 'PF' : 'MX'
                          const stdOk = r.palm_ptt_std_ms != null && r.palm_ptt_std_ms < 30
                          return (
                            <td style={{ padding: '.5rem .75rem', color: stdOk ? NAVY : '#9CA3AF', fontWeight: stdOk ? 700 : 400 }} title={`${r.palm_ptt_beats || 0} beats matched, palm seen ${Math.round((r.palm_detect_rate || 0) * 100)}% of scan`}>
                              {r.palm_ptt_ms}±{r.palm_ptt_std_ms ?? '?'} <span style={{ fontSize: '.65rem', color: '#6B7280' }}>{code}</span>
                            </td>
                          )
                        })()}
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280' }}>{r.tere_rr ?? '—'}</td>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280' }}>{r.raw_rppg_signal?.numericConfidence ?? '—'}</td>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.notes || ''}>{r.notes || ''}</td>
                        <td style={{ padding: '.5rem .75rem', whiteSpace: 'nowrap', display: 'flex', gap: 6 }}>
                          {/* Per-row v3 re-eval (Patrick 2026-10-03). The dashboard
                              auto-reruns v3 for every reading on page load, but after
                              hitting the Retrain v3 button the cached v3Rerun is stale
                              until the user reloads. This button fetches the currently
                              promoted v3 model fresh and re-predicts just this one row,
                              writing back into v3Rerun[r.id] so the v3 column updates
                              in place. Doesn't touch DB — purely a "what would prod
                              say now" lookup. */}
                          <button
                            onClick={async () => {
                              if (!r.raw_rppg_signal?.frames?.length) {
                                alert('No stored rPPG frames for this reading — nothing to re-evaluate.')
                                return
                              }
                              try {
                                const { loadActiveV3ModelFromServer, predictV3FromFrames } = await import('../../lib/bpModelV3')
                                const model = await loadActiveV3ModelFromServer()
                                if (!model) { alert('No v3 model promoted on server yet.'); return }
                                const sub = r.subject_id ? (subjects.find(s => s.id === r.subject_id) || {}) : {}
                                const fps = r.raw_rppg_signal?.fps || 30
                                const pred = predictV3FromFrames(model, r.raw_rppg_signal.frames, fps, sub)
                                if (!pred || pred.skipped) {
                                  alert(`v3 skipped this row: ${pred?.reason || 'unknown'}`)
                                  return
                                }
                                setV3Rerun(prev => ({ ...prev, [r.id]: { sys: pred.systolic, dia: pred.diastolic } }))
                              } catch (e) {
                                alert(`Re-eval failed: ${e?.message || e}`)
                              }
                            }}
                            title="Re-run current v3 model against this reading's stored rPPG signal"
                            style={{ background: 'white', color: '#065F46', border: '1.5px solid #6EE7B7', borderRadius: 6, padding: '.25rem .55rem', fontSize: '.7rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                            🔄 Re-eval
                          </button>
                          {/* ME-rPPG DL replay (Patrick 2026-10-03). Needs the full
                              scan video — we store the WebM in scan-videos bucket with
                              a 5-year signed URL on video_url. Classical v3 above
                              re-uses the collapsed-mean-RGB rawFrames, but ME-rPPG
                              needs facial pixels so it HAS to re-decode the video.
                              15 sec of real-time inference per click (model plays
                              video back at 1x). On success, PATCHes me_rppg_hr/conf
                              and the ME-HR + ME diff columns update in-place next
                              reload. */}
                          <button
                            disabled={!!meRunning[r.id] || !r.video_url}
                            onClick={async () => {
                              if (!r.video_url) {
                                alert('No stored scan video — this reading pre-dates video capture.')
                                return
                              }
                              setMeRunning(prev => ({ ...prev, [r.id]: 'loading…' }))
                              try {
                                const { replayVideoThroughMeRppg } = await import('../../lib/meRppgReplay')
                                const out = await replayVideoThroughMeRppg(
                                  r.video_url,
                                  (pct) => setMeRunning(prev => ({ ...prev, [r.id]: `${pct}%` })),
                                )
                                await updateValidationMeRppg(r.id, { hr: out.hr, confidence: out.confidence, meanErr: out.meanErr })
                                setReadings(prev => prev.map(x => x.id === r.id ? { ...x, me_rppg_hr: out.hr, me_rppg_confidence: out.confidence, me_rppg_mean_err: out.meanErr } : x))
                                setMeRunning(prev => { const n = { ...prev }; delete n[r.id]; return n })
                              } catch (e) {
                                alert(`ME-rPPG replay failed: ${e?.message || e}`)
                                setMeRunning(prev => { const n = { ...prev }; delete n[r.id]; return n })
                              }
                            }}
                            title={r.video_url ? 'Replay stored scan video through ME-rPPG (takes ~15s)' : 'No stored video for this reading'}
                            style={{ background: 'white', color: r.video_url ? '#3730A3' : '#9CA3AF', border: `1.5px solid ${r.video_url ? '#A5B4FC' : '#E5E7EB'}`, borderRadius: 6, padding: '.25rem .55rem', fontSize: '.7rem', fontWeight: 700, cursor: r.video_url ? 'pointer' : 'not-allowed', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                            {meRunning[r.id] ? `🧠 ${meRunning[r.id]}` : '🧠 ME-rPPG'}
                          </button>
                          {/* Admin-only delete. Server guard requires provider auth;
                              dashboard is already provider-gated via /api/validation-
                              readings' guardProvider on PATCH/DELETE. Confirm dialog
                              shows the reading identifiers so you can't nuke the wrong
                              row by muscle memory. Optimistic row-filter — if the DELETE
                              fails the next getValidationReadings refresh restores it. */}
                          <button
                            onClick={async () => {
                              const label = `${r.subject_code || '?'} · ${new Date(r.recorded_at).toLocaleDateString()} · ${r.manual_systolic ?? '?'}/${r.manual_diastolic ?? '?'} · HR cuff ${r.manual_hr ?? '?'} vs tere ${r.tere_hr ?? '?'}`
                              if (!window.confirm(`Delete this reading permanently?\n\n${label}\n\nThis also removes it from future BP model retrains.`)) return
                              try {
                                await deleteValidationReading(r.id)
                                setReadings(prev => prev.filter(x => x.id !== r.id))
                              } catch (e) {
                                alert(`Delete failed: ${e?.message || e}`)
                              }
                            }}
                            title="Delete this reading (provider-only, audit-logged)"
                            style={{ background: 'white', color: '#B91C1C', border: '1.5px solid #FCA5A5', borderRadius: 6, padding: '.25rem .55rem', fontSize: '.7rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                            🗑️ Delete
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </>
              )
            })()
          )}

          {!loading && tab === 'bp' && (
            <BPAnalysisPanel readings={readings} subjects={subjects} />
          )}

          {!loading && tab === 'accuracy' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <FitzpatrickAccuracyPanel readings={readings} subjects={subjects} />
              <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '1.5rem' }}>
                <BPRangeAccuracyPanel readings={readings} />
              </div>
            </div>
          )}

          {!loading && tab === 'clinical' && (
            <ClinicalGradePanel readings={readings} bpPreds={[]} />
          )}

          {!loading && tab === 'subjects' && (
            subjects.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#6B7280', padding: '2rem' }}>No subjects yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                <thead>
                  <tr>
                    {['Code','Name','Age','Sex','Skin','HTN','DM','Share'].map(h => (
                      <th key={h} style={{ padding: '.5rem .75rem', textAlign: 'left', borderBottom: '1px solid #F3F4F6', color: '#6B7280', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subjects.map(s => {
                    const shareUrl = `${window.location.origin}/vitals-validate?subject=${s.subject_code}`
                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid #F9FAFB' }}>
                        <td style={{ padding: '.5rem .75rem', fontWeight: 700, color: TEAL }}>{s.subject_code}</td>
                        <td style={{ padding: '.5rem .75rem', color: NAVY }}>{s.first_name}</td>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280' }}>{s.age ?? '—'}</td>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280' }}>{s.sex || '—'}</td>
                        <td style={{ padding: '.5rem .75rem' }}>
                          {s.fitzpatrick_scale
                            ? <div style={{ width: 20, height: 20, borderRadius: '50%', background: FITZ_COLORS[s.fitzpatrick_scale - 1] }} />
                            : <span style={{ color: '#9CA3AF' }}>—</span>}
                        </td>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280' }}>{s.has_hypertension || '—'}</td>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280' }}>{s.has_diabetes || '—'}</td>
                        <td style={{ padding: '.5rem .75rem' }}>
                          <button onClick={() => navigator.clipboard.writeText(shareUrl)}
                            style={{ background: 'none', border: 'none', color: TEAL, fontWeight: 700, cursor: 'pointer', fontSize: '.8rem', padding: 0 }}>
                            Copy
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          )}

          {!loading && tab === 'chart' && <HRChart readings={readings} />}

          {!loading && tab === 'model' && (
            modelVersions.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#6B7280', padding: '2rem' }}>
                No model versions yet. Collect 5+ readings with raw signal and click Train now.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                <thead>
                  <tr>
                    {['Version','Samples','Loss','MAE (train)','MAE sys','MAE dia','Trained at'].map(h => (
                      <th key={h} style={{ padding: '.5rem .75rem', textAlign: 'left', borderBottom: '1px solid #F3F4F6', color: '#6B7280', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modelVersions.map((mv, i) => {
                    const maeColor = mv.val_mae == null ? '#6B7280' : mv.val_mae <= 10 ? '#10B981' : mv.val_mae <= 15 ? '#F59E0B' : '#EF4444'
                    return (
                      <tr key={mv.id} style={{ borderBottom: '1px solid #F9FAFB', background: i === 0 ? '#FAFFF9' : 'transparent' }}>
                        <td style={{ padding: '.5rem .75rem', fontWeight: 700, color: TEAL }}>{mv.model_version}</td>
                        <td style={{ padding: '.5rem .75rem', color: NAVY }}>{mv.training_samples}</td>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280' }}>{mv.final_loss != null ? mv.final_loss.toFixed(4) : '—'}</td>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280' }}>{mv.final_mae != null ? `±${mv.final_mae.toFixed(1)} mmHg` : '—'}</td>
                        <td style={{ padding: '.5rem .75rem', fontWeight: 700, color: maeColor }}>{mv.val_mae_sys != null ? `±${Number(mv.val_mae_sys).toFixed(1)}` : mv.val_mae != null ? `±${mv.val_mae.toFixed(1)}` : '—'}</td>
                        <td style={{ padding: '.5rem .75rem', fontWeight: 700, color: maeColor }}>{mv.val_mae_dia != null ? `±${Number(mv.val_mae_dia).toFixed(1)}` : '—'}</td>
                        <td style={{ padding: '.5rem .75rem', color: '#6B7280', whiteSpace: 'nowrap' }}>{new Date(mv.trained_at).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          )}
        </div>
      </div>
    </>
  )
}
