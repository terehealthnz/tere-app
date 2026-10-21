// /meet/:token — guest landing page for business meetings.
//
// Anonymous. Three phases:
//   1. Pre-join card: "Join meeting" button, shows title + scheduled time
//   2. Waiting room: polls /api/meeting-join every 4s until admitted
//   3. In-room: LiveKit video + Tere brand overlay
//
// Mirror of InterviewJoin.jsx but with a server-gated admission step
// — guest doesn't get a LiveKit token until the host clicks Admit in
// the Meetings admin tab.

import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { LiveKitRoom, VideoConference } from '@livekit/components-react'
import '@livekit/components-styles'
import InterviewBrandOverlay from '../components/InterviewBrandOverlay'

const POLL_MS = 4000

export default function MeetingJoin() {
  const { token: joinToken } = useParams()
  const navigate = useNavigate()
  // loading | ready | knocking | admitted | ended | denied | error
  const [state, setState]   = useState('loading')
  const [meta,  setMeta]    = useState(null)
  const [lk,    setLk]      = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const pollTimer = useRef(null)

  // Initial fetch — tells us meeting metadata, does not knock yet.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/meeting-join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: joinToken, peek: true }),
        })
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.status === 410) { setState(body.status === 'denied' ? 'denied' : 'ended'); return }
        if (res.status === 404) { setErrorMsg('Meeting link not found. Please re-check your invite email.'); setState('error'); return }
        if (!res.ok && res.status !== 202) {
          setErrorMsg(body.error || 'Could not open this meeting link.'); setState('error'); return
        }
        setMeta({ title: body.title, guestName: body.guestName, scheduledAt: body.scheduledAt, hostName: body.hostName })
        setState('ready')
      } catch (e) {
        if (!cancelled) { setErrorMsg(e.message || 'Network error'); setState('error') }
      }
    })()
    return () => { cancelled = true }
  }, [joinToken])

  // Polling loop — fires once state becomes 'knocking'.
  useEffect(() => {
    if (state !== 'knocking') return
    let cancelled = false
    async function tick() {
      try {
        const res = await fetch('/api/meeting-join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: joinToken, poll: true }),
        })
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.status === 410) { setState(body.status === 'denied' ? 'denied' : 'ended'); return }
        if (res.status === 200 && body.status === 'admitted') {
          setLk({ token: body.token, serverUrl: body.serverUrl, mock: !!body.mock })
          setState('admitted')
          return
        }
        // Still knocking → schedule another tick.
        pollTimer.current = setTimeout(tick, POLL_MS)
      } catch {
        pollTimer.current = setTimeout(tick, POLL_MS)
      }
    }
    pollTimer.current = setTimeout(tick, POLL_MS)
    return () => { cancelled = true; if (pollTimer.current) clearTimeout(pollTimer.current) }
  }, [state, joinToken])

  async function knock() {
    try {
      setState('knocking')
      await fetch('/api/meeting-join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: joinToken }),
      })
    } catch { /* polling loop will keep retrying anyway */ }
  }

  if (state === 'loading') {
    return (
      <div style={S.centered}>
        <div style={S.spinner} />
        <div style={{ color: '#6B7280' }}>Opening your meeting…</div>
      </div>
    )
  }

  if (state === 'ended' || state === 'denied') {
    const title = state === 'denied' ? 'Entry not permitted' : 'This meeting has ended'
    const body  = state === 'denied'
      ? 'The host did not grant entry. If this is a mistake, please reply to the invite email.'
      : 'If you think this is a mistake or need to reschedule, reply to the invite email or contact hello@terehealth.co.nz.'
    return (
      <div style={S.centered}>
        <h1 style={{ fontSize: '1.5rem', color: '#0D2B45', marginBottom: 12 }}>{title}</h1>
        <p style={{ color: '#6B7280', fontSize: '.95rem', maxWidth: 420, textAlign: 'center' }}>{body}</p>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={S.centered}>
        <h1 style={{ fontSize: '1.4rem', color: '#991B1B', marginBottom: 12 }}>Meeting link not valid</h1>
        <p style={{ color: '#6B7280', fontSize: '.95rem', maxWidth: 420, textAlign: 'center' }}>{errorMsg}</p>
      </div>
    )
  }

  if (state === 'ready') {
    const when = meta?.scheduledAt
      ? new Date(meta.scheduledAt).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'full', timeStyle: 'short' })
      : null
    return (
      <div style={S.centered}>
        <div style={S.brandPill}>Tere</div>
        <h1 style={{ fontSize: '1.5rem', color: '#0D2B45', marginBottom: 8 }}>Kia ora {meta?.guestName || 'there'}!</h1>
        {meta?.title && <p style={{ color: '#374151', fontSize: '1rem', fontWeight: 600, marginBottom: 4, textAlign: 'center' }}>{meta.title}</p>}
        {meta?.hostName && <p style={{ color: '#6B7280', fontSize: '.9rem', marginBottom: 4 }}>With <strong style={{ color: '#0D2B45' }}>{meta.hostName}</strong></p>}
        {when && <p style={{ color: '#6B7280', fontSize: '.9rem', marginBottom: 24 }}>Scheduled: <strong style={{ color: '#0D2B45' }}>{when}</strong> (NZ time)</p>}
        <button onClick={knock} style={S.joinBtn}>🎥 Join meeting</button>
        <p style={{ color: '#9CA3AF', fontSize: '.8rem', maxWidth: 420, textAlign: 'center', marginTop: 24 }}>
          When you click Join you'll land in a brief waiting room — we'll let you in as soon as we're ready.
          Your browser will ask for camera and microphone permission; please allow both.
        </p>
      </div>
    )
  }

  if (state === 'knocking') {
    return (
      <div style={S.centered}>
        <div style={S.brandPill}>Tere</div>
        <div style={S.spinner} />
        <h1 style={{ fontSize: '1.35rem', color: '#0D2B45', marginBottom: 10, marginTop: 16 }}>Waiting for the host to let you in…</h1>
        <p style={{ color: '#6B7280', fontSize: '.95rem', maxWidth: 420, textAlign: 'center' }}>
          {meta?.hostName ? `${meta.hostName} will` : "We'll"} admit you to the meeting in a moment. Please keep this tab open.
        </p>
      </div>
    )
  }

  // admitted — full-screen LiveKit room
  const headerTitle    = meta?.title || 'Meeting'
  const headerSubtitle = meta?.hostName ? `Hosted by ${meta.hostName}` : null
  if (lk?.mock) {
    return (
      <div style={S.centered}>
        <h1 style={{ color: '#991B1B' }}>Demo mode</h1>
        <p style={{ color: '#6B7280' }}>LiveKit credentials not configured. Video won't start.</p>
      </div>
    )
  }
  return (
    <div style={{ height: '100dvh', background: '#000', position: 'relative' }}>
      <LiveKitRoom
        token={lk.token}
        serverUrl={lk.serverUrl}
        video={true}
        audio={true}
        data-lk-theme="default"
        style={{ height: '100dvh' }}
        onDisconnected={() => navigate('/interview-ended')}
      >
        <VideoConference />
      </LiveKitRoom>
      <InterviewBrandOverlay title={headerTitle} subtitle={headerSubtitle} />
    </div>
  )
}

const S = {
  centered: {
    minHeight: '100dvh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: '2rem',
    background: '#F8FAFC', fontFamily: 'Plus Jakarta Sans, sans-serif',
  },
  spinner: {
    width: 36, height: 36, border: '3px solid #0B6E76', borderTopColor: 'transparent',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem',
  },
  brandPill: {
    background: '#0D2B45', color: 'white', padding: '10px 24px', borderRadius: 999,
    fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.2rem', marginBottom: 24,
  },
  joinBtn: {
    background: '#0B6E76', color: 'white', border: 'none', padding: '14px 32px',
    borderRadius: 99, fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
    fontFamily: 'Plus Jakarta Sans, sans-serif',
  },
}
