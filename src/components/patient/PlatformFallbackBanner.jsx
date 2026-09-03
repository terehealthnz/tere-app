// Business-continuity fallback banner (task #437).
// Static — always shown to the patient in the waiting-room + consent flow.
// Answer to: "what happens to the patient if the platform / LiveKit / their
// internet drops mid-consult?" — no more silent single point of failure.
//
// For anything urgent → 111 is always the right answer. For non-urgent
// support (Tere down, can't get through, needs to reach us) → email is the
// out-of-band channel that still works when the app doesn't.

import React from 'react'

export default function PlatformFallbackBanner({ compact = false }) {
  return (
    <div style={{
      background: '#F8FAFC',
      border: '1px solid #E2E8F0',
      borderRadius: 8,
      padding: compact ? '.5rem .75rem' : '.75rem 1rem',
      fontSize: compact ? '.7rem' : '.8125rem',
      color: '#374151',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      lineHeight: 1.5,
    }}>
      <strong style={{ color: '#0D2B45' }}>If Tere isn't working:</strong>{' '}
      For anything urgent, call{' '}
      <a href="tel:111" style={{ color: '#DC2626', fontWeight: 700, textDecoration: 'none' }}>
        111
      </a>{' '}
      immediately. For non-urgent support, email{' '}
      <a href="mailto:hello@terehealth.co.nz" style={{ color: '#0B6E76', fontWeight: 600, textDecoration: 'none' }}>
        hello@terehealth.co.nz
      </a>.
    </div>
  )
}
