import { createClient } from '@supabase/supabase-js'
import { apiFetch } from './api'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.warn('Supabase env vars not set — using mock mode')
}

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder'
)

// ── Research field helpers ────────────────────────────────────────────────────

function calcAgeBand(dob) {
  if (!dob) return null
  try {
    const age = new Date().getFullYear() - new Date(dob).getFullYear()
    if (age < 20) return 'Under 20'
    if (age < 30) return '20-29'
    if (age < 40) return '30-39'
    if (age < 50) return '40-49'
    if (age < 60) return '50-59'
    return '60+'
  } catch { return null }
}

function categorizeComplaint(complaint) {
  if (!complaint) return 'other'
  const t = complaint.toLowerCase()
  if (/(ankle|knee|shoulder|back|neck|hip|wrist|elbow|joint|muscle|sprain|strain|fracture|broken|torn|tendon|ligament|sport|gym|lifting|physio|ortho|bursitis|arthritis)/.test(t)) return 'musculoskeletal'
  if (/(cough|cold|flu|fever|chest|breath|wheeze|asthma|sinus|throat|nose|covid|rsv|pneumonia|bronchitis|infection|tonsil|sore throat)/.test(t)) return 'respiratory'
  if (/(rash|skin|itch|acne|eczema|psoriasis|wound|cut|bite|burn|lesion|lump|boil|cellulitis|dermatitis|hives|blister)/.test(t)) return 'skin'
  if (/(stomach|abdomen|nausea|vomit|diarrhea|diarrhoea|constipation|bowel|gut|ibs|reflux|heartburn|bloating|cramps)/.test(t)) return 'gastrointestinal'
  if (/(head|migraine|dizzy|vertigo|numbness|tingle|nerve|memory|concussion|balance|brain|neurolog)/.test(t)) return 'neurological'
  if (/(heart|cardiac|palpitation|blood pressure|hypertension|cholesterol|chest pain)/.test(t)) return 'cardiovascular'
  if (/(urine|bladder|kidney|uti|std|vaginal|period|menstrual|prostate|testicular|ovarian|pelvic|thrush|discharge)/.test(t)) return 'genitourinary'
  if (/(anxiety|depression|stress|mental|mood|sleep|insomnia|panic|ptsd|sad|low|suicid|psychosis|eating)/.test(t)) return 'mental_health'
  if (/(accident|injury|fall|trip|hurt|impact|crash|collision|work injury|road|sport injury)/.test(t)) return 'injury'
  return 'other'
}

function categorizeEmploymentSector(employer) {
  if (!employer) return null
  const t = employer.toLowerCase()
  if (/(maritime|boat|ship|port|ferry|fishing vessel|sea captain|crew|coast guard|vessel)/.test(t)) return 'maritime'
  if (/(aquaculture|salmon|oyster|mussel|seafood|fish farm|marine farm|shellfish)/.test(t)) return 'aquaculture'
  if (/(farm|agriculture|orchard|vineyard|winery|wine|kiwifruit|apple|crop|horticulture|pastoral|forestry|sheep|cattle|dairy|arable)/.test(t)) return 'agriculture'
  if (/(hotel|tourism|hospitality|motel|lodge|tour operator|tourist|resort|accommodation|restaurant|café)/.test(t)) return 'tourism'
  if (/(hospital|clinic|health|medical|nursing|care|pharmacy|doctor|practice|dental|physio|aged care|midwife)/.test(t)) return 'healthcare'
  return 'other'
}

// ── Input validation & sanitisation ─────────────────────────────────────────

const INJECTION_PATTERNS = [/<script/i, /SELECT\s+\*/i, /DROP\s+TABLE/i, /INSERT\s+INTO/i]

function sanitizeString(val) {
  if (typeof val !== 'string') return val
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(val)) throw new Error('Invalid input detected')
  }
  return val.trim()
}

function validateNHI(nhi) {
  if (!nhi) return null
  const clean = String(nhi).trim().toUpperCase()
  // NZ NHI: 3 letters + 4 digits (old) or 3 letters + 5 digits (new)
  if (!/^[A-Z]{3}\d{4,5}$/.test(clean)) return null
  return clean
}

function validatePhone(phone) {
  if (!phone) return null
  const raw = String(phone).trim()
  // Strip spaces, hyphens, brackets, dots — keep leading +
  const clean = raw.startsWith('+') ? '+' + raw.slice(1).replace(/\D/g, '') : raw.replace(/\D/g, '')
  // NZ mobile/landline: starts with 0 (local) or +64
  if (!/^(\+64|0)\d{8,10}$/.test(clean)) return raw // return original if not NZ format — DB stores as-is
  return clean
}

function validateEmail(email) {
  if (!email) return null
  const clean = String(email).trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return email.trim()
  return clean
}

// ── Consultation helpers ─────────────────────────────────────────────────────

export async function createConsultation(data) {
  const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : ''
  const deviceType = /Mobile|iPhone|Android/.test(ua) ? (/iPad/.test(ua) ? 'tablet' : 'mobile') : 'desktop'

  const payload = {
    patient_first_name:           sanitizeString(data.firstName),
    patient_last_name:            sanitizeString(data.lastName),
    patient_nhi:                  validateNHI(data.nhi),
    patient_dob:                  data.dob || null,
    patient_phone:                validatePhone(data.phone),
    patient_email:                validateEmail(data.email),
    patient_location:             sanitizeString(data.location),
    chief_complaint:              sanitizeString(data.complaint),
    pharmacy:                     data.pharmacy || null,
    pharmacy_id:                  data.pharmacyId || null,
    acc_eligible:                 data.accEligible,
    acc_employer:                 data.employer,
    acc_injury_date:              data.injuryDate || null,
    acc_injury_details:           data.injuryDetails,
    patient_allergies:            data.allergies || null,
    medical_history:              data.medicalHistory || null,
    medications:                  data.medications || null,
    recording_consent:            data.recordingConsent,
    acc_consent:                  data.accConsent,
    patient_language:             data.patientLanguage || 'en',
    employer_paid:                data.employerPaid || false,
    employer_id:                  data.employerId || null,
    employer_name:                data.employerName || null,
    gp_name:                      data.gpName || null,
    gp_email:                     data.gpEmail || null,
    gp_clinic:                    data.gpClinic || null,
    interpreter_requested:        data.interpreterRequested || false,
    hdc_rights_accepted:          data.hdcRightsAccepted || true,
    research_consent:             data.researchConsent || false,
    tobacco_use:                  data.tobaccoUse || null,
    tobacco_amount:               data.tobaccoAmount || null,
    alcohol_use:                  data.alcoholUse || null,
    alcohol_amount:               data.alcoholAmount || null,
    controlled_medication_mentioned: false,
    card_saved:                   false,
    status:                       data.status || 'waiting',
    ...(data.consultationType    ? { consultation_type:    data.consultationType }    : {}),
    ...(data.consultationSubtype ? { consultation_subtype: data.consultationSubtype } : {}),
    vitals:                       null,
    daily_room_url:               null,
    // Research fields (requires supabase-research-migration.sql)
    patient_age_band:             calcAgeBand(data.dob),
    complaint_category:           categorizeComplaint(data.complaint),
    consultation_month:           new Date().toISOString().slice(0, 7),
    device_type:                  deviceType,
    language_selected:            data.patientLanguage || 'en',
    patient_employment_sector:    categorizeEmploymentSector(data.employer),
  }

  console.log('[createConsultation] inserting payload keys:', Object.keys(payload))

  const { data: consult, error } = await supabase
    .from('consultations')
    .insert(payload)
    .select()
    .single()

  if (error) {
    console.error('[createConsultation] Supabase error: ' + JSON.stringify({
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    }))
    // If a research column doesn't exist yet, retry without those optional fields
    if (error.code === '42703' || error.message?.includes('column')) {
      console.warn('[createConsultation] Retrying without research fields')
      const { patient_age_band, complaint_category, consultation_month,
              device_type, language_selected, patient_employment_sector,
              patient_region, ...corePayload } = payload
      const { data: consult2, error: error2 } = await supabase
        .from('consultations')
        .insert(corePayload)
        .select()
        .single()
      if (error2) throw error2
      return consult2
    }
    throw error
  }
  return consult
}

// Patient-side update helper. Routes through /api/patient-consult which
// enforces a narrow column allowlist and safe-status guard. Callers pass
// whatever columns they need; disallowed ones are silently dropped server-side.
export async function patientUpdateConsultation(consultationId, patch) {
  const res = await apiFetch(`/api/patient-consult?id=${encodeURIComponent(consultationId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `patientUpdateConsultation HTTP ${res.status}`)
  }
  const { consultation } = await res.json()
  return consultation
}

export async function updateVitals(consultationId, vitals) {
  return patientUpdateConsultation(consultationId, { vitals, status: 'vitals_complete' })
}

// assignRoom is called from the provider's start-consult flow (JWT present).
export async function assignRoom(consultationId, roomUrl, roomName) {
  return updateConsultation(consultationId, {
    daily_room_url: roomUrl, daily_room_name: roomName, status: 'ready',
  })
}

// Provider-side consultation update — routes through /api/consultations with
// a JWT. Server enforces a column allowlist so we can never mutate billing /
// auth / audit columns even if the client asks for it.
export async function updateConsultation(id, updates) {
  const res = await apiFetch(`/api/consultations?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `updateConsultation HTTP ${res.status}`)
  }
  const { consultation } = await res.json()
  return consultation
}

export async function getConsultation(id) {
  const res = await apiFetch(`/api/consultations?id=${encodeURIComponent(id)}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `getConsultation HTTP ${res.status}`)
  }
  const { consultation } = await res.json()
  return consultation
}

export async function getActiveConsultations() {
  const res = await apiFetch('/api/consultations?filter=active')
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `getActiveConsultations HTTP ${res.status}`)
  }
  const { consultations } = await res.json()
  return consultations || []
}

// ── Real-time subscription ───────────────────────────────────────────────────

export function subscribeToQueue(callback) {
  return supabase
    .channel('consultations')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'consultations'
    }, callback)
    .subscribe()
}

export async function getAvailability() {
  const { data, error } = await supabase
    .from('availability')
    .select('*')
    .eq('id', 1)
    .single()
  if (error) return { is_open: false, message: 'Service currently unavailable.' }
  return data
}

export async function setAvailability(isOpen, message) {
  const { error } = await supabase
    .from('availability')
    .update({ is_open: isOpen, message, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) throw error
}





















export async function getSchedule() {
  const { data, error } = await supabase
    .from('schedule')
    .select('*')
    .eq('id', 1)
    .single()
  if (error) return { next_times: '' }
  return data
}

export async function setSchedule(nextTimes) {
  const { error } = await supabase
    .from('schedule')
    .update({ next_times: nextTimes, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) throw error
}

// ── Chat / Messages ──────────────────────────────────────────────────────────

export async function sendChatMessage(consultationId, sender, message, photoUrl = null) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ consultation_id: consultationId, sender, message: message || null, photo_url: photoUrl })
    .select().single()
  if (error) throw error
  return data
}

export async function getChatMessages(consultationId) {
  const { data, error } = await supabase
    .from('messages').select('*')
    .eq('consultation_id', consultationId).order('created_at')
  if (error) throw error
  return data || []
}

export function subscribeToChatMessages(consultationId, callback) {
  return supabase
    .channel(`chat-${consultationId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'messages',
      filter: `consultation_id=eq.${consultationId}`,
    }, ({ new: msg }) => callback(msg))
    .subscribe()
}

// ── Patient profile helpers ──────────────────────────────────────────────────

export async function findPatient(firstName, lastName, dob) {
  const { data } = await supabase
    .from('patients')
    .select('*')
    .ilike('first_name', firstName.trim())
    .ilike('last_name', lastName.trim())
    .eq('date_of_birth', dob)
    .maybeSingle()
  return data || null
}

export async function createPatient(data) {
  const { data: patient, error } = await supabase
    .from('patients')
    .insert(data)
    .select()
    .single()
  if (error) throw error
  return patient
}

export async function updatePatient(patientId, updates) {
  const { error } = await supabase
    .from('patients')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', patientId)
  if (error) throw error
}

export async function getPatients({ search = '', limit = 50, offset = 0 } = {}) {
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  if (search && search.trim()) qs.set('search', search.trim())
  const res = await apiFetch(`/api/patients?${qs.toString()}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `getPatients HTTP ${res.status}`)
  }
  const { patients: data, count } = await res.json()
  return { data: data || [], count: count || 0 }
}

export async function getPatient(patientId) {
  const res = await apiFetch(`/api/patients?id=${encodeURIComponent(patientId)}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `getPatient HTTP ${res.status}`)
  }
  const { patient } = await res.json()
  return patient
}

export async function getPatientConsultations(patientId) {
  const res = await apiFetch(`/api/consultations?patientId=${encodeURIComponent(patientId)}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `getPatientConsultations HTTP ${res.status}`)
  }
  const { consultations } = await res.json()
  return consultations || []
}

export async function mergePatients(primaryId, secondaryId) {
  const res = await apiFetch('/api/patients?action=merge', {
    method: 'POST',
    body: JSON.stringify({ primaryId, secondaryId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `mergePatients HTTP ${res.status}`)
  }
  return await res.json()
}

// ── Provider helpers ─────────────────────────────────────────────────────────

export function providerDisplayName(p) {
  if (!p) return 'Provider'
  const cred = (p.credential || '').trim()
  const full = `${p.first_name} ${p.last_name}`
  if (cred === 'M.D.' || cred === 'D.O.') return `Dr ${full}`
  if (!cred) return full
  return `${full} ${cred}`
}

export async function getProviders() {
  const res = await apiFetch('/api/providers')
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `getProviders HTTP ${res.status}`)
  }
  const { providers } = await res.json()
  return providers || []
}

export async function updateProvider(id, updates) {
  const res = await apiFetch(`/api/providers?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `updateProvider HTTP ${res.status}`)
  }
}

// ── Prescriptions ────────────────────────────────────────────────────────────

export async function getPendingPrescriptions(columns = null) {
  const qs = columns ? `&columns=${encodeURIComponent(columns)}` : ''
  const res = await apiFetch(`/api/prescriptions?filter=pending_approval${qs}`)
  if (!res.ok) return []
  const { prescriptions } = await res.json()
  return prescriptions || []
}

export async function getPendingPrescriptionsCount() {
  const res = await apiFetch('/api/prescriptions?filter=pending_count')
  if (!res.ok) return 0
  const { count } = await res.json()
  return count || 0
}

export async function addToWaitlist(name, email) {
  const { error } = await supabase
    .from('waitlist')
    .insert({ name, email })
  if (error) throw error
}

export async function getWaitlist() {
  const res = await apiFetch('/api/consultations?filter=waitlist')
  if (!res.ok) return []
  const { consultations } = await res.json()
  return (consultations || []).map(c => ({
    id: c.id,
    name: `${c.patient_first_name} ${c.patient_last_name}`.trim(),
    email: c.patient_email,
    phone: c.patient_phone,
    created_at: c.created_at,
  }))
}

export async function markWaitlistNotified() {
  const res = await apiFetch('/api/consultations?action=mark-waitlist-notified', { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `markWaitlistNotified HTTP ${res.status}`)
  }
}

// ── Vitals validation tool ───────────────────────────────────────────────────

// Server-mediated: goes through /api/validation-subjects with the current
// provider's Supabase JWT. Server uses service_role so anon RLS is irrelevant.
export async function saveValidationSubject(data) {
  const res = await apiFetch('/api/validation-subjects', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `saveValidationSubject HTTP ${res.status}`)
  }
  const { subject } = await res.json()
  return subject
}

// Alias for callers that don't need the last_scan_at / reading_count enrichment.
export async function getValidationSubjects() {
  return getValidationSubjectsWithLastScan()
}

export async function saveValidationReading(data) {
  const res = await apiFetch('/api/validation-readings', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `saveValidationReading HTTP ${res.status}`)
  }
  const { reading } = await res.json()
  return reading
}

export async function uploadScanVideo(blob, subjectCode) {
  const filename = `${subjectCode || 'unknown'}-${Date.now()}.webm`
  const { error } = await supabase.storage
    .from('scan-videos')
    .upload(filename, blob, { contentType: blob.type || 'video/webm', cacheControl: '3600', upsert: false })
  if (error) throw error
  // Get a long-lived signed URL (bucket is private)
  const { data, error: signErr } = await supabase.storage
    .from('scan-videos')
    .createSignedUrl(filename, 60 * 60 * 24 * 365 * 5)  // 5 years
  if (signErr) throw signErr
  return data?.signedUrl || null
}

export async function getValidationReadings(subjectId = null) {
  const url = subjectId
    ? `/api/validation-readings?subjectId=${encodeURIComponent(subjectId)}`
    : '/api/validation-readings'
  const res = await apiFetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `getValidationReadings HTTP ${res.status}`)
  }
  const { readings } = await res.json()
  return readings || []
}

export async function getValidationSubjectsWithLastScan() {
  const res = await apiFetch('/api/validation-subjects')
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `getValidationSubjectsWithLastScan HTTP ${res.status}`)
  }
  const { subjects } = await res.json()
  return subjects || []
}

export async function getTrainableReadings() {
  const res = await apiFetch('/api/validation-readings?filter=trainable')
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `getTrainableReadings HTTP ${res.status}`)
  }
  const { readings } = await res.json()
  return readings || []
}

export async function updateValidationSpo2(id, tereSpo2) {
  const res = await apiFetch(`/api/validation-readings?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ tereSpo2 }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `updateValidationSpo2 HTTP ${res.status}`)
  }
}

export async function updateValidationHrRr(id, tereHr, tereRr, manualHr, opts = {}) {
  const res = await apiFetch(`/api/validation-readings?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      tereHr, tereRr, manualHr,
      forceOverwrite: !!opts.forceOverwrite,
      ...(opts.hrQuality !== undefined ? { hrQuality: opts.hrQuality } : {}),
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `updateValidationHrRr HTTP ${res.status}`)
  }
}

// Model versions read stays direct because it doesn't contain PHI — just
// training metrics + weight blobs. Kept as an anon-readable table for now.
// The insert path (saveTrainedModel in bpModel.js) goes through
// /api/model-version so the write is provider-gated.
export async function getModelVersions() {
  const { data, error } = await supabase
    .from('model_versions')
    .select('id, model_version, training_samples, final_loss, final_mae, val_mae, trained_at')
    .order('trained_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return data || []
}

export async function getValidationReadingCount() {
  const res = await apiFetch('/api/validation-readings?filter=count')
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `getValidationReadingCount HTTP ${res.status}`)
  }
  const { count } = await res.json()
  return count || 0
}
