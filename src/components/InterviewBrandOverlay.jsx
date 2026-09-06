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

import React from 'react'

export default function InterviewBrandOverlay({ title, subtitle }) {
  return (
    <>
      {/* Top header — 88px band, dark gradient fading to transparent */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          height: 88, zIndex: 20, pointerEvents: 'none',
          background: 'linear-gradient(180deg, rgba(13,43,69,.72) 0%, rgba(13,43,69,.35) 60%, rgba(13,43,69,0) 100%)',
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '14px 20px',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          color: 'white',
        }}>
        <img src="/tere-logo.png" alt="" width={36} height={36}
          style={{ borderRadius: 8, flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,.25)' }} />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: '.7rem', fontWeight: 700, letterSpacing: '.14em',
            textTransform: 'uppercase', color: '#D4EEF0', marginBottom: 2,
            textShadow: '0 1px 2px rgba(0,0,0,.4)',
          }}>Tere Health · Interview</div>
          <div style={{
            fontSize: '.95rem', fontWeight: 700, color: 'white',
            textShadow: '0 1px 2px rgba(0,0,0,.5)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{title}</div>
          {subtitle && (
            <div style={{
              fontSize: '.75rem', color: 'rgba(255,255,255,.85)',
              textShadow: '0 1px 2px rgba(0,0,0,.5)', marginTop: 1,
            }}>{subtitle}</div>
          )}
        </div>
      </div>

      {/* Bottom-left watermark — small, subtle, well clear of the LiveKit
          control bar which lives centre-bottom. */}
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
    </>
  )
}
