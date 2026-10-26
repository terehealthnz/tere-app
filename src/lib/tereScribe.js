/**
 * Tere Scribe
 * Proprietary AI clinical documentation engine.
 * Deepgram (nova-3-medical, en-NZ) → transcript → Claude (Bedrock) → structured SOAP notes
 */
import { apiFetch } from './api'

// Synchronous transcription via Deepgram. Reverted from AWS Transcribe on
// 2026-09-28 - Transcribe rejected en-NZ and the empty-blob race + missing
// UI on Chime broke the whole path before launch. Deepgram returns text
// inline in <0.5s for a 10-min call - no polling, no job IDs.
export async function transcribeAudio(audioBlob) {
  const res = await apiFetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': audioBlob.type || 'audio/webm' },
    body: audioBlob,
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Transcription failed: ${err || res.status}`)
  }
  const body = await res.json()
  return body.text || ''
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
// after a live test with Justin - scribe uploaded 0 bytes.
//
// This version instead attaches to a live LiveKit Room, pulls both the
// local audio track (provider mic - guaranteed live because the remote
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
    // AudioNode per live track, keyed on the underlying MediaStreamTrack id
    // so we can swap individual sources in and out as LiveKit republishes.
    // Pre-fix (2026-10-25) the collection was a plain array snapshotted at
    // start(); when a track republished mid-call the old (dead) node stayed
    // connected and silently recorded nothing while the new track went
    // unmixed. Ian reported this as "mic cutting out" on 2026-10-25.
    this.sourceByTrackId = new Map()
    this.room          = opts.room || null
    // Chime path: HTMLAudioElement whose captureStream() emits the mixed
    // remote audio Chime binds via bindAudioElement. Local mic is captured
    // via a fresh getUserMedia handle (see #collectChimeAudioStreams).
    this.chimeAudioEl  = opts.chimeAudioEl || null
    // LiveKit event handlers. Held on the instance so stop() can detach.
    //   trackSubscribed      - remote patient publishes audio post-start
    //   trackUnsubscribed    - remote track dies (hang-up, network drop)
    //   localTrackPublished  - provider mic republishes (device swap /
    //                          Bluetooth switch / iOS audio-session reset)
    //   localTrackUnpublished - provider mic unpublished mid-call
    this._onTrackSubscribed = null
    this._onTrackUnsubscribed = null
    this._onLocalTrackPublished = null
    this._onLocalTrackUnpublished = null
    // iOS Safari suspends AudioContext when the tab backgrounds or the
    // audio session is interrupted (incoming phone call, Siri, screen off
    // without Wake Lock). Visibility handler resumes on return; watchdog
    // interval catches the other suspension causes.
    this._visibilityHandler = null
    this._resumeWatchdog = null
  }

  async start() {
    // Preferred path: mix LiveKit tracks via WebAudio. Only works if we've
    // been handed a LiveKit Room reference with at least one active audio
    // track. Both the provider's local audio and any remote audio tracks
    // (there'll be one per remote participant - patient) get wired into
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
      // iOS Safari starts AudioContext suspended if construction didn't happen
      // directly in a user-gesture handler. On the provider side scribe fires
      // on room-connect which is already async, so resume() unblocks it.
      try { if (this.audioContext.state === 'suspended') await this.audioContext.resume() } catch {}
      this.destinationNode = this.audioContext.createMediaStreamDestination()
      for (const mediaStream of mixedStreams) this.#addSource(mediaStream)
      this.stream = this.destinationNode.stream

      // Live wiring: splice tracks in/out as LiveKit publishes and unpublishes
      // them. Initial start() snapshot only sees what's live at that instant.
      // Four events to cover:
      //   trackSubscribed      - patient publishes audio AFTER scribe starts
      //                          (common: patient Start-Call gate, task #480)
      //   trackUnsubscribed    - remote track dies without being replaced
      //   localTrackPublished  - provider mic republishes (device switch,
      //                          Bluetooth, iOS audio-session reset)
      //   localTrackUnpublished - provider mic unpublished mid-call
      // Without the un-/re-publish listeners the mix freezes to whatever was
      // live at start(); when a device republishes the old source stays
      // connected to a dead MediaStreamTrack and the recorder silently
      // captures nothing. Event names are string literals to avoid pulling
      // in a livekit-client enum import.
      if (this.room) {
        this._onTrackSubscribed = (track) => {
          if (track?.kind !== 'audio') return
          this.#addSource(this.#mediaStreamFromLivekitTrack(track))
        }
        this._onTrackUnsubscribed = (track) => {
          if (track?.kind !== 'audio') return
          const key = track.mediaStreamTrack?.id
          if (key) this.#removeSource(key)
        }
        this._onLocalTrackPublished = (pub) => {
          const t = pub?.track
          if (!t || (t.kind && t.kind !== 'audio')) return
          this.#addSource(this.#mediaStreamFromLivekitTrack(t))
        }
        this._onLocalTrackUnpublished = (pub) => {
          const key = pub?.track?.mediaStreamTrack?.id
          if (key) this.#removeSource(key)
        }
        try { this.room.on('trackSubscribed', this._onTrackSubscribed) } catch {}
        try { this.room.on('trackUnsubscribed', this._onTrackUnsubscribed) } catch {}
        try { this.room.on('localTrackPublished', this._onLocalTrackPublished) } catch {}
        try { this.room.on('localTrackUnpublished', this._onLocalTrackUnpublished) } catch {}
      }

      // AudioContext suspension recovery. iOS Safari suspends on tab
      // background / audio-session interruption and MediaRecorder goes
      // silent until it resumes. visibilitychange catches foreground
      // return; the watchdog catches session interruptions where the tab
      // never fully backgrounded (incoming call, Siri). Both resume calls
      // are no-ops when already running.
      this._visibilityHandler = () => {
        if (!document.hidden && this.audioContext?.state === 'suspended') {
          this.audioContext.resume().catch(() => {})
        }
      }
      try { document.addEventListener('visibilitychange', this._visibilityHandler) } catch {}
      this._resumeWatchdog = setInterval(() => {
        if (this.audioContext?.state === 'suspended') {
          this.audioContext.resume().catch(() => {})
        }
      }, 5000)
    } else {
      // Fallback path - no LiveKit tracks, so grab the mic directly.
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
    // iOS Safari (and Chrome-on-iOS, which is Safari underneath) do NOT
    // support audio/webm. Trying to construct MediaRecorder with
    // mimeType:'audio/webm' throws NotSupportedError, start() rejects, and
    // scribe silently never records anything - which is exactly what Patrick
    // saw on his phone 2026-10-03. Pick the first supported type from a
    // priority-ordered list; if none, construct without options so the
    // browser picks its own default. Deepgram transcribes mp4/aac/webm all
    // fine. The chosen type also gets stamped on the Blob in stop() so the
    // Content-Type header to /api/transcribe matches the container.
    const PREFERRED_TYPES = [
      'audio/webm;codecs=opus',  // desktop Chrome / Firefox / Edge
      'audio/webm',               // older desktop fallback
      'audio/mp4;codecs=mp4a.40.2', // iOS Safari preferred (AAC-LC)
      'audio/mp4',                // iOS Safari fallback
      'audio/aac',                // some Android browsers
    ]
    const picked = PREFERRED_TYPES.find(t => {
      try { return MediaRecorder.isTypeSupported(t) } catch { return false }
    })
    this.recorderMime = picked || ''
    try {
      this.mediaRecorder = picked
        ? new MediaRecorder(this.stream, { mimeType: picked })
        : new MediaRecorder(this.stream)
    } catch (e) {
      console.error('[tereScribe] MediaRecorder construction failed:', e?.message, 'picked:', picked)
      // Last-ditch: try without options so the browser picks whatever it can.
      this.mediaRecorder = new MediaRecorder(this.stream)
    }
    this.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) this.chunks.push(e.data) }
    // Surface recorder-level failures (previously silent). If the browser
    // kills the recorder mid-call we at least get a console breadcrumb for
    // post-mortem; without this we only noticed via 0-byte final blobs.
    this.mediaRecorder.onerror = e => {
      console.error('[tereScribe] MediaRecorder error:', e?.error?.name || e?.error?.message || e?.error || e)
    }
    this.mediaRecorder.start(1000)
  }

  stop() {
    return new Promise(resolve => {
      // If start() was never called (shouldn't happen but defensive), resolve
      // with an empty blob so the caller's error handling kicks in cleanly.
      if (!this.mediaRecorder) return resolve(new Blob([], { type: 'audio/webm' }))
      this.mediaRecorder.onstop = () => {
        // Stamp the blob with whatever container the recorder actually used
        // (iOS: audio/mp4, desktop: audio/webm) so Deepgram gets the right
        // Content-Type via transcribeAudio() below.
        const blobType = this.mediaRecorder.mimeType || this.recorderMime || 'audio/webm'
        const blob = new Blob(this.chunks, { type: blobType })
        // Clean up any resources we own. LiveKit tracks (roomTracks path) are
        // owned by the Room, so we DO NOT stop them - only the mic stream we
        // opened ourselves (fallbackStream) + any WebAudio nodes.
        if (this.room) {
          try { if (this._onTrackSubscribed)       this.room.off('trackSubscribed',       this._onTrackSubscribed) } catch {}
          try { if (this._onTrackUnsubscribed)     this.room.off('trackUnsubscribed',     this._onTrackUnsubscribed) } catch {}
          try { if (this._onLocalTrackPublished)   this.room.off('localTrackPublished',   this._onLocalTrackPublished) } catch {}
          try { if (this._onLocalTrackUnpublished) this.room.off('localTrackUnpublished', this._onLocalTrackUnpublished) } catch {}
        }
        this._onTrackSubscribed = null
        this._onTrackUnsubscribed = null
        this._onLocalTrackPublished = null
        this._onLocalTrackUnpublished = null
        if (this._visibilityHandler) {
          try { document.removeEventListener('visibilitychange', this._visibilityHandler) } catch {}
          this._visibilityHandler = null
        }
        if (this._resumeWatchdog) {
          try { clearInterval(this._resumeWatchdog) } catch {}
          this._resumeWatchdog = null
        }
        try { for (const src of this.sourceByTrackId.values()) src.disconnect() } catch {}
        this.sourceByTrackId.clear()
        try { this.destinationNode?.disconnect?.() } catch {}
        try { this.audioContext?.close?.() } catch {}
        if (this.fallbackStream) this.fallbackStream.getTracks().forEach(t => t.stop())
        resolve(blob)
      }
      this.mediaRecorder.stop()
    })
  }

  // Add a MediaStream to the live mix, keyed on its first audio track id so
  // we never double-add the same track. Called from both the initial start()
  // snapshot and all four LiveKit publish/subscribe handlers.
  #addSource(mediaStream) {
    if (!mediaStream || !this.audioContext || !this.destinationNode) return
    const t = mediaStream.getAudioTracks?.()[0]
    const key = t?.id
    if (!key || this.sourceByTrackId.has(key)) return
    try {
      const src = this.audioContext.createMediaStreamSource(mediaStream)
      src.connect(this.destinationNode)
      this.sourceByTrackId.set(key, src)
      // Belt-and-braces: if the underlying MediaStreamTrack ends without
      // LiveKit raising a Track(Un)subscribed event (seen on some mobile
      // network blips), drop the dead source so the mix doesn't stall.
      try { t.addEventListener('ended', () => this.#removeSource(key), { once: true }) } catch {}
    } catch (e) {
      console.warn('[tereScribe] addSource failed:', e?.message)
    }
  }

  #removeSource(trackId) {
    const src = this.sourceByTrackId.get(trackId)
    if (!src) return
    try { src.disconnect() } catch {}
    this.sourceByTrackId.delete(trackId)
  }

  #mediaStreamFromLivekitTrack(track) {
    if (!track) return null
    return track.mediaStream
      || (track.mediaStreamTrack && new MediaStream([track.mediaStreamTrack]))
      || null
  }

  // Chime path: remote audio is mixed by Chime into the bound audio element,
  // so HTMLAudioElement.captureStream() gives us the patient's voice. Local
  // mic is captured via a fresh getUserMedia - the browser tolerates a
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
  // Returns an array of MediaStream objects - one per track - so the caller
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
