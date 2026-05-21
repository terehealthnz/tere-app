import React, { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAvailability, getConsultation } from '../../lib/supabase'

export default function Waitlisted() {
  const { id } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    const check = async () => {
      try {
        const av = await getAvailability()
        if (av.is_open) {
          sessionStorage.setItem('consultationId', id)
          const c = await getConsultation(id)
          sessionStorage.setItem('accEligible', c?.acc_eligible || 'no')
          navigate('/payment')
        }
      } catch {}
    }
    check()
    const interval = setInterval(check, 10000)
    return () => clearInterval(interval)
  }, [id, navigate])

  return (
    <div className="page-shell">
      <header className="page-header">
        <span className="page-logo">TERE</span>
        <span style={{ fontSize:'0.8rem', color:'rgba(255,255,255,0.45)' }}>He tere, he ora</span>
      </header>
      <div className="page-content" style={{ display:'flex', alignItems:'center' }}>
        <div className="card" style={{ textAlign:'center' }}>
          <div style={{ fontSize:'3rem', marginBottom:'1rem' }}>🎣</div>
          <h1 style={{ fontSize:'1.4rem', marginBottom:'.5rem' }}>You're on the list</h1>
          <p style={{ color:'var(--muted)', lineHeight:1.7, marginBottom:'1.5rem' }}>
            We're closed right now but your details are saved.
            When we open, you'll get an email — you'll have <strong>15 minutes</strong> to
            complete payment and secure your spot in the queue.
          </p>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, color:'var(--muted)', fontSize:'.875rem' }}>
            <div className="spinner" style={{ width:14, height:14, borderWidth:2 }}></div>
            Waiting for clinic to open…
          </div>
          <p style={{ fontSize:'.75rem', color:'var(--muted)', marginTop:'1.5rem' }}>
            Emergency? Call <a href="tel:111" style={{ color:'var(--danger)', fontWeight:700 }}>111</a> immediately.
          </p>
        </div>
      </div>
    </div>
  )
}