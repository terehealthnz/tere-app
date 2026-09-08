// AWS Chime SDK Meetings — browser-side wrapper.
//
// Presents a small stable surface that Phase 2 of the LiveKit → Chime
// migration will consume from PatientCall.jsx, ProviderConsult.jsx, and
// FloatingCallWidget.jsx. Isolates the chime-sdk-js API so the callers
// don't need to know about DefaultMeetingSession / DefaultDeviceController /
// AudioVideoObserver directly.
//
// Feature-flag: callers check useChimeSdk() to pick this or the LiveKit
// path. Migration is one commit-per-component behind that flag.
//
// Session lifecycle:
//   const s = await joinMeeting({ meetingResponse, videoEl, audioEl, onEvent })
//   // ...consult happens...
//   await s.leave()   // stops audio/video, closes signaling, releases devices
//
// meetingResponse is the { Meeting, Attendee } shape returned by our own
// /api/chime-meeting?action=create or action=join-patient endpoints.

import {
  ConsoleLogger,
  DefaultDeviceController,
  DefaultMeetingSession,
  LogLevel,
  MeetingSessionConfiguration,
} from 'amazon-chime-sdk-js'
import { apiFetch } from './api'

/**
 * Feature flag. Chime is enabled when any of:
 *   - env `VITE_USE_CHIME_SDK=1` (build-time, prod/preview flip)
 *   - URL `?chime=1` on any page (opt-in per-tab test override; stamped
 *     to sessionStorage so navigation across the SPA preserves it)
 *   - sessionStorage.tere_chime === '1' (set by the URL override above)
 *
 * The URL override lets us test Chime on prod without flipping the
 * global env var — safe because real users never add ?chime=1.
 */
export function useChimeSdk() {
  try {
    if (import.meta.env?.VITE_USE_CHIME_SDK === '1') return true
    if (typeof window !== 'undefined') {
      const qp = new URLSearchParams(window.location.search).get('chime')
      if (qp === '1') {
        try { sessionStorage.setItem('tere_chime', '1') } catch {}
        return true
      }
      if (qp === '0') {
        try { sessionStorage.removeItem('tere_chime') } catch {}
        return false
      }
      try { if (sessionStorage.getItem('tere_chime') === '1') return true } catch {}
    }
  } catch {}
  return false
}

/**
 * Create a Chime meeting via /api/chime-meeting?action=create (provider) or
 * ?action=join-patient (patient side). Server handles auth + region.
 */
export async function createOrJoinMeeting({ role, consultationId }) {
  const action = role === 'provider' ? 'create' : 'join-patient'
  const r = await apiFetch('/api/chime-meeting', {
    method: 'POST',
    body: JSON.stringify({ action, consultationId }),
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) {
    const err = new Error(body.error || `chime-meeting ${action} failed (${r.status})`)
    err.status = r.status
    err.detail = body.detail
    throw err
  }
  return body   // { Meeting, Attendee, region }
}

/**
 * End the provider's meeting. Deletes the Chime meeting on AWS + clears
 * the pointer on the consultations row. Patient side has no equivalent —
 * patients "leave" locally via session.leave().
 */
export async function endMeeting({ consultationId }) {
  const r = await apiFetch('/api/chime-meeting', {
    method: 'POST',
    body: JSON.stringify({ action: 'end', consultationId }),
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body.error || `chime-meeting end failed (${r.status})`)
  return body
}

/**
 * Wire up a Chime meeting session against local video + audio elements.
 * Returns a handle with .leave() and .session (for advanced access —
 * live-subtitles piping into AWS Transcribe hooks off session.audioVideo).
 *
 * @param {object} opts
 * @param {{Meeting: any, Attendee: any}} opts.meetingResponse - from createOrJoinMeeting
 * @param {HTMLVideoElement} opts.localVideoEl - <video> to render local camera
 * @param {HTMLVideoElement[]} opts.remoteVideoEls - pool of <video> for remote tiles
 * @param {HTMLAudioElement} opts.audioEl - <audio> for remote audio mix
 * @param {(event: {type: string, ...}) => void} [opts.onEvent] - lifecycle callback
 * @returns {Promise<{ session: DefaultMeetingSession, leave: () => Promise<void> }>}
 */
export async function joinMeeting({ meetingResponse, localVideoEl, remoteVideoEls, audioEl, onEvent }) {
  if (!meetingResponse?.Meeting || !meetingResponse?.Attendee) {
    throw new Error('meetingResponse missing Meeting or Attendee')
  }

  const logger = new ConsoleLogger('tere-chime', LogLevel.WARN)
  const deviceController = new DefaultDeviceController(logger)
  const config = new MeetingSessionConfiguration(meetingResponse.Meeting, meetingResponse.Attendee)
  const session = new DefaultMeetingSession(config, logger, deviceController)

  const emit = (type, extra = {}) => { try { onEvent?.({ type, ...extra }) } catch {} }

  // Bind audio output early so remote audio starts flowing the moment we join.
  if (audioEl) {
    try { await session.audioVideo.bindAudioElement(audioEl) }
    catch (e) { console.warn('[chime] bindAudioElement failed:', e?.message) }
  }

  // Video tile observer — Chime hands out numeric tileIds for each remote
  // participant. We slot them into the pool of remote <video> elements
  // caller provided. Local tile also arrives here and lands on localVideoEl.
  const tileMap = new Map()   // tileId → HTMLVideoElement
  const remotePool = Array.isArray(remoteVideoEls) ? [...remoteVideoEls] : []
  const observer = {
    videoTileDidUpdate(tileState) {
      if (!tileState.boundAttendeeId) return
      const alreadyBoundEl = tileMap.get(tileState.tileId)
      if (alreadyBoundEl) {
        session.audioVideo.bindVideoElement(tileState.tileId, alreadyBoundEl)
        return
      }
      let targetEl = null
      if (tileState.localTile) targetEl = localVideoEl
      else                     targetEl = remotePool.shift() || null
      if (targetEl) {
        session.audioVideo.bindVideoElement(tileState.tileId, targetEl)
        tileMap.set(tileState.tileId, targetEl)
        emit('tile-added', { tileId: tileState.tileId, local: !!tileState.localTile })
      }
    },
    videoTileWasRemoved(tileId) {
      const el = tileMap.get(tileId)
      if (el) {
        remotePool.unshift(el)
        tileMap.delete(tileId)
      }
      emit('tile-removed', { tileId })
    },
    audioVideoDidStart() { emit('started') },
    audioVideoDidStop(status) { emit('stopped', { status: status?.statusCode?.() }) },
    connectionDidBecomePoor() { emit('connection-poor') },
    connectionDidBecomeGood() { emit('connection-good') },
  }
  session.audioVideo.addObserver(observer)

  // Choose default input devices. Failures here don't block joining — user
  // may connect a mic/camera later via device picker UI.
  try {
    const audioInputs = await session.audioVideo.listAudioInputDevices()
    if (audioInputs.length) await session.audioVideo.startAudioInput(audioInputs[0].deviceId)
  } catch (e) { console.warn('[chime] audio input:', e?.message) }
  try {
    const videoInputs = await session.audioVideo.listVideoInputDevices()
    if (videoInputs.length) {
      await session.audioVideo.startVideoInput(videoInputs[0].deviceId)
      session.audioVideo.startLocalVideoTile()
    }
  } catch (e) { console.warn('[chime] video input:', e?.message) }

  session.audioVideo.start()

  return {
    session,
    async leave() {
      try { session.audioVideo.stopLocalVideoTile() } catch {}
      try { await session.audioVideo.stopVideoInput() } catch {}
      try { await session.audioVideo.stopAudioInput() } catch {}
      try { session.audioVideo.removeObserver(observer) } catch {}
      try { session.audioVideo.stop() } catch {}
    },
  }
}

/**
 * Toggle local audio mute. Returns the new muted state.
 */
export function toggleMute(session) {
  const av = session?.audioVideo
  if (!av) return false
  const nowMuted = !av.realtimeIsLocalAudioMuted()
  if (nowMuted) av.realtimeMuteLocalAudio()
  else          av.realtimeUnmuteLocalAudio()
  return nowMuted
}

/**
 * Toggle local video (stops/starts the local tile).
 */
export async function toggleVideo(session) {
  const av = session?.audioVideo
  if (!av) return false
  const tiles = av.getAllVideoTiles()
  const hasLocal = tiles.some(t => t.state().localTile && t.state().active)
  if (hasLocal) {
    av.stopLocalVideoTile()
    return false
  }
  try {
    const cams = await av.listVideoInputDevices()
    if (cams.length) {
      await av.startVideoInput(cams[0].deviceId)
      av.startLocalVideoTile()
      return true
    }
  } catch (e) { console.warn('[chime] enable video:', e?.message) }
  return false
}
