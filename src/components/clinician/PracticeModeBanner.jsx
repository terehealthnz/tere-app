// Practice-mode banner + toggle for provider surfaces.
//
// Reads server-supplied dataMode (from GET /api/get-queue response) to
// determine current state, but persists user preference in
// sessionStorage.practice_mode so every apiFetch tags itself correctly.
//
// Three visual states:
//   mode='live'     → banner hidden (default)
//   mode='practice' → amber "PRACTICE MODE" banner + toggle to switch off
//   mode='gated'    → red "ONBOARDING" banner with unlock date, toggle
//                     disabled (server forces practice regardless)
//
// Renders as a full-width top strip. Include on every provider layout
// (Dashboard, ProviderApp, Admin, ClinicianPatient, ProviderInbox, etc.)
// so the state is unmistakable no matter which surface a provider is on.

import React, { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'

function readMode() {
  try {
    return sessionStorage.getItem('practice_mode') === '1' ? 'practice' : 'live'
  } catch { return 'live' }
}

/**
 * @param {object} props
 * @param {object} [props.dataMode] - Server-returned { mode, practice, unlockAt } if available.
 *   Pass this in from parent when the parent has already fetched an API that returns it
 *   (e.g. get-queue). Otherwise the component fetches it once on mount.
 */
export default function PracticeModeBanner({ dataMode: dataModeProp }) {
  const [dataMode, setDataMode] = useState(dataModeProp || null)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    if (dataModeProp) { setDataMode(dataModeProp); return }
    // Fetch once so components mounted without a parent-supplied dataMode
    // still get their state. get-queue is cheap and always returns dataMode.
    let cancelled = false
    apiFetch('/api/get-queue')
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled && j?.dataMode) setDataMode(j.dataMode) })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mode = dataMode?.mode || readMode()
  const unlockAt = dataMode?.unlockAt || null

  async function togglePractice(next) {
    setToggling(true)
    try {
      if (next) sessionStorage.setItem('practice_mode', '1')
      else      sessionStorage.removeItem('practice_mode')
      // Bounce a get-queue so the server confirms the new mode and any
      // parent that listens to the response re-renders.
      const r = await apiFetch('/api/get-queue')
      const j = r.ok ? await r.json() : null
      if (j?.dataMode) setDataMode(j.dataMode)
      // Trigger a full data refresh via a custom event any parent can listen for.
      window.dispatchEvent(new CustomEvent('tere:practice-mode-changed', { detail: { practice: next } }))
    } finally { setToggling(false) }
  }

  if (mode === 'live') return null

  const isGated = mode === 'gated'
  const bg = isGated ? '#B45309' : '#D97706'
  const label = isGated ? 'ONBOARDING' : 'PRACTICE MODE'
  const unlockText = isGated && unlockAt
    ? ` · full patient access unlocks ${new Date(unlockAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : ''

  return (
    <div style={{
      background: bg, color: 'white',
      padding: '9px 16px', textAlign: 'center',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      fontSize: '.82rem', fontWeight: 700, letterSpacing: '.02em',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem',
      position: 'relative', zIndex: 100,
    }}>
      <span>⚠ {label}{isGated ? unlockText : ' — you are viewing sandbox data, not real patients'}</span>
      {!isGated && (
        <button
          onClick={() => togglePractice(false)}
          disabled={toggling}
          style={{
            background: 'rgba(255,255,255,.15)', color: 'white',
            border: '1px solid rgba(255,255,255,.35)', borderRadius: 6,
            padding: '3px 10px', fontSize: '.72rem', fontWeight: 700,
            cursor: toggling ? 'default' : 'pointer',
          }}
        >
          {toggling ? '…' : 'Exit to live'}
        </button>
      )}
    </div>
  )
}

/**
 * Small header toggle for enabling practice mode. Renders nothing when
 * the current mode is 'gated' (toggle is locked on) or when it's
 * already 'practice' (the banner has its own exit button).
 */
export function PracticeModeToggle({ style }) {
  const [mode, setMode] = useState(readMode())
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const handler = () => setMode(readMode())
    window.addEventListener('tere:practice-mode-changed', handler)
    return () => window.removeEventListener('tere:practice-mode-changed', handler)
  }, [])
  if (mode === 'practice') return null
  return (
    <button
      onClick={async () => {
        setBusy(true)
        sessionStorage.setItem('practice_mode', '1')
        try { await apiFetch('/api/get-queue') } catch {}
        window.dispatchEvent(new CustomEvent('tere:practice-mode-changed', { detail: { practice: true } }))
        setMode('practice')
        setBusy(false)
      }}
      disabled={busy}
      style={{
        background: 'transparent', color: '#B45309', border: '1px solid rgba(180,83,9,.35)',
        borderRadius: 6, padding: '4px 10px', fontSize: '.72rem', fontWeight: 700, letterSpacing: '.03em',
        cursor: busy ? 'default' : 'pointer',
        ...style,
      }}
    >
      {busy ? '…' : '🧪 Practice mode'}
    </button>
  )
}
