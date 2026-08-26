// _hl7-file.js — provider-triggered file/unfile of an inbound HL7 message
// to a specific patient's chart. Used for weak-match cases where the
// auto-file heuristic (strong NHI match) didn't fire — provider picks the
// right patient in the inbox and clicks "File to chart".
//
// POST /api/hl7-file
//   Body: { messageId: uuid, patientId: uuid }
//     → sets inbound_hl7_messages.filed_to_patient_id + filed_at + filed_by
//
// POST /api/hl7-file  { messageId: uuid, unfile: true }
//   → clears filing metadata (accidental file, wrong patient, etc.)
//
// Provider-authed (handler.js AUTH_REQUIRED_ROUTES includes 'hl7-file').
// Every file/unfile is written to audit_log so we can trace who put what
// in whose chart.

import { createClient } from '@supabase/supabase-js'
import { resolveDataMode } from './_provider-access-gate.js'

function admin() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { messageId, patientId, unfile } = req.body || {}
  if (!messageId || typeof messageId !== 'string') {
    return res.status(400).json({ error: 'messageId required' })
  }
  if (!unfile && (!patientId || typeof patientId !== 'string')) {
    return res.status(400).json({ error: 'patientId required when unfile is not set' })
  }

  const providerId = req.auth?.providerId || req.auth?.id || null
  if (!providerId) return res.status(401).json({ error: 'Provider identity required' })

  // Practice-mode scope for HL7 filing (auth already applied at router).
  const { practice } = resolveDataMode(req.auth?.provider, req)

  const supabase = admin()

  // Fetch the message to confirm it exists + capture pre-state for audit.
  const { data: msg, error: msgErr } = await supabase
    .from('inbound_hl7_messages')
    .select('id, filed_to_patient_id, matched_patient_id, patient_first_name, patient_last_name')
    .eq('id', messageId)
    .eq('is_practice', practice)
    .maybeSingle()
  if (msgErr) { console.error('[hl7-file] msgErr failed:', msgErr); return res.status(500).json({ error: 'Server error' }) }
  if (!msg)   return res.status(404).json({ error: 'HL7 message not found' })

  if (unfile) {
    const { error: updErr } = await supabase
      .from('inbound_hl7_messages')
      .update({
        filed_to_patient_id: null,
        filed_at: null,
        filed_by_provider_id: null,
      })
      .eq('id', messageId)
      .eq('is_practice', practice)
    if (updErr) { console.error('[hl7-file] updErr failed:', updErr); return res.status(500).json({ error: 'Server error' }) }

    await supabase.from('audit_log').insert({
      actor_provider_id: providerId,
      action: 'hl7_unfile',
      entity_type: 'inbound_hl7_messages',
      entity_id: messageId,
      metadata: { previous_patient_id: msg.filed_to_patient_id },
    })
    return res.status(200).json({ ok: true, filed: false })
  }

  // Filing to a patient — verify patient exists so we don't create a
  // dangling reference (schema FK will also catch this but we want a
  // clean 404 message not an opaque constraint error).
  const { data: patient, error: patErr } = await supabase
    .from('patients')
    .select('id, first_name, last_name')
    .eq('id', patientId)
    .eq('is_practice', practice)
    .maybeSingle()
  if (patErr)   { console.error('[hl7-file] patErr failed:', patErr); return res.status(500).json({ error: 'Server error' }) }
  if (!patient) return res.status(404).json({ error: 'Patient not found' })

  const { error: updErr } = await supabase
    .from('inbound_hl7_messages')
    .update({
      filed_to_patient_id: patientId,
      filed_at: new Date().toISOString(),
      filed_by_provider_id: providerId,
    })
    .eq('id', messageId)
    .eq('is_practice', practice)
  if (updErr) { console.error('[hl7-file] updErr failed:', updErr); return res.status(500).json({ error: 'Server error' }) }

  await supabase.from('audit_log').insert({
    actor_provider_id: providerId,
    action: msg.filed_to_patient_id ? 'hl7_refile' : 'hl7_file',
    entity_type: 'inbound_hl7_messages',
    entity_id: messageId,
    metadata: {
      patient_id: patientId,
      patient_name: `${patient.first_name || ''} ${patient.last_name || ''}`.trim(),
      previous_patient_id: msg.filed_to_patient_id,
    },
  })

  return res.status(200).json({ ok: true, filed: true, patient_id: patientId })
}
