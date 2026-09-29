// Floating "Stuck? Get help" pill for patient-facing pages. Click routes
// the patient to the existing /contact form (technical category, source
// tagged 'stuck_widget') with their session preserved so they can pick
// up the flow where they left off after the message is sent.
//
// Rationale: gives admin qualitative signal on where patients get stuck
// without needing a full funnel dashboard. Messages land in the admin
// Messages tab (same pipeline as regular contact-page submissions).
//
// Hidden on the live video call (/call) — don't distract mid-consult
// — and on clinician/admin/careers/corporate/legal pages where the
// pill doesn't belong. Also skips the landing pages so first-time
// visitors don't see the pill before they've engaged.

import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

// Path prefixes where the pill should render. Everything else is excluded
// by default — we want an allow-list, not a deny-list, so new patient
// routes we add later have to explicitly opt in and we don't accidentally
// leak the pill onto marketing/corporate/clinician surfaces.
const SHOW_ON_PREFIXES = [
  '/triage',
  '/vitals',
  '/consultation-type',
  '/payment',
  '/payment-return',
  '/waiting',
  '/consent',
  '/message-sent',
  '/done',
  '/triage-review',
]

export default function StuckHelperWidget() {
  const navigate = useNavigate()
  const location = useLocation()
  const path = location?.pathname || ''

  // Only render on patient flow pages. Exclude /call explicitly because
  // the FloatingCallWidget already lives in the bottom corners during a
  // video/audio consult and we don't want to compete for that real estate.
  const shouldShow = SHOW_ON_PREFIXES.some(p => path === p || path.startsWith(`${p}/`))
  if (!shouldShow) return null

  function openHelp() {
    // Preserve enough context that support can help without asking. Path
    // goes into the message pre-fill so the admin sees "Stuck on /payment"
    // even before the patient starts typing.
    const params = new URLSearchParams({
      category: 'technical',
      source: 'stuck_widget',
      from: path,
    })
    navigate(`/contact?${params.toString()}`)
  }

  return (
    <button
      type="button"
      onClick={openHelp}
      aria-label="Stuck on this page? Get help"
      style={{
        position: 'fixed',
        bottom: 20,
        left: 20,
        zIndex: 999,
        background: '#0B6E76',
        color: 'white',
        border: 'none',
        padding: '10px 16px',
        borderRadius: 999,
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        fontSize: '.8125rem',
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(0,0,0,.15)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span style={{ fontSize: '1rem' }}>💬</span>
      Stuck? Get help
    </button>
  )
}
