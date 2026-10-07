// rPPG algorithm replay harness (task #515).
//
// Pulls validation_readings that have both a paired manual HR (ground
// truth) and a stored raw_rppg_signal, re-runs `processStoredFrames`
// on each, and compares:
//
//   manual HR   ← ground truth (pulse oximeter at scan time)
//   tere HR     ← whatever the live pipeline reported and stored
//   replay HR   ← re-run of the SAME algorithm against the stored signal
//                 (proves the harness is reproducing the pipeline)
//
// Once the replay column tracks tere_hr closely, we can plug in
// candidate algorithms (multi-window vote, DL, etc.) as additional
// columns and A/B them against manual HR without collecting new
// scans. That's the whole point of the harness.
//
// Runs entirely client-side — no new endpoint, no schema change. The
// rPPG pipeline is browser-native so it stays where it lives.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, getValidationReadings, getValidationSubjects } from '../../lib/supabase'
import { processStoredFramesMultiPass, processStoredFrames } from '../../lib/rppg'
import { runAllHRVariants } from '../../lib/rppg-hr-variants'
import { trainV3VariantSweep, framesToV3Features, promoteV3Model, saveV3Model } from '../../lib/bpModelV3'

function fmtHr(v) {
  if (v == null || Number.isNaN(v)) return '—'
  return Math.round(v)
}

function fmtDelta(a, b) {
  if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) return '—'
  const d = a - b
  return (d >= 0 ? '+' : '') + d.toFixed(1)
}

function mae(values) {
  const nums = values.filter(v => v != null && !Number.isNaN(v)).map(v => Math.abs(v))
  if (!nums.length) return null
  return nums.reduce((s, x) => s + x, 0) / nums.length
}

function rmse(values) {
  const nums = values.filter(v => v != null && !Number.isNaN(v))
  if (!nums.length) return null
  const sq = nums.reduce((s, x) => s + x * x, 0) / nums.length
  return Math.sqrt(sq)
}

export default function RppgReplay() {
  const navigate = useNavigate()
  const [authed, setAuthed] = useState(null)
  const [readings, setReadings] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [replaying, setReplaying] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [replayResults, setReplayResults] = useState({}) // {readingId: {hr, rr, numericConfidence, source}}
  // HR variant results keyed by reading id (Patrick 2026-10-03). Shape:
  // {readingId: {variant1, variant2, variant5, variant6}} where each is bpm or null.
  const [variantResults, setVariantResults] = useState({})
  // Subjects for variant #5 (age-conditional Bayesian prior).
  const [subjects, setSubjects] = useState([])
  // BP variant sweep (imbalanced-regression experiment).
  const [promoteStatus, setPromoteStatus] = useState('')  // per-row promote state keyed by variant idx

  // Compares baseline tailBoost vs tailBoost=4/6/8 vs LDS vs asymmetric loss vs
  // subject-equalised weighting on the SAME seeded split. Pure experimental harness.
  const [bpSweepResults, setBpSweepResults] = useState(null)
  const [bpSweepRunning, setBpSweepRunning] = useState(false)
  const [bpSweepProgress, setBpSweepProgress] = useState('')

  // Auth gate — same pattern as VitalsValidateDashboard.
  useEffect(() => {
    let cancelled = false
    const goLogin = () => navigate('/clinician?redirect=/rppg-replay', { replace: true })
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

  const loadData = useCallback(async () => {
    setLoading(true); setLoadError(null)
    try {
      const [rows, subs] = await Promise.all([
        getValidationReadings(),
        getValidationSubjects().catch(() => []),
      ])
      // Only keep rows where both ground-truth HR and stored signal exist —
      // everything else can't participate in the comparison anyway.
      // Filter physiologically-implausible manual entries (typos like 589)
      // that would otherwise inflate MAE/RMSE while telling us nothing.
      const usable = (rows || []).filter(r =>
        r.manual_hr != null &&
        r.manual_hr >= 30 && r.manual_hr <= 200 &&
        r.raw_rppg_signal &&
        Array.isArray(r.raw_rppg_signal.frames) &&
        r.raw_rppg_signal.frames.length > 60
      )
      setReadings(usable)
      setSubjects(subs || [])
    } catch (e) {
      setLoadError(e?.message || String(e))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (authed === true) loadData() }, [authed, loadData])

  // Compare 8 BP weighting/loss variants on the same seeded split. No promote,
  // no API calls — pure in-browser experiment. Writes to component state only.
  async function compareBpVariants() {
    setBpSweepRunning(true); setBpSweepResults(null)
    setBpSweepProgress('BP variant sweep: extracting features…')
    try {
      const subMap = Object.fromEntries(subjects.map(s => [s.id, s]))
      // Need manual BP ground truth + stored signal for every row we feed.
      const withBp = readings.filter(r =>
        r.raw_rppg_signal?.frames?.length && r.manual_systolic && r.manual_diastolic
      )
      const features = []
      const labels = []
      const subjectIds = []
      for (let i = 0; i < withBp.length; i++) {
        const r = withBp[i]
        const sub = r.subject_id ? subMap[r.subject_id] : {}
        const fps = r.raw_rppg_signal?.fps || 30
        if (i % 5 === 0) {
          setBpSweepProgress(`BP variant sweep: extracting features ${i}/${withBp.length}…`)
          await new Promise(res => setTimeout(res, 0))
        }
        try {
          const feats = framesToV3Features(r.raw_rppg_signal.frames, fps, sub)
          if (feats) {
            features.push(feats)
            labels.push([r.manual_systolic, r.manual_diastolic])
            subjectIds.push(r.subject_id || `anon-${i}`)
          }
        } catch {}
      }
      if (features.length < 20) {
        setBpSweepProgress(`Only ${features.length} usable BP signals — need ≥20 to sweep.`)
        return
      }
      setBpSweepProgress(`BP variant sweep: training 8 variants on ${features.length} samples…`)
      await new Promise(res => setTimeout(res, 0))
      const variants = trainV3VariantSweep(features, labels, subjectIds, { nTrees: 20, depth: 3, lr: 0.1 })
      setBpSweepResults({ n: features.length, variants, generatedAt: new Date().toISOString() })
      setBpSweepProgress(`✓ Sweep complete · ${variants.filter(v => v.ok).length}/${variants.length} variants trained`)
    } catch (e) {
      setBpSweepProgress(`Sweep failed: ${e?.message || e}`)
    } finally {
      setBpSweepRunning(false)
      setTimeout(() => setBpSweepProgress(''), 8000)
    }
  }

  async function runReplay() {
    setReplaying(true)
    setReplayResults({})
    setVariantResults({})
    setProgress({ done: 0, total: readings.length })
    const results = {}
    const variants = {}
    const subMap = Object.fromEntries(subjects.map(s => [s.id, s]))
    for (let i = 0; i < readings.length; i++) {
      const r = readings[i]
      try {
        const frames = r.raw_rppg_signal.frames
        const fps    = r.raw_rppg_signal.fps || 30
        // Yield to the UI thread every 5 items so the progress bar can paint
        // and the tab stays responsive during long batches.
        if (i > 0 && i % 5 === 0) await new Promise(r => setTimeout(r, 0))
        // Baseline — multi-pass aggregation matches what the live pipeline
        // ships. Single-pass processStoredFrames() reports ~3× MAE because
        // it's a different algorithm.
        const out = processStoredFramesMultiPass(frames, fps) || processStoredFrames(frames, fps)
        results[r.id] = out ? {
          hr: out.hr, rr: out.rr,
          rr_am: out.rr_am, rr_fm: out.rr_fm, rr_bw: out.rr_bw, rr_source: out.rr_source,
          numericConfidence: out.numericConfidence,
          ok: true,
        } : { hr: null, rr: null, ok: false, reason: 'no result' }
        // HR A/B variants (Patrick 2026-10-03). Baseline (results[r.id].hr)
        // + 3 candidate algorithms + 1 deferred DL slot. All compared
        // against manual_hr for apples-to-apples MAE.
        const sub = r.subject_id ? (subMap[r.subject_id] || {}) : {}
        variants[r.id] = runAllHRVariants(frames, fps, sub)
      } catch (e) {
        results[r.id] = { hr: null, rr: null, ok: false, reason: e?.message || 'error' }
        variants[r.id] = { variant1: null, variant2: null, variant5: null, variant6: null, variant7: null, variant8: null, variant9: null, variant10: null, variant11: null, variant12: null, variant13: null }
      }
      setProgress({ done: i + 1, total: readings.length })
    }
    setReplayResults(results)
    setVariantResults(variants)
    setReplaying(false)
  }

  // Aggregate metrics for the header row. We compare against MANUAL HR
  // (ground truth), not against each other, so the numbers mean something.
  const metrics = useMemo(() => {
    const rows = readings.map(r => {
      const replay = replayResults[r.id]
      return {
        errStored: r.manual_hr != null && r.tere_hr != null ? r.tere_hr - r.manual_hr : null,
        errReplay: r.manual_hr != null && replay?.hr != null ? replay.hr - r.manual_hr : null,
      }
    })
    return {
      n:            readings.length,
      nReplayed:    Object.keys(replayResults).length,
      storedMae:    mae(rows.map(x => x.errStored)),
      storedRmse:   rmse(rows.map(x => x.errStored)),
      replayMae:    mae(rows.map(x => x.errReplay)),
      replayRmse:   rmse(rows.map(x => x.errReplay)),
    }
  }, [readings, replayResults])

  // HR variant leaderboard (Patrick 2026-10-03). Computes MAE for each
  // candidate HR algorithm vs manual_hr (ground truth), ranks them, and
  // highlights the winner. Baseline = current live pipeline (replay).
  // Promotion decision gate: winner's MAE must beat baseline MAE AND
  // be lower than baseline-minus-threshold to be worth a code change.
  const variantMetrics = useMemo(() => {
    const nResults = Object.keys(variantResults).length
    if (!nResults) return null
    const errors = {
      baseline: [],
      variant1: [], variant2: [], variant5: [], variant6: [],
      variant7: [], variant8: [], variant9: [],
      variant10: [], variant11: [], variant12: [], variant13: [],
    }
    for (const r of readings) {
      if (r.manual_hr == null) continue
      const replay = replayResults[r.id]
      const v = variantResults[r.id]
      if (replay?.hr != null) errors.baseline.push(replay.hr - r.manual_hr)
      if (v?.variant1 != null) errors.variant1.push(v.variant1 - r.manual_hr)
      if (v?.variant2 != null) errors.variant2.push(v.variant2 - r.manual_hr)
      if (v?.variant5 != null) errors.variant5.push(v.variant5 - r.manual_hr)
      if (v?.variant6 != null) errors.variant6.push(v.variant6 - r.manual_hr)
      if (v?.variant7 != null) errors.variant7.push(v.variant7 - r.manual_hr)
      if (v?.variant8 != null) errors.variant8.push(v.variant8 - r.manual_hr)
      if (v?.variant9 != null) errors.variant9.push(v.variant9 - r.manual_hr)
      if (v?.variant10 != null) errors.variant10.push(v.variant10 - r.manual_hr)
      if (v?.variant11 != null) errors.variant11.push(v.variant11 - r.manual_hr)
      if (v?.variant12 != null) errors.variant12.push(v.variant12 - r.manual_hr)
      if (v?.variant13 != null) errors.variant13.push(v.variant13 - r.manual_hr)
    }
    const results = [
      { key: 'baseline', label: 'Baseline (live ensemble)',        mae: mae(errors.baseline), rmse: rmse(errors.baseline), n: errors.baseline.length },
      { key: 'variant10', label: '#10 POS alone (CHILL paper winner)', mae: mae(errors.variant10), rmse: rmse(errors.variant10), n: errors.variant10.length },
      { key: 'variant11', label: '#11 CHROM alone',                 mae: mae(errors.variant11), rmse: rmse(errors.variant11), n: errors.variant11.length },
      { key: 'variant12', label: '#12 Green channel alone',         mae: mae(errors.variant12), rmse: rmse(errors.variant12), n: errors.variant12.length },
      { key: 'variant1', label: '#1 Multi-window voting',           mae: mae(errors.variant1), rmse: rmse(errors.variant1), n: errors.variant1.length },
      { key: 'variant2', label: '#2 Bidirectional harmonic check',  mae: mae(errors.variant2), rmse: rmse(errors.variant2), n: errors.variant2.length },
      { key: 'variant5', label: '#5 Bayesian age prior',            mae: mae(errors.variant5), rmse: rmse(errors.variant5), n: errors.variant5.length },
      { key: 'variant7', label: '#7 PBV (blood volume vector)',     mae: mae(errors.variant7), rmse: rmse(errors.variant7), n: errors.variant7.length },
      { key: 'variant9', label: '#9 IBI direct peak detection',     mae: mae(errors.variant9), rmse: rmse(errors.variant9), n: errors.variant9.length },
      { key: 'variant13', label: '#13 POS + peak count (ETL replica)', mae: mae(errors.variant13), rmse: rmse(errors.variant13), n: errors.variant13.length },
      { key: 'variant8', label: '#8 Multi-ROI (needs re-capture)',  mae: mae(errors.variant8), rmse: rmse(errors.variant8), n: errors.variant8.length },
      { key: 'variant6', label: '#6 DL model (deferred #517)',       mae: mae(errors.variant6), rmse: rmse(errors.variant6), n: errors.variant6.length },
    ]
    const valid = results.filter(r => r.mae != null && r.n > 0)
    const sorted = [...valid].sort((a, b) => a.mae - b.mae)
    const winner = sorted[0]
    const baseline = results.find(r => r.key === 'baseline')
    const improvement = winner && baseline && baseline.mae != null && winner.key !== 'baseline'
      ? baseline.mae - winner.mae
      : 0
    return { results, winner, baseline, improvement }
  }, [readings, replayResults, variantResults])

  // RR-specific metrics. No ground truth in validation_readings (no manual_rr
  // column — RR is hard to self-measure), so we can't do a MAE. Instead we
  // watch for the historical failure modes:
  //   - Pinned at 30 bpm (the ceiling-artefact bug fixed in 1ee0089;
  //     regression signal if it starts appearing again)
  //   - Zero (algorithm rejected — expected for very noisy scans)
  //   - Outside physiological range (should be near-empty)
  // Also track how closely the replay reproduces the stored RR pipeline.
  // Helper: bucket a set of RR values into distribution counts.
  function bucket(values) {
    const nz = values.filter(v => v != null && v > 0)
    return {
      n:        values.length,
      physio:   nz.filter(v => v >= 10 && v <= 20).length,
      tooLow:   nz.filter(v => v < 10).length,
      tooHigh:  nz.filter(v => v > 20 && v < 28).length,
      pinned30: nz.filter(v => v >= 28).length,
      zeros:    values.filter(v => v === 0 || v == null).length,
      median:   (() => {
        if (!nz.length) return null
        const s = [...nz].sort((a, b) => a - b)
        return s[Math.floor(s.length / 2)]
      })(),
    }
  }
  const rrMetrics = useMemo(() => {
    const storedRrs = readings.map(r => r.tere_rr)
    const replayed = readings.filter(r => replayResults[r.id])
    const replayRrs = replayed.map(r => replayResults[r.id]?.rr ?? null)
    // Source breakdown — track EVERY label fuseRR() can emit so we don't
    // silently drop rows into an "unknown" bucket. Grouped for the UI:
    // 3-agree (best), 2-of-3 agree (rescued outlier), 2-source only,
    // 1-source only, suppressed, no signal.
    const sources = {
      // "3 valid sources, all within 4 bpm — take median"
      'am+fm+bw': 0,
      // "3 valid, 2 of them agree — outlier tolerated" (any pair)
      'am+fm': 0, 'am+bw': 0, 'fm+bw': 0,
      // "2 valid, agreed" (BW was null → old 2-source path)
      // (same 'am+fm'/'am+bw'/'fm+bw' labels — safe merge, source only fires once)
      // "1 valid" (2 of 3 rejected)
      'am-only': 0, 'fm-only': 0, 'bw-only': 0,
      // Suppressed
      'disagree2': 0, 'disagree3': 0,
      // No RR at all
      'none': 0,
    }
    for (const r of replayed) {
      const src = replayResults[r.id]?.rr_source || 'none'
      if (sources[src] !== undefined) sources[src]++
      else sources['none']++  // catch-all for any label we didn't anticipate
    }
    return { stored: bucket(storedRrs), replay: bucket(replayRrs), sources }
  }, [readings, replayResults])

  if (authed !== true) {
    return <div style={{padding:'2rem',textAlign:'center',color:'#6B7280'}}>Checking authentication…</div>
  }

  return (
    <div style={{maxWidth:1200,margin:'0 auto',padding:'1.5rem',fontFamily:'Plus Jakarta Sans, sans-serif'}}>
      <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:'.5rem',gap:'.75rem',flexWrap:'wrap'}}>
        <h1 style={{margin:0,fontSize:'1.6rem'}}>rPPG Replay</h1>
        <button onClick={() => navigate('/vitals-validate/dashboard')} style={{background:'none',border:'none',color:'#6B7280',fontSize:'.875rem',cursor:'pointer',textDecoration:'underline'}}>
          ← Validation dashboard
        </button>
      </div>
      <p style={{color:'#6B7280',fontSize:'.9rem',marginBottom:'1.25rem',lineHeight:1.5}}>
        Re-runs the current multi-pass rPPG pipeline against every stored VitalsValidate scan that has
        a paired manual (ground-truth) HR. Baseline for testing candidate algorithms — a candidate is
        worth shipping only if it beats the <em>replay MAE</em> shown below (not the benchmark from a
        paper). Excludes rows with implausible manual HR (&lt;30 or &gt;200 — data-entry typos).
      </p>

      {loading && <div style={{padding:'1rem',color:'#6B7280'}}>Loading readings…</div>}
      {loadError && <div style={{padding:'1rem',background:'#FEF2F2',border:'1px solid #FCA5A5',borderRadius:8,color:'#991B1B'}}>Load failed: {loadError}</div>}

      {!loading && !loadError && (
        <>
          <div style={{display:'flex',gap:'.75rem',alignItems:'center',flexWrap:'wrap',marginBottom:'1rem'}}>
            <button
              onClick={runReplay}
              disabled={replaying || readings.length === 0}
              style={{padding:'.6rem 1.1rem',background:'var(--teal)',color:'white',border:'none',borderRadius:8,fontWeight:700,cursor:replaying?'not-allowed':'pointer',opacity:replaying||readings.length===0?.5:1,fontSize:'.9rem'}}>
              {replaying ? `Replaying ${progress.done}/${progress.total}…` : `Re-run pipeline on ${readings.length} readings`}
            </button>
            <button onClick={loadData} disabled={replaying} style={{padding:'.6rem 1.1rem',background:'white',color:'#374151',border:'1.5px solid #E5E7EB',borderRadius:8,fontWeight:600,cursor:'pointer',fontSize:'.9rem'}}>
              Refresh list
            </button>
            <button
              onClick={compareBpVariants}
              disabled={bpSweepRunning || readings.length === 0}
              title="Experimental: trains 16 BP variants on the SAME split — legacy (tailBoost 2/4/6/8, LDS, LDS+asym, tailBoost=4+asym, subject-eq) + 2026-10 additions (SERA phi-weighted, SMOGN tail-synthesis, quantile τ=0.5, stratified val split, tail-aware asymmetric penalty, full stack, Mixture-of-Experts). Does NOT promote."
              style={{padding:'.6rem 1.1rem',background:'#DC2626',color:'white',border:'none',borderRadius:8,fontWeight:700,cursor:bpSweepRunning?'not-allowed':'pointer',opacity:bpSweepRunning||readings.length===0?.5:1,fontSize:'.9rem'}}>
              {bpSweepRunning ? (bpSweepProgress || 'Comparing BP variants…') : '🧪 Compare BP variants'}
            </button>
            {!bpSweepRunning && bpSweepProgress && (
              <span style={{fontSize:'.8rem',color:bpSweepProgress.startsWith('✓')?'#059669':'#B91C1C'}}>{bpSweepProgress}</span>
            )}
          </div>

          {/* BP variant leaderboard — imbalanced-regression sandbox. Train-side
              experiment, no promotion. Mirror of the HR leaderboard pattern
              but for v3 BP's GBM retrain. */}
          {bpSweepResults && (
            <div style={{background:'#FEF2F2',border:'1px solid #FCA5A5',borderRadius:10,padding:'1rem 1.25rem',marginBottom:'1rem'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'.75rem',flexWrap:'wrap',gap:'.5rem'}}>
                <div>
                  <div style={{fontSize:'.75rem',fontWeight:700,color:'#991B1B',textTransform:'uppercase',letterSpacing:'.05em'}}>
                    🧪 BP variant leaderboard · experiment · n={bpSweepResults.n}
                  </div>
                  <div style={{fontSize:'.7rem',color:'#7F1D1D',marginTop:2}}>
                    Lower = better. Winner per column highlighted. <strong>No model is promoted.</strong>
                  </div>
                </div>
                <button
                  onClick={() => setBpSweepResults(null)}
                  style={{background:'none',border:'1px solid #FCA5A5',color:'#991B1B',borderRadius:6,padding:'.3rem .6rem',fontSize:'.75rem',cursor:'pointer'}}>
                  Clear
                </button>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.85rem'}}>
                  <thead>
                    <tr style={{color:'#991B1B'}}>
                      <th style={{textAlign:'left',padding:'.4rem .5rem',fontWeight:700}}>Variant</th>
                      <th style={{textAlign:'right',padding:'.4rem .5rem',fontWeight:700}} title="Overall systolic MAE on held-out validation set">Sys MAE</th>
                      <th style={{textAlign:'right',padding:'.4rem .5rem',fontWeight:700}} title="Overall diastolic MAE on held-out validation set">Dia MAE</th>
                      <th style={{textAlign:'right',padding:'.4rem .5rem',fontWeight:700,color:'#B91C1C'}} title="MAE on hypertensive band (SBP ≥ 140). Clinical safety number.">High MAE</th>
                      <th style={{textAlign:'right',padding:'.4rem .5rem',fontWeight:700}} title="MAE on normotensive band (110-139 SBP). Represents the bulk of patients.">Norm MAE</th>
                      <th style={{textAlign:'right',padding:'.4rem .5rem',fontWeight:700,color:'#2563EB'}} title="MAE on low-normal band (SBP < 110). Tail check. Small subscript = n in band — treat Low MAE at nLow < 10 as noisy.">Low MAE</th>
                      <th style={{textAlign:'right',padding:'.4rem .5rem',fontWeight:700}} title="Signed bias on high band. Negative = systematic under-prediction of hypertensives (clinically dangerous).">High bias</th>
                      <th style={{textAlign:'right',padding:'.4rem .5rem',fontWeight:700}} title="Signed bias on low band. Positive = systematic over-prediction of hypotensives (collapses them into the normotensive mean — the current Low MAE wall).">Low bias</th>
                      <th style={{textAlign:'right',padding:'.4rem .5rem',fontWeight:700}} title="Promote this trained variant to prod. Replaces current /api/bp-v3-model.">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const ok = bpSweepResults.variants.filter(r => r.ok)
                      const minHigh = Math.min(...ok.map(r => r.meta?.valMaeSysByBand?.high_ge_140 ?? Infinity).filter(x => Number.isFinite(x)))
                      const minNorm = Math.min(...ok.map(r => r.meta?.valMaeSysByBand?.normal_110_139 ?? Infinity).filter(x => Number.isFinite(x)))
                      const minLow  = Math.min(...ok.map(r => r.meta?.valMaeSysByBand?.low_lt_110 ?? Infinity).filter(x => Number.isFinite(x)))
                      const minSys  = Math.min(...ok.map(r => r.meta?.valMae?.sys ?? Infinity).filter(x => Number.isFinite(x)))
                      const minDia  = Math.min(...ok.map(r => r.meta?.valMae?.dia ?? Infinity).filter(x => Number.isFinite(x)))
                      return bpSweepResults.variants.map((r, idx) => {
                        if (!r.ok) {
                          return (
                            <tr key={idx} style={{borderTop:'1px solid #FECACA',color:'#9CA3AF'}}>
                              <td style={{padding:'.4rem .5rem'}}>{r.label}</td>
                              <td colSpan={8} style={{padding:'.4rem .5rem',fontStyle:'italic'}}>failed: {r.error}</td>
                            </tr>
                          )
                        }
                        const sys = r.meta?.valMae?.sys
                        const dia = r.meta?.valMae?.dia
                        const high = r.meta?.valMaeSysByBand?.high_ge_140
                        const norm = r.meta?.valMaeSysByBand?.normal_110_139
                        const low  = r.meta?.valMaeSysByBand?.low_lt_110
                        const bias = r.meta?.valMaeSysByBand?.biasHigh
                        const biasL = r.meta?.valMaeSysByBand?.biasLow
                        const nLow = r.meta?.valMaeSysByBand?.nLow
                        const cell = (v, isWinner, color) => (
                          <td style={{padding:'.4rem .5rem',textAlign:'right',fontWeight:isWinner?700:400,color:isWinner?'#065F46':color,background:isWinner?'#D1FAE5':'transparent'}}>
                            {v == null ? '—' : v}
                          </td>
                        )
                        const rowStatus = promoteStatus && promoteStatus.startsWith(`${idx}:`) ? promoteStatus.slice(String(idx).length + 1) : ''
                        const canPromote = !!(r.sysModel && r.diaModel)
                        return (
                          <tr key={idx} style={{borderTop:'1px solid #FECACA'}}>
                            <td style={{padding:'.4rem .5rem',color:'#1F2937'}}>{r.label}</td>
                            {cell(sys, sys === minSys, '#374151')}
                            {cell(dia, dia === minDia, '#374151')}
                            {cell(high, high === minHigh, '#B91C1C')}
                            {cell(norm, norm === minNorm, '#374151')}
                            <td style={{padding:'.4rem .5rem',textAlign:'right',fontWeight:low === minLow?700:400,color:low === minLow?'#065F46':'#2563EB',background:low === minLow?'#D1FAE5':'transparent'}}>
                              {low == null ? '—' : low}
                              {nLow != null && <span style={{fontSize:'.65rem',opacity:0.6,marginLeft:4}}>n={nLow}</span>}
                            </td>
                            <td style={{padding:'.4rem .5rem',textAlign:'right',color:bias == null?'#9CA3AF':bias < -3?'#B91C1C':bias > 3?'#D97706':'#374151'}}>
                              {bias == null ? '—' : (bias > 0 ? '+' : '') + bias}
                            </td>
                            <td style={{padding:'.4rem .5rem',textAlign:'right',color:biasL == null?'#9CA3AF':biasL > 3?'#B91C1C':biasL < -3?'#D97706':'#374151'}}>
                              {biasL == null ? '—' : (biasL > 0 ? '+' : '') + biasL}
                            </td>
                            <td style={{padding:'.4rem .5rem',textAlign:'right'}}>
                              {canPromote ? (
                                <button
                                  onClick={async () => {
                                    if (!confirm(`Promote "${r.label}" to prod? This replaces the live v3 model served to /vitals.`)) return
                                    setPromoteStatus(`${idx}:promoting…`)
                                    try {
                                      const model = { sysModel: r.sysModel, diaModel: r.diaModel, featureNames: r.featureNames, meta: r.meta }
                                      saveV3Model(model)
                                      await promoteV3Model(model, `Sweep leaderboard promotion: ${r.label}`)
                                      setPromoteStatus(`${idx}:✓ promoted`)
                                    } catch (e) {
                                      setPromoteStatus(`${idx}:✗ ${e.message || e}`)
                                    }
                                  }}
                                  disabled={!!promoteStatus && promoteStatus.endsWith('promoting…')}
                                  style={{background:'#991B1B',color:'white',border:'none',borderRadius:6,padding:'.3rem .55rem',fontSize:'.7rem',fontWeight:700,cursor:'pointer',opacity:promoteStatus.endsWith('promoting…')?.5:1,whiteSpace:'nowrap'}}>
                                  Promote
                                </button>
                              ) : <span style={{color:'#9CA3AF',fontSize:'.7rem'}}>—</span>}
                              {rowStatus && <div style={{fontSize:'.65rem',marginTop:2,color:rowStatus.startsWith('✓')?'#065F46':rowStatus.startsWith('✗')?'#B91C1C':'#7F1D1D'}}>{rowStatus}</div>}
                            </td>
                          </tr>
                        )
                      })
                    })()}
                  </tbody>
                </table>
              </div>
              <div style={{fontSize:'.7rem',color:'#7F1D1D',marginTop:'.75rem',lineHeight:1.5}}>
                <strong>How to read:</strong> "High MAE" + "Low MAE" are the clinical-safety numbers — lower = better tail detection. "High bias" negative = model under-predicts hypertensives (dangerous). "Low bias" positive = model over-predicts hypotensives (collapses them to the normotensive mean — this is the wall the previous variants hit). Small "n=X" beside Low MAE is the band's val-sample count — at n&lt;10 the number is noisy; prefer the Stratified-val variants there. <strong>Click "Promote" to ship that variant live</strong> — it replaces the current /api/bp-v3-model served to /vitals. MoE row has no Promote button yet (composite router+specialist+generalist model shape not supported by the promote path).
              </div>
            </div>
          )}

          <div style={{background:'#F9FAFB',border:'1px solid #E5E7EB',borderRadius:10,padding:'1rem 1.25rem',marginBottom:'.75rem',display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))',gap:'.75rem'}}>
            <Stat label="Readings" value={metrics.n} />
            <Stat label="Replayed" value={metrics.nReplayed} />
            <Stat label="Stored HR — MAE"  value={metrics.storedMae?.toFixed(2) ?? '—'} unit="bpm" />
            <Stat label="Stored HR — RMSE" value={metrics.storedRmse?.toFixed(2) ?? '—'} unit="bpm" />
            <Stat label="Replay HR — MAE"  value={metrics.replayMae?.toFixed(2) ?? '—'} unit="bpm" />
            <Stat label="Replay HR — RMSE" value={metrics.replayRmse?.toFixed(2) ?? '—'} unit="bpm" />
          </div>

          {/* HR variant leaderboard (Patrick 2026-10-03). Ranks baseline +
              candidate algorithms by MAE vs manual_hr. Winner highlighted;
              promotion only recommended if improvement > ~1 bpm (noise
              floor). Pattern mirrors BP v2/v3 train+promote: see the win
              empirically on real data before changing live code. */}
          {variantMetrics && (
            <div style={{background:'#EEF2FF',border:'1px solid #C7D2FE',borderRadius:10,padding:'1rem 1.25rem',marginBottom:'1rem'}}>
              <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:'.75rem',flexWrap:'wrap',gap:'.5rem'}}>
                <div style={{fontSize:'.75rem',fontWeight:700,color:'#3730A3',textTransform:'uppercase',letterSpacing:'.05em'}}>
                  HR algorithm leaderboard — candidates vs baseline
                </div>
                {variantMetrics.winner && variantMetrics.winner.key !== 'baseline' && variantMetrics.improvement > 1 && (
                  <div style={{background:'#D1FAE5',color:'#065F46',padding:'3px 10px',borderRadius:99,fontSize:'.7rem',fontWeight:700}}>
                    ✓ WINNER beats baseline by {variantMetrics.improvement.toFixed(2)} bpm — consider promoting
                  </div>
                )}
                {variantMetrics.winner && variantMetrics.winner.key === 'baseline' && (
                  <div style={{background:'#FEF3C7',color:'#78350F',padding:'3px 10px',borderRadius:99,fontSize:'.7rem',fontWeight:700}}>
                    Baseline still best — no variant improves
                  </div>
                )}
                {variantMetrics.winner && variantMetrics.winner.key !== 'baseline' && variantMetrics.improvement <= 1 && (
                  <div style={{background:'#FEF3C7',color:'#78350F',padding:'3px 10px',borderRadius:99,fontSize:'.7rem',fontWeight:700}}>
                    Candidate leads but delta &lt; 1 bpm — within noise, don't promote
                  </div>
                )}
              </div>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.85rem'}}>
                <thead>
                  <tr style={{color:'#3730A3'}}>
                    <th style={{textAlign:'left',padding:'.3rem .5rem',fontWeight:700}}>Algorithm</th>
                    <th style={{textAlign:'right',padding:'.3rem .5rem',fontWeight:700}}>n</th>
                    <th style={{textAlign:'right',padding:'.3rem .5rem',fontWeight:700}}>MAE (bpm)</th>
                    <th style={{textAlign:'right',padding:'.3rem .5rem',fontWeight:700}}>RMSE (bpm)</th>
                    <th style={{textAlign:'right',padding:'.3rem .5rem',fontWeight:700}}>vs baseline</th>
                  </tr>
                </thead>
                <tbody>
                  {variantMetrics.results.map(r => {
                    const isWinner = variantMetrics.winner?.key === r.key
                    const delta = r.mae != null && variantMetrics.baseline?.mae != null
                      ? variantMetrics.baseline.mae - r.mae
                      : null
                    return (
                      <tr key={r.key} style={{background: isWinner ? '#D1FAE5' : 'transparent', fontWeight: isWinner ? 700 : 400}}>
                        <td style={{padding:'.4rem .5rem',color:'#1F2937'}}>{isWinner && '🏆 '}{r.label}</td>
                        <td style={{padding:'.4rem .5rem',textAlign:'right',color:'#6B7280'}}>{r.n || '—'}</td>
                        <td style={{padding:'.4rem .5rem',textAlign:'right',color:'#1F2937'}}>{r.mae != null ? r.mae.toFixed(2) : '—'}</td>
                        <td style={{padding:'.4rem .5rem',textAlign:'right',color:'#6B7280'}}>{r.rmse != null ? r.rmse.toFixed(2) : '—'}</td>
                        <td style={{padding:'.4rem .5rem',textAlign:'right',color: delta == null ? '#9CA3AF' : delta > 0 ? '#065F46' : delta < 0 ? '#991B1B' : '#6B7280'}}>
                          {r.key === 'baseline' ? '—' : delta == null ? '—' : (delta > 0 ? '+' : '') + delta.toFixed(2)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div style={{fontSize:'.75rem',color:'#4B5563',marginTop:'.6rem',lineHeight:1.5}}>
                Promotion rule: if a candidate's MAE is &gt;1 bpm lower than baseline, swap it into
                <code style={{background:'#E0E7FF',padding:'1px 4px',borderRadius:3,margin:'0 3px'}}>processStoredFrames</code>
                via a code change (no runtime flag — algorithm swaps ship as code). &lt;1 bpm = noise.
              </div>
            </div>
          )}

          <div style={{background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:10,padding:'1rem 1.25rem',marginBottom:'1rem'}}>
            <div style={{fontSize:'.75rem',fontWeight:700,color:'#92400E',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'.75rem'}}>
              Respiratory rate — stored (historical) vs replay (candidate)
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.85rem'}}>
                <thead>
                  <tr style={{color:'#78350F'}}>
                    <th style={{textAlign:'left',padding:'.3rem .5rem',fontWeight:700}}>Distribution</th>
                    <th style={{textAlign:'right',padding:'.3rem .5rem',fontWeight:700}}>Stored (DB)</th>
                    <th style={{textAlign:'right',padding:'.3rem .5rem',fontWeight:700}}>Replay (current algo)</th>
                    <th style={{textAlign:'right',padding:'.3rem .5rem',fontWeight:700,color:'#059669'}}>Δ</th>
                  </tr>
                </thead>
                <tbody>
                  <RrRow label="Physiological (10–20)" a={rrMetrics.stored.physio} b={rrMetrics.replay.physio} higherIsBetter />
                  <RrRow label="Below 10 (implausible)" a={rrMetrics.stored.tooLow} b={rrMetrics.replay.tooLow} />
                  <RrRow label="Above 20, below 28" a={rrMetrics.stored.tooHigh} b={rrMetrics.replay.tooHigh} />
                  <RrRow label="Pinned near 30 ⚠ (ceiling artefact)" a={rrMetrics.stored.pinned30} b={rrMetrics.replay.pinned30} />
                  <RrRow label="Zero / rejected (SNR gate)" a={rrMetrics.stored.zeros} b={rrMetrics.replay.zeros} />
                  <RrRow label="Median (of non-zero)" a={rrMetrics.stored.median ?? '—'} b={rrMetrics.replay.median ?? '—'} unit="bpm" />
                </tbody>
              </table>
            </div>
            <div style={{marginTop:'.75rem',paddingTop:'.75rem',borderTop:'1px dashed #FDE68A'}}>
              <div style={{fontSize:'.65rem',color:'#92400E',textTransform:'uppercase',letterSpacing:'.03em',marginBottom:'.4rem',fontWeight:700}}>All 3 agree — highest confidence</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(110px, 1fr))',gap:'.5rem',marginBottom:'.75rem'}}>
                <SrcStat label="AM+FM+BW" value={rrMetrics.sources['am+fm+bw']} tone="good" />
              </div>
              <div style={{fontSize:'.65rem',color:'#92400E',textTransform:'uppercase',letterSpacing:'.03em',marginBottom:'.4rem',fontWeight:700}}>2 of 3 agree (rescued) or only 2 valid</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(110px, 1fr))',gap:'.5rem',marginBottom:'.75rem'}}>
                <SrcStat label="AM+FM" value={rrMetrics.sources['am+fm']} />
                <SrcStat label="AM+BW" value={rrMetrics.sources['am+bw']} />
                <SrcStat label="FM+BW" value={rrMetrics.sources['fm+bw']} />
              </div>
              <div style={{fontSize:'.65rem',color:'#92400E',textTransform:'uppercase',letterSpacing:'.03em',marginBottom:'.4rem',fontWeight:700}}>Only 1 valid source (lowest confidence)</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(110px, 1fr))',gap:'.5rem',marginBottom:'.75rem'}}>
                <SrcStat label="AM only" value={rrMetrics.sources['am-only']} />
                <SrcStat label="FM only" value={rrMetrics.sources['fm-only']} />
                <SrcStat label="BW only" value={rrMetrics.sources['bw-only']} />
              </div>
              <div style={{fontSize:'.65rem',color:'#92400E',textTransform:'uppercase',letterSpacing:'.03em',marginBottom:'.4rem',fontWeight:700}}>Suppressed / no signal</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(110px, 1fr))',gap:'.5rem'}}>
                <SrcStat label="Disagree (2 valid)" value={rrMetrics.sources['disagree2']} tone="bad" />
                <SrcStat label="Disagree (3 valid)" value={rrMetrics.sources['disagree3']} tone="bad" />
                <SrcStat label="No RR at all" value={rrMetrics.sources['none']} />
              </div>
            </div>
            <div style={{fontSize:'.7rem',color:'#78350F',marginTop:'.75rem',fontStyle:'italic'}}>
              Stored is historical — won't change on re-run. All-3-agree readings are the highest-confidence set. 2-of-3 rescues would previously have been suppressed under the 2-source policy.
            </div>
          </div>

          <div style={{overflowX:'auto',border:'1px solid #E5E7EB',borderRadius:10}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.85rem'}}>
              <thead style={{background:'#F9FAFB',position:'sticky',top:0}}>
                <tr>
                  <Th>Subject</Th>
                  <Th>Recorded</Th>
                  <Th title="Ground truth (pulse oximeter at scan)">Manual HR</Th>
                  <Th title="Stored — whatever the live pipeline reported at scan time">Stored HR</Th>
                  <Th title="Re-run of the current pipeline against the stored signal">Replay HR</Th>
                  <Th title="Stored HR − Manual HR">Δ stored</Th>
                  <Th title="Replay HR − Manual HR">Δ replay</Th>
                  <Th title="Respiratory rate stored at scan time. No manual ground truth — flag values ≥28 (ceiling artefact) or ≤8">Stored RR</Th>
                  <Th title="Replayed respiratory rate — should track Stored RR closely">Replay RR</Th>
                  <Th title="AM (spectral envelope) / FM (RSA from beat intervals) / fusion source">RR source</Th>
                  <Th>Confidence</Th>
                  <Th>Quality</Th>
                </tr>
              </thead>
              <tbody>
                {readings.map(r => {
                  const replay = replayResults[r.id]
                  const dStored = r.tere_hr != null ? r.tere_hr - r.manual_hr : null
                  const dReplay = replay?.hr  != null ? replay.hr  - r.manual_hr : null
                  return (
                    <tr key={r.id} style={{borderTop:'1px solid #F3F4F6'}}>
                      <Td>{r.subject_code || '—'}</Td>
                      <Td style={{color:'#6B7280',fontSize:'.75rem'}}>{r.recorded_at ? new Date(r.recorded_at).toLocaleString() : '—'}</Td>
                      <Td style={{fontWeight:600}}>{fmtHr(r.manual_hr)}</Td>
                      <Td>{fmtHr(r.tere_hr)}</Td>
                      <Td style={{background:replay?'#F0F9FA':'transparent'}}>{replay ? fmtHr(replay.hr) : '—'}</Td>
                      <Td style={{color: dStored != null && Math.abs(dStored) > 5 ? '#B45309' : '#374151'}}>{fmtDelta(r.tere_hr, r.manual_hr)}</Td>
                      <Td style={{color: dReplay != null && Math.abs(dReplay) > 5 ? '#B45309' : '#374151'}}>{fmtDelta(replay?.hr, r.manual_hr)}</Td>
                      <Td style={{
                        // Highlight the two failure signals we care about:
                        // pinned near ceiling (≥28) or outside physiology (<10, >20).
                        color: r.tere_rr == null ? '#9CA3AF'
                             : r.tere_rr >= 28 ? '#B91C1C'
                             : (r.tere_rr < 10 || r.tere_rr > 20) ? '#B45309'
                             : '#374151',
                        fontWeight: r.tere_rr >= 28 ? 700 : 400,
                      }}>{r.tere_rr ?? '—'}</Td>
                      <Td style={{
                        background: replay?.rr != null ? '#F0F9FA' : 'transparent',
                        color: replay?.rr == null ? '#9CA3AF'
                             : replay.rr >= 28 ? '#B91C1C'
                             : (replay.rr < 10 || replay.rr > 20) ? '#B45309'
                             : '#374151',
                        fontWeight: replay?.rr >= 28 ? 700 : 400,
                      }}>{replay?.rr != null ? Math.round(replay.rr) : '—'}</Td>
                      <Td style={{color:'#6B7280',fontSize:'.7rem'}}>
                        {replay?.rr_source
                          ? <span title={`AM=${replay.rr_am ?? '—'}, FM=${replay.rr_fm ?? '—'}, BW=${replay.rr_bw ?? '—'}`}>{replay.rr_source}</span>
                          : '—'}
                      </Td>
                      <Td style={{color:'#6B7280'}}>{replay?.numericConfidence != null ? Math.round(replay.numericConfidence) : (r.raw_rppg_signal?.numericConfidence != null ? Math.round(r.raw_rppg_signal.numericConfidence) : '—')}</Td>
                      <Td style={{color:'#6B7280'}}>{r.hr_quality || '—'}</Td>
                    </tr>
                  )
                })}
                {readings.length === 0 && (
                  <tr><Td colSpan={12} style={{textAlign:'center',color:'#6B7280',padding:'2rem'}}>No readings with both a paired manual HR and a stored raw signal yet.</Td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, unit }) {
  return (
    <div>
      <div style={{fontSize:'.7rem',color:'#6B7280',textTransform:'uppercase',letterSpacing:'.03em',marginBottom:2}}>{label}</div>
      <div style={{fontSize:'1.15rem',fontWeight:700,color:'#111827'}}>{value}{unit ? <span style={{fontSize:'.75rem',fontWeight:500,color:'#6B7280',marginLeft:3}}>{unit}</span> : null}</div>
    </div>
  )
}

function SrcStat({ label, value, tone }) {
  const color = tone === 'good' ? '#059669' : tone === 'bad' ? '#B91C1C' : '#78350F'
  return (
    <div>
      <div style={{fontSize:'.65rem',color:'#92400E',textTransform:'uppercase',letterSpacing:'.03em',marginBottom:2}}>{label}</div>
      <div style={{fontSize:'1.05rem',fontWeight:700,color}}>{value ?? 0}</div>
    </div>
  )
}

function RrRow({ label, a, b, unit, higherIsBetter = false }) {
  const aNum = typeof a === 'number' ? a : null
  const bNum = typeof b === 'number' ? b : null
  let deltaText = '—'
  let color = '#6B7280'
  if (aNum != null && bNum != null) {
    const d = bNum - aNum
    deltaText = (d >= 0 ? '+' : '') + d
    const good = higherIsBetter ? d > 0 : d < 0
    const bad  = higherIsBetter ? d < 0 : d > 0
    if (d !== 0) color = good ? '#059669' : bad ? '#B91C1C' : '#6B7280'
  }
  return (
    <tr style={{borderTop:'1px solid #FDE68A'}}>
      <td style={{padding:'.35rem .5rem',color:'#78350F'}}>{label}</td>
      <td style={{padding:'.35rem .5rem',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{a}{unit ? <span style={{color:'#9CA3AF',fontSize:'.7rem',marginLeft:2}}>{unit}</span> : null}</td>
      <td style={{padding:'.35rem .5rem',textAlign:'right',fontVariantNumeric:'tabular-nums',fontWeight:600}}>{b}{unit ? <span style={{color:'#9CA3AF',fontSize:'.7rem',marginLeft:2}}>{unit}</span> : null}</td>
      <td style={{padding:'.35rem .5rem',textAlign:'right',fontVariantNumeric:'tabular-nums',color,fontWeight:600}}>{deltaText}</td>
    </tr>
  )
}

function Th({ children, title }) {
  return <th title={title} style={{textAlign:'left',padding:'.6rem .75rem',fontSize:'.75rem',fontWeight:700,color:'#374151',textTransform:'uppercase',letterSpacing:'.03em',borderBottom:'1px solid #E5E7EB'}}>{children}</th>
}

function Td({ children, style, colSpan }) {
  return <td colSpan={colSpan} style={{padding:'.55rem .75rem',...style}}>{children}</td>
}
