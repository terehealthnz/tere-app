// Fires a fire-and-forget beacon to /api/patient-event on every route
// change so admin can see where patients get stuck. No PHI — only the
// pathname. session_id is per-tab (sessionStorage) and consultation_id
// is attached when triage has captured one.
//
// Uses navigator.sendBeacon when available so the event survives page
// unloads (patient closing the tab still fires the last-step beacon).

import React from 'react'
import { useLocation } from 'react-router-dom'

const SESSION_KEY = 'tere_funnel_session_id'
const SEEN_PATHS_KEY = '__tere_funnel_seen'  // in-memory only

function getSessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY)
    if (!id) {
      id = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
      sessionStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch { return null }
}

// Route prefixes we care about tracking — everything else (clinician,
// admin, careers, corporate, legal) is ignored to keep the telemetry
// table clean and focused on the patient funnel.
const TRACK_PREFIXES = [
  '/', '/start', '/consent', '/triage', '/consultation-type',
  '/payment', '/payment-return', '/waiting', '/call', '/vitals',
  '/done', '/message-sent', '/triage-review', '/notice-of-privacy-practices',
  '/waitlisted', '/work',
]

function shouldTrack(path) {
  if (!path) return false
  return TRACK_PREFIXES.some(p => path === p || path.startsWith(`${p}/`))
}

function fireEvent(payload) {
  try {
    const body = JSON.stringify(payload)
    if (navigator?.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      navigator.sendBeacon('/api/patient-event', blob)
      return
    }
    fetch('/api/patient-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {}
}

export default function FunnelTracker() {
  const location = useLocation()
  const path = location?.pathname || ''

  React.useEffect(() => {
    if (!shouldTrack(path)) return
    const sessionId = getSessionId()
    if (!sessionId) return
    // De-dupe within the same tab session — bouncing between the same
    // page repeatedly (e.g. React StrictMode double-render) shouldn't
    // fire multiple beacons for the same path.
    try {
      const seen = JSON.parse(sessionStorage.getItem(SEEN_PATHS_KEY) || '[]')
      const key = `${path}|${Date.now() >> 15}`  // ~30s de-dupe bucket
      if (seen.includes(key)) return
      seen.push(key)
      sessionStorage.setItem(SEEN_PATHS_KEY, JSON.stringify(seen.slice(-30)))
    } catch {}
    const consultationId = (() => { try { return sessionStorage.getItem('consultationId') || null } catch { return null } })()
    fireEvent({
      session_id: sessionId,
      event_name: 'pageview',
      path,
      consultation_id: consultationId,
    })
  }, [path])

  return null
}
