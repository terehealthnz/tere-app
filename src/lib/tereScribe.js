/**
 * Tere Scribe
 * Proprietary AI clinical documentation engine.
 * AWS Transcribe (ap-southeast-2) → transcript → Claude (Bedrock) → structured SOAP notes
 */
import { apiFetch } from './api'

// ── Transcription via AWS Transcribe (batch) ─────────────────────────────────
// POSTs the recording to /api/transcribe which uploads to S3 and starts a
// TranscriptionJob. We then poll /api/transcribe-status until COMPLETED (or
// FAILED / timeout) — Transcribe usually finishes in roughly 0.3-0.5× the
// audio duration, so a 10-min consult transcribes in ~3-5 min. Timeout cap
// is generous to handle the occasional slow batch under queue pressure.
const POLL_INTERVAL_MS = 4000
const MAX_WAIT_MS      = 10 * 60 * 1000    // 10 minutes

export async function transcribeAudio(audioBlob) {
  const startRes = await apiFetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': audioBlob.type || 'audio/webm' },
    body: audioBlob,
  })
  if (!startRes.ok) throw new Error('Transcription start failed')
  const { jobName } = await startRes.json()
  if (!jobName) throw new Error('Transcription: no jobName returned')

  const deadline = Date.now() + MAX_WAIT_MS
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    const r = await apiFetch(`/api/transcribe-status?jobName=${encodeURIComponent(jobName)}`)
    if (!r.ok) throw new Error(`Transcription status ${r.status}`)
    const body = await r.json()
    if (body.status === 'completed') return body.text || ''
    if (body.status === 'failed')    throw new Error(`Transcription failed: ${body.error || 'unknown'}`)
    // in_progress / queued / unknown → keep polling
  }
  throw new Error('Transcription timed out')
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
    // Chime path: HTMLAudioElement whose captureStream() emits the mixed
    // remote audio Chime binds via bindAudioElement. Local mic is captured
    // via a fresh getUserMedia handle (see #collectChimeAudioStreams).
    this.chimeAudioEl  = opts.chimeAudioEl || null
  }

  async start() {
    // Preferred path: mix LiveKit tracks via WebAudio. Only works if we've
    // been handed a LiveKit Room reference with at least one active audio
    // track. Both the provider's local audio and any remote audio tracks
    // (there'll be one per remote participant — patient) get wired into
    // a single MediaStreamDestination that MediaRecorder can record.
    let mixedStreams = this.#collectLiveKitAudioTracks()

    // Chime path: no LiveKit Room but a Chime audio element. Grab remote
    // mixed audio from the element + a parallel mic handle for local audio.
    if (mixedStreams.length === 0 && this.chimeAudioEl) {
      mixedStreams = await this.#collectChimeAudioStreams()
    }

    if (mixedStreams.length > 0) {
      const AC = window.AudioContext || window.webkitAudioContext
      this.audioContext = new AC()
      this.destinationNode = this.audioContext.createMediaStreamDestination()
      for (const mediaStream of mixedStreams) {
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

  // Chime path: remote audio is mixed by Chime into the bound audio element,
  // so HTMLAudioElement.captureStream() gives us the patient's voice. Local
  // mic is captured via a fresh getUserMedia — the browser tolerates a
  // parallel handle to the same device Chime is already using. If mic
  // capture fails we still return the remote-only stream (better than
  // nothing for post-call transcript).
  async #collectChimeAudioStreams() {
    const streams = []
    try {
      const captureFn = this.chimeAudioEl?.captureStream
        || this.chimeAudioEl?.mozCaptureStream    // Firefox
      if (typeof captureFn === 'function') {
        const remote = captureFn.call(this.chimeAudioEl)
        if (remote?.getAudioTracks?.().length) streams.push(remote)
      }
    } catch (e) {
      console.warn('[tereScribe] Chime remote captureStream failed:', e?.message)
    }
    try {
      this.fallbackStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 }
      })
      streams.push(this.fallbackStream)
    } catch (e) {
      console.warn('[tereScribe] Chime local mic getUserMedia failed:', e?.message)
    }
    return streams
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
