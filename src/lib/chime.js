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
  VoiceFocusDeviceTransformer,
} from 'amazon-chime-sdk-js'
import { apiFetch } from './api'

/**
 * Chime is the default video/audio path. LiveKit stays as a dead
 * fallback that can be re-enabled with ?chime=0 for one-off debug.
 * Pre-launch — no real users to protect from breakage — so no build-time
 * env flag; the switch is unconditional.
 */
export function useChimeSdk() {
  try {
    if (typeof window !== 'undefined') {
      const qp = new URLSearchParams(window.location.search).get('chime')
      if (qp === '0') {
        try { sessionStorage.setItem('tere_chime', '0') } catch {}
        return false
      }
      if (qp === '1') {
        try { sessionStorage.removeItem('tere_chime') } catch {}
        return true
      }
      try { if (sessionStorage.getItem('tere_chime') === '0') return false } catch {}
    }
  } catch {}
  return true
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
export async function joinMeeting({ meetingResponse, localVideoEl, remoteVideoEls, audioEl, onEvent, audioOnly = false }) {
  if (!meetingResponse?.Meeting || !meetingResponse?.Attendee) {
    throw new Error('meetingResponse missing Meeting or Attendee')
  }

  const logger = new ConsoleLogger('tere-chime', LogLevel.WARN)
  // enableWebAudio is required for Voice Focus (Amazon's ML noise
  // suppression) transform devices to attach — without it Chime throws
  // "Cannot apply transform device without enabling Web Audio" on
  // startAudioInput, and audio never starts at all. Safe to always
  // enable — costs one AudioContext per session.
  const deviceController = new DefaultDeviceController(logger, { enableWebAudio: true })
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

  // Attendee-presence subscription — Chime fires this for every attendee
  // (self included) with `present=true` when they join, `false` when they
  // leave. We filter out self (matching the Attendee.AttendeeId from the
  // meetingResponse) so callers only see the OTHER side joining. Wired to
  // onEvent as 'attendee-joined' / 'attendee-left' so the parent component
  // can flip patientHere without needing to poll or watch tile events.
  const selfAttendeeId = meetingResponse.Attendee.AttendeeId
  try {
    session.audioVideo.realtimeSubscribeToAttendeeIdPresence(
      (attendeeId, present, externalUserId, dropped) => {
        if (attendeeId === selfAttendeeId) return
        emit(present ? 'attendee-joined' : 'attendee-left', {
          attendeeId, externalUserId, dropped: !!dropped,
        })
      }
    )
  } catch (e) { console.warn('[chime] attendee presence subscribe failed:', e?.message) }

  // Pick default input devices, but DO NOT start the local video tile yet —
  // Chime's state machine rejects tile operations before audioVideoDidStart
  // fires ("no transition found from NotConnected with Update"). We queue
  // the tile start inside the observer once the session is live.
  try {
    const audioInputs = await session.audioVideo.listAudioInputDevices()
    if (audioInputs.length) {
      // Amazon Voice Focus — ML noise suppression (Krisp-equivalent). Big
      // UX win for rural NZ calls where dogs / generators / wind trample
      // audio. Falls back to raw mic if Voice Focus unsupported on the
      // browser (older Safari / low-CPU devices).
      const rawDeviceId = audioInputs[0].deviceId
      let inputDevice = rawDeviceId
      try {
        const vfTransformer = await VoiceFocusDeviceTransformer.create()
        if (vfTransformer.isSupported()) {
          const vfDevice = await vfTransformer.createTransformDevice(rawDeviceId)
          if (vfDevice) inputDevice = vfDevice
        }
      } catch (e) { console.warn('[chime] Voice Focus disabled:', e?.message) }
      try {
        await session.audioVideo.startAudioInput(inputDevice)
      } catch (e) {
        // If the transform device rejects (browser quirk, CPU load), retry
        // with the raw mic so the caller still has audio — the transcript
        // may be noisier but the call works.
        console.warn('[chime] transform audio failed, falling back to raw mic:', e?.message)
        await session.audioVideo.startAudioInput(rawDeviceId)
      }
    }
  } catch (e) { console.warn('[chime] audio input:', e?.message) }
  // Only enumerate/start video devices if the caller wants video at join.
  // audioOnly=true keeps the camera fully off (no permission prompt, no
  // startLocalVideoTile) — matches the "consult defaults to phone" UX.
  if (!audioOnly) {
    try {
      const videoInputs = await session.audioVideo.listVideoInputDevices()
      if (videoInputs.length) await session.audioVideo.startVideoInput(videoInputs[0].deviceId)
    } catch (e) { console.warn('[chime] video input:', e?.message) }
  }

  // Wrap observer's audioVideoDidStart to fire startLocalVideoTile once the
  // session is connected — but only when video was actually requested.
  // Avoids the pre-connect NotConnected/Update warning AND keeps the camera
  // dark on phone-first consults.
  const originalStart = observer.audioVideoDidStart
  observer.audioVideoDidStart = function () {
    if (!audioOnly) {
      try { session.audioVideo.startLocalVideoTile() } catch (e) { console.warn('[chime] local tile:', e?.message) }
    }
    originalStart.call(this)
  }

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
 * Start screen-share (provider → patient direction). Uses getDisplayMedia,
 * then hands the stream to Chime as a content share. Chime treats this as
 * a second attendee ("content") which shows up on the patient's video tile
 * pool without displacing the provider's camera feed.
 */
export async function startScreenShare(session) {
  const av = session?.audioVideo
  if (!av) return false
  try {
    // Chime SDK has a built-in helper that prompts + starts.
    await av.startContentShareFromScreenCapture()
    return true
  } catch (e) {
    console.warn('[chime] screen share start failed:', e?.message)
    return false
  }
}

/**
 * Stop screen-share.
 */
export async function stopScreenShare(session) {
  const av = session?.audioVideo
  if (!av) return
  try { await av.stopContentShare() } catch (e) { console.warn('[chime] screen share stop:', e?.message) }
}

/**
 * List available audio input devices (mic + Bluetooth headsets).
 * Returns [{ deviceId, label }].
 */
export async function listAudioInputs(session) {
  const av = session?.audioVideo
  if (!av) return []
  try {
    const devs = await av.listAudioInputDevices()
    return devs.map(d => ({ deviceId: d.deviceId, label: d.label || 'Microphone' }))
  } catch { return [] }
}

/**
 * Swap the active mic to a new device (mid-call). No visible tile
 * disruption — Chime hot-swaps the input.
 */
export async function switchAudioInput(session, deviceId) {
  const av = session?.audioVideo
  if (!av || !deviceId) return false
  try { await av.startAudioInput(deviceId); return true }
  catch (e) { console.warn('[chime] audio input switch failed:', e?.message); return false }
}

/**
 * List available video input devices (front/back camera on mobile,
 * webcams on desktop). Returns [{ deviceId, label }].
 */
export async function listVideoInputs(session) {
  const av = session?.audioVideo
  if (!av) return []
  try {
    const devs = await av.listVideoInputDevices()
    return devs.map(d => ({ deviceId: d.deviceId, label: d.label || 'Camera' }))
  } catch { return [] }
}

/**
 * Cycle to the next video input (e.g. front → back on mobile).
 * Returns the deviceId now active, or null if unchanged.
 */
export async function cycleCamera(session, currentDeviceId) {
  const av = session?.audioVideo
  if (!av) return null
  try {
    const cams = await av.listVideoInputDevices()
    if (cams.length < 2) return null
    const idx = Math.max(0, cams.findIndex(c => c.deviceId === currentDeviceId))
    const next = cams[(idx + 1) % cams.length].deviceId
    await av.startVideoInput(next)
    return next
  } catch (e) { console.warn('[chime] cycle camera failed:', e?.message); return null }
}

/**
 * List available audio OUTPUT devices (speakers / headphones / Bluetooth).
 */
export async function listAudioOutputs(session) {
  const av = session?.audioVideo
  if (!av) return []
  try {
    const devs = await av.listAudioOutputDevices()
    return devs.map(d => ({ deviceId: d.deviceId, label: d.label || 'Speaker' }))
  } catch { return [] }
}

/**
 * Route call audio to a specific speaker / headset. Chime hot-swaps —
 * user hears output on the new device within ~1s.
 */
export async function switchAudioOutput(session, deviceId) {
  const av = session?.audioVideo
  if (!av || !deviceId) return false
  try { await av.chooseAudioOutput(deviceId); return true }
  catch (e) { console.warn('[chime] audio output switch failed:', e?.message); return false }
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
