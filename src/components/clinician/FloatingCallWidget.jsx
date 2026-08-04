// FloatingCallWidget — draggable video + call controls that overlay the
// provider's chart view during a live consult (Doctegrity-style pattern).
//
// Renders inside a <LiveKitRoom> — uses LiveKit React hooks to grab the
// participant tracks rather than the opinionated pre-built VideoConference
// component (which takes over the screen).
//
// Position is persisted per-provider in sessionStorage. Minimize collapses
// to a small circular avatar in the corner. Controls: mute mic, toggle
// camera, end call.

import React, { useEffect, useRef, useState, useMemo } from 'react'
import {
  useTracks,
  useLocalParticipant,
  useRemoteParticipants,
  RoomAudioRenderer,
  VideoTrack,
} from '@livekit/components-react'
import { Track } from 'livekit-client'

const STORAGE_KEY = 'tere_call_widget_pos'
const WIDGET_W = 320
const WIDGET_H = 260

function loadPos() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return null
    return p
  } catch { return null }
}

function defaultPos() {
  // Top-right corner, ~16px inset from viewport edge.
  const x = Math.max(16, window.innerWidth - WIDGET_W - 16)
  const y = 88   // clear the top nav bar
  return { x, y }
}

function clampToViewport(pos, w, h) {
  const maxX = window.innerWidth - w - 8
  const maxY = window.innerHeight - h - 8
  return {
    x: Math.max(8, Math.min(pos.x, maxX)),
    y: Math.max(8, Math.min(pos.y, maxY)),
  }
}

export default function FloatingCallWidget({
  primaryAction, isAudioOnly, patientName,
  // Subtitle props — parent (ProviderConsult) decides whether subtitles
  // are supported for this patient's language and owns the on/off state.
  // Widget just renders the toggle button and calls back on click.
  subtitlesAvailable = false,
  subtitlesOn = false,
  onToggleSubtitles,
  // Manual language override picker (fullscreen only). If the patient's
  // actual language differs from what triage recorded, the provider can
  // pick the real source language mid-call.
  subtitleLanguages = [],         // [{ code, name, flag }, …] — supported source langs
  currentSubtitleLang = null,     // code currently used as source
  onChangeSubtitleLang,           // (code: string) => void
}) {
  // Backwards-compatible default so a caller that forgets to pass
  // primaryAction still gets an End Call button that no-ops safely.
  const action = primaryAction || { label: '🔴 End call', color: '#DC2626', onClick: () => {}, disabled: true }
  const [pos, setPos] = useState(() => loadPos() || defaultPos())
  const [minimized, setMinimized] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  // Escape shrinks fullscreen back to widget without ending the call.
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  const remoteParticipants = useRemoteParticipants()
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant()

  // Pull the patient's remote camera track if they have one.
  const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: true })
  const remoteCameraTrack = cameraTracks.find(t => t.participant && !t.participant.isLocal)

  // Save position when drag ends
  useEffect(() => {
    if (!dragging) {
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pos)) } catch {}
    }
  }, [dragging, pos])

  // Keep widget on-screen if window resizes
  useEffect(() => {
    const onResize = () => setPos(p => clampToViewport(p, minimized ? 72 : WIDGET_W, minimized ? 72 : WIDGET_H))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [minimized])

  // Global mouse/touch move handlers while dragging
  useEffect(() => {
    if (!dragging) return
    const onMove = (e) => {
      const t = e.touches?.[0] || e
      const next = clampToViewport(
        { x: t.clientX - dragOffset.current.x, y: t.clientY - dragOffset.current.y },
        minimized ? 72 : WIDGET_W,
        minimized ? 72 : WIDGET_H,
      )
      setPos(next)
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [dragging, minimized])

  function startDrag(e) {
    const t = e.touches?.[0] || e
    dragOffset.current = { x: t.clientX - pos.x, y: t.clientY - pos.y }
    setDragging(true)
    e.preventDefault?.()
  }

  const patientInitials = useMemo(() => {
    if (!patientName) return '?'
    const parts = patientName.trim().split(/\s+/)
    return (parts[0]?.[0] || '') + (parts[1]?.[0] || '')
  }, [patientName])

  const hasRemote = remoteParticipants.length > 0

  // ── Fullscreen: viewport-covering video + controls ────────────────────────
  // Task #217. Provider clicks the ⛶ button in the widget header to expand.
  // Escape or the collapse button (⤡) shrinks back to the floating widget
  // without ending the call. LiveKit tracks stay subscribed the whole time
  // — the underlying <LiveKitRoom> in the parent is untouched, so scribe +
  // subtitles + patient presence keep running.
  if (fullscreen) {
    return (
      <>
        <RoomAudioRenderer />
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: '#000', display: 'flex', flexDirection: 'column',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}>
          {/* Header bar */}
          <div style={{
            padding: '14px 20px', background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(8px)',
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,.1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                background: hasRemote ? '#10B981' : '#F59E0B',
                display: 'inline-block',
              }}/>
              <span style={{ fontWeight: 700, fontSize: '.9375rem' }}>
                {patientName || 'Call'} — {hasRemote ? 'connected' : 'waiting for patient'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {subtitlesAvailable && subtitleLanguages.length > 0 && (
                <div title="Patient's spoken language for subtitles" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.6)' }}>Subtitles from</span>
                  <select
                    value={currentSubtitleLang || ''}
                    onChange={(e) => { if (typeof onChangeSubtitleLang === 'function') onChangeSubtitleLang(e.target.value) }}
                    style={{
                      background: 'rgba(255,255,255,.1)', color: 'white', border: '1px solid rgba(255,255,255,.2)',
                      padding: '6px 10px', borderRadius: 6, fontFamily: 'inherit', fontSize: '.8125rem',
                      cursor: 'pointer',
                    }}
                  >
                    {subtitleLanguages.map(l => (
                      <option key={l.code} value={l.code} style={{ background: '#0D1117' }}>{l.flag} {l.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <button
                onClick={() => setFullscreen(false)}
                title="Shrink to widget (Esc)"
                style={{
                  background: 'rgba(255,255,255,.1)', border: 'none', color: 'white',
                  padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '.875rem', fontWeight: 600,
                }}
              >⤡ Shrink</button>
            </div>
          </div>

          {/* Video body */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {remoteCameraTrack ? (
              <VideoTrack
                trackRef={remoteCameraTrack}
                style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, color: 'rgba(255,255,255,.7)' }}>
                <div style={{
                  width: 128, height: 128, borderRadius: '50%',
                  background: 'rgba(255,255,255,.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '2.5rem', fontWeight: 700, color: 'white',
                }}>{patientInitials.toUpperCase()}</div>
                <div style={{ fontSize: '1rem' }}>{isAudioOnly ? '📞 Audio call' : hasRemote ? 'Camera off' : 'Waiting for patient…'}</div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div style={{
            padding: '18px 20px calc(18px + env(safe-area-inset-bottom))',
            background: 'rgba(0,0,0,.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
            flexShrink: 0, borderTop: '1px solid rgba(255,255,255,.08)',
          }}>
            <button
              onClick={() => localParticipant?.setMicrophoneEnabled(!isMicrophoneEnabled)}
              title={isMicrophoneEnabled ? 'Mute mic' : 'Unmute mic'}
              style={{
                width: 56, height: 56, borderRadius: '50%',
                background: isMicrophoneEnabled ? 'rgba(255,255,255,.15)' : '#DC2626',
                border: 'none', color: 'white', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.375rem',
              }}
            >{isMicrophoneEnabled ? '🎙' : '🔇'}</button>

            <button
              onClick={() => localParticipant?.setCameraEnabled(!isCameraEnabled)}
              title={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}
              style={{
                width: 56, height: 56, borderRadius: '50%',
                background: isCameraEnabled ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.05)',
                border: 'none', color: 'white', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.375rem',
              }}
            >{isCameraEnabled ? '📹' : '📷'}</button>

            {subtitlesAvailable && (
              <button
                onClick={() => { if (typeof onToggleSubtitles === 'function') onToggleSubtitles() }}
                title={subtitlesOn ? 'Turn subtitles off' : 'Turn subtitles on'}
                style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: subtitlesOn ? '#0B6E76' : 'rgba(255,255,255,.15)',
                  border: 'none', color: 'white', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.375rem',
                }}
              >💬</button>
            )}

            <button
              onClick={action.onClick || undefined}
              disabled={action.disabled || !action.onClick}
              title={action.disabled && !action.onClick ? 'Give the patient a chance to join' : undefined}
              style={{
                minWidth: 180, height: 56, borderRadius: 28,
                background: action.color || '#DC2626',
                color: 'white', border: 'none', padding: '0 24px',
                cursor: (action.disabled || !action.onClick) ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', fontWeight: 700, fontSize: '.9375rem',
                opacity: (action.disabled || !action.onClick) ? 0.6 : 1,
              }}
            >{action.label}</button>
          </div>
        </div>
      </>
    )
  }

  // ── Minimized: circular avatar only ────────────────────────────────────────
  if (minimized) {
    return (
      <>
        <RoomAudioRenderer />
        <div
          onMouseDown={startDrag}
          onTouchStart={startDrag}
          onClick={() => { if (!dragging) setMinimized(false) }}
          style={{
            position: 'fixed', left: pos.x, top: pos.y, zIndex: 100,
            width: 64, height: 64, borderRadius: '50%',
            background: hasRemote ? '#0B6E76' : '#6B7280',
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: '1.125rem', fontFamily: 'Plus Jakarta Sans, sans-serif',
            boxShadow: '0 8px 24px rgba(0,0,0,.35)',
            cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none',
            border: '3px solid white',
          }}
          title="Tap to expand call"
        >
          {patientInitials.toUpperCase()}
          {hasRemote && (
            <span style={{
              position: 'absolute', bottom: 2, right: 2,
              width: 14, height: 14, borderRadius: '50%',
              background: '#10B981', border: '2px solid white',
            }}/>
          )}
        </div>
      </>
    )
  }

  // ── Expanded widget ─────────────────────────────────────────────────────────
  return (
    <>
      <RoomAudioRenderer />
      <div
        style={{
          position: 'fixed', left: pos.x, top: pos.y, zIndex: 100,
          width: WIDGET_W, height: WIDGET_H,
          background: '#0D1117', borderRadius: 12, overflow: 'hidden',
          boxShadow: '0 12px 32px rgba(0,0,0,.35)',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          border: '1px solid rgba(255,255,255,.15)',
        }}
      >
        {/* Drag handle / header */}
        <div
          onMouseDown={startDrag}
          onTouchStart={startDrag}
          style={{
            padding: '8px 12px',
            background: 'rgba(0,0,0,.7)',
            color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: dragging ? 'grabbing' : 'grab',
            userSelect: 'none', flexShrink: 0,
          }}
        >
          <div style={{ fontSize: '.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: hasRemote ? '#10B981' : '#F59E0B',
              display: 'inline-block',
            }}/>
            {hasRemote ? 'Patient connected' : 'Waiting for patient…'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              onClick={() => setFullscreen(true)}
              onMouseDown={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,.7)',
                cursor: 'pointer', padding: '2px 8px', fontSize: '.875rem', lineHeight: 1,
              }}
              title="Expand to fullscreen"
            >⛶</button>
            <button
              onClick={() => setMinimized(true)}
              onMouseDown={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,.7)',
                cursor: 'pointer', padding: '2px 8px', fontSize: '1rem', lineHeight: 1,
              }}
              title="Minimize"
            >–</button>
          </div>
        </div>

        {/* Video body */}
        <div style={{ flex: 1, position: 'relative', background: '#000', overflow: 'hidden' }}>
          {remoteCameraTrack ? (
            <VideoTrack
              trackRef={remoteCameraTrack}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            // Audio-only or patient camera off: show a large avatar
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,.5)', fontSize: '.875rem',
              flexDirection: 'column', gap: 8,
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'rgba(255,255,255,.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.5rem', fontWeight: 700, color: 'white',
              }}>{patientInitials.toUpperCase()}</div>
              <div>{isAudioOnly ? '📞 Audio call' : hasRemote ? 'Camera off' : 'Waiting…'}</div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{
          padding: '10px 12px', background: 'rgba(0,0,0,.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          flexShrink: 0,
        }}>
          {/* Mic toggle */}
          <button
            onClick={() => localParticipant?.setMicrophoneEnabled(!isMicrophoneEnabled)}
            title={isMicrophoneEnabled ? 'Mute mic' : 'Unmute mic'}
            style={{
              width: 40, height: 40, borderRadius: '50%',
              background: isMicrophoneEnabled ? 'rgba(255,255,255,.15)' : '#DC2626',
              border: 'none', color: 'white', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
            }}
          >{isMicrophoneEnabled ? '🎙' : '🔇'}</button>

          {/* Camera toggle */}
          <button
            onClick={() => localParticipant?.setCameraEnabled(!isCameraEnabled)}
            title={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}
            style={{
              width: 40, height: 40, borderRadius: '50%',
              background: isCameraEnabled ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.05)',
              border: 'none', color: 'white', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
            }}
          >{isCameraEnabled ? '📹' : '📷'}</button>

          {/* Subtitles toggle — only rendered when parent has told us the
              patient's language supports live translation (excellent/very_good
              subtitle tier + non-English). */}
          {subtitlesAvailable && (
            <button
              onClick={() => { if (typeof onToggleSubtitles === 'function') onToggleSubtitles() }}
              title={subtitlesOn ? 'Turn subtitles off' : 'Turn subtitles on'}
              style={{
                width: 40, height: 40, borderRadius: '50%',
                background: subtitlesOn ? '#0B6E76' : 'rgba(255,255,255,.15)',
                border: 'none', color: 'white', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
              }}
            >💬</button>
          )}

          {/* Primary action — label + colour + handler come from the parent
              and depend on whether the patient has joined + how long we've
              been waiting + how many attempts already made. See
              ProviderConsult.jsx for the state machine. */}
          <button
            onClick={action.onClick || undefined}
            disabled={action.disabled || !action.onClick}
            title={action.disabled && !action.onClick ? 'Give the patient a chance to join' : undefined}
            style={{
              flex: 1, height: 40, borderRadius: 20,
              background: action.color || '#DC2626',
              color: 'white', border: 'none',
              cursor: (action.disabled || !action.onClick) ? 'not-allowed' : 'pointer',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontWeight: 700, fontSize: '.8125rem',
              opacity: (action.disabled || !action.onClick) ? 0.6 : 1,
            }}
          >{action.label}</button>
        </div>
      </div>
    </>
  )
}
