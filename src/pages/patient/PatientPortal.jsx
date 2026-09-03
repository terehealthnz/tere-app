// Patient self-service portal — HDC Right 6(f) + Privacy Act 2020 IPP6/7.
//
// Magic-link email auth (see api/_patient-portal.js). Patient enters their
// email → we send a link → they land back here with ?token=... → we verify,
// then show:
//   • Their access log (who saw my data, when, why — redacted)
//   • Download a copy of their record (FHIR Bundle JSON)
//   • Submit a correction request

import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF = 'Plus Jakarta Sans, sans-serif'

async function post(action, body = {}) {
  const r = await fetch('/api/patient-portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
  return data
}

const nzDateTime = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return String(iso) }
}

export default function PatientPortal() {
  const [params, setParams] = useSearchParams()
  const tokenFromUrl = params.get('token')
  const [phase, setPhase] = useState(tokenFromUrl ? 'verifying' : 'request')  // request | sent | verifying | signed_in | error
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [session, setSession] = useState(null)

  const [email, setEmail] = useState('')
  const [entries, setEntries] = useState([])
  const [loadingEntries, setLoadingEntries] = useState(false)

  const [correctionField, setCorrectionField] = useState('')
  const [correctionRequested, setCorrectionRequested] = useState('')
  const [correctionReason, setCorrectionReason] = useState('')
  const [correctionSent, setCorrectionSent] = useState(false)

  // ── Verify magic-link token on mount ────────────────────────────────────────
  useEffect(() => {
    if (!tokenFromUrl) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await post('verify', { token: tokenFromUrl })
        if (cancelled) return
        setSession(data)
        setPhase('signed_in')
        // Remove ?token= from URL so refresh doesn't try to re-verify.
        params.delete('token')
        setParams(params, { replace: true })
        await loadEntries(data.token)
      } catch (e) {
        if (cancelled) return
        setError(e.message)
        setPhase('error')
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line
  }, [tokenFromUrl])

  async function requestLink(e) {
    e?.preventDefault?.()
    setError(null)
    try {
      const data = await post('request', { email: email.trim() })
      setMessage(data.message)
      setPhase('sent')
    } catch (e) { setError(e.message) }
  }

  async function loadEntries(token) {
    setLoadingEntries(true)
    try {
      const data = await post('access_log', { token })
      setEntries(data.entries || [])
    } catch (e) { setError(e.message) }
    setLoadingEntries(false)
  }

  async function downloadRecord() {
    try {
      const data = await post('record', { token: session.token })
      const bundle = data.bundle
      if (!bundle) throw new Error('No record on file to export.')
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/fhir+json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `my-tere-record-${(session.patient?.nhi || session.patient?.email || 'record')}.json`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (e) { alert('Download failed: ' + e.message) }
  }

  async function submitCorrection(e) {
    e?.preventDefault?.()
    setError(null)
    if (!correctionField.trim() || (!correctionRequested.trim() && !correctionReason.trim())) {
      setError('Please describe what you would like changed.')
      return
    }
    try {
      await post('correction', {
        token: session.token,
        targetField: correctionField.trim(),
        requestedValue: correctionRequested.trim() || null,
        reason: correctionReason.trim() || null,
      })
      setCorrectionSent(true)
      setCorrectionField(''); setCorrectionRequested(''); setCorrectionReason('')
    } catch (e) { setError(e.message) }
  }

  const page = { minHeight: '100vh', background: '#F7F5F0', fontFamily: FF, padding: '2rem 1rem' }
  const card = { background: 'white', borderRadius: 14, padding: '1.5rem', maxWidth: 640, margin: '0 auto', boxShadow: '0 4px 14px rgba(13,43,69,.08)' }
  const btn = { background: TEAL, color: 'white', border: 'none', padding: '.625rem 1.25rem', borderRadius: 8, fontFamily: FF, fontSize: '.9375rem', fontWeight: 700, cursor: 'pointer' }
  const inp = { padding: '.625rem .75rem', border: '1.5px solid #E2E8F0', borderRadius: 8, fontFamily: FF, fontSize: '.9375rem', width: '100%', boxSizing: 'border-box' }
  const lbl = { display: 'block', fontSize: '.75rem', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }

  return (
    <div style={page}>
      <div style={card}>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', color: TEAL, fontSize: '1.5rem' }}>Tere Health</div>
          <div style={{ fontSize: '.75rem', color: '#6B7280', letterSpacing: '.1em', textTransform: 'uppercase' }}>Patient portal</div>
        </div>

        {phase === 'request' && (
          <>
            <h1 style={{ color: NAVY, fontSize: '1.5rem', margin: 0 }}>Access your Tere Health record</h1>
            <p style={{ color: '#374151', fontSize: '.9375rem', lineHeight: 1.6, margin: '1rem 0' }}>
              Enter the email you gave us. We'll send you a one-time sign-in link that works for 30 minutes.
            </p>
            <form onSubmit={requestLink}>
              <label style={lbl}>Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={inp} placeholder="you@example.com" />
              <div style={{ marginTop: '1.25rem' }}>
                <button type="submit" style={btn}>Send my sign-in link</button>
              </div>
            </form>
            <p style={{ fontSize: '.75rem', color: '#6B7280', marginTop: '1.5rem', lineHeight: 1.55 }}>
              Under the Code of Health and Disability Services Consumers' Rights (Right 6) and the Privacy Act 2020 (IPP6/7), you have the right to see who has accessed your record, request a copy, and ask us to correct anything wrong.
            </p>
          </>
        )}

        {phase === 'sent' && (
          <>
            <h1 style={{ color: NAVY, fontSize: '1.25rem', margin: 0 }}>Check your email</h1>
            <p style={{ color: '#374151', fontSize: '.9375rem', lineHeight: 1.6, margin: '1rem 0' }}>
              {message || 'If that email matches a patient record, you will receive a link within a few minutes.'}
            </p>
            <p style={{ fontSize: '.8125rem', color: '#6B7280' }}>Didn't get an email? Check spam, and make sure the address matches the one you gave us. Otherwise contact us at <a href="mailto:support@terehealth.co.nz">support@terehealth.co.nz</a>.</p>
          </>
        )}

        {phase === 'verifying' && (
          <>
            <h1 style={{ color: NAVY, fontSize: '1.25rem', margin: 0 }}>Signing you in…</h1>
            <p style={{ color: '#6B7280', fontSize: '.9375rem', margin: '1rem 0' }}>Verifying your link.</p>
          </>
        )}

        {phase === 'error' && (
          <>
            <h1 style={{ color: '#DC2626', fontSize: '1.25rem', margin: 0 }}>Couldn't sign you in</h1>
            <p style={{ color: '#374151', fontSize: '.9375rem', lineHeight: 1.6, margin: '1rem 0' }}>{error}</p>
            <button onClick={() => { setError(null); setPhase('request') }} style={btn}>Request a new link</button>
          </>
        )}

        {phase === 'signed_in' && session && (
          <>
            <h1 style={{ color: NAVY, fontSize: '1.375rem', margin: 0 }}>Kia ora {session.patient?.first_name || ''}</h1>
            <p style={{ color: '#6B7280', fontSize: '.8125rem', marginBottom: '1.5rem' }}>Signed in as {session.patient?.email || session.patient?.nhi} · session expires {nzDateTime(session.expires_at)}</p>

            {/* Access log */}
            <section style={{ marginBottom: '2rem' }}>
              <h2 style={{ color: NAVY, fontSize: '1rem', margin: 0, borderBottom: '2px solid #F1F5F9', paddingBottom: 8 }}>Who has accessed your record</h2>
              {loadingEntries ? (
                <p style={{ color: '#9CA3AF' }}>Loading…</p>
              ) : entries.length === 0 ? (
                <p style={{ color: '#9CA3AF', fontSize: '.8125rem', marginTop: '1rem' }}>No recorded accesses in the last 12 months.</p>
              ) : (
                <div style={{ marginTop: '.75rem' }}>
                  {entries.map((e, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 120px', gap: 8, padding: '.5rem .625rem', borderBottom: '1px solid #F1F5F9', fontSize: '.8125rem' }}>
                      <span style={{ color: '#6B7280' }}>{nzDateTime(e.when)}</span>
                      <span style={{ color: NAVY }}>{e.what}</span>
                      <span style={{ color: TEAL, fontWeight: 700, textAlign: 'right' }}>{e.by}</span>
                    </div>
                  ))}
                  <p style={{ fontSize: '.6875rem', color: '#6B7280', marginTop: '.75rem' }}>Access reasons: <em>clinical care</em> = your provider or admin looking at your chart to provide care; <em>billing</em>, <em>quality audit</em>, etc. as noted.</p>
                </div>
              )}
            </section>

            {/* Download record */}
            <section style={{ marginBottom: '2rem' }}>
              <h2 style={{ color: NAVY, fontSize: '1rem', margin: 0, borderBottom: '2px solid #F1F5F9', paddingBottom: 8 }}>Download your record</h2>
              <p style={{ fontSize: '.8125rem', color: '#374151', marginTop: '.75rem', lineHeight: 1.6 }}>
                Get a copy of your record as a FHIR Bundle (a standard health-data format your GP or another provider can import).
              </p>
              <button onClick={downloadRecord} style={btn}>Download my record (FHIR JSON)</button>
            </section>

            {/* Correction request */}
            <section>
              <h2 style={{ color: NAVY, fontSize: '1rem', margin: 0, borderBottom: '2px solid #F1F5F9', paddingBottom: 8 }}>Request a correction</h2>
              {correctionSent ? (
                <p style={{ color: '#059669', fontSize: '.875rem', marginTop: '1rem' }}>Thanks — we've received your request and will respond within 20 working days.</p>
              ) : (
                <form onSubmit={submitCorrection} style={{ marginTop: '.75rem' }}>
                  <div style={{ marginBottom: '.75rem' }}>
                    <label style={lbl}>What should we change?</label>
                    <input value={correctionField} onChange={e => setCorrectionField(e.target.value)} placeholder="e.g. Medications list, allergies, date of birth" style={inp} />
                  </div>
                  <div style={{ marginBottom: '.75rem' }}>
                    <label style={lbl}>What should it say instead?</label>
                    <input value={correctionRequested} onChange={e => setCorrectionRequested(e.target.value)} placeholder="e.g. Metformin 500mg (was recorded as 1000mg)" style={inp} />
                  </div>
                  <div style={{ marginBottom: '.75rem' }}>
                    <label style={lbl}>Why (optional)</label>
                    <textarea value={correctionReason} onChange={e => setCorrectionReason(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} placeholder="Any context that helps us verify" />
                  </div>
                  <button type="submit" style={btn}>Send correction request</button>
                </form>
              )}
              {error && phase === 'signed_in' && <p style={{ color: '#DC2626', fontSize: '.8125rem', marginTop: '.75rem' }}>{error}</p>}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
