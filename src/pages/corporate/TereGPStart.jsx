// Gated Tere GP intake entry on tere.co.nz. Not linked from the public
// BETA landing — only reachable by direct URL (/gp-start) while the GP
// product is in development. Reuses the full Tere Health acute intake
// flow (TereIntro → AITriage → vitals → payment → waiting → provider
// call) but stamps consult_mode='gp' on the resulting consultation so
// downstream reporting / provider UI / safety-net tuning can
// differentiate as GP-specific features land.
//
// Visible warning screen is intentional — someone stumbling on this URL
// should NOT be able to accidentally start what they think is an
// enrolled GP visit when the product doesn't exist yet. One tap to
// proceed is the deliberate speed bump.

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const BRAND = { navy: '#0D2B45', teal: '#0B6E76', tealLight: '#D4EEF0' }
const FF = "'Plus Jakarta Sans','Helvetica Neue',Arial,sans-serif"
const SERIF = "'Cormorant Garamond', Georgia, serif"

export default function TereGPStart() {
  const nav = useNavigate()
  const [starting, setStarting] = useState(false)

  function proceed() {
    setStarting(true)
    try { sessionStorage.setItem('tere_gp_consult', '1') } catch {}
    nav('/start', { replace: true })
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${BRAND.navy} 0%, #0a3d52 100%)`,
      color: 'white',
      fontFamily: FF,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        maxWidth: 560, width: '100%',
        background: 'rgba(255,255,255,.05)',
        border: '1px solid rgba(255,255,255,.12)',
        borderRadius: 16,
        padding: '32px 28px',
      }}>
        <div style={{
          display: 'inline-block',
          background: 'rgba(254,243,199,.9)',
          color: '#92400E',
          padding: '4px 12px',
          borderRadius: 99,
          fontSize: '.75rem', fontWeight: 800,
          letterSpacing: '.08em', textTransform: 'uppercase',
          marginBottom: 20,
        }}>
          Beta · Internal testing
        </div>
        <h1 style={{
          fontFamily: SERIF, fontWeight: 700,
          fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
          lineHeight: 1.15, margin: '0 0 16px',
        }}>
          Tere GP consultation flow
        </h1>
        <p style={{
          fontSize: '1rem', lineHeight: 1.6,
          color: 'rgba(255,255,255,.78)', margin: '0 0 20px',
        }}>
          This is the development build of the Tere GP consultation flow.
          It uses the same clinical workflow as Tere Health acute care while
          enrolment, GMS claims and recall systems are being built. Clinically
          and legally, consultations started here are handled as
          <strong style={{ color: 'white' }}> normal Tere Health visits</strong> for now.
        </p>
        <p style={{
          fontSize: '.875rem', lineHeight: 1.55,
          color: 'rgba(255,255,255,.6)', margin: '0 0 24px',
        }}>
          If you are a patient looking for care today, go to{' '}
          <a href="https://terehealth.co.nz" style={{ color: BRAND.tealLight }}>
            terehealth.co.nz
          </a>.
        </p>
        <button
          type="button"
          onClick={proceed}
          disabled={starting}
          style={{
            background: BRAND.teal, color: 'white', border: 'none',
            padding: '14px 24px', borderRadius: 99,
            fontSize: '1rem', fontWeight: 700, fontFamily: FF,
            cursor: starting ? 'default' : 'pointer',
            opacity: starting ? .6 : 1,
            boxShadow: '0 6px 20px rgba(11,110,118,.45)',
            width: '100%',
          }}>
          {starting ? 'Starting…' : 'Continue to consultation'}
        </button>
      </div>
    </div>
  )
}
