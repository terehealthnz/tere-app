import React, { useState, useEffect } from 'react'
import { getRegionConfig, REGIONS } from '../../lib/region'
import { US_STATES, stateName, detectStateFromIP } from '../../lib/usStates'

// Tere Care — US patient intake, first screen.
//
// Gates on state licensure (regulatory: physician must be licensed in the
// state where the patient is *physically located* at the time of care,
// not where they reside).
//
// Flow:
//   1. Location detection — IP-based hint via ipapi.co, dropdown fallback,
//      explicit attestation that they're currently in that state.
//   2a. Licensed state  → collect name / email / phone / chief complaint
//                          and submit as a support ticket (source='terecare_intake').
//   2b. Unlicensed state → waitlist email capture.
//   3.  Confirmation screen either way.
//
// The full booking + payment + video visit flow is not wired here yet —
// this is the intent-capture MVP while Stripe US / DoseSpot / HIPAA
// consent are being stood up. Ticket goes into the existing admin queue
// and Patrick reaches out manually until the automated flow is live.

const C = {
  ink:      '#0F2029',
  ink2:     '#2A3B44',
  muted:    '#5B6B72',
  cream:    '#FBF7EF',
  cream2:   '#F1EADB',
  line:     '#DED6C4',
  lineSoft: '#EDE5D2',
  teal:     '#1C6E63',
  tealDeep: '#0F4A44',
  sage:     '#B7CFB1',
  warm:     '#D97742',
  warmDeep: '#B85D2C',
  gold:     '#C9A24A',
  danger:   '#C2451F',
}

// (US_STATES + stateName imported from src/lib/usStates.js — shared with USLanding)

// ─────────────────────────────────────────────────────────────────
// Submit to the existing patient-support endpoint. We piggyback on
// the shared ticket queue rather than standing up a new US-specific
// table until volume justifies it.
// ─────────────────────────────────────────────────────────────────
async function submitLead({ kind, name, email, phone, state, complaint }) {
  const message = [
    `Kind: ${kind}`,                         // "US intake (licensed)" | "US intake (waitlist)"
    state && `State (patient-attested): ${state} (${stateName(state)})`,
    phone && `Phone: ${phone}`,
    complaint && `Chief complaint:\n${complaint}`,
  ].filter(Boolean).join('\n\n')

  const res = await fetch('/api/patient-support', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category:      'other',
      source:        'terecare_intake',
      patient_name:  name,
      patient_email: email,
      patient_phone: phone || null,
      message,
    }),
  })
  if (!res.ok) throw new Error(`Submit failed: ${res.status}`)
  return res.json()
}

// ─────────────────────────────────────────────────────────────────
// Shared visual chrome
// ─────────────────────────────────────────────────────────────────
function Shell({ children }) {
  return (
    <div style={{
      minHeight: '100dvh', background: C.cream,
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      color: C.ink,
      display: 'flex', flexDirection: 'column',
    }}>
      <header style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.lineSoft}` }}>
        <a href="/" style={{ textDecoration: 'none' }}>
          <span style={{
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontStyle: 'italic', color: C.tealDeep,
            fontSize: '1.4rem', fontWeight: 600,
          }}>Tere Care</span>
        </a>
      </header>
      <main style={{ flex: 1, padding: '2rem 1.25rem 4rem' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          {children}
        </div>
      </main>
      <footer style={{
        padding: '1.25rem 1.5rem',
        borderTop: `1px solid ${C.lineSoft}`,
        fontSize: '.8rem', color: C.muted,
        display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem',
      }}>
        <span>© {new Date().getFullYear()} Tere Care</span>
        <span><strong style={{ color: C.warm }}>Emergency?</strong> Call 911 immediately.</span>
      </footer>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '.85rem 1rem',
  fontSize: '1rem',
  fontFamily: 'inherit',
  color: C.ink,
  background: 'white',
  border: `1.5px solid ${C.line}`,
  borderRadius: 10,
  boxSizing: 'border-box',
}
const labelStyle = {
  display: 'block',
  fontSize: '.85rem',
  fontWeight: 700,
  color: C.ink2,
  marginBottom: '.4rem',
  letterSpacing: '.02em',
}
const primaryBtn = {
  background: C.warm, color: 'white', border: 'none',
  padding: '1rem 1.5rem', borderRadius: 12,
  fontSize: '1rem', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
  width: '100%',
}
const secondaryBtn = {
  background: 'transparent', color: C.ink2, border: `1.5px solid ${C.line}`,
  padding: '.9rem 1.25rem', borderRadius: 10,
  fontSize: '.95rem', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
  width: '100%',
}

// ─────────────────────────────────────────────────────────────────
// Screen 1 — Location detection + state gate
// ─────────────────────────────────────────────────────────────────
function LocationGate({ onContinue }) {
  const [ipLoading, setIpLoading]     = useState(true)
  const [detected, setDetected]       = useState(null)      // 2-letter code from IP
  const [selected, setSelected]       = useState('')
  const [attested, setAttested]       = useState(false)

  useEffect(() => {
    let cancelled = false
    // ipapi.co free tier: 1000 req/day, no API key. Returns country_code + region_code.
    // Fallback silently if it fails — patient just uses the dropdown.
    fetch('https://ipapi.co/json/')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data) return
        if (data.country_code === 'US' && data.region_code) {
          setDetected(data.region_code)
          setSelected(data.region_code)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIpLoading(false) })
    return () => { cancelled = true }
  }, [])

  const canContinue = selected && attested

  return (
    <>
      <h1 style={{
        fontFamily: 'Cormorant Garamond, Georgia, serif',
        fontSize: 'clamp(1.9rem, 5vw, 2.5rem)',
        fontWeight: 500, letterSpacing: '-.015em',
        margin: '0 0 .5rem', lineHeight: 1.15,
      }}>Where are you right now?</h1>
      <p style={{
        color: C.ink2, lineHeight: 1.55, margin: '0 0 2rem',
        fontSize: '1rem',
      }}>
        Our physicians can only see patients in states where they are licensed. We need to know your physical location at the time of your visit — not where you live.
      </p>

      <label htmlFor="us-state" style={labelStyle}>
        Your state {ipLoading && <span style={{ color: C.muted, fontWeight: 400 }}>· detecting…</span>}
      </label>
      <select
        id="us-state"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        style={{ ...inputStyle, appearance: 'none', backgroundImage: 'none', paddingRight: '2.5rem' }}
      >
        <option value="">— Select your state —</option>
        {US_STATES.map(s => (
          <option key={s.code} value={s.code}>{s.name}</option>
        ))}
      </select>
      {detected && detected === selected && (
        <div style={{
          marginTop: '.5rem', fontSize: '.85rem', color: C.teal,
        }}>
          ✓ We detected {stateName(detected)} from your connection. Please confirm this is where you actually are.
        </div>
      )}

      <label style={{
        display: 'flex', gap: '.75rem', marginTop: '1.5rem',
        padding: '1rem', background: 'white',
        border: `1.5px solid ${C.line}`, borderRadius: 10,
        cursor: 'pointer', alignItems: 'flex-start',
      }}>
        <input
          type="checkbox"
          checked={attested}
          onChange={(e) => setAttested(e.target.checked)}
          style={{ marginTop: 3, flexShrink: 0, transform: 'scale(1.15)' }}
        />
        <span style={{ fontSize: '.9rem', color: C.ink2, lineHeight: 1.5 }}>
          I confirm I am <strong>physically located</strong> in {selected ? stateName(selected) : 'the state selected above'} at this moment, and understand that Tere Care can only provide care to patients physically in states where our physicians are licensed.
        </span>
      </label>

      <button
        onClick={() => onContinue({ state: selected })}
        disabled={!canContinue}
        style={{
          ...primaryBtn,
          marginTop: '1.5rem',
          opacity: canContinue ? 1 : .4,
          cursor: canContinue ? 'pointer' : 'not-allowed',
        }}
      >
        Continue &nbsp;→
      </button>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// Screen 2a — Licensed state, collect intake details
// ─────────────────────────────────────────────────────────────────
function IntakeForm({ state, onSubmitted }) {
  const [name, setName]           = useState('')
  const [email, setEmail]         = useState('')
  const [phone, setPhone]         = useState('')
  const [complaint, setComplaint] = useState('')
  const [attested, setAttested]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState(null)

  const canSubmit = name.trim() && email.trim() && complaint.trim() && attested && !submitting

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null); setSubmitting(true)
    try {
      await submitLead({
        kind: `US intake (licensed — ${state})`,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        state,
        complaint: complaint.trim(),
      })
      onSubmitted()
    } catch (err) {
      setError('Sorry — something went wrong submitting your details. Please try again or email hello@terecare.com directly.')
      console.error('[us-intake]', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{
        background: 'rgba(28,110,99,.08)', color: C.tealDeep,
        border: `1px solid rgba(28,110,99,.2)`, borderRadius: 10,
        padding: '.75rem 1rem', fontSize: '.9rem', marginBottom: '1.5rem',
        display: 'flex', alignItems: 'center', gap: '.5rem',
      }}>
        <span>✓</span>
        <span>We can see you in <strong>{stateName(state)}</strong>.</span>
      </div>

      <h1 style={{
        fontFamily: 'Cormorant Garamond, Georgia, serif',
        fontSize: 'clamp(1.9rem, 5vw, 2.4rem)',
        fontWeight: 500, letterSpacing: '-.015em',
        margin: '0 0 .5rem', lineHeight: 1.15,
      }}>Tell us a bit about you.</h1>
      <p style={{
        color: C.ink2, lineHeight: 1.55, margin: '0 0 1.75rem',
        fontSize: '1rem',
      }}>
        We're in early launch — a licensed physician will reach out personally to book your visit within one business day. No payment required to submit this form.
      </p>

      <div style={{ display: 'grid', gap: '1.1rem' }}>
        <div>
          <label htmlFor="us-name" style={labelStyle}>Full name</label>
          <input id="us-name" type="text" required autoComplete="name"
            value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label htmlFor="us-email" style={labelStyle}>Email</label>
          <input id="us-email" type="email" required autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label htmlFor="us-phone" style={labelStyle}>Mobile <span style={{ color: C.muted, fontWeight: 400 }}>(optional but faster)</span></label>
          <input id="us-phone" type="tel" autoComplete="tel"
            value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} placeholder="+1 555 555 5555" />
        </div>
        <div>
          <label htmlFor="us-complaint" style={labelStyle}>What's going on?</label>
          <textarea id="us-complaint" required rows={4}
            value={complaint} onChange={(e) => setComplaint(e.target.value)}
            placeholder="Brief description of what you're experiencing (UTI symptoms, cold, minor injury, prescription refill, etc.)"
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
        </div>
      </div>

      <label style={{
        display: 'flex', gap: '.75rem', marginTop: '1.5rem',
        padding: '.9rem 1rem', background: 'white',
        border: `1.5px solid ${C.line}`, borderRadius: 10,
        cursor: 'pointer', alignItems: 'flex-start',
      }}>
        <input
          type="checkbox"
          checked={attested}
          onChange={(e) => setAttested(e.target.checked)}
          style={{ marginTop: 3, flexShrink: 0, transform: 'scale(1.15)' }}
        />
        <span style={{ fontSize: '.85rem', color: C.ink2, lineHeight: 1.5 }}>
          I confirm I am <strong>physically located</strong> in {stateName(state)} right now, and understand Tere Care can only provide care to patients physically in states where our providers are licensed.
        </span>
      </label>

      {error && (
        <div style={{
          marginTop: '1rem', padding: '.75rem 1rem',
          background: 'rgba(194,69,31,.1)', color: C.danger,
          border: `1px solid rgba(194,69,31,.3)`, borderRadius: 10,
          fontSize: '.9rem',
        }}>{error}</div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          ...primaryBtn,
          marginTop: '1.25rem',
          opacity: canSubmit ? 1 : .4,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
        }}
      >
        {submitting ? 'Sending…' : 'Send my details →'}
      </button>

      <p style={{
        fontSize: '.8rem', color: C.muted, marginTop: '1.25rem', lineHeight: 1.5,
      }}>
        <strong>Not for emergencies.</strong> If you have chest pain, breathing difficulty, severe bleeding, or any life-threatening symptom, call <strong>911</strong> or go to your nearest ER.
      </p>

      <p style={{
        fontSize: '.75rem', color: C.muted, marginTop: '.75rem',
      }}>
        Wrong state? <a href="/start" style={{ color: C.teal, textDecoration: 'underline' }}>Change your state</a>
      </p>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────
// Screen 2b — Unlicensed state, waitlist capture
// ─────────────────────────────────────────────────────────────────
function WaitlistForm({ state, onSubmitted }) {
  const [name, setName]   = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const canSubmit = name.trim() && email.trim() && !submitting

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null); setSubmitting(true)
    try {
      await submitLead({
        kind: `US intake (waitlist — not yet licensed in ${state})`,
        name: name.trim(),
        email: email.trim(),
        state,
      })
      onSubmitted()
    } catch (err) {
      setError('Sorry — something went wrong. Please try again or email hello@terecare.com directly.')
      console.error('[us-intake-waitlist]', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{
        background: 'rgba(217,119,66,.1)', color: C.warmDeep,
        border: `1px solid rgba(217,119,66,.25)`, borderRadius: 10,
        padding: '.9rem 1rem', fontSize: '.9rem', marginBottom: '1.5rem',
        lineHeight: 1.5,
      }}>
        <strong>Not yet licensed in {stateName(state)}.</strong> We can only see patients in states where our physicians are actively licensed. We're expanding — leave your details and we'll email you the moment we're live in your state.
      </div>

      <h1 style={{
        fontFamily: 'Cormorant Garamond, Georgia, serif',
        fontSize: 'clamp(1.9rem, 5vw, 2.4rem)',
        fontWeight: 500, letterSpacing: '-.015em',
        margin: '0 0 .5rem', lineHeight: 1.15,
      }}>Join the waitlist.</h1>
      <p style={{
        color: C.ink2, lineHeight: 1.55, margin: '0 0 1.75rem',
        fontSize: '1rem',
      }}>
        Two fields — no obligation. We'll only email you when Tere Care launches in {stateName(state)}.
      </p>

      <div style={{ display: 'grid', gap: '1.1rem' }}>
        <div>
          <label htmlFor="wl-name" style={labelStyle}>Name</label>
          <input id="wl-name" type="text" required autoComplete="name"
            value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label htmlFor="wl-email" style={labelStyle}>Email</label>
          <input id="wl-email" type="email" required autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        </div>
      </div>

      {error && (
        <div style={{
          marginTop: '1rem', padding: '.75rem 1rem',
          background: 'rgba(194,69,31,.1)', color: C.danger,
          border: `1px solid rgba(194,69,31,.3)`, borderRadius: 10,
          fontSize: '.9rem',
        }}>{error}</div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          ...primaryBtn,
          marginTop: '1.5rem',
          opacity: canSubmit ? 1 : .4,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
        }}
      >
        {submitting ? 'Sending…' : 'Add me to the waitlist →'}
      </button>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────
// Screen 3 — Confirmation
// ─────────────────────────────────────────────────────────────────
function Confirmation({ isWaitlist }) {
  return (
    <div style={{ textAlign: 'center', paddingTop: '2rem' }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'rgba(28,110,99,.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 1.5rem',
        color: C.teal, fontSize: '2rem', fontWeight: 300,
      }}>✓</div>
      <h1 style={{
        fontFamily: 'Cormorant Garamond, Georgia, serif',
        fontSize: 'clamp(1.9rem, 5vw, 2.4rem)',
        fontWeight: 500, letterSpacing: '-.015em',
        margin: '0 0 1rem', lineHeight: 1.15,
      }}>
        {isWaitlist ? "You're on the list." : "Thanks — we've got it."}
      </h1>
      <p style={{
        color: C.ink2, lineHeight: 1.6, margin: '0 auto 2rem',
        fontSize: '1rem', maxWidth: 440,
      }}>
        {isWaitlist
          ? "We'll email you the moment Tere Care goes live in your state. No spam, no follow-up unless you want it."
          : "A licensed physician will reach out within one business day to schedule your visit. Check your email — you may get a confirmation from hello@terecare.com."}
      </p>
      <a href="/" style={{
        display: 'inline-block',
        background: 'transparent', color: C.tealDeep,
        textDecoration: 'none', border: `1.5px solid ${C.line}`,
        padding: '.75rem 1.5rem', borderRadius: 99,
        fontWeight: 600, fontSize: '.95rem',
      }}>Back to home</a>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Top-level state machine
//
// When arrived via the landing hero (?state=XX in URL) we skip the
// standalone LocationGate screen — the state is already chosen and
// the intake / waitlist forms carry the attestation inline. Direct
// deep-links to /start (no query) still get the standalone gate.
// ─────────────────────────────────────────────────────────────────
export default function USStart() {
  const licensed = React.useMemo(() => {
    const cfg = getRegionConfig(REGIONS.US)
    return new Set(cfg.licensedStates || [])
  }, [])

  // Read ?state= from URL once on mount
  const initialState = React.useMemo(() => {
    if (typeof window === 'undefined') return ''
    const raw = new URLSearchParams(window.location.search).get('state')
    if (!raw) return ''
    const code = raw.toUpperCase()
    return US_STATES.some(s => s.code === code) ? code : ''
  }, [])

  const [state, setState] = useState(initialState)
  const [step, setStep]   = useState(() => {
    if (!initialState) return 'location'
    return licensed.has(initialState) ? 'licensed' : 'unlicensed'
  })

  function onLocationContinue({ state: chosen }) {
    setState(chosen)
    setStep(licensed.has(chosen) ? 'licensed' : 'unlicensed')
  }

  return (
    <Shell>
      {step === 'location'   && <LocationGate onContinue={onLocationContinue} />}
      {step === 'licensed'   && <IntakeForm  state={state} onSubmitted={() => setStep('done')} />}
      {step === 'unlicensed' && <WaitlistForm state={state} onSubmitted={() => setStep('done')} />}
      {step === 'done'       && <Confirmation isWaitlist={!licensed.has(state)} />}
    </Shell>
  )
}
