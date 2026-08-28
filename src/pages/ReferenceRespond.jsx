// /reference/respond/:token — referee gives a reference for a candidate.
//
// Anonymous access: the token in the URL is the only credential. Flow:
//   1. GET  /api/job-applications?action=reference&token=<t> → candidate
//      name + role + referee's own name (as they were addressed).
//   2. Referee fills the 7-question form.
//   3. POST /api/job-applications?action=submit_reference → server stores
//      the response and notifies the internal team.
//
// Kept deliberately short (5-8 minutes to complete) — long forms drive
// referees to phone it in instead.

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const REHIRE_OPTIONS = [
  { value: 'yes',              label: 'Yes, without hesitation' },
  { value: 'with_reservation', label: 'Yes, with some reservation' },
  { value: 'no',               label: 'No' },
  { value: 'unable_to_say',    label: "I'd rather not say" },
]

const OVERALL_OPTIONS = [
  { value: 'strong',   label: 'Strongly recommend' },
  { value: 'positive', label: 'Recommend' },
  { value: 'neutral',  label: 'Neutral' },
  { value: 'negative', label: 'Do not recommend' },
]

export default function ReferenceRespond() {
  const { token } = useParams()
  const [state, setState] = useState('loading')  // loading | ready | already | error | submitting | done
  const [meta,  setMeta]  = useState(null)       // { candidateName, candidateRole, refereeName, refereeRelationship }
  const [form,  setForm]  = useState({
    confirmedRelationship:   '',
    confirmedDates:          '',
    wouldRehire:             '',
    strengths:               '',
    concerns:                '',
    overallRecommendation:   '',
    additionalComments:      '',
  })
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/job-applications?action=reference&token=${encodeURIComponent(token)}`)
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setErrorMsg(body.error || 'Could not open this link.')
          setState('error')
          return
        }
        if (body.terminal) { setState('already'); return }
        setMeta({
          candidateName: [body.candidate?.first_name, body.candidate?.last_name].filter(Boolean).join(' ') || 'the candidate',
          candidateRole: body.candidate?.role || 'a role at Tere Health',
          refereeName:   body.reference?.referee_name || 'there',
          refereeRelationship: body.reference?.referee_relationship || '',
        })
        // Prefill relationship with what admin noted — referee can edit.
        setForm(f => ({ ...f, confirmedRelationship: body.reference?.referee_relationship || '' }))
        setState('ready')
      } catch (e) {
        if (!cancelled) { setErrorMsg(e.message || 'Network error'); setState('error') }
      }
    })()
    return () => { cancelled = true }
  }, [token])

  function update(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e) {
    e?.preventDefault?.()
    if (!form.wouldRehire || !form.overallRecommendation) {
      setErrorMsg('Please answer both "would you rehire" and "overall recommendation" — the rest are optional.')
      return
    }
    setState('submitting'); setErrorMsg('')
    try {
      const res = await fetch('/api/job-applications?action=submit_reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...form }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 409) { setState('already'); return }
      if (!res.ok) {
        setErrorMsg(body.error || 'Could not submit — please try again.')
        setState('ready')
        return
      }
      setState('done')
    } catch (e) {
      setErrorMsg(e.message || 'Network error')
      setState('ready')
    }
  }

  if (state === 'loading') {
    return (
      <div style={S.centered}>
        <div style={S.spinner} />
        <div style={{ color: '#6B7280' }}>Loading…</div>
      </div>
    )
  }

  if (state === 'already') {
    return (
      <div style={S.centered}>
        <h1 style={S.h1}>Reference already received</h1>
        <p style={S.body}>Thanks — we already have a response for this link. No action needed.</p>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={S.centered}>
        <h1 style={{ ...S.h1, color: '#991B1B' }}>Link not valid</h1>
        <p style={S.body}>{errorMsg}</p>
        <p style={{ ...S.body, marginTop: 12, fontSize: '.85rem' }}>
          Reply to the request email and we'll send a fresh one.
        </p>
      </div>
    )
  }

  if (state === 'done') {
    return (
      <div style={S.centered}>
        <div style={S.brandChip}>Tere</div>
        <h1 style={S.h1}>Thank you </h1>
        <p style={S.body}>Your reference has been recorded and shared with the hiring team. We appreciate you taking the time.</p>
      </div>
    )
  }

  // ready | submitting
  const busy = state === 'submitting'
  const firstName = (meta?.refereeName || '').split(' ')[0] || 'there'
  return (
    <div style={S.pageWrap}>
      <div style={S.card}>
        <div style={S.brandChip}>Tere</div>
        <h1 style={{ ...S.h1, marginTop: 16 }}>Reference request</h1>
        <p style={{ color: '#374151', fontSize: '.95rem', margin: '0 0 8px', lineHeight: 1.55 }}>
          Kia ora {firstName} — <strong>{meta?.candidateName}</strong> has applied for <strong>{meta?.candidateRole}</strong> at Tere Health and listed you as a referee.
        </p>
        <p style={{ color: '#6B7280', fontSize: '.85rem', margin: '0 0 24px' }}>
          Your answers stay confidential and are shared only with the hiring team. Should take about five minutes.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Q label="Your relationship to them">
            <input
              value={form.confirmedRelationship}
              onChange={e => update('confirmedRelationship', e.target.value)}
              placeholder="e.g. Direct supervisor at Waikato ED 2022–2024"
              style={S.input}
              disabled={busy}
            />
          </Q>

          <Q label="Dates you worked together (approx.)">
            <input
              value={form.confirmedDates}
              onChange={e => update('confirmedDates', e.target.value)}
              placeholder="e.g. Jan 2022 – Aug 2024"
              style={S.input}
              disabled={busy}
            />
          </Q>

          <Q label="Would you rehire them if you had the chance?" required>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {REHIRE_OPTIONS.map(o => (
                <RadioRow key={o.value} name="wouldRehire" value={o.value} label={o.label}
                  checked={form.wouldRehire === o.value}
                  onChange={() => update('wouldRehire', o.value)}
                  disabled={busy} />
              ))}
            </div>
          </Q>

          <Q label="What are their strengths?">
            <textarea
              value={form.strengths}
              onChange={e => update('strengths', e.target.value)}
              rows={4}
              placeholder="Clinical judgement, teamwork, patient rapport, technical skills, anything that stands out…"
              style={S.textarea}
              disabled={busy}
            />
          </Q>

          <Q label="Any concerns or development areas we should know about?">
            <textarea
              value={form.concerns}
              onChange={e => update('concerns', e.target.value)}
              rows={4}
              placeholder="Optional — but useful. We take a balanced view."
              style={S.textarea}
              disabled={busy}
            />
          </Q>

          <Q label="Overall recommendation" required>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {OVERALL_OPTIONS.map(o => (
                <RadioRow key={o.value} name="overall" value={o.value} label={o.label}
                  checked={form.overallRecommendation === o.value}
                  onChange={() => update('overallRecommendation', o.value)}
                  disabled={busy} />
              ))}
            </div>
          </Q>

          <Q label="Anything else you'd like us to know?">
            <textarea
              value={form.additionalComments}
              onChange={e => update('additionalComments', e.target.value)}
              rows={3}
              placeholder="Optional."
              style={S.textarea}
              disabled={busy}
            />
          </Q>

          {errorMsg && (
            <div style={{ color: '#991B1B', fontSize: '.85rem' }}>{errorMsg}</div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              background: busy ? '#94A3B8' : '#0B6E76',
              color: 'white', border: 'none',
              padding: '14px 32px', borderRadius: 12,
              fontSize: '1rem', fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              marginTop: 8,
            }}>
            {busy ? 'Submitting…' : 'Submit reference'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Q({ label, required, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '.8rem', color: '#0D2B45', fontWeight: 700, marginBottom: 8 }}>
        {label}{required && <span style={{ color: '#DC2626' }}> *</span>}
      </label>
      {children}
    </div>
  )
}

function RadioRow({ name, value, label, checked, onChange, disabled }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px',
      border: checked ? '1.5px solid #0B6E76' : '1px solid #E2E8F0',
      background: checked ? '#F0F9FA' : 'white',
      borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
      color: '#1A2A33', fontSize: '.9rem', fontWeight: checked ? 600 : 400,
    }}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} disabled={disabled} style={{ accentColor: '#0B6E76' }} />
      {label}
    </label>
  )
}

const S = {
  pageWrap: {
    minHeight: '100dvh', background: '#F8FAFC',
    padding: '2rem 1rem', fontFamily: 'Plus Jakarta Sans, sans-serif',
  },
  card: {
    maxWidth: 640, margin: '0 auto',
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
  h1: { fontSize: '1.6rem', color: '#0D2B45', margin: '0 0 12px', textAlign: 'left' },
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
