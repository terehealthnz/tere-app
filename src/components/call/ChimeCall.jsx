// ChimeCall — drop-in replacement for the LiveKitRoom + VideoConference
// wrapper used in PatientCall.jsx, ProviderConsult.jsx, and
// FloatingCallWidget.jsx. Rendered behind the useChimeSdk() feature flag
// so LiveKit path stays intact until we're confident in Chime.
//
// Simple 2-party layout: remote video fills the frame, local video is a
// small overlay in the corner. Control bar at the bottom: mute, camera,
// leave. Matches the visual language patients + providers are already
// used to on the LiveKit path.
//
// Props:
//   role            'patient' | 'provider'
//   consultationId  UUID — used to call /api/chime-meeting server endpoint
//   onEnded         () => void — called when leave() completes or session drops
//   overlay         ReactNode — optional children rendered on top (subtitles etc)
//   compact         boolean — smaller control bar (FloatingCallWidget)

import { useEffect, useRef, useState, useCallback } from 'react'
import { createOrJoinMeeting, joinMeeting, endMeeting, toggleMute, toggleVideo, startScreenShare, stopScreenShare } from '../../lib/chime'
import { apiFetch } from '../../lib/api'

const TEAL = '#0B6E76'
const NAVY = '#0D2B45'

export default function ChimeCall({
  role, consultationId,
  onEnded, onPatientHere, onAudioElReady,
  overlay,
  compact = false,
  subtitlesAvailable = false,
  subtitlesOn = false,
  onToggleSubtitles,
  // Source-language picker (matches FloatingCallWidget's shape). Lets the
  // provider override the patient's assumed language mid-call — useful
  // when triage-detected language doesn't match what the patient actually
  // speaks. Only shown when subtitlesAvailable + subtitlesOn.
  subtitleLanguages = [],
  currentSubtitleLang = null,
  onChangeSubtitleLang,
  // Provider-only PSTN dial. When patientPhone is set (E.164), the control
  // bar shows a 📱 Ring phone button and a 10s auto-dial timer kicks in if
  // the patient hasn't joined the Chime meeting. Both call /api/chime-dial
  // which places an outbound PSTN call via Chime SMA and bridges the
  // patient's phone audio into the running meeting. Endpoint returns 500
  // when CHIME_SMA_ID / CHIME_SMA_FROM_NUMBER env vars aren't set — we
  // surface that as a toast so the provider knows to fall through to SMS.
  patientPhone = null,
  autoDialAfterMs = 10000,
  // Audio-only default. When true, we skip starting the local video tile at
  // join — patient/provider can turn video on mid-call via the Camera button.
  // Set by ProviderConsult / PatientCall when consultation_type is phone-like.
  audioOnly = false,
  // Provider-ready gate. Patient side only. When false, we show
  // "Waiting for the doctor…" instead of the "Start call" gesture button —
  // prevents patients from hammering the 409 "meeting doesn't exist yet"
  // when the provider hasn't clicked Call yet.
  providerReady = true,
}) {
  const localVideoRef  = useRef(null)
  const remoteVideoRef = useRef(null)
  const audioRef       = useRef(null)
  const sessionRef     = useRef(null)   // { session, leave }
  const endedRef       = useRef(false)  // guard against double-leave
  const heartbeatRef   = useRef(null)   // patient-side setInterval id
  const patientHereFiredRef = useRef(false)
  const audioElReadyFiredRef = useRef(false)

  // Mobile Safari + iOS Chrome require a user gesture before we can start
  // getUserMedia. Autoplaying WebRTC on mount silently fails the audio-
  // permission prompt. We detect mobile and gate the join behind a "Tap to
  // start" button, then it's the click handler that fires connect().
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  const [status, setStatus]   = useState(isMobile ? 'gesture-required' : 'connecting') // gesture-required | connecting | live | ended | error
  const [errorMsg, setErrorMsg] = useState(null)
  const [muted, setMuted]     = useState(false)
  // Video off by default when audioOnly is set. Camera button in the
  // control bar turns it on mid-call.
  const [videoOn, setVideoOn] = useState(!audioOnly)
  // Screenshare is one-way (provider → patient); provider toggles it via
  // the 🖥 button. Patient side doesn't render the button so this stays false.
  const [sharing, setSharing] = useState(false)
  // Network health from Chime SDK observer. 'poor' surfaces a banner both
  // sides can see. 'good' hides it. Chime emits these on live packet-loss +
  // jitter metrics — better signal than raw RTT.
  const [network, setNetwork] = useState('good')
  // PSTN dial state — 'idle' | 'dialling' | 'error'. Auto-dial fires once
  // at autoDialAfterMs unless patient joined first. autoDialFiredRef guards
  // against double-fire (manual click + timer firing back-to-back).
  const [dialState, setDialState] = useState('idle')
  const [dialError, setDialError] = useState(null)
  const autoDialFiredRef = useRef(false)
  const autoDialTimerRef = useRef(null)

  const doConnect = useCallback(async () => {
    setStatus('connecting')
    try {
      const meetingResponse = await createOrJoinMeeting({ role, consultationId })
      const handle = await joinMeeting({
        meetingResponse,
        localVideoEl:   localVideoRef.current,
        remoteVideoEls: [remoteVideoRef.current],
        audioEl:        audioRef.current,
        audioOnly,
        onEvent: (ev) => {
          if (ev.type === 'started') {
            setStatus('live')
            // Patient-side presence: fire an immediate heartbeat so provider
            // queue sees a fresh last_seen_at, then poll every 15s while live.
            // First heartbeat also stamps patient_joined_at server-side.
            if (role === 'patient' && consultationId) {
              const beat = () => {
                apiFetch(`/api/patient-heartbeat?id=${encodeURIComponent(consultationId)}`, { method: 'POST' })
                  .catch(() => {})
              }
              beat()
              heartbeatRef.current = setInterval(beat, 15000)
            }
            // Provider-side auto-dial timer. Fires once at autoDialAfterMs
            // if the patient hasn't joined the Chime meeting yet — mirrors
            // the previous LiveKit-SIP behaviour. Cancelled when the first
            // attendee arrives (see attendee-joined branch above) or when
            // the component unmounts.
            if (role === 'provider' && patientPhone && !autoDialFiredRef.current) {
              autoDialTimerRef.current = setTimeout(() => {
                if (patientHereFiredRef.current) return
                autoDialFiredRef.current = true
                doPstnDial()
              }, autoDialAfterMs)
            }
          }
          if (ev.type === 'stopped')       { setStatus('ended'); if (!endedRef.current) { endedRef.current = true; onEnded?.() } }
          if (ev.type === 'connection-poor') setNetwork('poor')
          if (ev.type === 'connection-good') setNetwork('good')
          // Provider-side presence: first time a non-self attendee joins,
          // notify the parent so patientHere flips true (drives return-to-
          // queue button state + suppresses any lingering fallback dial).
          if (ev.type === 'attendee-joined' && role === 'provider') {
            if (!patientHereFiredRef.current) {
              patientHereFiredRef.current = true
              try { onPatientHere?.() } catch {}
            }
            // Patient joined — kill the auto-dial timer if still pending.
            if (autoDialTimerRef.current) {
              clearTimeout(autoDialTimerRef.current)
              autoDialTimerRef.current = null
            }
          }
        },
      })
      sessionRef.current = handle
    } catch (e) {
      console.error('[ChimeCall] connect failed:', e)
      setStatus('error')
      setErrorMsg(e?.status === 409
        ? 'The provider hasn’t started the call yet — hang on a moment and try again.'
        : e?.message || 'Failed to connect')
    }
  }, [role, consultationId, onEnded])

  // Desktop auto-connects on mount. Mobile waits for tap. On the patient
  // side we also hold off until providerReady flips true — no point trying
  // to join a meeting the provider hasn't created yet (would 409).
  useEffect(() => {
    if (role === 'patient' && !providerReady) return
    if (!isMobile) doConnect()
    return () => {
      const h = sessionRef.current
      if (h) { h.leave().catch(() => {}); sessionRef.current = null }
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
      if (autoDialTimerRef.current) { clearTimeout(autoDialTimerRef.current); autoDialTimerRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultationId, role, providerReady])

  const doMute = useCallback(() => {
    const h = sessionRef.current
    if (!h) return
    setMuted(toggleMute(h.session))
  }, [])

  const doVideo = useCallback(async () => {
    const h = sessionRef.current
    if (!h) return
    setVideoOn(await toggleVideo(h.session))
  }, [])

  const doShare = useCallback(async () => {
    const h = sessionRef.current
    if (!h) return
    if (sharing) { await stopScreenShare(h.session); setSharing(false) }
    else         { const ok = await startScreenShare(h.session); setSharing(ok) }
  }, [sharing])

  // PSTN dial. Called manually by the 📱 button and automatically by the
  // 10s timer if the patient hasn't joined. Idempotent — autoDialFiredRef
  // + dialState guard against firing twice. Server returns 500 when the
  // SMA env vars aren't set; we surface that as an inline error so the
  // provider can fall back to SMS or dialling directly from their own phone.
  const doPstnDial = useCallback(async () => {
    if (!consultationId || dialState === 'dialling') return
    setDialState('dialling')
    setDialError(null)
    try {
      const r = await apiFetch('/api/chime-dial', {
        method: 'POST',
        body: JSON.stringify({ consultationId }),
      })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.error || `Dial failed (${r.status})`)
      setDialState('idle')
    } catch (e) {
      console.error('[chime-dial] failed:', e?.message)
      setDialState('error')
      setDialError(e?.message || 'Could not dial patient')
    }
  }, [consultationId, dialState])

  const doLeave = useCallback(async () => {
    const h = sessionRef.current
    if (h) { try { await h.leave() } catch {} }
    // Provider deletes the meeting on the server too; patient just leaves.
    if (role === 'provider' && consultationId) {
      try { await endMeeting({ consultationId }) } catch (e) { console.warn('[chime] endMeeting:', e?.message) }
    }
    if (!endedRef.current) { endedRef.current = true; onEnded?.() }
    setStatus('ended')
  }, [role, consultationId, onEnded])

  const btn = {
    background: 'rgba(255,255,255,.12)', color: 'white',
    border: '1px solid rgba(255,255,255,.25)',
    borderRadius: 99, padding: compact ? '6px 10px' : '10px 16px',
    fontSize: compact ? '.75rem' : '.875rem', fontWeight: 700,
    cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif',
  }
  const dangerBtn = { ...btn, background: '#DC2626', borderColor: '#DC2626' }
  const activeBtn = { ...btn, background: 'rgba(255,255,255,.28)' }

  return (
    <div style={{
      position: 'relative', height: '100%', width: '100%',
      background: '#000', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Remote video fills */}
      <video
        ref={remoteVideoRef}
        autoPlay playsInline
        style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}
      />
      {/* PSTN dial error toast — surfaces when /api/chime-dial fails.
          Most common cause pre-launch: SMA env vars not set → server
          returns 500. Provider dismisses by tapping X. Auto-clears
          when a new dial attempt starts. */}
      {dialState === 'error' && dialError && (
        <div style={{
          position: 'absolute', top: 12, left: 12, right: 12, zIndex: 6,
          background: 'rgba(220,38,38,.95)', color: 'white',
          padding: '10px 12px', borderRadius: 10,
          fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: '.8125rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span>📱 <strong>Couldn't ring phone:</strong> {dialError}</span>
          <button
            onClick={() => { setDialState('idle'); setDialError(null) }}
            style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1rem' }}>
            ✕
          </button>
        </div>
      )}
      {/* Network-poor banner — surfaces Chime's connection-poor observer
          event on both sides so the provider knows to switch to phone or
          the patient knows why the video is stuttering. Auto-hides when
          Chime reports connection-good. */}
      {status === 'live' && network === 'poor' && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
          background: '#DC2626', color: 'white', textAlign: 'center',
          padding: '6px 12px', fontFamily: 'Plus Jakarta Sans, sans-serif',
          fontSize: compact ? '.6875rem' : '.8125rem', fontWeight: 700,
          paddingTop: 'calc(6px + env(safe-area-inset-top, 0px))',
        }}>
          ⚠ Connection unstable — audio/video may drop briefly
        </div>
      )}
      {/* Hidden audio sink for remote audio mix. Also captureStream'd by
          the scribe recorder so both sides land in the transcript. */}
      <audio
        ref={el => {
          audioRef.current = el
          if (el && !audioElReadyFiredRef.current) {
            audioElReadyFiredRef.current = true
            try { onAudioElReady?.(el) } catch {}
          }
        }}
        autoPlay
      />

      {/* Local self-view overlay */}
      <video
        ref={localVideoRef}
        autoPlay playsInline muted
        style={{
          position: 'absolute',
          top: compact ? 8 : 16, right: compact ? 8 : 16,
          width:  compact ? 96 : 160,
          height: compact ? 128 : 200,
          objectFit: 'cover',
          borderRadius: 10,
          border: '2px solid rgba(255,255,255,.35)',
          background: '#222',
          zIndex: 3,
        }}
      />

      {/* Status overlay while connecting or on error */}
      {status !== 'live' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 4,
          background: 'rgba(0,0,0,.7)', color: 'white',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 12, fontFamily: 'Plus Jakarta Sans, sans-serif', padding: 20, textAlign: 'center',
        }}>
          {status === 'gesture-required' && !providerReady && (<>
            <div style={{ width: 48, height: 48, border: '3px solid rgba(255,255,255,.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>Waiting for the doctor</div>
            <div style={{ fontSize: '.875rem', color: 'rgba(255,255,255,.85)', maxWidth: 320 }}>
              Please stay on this page. We'll enable the "Start call" button as soon as the doctor calls you.
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </>)}
          {status === 'gesture-required' && providerReady && (<>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{audioOnly ? 'Your doctor is calling' : 'Ready to see the doctor?'}</div>
            <div style={{ fontSize: '.875rem', color: 'rgba(255,255,255,.85)', maxWidth: 320 }}>
              {audioOnly
                ? 'Tap below to answer. Your phone will ask for microphone — please allow.'
                : 'Tap below to start the call. Your phone will ask for camera and microphone — please allow both.'}
            </div>
            <button
              onClick={doConnect}
              style={{ ...btn, background: TEAL, borderColor: TEAL, marginTop: 8, padding: '14px 32px', fontSize: '1rem' }}>
              📞 {audioOnly ? 'Answer' : 'Start call'}
            </button>
          </>)}
          {status === 'connecting' && (<>
            <div style={{ width: 48, height: 48, border: '3px solid rgba(255,255,255,.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <div style={{ fontSize: '1rem', fontWeight: 700 }}>Connecting…</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </>)}
          {status === 'error' && (<>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#FCA5A5' }}>Couldn't connect</div>
            <div style={{ fontSize: '.875rem', color: 'rgba(255,255,255,.85)', maxWidth: 320 }}>{errorMsg}</div>
            <button onClick={doConnect} style={{ ...btn, background: TEAL, borderColor: TEAL, marginTop: 8 }}>Try again</button>
          </>)}
          {status === 'ended' && (
            <div style={{ fontSize: '1rem', fontWeight: 700 }}>Call ended</div>
          )}
        </div>
      )}

      {/* Control bar */}
      {status === 'live' && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 5,
          padding: compact ? '10px 12px' : '18px 24px',
          paddingBottom: `calc(${compact ? 10 : 18}px + env(safe-area-inset-bottom, 0px))`,
          background: 'linear-gradient(to top, rgba(0,0,0,.85), rgba(0,0,0,0))',
          display: 'flex', justifyContent: 'center', gap: compact ? 8 : 14,
        }}>
          <button onClick={doMute}    style={muted ? activeBtn : btn}    title={muted ? 'Unmute' : 'Mute'}>
            {muted ? '🔇 Muted' : '🎙️ Mic'}
          </button>
          <button onClick={doVideo}   style={videoOn ? btn : activeBtn}  title={videoOn ? 'Turn off camera' : 'Turn on camera'}>
            {videoOn ? '📷 Camera' : '📷 Off'}
          </button>
          {role === 'provider' && (
            <button
              onClick={doShare}
              style={sharing ? activeBtn : btn}
              title={sharing ? 'Stop sharing screen' : 'Share screen (show wound-care, discharge instructions, etc.)'}>
              {sharing ? '🖥 Sharing ✓' : '🖥 Share'}
            </button>
          )}
          {role === 'provider' && patientPhone && (
            <button
              onClick={doPstnDial}
              disabled={dialState === 'dialling'}
              style={{
                ...(dialState === 'dialling' ? activeBtn : btn),
                opacity: dialState === 'dialling' ? .7 : 1,
              }}
              title={
                dialState === 'dialling' ? 'Dialling patient\'s phone…' :
                dialState === 'error'    ? `Dial failed: ${dialError || 'unknown'}` :
                'Ring the patient\'s phone (bridges into this call)'
              }>
              {dialState === 'dialling' ? '📱 Ringing…' : '📱 Ring phone'}
            </button>
          )}
          {typeof onToggleSubtitles === 'function' && (
            <button
              onClick={() => subtitlesAvailable && onToggleSubtitles()}
              disabled={!subtitlesAvailable}
              style={{
                ...(subtitlesOn ? activeBtn : btn),
                opacity: subtitlesAvailable ? 1 : 0.5,
                cursor: subtitlesAvailable ? 'pointer' : 'not-allowed',
              }}
              title={
                !subtitlesAvailable
                  ? 'Subtitles only apply when the patient speaks a non-English language.'
                  : subtitlesOn ? 'Hide subtitles' : 'Show subtitles'
              }>
              {subtitlesOn ? '💬 Subtitles ✓' : '💬 Subtitles'}
            </button>
          )}
          {subtitleLanguages.length > 0 && typeof onChangeSubtitleLang === 'function' && (
            <select
              value={currentSubtitleLang || 'en'}
              onChange={(e) => onChangeSubtitleLang(e.target.value)}
              title="Patient's spoken language (source for subtitles). Pick a non-English language to enable subtitles."
              style={{
                background: 'rgba(255,255,255,.12)', color: 'white',
                border: '1px solid rgba(255,255,255,.25)',
                borderRadius: 99, padding: compact ? '6px 8px' : '8px 12px',
                fontSize: compact ? '.75rem' : '.8125rem', fontWeight: 700,
                cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif',
              }}
            >
              {/* English default lets the provider revert an accidental
                  override without leaving the call. */}
              <option value="en" style={{ background: '#0D1117' }}>🇬🇧 English</option>
              {subtitleLanguages.map(l => (
                <option key={l.code} value={l.code} style={{ background: '#0D1117' }}>
                  {l.flag} {l.name}
                </option>
              ))}
            </select>
          )}
          <button onClick={doLeave}   style={dangerBtn}                  title="Leave call">
            {role === 'provider' ? '⛔ End call' : '⛔ Leave'}
          </button>
        </div>
      )}

      {overlay}
    </div>
  )
}
