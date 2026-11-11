// Public landing for /gp/[slug] — rural GP coverage entry point.
//
// Welcome to [practice] GP Cover, with two paths:
//   1. Book a Future Visit → slot picker + patient form at /gp/:slug/book
//   2. Proceed to Scheduled → patient with existing appt joins waiting
//      room directly (phase 1: they land on /gp/:slug/join with their
//      consultation_id from SMS; phase 2: integrates with triage flow)
//
// No auth needed. Practice resolved by slug from /api/pho-rural?action=practice.

import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const CREAM = '#F7F5F0'
const FF = 'Plus Jakarta Sans, sans-serif'

export default function GpCoverLanding() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [practice, setPractice] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`/api/pho-rural?action=practice&slug=${encodeURIComponent(slug)}`)
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Not found')
        setPractice(j.practice)
      } catch (e) { setError(e.message) }
    })()
  }, [slug])

  if (error) {
    return (
      <div style={{ minHeight: '100dvh', background: CREAM, fontFamily: FF, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: NAVY, marginBottom: '.5rem' }}>Practice not found</div>
          <div style={{ color: '#6B7280' }}>{error}</div>
        </div>
      </div>
    )
  }

  if (!practice) {
    return <div style={{ minHeight: '100dvh', background: CREAM, fontFamily: FF, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}>Loading…</div>
  }

  const phoName = practice.pho_contracts?.name

  return (
    <div style={{ minHeight: '100dvh', background: CREAM, fontFamily: FF, display: 'flex', flexDirection: 'column' }}>
      <nav style={{ background: NAVY, color: 'white', padding: '1rem 1.25rem' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', fontStyle: 'italic', fontFamily: 'Georgia, serif', fontSize: '1.3rem', color: '#D4EEF0' }}>Tere Health</div>
      </nav>

      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.25rem' }}>
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '.8125rem', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '.5rem' }}>
            Welcome to
          </div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: NAVY, margin: 0, lineHeight: 1.2 }}>
            {practice.name} GP Cover
          </h1>
          {phoName && (
            <div style={{ color: '#6B7280', fontSize: '.9375rem', marginTop: '.5rem' }}>
              Provided by Tere Health in partnership with {phoName}
            </div>
          )}

          <div style={{ marginTop: '2.5rem', display: 'grid', gap: '1rem' }}>
            <button onClick={() => navigate(`/gp/${slug}/book`)}
              style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 14, padding: '1.25rem 1.5rem', fontFamily: FF, fontWeight: 700, fontSize: '1.0625rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(11,110,118,0.25)' }}>
              Book a Future Visit
              <div style={{ fontSize: '.8125rem', fontWeight: 500, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
                See available appointment times
              </div>
            </button>

            <button onClick={() => navigate(`/gp/${slug}/join`)}
              style={{ background: 'white', color: NAVY, border: `2px solid ${NAVY}`, borderRadius: 14, padding: '1.25rem 1.5rem', fontFamily: FF, fontWeight: 700, fontSize: '1.0625rem', cursor: 'pointer' }}>
              Proceed to Scheduled Visit
              <div style={{ fontSize: '.8125rem', fontWeight: 500, color: '#6B7280', marginTop: 4 }}>
                I already have an appointment
              </div>
            </button>
          </div>

          <div style={{ marginTop: '2.5rem', padding: '1rem 1.25rem', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, fontSize: '.8125rem', color: '#78350F', lineHeight: 1.5, textAlign: 'left' }}>
            <b>Not an emergency service.</b> If you or someone else has chest pain, difficulty breathing, severe bleeding or another emergency, call <b>111</b> now.
          </div>
        </div>
      </main>

      <footer style={{ padding: '1rem', textAlign: 'center', fontSize: '.75rem', color: '#9CA3AF' }}>
        Tere Health Limited · terehealth.co.nz
      </footer>
    </div>
  )
}
