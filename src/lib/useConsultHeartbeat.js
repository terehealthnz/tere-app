// useConsultHeartbeat — pings /api/consult-heartbeat every 60s while a
// provider surface (ConsultView / ProviderConsult / ClinicianPatient)
// is mounted, so the abandoned-consult cron sweep (30-min threshold,
// see api/_cron-release-abandoned-consults.js) doesn't release a
// legitimately-open consult during a long phone call or mid-note-writing.
//
// The endpoint only bumps updated_at when the row is currently pinned to
// the calling provider AND status IN ('in_progress','reviewing') — see
// _consult-heartbeat.js. Any other state → the endpoint returns
// { active: false } and this hook stops heartbeating.

import { useEffect, useRef } from 'react'
import { apiFetch } from './api'

const HEARTBEAT_MS = 60 * 1000

export function useConsultHeartbeat(consultationId, enabled = true) {
  const active = useRef(true)
  useEffect(() => {
    if (!consultationId || !enabled) return
    active.current = true
    let stopped = false

    const beat = async () => {
      if (stopped) return
      try {
        const r = await apiFetch('/api/consult-heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consultationId }),
        })
        const j = await r.json().catch(() => ({}))
        if (j?.active === false) {
          // Consult was released / completed / reassigned — stop pinging.
          stopped = true
        }
      } catch (e) {
        // Network hiccup — keep trying on the next tick.
      }
    }

    // Fire once immediately so a freshly-admitted consult can't be swept
    // by a cron tick that lands in the first 60s.
    beat()
    const id = setInterval(beat, HEARTBEAT_MS)
    return () => { stopped = true; clearInterval(id) }
  }, [consultationId, enabled])
}
