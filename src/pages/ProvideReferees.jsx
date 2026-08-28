// /references/provide/:token — applicant enters their referee contacts.
//
// Anonymous access via the token in the URL. Applicant sees candidate context,
// enters 2 (required) + 1 (optional) referee rows, submits. On submit the
// server auto-emails each referee the standard reference-request template —
// applicant doesn't have to do anything else.

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const EMPTY = { name: '', email: '', phone: '', relationship: '' }

export default function ProvideReferees() {
  const { token } = useParams()
  const [state, setState] = useState('loading')   // loading | ready | already | error | submitting | done
  const [errorMsg, setError] = useState('')
  const [meta, setMeta] = useState(null)          // { applicantFirstName, role, min, max }
  const [refs, setRefs] = useState([{ ...EMPTY }, { ...EMPTY }])
  const [sentCount, setSentCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/job-applications?action=applicant_reference_intake&token=${encodeURIComponent(token)}`)
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (body?.terminal) { setState('already'); return }
        if (!res.ok) {
          setError(body.error || 'Could not open this link.')
          setState('error')
          return
        }
        const min = body.intake?.min_referees || 2
        const max = body.intake?.max_referees || 3
        setMeta({
          applicantFirstName: body.applicant?.first_name || 'there',
          role:               body.applicant?.role || 'a role at Tere Health',
          min, max,
        })
        setRefs(Array.from({ length: min }, () => ({ ...EMPTY })))
        setState('ready')
      } catch (e) {
        if (!cancelled) { setError(e.message || 'Network error'); setState('error') }
      }
    })()
    return () => { cancelled = true }
  }, [token])

  function update(i, k, v) {
    setRefs(rs => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r))
  }
  function addOne() {
    if (!meta) return
    if (refs.length >= meta.max) return
    setRefs(rs => [...rs, { ...EMPTY }])
  }
  function removeOne(i) {
    setRefs(rs => rs.filter((_, idx) => idx !== i))
  }

  async function submit(e) {
    e?.preventDefault?.()
    // Client-side validate before sending
    const nonEmpty = refs.filter(r => r.name.trim() || r.email.trim())
    if (nonEmpty.length < meta.min) {
      setError(`Please fill in at least ${meta.min} referees.`); return
    }
    for (const r of nonEmpty) {
      if (r.name.trim().length < 2) { setError('Each referee needs a name.'); return }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())) { setError(`"${r.name}" needs a valid email.`); return }
    }
    setState('submitting'); setError('')
    try {
      const res = await fetch('/api/job-applications?action=submit_applicant_referees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          referees: nonEmpty.map(r => ({
            name:         r.name.trim(),
            email:        r.email.trim().toLowerCase(),
            phone:        r.phone.trim(),
            relationship: r.relationship.trim(),
          })),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 409) { setState('already'); return }
      if (!res.ok) {
        setError(body.error || 'Could not submit — please try again.')
        setState('ready')
        return
      }
      setSentCount(body.refereesEmailed || nonEmpty.length)
      setState('done')
    } catch (e) {
      setError(e.message || 'Network error')
      setState('ready')
    }
  }

  if (state === 'loading') {
    return (
      <div style={S.centered}><div style={S.spinner} /><div style={{ color: '#6B7280' }}>Loading…</div></div>
    )
  }

  if (state === 'already') {
    return (
      <div style={S.centered}>
        <h1 style={S.h1}>Referees already submitted</h1>
        <p style={S.body}>Thanks — we have your referees on file and have already contacted them.</p>
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

  if (state === 'done') {
    return (
      <div style={S.centered}>
        <div style={S.brandChip}>Tere</div>
        <h1 style={S.h1}>Thanks — referees on their way </h1>
        <p style={S.body}>
          We've emailed all {sentCount} of your referees a short reference form.
          They'll answer a few questions and we'll take it from there — you don't need to do anything else.
        </p>
      </div>
    )
  }

  const busy = state === 'submitting'
  return (
    <div style={S.pageWrap}>
      <div style={S.card}>
        <div style={S.brandChip}>Tere</div>
        <h1 style={{ ...S.h1, marginTop: 16 }}>Your referees</h1>
        <p style={{ color: '#374151', fontSize: '.95rem', margin: '0 0 8px' }}>
          Kia ora {meta.applicantFirstName} — for your <strong>{meta.role}</strong> application, please provide contact details for {meta.min}
          {meta.max > meta.min ? `–${meta.max}` : ''} referees.
        </p>
        <p style={{ color: '#6B7280', fontSize: '.85rem', margin: '0 0 24px' }}>
          We'll email each of them a short five-minute form directly. Let them know it's coming so it doesn't land in spam.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {refs.map((r, i) => (
            <div key={i} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: '.85rem', fontWeight: 700, color: '#0D2B45' }}>Referee {i + 1}{i < meta.min ? '' : ' (optional)'}</div>
                {refs.length > meta.min && (
                  <button type="button" onClick={() => removeOne(i)} disabled={busy}
                    style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: '.8rem', cursor: 'pointer' }}>
                    Remove
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={S.label}>Name</label>
                  <input value={r.name} onChange={e => update(i, 'name', e.target.value)} placeholder="e.g. Dr Sarah Wilson" style={S.input} disabled={busy} />
                </div>
                <div>
                  <label style={S.label}>Email</label>
                  <input type="email" value={r.email} onChange={e => update(i, 'email', e.target.value)} placeholder="sarah@example.com" style={S.input} disabled={busy} />
                </div>
                <div>
                  <label style={S.label}>Phone (optional)</label>
                  <input value={r.phone} onChange={e => update(i, 'phone', e.target.value)} placeholder="+64…" style={S.input} disabled={busy} />
                </div>
                <div>
                  <label style={S.label}>Relationship</label>
                  <input value={r.relationship} onChange={e => update(i, 'relationship', e.target.value)} placeholder="e.g. Direct supervisor 2022–2024" style={S.input} disabled={busy} />
                </div>
              </div>
            </div>
          ))}

          {refs.length < meta.max && (
            <button type="button" onClick={addOne} disabled={busy}
              style={{ alignSelf: 'flex-start', background: 'white', border: '1.5px dashed #C7EAEC', color: '#0B6E76', padding: '10px 18px', borderRadius: 8, cursor: 'pointer', fontSize: '.85rem', fontWeight: 700, fontFamily: 'inherit' }}>
              + Add another referee
            </button>
          )}

          {errorMsg && <div style={{ color: '#991B1B', fontSize: '.85rem' }}>{errorMsg}</div>}

          <button type="submit" disabled={busy}
            style={{
              background: busy ? '#94A3B8' : '#0B6E76',
              color: 'white', border: 'none',
              padding: '14px 32px', borderRadius: 12,
              fontSize: '1rem', fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              marginTop: 8,
            }}>
            {busy ? 'Sending referee emails…' : 'Submit and notify referees'}
          </button>
          <div style={{ color: '#9CA3AF', fontSize: '.75rem', textAlign: 'center' }}>
            Clicking this immediately emails each referee. You can't undo the send.
          </div>
        </form>
      </div>
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
  label: { display: 'block', fontSize: '.7rem', color: '#0D2B45', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.03em' },
  input: {
    display: 'block', width: '100%', boxSizing: 'border-box',
    border: '1.5px solid #E2E8F0', borderRadius: 6,
    padding: '9px 12px', fontSize: '.9rem', fontFamily: 'inherit',
    background: 'white',
  },
  spinner: {
    width: 36, height: 36, border: '3px solid #0B6E76',
    borderTopColor: 'transparent', borderRadius: '50%',
    animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem',
  },
}
