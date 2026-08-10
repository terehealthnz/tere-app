import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRegionConfig, REGIONS } from '../../lib/region'
import { US_STATES, stateName, detectStateFromIP } from '../../lib/usStates'
import { LANGUAGES, t } from '../../lib/i18n'

// Small hook so all downstream screens re-render when the LanguagePicker
// writes a new value to sessionStorage. The native 'storage' event only
// fires cross-tab, so we also listen for a same-tab 'tere-lang-change'
// event that the picker dispatches manually.
function usePatientLang() {
  const [lang, setLang] = useState(() => {
    try { return sessionStorage.getItem('patient_language') || 'en' } catch { return 'en' }
  })
  useEffect(() => {
    const h = () => {
      try { setLang(sessionStorage.getItem('patient_language') || 'en') } catch {}
    }
    window.addEventListener('storage', h)
    window.addEventListener('tere-lang-change', h)
    return () => {
      window.removeEventListener('storage', h)
      window.removeEventListener('tere-lang-change', h)
    }
  }, [])
  return lang
}

// Languages offered to US patients. Excludes mi (Te Reo) and sm (Samoan) — those
// are NZ Pacific-specific and would confuse a US audience. Everything else in
// the shared i18n catalogue is US-relevant. English shows the US flag (the
// shared catalogue uses 🇬🇧 for the NZ audience).
const US_LANG_CODES = new Set(['en', 'es', 'zh', 'ko', 'ja', 'fr', 'de', 'nl', 'ar', 'hi'])
const US_LANGUAGES = LANGUAGES
  .filter(l => US_LANG_CODES.has(l.code))
  .map(l => l.code === 'en' ? { ...l, flag: '🇺🇸' } : l)

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
// US patient intake creates a REAL consultation record (not a support
// ticket) so the patient joins the shared waiting-room + video flow
// from the NZ codebase. patient_state is captured so provider-side
// filtering (task follow-up) can gate pickup to US-licensed providers.
//
// Beta: no charge — payment_amount stays 0 for terecare intakes until
// Stripe US is wired. Provider still gets paid via Tere Care ledger.
// ─────────────────────────────────────────────────────────────────
function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/)
  return { first: parts[0] || '', last: parts.slice(1).join(' ') || '' }
}

async function createUSConsultation({ name, dob, email, phone, state, complaint, hipaa, lang }) {
  const { first, last } = splitName(name)
  const notesForProvider = [
    `US intake (Tere Care beta) — state: ${state} (${stateName(state)})`,
    hipaa ? `HIPAA NPP acknowledged: v${hipaa.version} at ${hipaa.at}` : null,
    'Beta consult — no charge collected at intake.',
  ].filter(Boolean).join('\n')

  const payload = {
    // Core patient identity
    patient_first_name: first,
    patient_last_name:  last,
    patient_dob:        dob || null,
    patient_email:      email,
    patient_phone:      phone || null,
    patient_language:   lang || 'en',
    // US-specific
    patient_state:      state,
    // Clinical
    chief_complaint:    complaint,
    consultation_type:  'video',
    // Enters the queue directly; no payment gate for beta terecare intakes.
    status:             'waiting',
    payment_amount:     0,
    // Consents — HIPAA replaces HDC; we mirror the shape the NZ flow
    // expects so the provider chart doesn't show empty consent fields.
    hdc_consent_at:     new Date().toISOString(),
    // Free-text audit note surfaced to the reviewing provider
    notes_draft:        notesForProvider,
  }

  const res = await fetch('/api/create-consultation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    let msg = `Submit failed: ${res.status}`
    try { const j = await res.json(); if (j?.error) msg = j.error } catch {}
    throw new Error(msg)
  }
  const { consultation } = await res.json()
  return consultation
}

// ─────────────────────────────────────────────────────────────────
// Shared visual chrome
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// Screen 0 — Language landing (mirrors NZ TereIntro pattern but with
// the Tere Care warm palette and no kiwi). Patient picks a language
// first, then the state machine walks LocationGate → HipaaGate → intake.
// Choice persists via sessionStorage.patient_language and drives every
// downstream t() call.
// ─────────────────────────────────────────────────────────────────
// Shared back link — appears at the top of every step except the first.
// Renders as "← Back" in muted grey; clicks call onBack from the parent.
function BackLink({ onClick }) {
  if (!onClick) return null
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none', border: 'none', color: C.muted, cursor: 'pointer',
        padding: '0 0 1.25rem', fontFamily: 'inherit', fontSize: '.85rem',
        fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '.35rem',
      }}
    >
      <span aria-hidden="true">←</span> Back
    </button>
  )
}

function LanguageLanding({ onContinue }) {
  const [lang, setLang] = useState(() => {
    try { return sessionStorage.getItem('patient_language') || 'en' } catch { return 'en' }
  })
  function selectLang(code) {
    setLang(code)
    try {
      sessionStorage.setItem('patient_language', code)
      window.dispatchEvent(new Event('tere-lang-change'))
    } catch {}
  }
  return (
    <div style={{ textAlign: 'center', paddingTop: '.5rem' }}>
      {/* Warm hero mark — teal cross over sunburst rays, no kiwi. */}
      <div style={{
        width: 96, height: 96, margin: '0 auto 1.25rem',
        borderRadius: '50%',
        background: `radial-gradient(circle at 50% 40%, ${C.gold}22, transparent 70%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          {/* Sunburst rays */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
            <line key={deg} x1="32" y1="6" x2="32" y2="12"
              stroke={C.gold} strokeWidth="2" strokeLinecap="round"
              transform={`rotate(${deg} 32 32)`} opacity="0.55" />
          ))}
          {/* Circle + medical cross */}
          <circle cx="32" cy="32" r="18" fill={C.teal} />
          <rect x="29" y="22" width="6" height="20" rx="1.5" fill="white" />
          <rect x="22" y="29" width="20" height="6" rx="1.5" fill="white" />
        </svg>
      </div>

      <div style={{
        fontFamily: 'Cormorant Garamond, Georgia, serif',
        fontStyle: 'italic', color: C.tealDeep,
        fontSize: 'clamp(2rem, 6vw, 2.6rem)', lineHeight: 1.05,
        marginBottom: '.35rem',
      }}>
        Tere Care
      </div>
      <div style={{
        fontSize: '.72rem', color: C.ink2, letterSpacing: '.15em',
        textTransform: 'uppercase', fontWeight: 600, marginBottom: '1.75rem',
      }}>
        Urgent telemedicine · No insurance
      </div>

      <div style={{
        fontSize: '.72rem', color: C.muted, textTransform: 'uppercase',
        letterSpacing: '.1em', marginBottom: '.75rem', fontWeight: 600,
      }}>
        {t('choose_language', lang)}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8, marginBottom: '1.75rem',
      }}>
        {US_LANGUAGES.map(l => {
          const on = lang === l.code
          return (
            <button key={l.code} onClick={() => selectLang(l.code)} style={{
              background: on ? `rgba(28,110,99,.12)` : 'white',
              border: `1.5px solid ${on ? C.teal : C.line}`,
              borderRadius: 10, padding: '10px 6px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              transition: 'all .15s',
            }}>
              <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{l.flag}</span>
              <span style={{
                fontSize: '.68rem', color: on ? C.tealDeep : C.ink2,
                fontFamily: 'inherit', fontWeight: on ? 700 : 500,
              }}>{l.nativeName}</span>
            </button>
          )
        })}
      </div>

      <button onClick={onContinue} style={{
        ...primaryBtn,
        width: '100%',
      }}>
        {t('us_continue', lang)} &nbsp;→
      </button>
    </div>
  )
}

function Shell({ children }) {
  return (
    <div style={{
      minHeight: '100dvh', background: C.cream,
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      color: C.ink,
      display: 'flex', flexDirection: 'column',
    }}>
      <header style={{
        padding: '1.25rem 1.5rem',
        borderBottom: `1px solid ${C.lineSoft}`,
      }}>
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
function LocationGate({ onContinue, onBack }) {
  const lang = usePatientLang()
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
      <BackLink onClick={onBack} />
      <h1 style={{
        fontFamily: 'Cormorant Garamond, Georgia, serif',
        fontSize: 'clamp(1.9rem, 5vw, 2.5rem)',
        fontWeight: 500, letterSpacing: '-.015em',
        margin: '0 0 .5rem', lineHeight: 1.15,
      }}>{t('us_location_title', lang)}</h1>
      <p style={{
        color: C.ink2, lineHeight: 1.55, margin: '0 0 2rem',
        fontSize: '1rem',
      }}>
        {t('us_location_subtitle', lang)}
      </p>

      <label htmlFor="us-state" style={labelStyle}>
        {t('us_location_state_label', lang)} {ipLoading && <span style={{ color: C.muted, fontWeight: 400 }}>{t('us_location_detecting', lang)}</span>}
      </label>
      <select
        id="us-state"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        style={{ ...inputStyle, appearance: 'none', backgroundImage: 'none', paddingRight: '2.5rem' }}
      >
        <option value="">{t('us_location_state_placeholder', lang)}</option>
        {US_STATES.map(s => (
          <option key={s.code} value={s.code}>{s.name}</option>
        ))}
      </select>
      {detected && detected === selected && (
        <div style={{
          marginTop: '.5rem', fontSize: '.85rem', color: C.teal,
        }}>
          {t('us_location_detected_confirm', lang, { stateName: stateName(detected) })}
        </div>
      )}

      <label style={{
        display: 'flex', gap: '.65rem', marginTop: '1.5rem',
        cursor: 'pointer', alignItems: 'center',
      }}>
        <input
          type="checkbox"
          checked={attested}
          onChange={(e) => setAttested(e.target.checked)}
          style={{ flexShrink: 0, transform: 'scale(1.1)', cursor: 'pointer' }}
        />
        <span style={{ fontSize: '.9rem', color: C.ink2 }}>
          {t('us_attest_prefix', lang)}<strong>{selected ? stateName(selected) : t('us_attest_fallback_location', lang)}</strong>{t('us_attest_suffix', lang)}
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
        {t('us_continue', lang)}
      </button>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// HIPAA acknowledgment gate — shown before any PHI is collected.
// 45 CFR 164.520(c) requires we provide the NPP at or before first
// service delivery and make a good-faith effort to obtain written
// acknowledgment. Checkbox click + server-side timestamp satisfies
// the acknowledgment part; the linked /notice-of-privacy-practices
// page satisfies the provision part.
// ─────────────────────────────────────────────────────────────────
const HIPAA_NPP_VERSION = '1.0'

function HipaaGate({ state, onAccept, onBack }) {
  const lang = usePatientLang()
  const [ack, setAck] = useState(false)
  return (
    <>
      <BackLink onClick={onBack} />
      <div style={{
        background: 'rgba(28,110,99,.08)', color: C.tealDeep,
        border: `1px solid rgba(28,110,99,.2)`, borderRadius: 10,
        padding: '.75rem 1rem', fontSize: '.9rem', marginBottom: '1.5rem',
        display: 'flex', alignItems: 'center', gap: '.5rem',
      }}>
        <span>✓</span>
        <span>{t('us_hipaa_banner_prefix', lang)}<strong>{stateName(state)}</strong>{t('us_hipaa_banner_suffix', lang)}</span>
      </div>

      <h1 style={{
        fontFamily: 'Cormorant Garamond, Georgia, serif',
        fontSize: 'clamp(1.9rem, 5vw, 2.4rem)',
        fontWeight: 500, letterSpacing: '-.015em',
        margin: '0 0 .5rem', lineHeight: 1.15,
      }}>{t('us_hipaa_title', lang)}</h1>
      <p style={{
        color: C.ink2, lineHeight: 1.55, margin: '0 0 1.5rem',
        fontSize: '1rem',
      }}>
        {t('us_hipaa_subtitle', lang)}
      </p>

      <div style={{
        background: 'white', border: `1.5px solid ${C.line}`,
        borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1.25rem',
      }}>
        <ul style={{
          listStyle: 'none', padding: 0, margin: 0,
          fontSize: '.925rem', lineHeight: 1.65, color: C.ink2,
        }}>
          <li style={{ padding: '.35rem 0', display: 'flex', gap: '.6rem' }}>
            <span style={{ color: C.teal, fontWeight: 700, flexShrink: 0 }}>✓</span>
            <span>{t('us_hipaa_bullet_1', lang)}</span>
          </li>
          <li style={{ padding: '.35rem 0', display: 'flex', gap: '.6rem' }}>
            <span style={{ color: C.teal, fontWeight: 700, flexShrink: 0 }}>✓</span>
            <span>{t('us_hipaa_bullet_2', lang)}</span>
          </li>
          <li style={{ padding: '.35rem 0', display: 'flex', gap: '.6rem' }}>
            <span style={{ color: C.teal, fontWeight: 700, flexShrink: 0 }}>✓</span>
            <span>{t('us_hipaa_bullet_3', lang)}</span>
          </li>
          <li style={{ padding: '.35rem 0', display: 'flex', gap: '.6rem' }}>
            <span style={{ color: C.teal, fontWeight: 700, flexShrink: 0 }}>✓</span>
            <span>{t('us_hipaa_bullet_4', lang)}</span>
          </li>
          <li style={{ padding: '.35rem 0', display: 'flex', gap: '.6rem' }}>
            <span style={{ color: C.teal, fontWeight: 700, flexShrink: 0 }}>✓</span>
            <span>{t('us_hipaa_bullet_5', lang)}</span>
          </li>
        </ul>
      </div>

      <p style={{
        fontSize: '.9rem', color: C.ink2, marginBottom: '1.25rem', lineHeight: 1.5,
      }}>
        {t('us_hipaa_full_details_prefix', lang)}<a
          href="/notice-of-privacy-practices"
          target="_blank" rel="noopener noreferrer"
          style={{ color: C.teal, textDecoration: 'underline', fontWeight: 600 }}
        >{t('us_hipaa_full_details_link', lang)}</a>
      </p>

      <div style={{
        padding: '.85rem 1rem',
        background: 'white',
        border: `1.5px solid ${C.line}`,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        gap: '.75rem',
      }}>
        <input
          type="checkbox" id="us-hipaa-ack"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
          style={{
            width: 18, height: 18,
            margin: 0, flexShrink: 0,
            cursor: 'pointer',
            accentColor: C.teal,
          }}
        />
        <label htmlFor="us-hipaa-ack" style={{
          fontSize: '.9rem', color: C.ink2,
          cursor: 'pointer', margin: 0, flex: 1,
          userSelect: 'none', lineHeight: 1.45,
        }}>
          {t('us_hipaa_ack_label', lang)}
        </label>
      </div>

      <button
        onClick={() => ack && onAccept({
          version: HIPAA_NPP_VERSION,
          at: new Date().toISOString(),
        })}
        disabled={!ack}
        style={{
          ...primaryBtn,
          marginTop: '1.5rem',
          opacity: ack ? 1 : .4,
          cursor: ack ? 'pointer' : 'not-allowed',
        }}
      >
        {t('us_continue', lang)}
      </button>

      <p style={{
        fontSize: '.75rem', color: C.muted, marginTop: '1rem',
      }}>
        {t('us_wrong_state_prefix', lang)}<a href="/start" style={{ color: C.teal, textDecoration: 'underline' }}>{t('us_wrong_state_link', lang)}</a>
      </p>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// Screen 2a — Licensed state, collect intake details
// ─────────────────────────────────────────────────────────────────
function IntakeForm({ state, hipaa, onBack }) {
  const lang = usePatientLang()
  const navigate = useNavigate()
  const [name, setName]           = useState('')
  const [dob, setDob]             = useState('')
  const [email, setEmail]         = useState('')
  const [phone, setPhone]         = useState('')
  const [complaint, setComplaint] = useState('')
  const [attested, setAttested]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState(null)

  const canSubmit = name.trim() && dob && email.trim() && phone.trim() && complaint.trim() && attested && !submitting

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null); setSubmitting(true)
    try {
      const consult = await createUSConsultation({
        name: name.trim(),
        dob,
        email: email.trim(),
        phone: phone.trim(),
        state,
        complaint: complaint.trim(),
        hipaa,
        lang,
      })
      // Persist the id so /waiting/<id> and the shared downstream flow
      // (PatientCall, PostConsult) can find it without hitting the DB again.
      try {
        sessionStorage.setItem('consultationId', consult.id)
        sessionStorage.setItem('us_patient_state', state)
        if (hipaa) sessionStorage.setItem('us_hipaa_ack', JSON.stringify(hipaa))
      } catch {}
      navigate(`/waiting/${consult.id}`, { replace: true })
      return
    } catch (err) {
      // Show any server-supplied error message when we have one (e.g., HIPAA
      // gate not walked, rate-limited email, too-long complaint) so the user
      // knows what to fix. Otherwise fall back to a generic prompt.
      const raw = String(err?.message || '')
      const friendly = raw && !raw.startsWith('Submit failed:')
        ? raw
        : t('us_intake_submit_error', lang)
      setError(friendly)
      // Don't dump the full error to the console — could leak form state
      // to anyone with DevTools open. Just log a generic tag.
      console.warn('[us-intake] submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <BackLink onClick={onBack} />
      <div style={{
        background: 'rgba(28,110,99,.08)', color: C.tealDeep,
        border: `1px solid rgba(28,110,99,.2)`, borderRadius: 10,
        padding: '.75rem 1rem', fontSize: '.9rem', marginBottom: '1.5rem',
        display: 'flex', alignItems: 'center', gap: '.5rem',
        justifyContent: 'space-between', flexWrap: 'wrap',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span>✓</span>
          <span>{t('us_intake_banner_prefix', lang)}<strong>{stateName(state)}</strong>{t('us_intake_banner_suffix', lang)}</span>
        </span>
        <span style={{
          fontSize: '.65rem', letterSpacing: '.14em', textTransform: 'uppercase',
          fontWeight: 700, color: C.gold,
          background: 'rgba(201,162,74,.15)',
          padding: '3px 8px', borderRadius: 99,
        }}>{t('us_intake_beta', lang)}</span>
      </div>

      <h1 style={{
        fontFamily: 'Cormorant Garamond, Georgia, serif',
        fontSize: 'clamp(1.9rem, 5vw, 2.4rem)',
        fontWeight: 500, letterSpacing: '-.015em',
        margin: '0 0 .5rem', lineHeight: 1.15,
      }}>{t('us_intake_title', lang)}</h1>
      <p style={{
        color: C.ink2, lineHeight: 1.55, margin: '0 0 1.75rem',
        fontSize: '1rem',
      }}>
        {t('us_intake_subtitle', lang)}
      </p>

      <div style={{ display: 'grid', gap: '1.1rem' }}>
        <div>
          <label htmlFor="us-name" style={labelStyle}>{t('us_intake_name_label', lang)}</label>
          <input id="us-name" type="text" required autoComplete="name"
            value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label htmlFor="us-dob" style={labelStyle}>Date of birth</label>
          <input id="us-dob" type="date" required autoComplete="bday"
            value={dob} onChange={(e) => setDob(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            style={inputStyle} />
        </div>
        <div>
          <label htmlFor="us-email" style={labelStyle}>{t('us_intake_email_label', lang)}</label>
          <input id="us-email" type="email" required autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label htmlFor="us-phone" style={labelStyle}>{t('us_intake_mobile_label', lang)}</label>
          <input id="us-phone" type="tel" required autoComplete="tel"
            value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} placeholder="+1 555 555 5555" />
        </div>
        <div>
          <label htmlFor="us-complaint" style={labelStyle}>{t('us_intake_complaint_label', lang)}</label>
          <textarea id="us-complaint" required rows={4} maxLength={2000}
            value={complaint} onChange={(e) => setComplaint(e.target.value)}
            placeholder={t('us_intake_complaint_placeholder', lang)}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
        </div>
      </div>

      <div style={{
        marginTop: '1.5rem',
        padding: '.85rem 1rem',
        background: 'white',
        border: `1.5px solid ${C.line}`,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        gap: '.75rem',
      }}>
        <input
          type="checkbox" id="us-attest"
          checked={attested}
          onChange={(e) => setAttested(e.target.checked)}
          style={{
            width: 18, height: 18,
            margin: 0, flexShrink: 0,
            cursor: 'pointer',
            accentColor: C.teal,
          }}
        />
        <label htmlFor="us-attest" style={{
          fontSize: '.9rem', color: C.ink2,
          cursor: 'pointer', margin: 0, flex: 1,
          userSelect: 'none',
        }}>
          {t('us_attest_prefix', lang)}<strong>{stateName(state)}</strong>{t('us_attest_suffix', lang)}
        </label>
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
          marginTop: '1.25rem',
          opacity: canSubmit ? 1 : .4,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
        }}
      >
        {submitting ? t('us_sending', lang) : t('us_intake_send', lang)}
      </button>

      <p style={{
        fontSize: '.8rem', color: C.muted, marginTop: '1.25rem', lineHeight: 1.5,
      }}>
        <strong>{t('us_intake_emergency_prefix', lang)}</strong>{t('us_intake_emergency_body_prefix', lang)}<strong>911</strong>{t('us_intake_emergency_body_suffix', lang)}
      </p>

      <p style={{
        fontSize: '.75rem', color: C.muted, marginTop: '.75rem',
      }}>
        {t('us_wrong_state_prefix', lang)}<a href="/start" style={{ color: C.teal, textDecoration: 'underline' }}>{t('us_wrong_state_link', lang)}</a>
      </p>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────
// Screen 2b — Unlicensed state, waitlist capture
// ─────────────────────────────────────────────────────────────────
function WaitlistForm({ state, onSubmitted, onBack }) {
  const lang = usePatientLang()
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
      setError(t('us_waitlist_submit_error', lang))
      console.error('[us-intake-waitlist]', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <BackLink onClick={onBack} />
      <div style={{
        background: 'rgba(217,119,66,.1)', color: C.warmDeep,
        border: `1px solid rgba(217,119,66,.25)`, borderRadius: 10,
        padding: '.9rem 1rem', fontSize: '.9rem', marginBottom: '1.5rem',
        lineHeight: 1.5,
      }}>
        <strong>{t('us_waitlist_banner_bold', lang, { stateName: stateName(state) })}</strong>{t('us_waitlist_banner_rest', lang)}
      </div>

      <h1 style={{
        fontFamily: 'Cormorant Garamond, Georgia, serif',
        fontSize: 'clamp(1.9rem, 5vw, 2.4rem)',
        fontWeight: 500, letterSpacing: '-.015em',
        margin: '0 0 .5rem', lineHeight: 1.15,
      }}>{t('us_waitlist_title', lang)}</h1>
      <p style={{
        color: C.ink2, lineHeight: 1.55, margin: '0 0 1.75rem',
        fontSize: '1rem',
      }}>
        {t('us_waitlist_subtitle', lang, { stateName: stateName(state) })}
      </p>

      <div style={{ display: 'grid', gap: '1.1rem' }}>
        <div>
          <label htmlFor="wl-name" style={labelStyle}>{t('us_waitlist_name_label', lang)}</label>
          <input id="wl-name" type="text" required autoComplete="name"
            value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label htmlFor="wl-email" style={labelStyle}>{t('us_intake_email_label', lang)}</label>
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
        {submitting ? t('us_sending', lang) : t('us_waitlist_send', lang)}
      </button>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────
// Screen 3 — Confirmation
// ─────────────────────────────────────────────────────────────────
function Confirmation({ isWaitlist }) {
  const lang = usePatientLang()
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
        {isWaitlist ? t('us_done_title_waitlist', lang) : t('us_done_title_intake', lang)}
      </h1>
      <p style={{
        color: C.ink2, lineHeight: 1.6, margin: '0 auto 2rem',
        fontSize: '1rem', maxWidth: 440,
      }}>
        {isWaitlist ? t('us_done_body_waitlist', lang) : t('us_done_body_intake', lang)}
      </p>
      <a href="/" style={{
        display: 'inline-block',
        background: 'transparent', color: C.tealDeep,
        textDecoration: 'none', border: `1.5px solid ${C.line}`,
        padding: '.75rem 1.5rem', borderRadius: 99,
        fontWeight: 600, fontSize: '.95rem',
      }}>{t('us_done_back_home', lang)}</a>
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
  const [hipaa, setHipaa] = useState(null)   // { version, at } once acknowledged
  // First step is the language picker — same posture as NZ TereIntro.
  // Skip it if a language is already stashed in this session (e.g. user
  // came back from a previous step via the browser back button).
  const [step, setStep]   = useState(() => {
    const hasLang = (() => { try { return !!sessionStorage.getItem('patient_language') } catch { return false } })()
    if (!hasLang) return 'language'
    if (!initialState) return 'location'
    return licensed.has(initialState) ? 'hipaa' : 'unlicensed'
  })

  function onLocationContinue({ state: chosen }) {
    setState(chosen)
    setStep(licensed.has(chosen) ? 'hipaa' : 'unlicensed')
  }

  function onHipaaAccept(ack) {
    setHipaa(ack)
    setStep('licensed')
  }

  function onLanguageContinue() {
    if (!initialState) setStep('location')
    else setStep(licensed.has(initialState) ? 'hipaa' : 'unlicensed')
  }

  return (
    <Shell>
      {step === 'language'   && <LanguageLanding onContinue={onLanguageContinue} />}
      {step === 'location'   && <LocationGate   onContinue={onLocationContinue} onBack={() => setStep('language')} />}
      {step === 'hipaa'      && <HipaaGate      state={state} onAccept={onHipaaAccept} onBack={() => setStep(initialState ? 'language' : 'location')} />}
      {step === 'licensed'   && <IntakeForm     state={state} hipaa={hipaa} onBack={() => setStep('hipaa')} />}
      {step === 'unlicensed' && <WaitlistForm   state={state} onSubmitted={() => setStep('done')} onBack={() => setStep(initialState ? 'language' : 'location')} />}
      {step === 'done'       && <Confirmation isWaitlist={!licensed.has(state)} />}
    </Shell>
  )
}
