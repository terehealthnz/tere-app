import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { providerDisplayName } from '../../lib/supabase'

export default function ClinicianLogin() {
  const navigate = useNavigate()
  const [providers, setProviders] = useState(null) // null = loading
  const [selected, setSelected] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function loadProviders() {
      try {
        const { supabase } = await import('../../lib/supabase')
        const { data, error: err } = await supabase
          .from('providers')
          .select('id, first_name, last_name, credential, specialty, color, is_active, is_admin, is_provider, is_supervisor, can_prescribe, can_refer, can_acc, prescriber_number, cpn')
          .eq('is_active', true)
          .order('first_name')
        if (err || !data?.length) { setProviders([]); return }
        setProviders(data)
      } catch {
        setProviders([])
      }
    }
    loadProviders()
  }, [])

  async function handlePinSubmit(e) {
    e.preventDefault()
    setLoading(true); setError('')

    if (selected) {
      try {
        const res = await fetch('/api/provider-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId: selected.id, pin })
        })
        const data = await res.json()
        if (!res.ok || !data.provider) {
          setError('Incorrect PIN. Please try again.')
          setLoading(false)
          return
        }
        const p = data.provider
        sessionStorage.setItem('clinicianAuth', 'true')
        sessionStorage.setItem('providerId', p.id)
        sessionStorage.setItem('providerDisplayName', providerDisplayName(p))
        sessionStorage.setItem('providerIsAdmin', String(p.is_admin))
        sessionStorage.setItem('providerIsProvider', String(p.is_provider))
        sessionStorage.setItem('providerIsSupervisor', String(p.is_supervisor ?? false))
        sessionStorage.setItem('providerCanPrescribe', String(p.can_prescribe ?? true))
        sessionStorage.setItem('providerCanRefer', String(p.can_refer ?? true))
        sessionStorage.setItem('providerCanAcc', String(p.can_acc ?? true))
        sessionStorage.setItem('providerColor', p.color || '#0B6E76')
        if (p.prescriber_number) sessionStorage.setItem('prescriberNumber', p.prescriber_number)
        if (p.cpn) sessionStorage.setItem('providerCpn', p.cpn)
        navigate('/clinician/dashboard')
      } catch {
        setError('Connection error. Please try again.')
      }
    } else {
      // Fallback: env-var PIN (no providers table yet)
      await new Promise(r => setTimeout(r, 400))
      const correctPin = import.meta.env.VITE_CLINICIAN_PIN || 'tere2026'
      if (pin === correctPin) {
        sessionStorage.setItem('clinicianAuth', 'true')
        sessionStorage.setItem('providerDisplayName', 'Dr Patrick Herling')
        sessionStorage.setItem('providerIsAdmin', 'true')
        sessionStorage.setItem('providerIsProvider', 'true')
        navigate('/clinician/dashboard')
      } else {
        setError('Incorrect PIN. Please try again.')
      }
    }
    setLoading(false)
  }

  if (providers === null) return (
    <div className="page" style={{background:'var(--navy)',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div className="spinner" style={{borderColor:'rgba(255,255,255,.2)',borderTopColor:'var(--teal-light)'}} />
    </div>
  )

  const showPinStep = selected || providers.length === 0

  return (
    <div className="page" style={{background:'var(--navy)',minHeight:'100vh',alignItems:'center',justifyContent:'center',display:'flex'}}>
      <div style={{width:'100%',maxWidth: showPinStep ? '380px' : '480px',padding:'1.5rem',transition:'max-width .2s'}}>
        <div style={{textAlign:'center',marginBottom:'2rem'}}>
          <div style={{fontFamily:'Cormorant Garamond, Georgia, serif',fontSize:'2.5rem',fontStyle:'italic',color:'var(--teal-light)',letterSpacing:'.08em',marginBottom:'.375rem'}}>
            Tere
          </div>
          <div style={{color:'rgba(255,255,255,.45)',fontSize:'.875rem',fontStyle:'italic'}}>Clinician dashboard</div>
        </div>

        {!showPinStep ? (
          <div>
            <div style={{color:'rgba(255,255,255,.6)',fontSize:'.875rem',textAlign:'center',marginBottom:'1.25rem'}}>Who is signing in?</div>
            <div style={{display:'flex',flexDirection:'column',gap:'.625rem'}}>
              {providers.map(p => (
                <button key={p.id} onClick={() => setSelected(p)}
                  style={{background:'white',border:`2px solid ${p.color || '#0B6E76'}`,borderRadius:12,padding:'1rem 1.25rem',cursor:'pointer',textAlign:'left',fontFamily:'Plus Jakarta Sans, sans-serif',display:'flex',alignItems:'center',gap:'1rem'}}>
                  <div style={{width:44,height:44,borderRadius:'50%',background:p.color || '#0B6E76',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontWeight:700,fontSize:'1.125rem',flexShrink:0}}>
                    {p.first_name[0]}{p.last_name[0]}
                  </div>
                  <div>
                    <div style={{fontWeight:700,color:'#0D2B45',fontSize:'1rem'}}>{providerDisplayName(p)}</div>
                    <div style={{fontSize:'.8125rem',color:'#6B7280',marginTop:2}}>
                      {p.specialty || (p.is_admin && !p.is_provider ? 'Admin' : 'Clinician')}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="card">
            {selected && (
              <div style={{display:'flex',alignItems:'center',gap:'.75rem',marginBottom:'1.25rem',padding:'.875rem',background:'var(--bg)',borderRadius:'var(--radius-sm)'}}>
                <div style={{width:40,height:40,borderRadius:'50%',background:selected.color||'#0B6E76',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontWeight:700,fontSize:'1rem',flexShrink:0}}>
                  {selected.first_name[0]}{selected.last_name[0]}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:'.9375rem'}}>{providerDisplayName(selected)}</div>
                  <div style={{fontSize:'.8125rem',color:'var(--muted)'}}>
                    {selected.specialty || (selected.is_admin && !selected.is_provider ? 'Admin' : 'Clinician')}
                  </div>
                </div>
                <button onClick={() => { setSelected(null); setPin(''); setError('') }}
                  style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.875rem'}}>
                  Change
                </button>
              </div>
            )}
            {!selected && <h2 style={{marginBottom:'1.25rem',textAlign:'center'}}>Sign in</h2>}
            <form onSubmit={handlePinSubmit}>
              <div className="form-group">
                <label>Access PIN</label>
                <input type="password" value={pin} onChange={e => setPin(e.target.value)}
                  placeholder="Enter your PIN" required autoFocus autoComplete="current-password" />
              </div>
              {error && <div className="alert alert-danger">{error}</div>}
              <button type="submit" className="btn btn-primary btn-full" disabled={loading || !pin}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            <p style={{fontSize:'.8125rem',color:'var(--muted)',textAlign:'center',marginTop:'1rem'}}>
              MCNZ-registered clinicians only.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
