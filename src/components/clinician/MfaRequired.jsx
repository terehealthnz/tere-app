import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MfaEnrollModal from './MfaEnrollModal.jsx'
import { apiFetch } from '../../lib/api'

// Hard-block page for providers who haven't enrolled MFA yet. Cannot be
// dismissed — the only exit is to complete enrollment. Server rejects all
// PHI endpoints with 403 MFA_REQUIRED until mfa_enabled=true, so even if a
// determined user routes around the client redirect they get no data.
export default function MfaRequired() {
  const navigate = useNavigate()
  const providerId   = typeof window !== 'undefined' ? sessionStorage.getItem('providerId') : null
  const providerName = typeof window !== 'undefined' ? sessionStorage.getItem('providerDisplayName') : ''
  const isAdmin      = typeof window !== 'undefined' ? sessionStorage.getItem('providerIsAdmin') === 'true' : false
  const [enrolled, setEnrolled] = useState(false)

  // If someone lands here already enrolled (browser back nav, session mismatch),
  // punt them straight to the dashboard.
  useEffect(() => {
    if (!providerId) { navigate('/clinician'); return }
    (async () => {
      try {
        const r = await apiFetch(`/api/providers?id=${encodeURIComponent(providerId)}&columns=id,mfa_enabled`)
        const j = await r.json()
        if (j?.provider?.mfa_enabled) {
          sessionStorage.setItem('providerMfaEnabled', 'true')
          navigate(isAdmin ? '/clinician/admin' : '/clinician/dashboard')
        }
      } catch { /* ignore — user can still complete enroll */ }
    })()
  }, [providerId, isAdmin, navigate])

  function handleDone() {
    // Modal only fires onClose after successful enrollment because we hide
    // the close button. Mark enrolled + navigate.
    sessionStorage.setItem('providerMfaEnabled', 'true')
    setEnrolled(true)
    navigate(isAdmin ? '/clinician/admin' : '/clinician/dashboard')
  }

  return (
    <div style={{
      minHeight:'100dvh', background:'#0D2B45', color:'white',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:'Plus Jakarta Sans, sans-serif', padding:'1.5rem',
    }}>
      <div style={{ width:'100%', maxWidth:520, textAlign:'center' }}>
        <div style={{ fontFamily:'Cormorant Garamond, Georgia, serif', fontSize:'2.5rem', fontStyle:'italic', color:'#D4EEF0', letterSpacing:'.08em', marginBottom:'2rem' }}>
          Tere
        </div>
        <div style={{ background:'#B91C1C', color:'white', borderRadius:12, padding:'1rem 1.25rem', marginBottom:'1.5rem', fontWeight:700, fontSize:'.9375rem' }}>
          🔒 Two-factor authentication required
        </div>
        <p style={{ color:'rgba(255,255,255,.85)', fontSize:'.9375rem', lineHeight:1.6, marginBottom:'1.5rem' }}>
          Tere Health requires every provider account to use two-factor authentication before accessing any patient data. Set it up now — it only takes about a minute.
        </p>
        <p style={{ color:'rgba(255,255,255,.55)', fontSize:'.8125rem', lineHeight:1.55, marginBottom:'2rem' }}>
          You will need an authenticator app: Google Authenticator, 1Password, Authy, or the built-in Passwords app on iPhone / Mac.
        </p>
        {providerId && !enrolled && (
          <MfaEnrollModal
            providerId={providerId}
            providerName={providerName || ''}
            onClose={handleDone}
            mandatory
          />
        )}
      </div>
    </div>
  )
}
