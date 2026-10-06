import { useState, useRef } from 'react'
import { loadFaceMesh, sampleROI } from '../../lib/rppg'
import { saveValidationSubject, saveValidationReading } from '../../lib/supabase'
import { predictV3FromFrames, loadActiveV3ModelFromServer, framesToV3Features } from '../../lib/bpModelV3'

const TEAL = '#38B2AC'
const NAVY = '#0E2E38'
const RED  = '#DC2626'

// Admin upload path for external training samples (VitalVideos-Worldwide, SCAMPS,
// future partner datasets). Runs the uploaded video through the EXACT same
// face-mesh → sampleROI → {r,g,b,t} pipeline that live capture uses, then POSTs
// to the same /api/validation-* endpoints — zero schema drift, zero format
// mismatches. See task #611.
export default function VideoUploadModal({ onClose, onSaved, existingSubjects = [] }) {
  const [phase, setPhase]      = useState('form')
  const [file, setFile]        = useState(null)
  const [progress, setProgress] = useState('')
  const [error, setError]      = useState('')
  const [frameCount, setFrameCount] = useState(0)
  const [preview, setPreview]  = useState(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const framesRef = useRef([])
  const fpsRef    = useRef(30)
  const featsRef  = useRef(null)  // v3 features from extraction — carries tereHr for the save step

  // Form state
  const [subjectCode, setSubjectCode] = useState('')
  const [firstName, setFirstName]     = useState('')
  const [age, setAge]                 = useState('')
  const [sex, setSex]                 = useState('')
  const [fitzpatrick, setFitzpatrick] = useState('')
  const [sys, setSys]                 = useState('')
  const [dia, setDia]                 = useState('')
  const [hr, setHr]                   = useState('')
  const [spo2, setSpo2]               = useState('')
  const [sourceLabel, setSourceLabel] = useState('')
  const [hasHypertension, setHasHypertension] = useState('unknown')
  const [hasDiabetes, setHasDiabetes]         = useState('unknown')

  function reset() {
    setPhase('form'); setFile(null); setProgress(''); setError(''); setFrameCount(0); setPreview(null)
    framesRef.current = []; fpsRef.current = 30
  }

  async function extractFrames() {
    if (!file) { setError('Pick a video file first'); return }
    if (!sys || !dia) { setError('Reference systolic + diastolic required'); return }
    if (!subjectCode) { setError('Subject code required'); return }
    setPhase('extracting'); setError(''); setProgress('Loading face mesh…')

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) { setError('Video element missing'); setPhase('form'); return }

    try {
      const mesh = await loadFaceMesh()
      setProgress('Loading video…')
      video.src = URL.createObjectURL(file)
      video.muted = true
      video.playsInline = true
      await new Promise((res, rej) => {
        video.onloadedmetadata = () => res()
        video.onerror = () => rej(new Error('Video decode failed'))
      })

      fpsRef.current = 30  // overwritten from measured timestamps after extraction
      canvas.width  = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })

      const frames = []
      let faceMisses = 0
      const startTs = performance.now()

      await video.play().catch(() => {})

      const useRvfc = typeof video.requestVideoFrameCallback === 'function'
      await new Promise((resolve) => {
        let done = false
        const finish = () => { if (done) return; done = true; try { video.pause() } catch {} ; resolve() }
        video.onended = finish

        async function processFrame(now, _meta) {
          try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            await mesh.send({ image: canvas })
            const lms = mesh._latest?.multiFaceLandmarks?.[0]
            if (lms) {
              const rgb = sampleROI(canvas, lms, canvas.width, canvas.height)
              if (rgb) {
                frames.push({
                  r: Math.round(rgb[0]),
                  g: Math.round(rgb[1]),
                  b: Math.round(rgb[2]),
                  t: Math.round(performance.now() - startTs),
                })
              } else { faceMisses++ }
            } else { faceMisses++ }
            if (frames.length % 15 === 0) {
              setFrameCount(frames.length)
              setProgress(`Extracting frames… ${frames.length} captured, ${faceMisses} face misses`)
            }
          } catch (e) { console.warn('[VideoUpload] frame error', e); faceMisses++ }

          if (video.ended || video.paused) return finish()
          if (useRvfc) video.requestVideoFrameCallback(processFrame)
          else setTimeout(() => processFrame(performance.now()), 33)
        }

        if (useRvfc) video.requestVideoFrameCallback(processFrame)
        else processFrame(performance.now())
      })

      if (frames.length < 300) {
        setError(`Only ${frames.length} face frames captured (need ≥300 = 10 sec). Face detection may have failed — check the video is a frontal face shot.`)
        setPhase('form'); return
      }

      // Measure actual fps from captured frame timestamps so posRppg's windowing
      // math stays correct even when source isn't 30 fps.
      if (frames.length >= 2) {
        const durSec = (frames[frames.length - 1].t - frames[0].t) / 1000
        if (durSec > 0.5) fpsRef.current = Math.round((frames.length - 1) / durSec)
      }
      try { URL.revokeObjectURL(video.src) } catch {}

      framesRef.current = frames
      setFrameCount(frames.length)
      setProgress(`Captured ${frames.length} frames @ ~${fpsRef.current} fps. Running v3 preview…`)

      // Run v3 preview so admin can sanity-check the extraction before submit.
      // Also extract features once (predictV3FromFrames does this internally but
      // throws them away) so we can grab tereHr/tereRr for the save payload.
      const sub = { age: Number(age) || null, sex: sex || null, fitzpatrickScale: Number(fitzpatrick) || null }
      featsRef.current = framesToV3Features(frames, fpsRef.current, sub)
      try {
        const model = await loadActiveV3ModelFromServer()
        if (model) {
          const pred = predictV3FromFrames(model, frames, fpsRef.current, sub)
          if (pred && !pred.skipped) {
            setPreview({ sys: pred.systolic, dia: pred.diastolic })
          } else {
            setPreview({ skipped: true, reason: pred?.reason || 'unknown' })
          }
        } else {
          setPreview({ skipped: true, reason: 'no v3 model loaded' })
        }
      } catch (e) { setPreview({ skipped: true, reason: e.message }) }

      setPhase('preview')
    } catch (e) {
      console.error('[VideoUpload] extraction failed:', e)
      setError(e.message || String(e))
      setPhase('form')
    }
  }

  async function submit() {
    setPhase('submitting'); setError('')
    try {
      // Reuse existing subject row if subjectCode already exists; otherwise create.
      let subjectId = existingSubjects.find(s => s.subject_code === subjectCode)?.id || null
      if (!subjectId) {
        const subj = await saveValidationSubject({
          subjectCode,
          firstName: firstName || subjectCode,
          age: Number(age) || null,
          sex: sex || null,
          heightCm: null,
          weightKg: null,
          fitzpatrickScale: Number(fitzpatrick) || null,
          hasHypertension,
          hasDiabetes,
          hasRegularMedications: false,
        })
        subjectId = subj.id
      }

      const reading = await saveValidationReading({
        subjectId,
        subjectCode,
        manualSystolic:  Number(sys),
        manualDiastolic: Number(dia),
        manualHr:   hr ? Number(hr) : null,
        manualSpO2: spo2 ? Number(spo2) : null,
        tereHr: featsRef.current?.hr != null ? Math.round(featsRef.current.hr * 10) / 10 : null,
        tereRr: null,  // RR isn't a v3 feature — would need a separate respiratoryFreqHz call
        tereSpo2: null,  // SpO2 needs the full posRppg R-channel pipeline, out of scope here
        rawRppgSignal: {
          frames: framesRef.current,
          fps: fpsRef.current,
          numericConfidence: null,
        },
        deviceInfo: {
          source: sourceLabel || 'external-upload',
          ingestion_method: 'VideoUploadModal',
          original_filename: file?.name,
          original_size_bytes: file?.size,
        },
        notes: `External upload. ${sourceLabel || 'source unspecified'}.`,
        hrQuality: 'good',
      })

      setProgress(`Reading saved: id=${reading.id}`)
      setPhase('done')
      if (onSaved) onSaved(reading)
    } catch (e) {
      console.error('[VideoUpload] submit failed:', e)
      setError(e.message || String(e))
      setPhase('preview')
    }
  }

  const field = {
    padding: '.5rem .75rem', borderRadius: 8, border: '1.5px solid #E5E7EB',
    fontSize: '.9rem', width: '100%', boxSizing: 'border-box',
  }
  const label = { display: 'block', fontSize: '.75rem', fontWeight: 600, color: '#6B7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.03em' }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(14,46,56,.6)', zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div style={{ background: 'white', borderRadius: 16, padding: '1.5rem', maxWidth: 640, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: NAVY }}>Upload external training sample</div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: '1.4rem', color: '#9CA3AF', cursor: 'pointer' }}>×</button>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: `1.5px solid ${RED}33`, color: RED, padding: '.75rem', borderRadius: 8, marginBottom: '1rem', fontSize: '.85rem' }}>
            {error}
          </div>
        )}

        {phase === 'form' && (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <label style={label}>Video file (.mp4 / .mov) — frontal face, ≥10 sec</label>
              <input type="file" accept="video/*" onChange={e => setFile(e.target.files?.[0] || null)} style={field} />
              {file && <div style={{ fontSize: '.75rem', color: '#6B7280', marginTop: 4 }}>{file.name} · {(file.size / 1e6).toFixed(1)} MB</div>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginBottom: '.75rem' }}>
              <div>
                <label style={label}>Subject code *</label>
                <input value={subjectCode} onChange={e => setSubjectCode(e.target.value.toUpperCase())} placeholder="VV-SUB04" style={field} />
              </div>
              <div>
                <label style={label}>Display name</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="defaults to code" style={field} />
              </div>
              <div>
                <label style={label}>Age</label>
                <input type="number" value={age} onChange={e => setAge(e.target.value)} style={field} />
              </div>
              <div>
                <label style={label}>Sex</label>
                <select value={sex} onChange={e => setSex(e.target.value)} style={field}>
                  <option value="">—</option>
                  <option value="male">male</option>
                  <option value="female">female</option>
                  <option value="other">other</option>
                </select>
              </div>
              <div>
                <label style={label}>Fitzpatrick 1-6</label>
                <select value={fitzpatrick} onChange={e => setFitzpatrick(e.target.value)} style={field}>
                  <option value="">—</option>
                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Hypertension</label>
                <select value={hasHypertension} onChange={e => setHasHypertension(e.target.value)} style={field}>
                  <option value="unknown">unknown</option>
                  <option value="high">yes</option>
                  <option value="low">no</option>
                </select>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '.75rem', marginTop: '.5rem' }}>
              <div style={{ fontSize: '.75rem', fontWeight: 700, color: NAVY, marginBottom: '.5rem' }}>REFERENCE READINGS (cuff / pulse-ox)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '.5rem' }}>
                <div>
                  <label style={label}>Systolic *</label>
                  <input type="number" value={sys} onChange={e => setSys(e.target.value)} style={field} placeholder="171" />
                </div>
                <div>
                  <label style={label}>Diastolic *</label>
                  <input type="number" value={dia} onChange={e => setDia(e.target.value)} style={field} placeholder="82" />
                </div>
                <div>
                  <label style={label}>HR</label>
                  <input type="number" value={hr} onChange={e => setHr(e.target.value)} style={field} placeholder="79" />
                </div>
                <div>
                  <label style={label}>SpO2</label>
                  <input type="number" value={spo2} onChange={e => setSpo2(e.target.value)} style={field} placeholder="97" />
                </div>
              </div>
            </div>

            <div style={{ marginTop: '.75rem' }}>
              <label style={label}>Source label</label>
              <input value={sourceLabel} onChange={e => setSourceLabel(e.target.value)} placeholder="VitalVideos-Worldwide / SCAMPS / etc" style={field} />
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '.5rem' }}>
              <button onClick={onClose} style={{ padding: '.6rem 1.2rem', borderRadius: 10, border: '1.5px solid #E5E7EB', background: 'white', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={extractFrames} style={{ padding: '.6rem 1.2rem', borderRadius: 10, border: 'none', background: TEAL, color: 'white', fontWeight: 700, cursor: 'pointer', marginLeft: 'auto' }}>
                Extract frames
              </button>
            </div>
          </>
        )}

        {(phase === 'extracting' || phase === 'submitting') && (
          <div style={{ padding: '2rem 0', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>⚙️</div>
            <div style={{ color: NAVY, fontWeight: 600, marginBottom: '.5rem' }}>{progress || 'Working…'}</div>
            {frameCount > 0 && (
              <div style={{ fontSize: '.8rem', color: '#6B7280' }}>{frameCount} frames so far</div>
            )}
          </div>
        )}

        {phase === 'preview' && (
          <div>
            <div style={{ background: '#F0FDFA', border: `1.5px solid ${TEAL}33`, padding: '1rem', borderRadius: 10, marginBottom: '1rem' }}>
              <div style={{ fontSize: '.75rem', fontWeight: 700, color: NAVY, marginBottom: '.5rem' }}>EXTRACTION COMPLETE</div>
              <div style={{ fontSize: '.9rem', color: NAVY }}>{frameCount} face frames captured at ~{fpsRef.current} fps</div>
              <div style={{ fontSize: '.75rem', color: '#6B7280', marginTop: 4 }}>Reference BP: {sys}/{dia} mmHg · Tere HR (extracted): {featsRef.current?.hr != null ? `${Math.round(featsRef.current.hr * 10) / 10} bpm` : '—'}</div>
            </div>

            <div style={{ background: '#FAFAFA', border: '1.5px solid #E5E7EB', padding: '1rem', borderRadius: 10, marginBottom: '1rem' }}>
              <div style={{ fontSize: '.75rem', fontWeight: 700, color: NAVY, marginBottom: '.5rem' }}>v3 PREVIEW PREDICTION (not yet saved)</div>
              {preview?.sys ? (
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: NAVY }}>
                  {preview.sys}/{preview.dia} mmHg
                  <span style={{ fontSize: '.8rem', color: '#6B7280', fontWeight: 400, marginLeft: '.5rem' }}>
                    (vs ref {sys}/{dia} → sys err {preview.sys - Number(sys)>=0?'+':''}{preview.sys - Number(sys)})
                  </span>
                </div>
              ) : (
                <div style={{ fontSize: '.85rem', color: '#DD6B20' }}>v3 skipped: {preview?.reason || 'unknown'}</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '.5rem' }}>
              <button onClick={reset} style={{ padding: '.6rem 1.2rem', borderRadius: 10, border: '1.5px solid #E5E7EB', background: 'white', fontWeight: 600, cursor: 'pointer' }}>Back</button>
              <button onClick={submit} style={{ padding: '.6rem 1.2rem', borderRadius: 10, border: 'none', background: TEAL, color: 'white', fontWeight: 700, cursor: 'pointer', marginLeft: 'auto' }}>
                Save to training set
              </button>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div style={{ padding: '1rem 0', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>✅</div>
            <div style={{ color: NAVY, fontWeight: 700, marginBottom: '.25rem' }}>Saved to validation_readings</div>
            <div style={{ fontSize: '.8rem', color: '#6B7280', marginBottom: '1rem' }}>{progress}</div>
            <button onClick={() => { reset(); onClose() }} style={{ padding: '.6rem 1.2rem', borderRadius: 10, border: 'none', background: TEAL, color: 'white', fontWeight: 700, cursor: 'pointer' }}>Done</button>
          </div>
        )}

        <video ref={videoRef} style={{ display: 'none' }} playsInline muted />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </div>
  )
}
