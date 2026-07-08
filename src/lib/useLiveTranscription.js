// useLiveTranscription — React hook that streams a MediaStream (LiveKit local
// or remote track) to Deepgram over WebSocket and emits utterances.
//
// Usage:
//   const { utterances, connected, error, start, stop } = useLiveTranscription({
//     stream:      someMediaStream,   // from LiveKit track.mediaStream
//     sourceLang:  'sm',              // ISO 639-1
//     speaker:     'patient',         // annotates utterance objects
//     enabled:     subtitlesOn,       // hook only opens WS when enabled
//   })
//
// Ephemeral tokens come from /api/deepgram-token (see there for the security
// story). One WebSocket per stream; the hook cleans up on unmount or when
// enabled flips to false.
//
// Utterance shape:
//   { at: iso, speaker, text, lang, isFinal }
// Interim results (isFinal=false) are emitted for visual feedback; consumers
// should key subtitle rendering off isFinal or debounce on stability.

import { useEffect, useRef, useState } from 'react'
import { apiFetch } from './api'

// Per-language Deepgram config. Each language maps to:
//   • model: 'nova-3-medical' only supports English. Non-English uses 'nova-3'
//     (general) which covers major world languages, or 'nova-2' for tokens
//     Deepgram doesn't have a Nova-3 variant for.
//   • lang:  the Deepgram language code. Falls back to 'multi' for languages
//           Deepgram doesn't recognise natively (Māori, Samoan) — quality is
//           limited but won't crash the WebSocket.
// Codes verified against Deepgram docs 2026-07. Update if a language moves
// tiers.
const DG_CONFIG = {
  en:  { model: 'nova-3-medical', lang: 'en' },     // English medical model
  zh:  { model: 'nova-3',         lang: 'zh' },     // Simplified Chinese
  ja:  { model: 'nova-3',         lang: 'ja' },
  ko:  { model: 'nova-2',         lang: 'ko' },     // Nova-3 Korean limited
  de:  { model: 'nova-3',         lang: 'de' },
  fr:  { model: 'nova-3',         lang: 'fr' },
  es:  { model: 'nova-3',         lang: 'es' },
  ar:  { model: 'nova-2',         lang: 'multi' },  // Arabic via multi
  hi:  { model: 'nova-3',         lang: 'hi' },
  mi:  { model: 'nova-2',         lang: 'multi' },  // Māori not native — best-effort
  sm:  { model: 'nova-2',         lang: 'multi' },  // Samoan not native — best-effort
}

function deepgramConfig(sourceLang) {
  return DG_CONFIG[sourceLang] || DG_CONFIG.en
}

async function fetchToken() {
  const res = await apiFetch('/api/deepgram-token', { method: 'POST' })
  if (!res.ok) throw new Error(`deepgram-token failed: ${res.status}`)
  return res.json()
}

// Convert a MediaStream to a linear PCM audio graph that pumps 16-bit
// 16kHz samples to the given onChunk callback. Deepgram accepts other formats
// but linear16 is the most reliable in-browser encoding.
function pipeMediaStream(stream, onChunk) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
  const source = ctx.createMediaStreamSource(stream)
  // ScriptProcessorNode is deprecated but the only widely supported way to
  // access raw PCM without shipping an AudioWorklet file. Fine for MVP.
  const processor = ctx.createScriptProcessor(4096, 1, 1)
  source.connect(processor)
  processor.connect(ctx.destination) // required for the processor to run
  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0)
    const pcm = new Int16Array(input.length)
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]))
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    onChunk(pcm.buffer)
  }
  return () => {
    processor.disconnect()
    source.disconnect()
    ctx.close().catch(() => {})
  }
}

export function useLiveTranscription({ stream, sourceLang = 'en', speaker = 'patient', enabled = false }) {
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(null)
  const [utterances, setUtterances] = useState([])
  const wsRef = useRef(null)
  const cleanupRef = useRef(null)

  useEffect(() => {
    if (!enabled || !stream) return

    let cancelled = false
    async function connect() {
      try {
        const { token } = await fetchToken()
        if (cancelled) return
        const { model, lang: dgLang } = deepgramConfig(sourceLang)
        const url = `wss://api.deepgram.com/v1/listen?model=${encodeURIComponent(model)}&language=${encodeURIComponent(dgLang)}&smart_format=true&interim_results=true&encoding=linear16&sample_rate=16000&channels=1`

        // Deepgram accepts token in Sec-WebSocket-Protocol per docs.
        const ws = new WebSocket(url, ['token', token])
        wsRef.current = ws

        ws.onopen = () => {
          setConnected(true)
          cleanupRef.current = pipeMediaStream(stream, (chunk) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(chunk)
          })
        }

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data)
            const alt = msg.channel?.alternatives?.[0]
            const text = alt?.transcript
            if (!text?.trim()) return
            const isFinal = !!msg.is_final
            const utt = { at: new Date().toISOString(), speaker, text, lang: sourceLang, isFinal }
            setUtterances(prev => {
              // Replace last interim if not final; append if final
              if (prev.length && !prev[prev.length - 1].isFinal && !isFinal) {
                const next = prev.slice(0, -1); next.push(utt); return next
              }
              return [...prev, utt].slice(-40) // cap history
            })
          } catch {}
        }

        ws.onerror = () => {
          if (!cancelled) setError('Deepgram connection error')
        }
        ws.onclose = () => {
          if (!cancelled) setConnected(false)
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
    }
    connect()

    return () => {
      cancelled = true
      try { cleanupRef.current?.() } catch {}
      cleanupRef.current = null
      try { wsRef.current?.close() } catch {}
      wsRef.current = null
      setConnected(false)
    }
  }, [enabled, stream, sourceLang, speaker])

  function stop() {
    try { cleanupRef.current?.() } catch {}
    try { wsRef.current?.close() } catch {}
  }
  function start() { /* re-mount with enabled=true handles this */ }

  return { utterances, connected, error, start, stop }
}
