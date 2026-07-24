import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await apiFetch('/api/provider-reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }
      setSent(true)
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
          {sent ? (
            <div style={{textAlign:'center',padding:'.5rem 0'}}>
              <div style={{fontSize:'2.5rem',marginBottom:'1rem'}}>📧</div>
              <h2 style={{fontSize:'1.2rem',marginBottom:'.5rem'}}>Check your email</h2>
              <p style={{color:'var(--muted)',fontSize:'.9rem',marginBottom:'1.5rem',lineHeight:1.6}}>
                If <strong>{email}</strong> is registered as a clinician, a reset link is on its way. It expires in 30 minutes.
              </p>
              <Link to="/clinician" className="btn btn-secondary btn-sm">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 style={{marginBottom:'.5rem'}}>Reset your password</h2>
              <p style={{fontSize:'.875rem',color:'var(--muted)',marginBottom:'1.5rem',lineHeight:1.6}}>
                Enter your registered clinician email and we'll send you a link to set a new password.
              </p>

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="doctor@terehealth.co.nz" required autoComplete="email" autoFocus />
                </div>

                {error && <div className="alert alert-danger">{error}</div>}

                <button type="submit" className="btn btn-primary btn-full" disabled={loading || !email.includes('@')}>
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>

              <p style={{textAlign:'center',marginTop:'1rem'}}>
                <Link to="/clinician" style={{color:'var(--muted)',fontSize:'.8125rem',textDecoration:'underline'}}>
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
