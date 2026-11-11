// SMS-landing page for scheduled rural GP visits.
//
// Flow: patient gets an SMS 15 min before their slot with a link like
//   https://terehealth.co.nz/gp/renwick/join?c=<consultation_id>
// Lands here, we validate the consult is in the join window, then
// hand off to the existing /waiting/:id surface where vitals and the
// video call already live.
//
// If the appointment is too early or too late we show a clean message
// instead of dumping the user into a half-broken waiting room.

import React, { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const BG   = '#F7F5F0'
const FF   = 'Plus Jakarta Sans, sans-serif'

export default function GpCoverJoin() {
  const { slug } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    const consultId = search.get('c')
    if (!consultId) { setState({ status: 'error', msg: 'Missing appointment reference.' }); return }

    apiFetch(`/api/pho-rural?action=join_lookup&c=${encodeURIComponent(consultId)}`)
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) {
          const code = r.status === 425 ? 'too_early' : r.status === 410 ? 'closed' : 'error'
          return setState({ status: code, msg: j.error || 'Could not open this appointment.', minutes_until: j.minutes_until })
        }
        navigate(`/waiting/${consultId}`, { replace: true })
      })
      .catch(() => setState({ status: 'error', msg: 'Connection problem. Please try again.' }))
  }, [search, navigate])

  return (
    <div style={{ minHeight: '100dvh', background: BG, fontFamily: FF, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '2rem 1.5rem', maxWidth: 420, width: '100%', textAlign: 'center' }}>
        {state.status === 'loading' && <>
          <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>⏳</div>
          <div style={{ fontSize: '.9375rem', color: '#6B7280' }}>Opening your appointment…</div>
        </>}
        {state.status === 'too_early' && <>
          <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>🕒</div>
          <div style={{ fontSize: '1.0625rem', fontWeight: 700, color: NAVY, marginBottom: '.5rem' }}>Not time yet</div>
          <div style={{ fontSize: '.9375rem', color: '#4B5563', marginBottom: '1rem' }}>{state.msg}</div>
          <div style={{ fontSize: '.8125rem', color: '#6B7280' }}>Please tap this link again about 15 minutes before your appointment.</div>
        </>}
        {state.status === 'closed' && <>
          <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>⚠️</div>
          <div style={{ fontSize: '1.0625rem', fontWeight: 700, color: NAVY, marginBottom: '.5rem' }}>This appointment is no longer open</div>
          <div style={{ fontSize: '.9375rem', color: '#4B5563', marginBottom: '1rem' }}>{state.msg}</div>
          <button onClick={() => navigate(`/gp/${slug}`)} style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 8, padding: '.6rem 1.25rem', fontFamily: FF, fontWeight: 700, fontSize: '.875rem', cursor: 'pointer' }}>
            Back to home
          </button>
        </>}
        {state.status === 'error' && <>
          <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>⚠️</div>
          <div style={{ fontSize: '1.0625rem', fontWeight: 700, color: NAVY, marginBottom: '.5rem' }}>Something went wrong</div>
          <div style={{ fontSize: '.9375rem', color: '#4B5563', marginBottom: '1rem' }}>{state.msg}</div>
          <button onClick={() => window.location.reload()} style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 8, padding: '.6rem 1.25rem', fontFamily: FF, fontWeight: 700, fontSize: '.875rem', cursor: 'pointer' }}>
            Try again
          </button>
        </>}
      </div>
    </div>
  )
}
