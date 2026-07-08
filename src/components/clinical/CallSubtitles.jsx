// CallSubtitles — LiveKit-room-scoped subtitle overlay.
//
// Per-side model: each viewer sees only what the OTHER person said, translated
// into the viewer's own language. Provider sees English (patient's speech
// translated), patient sees their own language (provider's speech translated).
//
// MUST be rendered inside <LiveKitRoom> — LiveKit hooks require room context.
//
// Props:
//   • viewerRole      — 'provider' | 'patient' — filters utterances (viewer
//                       only sees the OTHER role's speech)
//   • viewerLang      — language the viewer reads (e.g. 'en' for provider,
//                       'es' for a Spanish-speaking patient)
//   • speakerLang     — language the OTHER person speaks (source lang for STT)
//   • enabled         — parent toggles this via subtitle button
//   • modalOpen       — parent passes true when a clinical modal is open;
//                       pauses subtitles for safety
//   • consultationId  — for persistence in transcript_translated
//   • onInterpreter   — callback fired when "Request interpreter" clicked

import React, { useMemo } from 'react'
import { useLocalParticipant, useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { useLiveTranscription } from '../../lib/useLiveTranscription'
import LiveSubtitles from './LiveSubtitles'

export default function CallSubtitles({
  viewerRole, viewerLang, speakerLang,
  enabled, modalOpen, consultationId, onInterpreter,
}) {
  const { localParticipant } = useLocalParticipant()
  const remoteAudioTracks = useTracks([{ source: Track.Source.Microphone, withPlaceholder: false }])
    .filter(t => t.participant && t.participant.identity !== localParticipant?.identity)

  // The other person's audio = what we want to transcribe (viewer sees it).
  // On the provider view, that's the patient's remote audio.
  // On the patient view, that's the provider's remote audio.
  //
  // IMPORTANT: memoize on the concrete MediaStreamTrack.id, NOT on the
  // remoteAudioTracks array reference. useTracks() returns a fresh array on
  // every LiveKit render tick — depending on it re-fired the whole
  // useLiveTranscription effect on every tick, which minted a new Deepgram
  // ephemeral key each time and burned into the Deepgram Projects API rate
  // limit within seconds ("Too many requests" 429/502 loop).
  const remoteTrack = remoteAudioTracks[0]?.publication?.track?.mediaStreamTrack
  const remoteTrackId = remoteTrack?.id || null
  const otherStream = useMemo(() => {
    if (!enabled || !remoteTrack) return null
    const ms = new MediaStream()
    ms.addTrack(remoteTrack)
    return ms
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, remoteTrackId])

  const otherRole = viewerRole === 'provider' ? 'patient' : 'provider'
  const { utterances } = useLiveTranscription({
    stream: otherStream, sourceLang: speakerLang, speaker: otherRole, enabled,
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
