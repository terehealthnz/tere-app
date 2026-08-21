import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useFeatureFlag } from '../lib/featureFlags'
import { detectRegion, REGIONS } from '../lib/region'

// Small amber banner that shows on public patient-facing pages while the
// `waitlist_mode` feature flag is on. Hidden for provider/admin routes and
// for anyone who has set the `?dev=beta` bypass in this session.
const HIDDEN_PATH_PREFIXES = [
  '/clinician', '/provider', '/admin',
  '/waitlist',   // don't show it ON the waitlist page itself
  '/careers/apply',
]

export default function BetaBanner() {
  const location = useLocation()
  const waitlistMode = useFeatureFlag('waitlist_mode')
  const [bypassed, setBypassed] = useState(false)

  useEffect(() => {
    // ?dev=beta unlocks direct booking for this session (testing).
    const params = new URLSearchParams(location.search)
    if (params.get('dev') === 'beta') sessionStorage.setItem('tere_beta_bypass', '1')
    setBypassed(sessionStorage.getItem('tere_beta_bypass') === '1')
  }, [location.search])

  const region = detectRegion()
  const onHiddenPath = HIDDEN_PATH_PREFIXES.some(p => location.pathname.startsWith(p))

  // Corporate host (tere.co.nz) is not a patient surface — no waitlist,
  // no beta banner, no CTAs to book. Just a company page.
  if (region === REGIONS.CORP) return null

  // AU beta preview banner — only fires when we actually have an AU host
  // routed (AU_HOSTS in region.js). Historically also served on tere.co.nz
  // during the Shively pitch window; now retired 2026-08-21.
  if (region === REGIONS.AU && !onHiddenPath) {
    return (
      <div style={{
        background: 'linear-gradient(90deg,#FEE2E2 0%,#FECACA 100%)',
        borderBottom: '1px solid rgba(153,27,27,.25)',
        padding: '10px 16px',
        textAlign: 'center',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        fontSize: '.8125rem',
        color: '#7F1D1D',
        lineHeight: 1.5,
      }}>
        <strong>AU BETA PREVIEW</strong> — Tere Health Australia is not yet accepting real patients. AHPRA registration + AU entity formation in progress.
      </div>
    )
  }

  if (!waitlistMode) return null
  if (bypassed) return null
  if (onHiddenPath) return null
  // US (Tere Care) has its own beta positioning (state picker + inline beta
  // tag on the intake form). The NZ-branded "Join the Tere Health waitlist"
  // page this banner links to is wrong for US visitors — hide it.
  if (region === REGIONS.US) return null

  return (
    <div style={{
      background: 'linear-gradient(90deg,#FEF3C7 0%,#FDE68A 100%)',
      borderBottom: '1px solid rgba(180,83,9,.25)',
      padding: '10px 16px',
      textAlign: 'center',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      fontSize: '.8125rem',
      color: '#78350F',
      lineHeight: 1.5,
    }}>
      <strong>Beta</strong> — bookings open shortly.{' '}
      <Link to="/waitlist" style={{ color: '#78350F', fontWeight: 700, textDecoration: 'underline' }}>
        Join the waitlist →
      </Link>
    </div>
  )
}
