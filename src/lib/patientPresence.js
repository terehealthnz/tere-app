// Patient-presence helper for the provider video-call flow.
//
// Problem this fixes: providers were clicking Start Video on a queue row where
// the patient wasn't actually in the waiting room (tab closed, phone locked,
// SMS link never opened). The call rang nobody for 15s before SIP fallback
// kicked in, provider had to try phone instead. This helper + the modal that
// consumes it gate the video button on real presence instead of guessing.
//
// Presence is derived from two columns on the consultations row:
//   - in_waiting_room_at  - timestamptz, first time the patient hit /waiting
//   - last_seen_at        - timestamptz, bumped by /api/patient-heartbeat
//                           every ~15s while the patient is on waiting-room
//                           or call screen
//
// Both are maintained server-side; the client reads them straight off the
// consultation row (already in the queue API response payload, no new fetch).
//
// Status rules (STALE_THRESHOLD_SEC = 60):
//   in_waiting_room_at IS NULL                       -> 'never_joined'
//   last_seen_at within 60s of now                   -> 'in_waiting_room'
//   last_seen_at older than 60s                      -> 'joined_but_stale'
//
// 60s is deliberate - iOS WebKit can suspend background tabs for 20-40s, and a
// momentary cell drop on a rural patient will blow a tighter window. Anything
// under 60s produces false-stale flaps on real patients.

export const STALE_THRESHOLD_SEC = 60

/**
 * Derive the presence status of a patient from a consultation row.
 * @param {{ in_waiting_room_at?: string|null, last_seen_at?: string|null }} consult
 * @returns {{
 *   status: 'in_waiting_room' | 'joined_but_stale' | 'never_joined',
 *   lastSeenAgoSec: number | null,
 *   inWaitingRoomSince: Date | null,
 * }}
 */
export function getPatientPresence(consult) {
  if (!consult || !consult.in_waiting_room_at) {
    return { status: 'never_joined', lastSeenAgoSec: null, inWaitingRoomSince: null }
  }

  const inWaitingRoomSince = new Date(consult.in_waiting_room_at)
  const lastSeenTs = consult.last_seen_at ? new Date(consult.last_seen_at).getTime() : null
  const lastSeenAgoSec = lastSeenTs ? Math.max(0, Math.floor((Date.now() - lastSeenTs) / 1000)) : null

  // Patient reached the waiting room but no heartbeat ever landed. Treat as
  // stale rather than never-joined so the UI copy still mentions the earlier
  // arrival (helps the provider pick between "SMS the link" vs "they already
  // left, go phone").
  if (lastSeenAgoSec === null) {
    return { status: 'joined_but_stale', lastSeenAgoSec: null, inWaitingRoomSince }
  }

  const status = lastSeenAgoSec <= STALE_THRESHOLD_SEC ? 'in_waiting_room' : 'joined_but_stale'
  return { status, lastSeenAgoSec, inWaitingRoomSince }
}

/**
 * Inline style object for the presence pill UI. Green for live, amber for
 * stale, grey for never-joined. Matches the pill shape used elsewhere in the
 * queue card (buf / sta badges).
 * @param {'in_waiting_room'|'joined_but_stale'|'never_joined'} status
 */
export function presencePillStyle(status) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: '.625rem',
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: 99,
    whiteSpace: 'nowrap',
    lineHeight: 1.4,
  }
  if (status === 'in_waiting_room') {
    return { ...base, background: '#D1FAE5', color: '#065F46', border: '1px solid #A7F3D0' }
  }
  if (status === 'joined_but_stale') {
    return { ...base, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }
  }
  return { ...base, background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' }
}

/**
 * Display string for a presence object. Uses the heartbeat age when we have
 * one, otherwise falls back to the generic "not yet joined" / "last seen -"
 * copy. Kept short because it has to fit on the queue card pill.
 * @param {{status: string, lastSeenAgoSec: number|null, inWaitingRoomSince: Date|null}} presence
 */
export function presenceLabel(presence) {
  if (!presence) return 'Unknown'
  const { status, lastSeenAgoSec } = presence
  if (status === 'never_joined') return 'Not yet joined'
  if (status === 'in_waiting_room') {
    if (lastSeenAgoSec === null) return 'In waiting room'
    return `In waiting room (${formatAgo(lastSeenAgoSec)} ago)`
  }
  // joined_but_stale
  if (lastSeenAgoSec === null) return 'Joined but inactive'
  return `Last seen ${formatAgo(lastSeenAgoSec)} ago`
}

function formatAgo(sec) {
  if (sec < 60) return `${sec}s`
  const mins = Math.floor(sec / 60)
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h`
}
