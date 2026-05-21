import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)
  const [mode, setMode]         = useState('password')  // password | magic

  const handleLogin = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err) throw err
      sessionStorage.setItem('tere_clinician', '1')
      navigate('/clinician')
    } catch (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Incorrect email or password.'
        : err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleMagicLink = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/clinician` }
      })
      if (err) throw err
      setMode('sent')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight:'100vh', display:'flex', flexDirection:'column',
      background:'var(--navy)', alignItems:'center', justifyContent:'center',
      padding:'2rem 1rem'
    }}>
      <div style={{ marginBottom:'2rem', textAlign:'center' }}>
        <div style={{
          fontSize:'2.5rem', fontWeight:700, color:'var(--teal-light)',
          letterSpacing:'0.15em', marginBottom:'0.25rem'
        }}>TERE</div>
        <div style={{ color:'rgba(255,255,255,0.4)', fontSize:'0.85rem' }}>
          Clinician portal
        </div>
      </div>

      <div className="card" style={{ width:'100%', maxWidth:400 }}>
        {mode === 'sent' ? (
          <div style={{ textAlign:'center', padding:'1rem 0' }}>
            <div style={{ fontSize:'2.5rem', marginBottom:'1rem' }}>📧</div>
            <h2 style={{ fontSize:'1.2rem', marginBottom:'0.5rem' }}>Check your email</h2>
            <p style={{ color:'var(--muted)', fontSize:'0.9rem', marginBottom:'1.5rem' }}>
              We've sent a login link to <strong>{email}</strong>
            </p>
            <button onClick={() => setMode('password')} className="btn btn-secondary btn-sm">
              Use password instead
            </button>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize:'1.25rem', marginBottom:'1.5rem' }}>Sign in</h1>

            <form onSubmit={mode === 'password' ? handleLogin : handleMagicLink}>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className="form-input" value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="doctor@terehealth.co.nz"
                  autoComplete="email" required />
              </div>

              {mode === 'password' && (
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input type="password" className="form-input" value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password" required />
                </div>
              )}

              {error && (
                <div className="alert alert-danger" style={{ marginBottom:'1rem' }}>
                  {error}
                </div>
              )}

              <button type="submit" className="btn btn-primary btn-lg"
                style={{ width:'100%' }} disabled={loading}>
                {loading
                  ? <><span className="spinner" style={{ width:18,height:18,borderWidth:2 }} /> Signing in…</>
                  : mode === 'password' ? 'Sign in' : 'Send magic link'}
              </button>
            </form>

            <div style={{ textAlign:'center', marginTop:'1rem' }}>
              <button
                onClick={() => setMode(mode === 'password' ? 'magic' : 'password')}
                className="btn btn-ghost btn-sm" style={{ fontSize:'0.8rem' }}>
                {mode === 'password' ? 'Sign in with email link instead' : 'Use password instead'}
              </button>
            </div>
          </>
        )}
      </div>

      <p style={{ color:'rgba(255,255,255,0.25)', fontSize:'0.75rem', marginTop:'1.5rem', textAlign:'center' }}>
        Tere Health Limited · MCNZ Registered · For authorised clinical use only
      </p>
    </div>
  )
}
