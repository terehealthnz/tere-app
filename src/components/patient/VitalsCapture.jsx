import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { RppgMeasurement } from '../../lib/rppg'
import { updateVitals } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'

const STATES = {
  REQUESTING: 'requesting',
  READY:      'ready',
  MEASURING:  'measuring',
  DONE:       'done',
  ERROR:      'error',
}

export default function VitalsCapture() {
  const navigate = useNavigate()
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const measureRef = useRef(null)
  const streamRef  = useRef(null)

  const [uiState, setUiState]   = useState(STATES.REQUESTING)
  const [progress, setProgress] = useState(0)
  const [liveHR, setLiveHR]     = useState(null)
  const [vitals, setVitals]     = useState(null)
  const [error, setError]       = useState('')
  const [manualMode, setManualMode] = useState(false)
  const [manual, setManual]     = useState({ hr:'', rr:'', spo2:'', bp:'' })

  // Request camera
  useEffect(() => {
    async function requestCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480, frameRate: 30 },
          audio: false,
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setUiState(STATES.READY)
      } catch (e) {
        setError('Camera access denied. Please allow camera access and refresh, or use manual entry below.')
        setUiState(STATES.ERROR)
      }
    }
    requestCamera()
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      measureRef.current?.stop()
    }
  }, [])

  async function startMeasurement() {
    setUiState(STATES.MEASURING)
    setProgress(0)
    setLiveHR(null)

    measureRef.current = new RppgMeasurement(
      // onProgress
      (pct, rawHR) => {
        setProgress(pct)
        if (rawHR) setLiveHR(rawHR)
      },
      // onComplete
      async (result) => {
        setVitals(result)
        setUiState(STATES.DONE)
        // Save vitals and set status: vitals_complete
        const id = sessionStorage.getItem('consultationId')
        if (id && !id.startsWith('demo')) {
          try {
            await updateVitals(id, result)
            // Notify provider that vitals are ready
            apiFetch('/api/push-notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type:'vitals_ready', consultationId:id }),
            }).catch(() => {})
          } catch {}
        } else {
          sessionStorage.setItem('vitals', JSON.stringify(result))
        }
        streamRef.current?.getTracks().forEach(t => t.stop())
      },
      // onError
      (msg) => {
        setError(msg)
        setUiState(STATES.ERROR)
      }
    )

    await measureRef.current.start(videoRef.current, canvasRef.current)
  }

  async function saveManual() {
    const result = {
      hr:   manual.hr   ? parseInt(manual.hr)  : null,
      rr:   manual.rr   ? parseInt(manual.rr)  : null,
      spo2: manual.spo2 ? parseInt(manual.spo2): null,
      bp:   manual.bp   || null,
      source: 'manual',
      note: 'Manually entered by patient',
    }
    const cId = sessionStorage.getItem('consultationId')
    if (cId && !cId.startsWith('demo')) {
      try {
        await updateVitals(cId, result)
        apiFetch('/api/push-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type:'vitals_ready', consultationId:cId }),
        }).catch(() => {})
      } catch {}
    } else {
      sessionStorage.setItem('vitals', JSON.stringify(result))
    }
    navigate('/waiting')
  }

  async function skip() {
    try {
      const cId = sessionStorage.getItem('consultationId')
      if (cId && !cId.startsWith('demo')) {
        const { supabase } = await import('../../lib/supabase')
        await supabase.from('consultations').update({
          status: 'vitals_complete',
          vitals: { skipped: true },
          vitals_at: new Date().toISOString()
        }).eq('id', cId)
      } else {
        sessionStorage.setItem('vitals', JSON.stringify({ skipped: true }))
      }
    } catch {}
    navigate('/waiting')
  }

  const hrStatus = vitals?.hr
    ? vitals.hr < 60 ? 'warning' : vitals.hr > 100 ? 'warning' : 'normal'
    : 'normal'
  const rrStatus = vitals?.rr
    ? vitals.rr < 12 ? 'warning' : vitals.rr > 20 ? 'warning' : 'normal'
    : 'normal'

  return (
    <div className="page">
      <nav className="navbar">
        <span className="navbar-brand">Tere</span>
        <span style={{color:'rgba(255,255,255,.5)',fontSize:'.875rem'}}>Vital signs</span>
      </nav>

      <div className="container" style={{paddingTop:'1.75rem',paddingBottom:'5rem'}}>

        {!manualMode ? (
          <div className="card">
            <h2 style={{marginBottom:'.375rem'}}>Measure your vital signs</h2>
            <p style={{marginBottom:'1.25rem',fontSize:'.9375rem'}}>
              Your phone camera will measure your heart rate and breathing rate in 30 seconds.
              No attachments needed.
            </p>

            {/* Camera preview */}
            <div style={{position:'relative',borderRadius:'var(--radius-sm)',overflow:'hidden',background:'#0D1117',marginBottom:'1.25rem',aspectRatio:'4/3',maxHeight:'280px'}}>
              <video ref={videoRef} style={{width:'100%',height:'100%',objectFit:'cover',transform:'scaleX(-1)'}} muted playsInline />
              <canvas ref={canvasRef} width={640} height={480} style={{display:'none'}} />

              {/* Progress overlay */}
              {uiState === STATES.MEASURING && (
                <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,.35)'}}>
                  {/* Circular progress */}
                  <svg width="100" height="100" style={{marginBottom:'12px'}}>
                    <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="6" />
                    <circle cx="50" cy="50" r="44" fill="none" stroke="#0B6E76" strokeWidth="6"
                      strokeDasharray={`${2*Math.PI*44}`}
                      strokeDashoffset={`${2*Math.PI*44 * (1 - progress/100)}`}
                      strokeLinecap="round"
                      style={{transform:'rotate(-90deg)',transformOrigin:'50px 50px',transition:'stroke-dashoffset .5s'}} />
                    <text x="50" y="50" textAnchor="middle" dominantBaseline="central"
                      style={{fill:'white',fontSize:'18px',fontWeight:'700',fontFamily:'Plus Jakarta Sans'}}>
                      {progress}%
                    </text>
                  </svg>
                  {liveHR && (
                    <div style={{color:'white',textAlign:'center'}}>
                      <div style={{fontSize:'1.5rem',fontWeight:'700'}}>❤️ {liveHR}</div>
                      <div style={{fontSize:'.75rem',color:'rgba(255,255,255,.6)'}}>bpm (live)</div>
                    </div>
                  )}
                </div>
              )}

              {uiState === STATES.READY && (
                <div style={{position:'absolute',bottom:'10px',left:0,right:0,textAlign:'center'}}>
                  <div style={{background:'rgba(0,0,0,.5)',color:'white',fontSize:'.8125rem',padding:'4px 12px',borderRadius:'99px',display:'inline-block',backdropFilter:'blur(4px)'}}>
                    Position your face in the frame
                  </div>
                </div>
              )}
            </div>

            {/* Instructions */}
            {(uiState === STATES.READY || uiState === STATES.REQUESTING) && (
              <div style={{background:'var(--bg)',borderRadius:'var(--radius-sm)',padding:'1rem',marginBottom:'1.25rem'}}>
                <div style={{fontSize:'.875rem',color:'var(--muted)',lineHeight:1.6}}>
                  <strong style={{color:'var(--text)',display:'block',marginBottom:'.375rem'}}>For best results:</strong>
                  Good lighting on your face (facing a window works well) · Stay still during the scan · Remove glasses if possible
                </div>
              </div>
            )}

            {/* Done — show results */}
            {uiState === STATES.DONE && vitals && (
              <>
                <div className="alert alert-success" style={{marginBottom:'1.25rem'}}>
                  <strong>Scan complete</strong>
                  Your vital signs have been sent to your doctor. These are indicative screening measurements.
                </div>
                <div className="vitals-grid" style={{marginBottom:'1.25rem'}}>
                  <div className={`vital-card ${hrStatus}`}>
                    <div className="vital-label">Heart Rate</div>
                    <div className={`vital-value ${hrStatus}`}>{vitals.hr ?? '—'}</div>
                    <div className="vital-unit">bpm</div>
                  </div>
                  <div className={`vital-card ${rrStatus}`}>
                    <div className="vital-label">Resp. Rate</div>
                    <div className={`vital-value ${rrStatus}`}>{vitals.rr ?? '—'}</div>
                    <div className="vital-unit">breaths/min</div>
                  </div>
                </div>
                <div style={{fontSize:'.8125rem',color:'var(--muted)',marginBottom:'1.25rem',background:'#FEF3C7',border:'1px solid #FDE68A',borderRadius:8,padding:'.625rem .875rem',fontStyle:'normal'}}>
                  <strong>Tere Vitals</strong> provides indicative screening estimates only. Results are not a substitute for medical-grade devices and must be interpreted by a registered clinician.
                </div>
              </>
            )}

            {/* Error */}
            {uiState === STATES.ERROR && error && (
              <div className="alert alert-warning" style={{marginBottom:'1.25rem'}}>
                <strong>Camera issue</strong>
                {error}
              </div>
            )}

            {/* Actions */}
            <div style={{display:'flex',flexDirection:'column',gap:'.75rem'}}>
              {uiState === STATES.READY && (
                <button className="btn btn-primary btn-full" onClick={startMeasurement}>
                  Start 30-second scan
                </button>
              )}
              {uiState === STATES.MEASURING && (
                <button className="btn btn-secondary btn-full" onClick={() => { measureRef.current?.stop(); setUiState(STATES.ERROR); setError('Measurement cancelled.') }}>
                  Cancel
                </button>
              )}
              {uiState === STATES.DONE && (
                <button className="btn btn-primary btn-full" onClick={() => navigate('/waiting')}>
                  Continue to consultation
                </button>
              )}
              {(uiState === STATES.ERROR || uiState === STATES.DONE) && (
                <button className="btn btn-secondary btn-full" onClick={() => setManualMode(true)}>
                  Enter vitals manually instead
                </button>
              )}
              {uiState !== STATES.MEASURING && uiState !== STATES.DONE && (
                <button className="btn btn-secondary btn-full" style={{color:'var(--muted)'}} onClick={skip}>
                  Skip vital signs
                </button>
              )}
              {uiState !== STATES.MEASURING && (
                <button className="btn btn-secondary btn-full" onClick={() => {
                  streamRef.current?.getTracks().forEach(t => t.stop())
                  navigate('/triage')
                }}>
                  ← Back to intake form
                </button>
              )}
            </div>

            <button onClick={() => setManualMode(true)} style={{background:'none',border:'none',color:'var(--muted)',fontSize:'.8125rem',marginTop:'1rem',cursor:'pointer',textDecoration:'underline',width:'100%',textAlign:'center'}}>
              Have a pulse oximeter or BP cuff? Enter your own readings
            </button>
          </div>
        ) : (
          /* Manual entry mode */
          <div className="card">
            <h2 style={{marginBottom:'.375rem'}}>Enter vital signs manually</h2>
            <p style={{marginBottom:'1.25rem',fontSize:'.9375rem'}}>
              If you have a pulse oximeter or blood pressure cuff, enter your readings here.
              All fields are optional.
            </p>
            <div className="form-row">
              <div className="form-group">
                <label>Heart Rate <span className="label-opt">(bpm)</span></label>
                <input type="number" min="30" max="250" placeholder="e.g. 80"
                  value={manual.hr} onChange={e => setManual(m => ({...m, hr: e.target.value}))} />
              </div>
              <div className="form-group">
                <label>Resp. Rate <span className="label-opt">(breaths/min)</span></label>
                <input type="number" min="5" max="50" placeholder="e.g. 16"
                  value={manual.rr} onChange={e => setManual(m => ({...m, rr: e.target.value}))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>SpO₂ <span className="label-opt">(%)</span></label>
                <input type="number" min="70" max="100" placeholder="e.g. 98"
                  value={manual.spo2} onChange={e => setManual(m => ({...m, spo2: e.target.value}))} />
              </div>
              <div className="form-group">
                <label>Blood Pressure</label>
                <input type="text" placeholder="e.g. 120/80"
                  value={manual.bp} onChange={e => setManual(m => ({...m, bp: e.target.value}))} />
              </div>
            </div>
            <div style={{display:'flex',gap:'.75rem',marginTop:'.5rem'}}>
              <button className="btn btn-secondary" onClick={() => setManualMode(false)}>Back</button>
              <button className="btn btn-primary" style={{flex:1}} onClick={saveManual}>
                Continue with these readings
              </button>
            </div>
            <button className="btn btn-secondary btn-full" style={{marginTop:'.75rem',color:'var(--muted)'}} onClick={skip}>
              Skip — continue without vitals
            </button>
          </div>
        )}
      </div>

      <div style={{position:'fixed',bottom:0,left:0,right:0,background:'rgba(255,255,255,.95)',borderTop:'1px solid var(--border)',padding:'.5rem 1rem',display:'flex',gap:'1.5rem',justifyContent:'center',fontSize:'.8125rem',color:'var(--muted)'}}>
        <span>Emergency? Call <strong>111</strong></span>
        <span>Mental health crisis? Call or text <strong>1737</strong></span>
      </div>
    </div>
  )
}
