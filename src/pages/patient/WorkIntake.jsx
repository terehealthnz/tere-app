import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { createConsultation } from '../../lib/supabase'
import DobPicker from '../../components/patient/DobPicker'

// /work/[slug]/intake — streamlined B2B intake form.
//
// Design: name + DOB + phone/email + chief complaint. That's it. No AI
// triage chat, no vitals capture, no consultation-type picker, no
// payment. Consult goes straight from Submit → provider queue with:
//   - employer_paid=true (verified server-side)
//   - acc_employer / acc_employer_address / acc_employer_phone auto-populated
//   - is_work_injury=true default
//   - status=waiting
//
// Two-factor safeguard:
//   Factor 1: valid slug URL (checked at /work/[slug] before landing here)
//   Factor 2: identity match against employer_employees roster (checked
//             server-side on create-consultation via __work_intake marker)
//
// Roster mismatch shows a soft fallback card with a button back to the
// public paying-patient flow — friendlier than a hard block, protects
// legitimate workers whose HR forgot to add them to the roster.

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const TEAL_LIGHT = '#D4EEF0'
const FF = 'Plus Jakarta Sans, sans-serif'
const SERIF = 'Cormorant Garamond, Georgia, serif'

export default function WorkIntake() {
  const { slug } = useParams()
  const navigate = useNavigate()

  const [phase, setPhase] = useState('checking')  // checking | ready | submitting | blocked | error
  const [employer, setEmployer] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dob, setDob] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [chief, setChief] = useState('')
  const [consent, setConsent] = useState(false)

  // Re-validate slug on mount so a bookmark to /work/xxx/intake can't
  // bypass the /work/[slug] landing check.
  useEffect(() => {
    let cancelled = false
    async function validate() {
      try {
        const r = await apiFetch(`/api/employer-lookup?slug=${encodeURIComponent(slug || '')}`)
        if (cancelled) return
        if (!r.ok) { setPhase('error'); setErrorMsg('This access link is not active.'); return }
        const body = await r.json()
        setEmployer(body.employer)
        setPhase('ready')
      } catch {
        if (!cancelled) { setPhase('error'); setErrorMsg('Could not verify access.') }
      }
    }
    validate()
    return () => { cancelled = true }
  }, [slug])

  const formValid = firstName.trim() && lastName.trim() && dob && chief.trim().length >= 5 && (phone.trim() || email.trim()) && consent

  async function submit() {
    if (!formValid || !employer) return
    setPhase('submitting')
    setErrorMsg('')

    // Clear any prior consult from sessionStorage so we don't accidentally
    // resume a paying-patient consult under an employer wrapper.
    sessionStorage.removeItem('consultation_id')
    sessionStorage.removeItem('consultationId')
    sessionStorage.removeItem('paymentIntentId')

    // Stash employer context for downstream screens (waiting room, provider
    // chart) so they can display "covered by [company]".
    sessionStorage.setItem('employer_id', employer.id)
    sessionStorage.setItem('employer_name', employer.company_name)
    sessionStorage.setItem('employer_paid', 'true')

    try {
      const pt = await createConsultation({
        // Identity — used server-side for roster match against employer_employees
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        dob:       dob,
        phone:     phone.trim() || null,
        email:     email.trim() || null,
        complaint: chief.trim(),
        patientLanguage: sessionStorage.getItem('patient_language') || 'en',

        // Consent — HDC Right 7 (informed consent)
        recordingConsent: consent,
        hdcRightsAccepted: consent,

        // Employer context — server verifies + roster-matches
        employerId: employer.id,
        workIntake: true,  // triggers roster check + ACC auto-populate server-side

        // Skip payment gate — server sets status=waiting when employer_paid=true
        status: 'waiting',
      })
      if (pt?.id) sessionStorage.setItem('consultation_id', pt.id)
      navigate(`/waiting/${pt.id}`)
    } catch (e) {
      const msg = e?.message || ''
      // Server returns 403 with NO_ROSTER_MATCH in the error body if identity
      // doesn't match the employer's authorised roster. Show a soft
      // fallback card with a path back to the paying-patient flow.
      if (msg.includes('NO_ROSTER_MATCH') || msg.toLowerCase().includes('verify you as a team member')) {
        setPhase('blocked')
      } else {
        setPhase('ready')
        setErrorMsg(msg || 'Something went wrong. Please try again.')
      }
    }
  }

  const inp = {
    width: '100%', padding: '.75rem .875rem',
    background: 'rgba(255,255,255,.08)', border: '1.5px solid rgba(255,255,255,.15)',
    borderRadius: 8, color: 'white', fontSize: '.95rem', fontFamily: FF, outline: 'none',
    marginBottom: '.75rem', boxSizing: 'border-box',
  }
  const label = { fontSize: '.75rem', color: 'rgba(212,238,240,.75)', fontWeight: 600, marginBottom: 4, display: 'block', fontFamily: FF }

  return (
    <main style={{
      background: NAVY, minHeight: '100dvh',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '2rem 1.5rem', fontFamily: FF,
    }}>
      <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: TEAL, opacity: .06, top: -80, right: -80 }} />
      <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: TEAL, opacity: .06, bottom: -60, left: -60 }} />

      <div style={{ position: 'relative', maxWidth: 460, width: '100%', marginTop: '2rem' }}>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: '2rem', color: TEAL_LIGHT, textAlign: 'center', marginBottom: 4 }}>Tere Health</div>
        {employer && (
          <div style={{ fontSize: '.75rem', color: 'rgba(212,238,240,.7)', letterSpacing: '.1em', textTransform: 'uppercase', textAlign: 'center', marginBottom: '2rem' }}>
            {employer.company_name} team
          </div>
        )}

        {phase === 'checking' && (
          <div style={{ color: TEAL_LIGHT, textAlign: 'center', opacity: .7 }}>Checking access…</div>
        )}

        {phase === 'error' && (
          <div style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: '2rem 1.5rem', textAlign: 'center' }}>
            <div style={{ color: 'white', fontWeight: 700, marginBottom: 8 }}>Access unavailable</div>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: '.9rem', marginBottom: '1.5rem' }}>{errorMsg}</div>
            <button onClick={() => navigate('/')} style={{ background: TEAL, color: 'white', border: 'none', padding: '.75rem 1.5rem', borderRadius: 99, fontWeight: 700, cursor: 'pointer', fontFamily: FF }}>Go to Tere Health</button>
          </div>
        )}

        {phase === 'blocked' && (
          <div style={{ background: 'rgba(255,193,7,.08)', border: '1px solid rgba(255,193,7,.3)', borderRadius: 16, padding: '2rem 1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔍</div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>We could not verify your details</div>
            <div style={{ color: 'rgba(255,255,255,.75)', fontSize: '.9rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              Your name and date of birth do not match {employer?.company_name || 'the employer'}'s team list. Please check with your HR if you should be added, or continue as a paying patient.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setPhase('ready')} style={{ background: 'none', color: TEAL_LIGHT, border: '1px solid rgba(212,238,240,.3)', padding: '.7rem 1.25rem', borderRadius: 99, fontWeight: 600, cursor: 'pointer', fontFamily: FF }}>Try again</button>
              <button onClick={() => navigate('/')} style={{ background: TEAL, color: 'white', border: 'none', padding: '.7rem 1.25rem', borderRadius: 99, fontWeight: 700, cursor: 'pointer', fontFamily: FF }}>Continue as paying patient</button>
            </div>
          </div>
        )}

        {(phase === 'ready' || phase === 'submitting') && employer && (
          <div style={{ background: 'rgba(11,110,118,.15)', border: '1px solid rgba(11,110,118,.4)', borderRadius: 16, padding: '1.75rem 1.5rem' }}>
            <div style={{ color: 'white', fontWeight: 700, fontSize: '1.1rem', marginBottom: 4 }}>Your details</div>
            <div style={{ color: 'rgba(212,238,240,.7)', fontSize: '.8125rem', marginBottom: '1.25rem' }}>
              Name and date of birth verify you are on the {employer.company_name} team list. Your consult is covered.
            </div>

            <label style={label}>First name</label>
            <input style={inp} value={firstName} onChange={e => setFirstName(e.target.value)} autoComplete="given-name" />

            <label style={label}>Last name</label>
            <input style={inp} value={lastName} onChange={e => setLastName(e.target.value)} autoComplete="family-name" />

            <label style={label}>Date of birth</label>
            <div style={{ marginBottom: '.75rem' }}>
              <DobPicker value={dob} onChange={setDob} />
            </div>

            <label style={label}>Phone (for provider callback)</label>
            <input style={inp} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="02x xxx xxxx" autoComplete="tel" />

            <label style={label}>Email (for consult summary)</label>
            <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />

            <label style={label}>What is the problem?</label>
            <textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={chief} onChange={e => setChief(e.target.value)} placeholder="Briefly describe what happened or how you are feeling. The doctor will ask more when they call." />

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: '.5rem', marginBottom: '1.25rem', cursor: 'pointer', color: 'rgba(255,255,255,.85)', fontSize: '.8125rem', lineHeight: 1.5 }}>
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 3, flexShrink: 0, cursor: 'pointer', accentColor: TEAL, transform: 'scale(1.1)' }} />
              <span>I consent to a telehealth consultation with a Tere Health clinician. I understand my consult will be shared with {employer.company_name} only if I later authorise it in writing.</span>
            </label>

            {errorMsg && (
              <div style={{ background: 'rgba(220,38,38,.15)', border: '1px solid rgba(220,38,38,.3)', color: '#FCA5A5', padding: '.6rem .8rem', borderRadius: 8, fontSize: '.8125rem', marginBottom: '.75rem' }}>{errorMsg}</div>
            )}

            <button onClick={submit} disabled={!formValid || phase === 'submitting'} style={{
              width: '100%',
              background: formValid ? '#F97316' : 'rgba(255,255,255,.15)',
              color: 'white', border: 'none', padding: '1rem', borderRadius: 12,
              fontWeight: 700, fontSize: '1rem',
              cursor: formValid && phase !== 'submitting' ? 'pointer' : 'not-allowed',
              fontFamily: FF,
              boxShadow: formValid ? '0 4px 20px rgba(249,115,22,.35)' : 'none',
              opacity: phase === 'submitting' ? .7 : 1,
            }}>
              {phase === 'submitting' ? 'Joining queue…' : 'Join the doctor queue'}
            </button>

            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: '.7rem', marginTop: '1rem', textAlign: 'center' }}>
              Emergency? Call 111 immediately.
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
