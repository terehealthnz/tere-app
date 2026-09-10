// /api/practice-seed — populate the provider sandbox with fake patients.
//
// GET  → returns { count } current practice patients visible to the provider
// POST → idempotently seeds the 3 fake patients + consultations + structured
//         history using DETERMINISTIC UUIDs per (provider, patient). Upsert
//         semantics — running it any number of times converges to the same
//         canonical state, so this doubles as the "reset sandbox" action.
//         No delete-then-reinsert dance, no unique-constraint collisions.
//
// Design:
//   - Every row is tagged is_practice=true. Practice-mode-aware endpoints
//     filter by that flag and never mix practice with real data.
//   - Patient + consultation IDs are sha1(provider.id + patient_name)
//     formatted as UUID, so re-running the seed hits the SAME row every
//     time (upsert), instead of trying to insert a new one and tripping
//     unique indexes.
//   - Consultation status is force-reset to 'waiting' on every seed so
//     the trainee's queue is always populated with fresh cases.
//   - Child tables (allergens, meds, conditions) are wiped for these
//     specific patient_ids and re-inserted so any provider-added items
//     from a previous training run are cleaned up.
//   - Names are obviously mock but realistic-sounding (see MOCK_PATIENTS).
//     Practice NHIs use PRAC prefix which is not in the HNZ NHI range.

import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { guardProvider } from './_auth.js'

function admin() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Deterministic UUID from arbitrary inputs. Same inputs → same UUID every
// time. Lets us upsert practice rows by primary key so reset === re-seed.
function detUuid(...parts) {
  const h = createHash('sha1').update(parts.join('|')).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

// Deterministic mock NHI derived from provider+patient key. Same key →
// same NHI every seed, so no unique-constraint drift.
function detNhi(providerId, patientKey) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const h = createHash('sha1').update(providerId + '|' + patientKey).digest()
  return 'PRAC' + chars[h[0] % 24] + chars[h[1] % 24] + chars[h[2] % 24] + chars[h[3] % 24]
}

const MOCK_PATIENTS = [
  {
    key: 'aroha-mitchell',
    first_name: 'Aroha',   last_name: 'Mitchell', date_of_birth: '1984-07-05',
    phone: '+64211234501', email: 'practice.aroha@example.test',
    complaint: 'Fatigue and dizziness for the past week. Concerned about iron levels.',
    allergens: [{ allergen: 'Penicillin', allergen_type: 'drug', reaction: 'Rash', reaction_severity: 'moderate' }],
    medications: [{ drug: 'Ferrous sulphate', dose: '325 mg', frequency: 'BD', indication: 'Iron deficiency' }],
    conditions: [{ condition: 'Iron deficiency anaemia', icd10_code: 'D50.9', status: 'active' }],
  },
  {
    key: 'david-chen',
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
    key: 'emily-thompson',
    first_name: 'Emily',   last_name: 'Thompson', date_of_birth: '1991-09-24',
    phone: '+64211234503', email: 'practice.emily@example.test',
    complaint: 'UTI symptoms. Sixth episode this year — asks about prophylaxis.',
    allergens: [{ allergen: 'Trimethoprim', allergen_type: 'drug', reaction: 'GI upset', reaction_severity: 'mild' }],
    medications: [],
    conditions: [{ condition: 'Recurrent urinary tract infection', icd10_code: 'N39.0', status: 'active' }],
  },
]

async function countPracticeForProvider(supabase, providerId) {
  // Count via canonical deterministic IDs so we don't rely on
  // created_by_provider_id (may not exist in every schema version).
  const ids = MOCK_PATIENTS.map(p => detUuid('practice-patient', providerId, p.key))
  const { count } = await supabase.from('patients')
    .select('id', { count: 'exact', head: true })
    .in('id', ids)
  return count || 0
}

// Idempotent seed. Same (provider, patient) always maps to the same row IDs,
// so this can be called any number of times and converges to the same state.
export async function seedPracticePatientsForProvider(supabase, provider) {
  const results = []
  for (const p of MOCK_PATIENTS) {
    const patientId = detUuid('practice-patient', provider.id, p.key)
    const consultId = detUuid('practice-consult', provider.id, p.key)
    const nhi = detNhi(provider.id, p.key)

    // Patient: lookup by identity → update in place if exists, else insert.
    // Avoids fighting unknown unique indexes (patients_identity_idx,
    // idx_patients_nhi_unique, etc.) that we can't hit via onConflict.
    const patientFields = {
      first_name:    p.first_name,
      last_name:     p.last_name,
      date_of_birth: p.date_of_birth,
      phone:         p.phone,
      email:         p.email,
      nhi,
      is_practice:   true,
    }
    let existingPatientId = null
    {
      const { data: existing } = await supabase.from('patients').select('id')
        .eq('first_name', p.first_name)
        .eq('last_name',  p.last_name)
        .eq('date_of_birth', p.date_of_birth)
        .eq('is_practice', true)
        .limit(1).maybeSingle()
      if (existing?.id) existingPatientId = existing.id
    }
    let usedPatientId = existingPatientId || patientId
    if (existingPatientId) {
      const { error: uErr } = await supabase.from('patients').update(patientFields).eq('id', existingPatientId)
      if (uErr) { results.push({ ok: false, name: `${p.first_name} ${p.last_name}`, error: `patient update: ${uErr.message}` }); continue }
    } else {
      // Try insert with our deterministic id. If it trips
      // created_by_provider_id, retry without.
      let { error: iErr } = await supabase.from('patients').insert({ id: patientId, ...patientFields, created_by_provider_id: provider.id })
      if (iErr?.message?.includes('created_by_provider_id')) {
        ;({ error: iErr } = await supabase.from('patients').insert({ id: patientId, ...patientFields }))
      }
      if (iErr) { results.push({ ok: false, name: `${p.first_name} ${p.last_name}`, error: `patient insert: ${iErr.message}` }); continue }
    }

    // Consultation: same treatment. Find any active practice consult for this
    // patient, update in place; else insert fresh with deterministic id.
    const consultFields = {
      patient_id:         usedPatientId,
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
      cooldown_until:     null,
    }
    // Match whatever the unique index consultations_one_open_per_patient_idx
    // considers "open" (see supabase/2026-07-24_one_open_consult_per_patient
    // .sql: WHERE status NOT IN ('complete', 'cancelled')). Positive-list
    // .in() is safer than negation — the previous
    // .not('status', 'in', '(complete,cancelled)') syntax failed to match
    // and we tripped the unique index on insert instead of updating.
    let existingConsultId = null
    {
      const { data: existing } = await supabase.from('consultations').select('id')
        .eq('patient_id', usedPatientId)
        .eq('is_practice', true)
        .in('status', ['waiting', 'vitals_requested', 'vitals_complete', 'ready', 'in_progress', 'reviewing', 'no_show'])
        .limit(1).maybeSingle()
      if (existing?.id) existingConsultId = existing.id
    }
    if (existingConsultId) {
      const { error: uErr } = await supabase.from('consultations').update(consultFields).eq('id', existingConsultId)
      if (uErr) { results.push({ ok: false, name: `${p.first_name} ${p.last_name}`, error: `consult update: ${uErr.message}` }); continue }
    } else {
      const { error: iErr } = await supabase.from('consultations').insert({ id: consultId, ...consultFields })
      if (iErr) { results.push({ ok: false, name: `${p.first_name} ${p.last_name}`, error: `consult insert: ${iErr.message}` }); continue }
    }

    // Wipe + reseed child rows for this patient. Scoped to the used
    // patient_id (may be existing or freshly-inserted) so we never touch
    // other patients' data.
    await supabase.from('patient_allergens').delete().eq('patient_id', usedPatientId)
    await supabase.from('patient_medications').delete().eq('patient_id', usedPatientId)
    await supabase.from('patient_conditions').delete().eq('patient_id', usedPatientId)
    if (p.allergens.length) {
      await supabase.from('patient_allergens').insert(p.allergens.map(a => ({
        patient_id: usedPatientId, ...a, is_practice: true, created_by_name: 'Practice seed',
      })))
    }
    if (p.medications.length) {
      await supabase.from('patient_medications').insert(p.medications.map(m => ({
        patient_id: usedPatientId, ...m, is_active: true, is_practice: true, created_by_name: 'Practice seed',
      })))
    }
    if (p.conditions.length) {
      await supabase.from('patient_conditions').insert(p.conditions.map(c => ({
        patient_id: usedPatientId, ...c, is_practice: true, created_by_name: 'Practice seed',
      })))
    }

    // Also wipe prescriptions + referrals added during previous training runs
    // so the sandbox comes back clean.
    await supabase.from('prescriptions').delete().eq('is_practice', true).eq('patient_id', usedPatientId)
    await supabase.from('radiology_referrals').delete().eq('is_practice', true).eq('patient_id', usedPatientId)

    results.push({ ok: true, patient_id: usedPatientId, consultation_id: existingConsultId || consultId, name: `${p.first_name} ${p.last_name}` })
  }
  return results
}

// Ensure the sandbox is ready. Deterministic seed means we can just always
// call it — it's a no-op if rows already match.
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
