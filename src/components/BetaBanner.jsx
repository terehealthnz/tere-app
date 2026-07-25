import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useFeatureFlag } from '../lib/featureFlags'

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

  if (!waitlistMode) return null
  if (bypassed) return null
  if (HIDDEN_PATH_PREFIXES.some(p => location.pathname.startsWith(p))) return null

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
