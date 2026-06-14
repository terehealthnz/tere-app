import { createClient } from '@supabase/supabase-js'

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

export async function updateVitals(consultationId, vitals) {
  const { error } = await supabase
    .from('consultations')
    .update({ vitals, status: 'vitals_complete' })
    .eq('id', consultationId)
  if (error) throw error
}

export async function assignRoom(consultationId, roomUrl, roomName) {
  const { error } = await supabase
    .from('consultations')
    .update({ daily_room_url: roomUrl, daily_room_name: roomName, status: 'ready' })
    .eq('id', consultationId)
  if (error) throw error
}

export async function updateConsultation(id, updates) {
  const { data, error } = await supabase
    .from('consultations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getConsultation(id) {
  const { data, error } = await supabase
    .from('consultations')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function getActiveConsultations() {
  const { data, error } = await supabase
    .from('consultations')
    .select('*')
    .in('status', ['waiting', 'vitals_requested', 'vitals_complete', 'ready', 'in_progress'])
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
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
  let q = supabase
    .from('patients')
    .select('id, first_name, last_name, date_of_birth, nhi, phone, email, total_consultations, last_consultation_at, research_consent', { count: 'exact' })
    .order('last_consultation_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)
  if (search.trim()) {
    const s = search.trim()
    q = q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%,nhi.ilike.%${s}%`)
  }
  const { data, error, count } = await q
  if (error) throw error
  return { data: data || [], count: count || 0 }
}

export async function getPatient(patientId) {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .single()
  if (error) throw error
  return data
}

export async function getPatientConsultations(patientId, limit = 20) {
  const { data, error } = await supabase
    .from('consultations')
    .select('id, created_at, chief_complaint, notes_final, acc_read_code, icd10_code, work_capacity, status, consultation_type, provider_display_name, gp_letter_sent_at, prescription_issued, referral_issued')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function mergePatients(primaryId, secondaryId) {
  await supabase.from('consultations').update({ patient_id: primaryId }).eq('patient_id', secondaryId)
  await supabase.from('consents').update({ consultation_id: primaryId }).eq('consultation_id', secondaryId)
  const { data: primary } = await supabase.from('patients').select('total_consultations').eq('id', primaryId).single()
  const { data: secondary } = await supabase.from('patients').select('total_consultations').eq('id', secondaryId).single()
  await supabase.from('patients').update({
    total_consultations: (primary?.total_consultations || 0) + (secondary?.total_consultations || 0),
    updated_at: new Date().toISOString(),
  }).eq('id', primaryId)
  await supabase.from('patients').delete().eq('id', secondaryId)
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
  const { data, error } = await supabase
    .from('providers')
    .select('id, first_name, last_name, credential, specialty, color, is_active, is_admin, is_provider, is_available, availability_message')
    .order('first_name')
  if (error) throw error
  return data || []
}

export async function updateProvider(id, updates) {
  const { error } = await supabase
    .from('providers')
    .update(updates)
    .eq('id', id)
  if (error) throw error
}

export async function addToWaitlist(name, email) {
  const { error } = await supabase
    .from('waitlist')
    .insert({ name, email })
  if (error) throw error
}

export async function getWaitlist() {
  const { data, error } = await supabase
    .from('consultations')
    .select('id, patient_first_name, patient_last_name, patient_email, patient_phone, created_at')
    .eq('status', 'waitlisted')
    .order('created_at', { ascending: true })
  if (error) return []
  return (data || []).map(c => ({
    id: c.id,
    name: `${c.patient_first_name} ${c.patient_last_name}`.trim(),
    email: c.patient_email,
    phone: c.patient_phone,
    created_at: c.created_at,
  }))
}

export async function markWaitlistNotified() {
  const { error } = await supabase
    .from('consultations')
    .update({ status: 'waiting', updated_at: new Date().toISOString() })
    .eq('status', 'waitlisted')
  if (error) throw error
}

// ── Vitals validation tool ───────────────────────────────────────────────────

export async function saveValidationSubject(data) {
  const { data: subject, error } = await supabase
    .from('validation_subjects')
    .insert({
      subject_code:            data.subjectCode,
      first_name:              data.firstName,
      age:                     data.age || null,
      sex:                     data.sex || null,
      height_cm:               data.heightCm || null,
      weight_kg:               data.weightKg || null,
      fitzpatrick_scale:       data.fitzpatrickScale || null,
      has_hypertension:        data.hasHypertension || 'unknown',
      has_diabetes:            data.hasDiabetes || 'unknown',
      has_regular_medications: data.hasRegularMedications || false,
    })
    .select()
    .single()
  if (error) throw error
  return subject
}

export async function getValidationSubjects() {
  const { data, error } = await supabase
    .from('validation_subjects')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function saveValidationReading(data) {
  const hrDiff = (data.manualHr && data.tereHr)
    ? Math.abs(data.manualHr - data.tereHr) : null

  const { data: reading, error } = await supabase
    .from('validation_readings')
    .insert({
      subject_id:         data.subjectId || null,
      subject_code:       data.subjectCode || null,
      manual_systolic:    data.manualSystolic || null,
      manual_diastolic:   data.manualDiastolic || null,
      manual_hr:          data.manualHr || null,
      manual_temperature: data.manualTemperature || null,
      ambient_temp:       data.ambientTemp ?? null,
      tere_hr:            data.tereHr || null,
      tere_rr:            data.tereRr || null,
      hr_difference:      hrDiff,
      raw_rppg_signal:    data.rawRppgSignal || null,
      device_info:        data.deviceInfo || null,
      notes:              data.notes || null,
      session_conditions: data.sessionConditions || null,
      manual_spo2:        data.manualSpO2 || null,
      tere_spo2:          data.tereSpo2 || null,
      spo2_error:         (data.manualSpO2 && data.tereSpo2)
        ? (data.tereSpo2 - data.manualSpO2) : null,
      hrv_sdnn:           data.hrvSdnn   || null,
      hrv_rmssd:          data.hrvRmssd  || null,
      hrv_pnn50:          data.hrvPnn50  || null,
      af_score:           data.afScore   || null,
      af_likelihood:      data.afLikelihood || null,
      af_confirmed:       data.afConfirmed ?? null,
      af_confirmed_by:    data.afConfirmedBy || null,
    })
    .select()
    .single()
  if (error) throw error
  return reading
}

export async function getValidationReadings(subjectId = null) {
  let q = supabase
    .from('validation_readings')
    .select('*')
    .order('recorded_at', { ascending: false })
  if (subjectId) q = q.eq('subject_id', subjectId)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function getValidationSubjectsWithLastScan() {
  const [{ data: subjects, error: e1 }, { data: scans }] = await Promise.all([
    supabase.from('validation_subjects').select('*'),
    supabase.from('validation_readings').select('subject_id, recorded_at').order('recorded_at', { ascending: false }),
  ])
  if (e1) throw e1

  const lastScanMap = {}
  const readingCountMap = {}
  for (const s of (scans || [])) {
    if (!s.subject_id) continue
    if (!lastScanMap[s.subject_id]) lastScanMap[s.subject_id] = s.recorded_at
    readingCountMap[s.subject_id] = (readingCountMap[s.subject_id] || 0) + 1
  }

  return ((subjects || []).map(s => ({
    ...s,
    last_scan_at:   lastScanMap[s.id]    || null,
    reading_count:  readingCountMap[s.id] || 0,
  }))).sort((a, b) => {
    if (a.last_scan_at && b.last_scan_at) return new Date(b.last_scan_at) - new Date(a.last_scan_at)
    if (a.last_scan_at) return -1
    if (b.last_scan_at) return 1
    return new Date(b.created_at) - new Date(a.created_at)
  })
}

export async function getTrainableReadings() {
  const { data, error } = await supabase
    .from('validation_readings')
    .select('*, validation_subjects(age, sex, height_cm, weight_kg, fitzpatrick_scale)')
    .not('raw_rppg_signal', 'is', null)
    .not('manual_systolic', 'is', null)
    .not('manual_diastolic', 'is', null)
  if (error) throw error
  return data || []
}

export async function updateValidationSpo2(id, tereSpo2) {
  const { error } = await supabase
    .from('validation_readings')
    .update({ tere_spo2: tereSpo2 })
    .eq('id', id)
  if (error) throw error
}

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
  const { count, error } = await supabase
    .from('validation_readings')
    .select('*', { count: 'exact', head: true })
  if (error) throw error
  return count || 0
}
