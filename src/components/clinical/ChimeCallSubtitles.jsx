// ChimeCallSubtitles — Chime SDK Meetings equivalent of CallSubtitles.
//
// Same per-side model as the LiveKit version (viewer sees only what the
// OTHER person said, translated into the viewer's language) but consumes
// a raw MediaStream instead of poking at LiveKit's participants graph.
// Safe to render outside a LiveKitRoom — no LiveKit hooks used.
//
// The parent captures ChimeCall's bound <audio> element via onAudioElReady,
// captureStream()s it once, and passes the resulting MediaStream here. In a
// 1:1 consult the audio element carries only the other person's mixed audio,
// which is exactly what useLiveTranscription wants.
//
// Props (parity with CallSubtitles):
//   • viewerRole      — 'provider' | 'patient'
//   • viewerLang      — language the viewer reads
//   • speakerLang     — the OTHER person's speech language (STT source)
//   • enabled         — parent-controlled kill switch (subtitle toggle)
//   • modalOpen       — pause when a clinical modal is open (safety)
//   • consultationId  — for transcript persistence
//   • onInterpreter   — "Request interpreter" callback
//   • remoteStream    — MediaStream carrying the OTHER person's audio

import React, { useMemo } from 'react'
import { useLiveTranscription } from '../../lib/useLiveTranscription'
import LiveSubtitles from './LiveSubtitles'

export default function ChimeCallSubtitles({
  viewerRole, viewerLang, speakerLang,
  enabled, modalOpen, consultationId, onInterpreter,
  remoteStream,
}) {
  const otherRole = viewerRole === 'provider' ? 'patient' : 'provider'
  const streamForSTT = enabled ? remoteStream : null
  const { utterances } = useLiveTranscription({
    stream: streamForSTT,
    sourceLang: speakerLang,
    speaker: otherRole,
    enabled,
    consultationId,
  })
  const recent = useMemo(() => utterances.slice(-8), [utterances])

  if (!enabled) return null
  return (
    <LiveSubtitles
      recentUtterances={recent}
      targetLang={viewerLang}
      paused={!!modalOpen}
      onInterpreter={onInterpreter}
      consultationId={consultationId}
    />
  )
}
