// Provider device / network check. Solo Chime meeting the provider joins
// alone to verify camera, mic, speakers, and connection before taking a
// real patient consult. Nothing recorded, no patient involved, no PHI.
//
// Why a dedicated route instead of a modal inside ProviderApp:
//   - Setups fail in specific rooms / on specific networks (rural clinic
//     wifi, provider's phone hotspot vs their laptop). A share-able URL
//     lets provider re-run from the exact device that will host the real
//     call, and lets support point them at the URL in a text.
//
// Auto-end at 5min so a distracted provider doesn't leak Chime minutes.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import {
  joinMeeting, toggleMute, toggleVideo, cycleCamera,
  listAudioInputs, switchAudioInput,
  listAudioOutputs, switchAudioOutput,
  listVideoInputs,
} from '../../lib/chime'

const NAVY = '#0D2B45'
const TEAL = '#0B6E76'
const FF   = 'Plus Jakarta Sans, sans-serif'
const TTL_MINUTES = 5

export default function ProviderTestCall() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('idle')   // idle | connecting | live | ended | error
  const [errorMsg, setErrorMsg] = useState('')
  const [muted, setMuted] = useState(false)
  const [videoOn, setVideoOn] = useState(true)
  const [network, setNetwork] = useState('good')
  const [volume, setVolume] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [devices, setDevices] = useState({ mics: [], cams: [], speakers: [] })
  const [currentIds, setCurrentIds] = useState({ mic: '', cam: '', speaker: '' })
  const [echoOn, setEchoOn] = useState(false)

  const videoRef = useRef(null)
  const audioRef = useRef(null)
  const handleRef = useRef(null)
  const meetingMetaRef = useRef(null)
  const autoEndTimerRef = useRef(null)
  const echoCleanupRef = useRef(null)

  const endTest = useCallback(async (reason = 'user') => {
    if (autoEndTimerRef.current) { clearTimeout(autoEndTimerRef.current); autoEndTimerRef.current = null }
    try { echoCleanupRef.current?.() } catch {}
    echoCleanupRef.current = null
    try { await handleRef.current?.leave() } catch {}
    handleRef.current = null
    const meta = meetingMetaRef.current
    if (meta?.MeetingId) {
      try {
        await apiFetch('/api/chime-meeting', {
          method: 'POST',
          body: JSON.stringify({ action: 'end-test', meetingId: meta.MeetingId, region: meta.region }),
        })
      } catch {}
    }
    meetingMetaRef.current = null
    setPhase('ended')
  }, [])

  const startTest = useCallback(async () => {
    setPhase('connecting'); setErrorMsg('')
    try {
      const r = await apiFetch('/api/chime-meeting', {
        method: 'POST',
        body: JSON.stringify({ action: 'create-test', ttl_minutes: TTL_MINUTES }),
      })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.error || `create-test failed (${r.status})`)
      meetingMetaRef.current = { MeetingId: body.Meeting?.MeetingId, region: body.region }

      const handle = await joinMeeting({
        meetingResponse: body,
        localVideoEl: videoRef.current,
        remoteVideoEls: [],
        audioEl: audioRef.current,
        onEvent: (ev) => {
          if (ev.type === 'started') setPhase('live')
          if (ev.type === 'connection-poor') setNetwork('poor')
          if (ev.type === 'connection-good') setNetwork('good')
        },
      })
      handleRef.current = handle

      // Mic volume meter — Chime exposes a per-attendee volume 0..1
      // observer. Wire it to the self attendee so provider sees their own
      // mic react in real time.
      try {
        const selfAttendeeId = body.Attendee?.AttendeeId
        handle.session.audioVideo.realtimeSubscribeToVolumeIndicator(
          selfAttendeeId,
          (_id, vol) => { setVolume(typeof vol === 'number' ? vol : 0) },
        )
      } catch (e) { console.warn('[test-call] volume subscribe:', e?.message) }

      const [mics, cams, speakers] = await Promise.all([
        listAudioInputs(handle.session),
        listVideoInputs(handle.session),
        listAudioOutputs(handle.session),
      ])
      setDevices({ mics, cams, speakers })
      setCurrentIds({
        mic: mics[0]?.deviceId || '',
        cam: cams[0]?.deviceId || '',
        speaker: speakers[0]?.deviceId || '',
      })

      autoEndTimerRef.current = setTimeout(() => { endTest('timeout') }, TTL_MINUTES * 60 * 1000)
    } catch (e) {
      console.error('[test-call] start failed:', e)
      setErrorMsg(e?.message || 'Could not start test call')
      setPhase('error')
    }
  }, [endTest])

  useEffect(() => () => { endTest('unmount') }, [endTest])

  const doMute = () => { if (handleRef.current) setMuted(toggleMute(handleRef.current.session)) }
  const doVideo = async () => { if (handleRef.current) setVideoOn(await toggleVideo(handleRef.current.session)) }
  const doFlip = async () => {
    if (!handleRef.current) return
    const next = await cycleCamera(handleRef.current.session, currentIds.cam)
    if (next) setCurrentIds(d => ({ ...d, cam: next }))
  }
  const pickMic = async (id) => {
    if (!handleRef.current) return
    if (await switchAudioInput(handleRef.current.session, id)) setCurrentIds(d => ({ ...d, mic: id }))
  }
  const pickCam = async (id) => {
    if (!handleRef.current) return
    try { await handleRef.current.session.audioVideo.startVideoInput(id); setCurrentIds(d => ({ ...d, cam: id })) }
    catch (e) { console.warn('[test-call] pickCam:', e?.message) }
  }
  const pickSpeaker = async (id) => {
    if (!handleRef.current) return
    if (await switchAudioOutput(handleRef.current.session, id)) setCurrentIds(d => ({ ...d, speaker: id }))
  }

  // Optional echo — Web Audio DelayNode. Off by default because ANY echo
  // path can loop back into the mic through the speaker and become
  // feedback screech. Toggle-on lets the provider hear themselves with a
  // 1s delay to confirm mic + speaker both work. Toggle-off tears down
  // cleanly so we don't leak audio contexts.
  const toggleEcho = async () => {
    if (echoOn) {
      try { echoCleanupRef.current?.() } catch {}
      echoCleanupRef.current = null
      setEchoOn(false)
      return
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      const ctx = new AC()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      const src = ctx.createMediaStreamSource(stream)
      const delay = ctx.createDelay(2.0); delay.delayTime.value = 1.0
      const gain = ctx.createGain(); gain.gain.value = 0.7
      src.connect(delay); delay.connect(gain); gain.connect(ctx.destination)
      echoCleanupRef.current = () => {
        try { src.disconnect() } catch {}
        try { delay.disconnect() } catch {}
        try { gain.disconnect() } catch {}
        try { stream.getTracks().forEach(t => t.stop()) } catch {}
        try { ctx.close() } catch {}
      }
      setEchoOn(true)
    } catch (e) {
      console.warn('[test-call] echo start failed:', e?.message)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0', fontFamily: FF, color: NAVY }}>
      <nav style={{ background: NAVY, color: 'white', padding: '.9rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1rem' }}>← Back</button>
        <div style={{ fontWeight: 700, fontSize: '1rem' }}>Test my setup</div>
        {phase === 'live' && (
          <span style={{
            marginLeft: 'auto', padding: '.25rem .625rem', borderRadius: 99, fontSize: '.75rem', fontWeight: 700,
            background: network === 'good' ? '#065F46' : '#B45309', color: 'white',
          }}>
            {network === 'good' ? '● Connection good' : '● Connection unstable'}
          </span>
        )}
      </nav>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '1.5rem 1.25rem' }}>
        {phase === 'idle' && (
          <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 16, padding: '1.5rem', textAlign: 'center' }}>
            <h1 style={{ fontFamily: 'Cormorant Garamond, serif', color: NAVY, margin: '0 0 .5rem', fontSize: '1.75rem', fontWeight: 600 }}>
              Test your camera, mic and network
            </h1>
            <p style={{ color: '#4B5563', fontSize: '.9375rem', lineHeight: 1.5, margin: '0 0 1.25rem' }}>
              This runs a solo call for up to {TTL_MINUTES} minutes so you can check your camera,
              microphone, speakers, and internet before you take your next patient.
              Nothing is recorded and no patient is involved.
            </p>
            <button onClick={startTest}
              style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 999, padding: '.9rem 2rem', fontWeight: 700, cursor: 'pointer', fontFamily: FF, fontSize: '1rem' }}>
              Start test call
            </button>
          </div>
        )}

        {phase === 'connecting' && (
          <div style={{ textAlign: 'center', padding: '3rem 0', color: '#6B7280' }}>Starting test call…</div>
        )}

        {phase === 'error' && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 12, padding: '1rem', color: '#991B1B', fontSize: '.9rem' }}>
            <strong>Couldn't start test call.</strong> {errorMsg}
            <div style={{ marginTop: '.75rem' }}>
              <button onClick={() => setPhase('idle')} style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 8, padding: '.5rem 1rem', fontWeight: 700, cursor: 'pointer', fontFamily: FF }}>Try again</button>
            </div>
          </div>
        )}

        {/* Video + audio elements render as soon as we start connecting so
            their refs are populated BEFORE joinMeeting binds Chime tiles.
            If we gate them on phase === 'live', the refs are null at
            join time → Chime's videoTileDidUpdate can't bind → no self
            video ever appears. Hidden with visibility instead of removed
            so refs stay stable across state changes. */}
        {(phase === 'connecting' || phase === 'live') && (
          <div style={{ visibility: phase === 'live' ? 'visible' : 'hidden', position: phase === 'live' ? 'static' : 'absolute', pointerEvents: phase === 'live' ? 'auto' : 'none' }}>
            <div style={{ background: '#000', borderRadius: 16, overflow: 'hidden', aspectRatio: '4 / 3', maxWidth: 360, margin: '0 auto' }}>
              <video ref={videoRef} autoPlay playsInline muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
            </div>

            <div style={{ margin: '1rem auto', maxWidth: 360 }}>
              <div style={{ fontSize: '.75rem', color: '#6B7280', marginBottom: 4 }}>Microphone level</div>
              <div style={{ height: 10, background: '#E5E7EB', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, Math.round(volume * 140))}%`, background: TEAL, transition: 'width .1s linear' }} />
              </div>
              <div style={{ fontSize: '.75rem', color: '#6B7280', marginTop: 6 }}>
                Speak — the bar should react. If it stays flat, pick a different mic in ⚙.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'center', flexWrap: 'wrap', margin: '.75rem 0 1rem' }}>
              <TestBtn onClick={doMute} label={muted ? 'Unmute' : 'Mute'} />
              <TestBtn onClick={doVideo} label={videoOn ? 'Camera off' : 'Camera on'} />
              <TestBtn onClick={doFlip} label="Flip camera" />
              <TestBtn onClick={() => setShowSettings(true)} label="⚙ Devices" />
              <TestBtn onClick={toggleEcho} label={echoOn ? 'Stop echo' : 'Hear yourself'} />
              <TestBtn onClick={() => endTest('user')} label="End test" danger />
            </div>

            <audio ref={audioRef} autoPlay />
          </div>
        )}

        {phase === 'ended' && (
          <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 16, padding: '1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: NAVY, marginBottom: '.5rem' }}>Test call ended</div>
            <div style={{ color: '#4B5563', fontSize: '.9375rem', marginBottom: '1rem' }}>
              You're all set. If anything didn't work, tap below to try again.
            </div>
            <button onClick={() => { setPhase('idle'); setVolume(0); setNetwork('good') }}
              style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 999, padding: '.75rem 1.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: FF }}>
              Run again
            </button>
          </div>
        )}
      </div>

      {showSettings && (
        <DeviceModal
          devices={devices} currentIds={currentIds}
          onPickMic={pickMic} onPickCam={pickCam} onPickSpeaker={pickSpeaker}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

function TestBtn({ onClick, label, danger }) {
  return (
    <button onClick={onClick}
      style={{
        background: danger ? '#DC2626' : 'white',
        color: danger ? 'white' : NAVY,
        border: danger ? 'none' : '1px solid #E2E8F0',
        borderRadius: 999, padding: '.55rem 1rem', fontWeight: 700, cursor: 'pointer',
        fontFamily: FF, fontSize: '.8125rem',
      }}>
      {label}
    </button>
  )
}

function DeviceModal({ devices, currentIds, onPickMic, onPickCam, onPickSpeaker, onClose }) {
  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(13,43,69,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 16, padding: '1.25rem', width: '100%', maxWidth: 420, fontFamily: FF }}>
        <div style={{ fontWeight: 700, color: NAVY, fontSize: '1rem', marginBottom: '.75rem' }}>Devices</div>
        <DevSel label="Microphone" value={currentIds.mic}      opts={devices.mics}     onChange={onPickMic} />
        <DevSel label="Camera"     value={currentIds.cam}      opts={devices.cams}     onChange={onPickCam} />
        <DevSel label="Speaker"    value={currentIds.speaker}  opts={devices.speakers} onChange={onPickSpeaker} />
        <div style={{ textAlign: 'right', marginTop: '.75rem' }}>
          <button onClick={onClose}
            style={{ background: TEAL, color: 'white', border: 'none', borderRadius: 8, padding: '.5rem 1.25rem', fontWeight: 700, cursor: 'pointer', fontFamily: FF }}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function DevSel({ label, value, opts, onChange }) {
  return (
    <label style={{ display: 'block', margin: '.5rem 0' }}>
      <div style={{ fontSize: '.75rem', color: '#6B7280', marginBottom: 4 }}>{label}</div>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '.55rem .75rem', borderRadius: 8, border: '1px solid #D1D5DB', fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.875rem' }}>
        {opts.length === 0 && <option value="">(no devices found)</option>}
        {opts.map(o => <option key={o.deviceId} value={o.deviceId}>{o.label}</option>)}
      </select>
    </label>
  )
}
