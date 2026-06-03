import React, { useState, useEffect } from 'react'
import { getAvailability, getSchedule, addToWaitlist } from '../../lib/supabase'

export default function AvailabilityCheck({ onAvailable }) {
  const [status, setStatus]     = useState(null)
  const [message, setMessage]   = useState('')
  const [schedule, setSchedule] = useState('')
  const [checking, setChecking] = useState(false)
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [joined, setJoined]     = useState(false)
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    async function check() {
      try {
        const [av, sc] = await Promise.all([getAvailability(), getSchedule()])
        setStatus(av.is_open)
        setMessage(av.message || '')
        setSchedule(sc.next_times || '')
      } catch {
        setStatus(true)
      }
    }
    check()
    const interval = setInterval(check, 10000)
    return () => clearInterval(interval)
  }, [])

  async function joinWaitlist(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await addToWaitlist(name, email)
      setJoined(true)
    } catch {}
    setSaving(false)
  }

  if (status === null) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100dvh'}}>
      <div className="spinner" />
    </div>
  )

  if (status === false) return (
    <div className="page">
      <nav className="navbar">
        <span className="navbar-brand">Tere</span>
        <span style={{color:'rgba(255,255,255,.5)',fontSize:'.875rem',fontStyle:'italic'}}>He tere, he ora</span>
      </nav>
      <div className="container" style={{paddingTop:'2rem',paddingBottom:'3rem'}}>
        <div className="card" style={{marginBottom:'1rem'}}>
          <div style={{fontSize:'2.5rem',marginBottom:'1rem'}}>🕐</div>
          <h2 style={{marginBottom:'.5rem'}}>Not available right now</h2>
          <p style={{marginBottom:'1.25rem',lineHeight:1.7}}>
            {message || 'Dr Herling is not currently available for consultations.'}
          </p>

          {schedule && (
            <div style={{background:'var(--teal-light)',border:'1px solid var(--teal)',borderRadius:'var(--radius-sm)',padding:'1rem',marginBottom:'1.25rem'}}>
              <strong style={{display:'block',marginBottom:'.375rem',color:'var(--teal)'}}>📅 Next available</strong>
              <div style={{fontSize:'.9375rem',color:'var(--text)',whiteSpace:'pre-line',lineHeight:1.7}}>{schedule}</div>
            </div>
          )}

          <div style={{background:'var(--bg)',borderRadius:'var(--radius-sm)',padding:'1rem',marginBottom:'1.25rem',fontSize:'.9375rem',lineHeight:1.7}}>
            <strong style={{display:'block',marginBottom:'.25rem'}}>Need urgent help now?</strong>
            Call your nearest telehealth clinic or <strong>111</strong> in an emergency.
          </div>

          <button className="btn btn-secondary btn-full" disabled={checking}
            onClick={async () => {
              setChecking(true)
              try {
                const [av, sc] = await Promise.all([getAvailability(), getSchedule()])
                setStatus(av.is_open)
                setMessage(av.message || '')
                setSchedule(sc.next_times || '')
              } catch {}
              setChecking(false)
            }}>
            {checking ? 'Checking…' : '↻ Check again'}
          </button>
        </div>

        <div className="card">
          <h3 style={{marginBottom:'.375rem'}}>Get notified when we open</h3>
          <p style={{fontSize:'.9375rem',marginBottom:'1.25rem'}}>
            Leave your name and email and we will send you a message as soon as Dr Herling is available.
          </p>

          {joined ? (
            <div className="alert alert-success">
              ✓ You are on the list. We will email you when we open.
            </div>
          ) : (
            <form onSubmit={joinWaitlist}>
              <div className="form-group">
                <label>Your name</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  required placeholder="Aroha Smith" />
              </div>
              <div className="form-group">
                <label>Email address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required placeholder="you@example.com" />
              </div>
              <button type="submit" className="btn btn-primary btn-full" disabled={saving}>
                {saving ? 'Saving…' : 'Notify me when open'}
              </button>
            </form>
          )}
        </div>

        <p style={{fontSize:'.8125rem',color:'var(--muted)',marginTop:'1.25rem',textAlign:'center'}}>
          Emergency? Call <strong>111</strong> immediately.
        </p>
      </div>
    </div>
  )

  return onAvailable()
}
