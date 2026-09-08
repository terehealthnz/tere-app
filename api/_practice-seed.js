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
//   - Consultations are provider_id = current provider so
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
// collide with real HNZ-issued identifiers. Widened to 4 chars of entropy
// (24^4 ≈ 330k combinations) so repeat resets don't collide on the tiny
// keyspace of the previous 2-char version.
function mockNhi(seed) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const n = (seed * 2654435761) >>> 0
  return 'PRAC' + chars[n % 24] + chars[(n >> 5) % 24] + chars[(n >> 10) % 24] + chars[(n >> 15) % 24]
}

const MOCK_PATIENTS = [
  {
    first_name: 'Aroha',   last_name: 'Mitchell', date_of_birth: '1984-07-05',
    phone: '+64211234501', email: 'practice.aroha@example.test',
    complaint: 'Fatigue and dizziness for the past week. Concerned about iron levels.',
    allergens: [{ allergen: 'Penicillin', allergen_type: 'drug', reaction: 'Rash', reaction_severity: 'moderate' }],
    medications: [{ drug: 'Ferrous sulphate', dose: '325 mg', frequency: 'BD', indication: 'Iron deficiency' }],
    conditions: [{ condition: 'Iron deficiency anaemia', icd10_code: 'D50.9', status: 'active' }],
  },
  {
    first_name: 'David',   last_name: 'Chen',     date_of_birth: '1969-02-18',
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
    first_name: 'Emily',   last_name: 'Thompson', date_of_birth: '1991-09-24',
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

// Reusable seed core. Idempotent — safe to call any number of times per
// provider. Callers: the POST handler below (manual admin trigger), and
// ensurePracticeSandbox() (auto-seed on first practice-mode load so a
// new hire's queue is never empty).
export async function seedPracticePatientsForProvider(supabase, provider) {
  const now = new Date()
  const results = []
  for (let i = 0; i < MOCK_PATIENTS.length; i++) {
    const p = MOCK_PATIENTS[i]
    const nhi = mockNhi(Date.now() + i)
    let patientId = null
    let insertRes = await supabase.from('patients').insert({
      first_name:    p.first_name,
      last_name:     p.last_name,
      date_of_birth: p.date_of_birth,
      phone:         p.phone,
      email:         p.email,
      nhi,
      is_practice:   true,
      created_by_provider_id: provider.id,
    }).select('id').single()
    if (insertRes.error?.message?.includes('created_by_provider_id')) {
      insertRes = await supabase.from('patients').insert({
        first_name: p.first_name, last_name: p.last_name, date_of_birth: p.date_of_birth,
        phone: p.phone, email: p.email, nhi, is_practice: true,
      }).select('id').single()
    }
    if (insertRes.error?.code === '23505' || insertRes.error?.message?.includes('duplicate key')) {
      const { data: existing } = await supabase.from('patients')
        .select('id')
        .eq('first_name', p.first_name).eq('last_name', p.last_name)
        .eq('date_of_birth', p.date_of_birth).eq('is_practice', true).maybeSingle()
      if (existing?.id) patientId = existing.id
    } else if (insertRes.error) {
      results.push({ ok: false, error: `patient insert failed: ${insertRes.error.message}` })
      continue
    } else {
      patientId = insertRes.data?.id
    }
    if (!patientId) { results.push({ ok: false, error: 'no patient id after insert' }); continue }

    const { data: consult, error: cErr } = await supabase.from('consultations').insert({
      patient_id:         patientId,
      patient_first_name: p.first_name,
      patient_last_name:  p.last_name,
      patient_dob:        p.date_of_birth,
      patient_nhi:        nhi,
      patient_phone:      p.phone,
      patient_email:      p.email,
      chief_complaint:    p.complaint,
      consultation_type:  'video',
      status:             'waiting',
      provider_id:        provider.id,
      is_practice:        true,
    }).select('id').single()
    if (cErr) { results.push({ ok: false, patient_id: patientId, error: cErr.message }); continue }

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
  return results
}

// Idempotent "make sure the sandbox is ready" call. If this provider has
// zero active practice consultations, seed them. Called on every GET
// queue in practice mode so the sandbox is always populated — a new hire
// never lands on an empty queue and can never sit unable to progress
// through training.
export async function ensurePracticeSandbox(supabase, provider) {
  const { count } = await supabase.from('consultations')
    .select('id', { count: 'exact', head: true })
    .eq('is_practice', true)
    .eq('provider_id', provider.id)
    .in('status', ['waiting', 'vitals_requested', 'vitals_complete', 'ready', 'in_progress', 'reviewing'])
  if ((count || 0) > 0) return { seeded: false, existingConsults: count }
  const results = await seedPracticePatientsForProvider(supabase, provider)
  return { seeded: true, results }
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

  const results = await seedPracticePatientsForProvider(supabase, provider)
  const count = await countPracticeForProvider(supabase, provider.id)
  return res.status(200).json({ seeded: results, total: count })
}
