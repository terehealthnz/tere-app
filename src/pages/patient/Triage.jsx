import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

// Red-flag questions — any YES = immediate 111 redirect
const RED_FLAGS = [
  { id: 'chest_pain',    q: 'Do you have chest pain, chest tightness, or pain spreading to your arm or jaw?' },
  { id: 'breathing',     q: 'Are you having severe difficulty breathing or feeling like you cannot breathe?' },
  { id: 'stroke',        q: 'Do you have sudden face drooping, arm weakness, or speech difficulty?' },
  { id: 'unconscious',   q: 'Have you been unconscious, or are you very difficult to wake up?' },
  { id: 'major_bleed',   q: 'Do you have severe bleeding that will not stop with pressure?' },
  { id: 'major_trauma',  q: 'Have you had a serious fall, car crash, or major impact injury?' },
  { id: 'allergic',      q: 'Are you having a severe allergic reaction (throat swelling, hives all over, collapse)?' },
]

export default function Triage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState(false)

  const answered = Object.keys(answers).length
  const hasRedFlag = Object.values(answers).some(v => v === true)
  const allAnswered = answered === RED_FLAGS.length

  const handleAnswer = (flagId, value) => {
    const next = { ...answers, [flagId]: value }
    setAnswers(next)
    // Immediately show 111 screen if red flag triggered
    if (value === true) setSubmitted(true)
  }

  const handleContinue = () => {
    navigate(`/vitals/${id}`)
  }

  // ── 111 redirect screen ─────────────────────────────────────────────────
  if (submitted && hasRedFlag) {
    return (
      <div className="page-shell" style={{ background: '#FEF2F2' }}>
        <header className="page-header">
          <span className="page-logo">TERE</span>
        </header>
        <div className="page-content" style={{ display:'flex', alignItems:'center' }}>
          <div className="card" style={{ borderColor: 'var(--danger)', textAlign:'center' }}>
            <div style={{
              width: 80, height: 80, background: 'var(--danger-bg)', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.5rem', fontSize: '2.5rem'
            }}>🚨</div>

            <h1 style={{ color: 'var(--danger)', fontSize: '1.6rem', marginBottom: '0.75rem' }}>
              Call 111 Now
            </h1>
            <p style={{ fontSize: '1.05rem', marginBottom: '1.5rem', color: 'var(--text)' }}>
              Your symptoms need <strong>immediate emergency care</strong>.
              Tere cannot safely manage this by video.
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
                onClick={() => { setAnswers({}); setSubmitted(false); }}
                style={{ textDecoration:'underline', fontSize:'0.8rem' }}>
                go back
              </button>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell">
      <header className="page-header">
        <span className="page-logo">TERE</span>
        <span style={{ fontSize:'0.8rem', color:'rgba(255,255,255,0.45)' }}>He tere, he ora</span>
      </header>

      <div className="page-content">
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

        <div className="card">
          <h1 style={{ fontSize:'1.3rem', marginBottom:'0.25rem' }}>Quick safety check</h1>
          <p style={{ color:'var(--muted)', fontSize:'0.875rem', marginBottom:'1.5rem' }}>
            Answer yes or no. If you have an emergency, we'll direct you immediately.
          </p>

          {RED_FLAGS.map((flag, i) => (
            <div key={flag.id} style={{
              padding: '1rem', borderRadius: 'var(--radius)',
              border: `1.5px solid ${answers[flag.id] === undefined ? 'var(--border)' : answers[flag.id] ? 'var(--danger)' : 'var(--success)'}`,
              background: answers[flag.id] === undefined ? 'white' : answers[flag.id] ? 'var(--danger-bg)' : 'var(--success-bg)',
              marginBottom: '0.75rem', transition: 'all 0.15s'
            }}>
              <p style={{ fontWeight: 500, marginBottom: '0.75rem', fontSize:'0.95rem' }}>
                {i + 1}. {flag.q}
              </p>
              <div style={{ display:'flex', gap:8 }}>
                <button
                  className={`btn btn-sm ${answers[flag.id] === true ? 'btn-danger' : 'btn-secondary'}`}
                  onClick={() => handleAnswer(flag.id, true)}
                  style={{ flex:1 }}>
                  Yes
                </button>
                <button
                  className={`btn btn-sm ${answers[flag.id] === false ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleAnswer(flag.id, false)}
                  style={{ flex:1 }}>
                  No
                </button>
              </div>
            </div>
          ))}

          {allAnswered && !hasRedFlag && (
            <button onClick={handleContinue} className="btn btn-primary btn-lg"
              style={{ width:'100%', marginTop:'0.5rem' }}>
              All good — continue →
            </button>
          )}

          {!allAnswered && (
            <p style={{ textAlign:'center', fontSize:'0.85rem', color:'var(--muted)', marginTop:'0.5rem' }}>
              {RED_FLAGS.length - answered} question{RED_FLAGS.length - answered !== 1 ? 's' : ''} remaining
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
