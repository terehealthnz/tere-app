// Public patient-facing "Contact us" / "Need help?" page.
//
// Reachable at /contact. Also linked from post-consultation surfaces so
// patients can reach us for prescription follow-ups, billing questions,
// technical issues, complaints, or general enquiries without hunting for
// an email address.

import React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const BRAND = { navy: '#0D2B45', teal: '#0B6E76', tealLight: '#D4EEF0' }

const CATEGORIES = [
  { value: 'prescription', label: 'Prescription question or follow-up' },
  { value: 'billing',      label: 'Billing or payment' },
  { value: 'follow_up',    label: 'Consultation follow-up' },
  { value: 'technical',    label: 'Technical issue with the app' },
  { value: 'complaint',    label: 'Complaint' },
  { value: 'other',        label: 'Something else' },
]

export default function Contact() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [form, setForm] = React.useState({
    category: params.get('category') || 'other',
    patient_name: (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('patientName')) || '',
    patient_email: (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('patientEmail')) || '',
    patient_phone: (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('patientPhone')) || '',
    consultation_id: (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('consultationId')) || '',
    message: '',
    source: params.get('source') || 'contact_page',
  })
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState(null)
  const [submitted, setSubmitted] = React.useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e) {
    e?.preventDefault()
    setError(null)
    if (!form.patient_email.trim()) { setError('We need your email so we can reply'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.patient_email.trim())) {
      setError('That email address looks wrong — please double-check'); return
    }
    if (!form.message.trim() || form.message.trim().length < 10) {
      setError('Please tell us a bit more so we can help'); return
    }
    setSubmitting(true)
    try {
      const payload = { ...form }
      // Strip empty optional fields
      Object.keys(payload).forEach(k => { if (payload[k] === '') delete payload[k] })
      const res = await apiFetch('/api/patient-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong sending your message')
      setSubmitted(true)
    } catch (e) {
      setError(e.message)
      setSubmitting(false)
    }
  }

  const shell = { minHeight: '100vh', background: BRAND.navy, color: 'white', fontFamily: 'Plus Jakarta Sans, sans-serif' }
  const input = { width: '100%', padding: '.75rem .875rem', border: '1px solid rgba(212,238,240,.2)', borderRadius: 8, fontSize: '1rem', background: 'rgba(255,255,255,.06)', color: 'white', fontFamily: 'inherit' }
  const label = { fontSize: '.8125rem', color: 'rgba(212,238,240,.7)', fontWeight: 600, marginBottom: 6, display: 'block' }

  if (submitted) {
    return (
      <div style={shell}>
        <nav style={{ padding: '.875rem 1.5rem', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
          <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: BRAND.tealLight, fontSize: '1.5rem', fontWeight: 600, cursor: 'pointer' }} onClick={() => navigate('/')}>Tere Health</span>
        </nav>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '3rem 1.5rem', textAlign: 'center' }}>
          <div style={{ background: 'rgba(11,110,118,.2)', border: '1px solid rgba(11,110,118,.5)', borderRadius: 12, padding: '2rem 1.5rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>✓</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '.75rem' }}>Message sent</div>
            <p style={{ fontSize: '.9375rem', color: 'rgba(255,255,255,.8)', lineHeight: 1.7, margin: '0 0 1rem' }}>
              Thank you — we have received your message and will reply to <strong>{form.patient_email}</strong> within one business day.
            </p>
            <p style={{ fontSize: '.8125rem', color: 'rgba(255,255,255,.6)', margin: '0 0 1.5rem' }}>
              Check your junk folder if you don't see a confirmation in the next few minutes.
            </p>
            <div style={{ background: 'rgba(220,38,38,.15)', border: '1px solid rgba(220,38,38,.4)', borderRadius: 8, padding: '.75rem 1rem', fontSize: '.8125rem', color: '#FCA5A5', marginBottom: '1.5rem' }}>
              ⚠️ In an emergency, call <strong>111</strong> immediately — do not wait for us to reply.
            </div>
            <button onClick={() => navigate('/')} style={{ background: BRAND.teal, color: 'white', border: 'none', padding: '.75rem 1.75rem', borderRadius: 99, fontSize: '.9375rem', fontWeight: 700, cursor: 'pointer' }}>Return home</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={shell}>
      <nav style={{ padding: '.875rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: BRAND.tealLight, fontSize: '1.5rem', fontWeight: 600, cursor: 'pointer' }} onClick={() => navigate('/')}>Tere Health</span>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: '.9rem' }}>← Back</button>
      </nav>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '2rem 1.5rem 3rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '.375rem' }}>Get in touch</div>
          <p style={{ fontSize: '.9375rem', color: 'rgba(212,238,240,.8)', lineHeight: 1.6, margin: 0 }}>
            Need help with a prescription, billing question, or something else? Send us a message and we will reply within one business day.
          </p>
        </div>

        <div style={{ background: 'rgba(220,38,38,.15)', border: '1px solid rgba(220,38,38,.4)', borderRadius: 8, padding: '.75rem 1rem', fontSize: '.8125rem', color: '#FCA5A5', marginBottom: '1.5rem' }}>
          ⚠️ <strong>In an emergency, call 111 or visit your nearest emergency department immediately.</strong> Do not use this form for medical emergencies.
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && (
            <div style={{ background: 'rgba(220,38,38,.2)', border: '1px solid rgba(220,38,38,.5)', color: '#FCA5A5', padding: '.75rem 1rem', borderRadius: 8, fontSize: '.875rem' }}>{error}</div>
          )}

          <div>
            <label style={label}>What's it about?</label>
            <select value={form.category} onChange={e => set('category', e.target.value)} style={input}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value} style={{ background: BRAND.navy }}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <label style={label}>Your name</label>
            <input type="text" value={form.patient_name} onChange={e => set('patient_name', e.target.value)} style={input} placeholder="First and last name" />
          </div>

          <div>
            <label style={label}>Your email * <span style={{ color: 'rgba(212,238,240,.5)', fontWeight: 400 }}>— we will reply here</span></label>
            <input type="email" value={form.patient_email} onChange={e => set('patient_email', e.target.value)} style={input} placeholder="you@example.com" required />
          </div>

          <div>
            <label style={label}>Phone (optional)</label>
            <input type="tel" value={form.patient_phone} onChange={e => set('patient_phone', e.target.value)} style={input} placeholder="021 123 4567" />
          </div>

          <div>
            <label style={label}>Your message *</label>
            <textarea value={form.message} onChange={e => set('message', e.target.value)} rows={6} style={{ ...input, resize: 'vertical', minHeight: 120, fontFamily: 'inherit' }} placeholder="Tell us what's happening — the more detail you can share, the faster we can help." required />
          </div>

          {form.consultation_id && (
            <div style={{ fontSize: '.75rem', color: 'rgba(212,238,240,.55)' }}>
              Linked to consultation <code style={{ background: 'rgba(255,255,255,.05)', padding: '2px 6px', borderRadius: 4 }}>{form.consultation_id.slice(0, 8)}…</code>
            </div>
          )}

          <button type="submit" disabled={submitting} style={{ background: submitting ? 'rgba(11,110,118,.5)' : BRAND.teal, color: 'white', border: 'none', padding: '.875rem 1.75rem', borderRadius: 99, fontSize: '1rem', fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', marginTop: '.5rem' }}>
            {submitting ? 'Sending…' : 'Send message'}
          </button>
        </form>

        <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(255,255,255,.04)', borderRadius: 8, fontSize: '.8125rem', color: 'rgba(212,238,240,.7)', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: 'rgba(212,238,240,.9)', marginBottom: '.375rem' }}>Other ways to reach us</div>
          Email: <a href="mailto:terehealthnz@gmail.com" style={{ color: BRAND.tealLight }}>terehealthnz@gmail.com</a><br />
          Formal complaint: <a href="/complaints" style={{ color: BRAND.tealLight }}>Complaints process</a>
        </div>
      </div>
    </div>
  )
}
