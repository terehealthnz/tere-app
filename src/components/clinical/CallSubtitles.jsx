// CallSubtitles — LiveKit-room-scoped wrapper that streams both sides of a
// consultation to Deepgram and renders LiveSubtitles on top of the video.
//
// MUST be rendered inside <LiveKitRoom> — the useLocalParticipant / useTracks
// hooks require room context.
//
// Consumes:
//   • patientLang     — the patient's preferred language (from consultation)
//   • providerLang    — the provider's spoken language (usually 'en')
//   • enabled         — parent toggles this via subtitle button
//   • modalOpen       — parent passes true when a clinical modal is open,
//                       which pauses subtitles for safety
//   • consultationId  — for persistence in transcript_translated
//   • onInterpreter   — callback fired when "Request interpreter" clicked
//
// Merges patient + provider utterances chronologically and passes the
// combined stream to LiveSubtitles.

import React, { useMemo } from 'react'
import { useLocalParticipant, useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { useLiveTranscription } from '../../lib/useLiveTranscription'
import LiveSubtitles from './LiveSubtitles'

export default function CallSubtitles({
  patientLang, providerLang = 'en',
  enabled, modalOpen, consultationId, onInterpreter,
}) {
  const { localParticipant } = useLocalParticipant()

  // Grab local mic track (provider audio) as a MediaStream.
  const providerStream = useMemo(() => {
    if (!enabled || !localParticipant) return null
    const pub = localParticipant.getTrackPublication?.(Track.Source.Microphone)
    const track = pub?.track
    if (!track) return null
    // LiveKit track.mediaStreamTrack is a MediaStreamTrack; wrap in a MediaStream.
    const ms = new MediaStream()
    ms.addTrack(track.mediaStreamTrack)
    return ms
  }, [enabled, localParticipant])

  // Remote audio tracks — patient side. In telehealth we expect one remote.
  const remoteAudioTracks = useTracks([{ source: Track.Source.Microphone, withPlaceholder: false }])
    .filter(t => t.participant && t.participant.identity !== localParticipant?.identity)
  const patientStream = useMemo(() => {
    if (!enabled || remoteAudioTracks.length === 0) return null
    const track = remoteAudioTracks[0].publication?.track
    if (!track?.mediaStreamTrack) return null
    const ms = new MediaStream()
    ms.addTrack(track.mediaStreamTrack)
    return ms
  }, [enabled, remoteAudioTracks])

  const { utterances: providerUtts } = useLiveTranscription({
    stream: providerStream, sourceLang: providerLang, speaker: 'provider', enabled,
  })
  const { utterances: patientUtts } = useLiveTranscription({
    stream: patientStream, sourceLang: patientLang || 'en', speaker: 'patient', enabled,
  })

  // Chronologically merge; keep last ~10 lines fresh.
  const merged = useMemo(() => {
    return [...providerUtts, ...patientUtts]
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
      .slice(-10)
  }, [providerUtts, patientUtts])

  if (!enabled) return null
  return (
    <LiveSubtitles
      recentUtterances={merged}
      targetLang={patientLang || 'en'}
      paused={!!modalOpen}
      onInterpreter={onInterpreter}
      consultationId={consultationId}
    />
  )
}
