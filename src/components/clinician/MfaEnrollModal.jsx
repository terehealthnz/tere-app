import React, { useState, useEffect } from 'react'
import { apiFetch } from '../../lib/api'

// Provider TOTP enrollment / disable modal. Opened from the Menu tab.
//
// UI flow:
//   1. On open, GET providers to learn current mfa_enabled state (via a
//      lightweight read on /api/providers with own id).
//   2a. Not enrolled → "Enable" button → POST /api/provider-mfa action=enroll →
//       display the base32 secret and an otpauth:// URI for manual entry.
//       User adds to their authenticator app, types the 6-digit code, we
//       POST action=verify → success flips mfa_enabled=true.
//   2b. Enrolled → "Disable" button → prompt for current code → POST
//       action=disable.
//
// Deliberately no QR code library: manual secret entry is universally
// supported by authenticator apps and avoids exposing the secret through
// any third-party QR renderer.

const NAVY  = '#0D2B45'
const TEAL  = '#0B6E76'
const RED   = '#DC2626'
const GREEN = '#059669'
const FF    = 'Plus Jakarta Sans, sans-serif'

export default function MfaEnrollModal({ providerId, providerName, onClose, mandatory = false }) {
  const [phase, setPhase] = useState('loading')      // loading | idle | enrolling | verifying | disabling | done
  const [enabled, setEnabled] = useState(false)
  const [secret, setSecret] = useState('')
  const [otpUri, setOtpUri] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function loadStatus() {
      try {
        const res = await apiFetch(`/api/providers?id=${encodeURIComponent(providerId)}&columns=id,mfa_enabled`)
        const data = await res.json()
        setEnabled(Boolean(data?.provider?.mfa_enabled))
      } catch {
        setEnabled(false)
      }
      setPhase('idle')
    }
    loadStatus()
  }, [providerId])

  async function startEnrollment() {
    setBusy(true); setErr('')
    try {
      const res = await apiFetch('/api/provider-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enroll' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start enrollment')
      setSecret(data.secretBase32)
      setOtpUri(data.otpauthUrl)
      setPhase('verifying')
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }

  async function verifyCode() {
    if (code.length !== 6) return
    setBusy(true); setErr('')
    try {
      const res = await apiFetch('/api/provider-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Verification failed')
      setEnabled(true); setPhase('done'); setCode('')
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }

  async function disable() {
    if (code.length !== 6) return
    setBusy(true); setErr('')
    try {
      const res = await apiFetch('/api/provider-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disable', code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Disable failed')
      setEnabled(false); setPhase('idle'); setCode(''); setSecret(''); setOtpUri('')
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }

  function copySecret() {
    if (!secret) return
    try {
      navigator.clipboard.writeText(secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}
      onClick={e => { if (!mandatory && e.target === e.currentTarget) onClose() }}>
      <div style={{ background:'white', borderRadius:16, width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto', fontFamily:FF }}>
        <div style={{ padding:'1.25rem 1.25rem 0', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontWeight:700, color:NAVY, fontSize:'1.125rem' }}>Two-factor authentication</div>
            <div style={{ fontSize:'.8125rem', color:'#6B7280', marginTop:2 }}>{providerName}</div>
          </div>
          {!mandatory && (
            <button onClick={onClose} aria-label="Close"
              style={{ background:'none', border:'none', fontSize:'1.5rem', color:'#9CA3AF', cursor:'pointer', lineHeight:1, padding:0 }}>
              ×
            </button>
          )}
        </div>

        <div style={{ padding:'1rem 1.25rem 1.25rem' }}>
          {phase === 'loading' && (
            <div style={{ padding:'2rem 0', textAlign:'center', color:'#6B7280' }}>Loading…</div>
          )}

          {phase === 'idle' && (
            <>
              <div style={{ background: enabled ? '#D1FAE5' : '#FEF3C7', border: `1px solid ${enabled ? '#A7F3D0' : '#FDE68A'}`, color: enabled ? '#065F46' : '#78350F', borderRadius:10, padding:'.75rem 1rem', fontSize:'.875rem', fontWeight:600, marginBottom:'1rem' }}>
                {enabled ? '✅ MFA is enabled on your account.' : '⚠️ MFA is not enabled — your account is protected by password only.'}
              </div>

              <p style={{ fontSize:'.875rem', color:'#4B5563', lineHeight:1.55, marginBottom:'1rem' }}>
                {enabled
                  ? 'Two-factor authentication requires a code from your authenticator app every time you sign in. Turning it off is not recommended — Tere Health handles clinical data and MFA is required by Health New Zealand.'
                  : 'Enabling MFA means Tere will ask for a 6-digit code from your authenticator app after your password on every login. You will need Google Authenticator, 1Password, Authy, or your device\'s built-in Passwords app.'}
              </p>

              {enabled ? (
                <div>
                  <label style={{ fontSize:'.8125rem', color:'#6B7280', fontWeight:600, display:'block', marginBottom:'.375rem' }}>
                    Enter your current 6-digit code to disable
                  </label>
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                    placeholder="000000"
                    style={{ width:'100%', padding:'.75rem', border:'1px solid #E2E8F0', borderRadius:8, fontSize:'1.25rem', letterSpacing:'.3em', textAlign:'center', fontFamily:'ui-monospace, monospace' }}
                  />
                  {err && <div style={{ color:RED, fontSize:'.8125rem', marginTop:'.5rem' }}>{err}</div>}
                  <button onClick={disable} disabled={busy || code.length !== 6}
                    style={{ width:'100%', marginTop:'1rem', background:RED, color:'white', border:'none', borderRadius:10, padding:'.875rem', fontWeight:700, fontSize:'.9375rem', cursor:busy?'wait':(code.length!==6?'not-allowed':'pointer'), opacity: busy||code.length!==6 ? .6 : 1, fontFamily:FF }}>
                    {busy ? 'Disabling…' : 'Disable MFA'}
                  </button>
                </div>
              ) : (
                <>
                  {err && <div style={{ color:RED, fontSize:'.8125rem', marginBottom:'.5rem' }}>{err}</div>}
                  <button onClick={startEnrollment} disabled={busy}
                    style={{ width:'100%', background:TEAL, color:'white', border:'none', borderRadius:10, padding:'.875rem', fontWeight:700, fontSize:'.9375rem', cursor:busy?'wait':'pointer', opacity:busy?.6:1, fontFamily:FF }}>
                    {busy ? 'Preparing…' : 'Enable MFA'}
                  </button>
                </>
              )}
            </>
          )}

          {phase === 'verifying' && (
            <>
              <div style={{ background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:10, padding:'.875rem 1rem', fontSize:'.8125rem', color:'#0C4A6E', lineHeight:1.55, marginBottom:'1rem' }}>
                <strong>Step 1:</strong> Open your authenticator app and add a new account. Use the setup key below (or paste the URI into Passwords / 1Password).
              </div>

              <label style={{ fontSize:'.75rem', fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:'.375rem' }}>
                Setup key
              </label>
              <div style={{ display:'flex', gap:'.5rem', marginBottom:'.75rem' }}>
                <input readOnly value={secret}
                  style={{ flex:1, padding:'.75rem', border:'1px solid #E2E8F0', borderRadius:8, fontSize:'.9375rem', fontFamily:'ui-monospace, monospace', letterSpacing:'.05em', background:'#F8FAFC', color:NAVY }} />
                <button onClick={copySecret}
                  style={{ background:'#F1F5F9', color:NAVY, border:'1px solid #E2E8F0', borderRadius:8, padding:'0 .875rem', fontWeight:600, cursor:'pointer', fontFamily:FF, fontSize:'.8125rem' }}>
                  {copied ? 'Copied ✓' : 'Copy'}
                </button>
              </div>

              <details style={{ marginBottom:'1rem' }}>
                <summary style={{ fontSize:'.75rem', color:'#6B7280', cursor:'pointer' }}>Or use setup URI</summary>
                <input readOnly value={otpUri}
                  style={{ width:'100%', marginTop:'.375rem', padding:'.5rem', border:'1px solid #E2E8F0', borderRadius:6, fontSize:'.6875rem', fontFamily:'ui-monospace, monospace', background:'#F8FAFC' }} />
              </details>

              <div style={{ background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:10, padding:'.875rem 1rem', fontSize:'.8125rem', color:'#0C4A6E', lineHeight:1.55, marginBottom:'.5rem' }}>
                <strong>Step 2:</strong> Enter the 6-digit code from your authenticator app to confirm setup.
              </div>

              <input
                type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                placeholder="000000" autoFocus
                style={{ width:'100%', padding:'.75rem', border:'1px solid #E2E8F0', borderRadius:8, fontSize:'1.25rem', letterSpacing:'.3em', textAlign:'center', fontFamily:'ui-monospace, monospace' }}
              />
              {err && <div style={{ color:RED, fontSize:'.8125rem', marginTop:'.5rem' }}>{err}</div>}

              <div style={{ display:'flex', gap:'.5rem', marginTop:'1rem' }}>
                <button onClick={() => { setPhase('idle'); setSecret(''); setOtpUri(''); setCode(''); setErr('') }}
                  style={{ flex:1, background:'#F1F5F9', color:NAVY, border:'none', borderRadius:10, padding:'.875rem', fontWeight:700, cursor:'pointer', fontFamily:FF }}>
                  Cancel
                </button>
                <button onClick={verifyCode} disabled={busy || code.length !== 6}
                  style={{ flex:2, background:TEAL, color:'white', border:'none', borderRadius:10, padding:'.875rem', fontWeight:700, cursor:busy?'wait':(code.length!==6?'not-allowed':'pointer'), opacity: busy||code.length!==6 ? .6 : 1, fontFamily:FF }}>
                  {busy ? 'Verifying…' : 'Confirm & enable'}
                </button>
              </div>
            </>
          )}

          {phase === 'done' && (
            <>
              <div style={{ background:'#D1FAE5', border:'1px solid #A7F3D0', color:'#065F46', borderRadius:10, padding:'1rem', fontSize:'.9375rem', fontWeight:600, textAlign:'center', marginBottom:'1rem' }}>
                ✅ MFA is now enabled.
              </div>
              <p style={{ fontSize:'.8125rem', color:'#6B7280', lineHeight:1.55, marginBottom:'1rem' }}>
                Next time you sign in, Tere will ask for a 6-digit code from your authenticator app after your password.
              </p>
              <button onClick={onClose}
                style={{ width:'100%', background:TEAL, color:'white', border:'none', borderRadius:10, padding:'.875rem', fontWeight:700, cursor:'pointer', fontFamily:FF }}>
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
