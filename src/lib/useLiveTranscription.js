// useLiveTranscription — React hook that streams a MediaStream (LiveKit local
// or remote track) to AWS Transcribe Streaming over WebSocket and emits
// utterances.
//
// Migration note: this used Deepgram until 2026-07-08. Deepgram caps
// ephemeral key creation at ~100/day per project — fine for MVP, fatal at
// clinic scale. Now on AWS Transcribe streaming, same BAA as Bedrock,
// same Sydney region, unlimited by throughput.
//
// Auth flow: server pre-signs a WebSocket URL via SigV4 (see
// api/_transcribe-token.js), returns the URL, client opens directly.
//
// Wire format: AWS event-stream binary frames.
//   Outgoing: AudioEvent (headers + payload = PCM chunk)
//   Incoming: TranscriptEvent (JSON-encoded transcript alternatives)
//
// Utterance shape:
//   { at: iso, speaker, text, lang, isFinal }
// Interim results (isFinal=false) are emitted as Transcribe partial results.

import { useEffect, useRef, useState } from 'react'
import { apiFetch } from './api'

// Map our internal ISO 639-1 codes to AWS Transcribe streaming language
// codes. Note: AWS uses region-tagged codes (en-US not en). Māori (mi),
// Samoan (sm), and Arabic (ar) are not supported by AWS streaming — the
// CallSubtitles wrapper checks this list and refuses to open the WS,
// falling back to a "AI subtitles unavailable — Language Line NZ"
// message.
const AWS_LANG_MAP = {
  en:  'en-US',   // Medical Emergency vocab is best in en-US
  es:  'es-US',   // Latin American Spanish (best for NZ/Pacific patients)
  fr:  'fr-FR',
  de:  'de-DE',
  nl:  'nl-NL',
  it:  'it-IT',
  pt:  'pt-BR',
  ja:  'ja-JP',
  ko:  'ko-KR',
  zh:  'zh-CN',
  // Explicitly unmapped — treated as "unsupported" by isSupported() below:
  // mi, sm, ar, hi
}

export function isTranscribeSupported(sourceLang) {
  return Object.prototype.hasOwnProperty.call(AWS_LANG_MAP, sourceLang)
}

async function fetchSignedUrl({ consultationId, languageCode, sampleRate }) {
  const res = await apiFetch('/api/transcribe-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ consultationId: consultationId || null, languageCode, sampleRate }),
  })
  if (!res.ok) throw new Error(`transcribe-token failed: ${res.status}`)
  return res.json()
}

// ─── AWS event-stream binary format ─────────────────────────────────────────
//
// Frame layout (see:
//   https://docs.aws.amazon.com/transcribe/latest/dg/event-stream.html
// ):
//   [ Total length: uint32 BE ]
//   [ Headers length: uint32 BE ]
//   [ Prelude CRC (CRC-32 of first 8 bytes): uint32 BE ]
//   [ Headers: N bytes ]
//   [ Payload: M bytes ]
//   [ Message CRC (CRC-32 of everything above): uint32 BE ]
//
// Header entry layout:
//   [ Name length: uint8 ]
//   [ Name: name-length bytes ASCII ]
//   [ Header value type: uint8 (7 = UTF-8 string) ]
//   [ Value length: uint16 BE ]
//   [ Value: value-length bytes UTF-8 ]

// CRC-32 (IEEE 802.3 poly 0xEDB88320) — the same one used by zlib. AWS's
// event-stream uses this exact algorithm. Table-driven implementation is
// fast enough for the volume we push (~62 audio frames/sec).
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()
function crc32(bytes) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < bytes.length; i++) c = CRC32_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function encodeHeader(name, value) {
  const nameBytes = new TextEncoder().encode(name)
  const valBytes  = new TextEncoder().encode(value)
  const total = 1 + nameBytes.length + 1 + 2 + valBytes.length
  const buf = new Uint8Array(total)
  const view = new DataView(buf.buffer)
  let o = 0
  buf[o++] = nameBytes.length
  buf.set(nameBytes, o); o += nameBytes.length
  buf[o++] = 7 // UTF-8 string value type
  view.setUint16(o, valBytes.length, false); o += 2
  buf.set(valBytes, o)
  return buf
}

function encodeAudioEvent(pcmBuffer) {
  const headers = concatBytes([
    encodeHeader(':content-type', 'application/octet-stream'),
    encodeHeader(':event-type',  'AudioEvent'),
    encodeHeader(':message-type','event'),
  ])
  const payload = new Uint8Array(pcmBuffer)
  const totalLen   = 4 + 4 + 4 + headers.length + payload.length + 4
  const headersLen = headers.length

  const frame = new Uint8Array(totalLen)
  const view = new DataView(frame.buffer)
  view.setUint32(0, totalLen,  false)
  view.setUint32(4, headersLen, false)
  const preludeCRC = crc32(new Uint8Array(frame.buffer, 0, 8))
  view.setUint32(8, preludeCRC, false)
  frame.set(headers, 12)
  frame.set(payload, 12 + headers.length)
  const bodyCRC = crc32(new Uint8Array(frame.buffer, 0, totalLen - 4))
  view.setUint32(totalLen - 4, bodyCRC, false)
  return frame
}

function concatBytes(arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const a of arrays) { out.set(a, o); o += a.length }
  return out
}

// Decode a single event-stream frame from AWS Transcribe. Returns the parsed
// headers + payload text (JSON). Throws on prelude/message CRC mismatch.
function decodeFrame(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const totalLen   = view.getUint32(0, false)
  const headersLen = view.getUint32(4, false)
  const headersStart = 12
  const payloadStart = headersStart + headersLen
  const payloadEnd   = totalLen - 4

  const headers = {}
  let o = headersStart
  while (o < payloadStart) {
    const nameLen = bytes[o++]
    const name = new TextDecoder().decode(bytes.subarray(o, o + nameLen))
    o += nameLen
    const type = bytes[o++]
    if (type === 7) {
      const valLen = view.getUint16(o, false); o += 2
      headers[name] = new TextDecoder().decode(bytes.subarray(o, o + valLen))
      o += valLen
    } else {
      // Other value types (uuid, int, etc.) — skip length-prefixed
      const valLen = view.getUint16(o, false); o += 2
      o += valLen
    }
  }
  const payload = new TextDecoder().decode(bytes.subarray(payloadStart, payloadEnd))
  return { headers, payload }
}

// ─── Audio pipe ─────────────────────────────────────────────────────────────
//
// Converts a MediaStream to 16-bit 16kHz linear PCM chunks and forwards each
// chunk (wrapped as an AudioEvent frame) to the WebSocket. Same shape as
// the old Deepgram pipe; only the framing changed.
function pipeMediaStream(stream, onFrame) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  const source = ctx.createMediaStreamSource(stream)
  const processor = ctx.createScriptProcessor(4096, 1, 1)
  source.connect(processor)
  processor.connect(ctx.destination)
  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0)
    const pcm = new Int16Array(input.length)
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]))
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    onFrame(encodeAudioEvent(pcm.buffer))
  }
  return () => {
    processor.disconnect()
    source.disconnect()
    ctx.close().catch(() => {})
  }
}

export function useLiveTranscription({ stream, sourceLang = 'en', speaker = 'patient', enabled = false, consultationId = null }) {
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(null)
  const [utterances, setUtterances] = useState([])
  const wsRef = useRef(null)
  const cleanupRef = useRef(null)

  useEffect(() => {
    if (!enabled || !stream) return

    const languageCode = AWS_LANG_MAP[sourceLang]
    if (!languageCode) {
      setError(`Language ${sourceLang} not supported by AWS Transcribe streaming`)
      return
    }

    let cancelled = false
    async function connect() {
      try {
        const { url } = await fetchSignedUrl({ consultationId, languageCode, sampleRate: 16000 })
        if (cancelled) return
        const ws = new WebSocket(url)
        ws.binaryType = 'arraybuffer'
        wsRef.current = ws

        ws.onopen = () => {
          setConnected(true)
          cleanupRef.current = pipeMediaStream(stream, (frame) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(frame)
          })
        }

        ws.onmessage = (evt) => {
          try {
            const bytes = new Uint8Array(evt.data)
            const { headers, payload } = decodeFrame(bytes)
            // AWS uses `:message-type` = 'event' or 'exception'.
            if (headers[':message-type'] === 'exception') {
              const parsed = JSON.parse(payload)
              setError(parsed.Message || headers[':exception-type'] || 'Transcribe exception')
              return
            }
            if (headers[':event-type'] !== 'TranscriptEvent') return
            const parsed = JSON.parse(payload)
            const results = parsed?.Transcript?.Results || []
            for (const r of results) {
              const alt = r?.Alternatives?.[0]
              const text = alt?.Transcript
              if (!text?.trim()) continue
              const isFinal = !r.IsPartial
              const utt = { at: new Date().toISOString(), speaker, text, lang: sourceLang, isFinal }
              setUtterances(prev => {
                if (prev.length && !prev[prev.length - 1].isFinal && !isFinal) {
                  const next = prev.slice(0, -1); next.push(utt); return next
                }
                return [...prev, utt].slice(-40)
              })
            }
          } catch (e) {
            // Silently swallow decode errors — a corrupt frame shouldn't kill
            // the whole subtitle stream.
          }
        }

        ws.onerror = () => { if (!cancelled) setError('Transcribe connection error') }
        ws.onclose = () => { if (!cancelled) setConnected(false) }
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
  }, [enabled, stream, sourceLang, speaker, consultationId])

  function stop() {
    try { cleanupRef.current?.() } catch {}
    try { wsRef.current?.close() } catch {}
  }
  function start() { /* re-mount with enabled=true handles this */ }

  return { utterances, connected, error, start, stop }
}
