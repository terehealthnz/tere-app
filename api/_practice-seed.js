// /api/practice-seed — populate the provider sandbox with fake patients.
//
// GET  → returns { count } current practice patients visible to the provider
// POST → seeds a fresh set of 3 fake patients + consultations + structured
//         history, all is_practice=true, matched to this provider so they
//         appear in the practice queue. Idempotent-ish — running twice
//         will add another batch. Use /api/practice-reset to wipe first.
//
// Design:
//   - Every seeded row is tagged is_practice=true. Practice-mode-aware
//     endpoints filter by that flag and never mix practice with real data.
//   - Consultations are matched_provider_id = current provider so
//     get-queue returns them without a queue-assignment step.
//   - Names are obviously mock but realistic-sounding (see MOCK_PATIENTS).
//     No real NHIs — practice NHIs use the PRAC prefix which is not in
//     the HNZ NHI issuance range.
//   - Structured history (allergies, meds, conditions) attached so the
//     Prescribe modal safety check has something to hit.

import { createClient } from '@supabase/supabase-js'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Deterministic prefix so practice NHIs are unmistakable and can never
// collide with real HNZ-issued identifiers.
function mockNhi(seed) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const n = (seed * 2654435761) >>> 0
  return 'PRAC' + chars[n % 24] + chars[(n >> 5) % 24]
}

const MOCK_PATIENTS = [
  {
    first_name: 'Aroha',   last_name: 'Mitchell', dob: '1984-07-05', sex: 'F',
    phone: '+64211234501', email: 'practice.aroha@example.test',
    complaint: 'Fatigue and dizziness for the past week. Concerned about iron levels.',
    allergens: [{ allergen: 'Penicillin', allergen_type: 'drug', reaction: 'Rash', reaction_severity: 'moderate' }],
    medications: [{ drug: 'Ferrous sulphate', dose: '325 mg', frequency: 'BD', indication: 'Iron deficiency' }],
    conditions: [{ condition: 'Iron deficiency anaemia', icd10_code: 'D50.9', status: 'active' }],
  },
  {
    first_name: 'David',   last_name: 'Chen',     dob: '1969-02-18', sex: 'M',
    phone: '+64211234502', email: 'practice.david@example.test',
    complaint: 'Sore throat and fever for 3 days. History of tonsillitis.',
    allergens: [],
    medications: [
      { drug: 'Atorvastatin', dose: '20 mg', frequency: 'nocte', indication: 'Cholesterol' },
      { drug: 'Losartan',     dose: '50 mg', frequency: 'mane',  indication: 'Hypertension' },
    ],
    conditions: [
      { condition: 'Hypertension',                icd10_code: 'I10',   status: 'active' },
      { condition: 'Hypercholesterolaemia',       icd10_code: 'E78.0', status: 'active' },
    ],
  },
  {
    first_name: 'Emily',   last_name: 'Thompson', dob: '1991-09-24', sex: 'F',
    phone: '+64211234503', email: 'practice.emily@example.test',
    complaint: 'UTI symptoms. Sixth episode this year — asks about prophylaxis.',
    allergens: [{ allergen: 'Trimethoprim', allergen_type: 'drug', reaction: 'GI upset', reaction_severity: 'mild' }],
    medications: [],
    conditions: [{ condition: 'Recurrent urinary tract infection', icd10_code: 'N39.0', status: 'active' }],
  },
]

async function countPracticeForProvider(supabase, providerId) {
  const { count } = await supabase.from('patients')
    .select('id', { count: 'exact', head: true })
    .eq('is_practice', true)
    .eq('created_by_provider_id', providerId)
  return count || 0
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  const provider = auth.provider
  const supabase = admin()

  if (req.method === 'GET') {
    const count = await countPracticeForProvider(supabase, provider.id)
    return res.status(200).json({ count })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const now = new Date()
  const results = []

  for (let i = 0; i < MOCK_PATIENTS.length; i++) {
    const p = MOCK_PATIENTS[i]
    const nhi = mockNhi(Date.now() + i)
    // Insert patient. created_by_provider_id may not exist on the schema;
    // catch and continue so we don't hard-fail if the column is absent.
    let patientId = null
    try {
      const { data: pat, error } = await supabase.from('patients').insert({
        first_name: p.first_name,
        last_name:  p.last_name,
        dob:        p.dob,
        sex:        p.sex,
        phone:      p.phone,
        email:      p.email,
        nhi,
        is_practice: true,
        created_by_provider_id: provider.id,
      }).select('id').single()
      if (error) throw error
      patientId = pat?.id
    } catch (e) {
      // If created_by_provider_id doesn't exist, retry without it.
      const { data: pat, error } = await supabase.from('patients').insert({
        first_name: p.first_name,
        last_name:  p.last_name,
        dob:        p.dob,
        sex:        p.sex,
        phone:      p.phone,
        email:      p.email,
        nhi,
        is_practice: true,
      }).select('id').single()
      if (error) { console.error('[practice-seed] patient insert failed:', error); results.push({ ok: false, error: 'patient insert failed' }); continue }
      patientId = pat?.id
    }

    // Consultation, waiting in the queue so this provider sees it immediately.
    const consultBase = {
      patient_id:                patientId,
      patient_first_name:        p.first_name,
      patient_last_name:         p.last_name,
      patient_dob:               p.dob,
      patient_nhi:               nhi,
      patient_phone:             p.phone,
      patient_email:             p.email,
      chief_complaint:           p.complaint,
      consultation_type:         'video',
      status:                    'waiting',
      matched_provider_id:       provider.id,
      is_practice:               true,
      buffer_expires_at:         new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    }
    const { data: consult, error: cErr } = await supabase.from('consultations').insert(consultBase).select('id').single()
    if (cErr) { results.push({ ok: false, patient_id: patientId, error: cErr.message }); continue }

    // Structured history — attach to patient so ClinicianPatient chart is populated.
    if (p.allergens.length) {
      await supabase.from('patient_allergens').insert(p.allergens.map(a => ({
        patient_id: patientId, ...a, is_practice: true, created_by_name: 'Practice seed',
      })))
    }
    if (p.medications.length) {
      await supabase.from('patient_medications').insert(p.medications.map(m => ({
        patient_id: patientId, ...m, is_active: true, is_practice: true, created_by_name: 'Practice seed',
      })))
    }
    if (p.conditions.length) {
      await supabase.from('patient_conditions').insert(p.conditions.map(c => ({
        patient_id: patientId, ...c, is_practice: true, created_by_name: 'Practice seed',
      })))
    }

    results.push({ ok: true, patient_id: patientId, consultation_id: consult.id, name: `${p.first_name} ${p.last_name}` })
  }

  const count = await countPracticeForProvider(supabase, provider.id)
  return res.status(200).json({ seeded: results, total: count })
}
