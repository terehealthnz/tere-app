import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { createConsultation } from '../../lib/supabase'

// /work/[slug] — B2B employer-covered consultation entry point.
//
// Isolation-by-design: this route is a completely separate front door
// from the paying-patient flow (`/`, `/start`). The URL is the credential;
// no email allowlist, no employee roster to maintain. Workers arrive here
// (from an employer poster / SMS / email), the slug is validated against
// the employers table, and a pre_triage consult is created with
// employer_id + employer_paid=true stashed in sessionStorage. The rest of
// the flow (consent → triage → vitals → provider queue) is the SAME
// components as the paying flow — the only difference is that
// ConsultationType.jsx sees `employer_paid=true` in sessionStorage and
// routes to /waiting instead of /payment.
//
// Security notes:
//   1. Slug validated server-side by /api/employer-lookup (returns 404
//      for missing/inactive so a probe can't distinguish).
//   2. Employer_id is stashed in sessionStorage but re-verified again
//      inside /api/create-consultation (task #71 fraud check stays).
//   3. Monthly cap enforced at slug lookup — once hit, patients see a
//      clear "contact your employer" message rather than an error.

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const TEAL_LIGHT = '#D4EEF0'
const FF = 'Plus Jakarta Sans, sans-serif'
const SERIF = 'Cormorant Garamond, Georgia, serif'

export default function WorkLanding() {
  const { slug } = useParams()
  const navigate = useNavigate()

  const [phase, setPhase] = useState('checking')  // checking | ready | invalid | capped | starting
  const [employer, setEmployer] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    async function validate() {
      try {
        const r = await apiFetch(`/api/employer-lookup?slug=${encodeURIComponent(slug || '')}`)
        if (cancelled) return
        if (r.status === 404) { setPhase('invalid'); return }
        if (r.status === 429) {
          const body = await r.json().catch(() => ({}))
          setErrorMsg(body?.error || 'This employer plan has reached its monthly cap.')
          setPhase('capped')
          return
        }
        if (!r.ok) { setPhase('invalid'); return }
        const body = await r.json()
        setEmployer(body.employer)
        setPhase('ready')
      } catch {
        if (!cancelled) setPhase('invalid')
      }
    }
    validate()
    return () => { cancelled = true }
  }, [slug])

  async function startConsultation() {
    if (!employer) return
    setPhase('starting')

    // Clear any prior consult from sessionStorage so we don't accidentally
    // resume a paying-patient consult under an employer wrapper.
    sessionStorage.removeItem('consultation_id')
    sessionStorage.removeItem('consultationId')
    sessionStorage.removeItem('paymentIntentId')

    // Stash employer context so ConsultationType.jsx picks it up and
    // routes to /waiting (bypasses Payment) after triage completes.
    sessionStorage.setItem('employer_id', employer.id)
    sessionStorage.setItem('employer_name', employer.company_name)
    sessionStorage.setItem('employer_paid', 'true')

    try {
      const pt = await createConsultation({
        status: 'pre_triage',
        patientLanguage: sessionStorage.getItem('patient_language') || 'en',
        employerId: employer.id,  // server re-verifies and sets employer_paid=true
      })
      if (pt?.id) sessionStorage.setItem('consultation_id', pt.id)
    } catch (e) {
      console.error('[work-landing] createConsultation failed:', e?.message || e)
      // Don't block the flow — the consult will get created downstream if
      // AITriage falls back to its own create. But log so we notice.
    }
    navigate('/consent')
  }

  return (
    <main style={{
      background: NAVY, minHeight: '100dvh',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '2rem 1.5rem', fontFamily: FF, textAlign: 'center',
    }}>
      {/* Bg circles for visual consistency with TereIntro */}
      <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: TEAL, opacity: .06, top: -80, right: -80 }} />
      <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: TEAL, opacity: .06, bottom: -60, left: -60 }} />

      <div style={{ position: 'relative', maxWidth: 460, width: '100%' }}>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: '2.5rem', color: TEAL_LIGHT, marginBottom: 4 }}>Tere Health</div>
        <div style={{ fontSize: '.7rem', color: 'rgba(212,238,240,.7)', letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: '2.5rem' }}>
          Emergency medicine. On your phone.
        </div>

        {phase === 'checking' && (
          <div style={{ color: TEAL_LIGHT, opacity: .7 }}>Checking access…</div>
        )}

        {phase === 'invalid' && (
          <div style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: '2rem 1.5rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔒</div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>This link is not active</div>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: '.9rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              The employer access link you used is no longer valid. If you believe this is an error, please contact your employer or Tere Health support.
            </div>
            <button onClick={() => navigate('/')} style={{
              background: TEAL, color: 'white', border: 'none', padding: '.75rem 1.5rem', borderRadius: 99,
              fontWeight: 700, fontSize: '.9rem', cursor: 'pointer', fontFamily: FF,
            }}>Continue as a paying patient</button>
          </div>
        )}

        {phase === 'capped' && (
          <div style={{ background: 'rgba(255,193,7,.08)', border: '1px solid rgba(255,193,7,.3)', borderRadius: 16, padding: '2rem 1.5rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📅</div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>Monthly cap reached</div>
            <div style={{ color: 'rgba(255,255,255,.75)', fontSize: '.9rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              {errorMsg}
            </div>
            <button onClick={() => navigate('/')} style={{
              background: TEAL, color: 'white', border: 'none', padding: '.75rem 1.5rem', borderRadius: 99,
              fontWeight: 700, fontSize: '.9rem', cursor: 'pointer', fontFamily: FF,
            }}>Continue as a paying patient</button>
          </div>
        )}

        {(phase === 'ready' || phase === 'starting') && employer && (
          <div style={{ background: 'rgba(11,110,118,.15)', border: '1px solid rgba(11,110,118,.4)', borderRadius: 16, padding: '2rem 1.5rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>👋</div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: '1.25rem', marginBottom: 6 }}>Welcome, {employer.company_name} team</div>
            <div style={{ color: TEAL_LIGHT, fontSize: '.95rem', fontWeight: 600, marginBottom: '1.5rem' }}>
              Your consultation is covered
            </div>
            <div style={{ color: 'rgba(255,255,255,.75)', fontSize: '.875rem', lineHeight: 1.6, marginBottom: '2rem' }}>
              An Emergency Medicine specialist will see you on video or phone. No payment needed. ACC claims lodged automatically for injuries.
            </div>
            <button onClick={startConsultation} disabled={phase === 'starting'} style={{
              background: '#F97316', color: 'white', border: 'none', padding: '1rem 2.5rem', borderRadius: 99,
              fontWeight: 700, fontSize: '1.0625rem', cursor: phase === 'starting' ? 'wait' : 'pointer',
              fontFamily: FF, boxShadow: '0 4px 20px rgba(249,115,22,.4)',
              opacity: phase === 'starting' ? .7 : 1,
            }}>
              {phase === 'starting' ? 'Starting…' : 'Start consultation'}
            </button>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: '.75rem', marginTop: '1.5rem' }}>
              Emergency? Call 111 immediately.
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
