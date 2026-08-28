// /onboarding/setup/:token — new hire fills their onboarding intake.
//
// Four short sections, saved independently:
//   1. Personal + emergency contact
//   2. Payroll (IRD, KiwiSaver, bank) — encrypted at rest server-side
//   3. Clinical credentials (MCNZ, APC PDF, HPI-CPN, prescriber #)
//   4. Signature (canvas PNG)
//
// The wizard is resumable — GET returns which sections have completed_at
// timestamps and prefills the non-sensitive fields. Section 2 (tax/bank) is
// never prefilled — applicant retains their own record; we don't reveal.

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

const KIWISAVER_OPTIONS = [
  { value: '3',       label: '3% (default)' },
  { value: '4',       label: '4%' },
  { value: '6',       label: '6%' },
  { value: '8',       label: '8%' },
  { value: '10',      label: '10%' },
  { value: 'opt_out', label: "Opt out (I'll file an IR-23BS)" },
]

export default function OnboardingSetup() {
  const { token } = useParams()
  const [state, setState] = useState('loading')  // loading | ready | error | cancelled
  const [errorMsg, setErrorMsg] = useState('')
  const [intake,   setIntake]   = useState(null)
  const [applicant, setApplicant] = useState(null)
  const [step, setStep] = useState(1)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/job-applications?action=onboarding&token=${encodeURIComponent(token)}`)
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (body?.terminal) { setState('cancelled'); return }
        if (!res.ok) {
          setErrorMsg(body.error || 'Could not open this onboarding link.')
          setState('error')
          return
        }
        setIntake(body.intake)
        setApplicant(body.applicant)
        // Jump to the first incomplete section.
        const flags = [
          body.intake?.section_1?.completed_at,
          body.intake?.section_2?.completed_at,
          body.intake?.section_3?.completed_at,
          body.intake?.section_4?.completed_at,
        ]
        const firstIncomplete = flags.findIndex(v => !v)
        setStep(firstIncomplete === -1 ? 4 : firstIncomplete + 1)
        setState('ready')
      } catch (e) {
        if (!cancelled) { setErrorMsg(e.message || 'Network error'); setState('error') }
      }
    })()
    return () => { cancelled = true }
  }, [token])

  async function saveSection(sectionNumber, payload) {
    const res = await fetch('/api/job-applications?action=save_onboarding_section', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, section: sectionNumber, ...payload }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || 'Save failed')
    return body
  }

  async function afterSave(nextStep) {
    // Refetch so completion flags refresh.
    try {
      const res = await fetch(`/api/job-applications?action=onboarding&token=${encodeURIComponent(token)}`)
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        setIntake(body.intake)
        setApplicant(body.applicant)
      }
    } catch { /* ignore */ }
    setStep(nextStep)
  }

  if (state === 'loading') {
    return (
      <div style={S.centered}>
        <div style={S.spinner} />
        <div style={{ color: '#6B7280' }}>Loading your onboarding…</div>
      </div>
    )
  }

  if (state === 'cancelled') {
    return (
      <div style={S.centered}>
        <h1 style={S.h1}>This onboarding link has been cancelled</h1>
        <p style={S.body}>Contact <a href="mailto:hello@terehealth.co.nz" style={{ color: '#0B6E76' }}>hello@terehealth.co.nz</a> if you think this is a mistake.</p>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={S.centered}>
        <h1 style={{ ...S.h1, color: '#991B1B' }}>Link not valid</h1>
        <p style={S.body}>{errorMsg}</p>
      </div>
    )
  }

  const allDone = intake?.status === 'complete' || intake?.status === 'processed'
  const firstName = applicant?.first_name || 'there'

  return (
    <div style={S.pageWrap}>
      <div style={S.card}>
        <div style={S.brandChip}>Tere</div>
        <h1 style={{ ...S.h1, marginTop: 16 }}>Get set up</h1>
        <p style={{ color: '#374151', fontSize: '.95rem', margin: '0 0 20px' }}>
          Kia ora {firstName} — four short sections and we'll get your provider account created.
        </p>

        <Progress step={step} intake={intake} onJump={setStep} />

        {allDone ? (
          <AllDoneCard applicant={applicant} intake={intake} />
        ) : (
          <>
            {step === 1 && <Section1 intake={intake} onSaved={() => afterSave(2)} saveSection={saveSection} />}
            {step === 2 && <Section2 intake={intake} onSaved={() => afterSave(3)} saveSection={saveSection} />}
            {step === 3 && <Section3 intake={intake} onSaved={() => afterSave(4)} saveSection={saveSection} />}
            {step === 4 && <Section4 intake={intake} onSaved={() => afterSave(4)} saveSection={saveSection} />}
          </>
        )}
      </div>
    </div>
  )
}

// ── Progress strip ──────────────────────────────────────────────────────
function Progress({ step, intake, onJump }) {
  const labels = ['Personal', 'Payroll', 'Credentials', 'Signature']
  const done = [
    !!intake?.section_1?.completed_at,
    !!intake?.section_2?.completed_at,
    !!intake?.section_3?.completed_at,
    !!intake?.section_4?.completed_at,
  ]
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
      {labels.map((label, i) => {
        const n = i + 1
        const isActive = n === step
        const isDone = done[i]
        return (
          <button
            key={label}
            onClick={() => onJump(n)}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 8,
              border: isActive ? '1.5px solid #0B6E76' : `1px solid ${isDone ? '#065F46' : '#E2E8F0'}`,
              background: isActive ? '#F0F9FA' : (isDone ? '#F0FDF4' : 'white'),
              color: isActive ? '#0B6E76' : (isDone ? '#065F46' : '#6B7280'),
              fontSize: '.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}>
            {isDone ? '✓ ' : `${n}. `}{label}
          </button>
        )
      })}
    </div>
  )
}

// ── Section 1: Personal ─────────────────────────────────────────────────
function Section1({ intake, onSaved, saveSection }) {
  const [form, setForm] = useState({
    preferred_name:                 intake?.section_1?.preferred_name || '',
    date_of_birth:                  intake?.section_1?.date_of_birth || '',
    home_address:                   intake?.section_1?.home_address || '',
    mobile:                         intake?.section_1?.mobile || '',
    emergency_contact_name:         intake?.section_1?.emergency_contact_name || '',
    emergency_contact_relationship: intake?.section_1?.emergency_contact_relationship || '',
    emergency_contact_phone:        intake?.section_1?.emergency_contact_phone || '',
  })
  const [busy, setBusy]     = useState(false)
  const [errorMsg, setError] = useState('')

  async function save() {
    setBusy(true); setError('')
    try {
      await saveSection(1, { data: form })
      onSaved()
    } catch (e) { setError(e.message || 'Save failed') }
    finally { setBusy(false) }
  }
  const u = k => v => setForm(f => ({ ...f, [k]: v }))
  return (
    <div>
      <SectionHeading>1. Personal &amp; emergency contact</SectionHeading>
      <Field label="Preferred name" required>
        <input value={form.preferred_name} onChange={e => u('preferred_name')(e.target.value)} style={S.input} disabled={busy} />
      </Field>
      <Field label="Date of birth">
        <input type="date" value={form.date_of_birth || ''} onChange={e => u('date_of_birth')(e.target.value)} style={S.input} disabled={busy} />
      </Field>
      <Field label="Home address" required>
        <textarea rows={2} value={form.home_address} onChange={e => u('home_address')(e.target.value)} style={S.textarea} disabled={busy} />
      </Field>
      <Field label="Mobile" required>
        <input value={form.mobile} onChange={e => u('mobile')(e.target.value)} placeholder="+64…" style={S.input} disabled={busy} />
      </Field>
      <div style={{ borderTop: '1px solid #E2E8F0', margin: '20px 0 16px' }} />
      <div style={{ fontSize: '.85rem', color: '#6B7280', marginBottom: 12 }}>In case of emergency:</div>
      <Field label="Emergency contact name" required>
        <input value={form.emergency_contact_name} onChange={e => u('emergency_contact_name')(e.target.value)} style={S.input} disabled={busy} />
      </Field>
      <Field label="Relationship">
        <input value={form.emergency_contact_relationship} onChange={e => u('emergency_contact_relationship')(e.target.value)} placeholder="e.g. Partner" style={S.input} disabled={busy} />
      </Field>
      <Field label="Emergency contact phone" required>
        <input value={form.emergency_contact_phone} onChange={e => u('emergency_contact_phone')(e.target.value)} style={S.input} disabled={busy} />
      </Field>
      <SaveRow errorMsg={errorMsg} busy={busy} onSave={save} nextLabel="Save & continue →" />
    </div>
  )
}

// ── Section 2: Payroll (IRD, bank, KiwiSaver) ──────────────────────────
function Section2({ intake, onSaved, saveSection }) {
  const [form, setForm] = useState({
    ird_number:     '',
    bank_account:   '',
    kiwisaver_rate: intake?.section_2?.kiwisaver_rate || '3',
  })
  const [busy, setBusy]      = useState(false)
  const [errorMsg, setError] = useState('')
  const alreadySaved = !!intake?.section_2?.completed_at

  async function save() {
    setBusy(true); setError('')
    try {
      await saveSection(2, { data: form })
      onSaved()
    } catch (e) { setError(e.message || 'Save failed') }
    finally { setBusy(false) }
  }
  const u = k => v => setForm(f => ({ ...f, [k]: v }))
  return (
    <div>
      <SectionHeading>2. Payroll</SectionHeading>
      <div style={{ background: '#F0F9FA', border: '1px solid #C7EAEC', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: '.82rem', color: '#0D2B45', lineHeight: 1.55 }}>
        <strong>Encrypted at rest.</strong> IRD and bank details are AES-256 encrypted server-side and only visible to the person creating your provider account. We can't display them back to you here — please keep your own record.
      </div>
      {alreadySaved && (
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: '.82rem', color: '#065F46' }}>
          ✓ You've already filled this section. Re-entering here overwrites what we have on file.
        </div>
      )}
      <Field label="IRD number" required>
        <input value={form.ird_number} onChange={e => u('ird_number')(e.target.value.replace(/[^\d-]/g, ''))} placeholder="e.g. 123-456-789" style={S.input} disabled={busy} />
      </Field>
      <Field label="Bank account number" required>
        <input value={form.bank_account} onChange={e => u('bank_account')(e.target.value.replace(/[^\d-]/g, ''))} placeholder="e.g. 06-0123-0123456-00" style={S.input} disabled={busy} />
      </Field>
      <Field label="KiwiSaver contribution" required>
        <select value={form.kiwisaver_rate} onChange={e => u('kiwisaver_rate')(e.target.value)} style={{ ...S.input, background: 'white' }} disabled={busy}>
          {KIWISAVER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
      <SaveRow errorMsg={errorMsg} busy={busy} onSave={save} nextLabel="Save & continue →" />
    </div>
  )
}

// ── Section 3: Clinical credentials ────────────────────────────────────
function Section3({ intake, onSaved, saveSection }) {
  const [form, setForm] = useState({
    mcnz_registration_number: intake?.section_3?.mcnz_registration_number || '',
    apc_expiry_date:          intake?.section_3?.apc_expiry_date || '',
    hpi_cpn:                  intake?.section_3?.hpi_cpn || '',
    prescriber_number:        intake?.section_3?.prescriber_number || '',
    scope_of_practice:        intake?.section_3?.scope_of_practice || '',
  })
  const [apcFile,  setApcFile]  = useState(null)  // File
  const [apcName,  setApcName]  = useState(intake?.section_3?.apc_uploaded ? '(already uploaded)' : '')
  const [busy, setBusy]         = useState(false)
  const [errorMsg, setError]    = useState('')

  async function handleFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.type !== 'application/pdf') { setError('APC must be a PDF file.'); return }
    if (f.size > 4_000_000)           { setError('APC PDF must be under 4 MB.'); return }
    setApcFile(f); setApcName(f.name); setError('')
  }

  async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onerror = reject
      r.onload  = () => resolve(String(r.result))
      r.readAsDataURL(file)
    })
  }

  async function save() {
    setBusy(true); setError('')
    try {
      const payload = { data: form }
      if (apcFile) payload.apcPngBase64 = await fileToDataUrl(apcFile)
      await saveSection(3, payload)
      onSaved()
    } catch (e) { setError(e.message || 'Save failed') }
    finally { setBusy(false) }
  }
  const u = k => v => setForm(f => ({ ...f, [k]: v }))
  return (
    <div>
      <SectionHeading>3. Clinical credentials</SectionHeading>
      <Field label="MCNZ registration number" required>
        <input value={form.mcnz_registration_number} onChange={e => u('mcnz_registration_number')(e.target.value)} placeholder="e.g. 99529" style={S.input} disabled={busy} />
      </Field>
      <Field label="Current APC expiry date" required>
        <input type="date" value={form.apc_expiry_date} onChange={e => u('apc_expiry_date')(e.target.value)} style={S.input} disabled={busy} />
      </Field>
      <Field label={intake?.section_3?.apc_uploaded ? "Replace APC PDF (optional)" : "APC PDF"}>
        <input type="file" accept="application/pdf" onChange={handleFile} disabled={busy} style={{ fontSize: '.9rem' }} />
        {apcName && <div style={{ fontSize: '.8rem', color: '#6B7280', marginTop: 4 }}>{apcName}</div>}
      </Field>
      <Field label="HPI-CPN">
        <input value={form.hpi_cpn} onChange={e => u('hpi_cpn')(e.target.value)} placeholder="e.g. 24NSES" style={S.input} disabled={busy} />
      </Field>
      <Field label="Prescriber number">
        <input value={form.prescriber_number} onChange={e => u('prescriber_number')(e.target.value)} style={S.input} disabled={busy} />
      </Field>
      <Field label="Scope of practice">
        <input value={form.scope_of_practice} onChange={e => u('scope_of_practice')(e.target.value)} placeholder="e.g. General practice, Emergency medicine" style={S.input} disabled={busy} />
      </Field>
      <SaveRow errorMsg={errorMsg} busy={busy} onSave={save} nextLabel="Save & continue →" />
    </div>
  )
}

// ── Section 4: Signature ───────────────────────────────────────────────
function Section4({ intake, onSaved, saveSection }) {
  const canvasRef  = useRef(null)
  const drawingRef = useRef(false)
  const dirtyRef   = useRef(false)
  const [busy, setBusy]      = useState(false)
  const [errorMsg, setError] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1A2A33'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  }, [])

  function pos(e) {
    const c = canvasRef.current
    const r = c.getBoundingClientRect()
    return { x: (e.clientX - r.left) * (c.width / r.width),
             y: (e.clientY - r.top)  * (c.height / r.height) }
  }
  function down(e) {
    if (busy) return
    e.preventDefault()
    const { x, y } = pos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath(); ctx.moveTo(x, y)
    drawingRef.current = true; dirtyRef.current = true
  }
  function move(e) {
    if (!drawingRef.current) return
    e.preventDefault()
    const { x, y } = pos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineTo(x, y); ctx.stroke()
  }
  function up() { drawingRef.current = false }
  function clear() {
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.strokeStyle = '#1A2A33'; ctx.lineWidth = 2.5
    dirtyRef.current = false
  }

  async function save() {
    if (!dirtyRef.current && !intake?.section_4?.signature_uploaded) {
      setError('Please draw your signature.'); return
    }
    setBusy(true); setError('')
    try {
      const png = canvasRef.current.toDataURL('image/png')
      await saveSection(4, { signaturePngBase64: png })
      onSaved()
    } catch (e) { setError(e.message || 'Save failed') }
    finally { setBusy(false) }
  }

  return (
    <div>
      <SectionHeading>4. Signature</SectionHeading>
      <p style={{ color: '#6B7280', fontSize: '.9rem', margin: '0 0 12px' }}>
        Draw your usual signature — used on prescriptions, referrals, and medical certificates.
      </p>
      {intake?.section_4?.signature_uploaded && (
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '.82rem', color: '#065F46' }}>
          ✓ Signature on file. Draw a new one below to replace it.
        </div>
      )}
      <div style={{ border: '2px dashed #E2E8F0', borderRadius: 8, background: 'white', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef} width={600} height={200}
          onPointerDown={down} onPointerMove={move}
          onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
          style={{ display: 'block', width: '100%', height: '180px', cursor: busy ? 'not-allowed' : 'crosshair', touchAction: 'none' }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <div style={{ color: '#9CA3AF', fontSize: '.75rem' }}>Sign above the line</div>
        <button type="button" onClick={clear} disabled={busy}
          style={{ background: 'none', border: 'none', color: '#0B6E76', fontSize: '.8rem', cursor: 'pointer' }}>
          Clear
        </button>
      </div>
      <SaveRow errorMsg={errorMsg} busy={busy} onSave={save} nextLabel="Save signature" />
    </div>
  )
}

function AllDoneCard() {
  return (
    <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
      <div style={{ fontSize: '3rem', marginBottom: 12 }}></div>
      <h2 style={{ fontSize: '1.3rem', color: '#0D2B45', margin: '0 0 12px' }}>All set</h2>
      <p style={{ color: '#374151', fontSize: '.95rem', maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
        We've received everything we need. Someone from Tere will create your provider account and email you your first-login details shortly.
      </p>
      <p style={{ color: '#6B7280', fontSize: '.85rem', maxWidth: 420, margin: '20px auto 0', lineHeight: 1.6 }}>
        You can update any section using this same link if anything changes before your account is created.
      </p>
    </div>
  )
}

// ── Little primitives ─────────────────────────────────────────────────
function SectionHeading({ children }) {
  return <h2 style={{ fontSize: '1.15rem', color: '#0D2B45', margin: '4px 0 20px' }}>{children}</h2>
}
function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: '.78rem', color: '#0D2B45', fontWeight: 700, marginBottom: 6 }}>
        {label}{required && <span style={{ color: '#DC2626' }}> *</span>}
      </label>
      {children}
    </div>
  )
}
function SaveRow({ errorMsg, busy, onSave, nextLabel }) {
  return (
    <div style={{ marginTop: 20 }}>
      {errorMsg && <div style={{ color: '#991B1B', fontSize: '.85rem', marginBottom: 12 }}>{errorMsg}</div>}
      <button
        onClick={onSave} disabled={busy}
        style={{
          background: busy ? '#94A3B8' : '#0B6E76',
          color: 'white', border: 'none',
          padding: '14px 32px', borderRadius: 12,
          fontSize: '1rem', fontWeight: 700,
          cursor: busy ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
        }}>
        {busy ? 'Saving…' : nextLabel}
      </button>
    </div>
  )
}

const S = {
  pageWrap: {
    minHeight: '100dvh', background: '#F8FAFC',
    padding: '2rem 1rem', fontFamily: 'Plus Jakarta Sans, sans-serif',
  },
  card: {
    maxWidth: 660, margin: '0 auto',
    background: 'white', borderRadius: 16,
    boxShadow: '0 4px 24px rgba(13, 43, 69, .08)',
    padding: '2rem',
  },
  centered: {
    minHeight: '100dvh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '2rem', background: '#F8FAFC',
    fontFamily: 'Plus Jakarta Sans, sans-serif',
  },
  brandChip: {
    display: 'inline-block',
    background: '#0D2B45', color: 'white',
    padding: '8px 20px', borderRadius: 999,
    fontFamily: 'Georgia, serif', fontStyle: 'italic',
    fontSize: '1.1rem',
  },
  h1: { fontSize: '1.6rem', color: '#0D2B45', margin: '0 0 12px' },
  body: { color: '#374151', fontSize: '.95rem', maxWidth: 480, textAlign: 'center', lineHeight: 1.6, margin: 0 },
  input: {
    display: 'block', width: '100%', boxSizing: 'border-box',
    border: '1.5px solid #E2E8F0', borderRadius: 8,
    padding: '11px 14px', fontSize: '.95rem', fontFamily: 'inherit',
  },
  textarea: {
    display: 'block', width: '100%', boxSizing: 'border-box',
    border: '1.5px solid #E2E8F0', borderRadius: 8,
    padding: '11px 14px', fontSize: '.95rem', fontFamily: 'inherit',
    lineHeight: 1.5, resize: 'vertical',
  },
  spinner: {
    width: 36, height: 36, border: '3px solid #0B6E76',
    borderTopColor: 'transparent', borderRadius: '50%',
    animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem',
  },
}
