// Patient-facing form to request Tere records be forwarded to a newly-enrolled GP.
// Link comes from the after-visit summary email for no-GP patients (see
// api/_send-email.js enrolmentHtml). Ownership: patient must enter the same
// email that received the consult summary — server checks against
// consultations.patient_email. No login required.

import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'

const TEAL = '#0B6E76'
const NAVY = '#0D2B45'

export default function ForwardRecords() {
  const { token: consultationId } = useParams()
  const [gpName, setGpName] = useState('')
  const [gpPractice, setGpPractice] = useState('')
  const [gpEmail, setGpEmail] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [patientNote, setPatientNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const canSubmit = gpName.trim() && gpEmail.trim() && confirmEmail.trim() && /@/.test(gpEmail) && /@/.test(confirmEmail)

  async function submit(e) {
    e.preventDefault()
    if (!canSubmit || submitting) return
    setSubmitting(true)
    try {
      const r = await fetch('/api/record-forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          consultationId,
          gpName: gpName.trim(),
          gpPractice: gpPractice.trim(),
          gpEmail: gpEmail.trim(),
          confirmEmail: confirmEmail.trim(),
          patientNote: patientNote.trim(),
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok) {
        setResult({ ok: true })
      } else {
        setResult({ ok: false, error: j.error || `Request failed (${r.status})` })
      }
    } catch (e) {
      setResult({ ok: false, error: e.message })
    }
    setSubmitting(false)
  }

  return (
    <div style={{ minHeight:'100vh', background:'#F8FAFC', fontFamily:'Plus Jakarta Sans, sans-serif' }}>
      <div style={{ background: NAVY, padding: '20px 24px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', color: '#D4EEF0', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 22 }}>
          Tere Health
        </div>
      </div>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px' }}>
        <h1 style={{ fontSize: '1.5rem', color: NAVY, margin: '0 0 8px' }}>Send my records to my new GP</h1>
        <p style={{ fontSize: '.9375rem', color: '#374151', lineHeight: 1.65, margin: '0 0 20px' }}>
          Now that you're enrolled with a GP, we can send them everything from your Tere Health consultation — your notes, any prescriptions, and any test results.
          Fill in your new GP's details and we'll email them the record within 1-2 working days.
        </p>

        {result?.ok ? (
          <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 10, padding: '20px 24px' }}>
            <div style={{ fontSize: '1.125rem', color: '#065F46', fontWeight: 700, marginBottom: 8 }}>✓ Request received</div>
            <p style={{ fontSize: '.9375rem', color: '#065F46', lineHeight: 1.6, margin: 0 }}>
              We've sent a confirmation to your email. Our admin team will forward your records to <strong>{gpName}</strong> ({gpEmail}) within 1-2 working days.
            </p>
            <div style={{ marginTop: 16 }}>
              <Link to="/" style={{ color: TEAL, textDecoration: 'underline', fontSize: '.875rem' }}>Back to Tere Health</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8F0', padding: '20px 24px' }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6B7280', letterSpacing: '.05em', marginBottom: 4 }}>Your new GP's name <span style={{ color: '#DC2626' }}>*</span></label>
              <input value={gpName} onChange={e => setGpName(e.target.value)} placeholder="e.g. Dr Sarah Wilson" required
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: '.9375rem', fontFamily: 'inherit' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6B7280', letterSpacing: '.05em', marginBottom: 4 }}>Practice / clinic name</label>
              <input value={gpPractice} onChange={e => setGpPractice(e.target.value)} placeholder="e.g. Renwick Medical Centre"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: '.9375rem', fontFamily: 'inherit' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6B7280', letterSpacing: '.05em', marginBottom: 4 }}>Your new GP's email <span style={{ color: '#DC2626' }}>*</span></label>
              <input value={gpEmail} onChange={e => setGpEmail(e.target.value)} type="email" placeholder="reception@renwickmedical.co.nz" required
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: '.9375rem', fontFamily: 'inherit' }} />
              <div style={{ fontSize: '.75rem', color: '#6B7280', marginTop: 4 }}>Usually the practice's reception or admin email. Not sure? Ring the practice and ask what address they use for referrals.</div>
            </div>
            <div style={{ marginBottom: 16, padding: 12, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8 }}>
              <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#92400E', letterSpacing: '.05em', marginBottom: 4 }}>Your email (to confirm it's you) <span style={{ color: '#DC2626' }}>*</span></label>
              <input value={confirmEmail} onChange={e => setConfirmEmail(e.target.value)} type="email" placeholder="the email your Tere summary was sent to" required
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid #FDE68A', borderRadius: 8, fontSize: '.9375rem', fontFamily: 'inherit' }} />
              <div style={{ fontSize: '.75rem', color: '#78350F', marginTop: 4 }}>Must match the email that received your Tere consult summary. This proves it's you asking.</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6B7280', letterSpacing: '.05em', marginBottom: 4 }}>Anything you'd like to add? (optional)</label>
              <textarea value={patientNote} onChange={e => setPatientNote(e.target.value)} rows={3} placeholder="e.g. 'Please let them know I'm booking a follow-up next week.'"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: '.9375rem', fontFamily: 'inherit', resize: 'vertical' }} />
            </div>

            {result?.error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 8, fontSize: '.875rem', marginBottom: 16 }}>
                {result.error}
              </div>
            )}

            <button type="submit" disabled={!canSubmit || submitting}
              style={{ width: '100%', minHeight: 52, background: canSubmit ? TEAL : '#E2E8F0', color: canSubmit ? 'white' : '#9CA3AF', border: 'none', borderRadius: 10, fontSize: '1rem', fontWeight: 700, cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed' }}>
              {submitting ? 'Sending…' : 'Send my records to this GP'}
            </button>
            <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: 12, lineHeight: 1.5, textAlign: 'center' }}>
              Under Right 7 of the HDC Code, you can request or decline sharing of your health information at any time. Reviewed by Tere admin before send.
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
