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
import { supabase, getValidationReadings } from '../../lib/supabase'
import { processStoredFrames } from '../../lib/rppg'

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
      const rows = await getValidationReadings()
      // Only keep rows where both ground-truth HR and stored signal exist —
      // everything else can't participate in the comparison anyway.
      const usable = (rows || []).filter(r =>
        r.manual_hr != null &&
        r.raw_rppg_signal &&
        Array.isArray(r.raw_rppg_signal.frames) &&
        r.raw_rppg_signal.frames.length > 60
      )
      setReadings(usable)
    } catch (e) {
      setLoadError(e?.message || String(e))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (authed === true) loadData() }, [authed, loadData])

  async function runReplay() {
    setReplaying(true)
    setReplayResults({})
    setProgress({ done: 0, total: readings.length })
    const results = {}
    for (let i = 0; i < readings.length; i++) {
      const r = readings[i]
      try {
        const frames = r.raw_rppg_signal.frames
        const fps    = r.raw_rppg_signal.fps || 30
        // Yield to the UI thread every 5 items so the progress bar can paint
        // and the tab stays responsive during long batches.
        if (i > 0 && i % 5 === 0) await new Promise(r => setTimeout(r, 0))
        const out = processStoredFrames(frames, fps)
        results[r.id] = out ? { hr: out.hr, rr: out.rr, numericConfidence: out.numericConfidence, ok: true }
                            : { hr: null, rr: null, ok: false, reason: 'no result' }
      } catch (e) {
        results[r.id] = { hr: null, rr: null, ok: false, reason: e?.message || 'error' }
      }
      setProgress({ done: i + 1, total: readings.length })
    }
    setReplayResults(results)
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
        Re-runs the current rPPG pipeline against every stored VitalsValidate scan that has a paired
        manual (ground-truth) HR. Baseline for testing candidate algorithms — a candidate is worth
        shipping only if it beats the <em>replay MAE</em> shown below (not the benchmark from a paper).
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
          </div>

          <div style={{background:'#F9FAFB',border:'1px solid #E5E7EB',borderRadius:10,padding:'1rem 1.25rem',marginBottom:'1rem',display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))',gap:'.75rem'}}>
            <Stat label="Readings" value={metrics.n} />
            <Stat label="Replayed" value={metrics.nReplayed} />
            <Stat label="Stored HR — MAE"  value={metrics.storedMae?.toFixed(2) ?? '—'} unit="bpm" />
            <Stat label="Stored HR — RMSE" value={metrics.storedRmse?.toFixed(2) ?? '—'} unit="bpm" />
            <Stat label="Replay HR — MAE"  value={metrics.replayMae?.toFixed(2) ?? '—'} unit="bpm" />
            <Stat label="Replay HR — RMSE" value={metrics.replayRmse?.toFixed(2) ?? '—'} unit="bpm" />
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
                      <Td style={{color:'#6B7280'}}>{replay?.numericConfidence != null ? Math.round(replay.numericConfidence) : (r.raw_rppg_signal?.numericConfidence != null ? Math.round(r.raw_rppg_signal.numericConfidence) : '—')}</Td>
                      <Td style={{color:'#6B7280'}}>{r.hr_quality || '—'}</Td>
                    </tr>
                  )
                })}
                {readings.length === 0 && (
                  <tr><Td colSpan={9} style={{textAlign:'center',color:'#6B7280',padding:'2rem'}}>No readings with both a paired manual HR and a stored raw signal yet.</Td></tr>
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

function Th({ children, title }) {
  return <th title={title} style={{textAlign:'left',padding:'.6rem .75rem',fontSize:'.75rem',fontWeight:700,color:'#374151',textTransform:'uppercase',letterSpacing:'.03em',borderBottom:'1px solid #E5E7EB'}}>{children}</th>
}

function Td({ children, style, colSpan }) {
  return <td colSpan={colSpan} style={{padding:'.55rem .75rem',...style}}>{children}</td>
}
