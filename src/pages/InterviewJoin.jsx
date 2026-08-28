// /interview/:token — applicant landing page for video interviews.
//
// Anonymous access — the token in the URL is the only credential. Server
// resolves it via POST /api/interview-join and returns a short-lived
// LiveKit access token so the applicant joins the interview room.
//
// Pre-join screen shows applicant's name (for confirmation) + a Join
// button. On join, renders <LiveKitRoom> with VideoConference — same
// stack as the patient consult, minus the PHI chrome.

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { LiveKitRoom, VideoConference } from '@livekit/components-react'
import '@livekit/components-styles'

export default function InterviewJoin() {
  const { token: joinToken } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState('loading')  // loading | ready | joining | joined | ended | error
  const [meta, setMeta]   = useState(null)       // { displayName, scheduledAt, roomName }
  const [lk,   setLk]     = useState(null)       // { token, serverUrl }
  const [errorMsg, setErrorMsg] = useState('')

  // Resolve the join token → interview metadata + LiveKit token.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/interview-join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: joinToken }),
        })
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.status === 410) {
          setState('ended')
          return
        }
        if (!res.ok || !body.roomName) {
          setErrorMsg(body.error || 'Could not open this interview link.')
          setState('error')
          return
        }
        setMeta({ displayName: body.displayName, scheduledAt: body.scheduledAt, roomName: body.roomName })
        setLk({ token: body.token, serverUrl: body.serverUrl, mock: !!body.mock })
        setState('ready')
      } catch (e) {
        if (!cancelled) { setErrorMsg(e.message || 'Network error'); setState('error') }
      }
    })()
    return () => { cancelled = true }
  }, [joinToken])

  if (state === 'loading') {
    return (
      <div style={S.centered}>
        <div style={{ width: 36, height: 36, border: '3px solid var(--teal, #0B6E76)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
        <div style={{ color: '#6B7280' }}>Opening your interview…</div>
</div>
    )
  }

  if (state === 'ended') {
    return (
      <div style={S.centered}>
        <h1 style={{ fontSize: '1.5rem', color: '#0D2B45', marginBottom: 12 }}>This interview has ended</h1>
        <p style={{ color: '#6B7280', fontSize: '.95rem', maxWidth: 380, textAlign: 'center' }}>
          If you think this is a mistake or need to reschedule, reply to the invite email or contact <a href="mailto:hello@terehealth.co.nz" style={{ color: '#0B6E76' }}>hello@terehealth.co.nz</a>.
        </p>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={S.centered}>
        <h1 style={{ fontSize: '1.4rem', color: '#991B1B', marginBottom: 12 }}>Interview link not valid</h1>
        <p style={{ color: '#6B7280', fontSize: '.95rem', maxWidth: 380, textAlign: 'center' }}>{errorMsg}</p>
        <p style={{ color: '#6B7280', fontSize: '.85rem', maxWidth: 380, textAlign: 'center', marginTop: 16 }}>
          If your invite link isn't working, reply to the invite email — we'll send you a fresh one.
        </p>
      </div>
    )
  }

  if (state === 'ready' || state === 'joining') {
    const when = meta?.scheduledAt
      ? new Date(meta.scheduledAt).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'full', timeStyle: 'short' })
      : null
    return (
      <div style={S.centered}>
        <div style={{ background: '#0D2B45', color: 'white', padding: '10px 24px', borderRadius: 999, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.2rem', marginBottom: 24 }}>Tere</div>
        <h1 style={{ fontSize: '1.5rem', color: '#0D2B45', marginBottom: 8 }}>Kia ora {meta?.displayName || 'there'}!</h1>
        <p style={{ color: '#374151', fontSize: '1rem', marginBottom: 4 }}>You're about to join your Tere Health interview.</p>
        {when && <p style={{ color: '#6B7280', fontSize: '.9rem', marginBottom: 24 }}>Scheduled: <strong style={{ color: '#0D2B45' }}>{when}</strong> (NZ time)</p>}
        {lk?.mock && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 8, fontSize: '.85rem', marginBottom: 20, maxWidth: 420 }}>
            Demo mode — LiveKit credentials not configured. Video won't start.
          </div>
        )}
        <button
          disabled={!lk?.token || state === 'joining'}
          onClick={() => setState('joined')}
          style={{
            background: lk?.token ? '#0B6E76' : '#94A3B8',
            color: 'white', border: 'none', padding: '14px 32px',
            borderRadius: 99, fontSize: '1rem', fontWeight: 700,
            cursor: lk?.token ? 'pointer' : 'not-allowed',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}>
          🎥 Join interview
        </button>
        <p style={{ color: '#9CA3AF', fontSize: '.8rem', maxWidth: 380, textAlign: 'center', marginTop: 24 }}>
          When you click Join, your browser will ask for camera and microphone permission. Please allow both.
        </p>
      </div>
    )
  }

  // joined — full-screen LiveKit room
  return (
    <div style={{ height: '100dvh', background: '#000' }}>
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
}
