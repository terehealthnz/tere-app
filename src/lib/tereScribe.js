/**
 * Tere Scribe
 * Proprietary AI clinical documentation engine.
 * Deepgram Nova-3 Medical → transcript → Claude (Anthropic) → structured SOAP notes
 */
import { apiFetch } from './api'

// ── Transcription via Deepgram ────────────────────────────────────────────────
export async function transcribeAudio(audioBlob) {
  const res = await apiFetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': audioBlob.type || 'audio/webm' },
    body: audioBlob,
  })
  if (!res.ok) throw new Error('Transcription failed')
  const { text } = await res.json()
  return text
}

// ── Note generation via Claude ────────────────────────────────────────────────
// body should match _generate-notes.js shape: { triage, vitals, prescriptions, ... }
export async function generateNotes(transcript, body = {}) {
  const res = await apiFetch('/api/generate-notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, ...body }),
  })
  if (!res.ok) throw new Error('Note generation failed')
  return res.json()
}

// ── Audio recorder helper ─────────────────────────────────────────────────────
//
// The old recorder called navigator.mediaDevices.getUserMedia({audio}) to
// grab a second, independent mic stream in parallel with LiveKit. That
// silently produced 0-byte blobs in real production calls: on some browsers
// the second mic acquisition comes up muted (the tab has surrendered the
// device to LiveKit), and MediaRecorder emits ondataavailable with size 0
// forever. /api/transcribe then rejected the empty blob with a 400 and the
// transcript stayed null. Verified in prod via Vercel logs on 2026-08-19
// after a live test with Justin — scribe uploaded 0 bytes.
//
// This version instead attaches to a live LiveKit Room, pulls both the
// local audio track (provider mic — guaranteed live because the remote
// party can hear us) and any remote audio tracks (patient side), mixes
// them via WebAudio so a single stereo/mixed stream reaches MediaRecorder.
// If a LiveKit room isn't available (e.g. old ProviderConsult still in use
// somewhere), falls back to the old getUserMedia path with an explicit
// zero-byte guard.
export class ConsultationRecorder {
  constructor(opts = {}) {
    this.mediaRecorder = null
    this.chunks        = []
    this.stream        = null         // final mixed stream fed into MediaRecorder
    this.fallbackStream = null        // mic stream if we had to getUserMedia
    this.audioContext  = null
    this.destinationNode = null
    this.sourceNodes   = []
    this.room          = opts.room || null
  }

  async start() {
    // Preferred path: mix LiveKit tracks via WebAudio. Only works if we've
    // been handed a LiveKit Room reference with at least one active audio
    // track. Both the provider's local audio and any remote audio tracks
    // (there'll be one per remote participant — patient) get wired into
    // a single MediaStreamDestination that MediaRecorder can record.
    const roomTracks = this.#collectLiveKitAudioTracks()

    if (roomTracks.length > 0) {
      const AC = window.AudioContext || window.webkitAudioContext
      this.audioContext = new AC()
      this.destinationNode = this.audioContext.createMediaStreamDestination()
      for (const mediaStream of roomTracks) {
        const src = this.audioContext.createMediaStreamSource(mediaStream)
        src.connect(this.destinationNode)
        this.sourceNodes.push(src)
      }
      this.stream = this.destinationNode.stream
    } else {
      // Fallback path — no LiveKit tracks, so grab the mic directly.
      // Only reached from callers that don't own a Room (rare).
      try {
        this.fallbackStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 }
        })
      } catch (e) {
        throw new Error('Microphone access denied. Please allow microphone access.')
      }
      this.stream = this.fallbackStream
    }

    this.chunks = []
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
    })
    this.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) this.chunks.push(e.data) }
    this.mediaRecorder.start(1000)
  }

  stop() {
    return new Promise(resolve => {
      // If start() was never called (shouldn't happen but defensive), resolve
      // with an empty blob so the caller's error handling kicks in cleanly.
      if (!this.mediaRecorder) return resolve(new Blob([], { type: 'audio/webm' }))
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' })
        // Clean up any resources we own. LiveKit tracks (roomTracks path) are
        // owned by the Room, so we DO NOT stop them — only the mic stream we
        // opened ourselves (fallbackStream) + any WebAudio nodes.
        try { this.sourceNodes.forEach(n => n.disconnect()) } catch {}
        try { this.destinationNode?.disconnect?.() } catch {}
        try { this.audioContext?.close?.() } catch {}
        if (this.fallbackStream) this.fallbackStream.getTracks().forEach(t => t.stop())
        resolve(blob)
      }
      this.mediaRecorder.stop()
    })
  }

  // Collect all currently-published audio tracks from the LiveKit Room:
  // - local participant's mic (guaranteed live if they're on the call)
  // - each remote participant's audio (patient's mic if they're connected)
  // Returns an array of MediaStream objects — one per track — so the caller
  // can pipe each into a WebAudio source node.
  #collectLiveKitAudioTracks() {
    if (!this.room) return []
    const streams = []
    try {
      // Local audio
      const local = this.room.localParticipant
      if (local?.audioTrackPublications) {
        for (const [, pub] of local.audioTrackPublications) {
          const track = pub.track
          const ms = track?.mediaStream || (track?.mediaStreamTrack && new MediaStream([track.mediaStreamTrack]))
          if (ms) streams.push(ms)
        }
      }
      // Remote audio (per remote participant)
      const remotes = this.room.remoteParticipants
      if (remotes) {
        for (const [, p] of remotes) {
          for (const [, pub] of (p.audioTrackPublications || [])) {
            const track = pub.track
            const ms = track?.mediaStream || (track?.mediaStreamTrack && new MediaStream([track.mediaStreamTrack]))
            if (ms) streams.push(ms)
          }
        }
      }
    } catch (e) {
      console.warn('[tereScribe] LiveKit track collection failed:', e.message)
    }
    return streams
  }
}
