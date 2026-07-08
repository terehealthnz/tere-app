// LiveSubtitles — bilingual subtitle overlay for video/phone consults.
//
// Two viewing modes:
//   • Collapsed (default) — one line at the bottom with the latest translated
//     phrase and a confidence badge.
//   • Expanded             — scrollable transcript of the whole conversation
//     up to the point the provider clicks the arrow. Grows upward from the
//     control bar so it never obscures the LiveKit video.
//
// Consumers provide:
//   • recentUtterances — array of { at, speaker, text, lang, isFinal }
//   • targetLang       — the patient's preferred language (viewer's language)
//   • paused           — true when a clinical modal is open
//   • consultationId   — passed through to /api/live-translate
//   • onHide           — optional; hides the whole overlay
//
// The component owns:
//   • A serial translation queue — /api/live-translate is called strictly one
//     at a time per subtitle stream. Concurrent Bedrock requests earlier
//     caused throttling → 502 → LOW badges with empty text; serialising keeps
//     us inside Bedrock's per-second concurrency and produces reliable
//     Spanish output at the cost of ~500-800ms of extra latency on rapid-fire
//     sentences.
//   • Translation cache — repeated phrases don't re-hit Bedrock.
//   • Conversation history — every FINAL utterance whose translation lands
//     appends to history; expanded view renders that history newest-at-bottom
//     with the confidence badge inline.
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
  consultationId,
  onHide,
}) {
  const [current, setCurrent] = useState({ text: '', confidence: 'medium', speaker: '' })
  const [history, setHistory] = useState([]) // { at, speaker, text, confidence }
  const [expanded, setExpanded] = useState(false)
  const cacheRef = useRef(new Map()) // "from→to:text" → { translated, confidence }
  const lastQueuedRef = useRef('')
  const queueRef = useRef(Promise.resolve()) // serial promise chain
  const historyEndRef = useRef(null)
  const targetMeta = getLangMeta(targetLang || 'en')
  const targetIsRTL = !!targetMeta?.rtl

  // Autoscroll to bottom when new history entries land AND user has the panel
  // open. If the user is scrolled up reading older parts, don't yank them down.
  useEffect(() => {
    if (!expanded) return
    const el = historyEndRef.current
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [history, expanded])

  // Translate the most recent FINAL utterance. See file-level notes on why
  // interims are ignored and why calls are serialised.
  useEffect(() => {
    if (paused) return
    const last = recentUtterances[recentUtterances.length - 1]
    if (!last || !last.text?.trim()) return
    if (!last.isFinal) return
    if (lastQueuedRef.current === last.text) return
    lastQueuedRef.current = last.text

    const srcLang = (last.lang || 'en').split('-')[0].toLowerCase()

    async function translate(text, from, to, speaker) {
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
            speaker,
          }),
        })
        const data = await res.json()
        if (!res.ok) return { translated: '', confidence: 'low' }
        const result = { translated: data.translated || '', confidence: data.confidence || 'medium' }
        cacheRef.current.set(key, result)
        return result
      } catch {
        return { translated: '', confidence: 'low' }
      }
    }

    // Chain onto the serial queue — strictly one Bedrock request in flight
    // at any time. When wife/provider fires 4 sentences in 3 seconds, they
    // translate sequentially instead of racing each other into a Bedrock
    // rate-limit.
    const speaker = last.speaker || 'patient'
    const at = last.at || new Date().toISOString()
    queueRef.current = queueRef.current.then(async () => {
      const r = await translate(last.text, srcLang, targetLang, speaker)
      setCurrent({ text: r.translated, confidence: r.confidence, speaker })
      // Only append to history when we actually have translated text. LOW/empty
      // failures do NOT pollute the transcript — the provider still sees them
      // as a red LOW badge on the live line and can repeat the phrase.
      if (r.translated && r.translated.trim()) {
        setHistory(h => [...h, { at, speaker, text: r.translated, confidence: r.confidence }].slice(-200))
      }
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
        <div style={{ maxWidth: 720, margin: '0 auto', background: 'rgba(0,0,0,.55)', borderRadius: 10, pointerEvents: 'auto', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column' }}>
          {/* Expanded history panel — grows above the current line */}
          {expanded && (
            <div style={{ maxHeight: '35vh', overflowY: 'auto', padding: '.5rem .875rem', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
              {history.length === 0 ? (
                <div style={{ fontSize: '.8125rem', color: 'rgba(255,255,255,.5)', textAlign: 'center', padding: '.5rem 0' }}>
                  Transcript will appear here as the consultation continues.
                </div>
              ) : (
                history.map((h, i) => {
                  const b = CONFIDENCE_BADGE[h.confidence] || CONFIDENCE_BADGE.medium
                  return (
                    <div key={i} style={{ padding: '.375rem 0', borderBottom: i < history.length - 1 ? '1px solid rgba(255,255,255,.05)' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.375rem', fontSize: '.625rem', color: 'rgba(255,255,255,.55)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>
                        <span style={{ background: b.bg, color: b.color, fontWeight: 700, padding: '1px 6px', borderRadius: 99 }}>{b.label}</span>
                        <span style={{ fontWeight: 600 }}>{h.speaker === 'provider' ? 'Provider' : 'Patient'}</span>
                      </div>
                      <div dir={targetIsRTL ? 'rtl' : 'ltr'} style={{ fontSize: '.9375rem', color: 'white', lineHeight: 1.35 }}>{h.text}</div>
                    </div>
                  )
                })
              )}
              <div ref={historyEndRef} />
            </div>
          )}

          {/* Current live line + controls */}
          <div style={{ padding: '.75rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem', fontSize: '.6875rem', color: 'rgba(255,255,255,.7)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              <span style={{ background: badge.bg, color: badge.color, fontWeight: 700, padding: '2px 8px', borderRadius: 99 }} title={badge.hint}>
                {badge.label} {current.confidence}
              </span>
              <span style={{ fontWeight: 600 }}>{current.speaker === 'provider' ? 'Provider' : 'Patient'}</span>
              <span style={{ flex: 1 }} />
              <button
                onClick={() => setExpanded(v => !v)}
                title={expanded ? 'Collapse transcript' : 'Expand transcript'}
                aria-label={expanded ? 'Collapse transcript' : 'Expand transcript'}
                style={{ background: 'rgba(255,255,255,.1)', color: 'white', border: '1px solid rgba(255,255,255,.2)', padding: '3px 10px', borderRadius: 99, fontSize: '.6875rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                {expanded ? '▾ Collapse' : `▴ Transcript (${history.length})`}
              </button>
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
