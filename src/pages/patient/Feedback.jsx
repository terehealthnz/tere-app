import React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const BRAND = { navy: '#0D2B45', teal: '#0B6E76', tealLight: '#D4EEF0' }

const TESTIMONIAL_MAX_LEN = 2000

function firstNameOf(full) {
  if (!full) return ''
  const trimmed = String(full).trim()
  if (!trimmed) return ''
  const parts = trimmed.replace(/^Dr\.?\s+/i, '').split(/\s+/)
  return parts[0] || ''
}

export default function Feedback() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const consultId = params.get('c') || ''
  const rating = params.get('r') || ''
  const token = params.get('t') || ''

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [prefill, setPrefill] = React.useState(null)
  const [text, setText] = React.useState('')
  const [displayName, setDisplayName] = React.useState('')
  const [allowPublish, setAllowPublish] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)
  const [submitted, setSubmitted] = React.useState(false)

  React.useEffect(() => {
    async function load() {
      if (!consultId || !rating || !token) {
        setError('This link is incomplete. Please tap the button in your email again.')
        setLoading(false)
        return
      }
      if (rating !== 'positive' && rating !== 'negative') {
        setError('This link looks malformed. Please tap the button in your email again.')
        setLoading(false)
        return
      }
      try {
        const qs = new URLSearchParams({ action: 'prefill', c: consultId, r: rating, t: token })
        const res = await apiFetch(`/api/feedback?${qs.toString()}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not load this page')
        setPrefill(data)
        const first = data.consultation?.patient_first_name
        setDisplayName(first ? first : 'A patient')
      } catch (e) {
        setError(e.message)
      }
      setLoading(false)
    }
    load()
  }, [consultId, rating, token])

  async function submit(e) {
    e?.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await apiFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultation_id: consultId,
          rating,
          token,
          testimonial_text: text.trim() || null,
          patient_display_name: displayName.trim() || null,
          allow_publish: rating === 'positive' ? allowPublish : false,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not submit, please try again')
      setSubmitted(true)
    } catch (e) {
      setError(e.message)
    }
    setSubmitting(false)
  }

  const shell = { minHeight: '100vh', background: BRAND.navy, color: 'white', fontFamily: 'Plus Jakarta Sans, sans-serif' }
  const input = { width: '100%', padding: '.75rem .875rem', border: '1px solid rgba(212,238,240,.2)', borderRadius: 8, fontSize: '1rem', background: 'rgba(255,255,255,.06)', color: 'white', fontFamily: 'inherit', boxSizing: 'border-box' }
  const label = { fontSize: '.8125rem', color: 'rgba(212,238,240,.7)', fontWeight: 600, marginBottom: 6, display: 'block' }

  function Nav() {
    return (
      <nav style={{ padding: '.875rem 1.5rem', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
        <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', color: BRAND.tealLight, fontSize: '1.5rem', fontWeight: 600, cursor: 'pointer' }} onClick={() => navigate('/')}>Tere Health</span>
      </nav>
    )
  }

  if (loading) {
    return (
      <div style={shell}>
        <Nav />
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '3rem 1.5rem', textAlign: 'center', color: 'rgba(212,238,240,.7)' }}>Loading...</div>
      </div>
    )
  }

  if (error && !prefill) {
    return (
      <div style={shell}>
        <Nav />
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '3rem 1.5rem' }}>
          <div style={{ background: 'rgba(220,38,38,.15)', border: '1px solid rgba(220,38,38,.4)', borderRadius: 12, padding: '1.5rem', color: '#FCA5A5', textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '.5rem' }}>We could not open this link</div>
            <p style={{ fontSize: '.9rem', margin: '0 0 1rem' }}>{error}</p>
            <button onClick={() => navigate('/contact')} style={{ background: BRAND.teal, color: 'white', border: 'none', padding: '.75rem 1.5rem', borderRadius: 99, fontSize: '.9375rem', fontWeight: 700, cursor: 'pointer' }}>Contact us instead</button>
          </div>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div style={shell}>
        <Nav />
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '3rem 1.5rem', textAlign: 'center' }}>
          <div style={{ background: 'rgba(11,110,118,.2)', border: '1px solid rgba(11,110,118,.5)', borderRadius: 12, padding: '2rem 1.5rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>✓</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '.75rem' }}>Thank you</div>
            {rating === 'positive' ? (
              <p style={{ fontSize: '.9375rem', color: 'rgba(255,255,255,.8)', lineHeight: 1.7, margin: 0 }}>
                We really appreciate you taking the time. If you ticked the publish box, your words will go through a quick moderation check before appearing on terehealth.co.nz.
              </p>
            ) : (
              <p style={{ fontSize: '.9375rem', color: 'rgba(255,255,255,.8)', lineHeight: 1.7, margin: 0 }}>
                Thank you for letting us know. Our team will read this today and come back to you within one business day. In an emergency, call 111.
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  const providerFirst = firstNameOf(prefill?.consultation?.provider_display_name)
  const patientFirst = prefill?.consultation?.patient_first_name

  return (
    <div style={shell}>
      <Nav />
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '2rem 1.5rem 3rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '.375rem' }}>
            {rating === 'positive' ? 'Share your experience' : 'Sorry it was not great'}
          </div>
          <p style={{ fontSize: '.9375rem', color: 'rgba(212,238,240,.8)', lineHeight: 1.6, margin: 0 }}>
            {rating === 'positive'
              ? `Kia ora${patientFirst ? ` ${patientFirst}` : ''}. Thanks for seeing${providerFirst ? ` Dr ${providerFirst}` : ' us'} yesterday - what stood out?`
              : `Kia ora${patientFirst ? ` ${patientFirst}` : ''}. We would like to hear what went wrong so we can make it right. One of the team will come back to you within one business day.`}
          </p>
        </div>

        {rating === 'negative' && (
          <div style={{ background: 'rgba(220,38,38,.15)', border: '1px solid rgba(220,38,38,.4)', borderRadius: 8, padding: '.75rem 1rem', fontSize: '.8125rem', color: '#FCA5A5', marginBottom: '1.5rem' }}>
            In an emergency, call <strong>111</strong>. Do not wait for us to reply.
          </div>
        )}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && (
            <div style={{ background: 'rgba(220,38,38,.2)', border: '1px solid rgba(220,38,38,.5)', color: '#FCA5A5', padding: '.75rem 1rem', borderRadius: 8, fontSize: '.875rem' }}>{error}</div>
          )}

          <div>
            <label style={label}>{rating === 'positive' ? 'Your experience' : 'What went wrong?'}</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value.slice(0, TESTIMONIAL_MAX_LEN))}
              style={{ ...input, minHeight: 140, resize: 'vertical' }}
              placeholder={rating === 'positive' ? 'What stood out? Would you recommend us?' : 'Please tell us what we could have done better.'}
            />
            <div style={{ fontSize: '.75rem', color: 'rgba(212,238,240,.5)', marginTop: 4, textAlign: 'right' }}>{text.length}/{TESTIMONIAL_MAX_LEN}</div>
          </div>

          {rating === 'positive' && (
            <>
              <div>
                <label style={label}>Display name <span style={{ color: 'rgba(212,238,240,.5)', fontWeight: 400 }}>- how you want to appear</span></label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  style={input}
                  placeholder='e.g. "Sam" or "A patient from Marlborough"'
                  maxLength={80}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '.875rem', color: 'rgba(212,238,240,.9)', lineHeight: 1.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={allowPublish} onChange={e => setAllowPublish(e.target.checked)} style={{ marginTop: 3 }} />
                <span>I am happy for my words and the display name above to be shown on terehealth.co.nz. (A Tere admin reviews every entry before it goes live.)</span>
              </label>
            </>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{ background: BRAND.teal, color: 'white', border: 'none', padding: '.875rem 1.75rem', borderRadius: 99, fontSize: '1rem', fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? .6 : 1, marginTop: '.5rem' }}
          >
            {submitting ? 'Sending...' : rating === 'positive' ? 'Send' : 'Send to the Tere team'}
          </button>
        </form>
      </div>
    </div>
  )
}
