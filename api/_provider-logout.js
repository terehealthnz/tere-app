// POST /api/provider-logout — close a provider_sessions row.
//
// Body: { sessionId, providerId? }
//
// Intentionally NOT in AUTH_REQUIRED_ROUTES:
//   - The client is about to wipe sessionStorage, and race conditions
//     around clearing the x-provider-id header would leave sessions
//     hanging open.
//   - The sessionId is a UUID minted server-side at login; treating it
//     as a bearer credential is fine for the single "end my own session"
//     verb because the only capability it grants is closing itself.
//
// If sessionId doesn't exist or is already closed, we still 200 — the
// caller's happy path is "make sure this session is closed". Providers
// hitting Sign Out from a stale tab should not see an error page.
//
// providerId is optional — used only to attach the audit event when the
// session row can't be resolved (e.g. session_id was never set client-side
// because login predates this change).

import { createClient } from '@supabase/supabase-js'
import { endSession } from './_provider-session.js'
import { writeAuditEvent } from './_audit-write.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { sessionId, providerId } = req.body || {}

  // Look up the provider for audit-event provenance. If sessionId is
  // supplied, prefer the provider_id on the session row (defends
  // against a caller passing a mismatched providerId).
  let auditProvider = null
  try {
    if (sessionId) {
      const { data } = await admin()
        .from('provider_sessions')
        .select('provider_id, providers ( id, first_name, last_name, email, is_admin, is_provider )')
        .eq('id', sessionId)
        .maybeSingle()
      auditProvider = data?.providers || null
    } else if (providerId) {
      const { data } = await admin()
        .from('providers')
        .select('id, first_name, last_name, email, is_admin, is_provider')
        .eq('id', providerId)
        .maybeSingle()
      auditProvider = data || null
    }
  } catch { /* audit provenance is best-effort */ }

  await endSession(sessionId, 'logout')

  writeAuditEvent(req, auditProvider ? { provider: auditProvider } : null, {
    event_type:    'provider.logout',
    resource_type: 'provider_session',
    resource_id:   sessionId || null,
    metadata:      { source: 'client_signout' },
  }).catch(() => {})

  return res.status(200).json({ ok: true })
}
