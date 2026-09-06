// Semi-transparent brand overlay that sits on top of LiveKit's VideoConference
// component. Renders:
//   • Top header bar (fades to transparent) — "Interview: {name} — {role}"
//   • Bottom-left Tere logo watermark (subtle)
//
// Both layers use pointer-events:none so LiveKit's built-in controls
// (participant strip, mic/cam buttons, chat, screen-share, disconnect) receive
// every click. Zero interference with the underlying video widget.
//
// Shared by /interview/:token (applicant) and /interview-room (interviewer).

import React, { useEffect, useState } from 'react'

// Semi-transparent brand overlay that sits on top of LiveKit's VideoConference
// component. Renders:
//   • Top header (fades to transparent) — "Interview: {name}"
//   • Bottom-left Tere logo watermark (desktop only — on phones tiles are
//     stacked and the watermark would overlap participant labels)
// Both layers use pointer-events:none so LiveKit controls receive every click.
export default function InterviewBrandOverlay({ title, subtitle }) {
  // Mobile: shrink the top band (64 vs 88) so it doesn't crowd a stacked
  // tile, and drop the corner watermark (it collides with LiveKit's per-
  // tile name labels when the grid goes to a single column).
  const [isPhone, setIsPhone] = useState(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(max-width: 640px)')
    const handler = (e) => setIsPhone(e.matches)
    mql.addEventListener?.('change', handler) || mql.addListener?.(handler)
    return () => mql.removeEventListener?.('change', handler) || mql.removeListener?.(handler)
  }, [])

  const headerHeight = isPhone ? 60 : 88
  const logoSize     = isPhone ? 28 : 36
  const titleSize    = isPhone ? '.85rem' : '.95rem'
  const eyebrowSize  = isPhone ? '.62rem' : '.7rem'
  const padX         = isPhone ? 14 : 20
  const padY         = isPhone ? 10 : 14

  return (
    <>
      {/* Top header — gradient fades to transparent so it never obscures faces */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          height: headerHeight, zIndex: 20, pointerEvents: 'none',
          background: 'linear-gradient(180deg, rgba(13,43,69,.72) 0%, rgba(13,43,69,.35) 60%, rgba(13,43,69,0) 100%)',
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: `${padY}px ${padX}px`,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          color: 'white',
        }}>
        <img src="/tere-logo.png" alt="" width={logoSize} height={logoSize}
          style={{ borderRadius: 8, flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,.25)' }} />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: eyebrowSize, fontWeight: 700, letterSpacing: '.14em',
            textTransform: 'uppercase', color: '#D4EEF0', marginBottom: 2,
            textShadow: '0 1px 2px rgba(0,0,0,.4)',
          }}>Tere Health · Interview</div>
          <div style={{
            fontSize: titleSize, fontWeight: 700, color: 'white',
            textShadow: '0 1px 2px rgba(0,0,0,.5)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{title}</div>
          {subtitle && !isPhone && (
            <div style={{
              fontSize: '.75rem', color: 'rgba(255,255,255,.85)',
              textShadow: '0 1px 2px rgba(0,0,0,.5)', marginTop: 1,
            }}>{subtitle}</div>
          )}
        </div>
      </div>

      {/* Desktop-only watermark. On mobile the tile grid stacks and the
          bottom-left corner is a participant name label. */}
      {!isPhone && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed', bottom: 12, left: 12, zIndex: 20,
            pointerEvents: 'none', opacity: 0.55,
            display: 'flex', alignItems: 'center', gap: 8,
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontStyle: 'italic', fontSize: '1.15rem', color: '#D4EEF0',
            textShadow: '0 1px 3px rgba(0,0,0,.6)',
          }}>
          <img src="/tere-logo.png" alt="" width={22} height={22}
            style={{ borderRadius: 4 }} />
          <span>Tere</span>
        </div>
      )}
    </>
  )
}
