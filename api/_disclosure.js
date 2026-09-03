// Helper to record an outbound disclosure with a snapshot of consent state.
// See supabase/2026-09-03_disclosure_events.sql for schema + rationale.
//
// Usage from an endpoint (e.g. send-to-gp):
//
//   import { recordDisclosure } from './_disclosure.js'
//   ...
//   recordDisclosure(req, {
//     patientNhi:        consult.patient_nhi,
//     patientId:         consult.patient_id,
//     consultationId:    consult.id,
//     channel:           'gp_letter_email',
//     destination:       gpEmail,
//     destinationLabel:  gpName,
//     consentSource:     'triage_tick',
//     consentSourceRef:  consult.id,
//     disclosurePurpose: 'continuity_of_care',
//     payloadSummary:    'GP letter — SOAP + plan + medication list',
//   }).catch(() => {})
//
// Fire-and-forget — never blocks the outbound send. The disclosure record is
// legally significant but not a hard prerequisite; if the write fails we log
// the error and let the primary action succeed (audit_logs writes catch
// the fact of the operation regardless).

import { createClient } from '@supabase/supabase-js'
import { getClientIp } from './_client-ip.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {object} opts
 * @returns {Promise<void>}
 */
export async function recordDisclosure(req, opts = {}) {
  const {
    patientNhi        = null,
    patientId         = null,
    consultationId    = null,
    channel,
    destination,
    destinationLabel  = null,
    consentSource     = 'not_recorded',
    consentSourceRef  = null,
    disclosurePurpose = null,
    payloadSummary    = null,
    metadata          = null,
  } = opts
  if (!channel || !destination) return
  const provider = req.auth?.provider || null
  const supabase = admin()
  try {
    const { error } = await supabase.from('disclosure_events').insert({
      patient_nhi:        patientNhi,
      patient_id:         patientId,
      consultation_id:    consultationId,
      channel,
      destination,
      destination_label:  destinationLabel,
      disclosed_by:       provider?.id || null,
      disclosed_by_name:  provider ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim() || null : null,
      consent_source:     consentSource,
      consent_source_ref: consentSourceRef,
      disclosure_purpose: disclosurePurpose,
      payload_summary:    payloadSummary,
      metadata:           metadata && typeof metadata === 'object' ? metadata : null,
      ip:                 getClientIp(req),
    })
    // Missing table (migration not yet applied) is a soft error — log then move on.
    if (error && !(error.message?.includes('does not exist') || error.message?.includes('schema cache'))) {
      console.error('[disclosure] write failed:', error.message)
    }
  } catch (e) {
    console.error('[disclosure] exception:', e.message)
  }
}
