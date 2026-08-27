// Server-side audit-log helper.
//
// Endpoints that mutate PHI or clinical state should call
// writeAuditEvent(...) so we retain a HIPC-compliant activity trail.
// Failures are logged and swallowed — audit writes must never take
// down the calling flow.
//
// Pattern:
//   import { writeAuditEvent } from './_audit-write.js'
//   ...
//   await writeAuditEvent(req, auth, {
//     event_type:    'patient.medication.updated',   // dot.namespaced
//     consultation_id,                                 // if known
//     patient_ref,                                     // NHI when we have it
//     resource_type: 'patient_medication',
//     resource_id:   medicationId,
//     metadata:      { field: 'dose', from: '400mg', to: '200mg' },
//   })
//
// The auth arg is the object returned by guardProvider(); we destructure
// its provider fields to populate provider_id + provider_name + role. For
// anon patient-side endpoints pass null.

import { createClient } from '@supabase/supabase-js'
import { getClientIp } from './_client-ip.js'

let cachedClient = null
function admin() {
  if (cachedClient) return cachedClient
  cachedClient = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  return cachedClient
}

/**
 * Write one row into audit_logs. Never throws — audit failures are logged
 * and swallowed so the calling endpoint's happy path is preserved.
 *
 * @param {object} req    — the Vercel/Node request (for IP capture)
 * @param {object|null} auth — guardProvider result, or null for anon
 * @param {object} event
 * @param {string} event.event_type   — dot.namespaced (patient.med.updated)
 * @param {string} [event.consultation_id]
 * @param {string} [event.patient_ref]  — NHI or patient email/id
 * @param {string} [event.resource_type]
 * @param {string} [event.resource_id]
 * @param {object} [event.metadata]
 */
export async function writeAuditEvent(req, auth, event) {
  try {
    if (!event?.event_type) return
    const provider = auth?.provider || null
    const role = provider?.is_admin ? 'admin'
               : provider?.is_provider ? 'provider'
               : null
    await admin().from('audit_logs').insert({
      event_type:      event.event_type,
      provider_id:     provider?.id || null,
      provider_name:   [provider?.first_name, provider?.last_name].filter(Boolean).join(' ') || provider?.email || null,
      provider_role:   role,
      consultation_id: event.consultation_id || null,
      patient_ref:     event.patient_ref || null,
      resource_type:   event.resource_type || null,
      resource_id:     event.resource_id ? String(event.resource_id).slice(0, 200) : null,
      metadata:        event.metadata || null,
      ip:              getClientIp(req),
    })
  } catch (e) {
    // Log and swallow. Never break the happy path over an audit-write failure.
    console.warn('[audit-write]', event?.event_type, e?.message || e)
  }
}
