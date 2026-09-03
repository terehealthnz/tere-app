// HDC Right 5(2) — patient accessibility toggle (task #395).
// Persists to localStorage; applies CSS classes to body. Global; drop on
// any patient-facing page (Landing, IntakeForm, PatientPortal).

import React, { useEffect, useState } from 'react'

const LS_LARGE = 'tere_a11y_large'
const LS_CONTRAST = 'tere_a11y_contrast'

function apply(large, contrast) {
  try {
    document.body.classList.toggle('a11y-large-text', !!large)
    document.body.classList.toggle('a11y-high-contrast', !!contrast)
  } catch {}
}

export function useAccessibilityBoot() {
  useEffect(() => {
    apply(localStorage.getItem(LS_LARGE) === '1', localStorage.getItem(LS_CONTRAST) === '1')
  }, [])
}

export default function AccessibilityToggle({ style = {} }) {
  const [large, setLarge] = useState(false)
  const [contrast, setContrast] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setLarge(localStorage.getItem(LS_LARGE) === '1')
    setContrast(localStorage.getItem(LS_CONTRAST) === '1')
  }, [])

  function toggleLarge() {
    const next = !large
    setLarge(next)
    localStorage.setItem(LS_LARGE, next ? '1' : '0')
    apply(next, contrast)
  }
  function toggleContrast() {
    const next = !contrast
    setContrast(next)
    localStorage.setItem(LS_CONTRAST, next ? '1' : '0')
    apply(large, next)
  }

  const btn = { background: 'white', color: '#0D2B45', border: '1px solid rgba(255,255,255,.4)', padding: '4px 10px', borderRadius: 99, fontSize: '.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }

  return (
    <div style={{ position: 'relative', ...style }}>
      <button onClick={() => setOpen(o => !o)} style={btn} aria-label="Accessibility options">
        ♿ Accessibility
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '110%', right: 0, background: 'white', border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, minWidth: 220, boxShadow: '0 6px 20px rgba(0,0,0,.15)', zIndex: 100, color: '#0D2B45' }}>
          <div style={{ fontSize: '.8125rem', fontWeight: 700, marginBottom: 8 }}>Display options</div>
          <label style={{ display: 'flex', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: '.8125rem' }}>
            <input type="checkbox" checked={large} onChange={toggleLarge} /> Larger text
          </label>
          <label style={{ display: 'flex', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: '.8125rem' }}>
            <input type="checkbox" checked={contrast} onChange={toggleContrast} /> High contrast
          </label>
          <div style={{ fontSize: '.6875rem', color: '#6B7280', marginTop: 6, lineHeight: 1.4 }}>Your choices are remembered on this device (HDC Right 5(2)).</div>
        </div>
      )}
    </div>
  )
}
