import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const RULES = [
  { label: 'At least 12 characters', test: v => v.length >= 12 },
  { label: 'Uppercase letter',        test: v => /[A-Z]/.test(v) },
  { label: 'Lowercase letter',        test: v => /[a-z]/.test(v) },
  { label: 'Number',                  test: v => /\d/.test(v) },
  { label: 'Special character',       test: v => /[^A-Za-z\d]/.test(v) },
]

export default function ResetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') || ''

  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) setError('This reset link is missing its token. Request a new one.')
  }, [token])

  const rulesPassed = RULES.every(r => r.test(next))
  const passwordsMatch = next && next === confirm

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!token) return
    if (!rulesPassed) { setError('New password does not meet requirements.'); return }
    if (!passwordsMatch) { setError('Passwords do not match.'); return }

    setLoading(true)
    try {
      const res = await apiFetch('/api/provider-reset-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to reset password.')
        setLoading(false)
        return
      }
      setDone(true)
      setTimeout(() => navigate('/clinician'), 2500)
    } catch {
      setError('Connection error. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div className="page" style={{background:'var(--navy)',minHeight:'100dvh',alignItems:'center',justifyContent:'center',display:'flex'}}>
      <div style={{width:'100%',maxWidth:400,padding:'1.5rem'}}>
        <div style={{textAlign:'center',marginBottom:'2rem'}}>
          <div style={{fontFamily:'Cormorant Garamond, Georgia, serif',fontSize:'2.5rem',fontStyle:'italic',color:'var(--teal-light)',letterSpacing:'.08em',marginBottom:'.375rem'}}>
            Tere
          </div>
          <div style={{color:'rgba(255,255,255,.45)',fontSize:'.875rem',fontStyle:'italic'}}>Clinician dashboard</div>
        </div>

        <div className="card">
          {done ? (
            <div style={{textAlign:'center',padding:'.5rem 0'}}>
              <div style={{fontSize:'2.5rem',marginBottom:'1rem'}}>✅</div>
              <h2 style={{fontSize:'1.2rem',marginBottom:'.5rem'}}>Password updated</h2>
              <p style={{color:'var(--muted)',fontSize:'.9rem',marginBottom:'1.5rem',lineHeight:1.6}}>
                Redirecting you to sign in…
              </p>
            </div>
          ) : (
            <>
              <h2 style={{marginBottom:'.5rem'}}>Set a new password</h2>
              <p style={{fontSize:'.875rem',color:'var(--muted)',marginBottom:'1.5rem',lineHeight:1.6}}>
                Choose a strong password. You'll use this to sign in from now on.
              </p>

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>New password</label>
                  <input type="password" value={next} onChange={e => setNext(e.target.value)}
                    placeholder="Enter new password" required autoComplete="new-password" autoFocus disabled={!token} />
                </div>

                {next && (
                  <div style={{background:'var(--bg)',borderRadius:'var(--radius-sm)',padding:'.875rem',marginBottom:'1rem'}}>
                    {RULES.map(r => (
                      <div key={r.label} style={{display:'flex',alignItems:'center',gap:'.5rem',fontSize:'.8125rem',marginBottom:'.3rem',color: r.test(next) ? 'var(--success)' : 'var(--muted)'}}>
                        <span>{r.test(next) ? '✓' : '○'}</span>
                        <span>{r.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="form-group">
                  <label>Confirm new password</label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                    placeholder="Confirm new password" required autoComplete="new-password" disabled={!token} />
                  {confirm && !passwordsMatch && (
                    <div style={{fontSize:'.8125rem',color:'var(--danger)',marginTop:'.25rem'}}>Passwords do not match</div>
                  )}
                </div>

                {error && <div className="alert alert-danger">{error}</div>}

                <button type="submit" className="btn btn-primary btn-full"
                  disabled={loading || !token || !rulesPassed || !passwordsMatch}>
                  {loading ? 'Saving…' : 'Set new password'}
                </button>
              </form>

              <p style={{textAlign:'center',marginTop:'1rem'}}>
                <Link to="/clinician/forgot-password" style={{color:'var(--muted)',fontSize:'.8125rem',textDecoration:'underline'}}>
                  Request a new reset link
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
