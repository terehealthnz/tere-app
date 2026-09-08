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
  const { count } = await supabase.from('patients')
    .select('id', { count: 'exact', head: true })
    .eq('is_practice', true)
    .eq('created_by_provider_id', providerId)
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

    // Upsert patient. Same ID every time → hits the same row → no unique
    // constraint games.
    const { error: pErr } = await supabase.from('patients').upsert({
      id:            patientId,
      first_name:    p.first_name,
      last_name:     p.last_name,
      date_of_birth: p.date_of_birth,
      phone:         p.phone,
      email:         p.email,
      nhi,
      is_practice:   true,
      created_by_provider_id: provider.id,
    }, { onConflict: 'id' })
    if (pErr) { results.push({ ok: false, name: `${p.first_name} ${p.last_name}`, error: `patient upsert: ${pErr.message}` }); continue }

    // Upsert consultation. status forced to 'waiting' every seed so the
    // trainee's queue is always populated with fresh cases.
    const { error: cErr } = await supabase.from('consultations').upsert({
      id:                 consultId,
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
    }, { onConflict: 'id' })
    if (cErr) { results.push({ ok: false, name: `${p.first_name} ${p.last_name}`, error: `consult upsert: ${cErr.message}` }); continue }

    // Wipe + reseed child rows for this patient. Scoped to patient_id so we
    // never touch other patients' data.
    await supabase.from('patient_allergens').delete().eq('patient_id', patientId)
    await supabase.from('patient_medications').delete().eq('patient_id', patientId)
    await supabase.from('patient_conditions').delete().eq('patient_id', patientId)
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

    // Also wipe prescriptions + referrals added during previous training runs
    // so the sandbox comes back clean.
    await supabase.from('prescriptions').delete().eq('is_practice', true).eq('patient_id', patientId)
    await supabase.from('radiology_referrals').delete().eq('is_practice', true).eq('patient_id', patientId)

    results.push({ ok: true, patient_id: patientId, consultation_id: consultId, name: `${p.first_name} ${p.last_name}` })
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
