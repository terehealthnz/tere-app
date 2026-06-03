import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRoomContext } from '@livekit/components-react'
import { Track } from 'livekit-client'

const OPTS = [
  { id: 'none',   icon: '📷', label: 'Off' },
  { id: 'blur',   icon: '🌫️', label: 'Blur' },
  { id: 'office', icon: '🏥', label: 'Office' },
  { id: 'tere',   icon: '💙', label: 'Tere' },
]

export default function VirtualBgControls() {
  const [active, setActive]     = useState(() => localStorage.getItem('tere_bg_preference') || 'none')
  const [applying, setApplying] = useState(false)
  const [warning, setWarning]   = useState(null)
  const [perf, setPerf]         = useState(null) // fps warning
  const room = useRoomContext()
  const fpsRef = useRef({ frames: 0, start: 0, warned: false })

  const getCameraTrack = useCallback(() => {
    return room?.localParticipant?.getTrackPublication(Track.Source.Camera)?.track ?? null
  }, [room])

  const apply = useCallback(async (mode) => {
    const track = getCameraTrack()
    if (!track) { setWarning('Camera not active — join the call first'); return }
    setApplying(true)
    setWarning(null)
    try {
      if (mode === 'none') {
        await track.stopProcessor()
      } else if (mode === 'blur') {
        const { BackgroundBlur } = await import('@livekit/track-processors')
        await track.setProcessor(BackgroundBlur(15, {}, (info) => {
          // Monitor fps for performance warning
          if (!fpsRef.current.warned) {
            const now = performance.now()
            fpsRef.current.frames++
            if (fpsRef.current.frames === 1) fpsRef.current.start = now
            if (fpsRef.current.frames >= 30) {
              const elapsed = (now - fpsRef.current.start) / 1000
              const fps = fpsRef.current.frames / elapsed
              if (fps < 15) {
                fpsRef.current.warned = true
                setPerf('Background effects may reduce call quality on this device. Turn off to improve video.')
              }
              fpsRef.current.frames = 0
            }
          }
        }))
      } else if (mode === 'office') {
        const { VirtualBackground } = await import('@livekit/track-processors')
        await track.setProcessor(VirtualBackground('/bg-medical-office.svg'))
      } else if (mode === 'tere') {
        const { VirtualBackground } = await import('@livekit/track-processors')
        await track.setProcessor(VirtualBackground('/bg-tere-brand.svg'))
      }
      setActive(mode)
      localStorage.setItem('tere_bg_preference', mode)
      fpsRef.current = { frames: 0, start: 0, warned: fpsRef.current.warned }
    } catch (e) {
      console.error('[VirtualBg]', e)
      setWarning('Background processing unavailable — browser may not support this feature')
      setActive('none')
      localStorage.setItem('tere_bg_preference', 'none')
    } finally {
      setApplying(false)
    }
  }, [getCameraTrack])

  // Re-apply saved preference once camera track is available
  useEffect(() => {
    const saved = localStorage.getItem('tere_bg_preference')
    if (!saved || saved === 'none') return
    let attempts = 0
    const tryApply = () => {
      if (getCameraTrack()) { apply(saved); return }
      if (++attempts < 12) setTimeout(tryApply, 800)
    }
    setTimeout(tryApply, 1500)
  }, []) // intentionally run once on mount only

  return (
    <div style={{
      position: 'absolute', bottom: 74, left: '50%', transform: 'translateX(-50%)',
      zIndex: 20, display: 'flex', alignItems: 'center', gap: 3,
      background: 'rgba(0,0,0,.7)', borderRadius: 24, padding: '5px 10px',
      backdropFilter: 'blur(8px)', whiteSpace: 'nowrap', userSelect: 'none',
    }}>
      {/* Label */}
      <span style={{
        color: 'rgba(255,255,255,.38)', fontSize: '.58rem', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '.1em', paddingRight: 4,
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      }}>
        BG
      </span>

      {/* Option buttons */}
      {OPTS.map(opt => {
        const isActive = active === opt.id
        const isLoading = applying && active === opt.id
        return (
          <button key={opt.id} title={opt.label}
            onClick={() => !applying && apply(opt.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 12, cursor: applying ? 'wait' : 'pointer',
              border: isActive ? '2px solid #0B6E76' : '1px solid rgba(255,255,255,.18)',
              background: isActive ? '#0B6E76' : 'rgba(255,255,255,.08)',
              color: 'white', fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontWeight: isActive ? 700 : 400, fontSize: '.75rem',
              minHeight: 32, minWidth: 48,
              opacity: applying && !isActive ? .55 : 1,
              transition: 'all .15s',
            }}>
            <span style={{ fontSize: '1rem', lineHeight: 1 }}>
              {isLoading ? '⏳' : opt.icon}
            </span>
            <span>{opt.label}</span>
          </button>
        )
      })}

      {/* Warnings */}
      {(warning || perf) && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,.88)', borderRadius: 10,
          padding: '7px 12px', maxWidth: 360, whiteSpace: 'normal',
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <span style={{ fontSize: '1rem' }}>⚠</span>
          <span style={{ color: 'rgba(255,220,60,.9)', fontSize: '.75rem', lineHeight: 1.5, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {perf || warning}
          </span>
          <button onClick={() => { setWarning(null); setPerf(null) }}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', padding: '0 0 0 4px', fontSize: '.9rem', lineHeight: 1, flexShrink: 0 }}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
