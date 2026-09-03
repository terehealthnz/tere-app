// ElevationModal — prompts the admin to enter a fresh MFA code to mint a
// short-lived JIT elevation token. Used by ACC bundle export, patient
// record export, and controlled drugs register.
//
// Usage:
//   const [needsElev, setNeedsElev] = useState(false)
//   const [pendingRetry, setPendingRetry] = useState(null)
//   ...
//   <ElevationModal
//     open={needsElev}
//     purpose="acc_bundle_export"
//     onCancel={() => { setNeedsElev(false); setPendingRetry(null) }}
//     onGranted={async () => { setNeedsElev(false); await pendingRetry?.() }}
//   />

import React, { useState } from 'react'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'

// Global elevation-token store. Endpoints reading this attach it as the
// X-Elevation-Token header. Cleared 5 min after mint.
let ELEVATION_TOKEN = null
let ELEVATION_EXPIRES = 0

export function getElevationToken() {
  if (!ELEVATION_TOKEN) return null
  if (Date.now() > ELEVATION_EXPIRES) { ELEVATION_TOKEN = null; return null }
  return ELEVATION_TOKEN
}

export function clearElevationToken() { ELEVATION_TOKEN = null; ELEVATION_EXPIRES = 0 }

async function mintToken(mfaCode, purpose) {
  const res = await fetch('/api/elevation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-provider-id': sessionStorage.getItem('providerId') || '',
    },
    body: JSON.stringify({ mfaCode, purpose }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  ELEVATION_TOKEN = data.token
  ELEVATION_EXPIRES = new Date(data.expires_at).getTime()
  return data
}

export default function ElevationModal({ open, purpose = 'generic', title, description, onCancel, onGranted }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function submit(e) {
    e?.preventDefault?.()
    if (!code.trim()) { setErr('Enter your 6-digit code'); return }
    setBusy(true); setErr(null)
    try {
      await mintToken(code.trim(), purpose)
      setCode('')
      onGranted?.()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,43,69,.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, fontFamily: FF }}>
      <form onSubmit={submit} style={{ background: 'white', borderRadius: 14, padding: '1.5rem', maxWidth: 420, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '.75rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🔐</span>
          <div style={{ fontWeight: 800, color: NAVY, fontSize: '1.0625rem' }}>{title || 'Re-verify MFA'}</div>
        </div>
        <p style={{ fontSize: '.8125rem', color: '#374151', lineHeight: 1.6, margin: '0 0 1rem' }}>
          {description || 'This action reveals highly sensitive PHI. Please enter a fresh code from your authenticator app to continue. Your elevation lasts 5 minutes.'}
        </p>
        <label style={{ display: 'block', fontSize: '.6875rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Authenticator code</label>
        <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          type="text" inputMode="numeric" autoFocus maxLength={6}
          style={{ width: '100%', boxSizing: 'border-box', padding: '.625rem .75rem', border: '1.5px solid #E2E8F0', borderRadius: 8, fontFamily: FF, fontSize: '1.125rem', letterSpacing: '.5em', textAlign: 'center' }} />
        {err && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '.5rem .75rem', borderRadius: 6, fontSize: '.75rem', marginTop: '.75rem' }}>{err}</div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={{ background: 'white', border: '1px solid #E2E8F0', color: '#374151', padding: '.5rem 1rem', borderRadius: 8, fontFamily: FF, fontSize: '.8125rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button type="submit" disabled={busy || code.length !== 6}
            style={{ background: code.length === 6 ? TEAL : '#CBD5E1', color: 'white', border: 'none', padding: '.5rem 1rem', borderRadius: 8, fontFamily: FF, fontSize: '.8125rem', fontWeight: 700, cursor: code.length === 6 ? 'pointer' : 'not-allowed' }}>
            {busy ? 'Verifying…' : 'Unlock'}
          </button>
        </div>
      </form>
    </div>
  )
}
