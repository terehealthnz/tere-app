// Consultation URL helpers.
//
// Pen-test #308 (L-3) fix: keep consultation UUIDs out of URL paths + query
// strings so they don't leak into:
//   - Server access logs (Vercel + Cloudflare — browsers never send the
//     fragment part of a URL over HTTP)
//   - Referer headers to third-party assets (fonts, Stripe, etc)
//
// Fragments still land in browser history + address bar, so this doesn't
// close ALL leak vectors — but it kills the two that leave our operator
// control. Combined with the M-4/M-5 patient-session-token gate, a leaked
// consultation id is not a privileged handle any more; this is soft-
// privacy hardening on top of that.
//
// Rollout: new navigate() call sites use makeConsultUrl(). Existing URLs
// (bookmarks, in-flight sessions, deep-link emails) keep working via the
// legacy /:id routes that stay registered alongside the new fragment
// routes.
//
// Usage in a page component:
//   import { useConsultId } from '../../lib/consultUrl'
//   const id = useConsultId()   // reads #id= first, falls back to :id
//
// Usage in a navigate() call:
//   import { makeConsultUrl } from '../../lib/consultUrl'
//   navigate(makeConsultUrl('/waiting', consultationId))
//   // → '/waiting#id=<uuid>'

import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'

/**
 * Build a URL that carries the consultation id in the fragment.
 * @param {string} basePath — e.g. '/waiting', '/vitals', '/rate'
 * @param {string} consultId — UUID
 */
export function makeConsultUrl(basePath, consultId) {
  if (!consultId) return basePath
  return `${basePath}#id=${encodeURIComponent(consultId)}`
}

function readIdFromHash() {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash || ''
  const m = hash.match(/(?:^#|&)id=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

/**
 * Read the consultation id from the URL. Prefers `#id=<uuid>` (new form,
 * doesn't leak to server logs / Referer). Falls back to the legacy `:id`
 * route param so bookmarked / previously-issued deep links keep working.
 *
 * Captures the value once on mount so hash-cleaning navigation (if any)
 * doesn't drop the id mid-render.
 */
export function useConsultId() {
  const params = useParams()
  const [id] = useState(() => readIdFromHash() || params.id || null)
  return id
}
