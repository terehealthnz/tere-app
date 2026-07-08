// LiveSubtitles — bilingual subtitle overlay for video/phone consults.
//
// Renders a fixed bar at the bottom of the video with:
//   • Target-language line (patient's preferred language)
//   • English line (for provider clarity)
//   • Confidence badge (🟢 high · 🟡 medium · 🔴 low)
//   • "Request interpreter" escape hatch
//
// Consumers provide:
//   • recentUtterances — array of { at, speaker, text, lang } from LiveKit STT
//   • targetLang       — the patient's preferred language
//   • paused           — true when a modal (Prescribe/ACC/Discharge) is open
//   • onInterpreter    — callback wired to the parent's Language Line flow
//   • consultationId   — for /api/live-translate transcript persistence
//
// The component owns:
//   • Translation cache (skip re-translating repeated STT chunks)
//   • Debounced translate calls (~1s window to avoid thrashing)
//   • Fade in/out timing
//
// NEVER wraps clinical modals — the parent's useSubtitleGate hook detects
// modal state and passes paused=true. When paused we render a warning stripe
// instead of translations.

import React, { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { getLangMeta } from '../../lib/i18n'

const NAVY = '#0D2B45'

const CONFIDENCE_BADGE = {
  high:   { color: '#059669', bg: 'rgba(5,150,105,.2)',  label: '🟢', hint: 'High confidence' },
  medium: { color: '#D97706', bg: 'rgba(217,119,6,.2)',  label: '🟡', hint: 'Medium confidence — verify verbally' },
  low:    { color: '#DC2626', bg: 'rgba(220,38,38,.2)',  label: '🔴', hint: 'Low confidence — request interpreter' },
}

export default function LiveSubtitles({
  recentUtterances = [],
  targetLang,
  paused = false,
  onInterpreter,
  consultationId,
  onHide,
}) {
  const [current, setCurrent] = useState({ text: '', confidence: 'medium', speaker: '' })
  const cacheRef = useRef(new Map()) // "from→to:text" → { translated, confidence }
  const lastRenderedRef = useRef('')
  const targetMeta = getLangMeta(targetLang || 'en')
  const targetIsRTL = !!targetMeta?.rtl

  // Translate the most recent utterance whenever the source list changes.
  // Single-line mode: viewer only sees text translated INTO their own language.
  //
  // IMPORTANT — only translate FINAL utterances, not interim partial results.
  // AWS Transcribe emits many partials per second while someone's talking
  // ("Wh", "Who", "Who do", "Who do you"…). If we fire a Bedrock call for
  // every partial we blow past Bedrock's per-second concurrency limits within
  // seconds, get 502s back, and the badge drops to LOW showing raw English.
  // Waiting for isFinal means one Bedrock call per completed phrase — feels
  // slightly less "live" but produces reliable Spanish.
  useEffect(() => {
    if (paused) return
    const last = recentUtterances[recentUtterances.length - 1]
    if (!last || !last.text?.trim()) return
    if (!last.isFinal) return
    if (lastRenderedRef.current === last.text) return
    lastRenderedRef.current = last.text

    const srcLang = (last.lang || 'en').split('-')[0].toLowerCase()

    async function translate(text, from, to) {
      if (from === to) return { translated: text, confidence: 'high' }
      const key = `${from}→${to}:${text}`
      if (cacheRef.current.has(key)) return cacheRef.current.get(key)
      try {
        const res = await apiFetch('/api/live-translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text, source_lang: from, target_lang: to,
            consultation_id: consultationId,
            speaker: last.speaker || 'patient',
          }),
        })
        const data = await res.json()
        if (!res.ok) return { translated: text, confidence: 'low' }
        const result = { translated: data.translated || '', confidence: data.confidence || 'medium' }
        cacheRef.current.set(key, result)
        return result
      } catch {
        return { translated: text, confidence: 'low' }
      }
    }

    translate(last.text, srcLang, targetLang).then(r => {
      setCurrent({
        text: r.translated,
        confidence: r.confidence,
        speaker: last.speaker || 'patient',
      })
    })
  }, [recentUtterances, targetLang, consultationId, paused])

  const badge = CONFIDENCE_BADGE[current.confidence] || CONFIDENCE_BADGE.medium

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', bottom: 96, left: 0, right: 0,
        color: 'white',
        padding: '0 1rem',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        zIndex: 40,
        pointerEvents: 'none',
      }}>
      {paused ? (
        <div style={{ maxWidth: 720, margin: '0 auto', background: 'rgba(217,119,6,.9)', border: '1px solid #FCD34D', color: 'white', padding: '.625rem 1rem', borderRadius: 10, textAlign: 'center', fontSize: '.875rem', fontWeight: 700, pointerEvents: 'auto' }}>
          🔇 AI subtitles paused — speak clinical instructions in English or request Language Line
        </div>
      ) : (
        <div style={{ maxWidth: 720, margin: '0 auto', background: 'rgba(0,0,0,.55)', borderRadius: 10, padding: '.75rem 1rem', pointerEvents: 'auto', backdropFilter: 'blur(6px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem', fontSize: '.6875rem', color: 'rgba(255,255,255,.7)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            <span style={{ background: badge.bg, color: badge.color, fontWeight: 700, padding: '2px 8px', borderRadius: 99 }} title={badge.hint}>
              {badge.label} {current.confidence}
            </span>
            <span style={{ fontWeight: 600 }}>{current.speaker === 'provider' ? 'Provider' : 'Patient'}</span>
            <span style={{ flex: 1 }} />
            {onHide && (
              <button
                onClick={onHide}
                style={{ background: 'rgba(255,255,255,.1)', color: 'white', border: '1px solid rgba(255,255,255,.2)', padding: '3px 10px', borderRadius: 99, fontSize: '.6875rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Hide
              </button>
            )}
          </div>
          <div dir={targetIsRTL ? 'rtl' : 'ltr'} style={{ fontSize: '1.0625rem', fontWeight: 600, color: 'white', lineHeight: 1.4, minHeight: '1.4em', textShadow: '0 1px 3px rgba(0,0,0,.7)' }}>
            {current.text || <span style={{ opacity: .35 }}>…</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// useSubtitleGate — small helper hook the parent call component uses to
// disable subtitles whenever a clinical-action modal (Prescribe/ACC/Discharge)
// is visible. Consumer passes the current modal-state boolean; hook returns
// { paused, resumeIn } for consistent handling.
export function useSubtitleGate(modalOpen) {
  const [paused, setPaused] = useState(false)
  useEffect(() => { setPaused(!!modalOpen) }, [modalOpen])
  return { paused }
}
