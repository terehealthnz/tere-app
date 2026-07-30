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

export default function FloatingCallWidget({ onEndCall, endingCall, isAudioOnly, patientName }) {
  const [pos, setPos] = useState(() => loadPos() || defaultPos())
  const [minimized, setMinimized] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })

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

          {/* End call */}
          <button
            onClick={onEndCall}
            disabled={endingCall}
            style={{
              flex: 1, height: 40, borderRadius: 20,
              background: '#DC2626', color: 'white', border: 'none',
              cursor: endingCall ? 'not-allowed' : 'pointer',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontWeight: 700, fontSize: '.8125rem',
              opacity: endingCall ? 0.6 : 1,
            }}
          >{endingCall ? 'Ending…' : '🔴 End call'}</button>
        </div>
      </div>
    </>
  )
}
