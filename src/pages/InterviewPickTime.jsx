// /interview/pick/:token — applicant picks one of N proposed interview times.
//
// Anonymous access — the token in the URL is the only credential. The endpoint
// POST /api/interview-join { token } returns { needsSlotPick: true, proposedSlots,
// durationMinutes, displayName } when the interview is still in status='proposed'.
// After the applicant confirms a slot, POST /api/job-applications?action=pick_slot
// { token, slot } records the pick, sends both-side confirmation emails with .ics,
// and redirects to the normal /interview/:token join page.

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

function fmtNz(iso) {
  return new Date(iso).toLocaleString('en-NZ', {
    timeZone: 'Pacific/Auckland', dateStyle: 'full', timeStyle: 'short',
  })
}

export default function InterviewPickTime() {
  const { token } = useParams()
  const navigate  = useNavigate()
  const [state, setState] = useState('loading')  // loading | ready | already | ended | error | submitting | picked
  const [meta,  setMeta]  = useState(null)       // { displayName, proposedSlots, durationMinutes }
  const [selected,  setSelected]  = useState('')
  const [errorMsg,  setErrorMsg]  = useState('')
  const [confirmed, setConfirmed] = useState(null)  // { scheduledAt }

  // Resolve the token → interview metadata.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/interview-join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.status === 410) { setState('ended'); return }
        if (!res.ok) {
          setErrorMsg(body.error || 'Could not open this link.')
          setState('error')
          return
        }
        // If the interview isn't in proposed state, jump straight to the
        // join page — nothing to pick.
        if (!body.needsSlotPick) {
          navigate(`/interview/${token}`, { replace: true })
          return
        }
        setMeta({
          displayName:     body.displayName,
          proposedSlots:   body.proposedSlots || [],
          durationMinutes: body.durationMinutes || 30,
        })
        setState('ready')
      } catch (e) {
        if (!cancelled) { setErrorMsg(e.message || 'Network error'); setState('error') }
      }
    })()
    return () => { cancelled = true }
  }, [token, navigate])

  async function submit() {
    if (!selected) return
    setState('submitting')
    setErrorMsg('')
    try {
      const res = await fetch('/api/job-applications?action=pick_slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, slot: selected }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 409 && body?.status && body.status !== 'proposed') {
        setState('already')
        return
      }
      if (!res.ok) {
        setErrorMsg(body.error || 'Could not save your pick — please try again.')
        setState('ready')
        return
      }
      setConfirmed({ scheduledAt: body.scheduledAt })
      setState('picked')
    } catch (e) {
      setErrorMsg(e.message || 'Network error')
      setState('ready')
    }
  }

  if (state === 'loading') {
    return (
      <div style={S.centered}>
        <div style={S.spinner} />
        <div style={{ color: '#6B7280' }}>Loading your interview…</div>
      </div>
    )
  }

  if (state === 'ended') {
    return (
      <div style={S.centered}>
        <h1 style={S.h1}>This interview link has ended</h1>
        <p style={S.body}>
          If you think this is a mistake or need to reschedule, reply to your invite email or contact{' '}
          <a href="mailto:hello@terehealth.co.nz" style={{ color: '#0B6E76' }}>hello@terehealth.co.nz</a>.
        </p>
      </div>
    )
  }

  if (state === 'already') {
    return (
      <div style={S.centered}>
        <h1 style={S.h1}>Already booked</h1>
        <p style={S.body}>
          A time has already been picked for this interview. Check your email for the confirmation, or use your original join link when it's time.
        </p>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={S.centered}>
        <h1 style={{ ...S.h1, color: '#991B1B' }}>Link not valid</h1>
        <p style={S.body}>{errorMsg}</p>
        <p style={{ ...S.body, marginTop: 16, fontSize: '.85rem' }}>
          Reply to your invite email and we'll send a fresh link.
        </p>
      </div>
    )
  }

  if (state === 'picked') {
    return (
      <div style={S.centered}>
        <div style={S.brandChip}>Tere</div>
        <h1 style={S.h1}>You're booked in </h1>
        <p style={{ ...S.body, marginBottom: 8 }}>Kia ora {meta?.displayName?.split(' ')[0] || 'there'} — confirmed for:</p>
        <p style={{ color: '#0D2B45', fontWeight: 700, fontSize: '1.05rem', marginBottom: 20 }}>
          {fmtNz(confirmed.scheduledAt)} (NZ time)
        </p>
        <p style={{ ...S.body, fontSize: '.9rem', maxWidth: 420 }}>
          A calendar invite is on its way to your email. When it's time, use the join link in that email (or reply if anything changes).
        </p>
      </div>
    )
  }

  // ready | submitting
  const busy = state === 'submitting'
  return (
    <div style={S.centered}>
      <div style={S.brandChip}>Tere</div>
      <h1 style={S.h1}>Kia ora {meta?.displayName?.split(' ')[0] || 'there'}!</h1>
      <p style={{ ...S.body, marginBottom: 4 }}>Pick a time that suits for your Tere Health interview.</p>
      <p style={{ color: '#6B7280', fontSize: '.85rem', marginBottom: 20 }}>
        {meta?.durationMinutes || 30} minutes · times shown in NZ time
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 460, width: '100%', marginBottom: 20 }}>
        {(meta?.proposedSlots || []).map(s => {
          const isSel = s === selected
          return (
            <button
              key={s}
              onClick={() => setSelected(s)}
              disabled={busy}
              style={{
                textAlign: 'left',
                padding: '14px 18px',
                border: isSel ? '2px solid #0B6E76' : '1px solid #E2E8F0',
                background: isSel ? '#F0F9FA' : 'white',
                borderRadius: 12,
                cursor: busy ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                color: '#0D2B45',
                fontSize: '.98rem',
                fontWeight: isSel ? 700 : 500,
                transition: 'background .1s, border-color .1s',
              }}>
              {fmtNz(s)}
            </button>
          )
        })}
      </div>

      {errorMsg && (
        <div style={{ color: '#991B1B', fontSize: '.85rem', marginBottom: 12 }}>{errorMsg}</div>
      )}

      <button
        disabled={!selected || busy}
        onClick={submit}
        style={{
          background: selected && !busy ? '#0B6E76' : '#94A3B8',
          color: 'white', border: 'none', padding: '14px 32px',
          borderRadius: 99, fontSize: '1rem', fontWeight: 700,
          cursor: selected && !busy ? 'pointer' : 'not-allowed',
          fontFamily: 'inherit',
        }}>
        {busy ? 'Confirming…' : 'Confirm this time'}
      </button>

      <p style={{ color: '#9CA3AF', fontSize: '.8rem', maxWidth: 420, textAlign: 'center', marginTop: 24 }}>
        You'll get a confirmation email with a calendar invite and a join link.
      </p>
    </div>
  )
}

const S = {
  centered: {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    background: '#F8FAFC',
    fontFamily: 'Plus Jakarta Sans, sans-serif',
  },
  brandChip: {
    background: '#0D2B45', color: 'white',
    padding: '10px 24px', borderRadius: 999,
    fontFamily: 'Georgia, serif', fontStyle: 'italic',
    fontSize: '1.2rem', marginBottom: 24,
  },
  h1: { fontSize: '1.5rem', color: '#0D2B45', marginBottom: 12, textAlign: 'center' },
  body: { color: '#374151', fontSize: '.95rem', maxWidth: 460, textAlign: 'center', lineHeight: 1.6, margin: 0 },
  spinner: {
    width: 36, height: 36, border: '3px solid #0B6E76',
    borderTopColor: 'transparent', borderRadius: '50%',
    animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem',
  },
}
