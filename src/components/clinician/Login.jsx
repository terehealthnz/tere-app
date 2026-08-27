import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { providerDisplayName } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'

// Device-remember TTL shortened from 30 days → 7 days (pen test 2026-08-23
// L-2). The tere_device blob stores provider role flags, which are XSS-
// exfil targets. Shorter TTL reduces the window a stolen device / hijacked
// browser can auto-restore an authenticated session.
const DEVICE_REMEMBER_MS = 7 * 86400000

function getSaved() {
  try {
    const s = localStorage.getItem('tere_device')
    if (!s) return null
    const d = JSON.parse(s)
    if (!d.savedAt || Date.now() - d.savedAt > DEVICE_REMEMBER_MS) { localStorage.removeItem('tere_device'); return null }
    return d
  } catch { return null }
}

function restoreDevice(d) {
  const keys = ['providerId','providerDisplayName','providerIsAdmin','providerIsProvider','providerIsSupervisor','providerIsBillingAdmin','providerCanPrescribe','providerCanRefer','providerCanAcc','providerColor','prescriberNumber','providerCpn']
  sessionStorage.setItem('clinicianAuth', 'true')
  keys.forEach(k => { if (d[k]) sessionStorage.setItem(k, d[k]) })
}

function defaultDest(isAdmin) {
  const isPWA    = window.matchMedia('(display-mode: standalone)').matches
  const isMobile = window.innerWidth < 768
  if (isPWA || isMobile) return isAdmin ? '/admin' : '/provider'
  return '/clinician/dashboard'
}

// Only accept `?redirect=` values that stay on this origin. Rejects
// `//evil.com` (protocol-relative), `/\evil.com` (backslash trick),
// `https://…`, and anything that doesn't start with a single `/`.
// Pen-test 2026-08-27: open-redirect at clinician login gate.
function safeRedirect(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null
  if (raw[0] !== '/') return null
  if (raw[1] === '/' || raw[1] === '\\') return null
  return raw
}

export default function ClinicianLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const [providers, setProviders] = useState(null)
  const [selected, setSelected] = useState(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [savedDevice, setSavedDevice] = useState(null)
  const [showSavePrompt, setShowSavePrompt] = useState(false)
  // MFA step: server returns { needsMfa: true } after correct PIN when the
  // provider has TOTP enabled. Keep PIN in state and prompt for the code.
  const [needsMfa, setNeedsMfa] = useState(false)
  const [mfaCode, setMfaCode] = useState('')

  // Check for remembered device on mount
  useEffect(() => {
    const d = getSaved()
    if (d?.providerDisplayName) setSavedDevice(d)
  }, [])

  function loginWithDevice() {
    restoreDevice(savedDevice)
    localStorage.setItem('tere_portal', savedDevice?.providerIsAdmin === 'true' ? 'admin' : 'provider')
    const params = new URLSearchParams(location.search)
    navigate(safeRedirect(params.get('redirect')) || defaultDest(savedDevice?.providerIsAdmin === 'true'))
  }

  useEffect(() => {
    // Pre-auth login picker uses the server-mediated /api/provider-list
    // endpoint (anonymous, minimum-fields allowlist) rather than
    // `supabase.from('providers')` directly — anon reads on the
    // providers table were revoked in the 2026-08-09 RLS lockdown.
    async function loadProviders() {
      try {
        const res = await apiFetch('/api/provider-list')
        if (!res.ok) { setProviders([]); return }
        const { providers: data } = await res.json()
        setProviders(data || [])
      } catch {
        setProviders([])
      }
    }
    loadProviders()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const body = { providerId: selected?.id, pin: password }
      if (needsMfa) body.mfaCode = mfaCode
      const res = await apiFetch('/api/provider-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      let data
      try { data = await res.json() } catch { data = {} }
      if (!res.ok || !data.provider) {
        if (data.needsMfa) {
          setNeedsMfa(true)
          if (needsMfa) setError(data.error || 'Invalid MFA code.')
          setLoading(false)
          return
        }
        setError(data.error || 'Incorrect password. Please try again.')
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
      sessionStorage.setItem('providerIsBillingAdmin', String(p.is_billing_admin ?? false))
      sessionStorage.setItem('providerCanPrescribe', String(p.can_prescribe ?? true))
      sessionStorage.setItem('providerCanRefer', String(p.can_refer ?? true))
      sessionStorage.setItem('providerCanAcc', String(p.can_acc ?? true))
      sessionStorage.setItem('providerColor', p.color || '#0B6E76')
      if (p.prescriber_number) sessionStorage.setItem('prescriberNumber', p.prescriber_number)
      if (p.cpn) sessionStorage.setItem('providerCpn', p.cpn)
      // MCNZ supervision — supervised RMOs see the supervisor contact panel
      // and the prescribing modal warns on categories listed in the RMO's
      // supervision_scope.escalate_immediately. Default 'senior' so older
      // provider rows without provider_type act as unchanged.
      sessionStorage.setItem('providerType', p.provider_type || 'senior')
      if (p.supervisor_id) sessionStorage.setItem('providerSupervisorId', p.supervisor_id)

      localStorage.setItem('tere_portal', p.is_admin ? 'admin' : 'provider')
      if (p.must_change_password) {
        navigate('/clinician/change-password')
      } else {
        // Offer to save device if not already saved for this provider
        const existing = getSaved()
        if (!existing || existing.providerId !== p.id) {
          setShowSavePrompt(true)
          setLoading(false)
          return
        }
        const params = new URLSearchParams(location.search)
        navigate(safeRedirect(params.get('redirect')) || defaultDest(p.is_admin))
      }
    } catch {
      setError('Connection error. Please try again.')
    }
    setLoading(false)
  }

  if (providers === null) return (
    <div className="page" style={{background:'var(--navy)',minHeight:'100dvh',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div className="spinner" style={{borderColor:'rgba(255,255,255,.2)',borderTopColor:'var(--teal-light)'}} />
    </div>
  )

  // "Welcome back" screen — remembered device
  if (savedDevice && !showSavePrompt) return (
    <div className="page" style={{background:'var(--navy)',minHeight:'100dvh',alignItems:'center',justifyContent:'center',display:'flex'}}>
      <div style={{width:'100%',maxWidth:360,padding:'1.5rem',textAlign:'center'}}>
        <div style={{fontFamily:'Cormorant Garamond, Georgia, serif',fontSize:'2.5rem',fontStyle:'italic',color:'var(--teal-light)',letterSpacing:'.08em',marginBottom:'2rem'}}>
          Tere
        </div>
        <div style={{background:'white',borderRadius:16,padding:'2rem'}}>
          <div style={{width:64,height:64,borderRadius:'50%',background:savedDevice.providerColor||'#0B6E76',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 1rem',color:'white',fontWeight:700,fontSize:'1.5rem'}}>
            {(savedDevice.providerDisplayName||'?').split(' ').map(w=>w[0]).slice(0,2).join('')}
          </div>
          <div style={{fontWeight:700,fontSize:'1.125rem',color:'#0D2B45',marginBottom:'.25rem'}}>{savedDevice.providerDisplayName}</div>
          <div style={{fontSize:'.875rem',color:'#6B7280',marginBottom:'1.5rem'}}>Welcome back</div>
          <button onClick={loginWithDevice}
            style={{width:'100%',minHeight:52,background:'#0B6E76',color:'white',border:'none',borderRadius:10,fontFamily:'Plus Jakarta Sans, sans-serif',fontWeight:700,fontSize:'1rem',cursor:'pointer',marginBottom:'.75rem',boxShadow:'0 4px 16px rgba(11,110,118,.3)'}}>
            🔐 Continue as {(savedDevice.providerDisplayName||'').split(' ')[0]}
          </button>
          <button onClick={() => setSavedDevice(null)}
            style={{background:'none',border:'none',color:'#9CA3AF',fontSize:'.875rem',cursor:'pointer',textDecoration:'underline'}}>
            Sign in as a different provider
          </button>
        </div>
        <p style={{color:'rgba(255,255,255,.3)',fontSize:'.75rem',marginTop:'1rem'}}>
          Remembered for 30 days · Device is protected by your screen lock
        </p>
      </div>
    </div>
  )

  // "Save device?" prompt — shown after successful login
  if (showSavePrompt) {
    const params = new URLSearchParams(location.search)
    const isAdmin = sessionStorage.getItem('providerIsAdmin') === 'true'
    const dest = safeRedirect(params.get('redirect')) || defaultDest(isAdmin)
    return (
      <div className="page" style={{background:'var(--navy)',minHeight:'100dvh',alignItems:'center',justifyContent:'center',display:'flex'}}>
        <div style={{width:'100%',maxWidth:360,padding:'1.5rem',textAlign:'center'}}>
          <div style={{background:'white',borderRadius:16,padding:'2rem'}}>
            <div style={{fontSize:'2rem',marginBottom:'1rem'}}>📱</div>
            <div style={{fontWeight:700,fontSize:'1.125rem',color:'#0D2B45',marginBottom:'.5rem'}}>Remember this device?</div>
            <div style={{fontSize:'.875rem',color:'#6B7280',marginBottom:'1.5rem',lineHeight:1.6}}>
              Stay signed in for 30 days on this device. Protected by your screen lock.
            </div>
            <button onClick={() => {
              const keys = ['providerId','providerDisplayName','providerIsAdmin','providerIsProvider','providerIsSupervisor','providerIsBillingAdmin','providerCanPrescribe','providerCanRefer','providerCanAcc','providerColor','prescriberNumber','providerCpn']
              const d = { savedAt: Date.now() }
              keys.forEach(k => { const v = sessionStorage.getItem(k); if (v) d[k] = v })
              localStorage.setItem('tere_device', JSON.stringify(d))
              navigate(dest)
            }}
              style={{width:'100%',minHeight:52,background:'#0B6E76',color:'white',border:'none',borderRadius:10,fontFamily:'Plus Jakarta Sans, sans-serif',fontWeight:700,fontSize:'1rem',cursor:'pointer',marginBottom:'.75rem'}}>
              Yes, remember me
            </button>
            <button onClick={() => navigate(dest)}
              style={{background:'none',border:'none',color:'#9CA3AF',fontSize:'.875rem',cursor:'pointer',textDecoration:'underline'}}>
              No thanks, just this session
            </button>
          </div>
        </div>
      </div>
    )
  }

  const showPasswordStep = selected || providers.length === 0

  return (
    <div className="page" style={{background:'var(--navy)',minHeight:'100dvh',alignItems:'center',justifyContent:'center',display:'flex'}}>
      <div style={{width:'100%',maxWidth: showPasswordStep ? '380px' : '480px',padding:'1.5rem',transition:'max-width .2s'}}>
        <div style={{textAlign:'center',marginBottom:'2rem'}}>
          <div style={{fontFamily:'Cormorant Garamond, Georgia, serif',fontSize:'2.5rem',fontStyle:'italic',color:'var(--teal-light)',letterSpacing:'.08em',marginBottom:'.375rem'}}>
            Tere
          </div>
          <div style={{color:'rgba(255,255,255,.45)',fontSize:'.875rem',fontStyle:'italic'}}>Clinician dashboard</div>
        </div>

        {!showPasswordStep ? (
          <div>
            <div style={{color:'rgba(255,255,255,.6)',fontSize:'.875rem',textAlign:'center',marginBottom:'1.25rem'}}>Who is signing in?</div>
            <div style={{display:'flex',flexDirection:'column',gap:'.625rem'}}>
              {providers.map(p => (
                <button key={p.id} onClick={() => setSelected(p)}
                  style={{background:'white',border:`2px solid ${p.color || '#0B6E76'}`,borderRadius:12,padding:'1rem 1.25rem',cursor:'pointer',textAlign:'left',fontFamily:'Plus Jakarta Sans, sans-serif',display:'flex',alignItems:'center',gap:'1rem'}}>
                  <div style={{width:44,height:44,borderRadius:'50%',background:p.color || '#0B6E76',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontWeight:700,fontSize:'1.125rem',flexShrink:0}}>
                    {(p.first_name || '?').charAt(0)}{(p.last_name || '?').charAt(0)}
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
                <button onClick={() => { setSelected(null); setPassword(''); setError(''); setNeedsMfa(false); setMfaCode('') }}
                  style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.875rem',padding:'.5rem .75rem',margin:'-.5rem -.75rem'}}>
                  Change
                </button>
              </div>
            )}
            <form onSubmit={handleSubmit}>
              {!needsMfa ? (
                <div className="form-group">
                  <label>Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password" required autoComplete="current-password" />
                </div>
              ) : (
                <div className="form-group">
                  <label>Authenticator code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={mfaCode}
                    onChange={e => setMfaCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                    placeholder="6-digit code"
                    autoFocus
                    style={{letterSpacing:'.3em',fontSize:'1.25rem',textAlign:'center'}}
                    required
                  />
                  <div style={{fontSize:'.75rem',color:'var(--muted)',marginTop:'.5rem',textAlign:'center'}}>
                    Open your authenticator app (Google Authenticator, 1Password, etc.)
                  </div>
                </div>
              )}
              {error && <div className="alert alert-danger">{error}</div>}
              <button type="submit" className="btn btn-primary btn-full"
                disabled={loading || (needsMfa ? mfaCode.length !== 6 : !password)}>
                {loading ? 'Signing in…' : needsMfa ? 'Verify' : 'Sign in'}
              </button>
              {needsMfa && (
                <button type="button" onClick={() => { setNeedsMfa(false); setMfaCode(''); setError('') }}
                  style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'.8125rem',textDecoration:'underline',display:'block',margin:'.75rem auto 0'}}>
                  Back
                </button>
              )}
            </form>
            <p style={{textAlign:'center',marginTop:'1rem',marginBottom:'.5rem'}}>
              <Link to="/clinician/forgot-password" style={{color:'var(--muted)',fontSize:'.8125rem',textDecoration:'underline'}}>
                Forgot your password?
              </Link>
            </p>
            <p style={{fontSize:'.8125rem',color:'var(--muted)',textAlign:'center',marginTop:'.5rem'}}>
              MCNZ-registered clinicians only.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
