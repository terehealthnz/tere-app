import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { RED_FLAGS, DIVERT_FLAGS, DIVERT_REASONS, DIVERT_ED_SAME_DAY } from '../../lib/triageSafetyGates'

// Two-phase safety screen (task #416):
//   PHASE 1 — red flags (any YES → 111)
//   PHASE 2 — divert flags (any YES → in-person / GP / urgent care, NOT video)
// System-enforced: patient cannot proceed to video pathway if any DIVERT
// answer is YES. See src/lib/triageSafetyGates.js for the reasoning.

export default function Triage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [phase, setPhase] = useState('red')       // 'red' | 'divert'
  const [redAns, setRedAns] = useState({})
  const [divertAns, setDivertAns] = useState({})
  const [redFired, setRedFired] = useState(false)
  const [divertFired, setDivertFired] = useState(false)

  const redAnsweredCount    = Object.keys(redAns).length
  const redAllAnswered      = redAnsweredCount === RED_FLAGS.length
  const redHasYes           = Object.values(redAns).some(v => v === true)

  const divertAnsweredCount = Object.keys(divertAns).length
  const divertAllAnswered   = divertAnsweredCount === DIVERT_FLAGS.length
  const divertHasYes        = Object.values(divertAns).some(v => v === true)
  const divertYesIds        = Object.entries(divertAns).filter(([, v]) => v === true).map(([k]) => k)
  const divertEdToday       = divertYesIds.some(k => DIVERT_ED_SAME_DAY.has(k))

  const auditGateFired = (kind, matched) => {
    // Fire-and-forget audit trail — proves the control operated if a
    // regulator asks. `matched` is the set of flag IDs that triggered.
    apiFetch('/api/audit-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:          kind === 'red' ? 'triage_red_flag_fired' : 'triage_divert_fired',
        consultation_id: id || null,
        resource_type:   'consultation',
        resource_id:     id || null,
        metadata:        { matched, source: 'Triage.jsx' },
      }),
    }).catch(() => {})
  }

  const handleRedAnswer = (flagId, value) => {
    const next = { ...redAns, [flagId]: value }
    setRedAns(next)
    if (value === true && !redFired) {
      setRedFired(true)
      auditGateFired('red', [flagId])
    }
  }

  const handleDivertAnswer = (flagId, value) => {
    const next = { ...divertAns, [flagId]: value }
    setDivertAns(next)
    if (value === true && !divertFired) {
      setDivertFired(true)
      auditGateFired('divert', [flagId])
    }
  }

  const handleContinueToDivert = () => setPhase('divert')
  const handleContinueToVitals  = () => navigate(`/vitals/${id}`)

  // ── 111 REDIRECT SCREEN ──────────────────────────────────────────────────
  if (redHasYes) {
    return (
      <div className="page-shell" style={{ background: '#FEF2F2' }}>
        <header className="page-header"><span className="page-logo">TERE</span></header>
        <div className="page-content" style={{ display:'flex', alignItems:'center' }}>
          <div className="card" style={{ borderColor: 'var(--danger)', textAlign:'center' }}>
            <div style={{ width: 80, height: 80, background: 'var(--danger-bg)', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.5rem', fontSize: '2.5rem' }}>🚨</div>
            <h1 style={{ color: 'var(--danger)', fontSize: '1.6rem', marginBottom: '0.75rem' }}>Call 111 Now</h1>
            <p style={{ fontSize: '1.05rem', marginBottom: '1.5rem', color: 'var(--text)' }}>
              Your symptoms need <strong>immediate emergency care</strong>. Tere cannot safely manage this by video.
            </p>
            <a href="tel:111" className="btn btn-danger btn-lg"
              style={{ width: '100%', fontSize: '1.3rem', padding: '1rem', marginBottom: '1rem' }}>
              📞 Call 111
            </a>
            <div className="alert alert-danger" style={{ textAlign:'left' }}>
              <div>
                <strong>Tell the operator:</strong>
                <ul style={{ marginTop: 6, paddingLeft: '1.25rem', lineHeight: 2 }}>
                  <li>Your name and location</li>
                  <li>What is happening right now</li>
                  <li>Whether you are alone</li>
                </ul>
              </div>
            </div>
            <p style={{ fontSize:'0.8rem', color:'var(--muted)', marginTop:'1rem' }}>
              If you believe this was answered incorrectly,{' '}
              <button className="btn btn-ghost btn-sm"
                onClick={() => { setRedAns({}); setRedFired(false) }}
                style={{ textDecoration:'underline', fontSize:'0.8rem' }}>
                go back
              </button>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── DIVERT SCREEN (in-person, not 111) ───────────────────────────────────
  if (divertHasYes) {
    const matchedReasons = divertYesIds.map(id => ({ id, reason: DIVERT_REASONS[id] || '' }))
    const isSelfHarm     = divertYesIds.includes('self_harm_ideation')
    return (
      <div className="page-shell" style={{ background: '#FEF3C7' }}>
        <header className="page-header"><span className="page-logo">TERE</span></header>
        <div className="page-content" style={{ display:'flex', alignItems:'center' }}>
          <div className="card" style={{ borderColor: '#D97706', textAlign:'center' }}>
            <div style={{ width: 80, height: 80, background: '#FEF3C7', border: '3px solid #D97706',
              borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.5rem', fontSize: '2.5rem' }}>🏥</div>
            <h1 style={{ color: '#92400E', fontSize: '1.6rem', marginBottom: '0.75rem' }}>
              {divertEdToday ? 'Please seek in-person care today' : 'Please see a doctor in person'}
            </h1>
            <p style={{ fontSize: '1.05rem', marginBottom: '1.25rem', color: 'var(--text)' }}>
              Based on your answers, Tere <strong>cannot safely manage this by video</strong>.
              You need an in-person examination.
            </p>

            <div className="alert" style={{ background: 'white', border: '1px solid #FDE68A',
              textAlign: 'left', marginBottom: '1rem', color: '#78350F' }}>
              <strong style={{ display: 'block', marginBottom: 6 }}>Why:</strong>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.7 }}>
                {matchedReasons.map(r => (
                  <li key={r.id} style={{ marginBottom: 4 }}>{r.reason}</li>
                ))}
              </ul>
            </div>

            <div style={{ display: 'grid', gap: 8, marginTop: '1rem' }}>
              {divertEdToday && (
                <a href="tel:111" className="btn btn-danger btn-lg" style={{ width: '100%' }}>
                  📞 If worsening, call 111
                </a>
              )}
              {isSelfHarm && (
                <a href="tel:1737" className="btn btn-primary btn-lg" style={{ width: '100%', background: '#7C3AED' }}>
                  📞 Call or text 1737 (free, 24/7)
                </a>
              )}
              <a href="https://www.healthpoint.co.nz/urgent-care/" target="_blank" rel="noreferrer"
                className="btn btn-primary btn-lg" style={{ width: '100%' }}>
                🏥 Find urgent care near me
              </a>
              <a href="https://www.healthpoint.co.nz/gps-accident-medical/" target="_blank" rel="noreferrer"
                className="btn btn-secondary btn-lg" style={{ width: '100%' }}>
                👨‍⚕️ Find a GP near me
              </a>
            </div>

            <p style={{ fontSize:'0.8rem', color:'var(--muted)', marginTop:'1.25rem', lineHeight: 1.5 }}>
              If your symptoms get worse — trouble breathing, severe pain, confusion, or you feel unsafe —
              call <a href="tel:111" style={{ color: 'var(--danger)', fontWeight: 700 }}>111</a> immediately.
            </p>
            <p style={{ fontSize:'0.75rem', color:'var(--muted)', marginTop:'0.75rem' }}>
              Answered wrong?{' '}
              <button className="btn btn-ghost btn-sm"
                onClick={() => { setDivertAns({}); setDivertFired(false) }}
                style={{ textDecoration:'underline', fontSize:'0.75rem' }}>
                go back
              </button>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── STEPS INDICATOR (shared across both Q phases) ────────────────────────
  const stepsIndicator = (
    <div className="steps">
      <div className="step-item">
        <div className="step-dot done">✓</div>
        <span className="step-label">Your details</span>
      </div>
      <div className="step-line done"></div>
      <div className="step-item">
        <div className="step-dot active">2</div>
        <span className="step-label active">Safety check</span>
      </div>
      <div className="step-line"></div>
      <div className="step-item">
        <div className="step-dot todo">3</div>
        <span className="step-label">Vitals</span>
      </div>
      <div className="step-line"></div>
      <div className="step-item">
        <div className="step-dot todo">4</div>
        <span className="step-label">See doctor</span>
      </div>
    </div>
  )

  // ── PHASE 1: RED FLAG QUESTIONS ──────────────────────────────────────────
  if (phase === 'red') {
    return (
      <div className="page-shell">
        <header className="page-header"><span className="page-logo">TERE</span></header>
        <div className="page-content">
          {stepsIndicator}
          <div className="card">
            <h1 style={{ fontSize:'1.3rem', marginBottom:'0.25rem' }}>Quick safety check</h1>
            <p style={{ color:'var(--muted)', fontSize:'0.875rem', marginBottom:'1.5rem' }}>
              Step 1 of 2 — emergency check. Answer yes or no.
            </p>

            {RED_FLAGS.map((flag, i) => (
              <div key={flag.id} style={{
                padding: '1rem', borderRadius: 'var(--radius)',
                border: `1.5px solid ${redAns[flag.id] === undefined ? 'var(--border)' : redAns[flag.id] ? 'var(--danger)' : 'var(--success)'}`,
                background: redAns[flag.id] === undefined ? 'white' : redAns[flag.id] ? 'var(--danger-bg)' : 'var(--success-bg)',
                marginBottom: '0.75rem', transition: 'all 0.15s'
              }}>
                <p style={{ fontWeight: 500, marginBottom: '0.75rem', fontSize:'0.95rem' }}>
                  {i + 1}. {flag.q}
                </p>
                <div style={{ display:'flex', gap:8 }}>
                  <button
                    className={`btn btn-sm ${redAns[flag.id] === true ? 'btn-danger' : 'btn-secondary'}`}
                    onClick={() => handleRedAnswer(flag.id, true)}
                    style={{ flex:1 }}>Yes</button>
                  <button
                    className={`btn btn-sm ${redAns[flag.id] === false ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => handleRedAnswer(flag.id, false)}
                    style={{ flex:1 }}>No</button>
                </div>
              </div>
            ))}

            {redAllAnswered && !redHasYes && (
              <button onClick={handleContinueToDivert} className="btn btn-primary btn-lg"
                style={{ width:'100%', marginTop:'0.5rem' }}>
                Continue — one more check →
              </button>
            )}
            {!redAllAnswered && (
              <p style={{ textAlign:'center', fontSize:'0.85rem', color:'var(--muted)', marginTop:'0.5rem' }}>
                {RED_FLAGS.length - redAnsweredCount} question{RED_FLAGS.length - redAnsweredCount !== 1 ? 's' : ''} remaining
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── PHASE 2: DIVERT QUESTIONS ────────────────────────────────────────────
  return (
    <div className="page-shell">
      <header className="page-header"><span className="page-logo">TERE</span></header>
      <div className="page-content">
        {stepsIndicator}
        <div className="card">
          <h1 style={{ fontSize:'1.3rem', marginBottom:'0.25rem' }}>Nearly there</h1>
          <p style={{ color:'var(--muted)', fontSize:'0.875rem', marginBottom:'1.5rem' }}>
            Step 2 of 2 — some presentations need hands-on care rather than video. Answer yes or no.
          </p>

          {DIVERT_FLAGS.map((flag, i) => (
            <div key={flag.id} style={{
              padding: '1rem', borderRadius: 'var(--radius)',
              border: `1.5px solid ${divertAns[flag.id] === undefined ? 'var(--border)' : divertAns[flag.id] ? '#D97706' : 'var(--success)'}`,
              background: divertAns[flag.id] === undefined ? 'white' : divertAns[flag.id] ? '#FEF3C7' : 'var(--success-bg)',
              marginBottom: '0.75rem', transition: 'all 0.15s'
            }}>
              <p style={{ fontWeight: 500, marginBottom: '0.75rem', fontSize:'0.95rem' }}>
                {i + 1}. {flag.q}
              </p>
              <div style={{ display:'flex', gap:8 }}>
                <button
                  className={`btn btn-sm ${divertAns[flag.id] === true ? 'btn-danger' : 'btn-secondary'}`}
                  style={{ flex:1, background: divertAns[flag.id] === true ? '#D97706' : undefined, color: divertAns[flag.id] === true ? 'white' : undefined }}
                  onClick={() => handleDivertAnswer(flag.id, true)}>Yes</button>
                <button
                  className={`btn btn-sm ${divertAns[flag.id] === false ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleDivertAnswer(flag.id, false)}
                  style={{ flex:1 }}>No</button>
              </div>
            </div>
          ))}

          {divertAllAnswered && !divertHasYes && (
            <button onClick={handleContinueToVitals} className="btn btn-primary btn-lg"
              style={{ width:'100%', marginTop:'0.5rem' }}>
              All good — continue →
            </button>
          )}
          {!divertAllAnswered && (
            <p style={{ textAlign:'center', fontSize:'0.85rem', color:'var(--muted)', marginTop:'0.5rem' }}>
              {DIVERT_FLAGS.length - divertAnsweredCount} question{DIVERT_FLAGS.length - divertAnsweredCount !== 1 ? 's' : ''} remaining
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
