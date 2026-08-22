// Idle-timeout re-auth guard for clinician surfaces. Mounts globally in App.jsx
// but only activates when both (a) sessionStorage.clinicianAuth === 'true' and
// (b) the current route is a clinician-facing path. After IDLE_MS of no user
// activity, blocks the UI with a modal that requires PIN (+ MFA if enabled)
// re-verification. Cancel path clears the session and redirects to the login
// page with a redirect back to the current URL after re-auth.
//
// Not a full logout on idle — a re-auth prompt. Two states worth naming:
//   • Warn at WARN_AT_MS — soft banner "session expiring in ~N min"
//   • Force at IDLE_MS — hard modal blocks all input until PIN verified
//
// Activity is any of mousemove/keydown/click/touchstart/scroll. Passive
// listeners so we don't block scroll. All timers are cleared on unmount /
// deactivation, so tearing down the guard (e.g. after logout) has no leftover
// state.

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const IDLE_MS         = 15 * 60 * 1000    // 15 min → force re-auth
const WARN_AT_MS      = 13 * 60 * 1000    // 13 min → soft warning banner
const TICK_MS         = 5 * 1000          // check idle every 5s

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll']

// Which clinician paths should the guard activate on. Excludes the login /
// password-reset pages themselves so we don't render a re-auth modal on the
// login screen.
function isClinicianRoute(pathname) {
  if (pathname === '/clinician') return false
  if (pathname.startsWith('/clinician/forgot-password')) return false
  if (pathname.startsWith('/clinician/reset-password')) return false
  return pathname.startsWith('/provider') ||
         pathname.startsWith('/admin') ||
         pathname.startsWith('/clinician')
}

// The session-storage keys that constitute a clinician session — cleared
// together on forced sign-out.
const SESSION_KEYS = [
  'clinicianAuth', 'providerId', 'providerDisplayName',
  'providerIsAdmin', 'providerIsProvider', 'providerIsSupervisor',
  'providerIsBillingAdmin', 'providerCanPrescribe', 'providerCanRefer',
  'providerCanAcc', 'providerColor', 'prescriberNumber', 'providerCpn',
]

export default function SessionIdleGuard() {
  const location = useLocation()
  const navigate = useNavigate()
  const [active, setActive] = useState(false)
  const [showWarn, setShowWarn] = useState(false)
  const [showReauth, setShowReauth] = useState(false)
  const lastActivityRef = useRef(Date.now())
  const tickRef = useRef(null)

  // Re-evaluate whether the guard should be active on every route change
  // AND poll sessionStorage every 2s (login within the same tab wouldn't
  // otherwise trigger a re-render here).
  useEffect(() => {
    const evaluate = () => {
      const auth = sessionStorage.getItem('clinicianAuth') === 'true'
      const hasProvider = !!sessionStorage.getItem('providerId')
      const onClin = isClinicianRoute(location.pathname)
      setActive(auth && hasProvider && onClin)
    }
    evaluate()
    const iv = setInterval(evaluate, 2000)
    return () => clearInterval(iv)
  }, [location.pathname])

  const resetIdle = useCallback(() => {
    lastActivityRef.current = Date.now()
  }, [])

  // Wire activity listeners only while the guard is active.
  useEffect(() => {
    if (!active) return undefined
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, resetIdle, { passive: true }))
    return () => ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, resetIdle))
  }, [active, resetIdle])

  // Idle ticker.
  useEffect(() => {
    if (!active) return undefined
    lastActivityRef.current = Date.now()
    tickRef.current = setInterval(() => {
      if (showReauth) return                        // modal open — freeze checks
      const idle = Date.now() - lastActivityRef.current
      if (idle >= IDLE_MS) {
        setShowReauth(true)
        setShowWarn(false)
      } else if (idle >= WARN_AT_MS) {
        setShowWarn(true)
      } else if (showWarn) {
        setShowWarn(false)                          // activity brought us back
      }
    }, TICK_MS)
    return () => clearInterval(tickRef.current)
  }, [active, showReauth, showWarn])

  const handleReauthSuccess = () => {
    setShowReauth(false)
    setShowWarn(false)
    lastActivityRef.current = Date.now()
  }

  const handleLogout = () => {
    SESSION_KEYS.forEach(k => sessionStorage.removeItem(k))
    setShowReauth(false)
    setShowWarn(false)
    const to = '/clinician?redirect=' + encodeURIComponent(location.pathname + location.search)
    navigate(to, { replace: true })
  }

  if (!active) return null

  return (
    <>
      {showWarn && !showReauth && (
        <div
          role="status"
          onClick={resetIdle}
          style={{
            position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)',
            zIndex: 9998, background: '#fef3c7', border: '1px solid #f59e0b',
            color: '#78350f', padding: '10px 18px', borderRadius: 999,
            fontSize: 13, fontWeight: 600, boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
            cursor: 'pointer', userSelect: 'none',
          }}
        >
          Session expiring in ~2 min — click anywhere to stay signed in
        </div>
      )}
      {showReauth && <ReauthModal onSuccess={handleReauthSuccess} onLogout={handleLogout} />}
    </>
  )
}

function ReauthModal({ onSuccess, onLogout }) {
  const providerId = sessionStorage.getItem('providerId')
  const displayName = sessionStorage.getItem('providerDisplayName') || 'Provider'
  const [pin, setPin] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [needsMfa, setNeedsMfa] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e?.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)
    try {
      const body = { providerId, pin }
      if (needsMfa) body.mfaCode = mfaCode
      const res = await apiFetch('/api/provider-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.needsMfa) {
          setNeedsMfa(true)
          if (needsMfa) setError(data.error || 'Invalid MFA code.')
          return
        }
        setError(data.error || 'Sign-in failed.')
        return
      }
      onSuccess()
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  const disabled = loading || (needsMfa ? mfaCode.length !== 6 : !pin)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      }}
    >
      <form
        onSubmit={submit}
        style={{
          background: '#fff', borderRadius: 16, padding: 28,
          width: 'min(92vw, 380px)', boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700 }}>Session paused</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>Confirm it's you, {displayName}</div>
        <div style={{ fontSize: 13, color: '#475569', marginTop: 8, lineHeight: 1.5 }}>
          You've been inactive for 15 minutes. Enter your PIN to resume — this protects patient data if your device was left unattended.
        </div>

        {!needsMfa ? (
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            placeholder="PIN"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            style={{ marginTop: 16, width: '100%', padding: '12px 14px', fontSize: 18, border: '1px solid #cbd5e1', borderRadius: 10, letterSpacing: 4, textAlign: 'center', boxSizing: 'border-box' }}
          />
        ) : (
          <>
            <div style={{ marginTop: 16, fontSize: 12, color: '#0f172a', fontWeight: 600 }}>
              Enter the 6-digit code from your authenticator app
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              placeholder="123456"
              value={mfaCode}
              onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{ marginTop: 8, width: '100%', padding: '12px 14px', fontSize: 18, border: '1px solid #cbd5e1', borderRadius: 10, letterSpacing: 6, textAlign: 'center', boxSizing: 'border-box' }}
            />
          </>
        )}

        {error && (
          <div style={{ marginTop: 10, color: '#b91c1c', fontSize: 13 }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={disabled}
          style={{
            marginTop: 16, width: '100%', padding: '12px 14px',
            background: '#0d9488', color: '#fff', fontWeight: 700, fontSize: 15,
            border: 'none', borderRadius: 10,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          {loading ? 'Verifying…' : needsMfa ? 'Verify' : 'Unlock'}
        </button>

        <button
          type="button"
          onClick={onLogout}
          style={{
            marginTop: 8, width: '100%', padding: '10px 14px',
            background: 'transparent', color: '#64748b', fontSize: 13,
            border: 'none', cursor: 'pointer',
          }}
        >
          Sign out and return to login
        </button>
      </form>
    </div>
  )
}
