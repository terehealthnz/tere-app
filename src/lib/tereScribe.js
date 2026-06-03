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
export class ConsultationRecorder {
  constructor() {
    this.mediaRecorder = null
    this.chunks        = []
    this.stream        = null
  }

  async start() {
    // Capture system audio (tab) and microphone
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 }
      })
    } catch (e) {
      throw new Error('Microphone access denied. Please allow microphone access.')
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
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' })
        this.stream.getTracks().forEach(t => t.stop())
        resolve(blob)
      }
      this.mediaRecorder.stop()
    })
  }
}
