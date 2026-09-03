// GET /api/patient-record-export?patient_id=X[&format=fhir_bundle]
//
// Section 22F of the Health Act 1956 gives another provider (with patient
// consent) the right to request the patient's health record. This endpoint
// assembles the record as a FHIR R4 Bundle so the receiving system can
// import it directly. Also supports ?format=json for the raw shape.
//
// Auth: admin, billing_admin (metadata only — no clinical), supervisor, or
// provider. Access is audit-logged with a mandatory reason so we can trace
// who exported what for whom.

import { createClient } from '@supabase/supabase-js'
import { getClientIp } from './_client-ip.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const ALLOWED_REASONS = new Set([
  'billing_dispute', 'complaint_investigation', 'quality_audit',
  'support_ticket_response', 'patient_request', 'clinical_care', 'other',
])

function roleSnapshot(p) {
  if (!p) return null
  if (p.is_billing_admin) return 'billing_admin'
  if (p.is_supervisor)    return 'supervisor'
  if (p.is_admin)         return 'admin'
  if (p.is_provider)      return 'provider'
  return null
}

// Minimal FHIR resource builders. Aiming for structural correctness (the
// receiver can validate against R4 profiles) rather than exhaustive field
// coverage — Tere's data doesn't populate every FHIR path.

function fhirPatient(p) {
  return {
    resourceType: 'Patient',
    id: p.id,
    identifier: p.nhi ? [{
      use: 'official',
      system: 'https://standards.digital.health.nz/ns/nhi-id',
      value: p.nhi,
    }] : [],
    name: [{
      use: 'official',
      family: p.last_name || undefined,
      given: p.first_name ? [p.first_name] : undefined,
    }],
    telecom: [
      p.phone && { system: 'phone', value: p.phone },
      p.email && { system: 'email', value: p.email },
    ].filter(Boolean),
    birthDate: p.dob || undefined,
    address: p.address ? [{ text: p.address }] : undefined,
  }
}

function fhirEncounter(c, patientId) {
  return {
    resourceType: 'Encounter',
    id: c.id,
    status: c.status === 'complete' ? 'finished' : 'in-progress',
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code:   'VR',
      display: 'virtual',
    },
    subject: { reference: `Patient/${patientId}` },
    period: {
      start: c.created_at || undefined,
      end:   c.completed_at || undefined,
    },
    reasonCode: c.chief_complaint ? [{ text: c.chief_complaint }] : undefined,
  }
}

function fhirObservationsFromVitals(c, patientId) {
  const out = []
  const push = (code, display, value, unit) => {
    if (value == null) return
    out.push({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code, display }], text: display },
      subject: { reference: `Patient/${patientId}` },
      encounter: { reference: `Encounter/${c.id}` },
      effectiveDateTime: c.created_at,
      valueQuantity: { value, unit, system: 'http://unitsofmeasure.org' },
    })
  }
  const v = c.vitals || {}
  push('8867-4',  'Heart rate',        v.hr,   '/min')
  push('9279-1',  'Respiratory rate',  v.rr,   '/min')
  push('59408-5', 'Oxygen saturation', v.spo2, '%')
  push('8310-5',  'Body temperature',  v.temp, 'Cel')
  push('8480-6',  'Systolic BP',       v.sbp,  'mm[Hg]')
  push('8462-4',  'Diastolic BP',      v.dbp,  'mm[Hg]')
  return out
}

function fhirMedicationStatement(rx, patientId) {
  return {
    resourceType: 'MedicationStatement',
    id: rx.id,
    status: rx.status === 'signed' ? 'active' : (rx.status || 'unknown'),
    medicationCodeableConcept: { text: `${rx.drug_name || ''}${rx.strength ? ' ' + rx.strength : ''}`.trim() || 'Unknown' },
    subject: { reference: `Patient/${patientId}` },
    dosage: rx.dose_instructions ? [{ text: rx.dose_instructions }] : undefined,
    dateAsserted: rx.created_at,
    note: rx.controlled ? [{ text: 'Controlled drug' }] : undefined,
  }
}

function fhirAllergyIntolerance(a, patientId) {
  return {
    resourceType: 'AllergyIntolerance',
    id: a.id,
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] },
    verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification', code: a.verified_at ? 'confirmed' : 'unconfirmed' }] },
    code: { text: a.allergen || a.name || 'Unknown' },
    patient: { reference: `Patient/${patientId}` },
    reaction: a.reaction ? [{ manifestation: [{ text: a.reaction }] }] : undefined,
    recordedDate: a.created_at,
  }
}

function fhirCondition(c, patientId) {
  return {
    resourceType: 'Condition',
    id: c.id,
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: c.status || 'active' }] },
    code: { text: c.name || c.condition || 'Unknown' },
    subject: { reference: `Patient/${patientId}` },
    onsetDateTime: c.onset_date || c.created_at,
    note: c.notes ? [{ text: c.notes }] : undefined,
  }
}

function fhirDiagnosticReport(r, patientId) {
  return {
    resourceType: 'DiagnosticReport',
    id: r.id,
    status: r.status || 'final',
    code: { text: r.investigation || r.modality || 'Diagnostic report' },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: r.result_received_at || r.created_at,
    conclusion: r.report_text || r.summary || undefined,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const provider = req.auth?.provider
  const role = roleSnapshot(provider)
  if (!role) return res.status(403).json({ error: 'Provider auth required' })
  // billing_admin can trigger metadata-only export (no clinical resources)
  const metadataOnly = role === 'billing_admin'

  const { patient_id, format, reason, reason_notes } = req.query || {}
  if (!patient_id) return res.status(400).json({ error: 'patient_id required' })
  if (!reason || !ALLOWED_REASONS.has(String(reason))) {
    return res.status(400).json({ error: `reason required (one of: ${[...ALLOWED_REASONS].join(', ')})` })
  }

  const supabase = admin()
  const { data: patient, error: pErr } = await supabase.from('patients').select('*').eq('id', patient_id).maybeSingle()
  if (pErr) { console.error('[patient-record-export]', pErr); return res.status(500).json({ error: 'Server error' }) }
  if (!patient) return res.status(404).json({ error: 'Patient not found' })

  const [consultsRes, rxRes, alRes, condRes, radRes] = await Promise.all([
    supabase.from('consultations').select('*').eq('patient_id', patient_id).order('created_at'),
    metadataOnly ? Promise.resolve({ data: [] }) : supabase.from('prescriptions').select('*').eq('patient_id', patient_id).order('created_at'),
    metadataOnly ? Promise.resolve({ data: [] }) : supabase.from('patient_allergens').select('*').eq('patient_id', patient_id).order('created_at').then(r => r, () => ({ data: [] })),
    metadataOnly ? Promise.resolve({ data: [] }) : supabase.from('patient_conditions').select('*').eq('patient_id', patient_id).order('created_at').then(r => r, () => ({ data: [] })),
    metadataOnly ? Promise.resolve({ data: [] }) : supabase.from('radiology_reports').select('*').eq('patient_id', patient_id).order('created_at').then(r => r, () => ({ data: [] })),
  ])

  const consults = consultsRes.data || []
  const prescriptions = rxRes.data || []
  const allergens     = alRes.data || []
  const conditions    = condRes.data || []
  const radReports    = radRes.data || []

  // ── Assemble ────────────────────────────────────────────────────────────────
  const entries = []
  entries.push({ fullUrl: `Patient/${patient.id}`, resource: fhirPatient(patient) })
  for (const c of consults) {
    entries.push({ fullUrl: `Encounter/${c.id}`, resource: fhirEncounter(c, patient.id) })
    if (!metadataOnly) {
      for (const obs of fhirObservationsFromVitals(c, patient.id)) entries.push({ resource: obs })
    }
  }
  if (!metadataOnly) {
    for (const rx of prescriptions) entries.push({ fullUrl: `MedicationStatement/${rx.id}`, resource: fhirMedicationStatement(rx, patient.id) })
    for (const a of allergens)      entries.push({ fullUrl: `AllergyIntolerance/${a.id}`, resource: fhirAllergyIntolerance(a, patient.id) })
    for (const c of conditions)     entries.push({ fullUrl: `Condition/${c.id}`, resource: fhirCondition(c, patient.id) })
    for (const r of radReports)     entries.push({ fullUrl: `DiagnosticReport/${r.id}`, resource: fhirDiagnosticReport(r, patient.id) })
  }

  const bundle = {
    resourceType: 'Bundle',
    id: `tere-export-${patient.id}-${Date.now()}`,
    type: 'collection',
    timestamp: new Date().toISOString(),
    meta: {
      profile: ['http://hl7.org/fhir/StructureDefinition/Bundle'],
      tag: [{
        system: 'https://terehealth.co.nz/fhir/export-source',
        code: 'tere-health',
        display: `Exported by ${provider.first_name || ''} ${provider.last_name || ''}`.trim() || 'Tere Health',
      }],
    },
    entry: entries,
  }

  // Bulk-export detection (task #359).
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await supabase.from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', provider.id)
      .in('event_type', ['acc_audit_bundle_export', 'patient_record_export'])
      .gte('created_at', oneHourAgo)
    if ((count || 0) >= 10) {
      import('./_security-alert.js').then(({ raiseSecurityAlert }) => {
        raiseSecurityAlert(req, {
          eventType: 'bulk_export_threshold',
          severity:  'alert',
          critical:  true,
          summary:   `Provider ${provider.first_name || ''} ${provider.last_name || ''}`.trim() +
                     ` exported ${(count || 0) + 1} records/bundles in the last hour`,
          metadata:  { provider_id: provider.id, export_count_1h: (count || 0) + 1 },
        }).catch(() => {})
      }).catch(() => {})
    }
  } catch { /* best-effort */ }

  // Audit-log the export.
  try {
    await supabase.from('audit_logs').insert({
      event_type:      'patient_record_export',
      provider_id:     provider.id,
      provider_name:   `${provider.first_name || ''} ${provider.last_name || ''}`.trim() || null,
      provider_role:   role,
      patient_ref:     patient.nhi || null,
      resource_type:   'patient',
      resource_id:     patient.id,
      reason:          String(reason),
      reason_notes:    reason_notes ? String(reason_notes).slice(0, 500) : null,
      metadata:        { format: format || 'fhir_bundle', entries: entries.length, metadata_only: metadataOnly },
      ip:              getClientIp(req),
      user_agent:      req.headers['user-agent'] || null,
    })
  } catch (e) {
    console.error('[patient-record-export] audit write failed:', e.message)
  }

  if (format === 'json') return res.status(200).json({ bundle })

  res.setHeader('Content-Type', 'application/fhir+json')
  res.setHeader('Content-Disposition', `attachment; filename="tere-patient-record-${patient.nhi || patient.id}.json"`)
  return res.status(200).send(JSON.stringify(bundle, null, 2))
}
