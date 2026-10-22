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

  // Positioned bottom-right on narrow viewports and as a compact circle
  // (icon only, with aria-label) so it never overlaps a step's Skip or
  // Continue button. The 2026-10-22 mobile walk found the previous
  // bottom-left pill was large enough to intercept pointer events on top
  // of the photo-upload Skip control; shrinking + moving fixes that.
  // Full-text pill reappears on wider viewports where there's no CTA
  // conflict and the extra label aids discoverability.
  return (
    <button
      type="button"
      onClick={openHelp}
      aria-label="Stuck on this page? Get help"
      title="Stuck? Get help"
      style={{
        position: 'fixed',
        bottom: 'calc(16px + env(safe-area-inset-bottom))',
        right:  'calc(16px + env(safe-area-inset-right))',
        zIndex: 999,
        background: '#0B6E76',
        color: 'white',
        border: 'none',
        width: 44,
        height: 44,
        padding: 0,
        borderRadius: '50%',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        fontSize: '1.1rem',
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(0,0,0,.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span aria-hidden="true">💬</span>
    </button>
  )
}
