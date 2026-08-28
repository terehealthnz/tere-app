// /offer/sign/:token — applicant signs their letter of offer.
//
// Anonymous access: the token in the URL is the only credential. Flow:
//   1. GET /api/job-applications?action=offer&token=<t> → offer + applicant
//      details, or a terminal state if already signed / cancelled.
//   2. Applicant reads terms, types their full name, draws signature (optional).
//   3. POST /api/job-applications?action=sign_offer { token, typedName,
//      signaturePng? } → server records the signature and notifies Tere to
//      countersign. Applicant page shows a "thanks — we'll email the fully
//      signed copy" success screen.

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Minimal in-page signature pad — no upload dependency. Emits a data-URL PNG
// via onChange whenever the canvas is dirty. Kept simple: pointer events so
// mouse/trackpad/touch/stylus all work; white background so the PNG is opaque.
function InlineSignaturePad({ onChange, disabled }) {
  const canvasRef  = useRef(null)
  const drawingRef = useRef(false)
  const dirtyRef   = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1A2A33'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function pos(e) {
    const c = canvasRef.current
    const r = c.getBoundingClientRect()
    return { x: (e.clientX - r.left) * (c.width / r.width),
             y: (e.clientY - r.top)  * (c.height / r.height) }
  }
  function down(e) {
    if (disabled) return
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
  function up() {
    if (!drawingRef.current) return
    drawingRef.current = false
    if (dirtyRef.current) {
      onChange?.(canvasRef.current.toDataURL('image/png'))
    }
  }
  function clear() {
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.strokeStyle = '#1A2A33'; ctx.lineWidth = 2.5
    dirtyRef.current = false
    onChange?.(null)
  }

  return (
    <div>
      <div style={{ border: '2px dashed #E2E8F0', borderRadius: 8, background: 'white', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef} width={600} height={180}
          onPointerDown={down} onPointerMove={move}
          onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
          style={{ display: 'block', width: '100%', height: '160px', cursor: disabled ? 'not-allowed' : 'crosshair', touchAction: 'none' }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <div style={{ color: '#9CA3AF', fontSize: '.75rem' }}>Draw your signature above (optional)</div>
        <button type="button" onClick={clear} disabled={disabled}
          style={{ background: 'none', border: 'none', color: '#0B6E76', fontSize: '.8rem', cursor: 'pointer' }}>
          Clear
        </button>
      </div>
    </div>
  )
}

export default function OfferSign() {
  const { token } = useParams()
  const [state, setState] = useState('loading')  // loading | ready | already | cancelled | error | submitting | signed
  const [offer, setOffer] = useState(null)
  const [applicant, setApplicant] = useState(null)
  const [typedName, setTypedName] = useState('')
  const [sigPng,    setSigPng]    = useState(null)
  const [errorMsg,  setErrorMsg]  = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/job-applications?action=offer&token=${encodeURIComponent(token)}`)
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setErrorMsg(body.error || 'Could not open this offer link.')
          setState('error')
          return
        }
        if (body.terminal) {
          setOffer(body.offer)
          if (body.offer?.status === 'cancelled') setState('cancelled')
          else setState('already')
          return
        }
        setOffer(body.offer)
        setApplicant(body.applicant)
        setTypedName([body.applicant?.first_name, body.applicant?.last_name].filter(Boolean).join(' '))
        setState('ready')
      } catch (e) {
        if (!cancelled) { setErrorMsg(e.message || 'Network error'); setState('error') }
      }
    })()
    return () => { cancelled = true }
  }, [token])

  async function submit() {
    if (typedName.trim().length < 2) {
      setErrorMsg('Please type your full name.')
      return
    }
    setState('submitting'); setErrorMsg('')
    try {
      const res = await fetch('/api/job-applications?action=sign_offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, typedName: typedName.trim(), signaturePng: sigPng }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 409) { setState('already'); return }
      if (!res.ok) {
        setErrorMsg(body.error || 'Could not save your signature — please try again.')
        setState('ready')
        return
      }
      setState('signed')
    } catch (e) {
      setErrorMsg(e.message || 'Network error')
      setState('ready')
    }
  }

  if (state === 'loading') {
    return (
      <div style={S.centered}>
        <div style={S.spinner} />
        <div style={{ color: '#6B7280' }}>Loading your offer…</div>
      </div>
    )
  }

  if (state === 'cancelled') {
    return (
      <div style={S.centered}>
        <h1 style={S.h1}>This offer has been withdrawn</h1>
        <p style={S.body}>
          If you have questions, reply to your original email or contact{' '}
          <a href="mailto:hello@terehealth.co.nz" style={{ color: '#0B6E76' }}>hello@terehealth.co.nz</a>.
        </p>
      </div>
    )
  }

  if (state === 'already') {
    return (
      <div style={S.centered}>
        <h1 style={S.h1}>Already signed</h1>
        <p style={S.body}>
          Thanks — your signature is already on file. Once Tere Health countersigns, we'll email you the fully-signed PDF.
        </p>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={S.centered}>
        <h1 style={{ ...S.h1, color: '#991B1B' }}>Offer link not valid</h1>
        <p style={S.body}>{errorMsg}</p>
      </div>
    )
  }

  if (state === 'signed') {
    return (
      <div style={S.centered}>
        <div style={S.brandChip}>Tere</div>
        <h1 style={S.h1}>Thank you — you're signed </h1>
        <p style={S.body}>
          We've received your signature. Someone at Tere Health will countersign shortly and email you the fully-signed PDF for your records.
        </p>
      </div>
    )
  }

  // ready | submitting
  const busy = state === 'submitting'
  const firstName = applicant?.first_name || 'there'
  return (
    <div style={S.pageWrap}>
      <div style={S.card}>
        <div style={S.brandChip}>Tere</div>
        <h1 style={{ ...S.h1, marginTop: 16 }}>Letter of Offer</h1>
        <p style={{ color: '#6B7280', fontSize: '.9rem', margin: '0 0 24px' }}>
          Kia ora {firstName} — please review the terms and add your signature.
        </p>

        <div style={S.termsBox}>
          <div style={S.row}><span style={S.rowLabel}>Role</span><span style={S.rowValue}>{offer?.role_title}</span></div>
          <div style={S.row}><span style={S.rowLabel}>Compensation</span><span style={S.rowValue}>{offer?.compensation}</span></div>
          <div style={S.row}><span style={S.rowLabel}>Start date</span><span style={S.rowValue}>{offer?.start_date ? fmtDate(offer.start_date) : 'To be agreed'}</span></div>
          <div style={S.row}><span style={S.rowLabel}>Employer</span><span style={S.rowValue}>Tere Health Limited</span></div>
        </div>

        <div style={{ marginTop: 24 }}>
          <div style={S.sectionTitle}>Terms of engagement</div>
          <div style={S.termsBody}>{offer?.contract_terms}</div>
        </div>

        <div style={{ marginTop: 32, borderTop: '1px solid #E2E8F0', paddingTop: 24 }}>
          <div style={S.sectionTitle}>Your signature</div>
          <label style={{ display: 'block', fontSize: '.8rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
            Type your full name
          </label>
          <input
            type="text"
            value={typedName}
            onChange={e => setTypedName(e.target.value)}
            disabled={busy}
            placeholder="e.g. Jane Cook"
            style={S.input}
          />
          <div style={{ marginTop: 16 }}>
            <InlineSignaturePad onChange={setSigPng} disabled={busy} />
          </div>
          <p style={{ color: '#9CA3AF', fontSize: '.75rem', margin: '12px 0 0' }}>
            By clicking "Sign and submit", you agree to be bound by the terms above. Your typed name serves as your legal electronic signature.
          </p>

          {errorMsg && (
            <div style={{ color: '#991B1B', fontSize: '.85rem', marginTop: 12 }}>{errorMsg}</div>
          )}

          <button
            onClick={submit}
            disabled={busy || typedName.trim().length < 2}
            style={{
              display: 'block', width: '100%', marginTop: 20,
              background: (busy || typedName.trim().length < 2) ? '#94A3B8' : '#0B6E76',
              color: 'white', border: 'none',
              padding: '14px 32px', borderRadius: 12,
              fontSize: '1rem', fontWeight: 700,
              cursor: (busy || typedName.trim().length < 2) ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}>
            {busy ? 'Signing…' : 'Sign and submit'}
          </button>
        </div>
      </div>
    </div>
  )
}

const S = {
  pageWrap: {
    minHeight: '100dvh',
    background: '#F8FAFC',
    padding: '2rem 1rem',
    fontFamily: 'Plus Jakarta Sans, sans-serif',
  },
  card: {
    maxWidth: 680, margin: '0 auto',
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
    fontSize: '1.1rem', marginBottom: 16,
  },
  h1: { fontSize: '1.6rem', color: '#0D2B45', margin: '0 0 12px' },
  body: { color: '#374151', fontSize: '.95rem', maxWidth: 480, textAlign: 'center', lineHeight: 1.6, margin: 0 },
  termsBox: {
    background: '#F0F9FA', border: '1px solid #C7EAEC',
    borderRadius: 10, padding: '1rem 1.25rem',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  row: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  rowLabel: { flex: '0 0 120px', fontSize: '.8rem', color: '#0D2B45', fontWeight: 700 },
  rowValue: { flex: 1, color: '#1A2A33', fontSize: '.95rem' },
  sectionTitle: { fontSize: '.75rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 },
  termsBody: {
    background: 'white', border: '1px solid #E2E8F0', borderRadius: 8,
    padding: '1rem 1.25rem', color: '#1A2A33', fontSize: '.95rem',
    lineHeight: 1.65, whiteSpace: 'pre-wrap', maxHeight: 340, overflowY: 'auto',
  },
  input: {
    display: 'block', width: '100%', boxSizing: 'border-box',
    border: '1.5px solid #E2E8F0', borderRadius: 8,
    padding: '12px 14px', fontSize: '1rem', fontFamily: 'inherit',
  },
  spinner: {
    width: 36, height: 36, border: '3px solid #0B6E76',
    borderTopColor: 'transparent', borderRadius: '50%',
    animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem',
  },
}
