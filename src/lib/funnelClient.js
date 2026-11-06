// Shared helper for patient-side funnel telemetry.
//
// Wraps the fire-and-forget beacon pattern used by FunnelTracker so that
// in-flow surfaces (AITriage, Payment, Vitals etc) can emit named
// milestones without duplicating the sendBeacon + sessionStorage dance.
//
// No PHI. The /api/patient-event endpoint rejects any meta key that
// looks like PHI (name, email, nhi, dob, chief_complaint, etc) so callers
// get a 400 if they accidentally try to log patient content.

const SESSION_KEY = 'tere_funnel_session_id'

export function getFunnelSessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY)
    if (!id) {
      id = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
      sessionStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch { return null }
}

/**
 * Fire a named funnel milestone. Fire-and-forget; never throws.
 *
 * @param {string} eventName  Short snake_case identifier (<= 64 chars),
 *                            e.g. 'triage_name_submitted',
 *                            'triage_dob_submitted', 'payment_opened'.
 * @param {object} [opts]
 * @param {string} [opts.path]            Current router path (optional).
 * @param {object} [opts.meta]            Structured context (no PHI keys —
 *                                         server rejects any PHI-shaped
 *                                         meta). Keep to things like
 *                                         { step: 3, lang: 'en', device: 'mobile' }.
 * @param {string} [opts.consultationId]  If the consultation exists at
 *                                         this point in the flow.
 */
export function fireFunnelEvent(eventName, opts = {}) {
  if (!eventName || typeof eventName !== 'string') return
  const sessionId = getFunnelSessionId()
  if (!sessionId) return
  const consultationId = opts.consultationId
    ?? (() => { try { return sessionStorage.getItem('consultationId') || null } catch { return null } })()
  const payload = {
    session_id:      sessionId,
    event_name:      eventName.slice(0, 64),
    path:            opts.path || (typeof window !== 'undefined' ? window.location.pathname : null),
    meta:            opts.meta && typeof opts.meta === 'object' ? opts.meta : {},
    consultation_id: consultationId,
  }
  try {
    const body = JSON.stringify(payload)
    if (navigator?.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      navigator.sendBeacon('/api/patient-event', blob)
      return
    }
    fetch('/api/patient-event', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {}
}
