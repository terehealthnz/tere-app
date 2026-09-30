import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { createConsultation } from '../../lib/supabase'
import { useAutoT } from '../../lib/i18n'
import DobPicker from '../../components/DobPicker'
import { isClinicOpen } from '../../lib/clinicHours'

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
  const [address, setAddress] = useState('')
  const [nhi, setNhi] = useState('')
  const [chief, setChief] = useState('')
  // Region-level RHCNZ id (mmi / pr-cbg / arg / ...). Required — same 8
  // options as AITriage's imaging_clinic step, plus an explicit "not sure"
  // value so the worker has to actively acknowledge the choice. Empty
  // string means "not yet picked" and blocks submit.
  const [imagingRegion, setImagingRegion] = useState('')
  // Pharmacy pick from the Medsafe register (same source as AITriage's
  // pharmacy_picker step). Required — provider needs a delivery target for
  // any prescription. Object { id, premises_name, town } once picked.
  const [selectedPharmacy, setSelectedPharmacy] = useState(null)
  const [pharmacyQuery, setPharmacyQuery] = useState('')
  const [pharmacyResults, setPharmacyResults] = useState([])
  const [pharmacyIndex, setPharmacyIndex] = useState(null)
  const [consent, setConsent] = useState(false)

  // Roster pre-fill status. Fires once name+DOB is complete — hits
  // /api/employer-lookup POST, and if the worker is on the CSV roster,
  // fills the empty phone/email/address/nhi fields from the row the
  // employer uploaded. The fields stay editable so the worker can fix
  // stale HR data before submit.
  const [prefillState, setPrefillState] = useState('idle')  // idle | checking | matched | nomatch
  const [prefillDone, setPrefillDone] = useState(false)     // suppress overwrite once we've prefilled once

  const t = useAutoT({
    teamSuffix: 'team',
    checkingAccess: 'Checking access…',
    accessUnavailable: 'Access unavailable',
    linkNotActive: 'This access link is not active.',
    couldNotVerify: 'Could not verify access.',
    couldNotVerifyDetails: 'Could not verify your details. Please try again.',
    genericError: 'Something went wrong. Please try again.',
    goToTere: 'Go to Tere Health',
    yourDetails: 'Your details',
    detailsHelp: 'Name and date of birth verify you are on the {company} team list. Your consult is covered.',
    firstName: 'First name',
    lastName: 'Last name',
    dob: 'Date of birth',
    checkingTeamList: 'Checking the team list…',
    matched: '✓ Found on the {company} team list. Some details below have been pre-filled from your HR record — check they\'re right and edit anything that\'s changed.',
    phoneLabel: 'Phone (for provider callback)',
    phonePlaceholder: '02x xxx xxxx',
    emailLabel: 'Email (for consult summary)',
    emailPlaceholder: 'you@example.com',
    addressLabel: 'Home address (optional)',
    addressPlaceholder: 'Street, suburb, town',
    nhiLabel: 'NHI (optional — we can look it up if you don\'t know it)',
    problemLabel: 'What is the problem?',
    problemPlaceholder: 'Briefly describe what happened or how you are feeling. The doctor will ask more when they call.',
    consentText: 'I consent to a telehealth consultation with a Tere Health clinician. I understand my consult will be shared with {company} only if I later authorise it in writing.',
    joining: 'Joining queue…',
    joinQueue: 'Join the doctor queue',
    emergency111: 'Emergency? Call 111 immediately.',
    couldNotVerifyDialog: 'We could not verify your details',
    contactAdmin: 'Please contact your work administrator at {company} to add you to the team list.',
    urgentFallback: 'If you need to see a doctor now, use the main Tere Health page.',
    mainPageBtn: 'Go to Tere Health main page',
    closeCheckBtn: 'Close and check my details',
  })

  // Fire the roster pre-check as soon as name + DOB are all present.
  // Debounced 400ms so we don't spam while the DOB picker is being adjusted.
  // Result populates the contact fields BEFORE the worker has to type them.
  useEffect(() => {
    if (!employer || !slug) return
    const fn = firstName.trim()
    const ln = lastName.trim()
    if (fn.length < 2 || ln.length < 2 || !dob) {
      setPrefillState('idle')
      return
    }
    const timer = setTimeout(async () => {
      setPrefillState('checking')
      try {
        const r = await apiFetch('/api/employer-lookup', {
          method: 'POST',
          body: JSON.stringify({ slug, firstName: fn, lastName: ln, dob }),
        })
        if (!r.ok) { setPrefillState('idle'); return }
        const body = await r.json()
        if (!body.matched) { setPrefillState('nomatch'); return }
        setPrefillState('matched')
        // Only fill empty fields — never clobber what the worker has typed.
        // prefillDone gate makes changing DOB after a match not re-fire fills.
        if (!prefillDone && body.prefill) {
          if (!phone   && body.prefill.phone)   setPhone(body.prefill.phone)
          if (!email   && body.prefill.email)   setEmail(body.prefill.email)
          if (!address && body.prefill.address) setAddress(body.prefill.address)
          if (!nhi     && body.prefill.nhi)     setNhi(body.prefill.nhi)
          setPrefillDone(true)
        }
      } catch {
        setPrefillState('idle')
      }
    }, 400)
    return () => clearTimeout(timer)
  // Only re-run on identity changes — prefill values are read from state at
  // call time so React doesn't need them in the dep list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstName, lastName, dob, employer?.id, slug])

  // Re-validate slug on mount so a bookmark to /work/xxx/intake can't
  // bypass the /work/[slug] landing check.
  useEffect(() => {
    let cancelled = false
    async function validate() {
      try {
        const r = await apiFetch(`/api/employer-lookup?slug=${encodeURIComponent(slug || '')}`)
        if (cancelled) return
        if (!r.ok) { setPhase('error'); setErrorMsg(t.linkNotActive); return }
        const body = await r.json()
        setEmployer(body.employer)
        setPhase('ready')
      } catch {
        if (!cancelled) { setPhase('error'); setErrorMsg(t.couldNotVerify) }
      }
    }
    validate()
    return () => { cancelled = true }
  }, [slug])

  const formValid = firstName.trim() && lastName.trim() && dob && chief.trim().length >= 5 && (phone.trim() || email.trim()) && !!imagingRegion && !!selectedPharmacy && consent

  // Lazy-load the Medsafe pharmacy register. Same file + shape as AITriage
  // uses so provider-side lookup is identical whichever intake fed the row.
  useEffect(() => {
    if (pharmacyIndex !== null) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/pharmacies.json?v=${Date.now()}`)
        const list = r.ok ? await r.json() : []
        if (!cancelled) setPharmacyIndex(Array.isArray(list) ? list : [])
      } catch { if (!cancelled) setPharmacyIndex([]) }
    })()
    return () => { cancelled = true }
  }, [pharmacyIndex])

  // Simple substring search over the register. Name matches rank above
  // town/address matches. Capped at 8 rows so the dropdown fits on screen.
  useEffect(() => {
    const q = pharmacyQuery.trim().toLowerCase()
    if (q.length < 2 || !pharmacyIndex) { setPharmacyResults([]); return }
    const nameHits = []
    const otherHits = []
    for (const p of pharmacyIndex) {
      const name = (p.premises_name || '').toLowerCase()
      const addr = (p.address || '').toLowerCase()
      const town = (p.town || '').toLowerCase()
      if (name.includes(q)) nameHits.push(p)
      else if (addr.includes(q) || town.includes(q)) otherHits.push(p)
      if (nameHits.length + otherHits.length >= 40) break
    }
    setPharmacyResults([...nameHits, ...otherHits].slice(0, 8))
  }, [pharmacyQuery, pharmacyIndex])

  async function submit() {
    if (!formValid || !employer) return
    setPhase('submitting')
    setErrorMsg('')

    // Client-side pre-check against the employer's roster BEFORE creating a
    // consultation row. If the name+DOB isn't on the roster we surface the
    // blocked modal here — no consult row created, no downstream cleanup.
    // The server still re-checks inside /api/create-consultation as the
    // authoritative gate (defence in depth), but the pre-check gives clean
    // UX and avoids racing against serverless cold-start staleness.
    try {
      const preCheck = await apiFetch('/api/employer-lookup', {
        method: 'POST',
        body: JSON.stringify({
          slug,
          firstName: firstName.trim(),
          lastName:  lastName.trim(),
          dob,
        }),
      })
      if (!preCheck.ok) {
        setPhase('ready')
        const err = await preCheck.json().catch(() => ({}))
        setErrorMsg(err.error || t.couldNotVerifyDetails)
        return
      }
      const preBody = await preCheck.json()
      if (!preBody.matched) {
        setPhase('blocked')
        return
      }
    } catch {
      setPhase('ready')
      setErrorMsg(t.couldNotVerifyDetails)
      return
    }

    // Clear any prior consult from sessionStorage so we don't accidentally
    // resume a paying-patient consult under an employer wrapper.
    sessionStorage.removeItem('consultation_id')
    sessionStorage.removeItem('consultationId')
    sessionStorage.removeItem('paymentIntentId')

    // Stash employer context for downstream screens (waiting room, provider
    // chart) so they can display "covered by [company]". Only set AFTER the
    // roster pre-check has passed — never speculatively.
    sessionStorage.setItem('employer_id', employer.id)
    sessionStorage.setItem('employer_name', employer.company_name)
    sessionStorage.setItem('employer_paid', 'true')
    // Bypass the waitlist gate for verified employer-paid workers. The whole
    // point of B2B is a paid direct-access rail — worker mustn't get bounced
    // to /waitlist mid-consult when provider clicks "Start call" and the
    // patient client navigates through a waitlist-gated route.
    sessionStorage.setItem('tere_beta_bypass', '1')

    // After-hours flag parity with the paying-patient flow (AITriage sets
    // these on finalise). WaitingRoom reads sessionStorage.after_hours and
    // swaps the 2-hour callback banner for a "back at 8am" one — without
    // this flag employees submitting after 8pm see "doctor within 2 hours"
    // even though the clinic is closed until morning.
    if (!isClinicOpen()) {
      sessionStorage.setItem('after_hours', 'true')
      sessionStorage.setItem('consultation_subtype', 'after_hours')
    } else {
      sessionStorage.removeItem('after_hours')
      sessionStorage.setItem('consultation_subtype', 'live')
    }

    try {
      const pt = await createConsultation({
        // Identity — used server-side for roster match against employer_employees
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        dob:       dob,
        phone:     phone.trim() || null,
        email:     email.trim() || null,
        address:   address.trim() || null,
        nhi:       nhi.trim().toUpperCase().replace(/\s+/g, '') || null,
        complaint: chief.trim(),
        preferredImagingRegionId: imagingRegion === 'not_sure' ? null : (imagingRegion || null),
        pharmacyId: selectedPharmacy?.id || null,
        patientLanguage: sessionStorage.getItem('patient_language') || 'en',

        // Fee tier — employer covers the worker, no charge. ProviderNotes reads
        // consultation_type and prices $0 for employee tier.
        consultationType: 'employee',

        // Consent — HDC Right 7 (informed consent)
        recordingConsent: consent,
        hdcRightsAccepted: consent,

        // Employer context — server verifies + roster-matches
        employerId: employer.id,
        workIntake: true,  // triggers roster check + ACC auto-populate server-side

        // Employer flow: intake → vitals → waiting room. We used to create as
        // status='waiting' here so the queue picked them up, but that surfaced
        // employees in the provider queue as ready-to-be-seen while they were
        // still on /vitals. Now we create as 'vitals_requested' — visible in
        // the queue (so providers can watch the pipeline) but the queue label
        // signals "not ready yet". WaitingRoom.jsx promotes to 'waiting' on
        // mount, once the patient has actually landed post-vitals.
        status: 'vitals_requested',
      })
      if (pt?.id) {
        // Both keys — VitalsCapture + several other pages read `consultationId`
        // (camelCase), while createConsultation writes `consultation_id`
        // (snake_case). Set both so downstream flows all resolve the id.
        sessionStorage.setItem('consultation_id', pt.id)
        sessionStorage.setItem('consultationId',  pt.id)
      }
      // Route through vitals capture like paying patients — provider needs
      // HR/SpO2/RR/BP for triage regardless of who's paying. The vitals page
      // already flows into the waiting room after capture (or Skip).
      navigate(`/vitals/${pt.id}`)
    } catch (e) {
      const msg = e?.message || ''
      // Server returns 403 with NO_ROSTER_MATCH in the error body if identity
      // doesn't match the employer's authorised roster. Show a soft
      // fallback card with a path back to the paying-patient flow.
      if (msg.includes('NO_ROSTER_MATCH') || msg.toLowerCase().includes('verify you as a team member')) {
        setPhase('blocked')
      } else {
        setPhase('ready')
        setErrorMsg(msg || t.genericError)
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
            {employer.company_name} {t.teamSuffix}
          </div>
        )}

        {phase === 'checking' && (
          <div style={{ color: TEAL_LIGHT, textAlign: 'center', opacity: .7 }}>{t.checkingAccess}</div>
        )}

        {phase === 'error' && (
          <div style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: '2rem 1.5rem', textAlign: 'center' }}>
            <div style={{ color: 'white', fontWeight: 700, marginBottom: 8 }}>{t.accessUnavailable}</div>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: '.9rem', marginBottom: '1.5rem' }}>{errorMsg}</div>
            <button onClick={() => navigate('/')} style={{ background: TEAL, color: 'white', border: 'none', padding: '.75rem 1.5rem', borderRadius: 99, fontWeight: 700, cursor: 'pointer', fontFamily: FF }}>{t.goToTere}</button>
          </div>
        )}

        {(phase === 'ready' || phase === 'submitting' || phase === 'blocked') && employer && (
          <div style={{ background: 'rgba(11,110,118,.15)', border: '1px solid rgba(11,110,118,.4)', borderRadius: 16, padding: '1.75rem 1.5rem' }}>
            <div style={{ color: 'white', fontWeight: 700, fontSize: '1.1rem', marginBottom: 4 }}>{t.yourDetails}</div>
            <div style={{ color: 'rgba(212,238,240,.7)', fontSize: '.8125rem', marginBottom: '1.25rem' }}>
              {t.detailsHelp.replace('{company}', employer.company_name)}
            </div>

            <label style={label}>{t.firstName}</label>
            <input style={inp} value={firstName} onChange={e => setFirstName(e.target.value)} autoComplete="given-name" />

            <label style={label}>{t.lastName}</label>
            <input style={inp} value={lastName} onChange={e => setLastName(e.target.value)} autoComplete="family-name" />

            <label style={label}>{t.dob}</label>
            <div style={{ marginBottom: '.75rem' }}>
              <DobPicker value={dob} onChange={setDob} />
            </div>

            {prefillState === 'checking' && (
              <div style={{ color: 'rgba(212,238,240,.65)', fontSize: '.75rem', marginBottom: '.75rem', fontStyle: 'italic' }}>
                {t.checkingTeamList}
              </div>
            )}
            {prefillState === 'matched' && (
              <div style={{ background: 'rgba(11,110,118,.35)', border: '1px solid rgba(127,196,200,.4)', color: TEAL_LIGHT, padding: '.6rem .8rem', borderRadius: 8, fontSize: '.8125rem', marginBottom: '.75rem' }}>
                {t.matched.replace('{company}', employer.company_name)}
              </div>
            )}

            <label style={label}>{t.phoneLabel}</label>
            <input style={inp} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder={t.phonePlaceholder} autoComplete="tel" />

            <label style={label}>{t.emailLabel}</label>
            <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t.emailPlaceholder} autoComplete="email" />

            <label style={label}>{t.addressLabel}</label>
            <input style={inp} type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder={t.addressPlaceholder} autoComplete="street-address" />

            <label style={label}>{t.nhiLabel}</label>
            <input style={inp} type="text" value={nhi} onChange={e => setNhi(e.target.value.toUpperCase())} placeholder="ABC1234" maxLength={7} autoComplete="off" />

            <label style={label}>{t.problemLabel}</label>
            <textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={chief} onChange={e => setChief(e.target.value)} placeholder={t.problemPlaceholder} />

            {/* Required imaging region — mirrors AITriage's imaging_clinic
                step so the provider isn't left guessing from address on
                work-injury X-ray/US referrals. First option is a disabled
                placeholder so the field reads as "not yet picked" rather
                than a pre-filled answer; "Not sure" is a real value the
                worker has to actively choose. */}
            <label style={label}>If you need an X-ray or ultrasound, which region?</label>
            <select style={{ ...inp, cursor: 'pointer' }} value={imagingRegion} onChange={e => setImagingRegion(e.target.value)}>
              {/* Option colour forced to dark navy on white — the parent
                  select style is color:white for the navy card, but the
                  OS-rendered dropdown list uses a white background, so
                  white-on-white made the choices invisible. */}
              <option value="" disabled style={{ color:'#0D2B45', background:'white' }}>Select a region…</option>
              <option value="arg" style={{ color:'#0D2B45', background:'white' }}>Auckland / Northland</option>
              <option value="bay" style={{ color:'#0D2B45', background:'white' }}>Bay of Plenty</option>
              <option value="pr-waikato" style={{ color:'#0D2B45', background:'white' }}>Waikato</option>
              <option value="pr-wgtn" style={{ color:'#0D2B45', background:'white' }}>Wellington / Manawatū</option>
              <option value="pr-nelson" style={{ color:'#0D2B45', background:'white' }}>Nelson / Tasman</option>
              <option value="mmi" style={{ color:'#0D2B45', background:'white' }}>Marlborough (Blenheim)</option>
              <option value="pr-cbg" style={{ color:'#0D2B45', background:'white' }}>Canterbury (Christchurch)</option>
              <option value="pr-otago" style={{ color:'#0D2B45', background:'white' }}>Otago / Southland</option>
              <option value="not_sure" style={{ color:'#0D2B45', background:'white' }}>Not sure — my doctor can pick</option>
            </select>

            {/* Required pharmacy — worker must pick one from the Medsafe
                register so the provider has a delivery target for any
                prescription. Same file + shape as AITriage's picker so
                provider-side reads are identical. */}
            <label style={label}>Which pharmacy should we send any prescription to?</label>
            {selectedPharmacy ? (
              <div style={{ background: 'rgba(11,110,118,.35)', border: '1px solid rgba(127,196,200,.4)', borderRadius: 8, padding: '.6rem .8rem', marginBottom: '.75rem', display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'white', fontSize: '.875rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedPharmacy.premises_name}</div>
                  {selectedPharmacy.town && <div style={{ color: 'rgba(212,238,240,.7)', fontSize: '.75rem' }}>{selectedPharmacy.town}</div>}
                </div>
                <button type="button" onClick={() => { setSelectedPharmacy(null); setPharmacyQuery('') }}
                  style={{ background: 'transparent', border: '1px solid rgba(212,238,240,.35)', color: TEAL_LIGHT, padding: '.35rem .7rem', borderRadius: 6, fontSize: '.75rem', fontFamily: FF, cursor: 'pointer' }}>
                  Change
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative', marginBottom: '.75rem' }}>
                <input style={{ ...inp, marginBottom: 0 }} type="text" value={pharmacyQuery}
                  onChange={e => setPharmacyQuery(e.target.value)}
                  placeholder="Type a pharmacy name or town…" autoComplete="off" />
                {pharmacyResults.length > 0 && (
                  <div style={{ background: NAVY, border: '1px solid rgba(212,238,240,.2)', borderRadius: 8, marginTop: 6, maxHeight: 240, overflowY: 'auto' }}>
                    {pharmacyResults.map(p => (
                      <button key={p.id} type="button"
                        onClick={() => { setSelectedPharmacy(p); setPharmacyQuery(''); setPharmacyResults([]) }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(212,238,240,.08)', padding: '.6rem .8rem', color: 'white', fontSize: '.8125rem', fontFamily: FF, cursor: 'pointer' }}>
                        <div style={{ fontWeight: 700 }}>{p.premises_name}</div>
                        {(p.town || p.address) && (
                          <div style={{ color: 'rgba(212,238,240,.6)', fontSize: '.6875rem', marginTop: 2 }}>{p.town || p.address}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {pharmacyQuery.trim().length >= 2 && pharmacyResults.length === 0 && pharmacyIndex && (
                  <div style={{ color: 'rgba(212,238,240,.55)', fontSize: '.75rem', marginTop: 6, fontStyle: 'italic' }}>No matches — try a different name or town.</div>
                )}
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: '.5rem', marginBottom: '1.25rem', cursor: 'pointer', color: 'rgba(255,255,255,.85)', fontSize: '.8125rem', lineHeight: 1.5 }}>
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 3, flexShrink: 0, cursor: 'pointer', accentColor: TEAL, transform: 'scale(1.1)' }} />
              <span>{t.consentText.replace('{company}', employer.company_name)}</span>
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
              {phase === 'submitting' ? t.joining : t.joinQueue}
            </button>

            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: '.7rem', marginTop: '1rem', textAlign: 'center' }}>
              {t.emergency111}
            </div>
          </div>
        )}
      </div>

      {/* Roster-mismatch modal. Renders as an overlay on top of the intake
          form so the worker's typed values are preserved — if the mismatch
          was a typo (wrong DOB, misspelt name), they can dismiss and fix
          without re-entering everything. Copy directs them to their work
          administrator (the actual owner of the roster) and to the public
          Tere Health flow as a fallback for urgent care. */}
      {phase === 'blocked' && employer && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPhase('ready')}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(13,43,69,.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.25rem', zIndex: 200, backdropFilter: 'blur(4px)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#122E4A', border: '1px solid rgba(255,193,7,.4)',
              borderRadius: 16, padding: '1.75rem 1.5rem',
              maxWidth: 420, width: '100%', textAlign: 'center',
              boxShadow: '0 20px 60px rgba(0,0,0,.5)',
            }}
          >
            <div style={{ fontSize: '2.25rem', marginBottom: 10 }}>🔍</div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: '1.15rem', marginBottom: 10 }}>
              {t.couldNotVerifyDialog}
            </div>
            <div style={{ color: 'rgba(255,255,255,.8)', fontSize: '.9rem', lineHeight: 1.65, marginBottom: '1.5rem' }}>
              {t.contactAdmin.replace('{company}', employer.company_name)}
              <br /><br />
              {t.urgentFallback}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => navigate('/')}
                style={{ background: TEAL, color: 'white', border: 'none', padding: '.85rem 1rem', borderRadius: 12, fontWeight: 700, fontSize: '.95rem', cursor: 'pointer', fontFamily: FF }}
              >
                {t.mainPageBtn}
              </button>
              <button
                onClick={() => setPhase('ready')}
                style={{ background: 'none', color: TEAL_LIGHT, border: '1px solid rgba(212,238,240,.3)', padding: '.7rem 1rem', borderRadius: 12, fontWeight: 600, fontSize: '.875rem', cursor: 'pointer', fontFamily: FF }}
              >
                {t.closeCheckBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
