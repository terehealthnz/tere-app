import { createClient } from '@supabase/supabase-js'
import { apiFetch } from './api'

// Preview builds (Vercel branch deploys, non-main) route to the staging Supabase
// project so pre-prod testing can't touch real PHI. VITE_ENV_STAGE is injected
// at build time by the npm build script — see package.json. Falls back to prod
// values if the _STAGING vars aren't set (safe default for local dev).
const isPreview = import.meta.env.VITE_ENV_STAGE === 'preview'
const url = isPreview
  ? (import.meta.env.VITE_SUPABASE_URL_STAGING || import.meta.env.VITE_SUPABASE_URL)
  : import.meta.env.VITE_SUPABASE_URL
const key = isPreview
  ? (import.meta.env.VITE_SUPABASE_ANON_KEY_STAGING || import.meta.env.VITE_SUPABASE_ANON_KEY)
  : import.meta.env.VITE_SUPABASE_ANON_KEY

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

// Server-mediated create. The client builds the payload (with all the local
// sanitisation helpers) and POSTs to /api/create-consultation, which runs with
// service_role and (a) verifies employer_id against the employers table before
// setting employer_paid + employer_name, and (b) rejects any client attempt to
// set reserved columns (id/patient_id/provider_id/payment_amount/etc).
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
    patient_address:              sanitizeString(data.address),
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
    // employer_id is a *claim* — server verifies against employers.is_active
    // before deriving employer_paid + employer_name. Client-supplied
    // employer_paid + employer_name are ignored by the server.
    employer_id:                  data.employerId || null,
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
    ...(data.notesDraft          ? { notes_draft:          data.notesDraft }          : {}),
    vitals:                       null,
    daily_room_url:               null,
    patient_age_band:             calcAgeBand(data.dob),
    complaint_category:           categorizeComplaint(data.complaint),
    consultation_month:           new Date().toISOString().slice(0, 7),
    device_type:                  deviceType,
    language_selected:            data.patientLanguage || 'en',
    patient_employment_sector:    categorizeEmploymentSector(data.employer),
    // Intake geo gate — recorded at consult start via TereIntro's GeoGateModal.
    // Server has already vetted the IP; we're storing what it saw + what the
    // patient attested for provider visibility and audit.
    ...(data.intakeIpCountry     !== undefined ? { intake_ip_country:  data.intakeIpCountry }     : {}),
    ...(data.intakeIpHash        !== undefined ? { intake_ip_hash:     data.intakeIpHash }        : {}),
    ...(data.intakeAttestedNz    !== undefined ? { intake_attested_nz: data.intakeAttestedNz }    : {}),
    ...(data.intakeAttestedAt    !== undefined ? { intake_attested_at: data.intakeAttestedAt }    : {}),
  }

  const res = await apiFetch('/api/create-consultation', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `createConsultation HTTP ${res.status}`)
  }
  const body = await res.json()
  const consultation = body.consultation
  // Stash the server-minted patient session token. apiFetch attaches this
  // as X-Patient-Token on every subsequent /api/ call so server endpoints
  // can authenticate patient writes without trusting a raw consultation_id
  // in the body. Pen-test M-4/M-5.
  const token = body.patient_access_token || consultation?.patient_access_token
  if (token && typeof sessionStorage !== 'undefined') {
    try { sessionStorage.setItem('patient_access_token', token) } catch {}
  }
  return consultation
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

// Public GET returning a limited safe projection of the patient's own consult
// by id. Used by Rate.jsx and AITriage.jsx's pre_triage lookup.
export async function patientGetConsultation(consultationId) {
  const res = await apiFetch(`/api/patient-consult?id=${encodeURIComponent(consultationId)}`)
  if (!res.ok) return null
  const { consultation } = await res.json()
  return consultation || null
}

// Server-side delete restricted to rows still in status='pre_triage' — used by
// AITriage cleanup after promoting a pre-triage row to a full triage consult.
export async function patientDeletePreTriage(consultationId) {
  const res = await apiFetch(`/api/patient-consult?id=${encodeURIComponent(consultationId)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `patientDeletePreTriage HTTP ${res.status}`)
  }
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

// Patient-side reader — hits /api/patient-consult which returns a safe
// projection (status, provider_display_name, consultation_type, ratings) with
// no provider auth required. Use this from WaitingRoom / PatientCall so the
// status poll doesn't 401 for anonymous patient sessions.
export async function getPatientConsult(id) {
  const res = await apiFetch(`/api/patient-consult?id=${encodeURIComponent(id)}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `getPatientConsult HTTP ${res.status}`)
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

// ── Consultation filter helpers (all provider-JWT gated server-side) ─────────

async function consultsFilter(name, extraParams = {}) {
  const qs = new URLSearchParams({ filter: name, ...extraParams })
  const res = await apiFetch(`/api/consultations?${qs.toString()}`)
  if (!res.ok) throw new Error(`consultsFilter(${name}) HTTP ${res.status}`)
  const body = await res.json()
  return body.consultations || body.count || []
}

export async function getAccPendingConsultations(columns = null) {
  const params = columns ? { columns } : {}
  return consultsFilter('acc_pending', params)
}
export async function getAccPendingCount() {
  const res = await apiFetch('/api/consultations?filter=acc_pending_count')
  if (!res.ok) return 0
  const { count } = await res.json()
  return count || 0
}
export async function getFlaggedNotesCount() {
  const res = await apiFetch('/api/consultations?filter=notes_flagged_count')
  if (!res.ok) return 0
  const { count } = await res.json()
  return count || 0
}
export async function getFlaggedNotes(columns = null) {
  const params = columns ? { columns } : {}
  return consultsFilter('notes_flagged', params)
}
export async function getAccConvertedFlagged(columns = null, limit = 20) {
  const params = { limit: String(limit) }
  if (columns) params.columns = columns
  return consultsFilter('acc_converted_flagged', params)
}
export async function getResearchConsentedConsults(columns = null) {
  const params = columns ? { columns } : {}
  return consultsFilter('research_consented', params)
}
export async function getRecentConsultations(limit = 100, columns = null) {
  const params = { limit: String(limit) }
  if (columns) params.columns = columns
  return consultsFilter('recent', params)
}
export async function getPaymentPendingConsultations(columns = null) {
  const params = columns ? { columns } : {}
  return consultsFilter('payment_pending', params)
}
export async function getRatedConsultations(columns = null) {
  const params = columns ? { columns } : {}
  return consultsFilter('rated', params)
}
export async function getRecallPendingConsultations(columns = null) {
  const params = columns ? { columns } : {}
  return consultsFilter('recall_pending', params)
}
export async function getAllCompleteConsultations(limit = 200, columns = null) {
  const params = { limit: String(limit) }
  if (columns) params.columns = columns
  return consultsFilter('all_complete', params)
}
export async function getProviderPeriodConsults({ providerId, start, end, columns } = {}) {
  const params = {}
  if (providerId) params.providerId = providerId
  if (start)      params.start = start
  if (end)        params.end = end
  if (columns)    params.columns = columns
  return consultsFilter('provider_period', params)
}
export async function getCompleteCount() {
  const res = await apiFetch('/api/consultations?filter=complete_count')
  if (!res.ok) return 0
  const { count } = await res.json()
  return count || 0
}
export async function getCompleteSince(sinceISO, columns = null) {
  const params = { since: sinceISO }
  if (columns) params.columns = columns
  return consultsFilter('complete_since', params)
}
export async function getPendingNotes(columns = null, limit = 50) {
  const params = { limit: String(limit) }
  if (columns) params.columns = columns
  return consultsFilter('pending_notes', params)
}
export async function getCompletedNotes(columns = null, limit = 50) {
  const params = { limit: String(limit) }
  if (columns) params.columns = columns
  return consultsFilter('completed_notes', params)
}
export async function getConsultsByEmployer(employerId, sinceISO = null, columns = null) {
  const params = { employerId }
  if (sinceISO) params.since = sinceISO
  if (columns)  params.columns = columns
  return consultsFilter('by_employer', params)
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
// sendChatMessage moved lower in the file — it now takes an object and goes
// through /api/messages. See `sendChatMessage({...})` below.

export async function getChatMessages(consultationId) {
  const res = await apiFetch(`/api/messages?consultation_id=${encodeURIComponent(consultationId)}`)
  if (!res.ok) return []
  const { messages } = await res.json()
  return messages || []
}

// Realtime subscription now uses Supabase Broadcast, not postgres_changes.
// Server /api/messages POST fires a broadcast on `chat-<consult_id>` after
// inserting the row via service_role. Because broadcast is ephemeral and
// doesn't touch the DB, no anon SELECT on the messages table is required —
// meaning we can lock the table down completely.
export function subscribeToChatMessages(consultationId, callback) {
  return supabase
    .channel(`chat-${consultationId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'new_message' }, ({ payload }) => {
      if (payload?.message) callback(payload.message)
    })
    .subscribe()
}

// ── Patient profile helpers ──────────────────────────────────────────────────

// Provider-side NHI-first lookup. Direct hit against patients.nhi (case-
// insensitive on the server). Emits a `nhi_query` audit_log row server-side.
// Returns { patient } or { patient: null } if not found.
export async function findPatientByNhi(nhi) {
  const clean = String(nhi || '').trim().toUpperCase()
  if (!clean) return null
  const res = await apiFetch(`/api/patients?nhi=${encodeURIComponent(clean)}`)
  if (!res.ok) return null
  const { patient } = await res.json()
  return patient || null
}

export async function findPatient(firstName, lastName, dob) {
  const res = await apiFetch('/api/patients?action=lookup', {
    method: 'POST',
    body: JSON.stringify({
      first_name: (firstName || '').trim(),
      last_name:  (lastName || '').trim(),
      date_of_birth: dob,
    }),
  })
  if (!res.ok) return null
  const { patient } = await res.json()
  return patient || null
}

export async function createPatient(data) {
  const res = await apiFetch('/api/patients?action=create', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `createPatient HTTP ${res.status}`)
  }
  const { patient } = await res.json()
  return patient
}

export async function updatePatient(patientId, updates) {
  // Patient anon flow (AITriage) and provider flow (AdminPatients) both use
  // this. anon=1 marker lets the anon triage path through server-side; the
  // provider flow attaches x-provider-id automatically via apiFetch.
  const anonMarker = typeof window !== 'undefined' && !sessionStorage.getItem('providerId') ? '&anon=1' : ''
  const res = await apiFetch(`/api/patients?id=${encodeURIComponent(patientId)}${anonMarker}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `updatePatient HTTP ${res.status}`)
  }
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
  if (!cred) return full
  // Doctoral credentials read as a prefix in NZ/AU/UK conventions ("Dr Rachel
  // Thomas") — everything else is a post-nominal ("Sarah Jones, NP"). Match
  // case-insensitively and tolerate trailing dots.
  const credNorm = cred.replace(/\./g, '').toUpperCase()
  const PREFIX_CREDS = new Set(['DR', 'MD', 'DO', 'MBCHB', 'MBBS', 'MB CHB', 'BM'])
  if (PREFIX_CREDS.has(credNorm)) return `Dr ${full}`
  return `${full}, ${cred}`
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

// ── Employers ────────────────────────────────────────────────────────────────

export async function getEmployers({ includeInactive = false } = {}) {
  const qs = includeInactive ? '?includeInactive=1' : ''
  const res = await apiFetch(`/api/employers${qs}`)
  if (!res.ok) return []
  const { employers } = await res.json()
  return employers || []
}

export async function createEmployer(data) {
  const res = await apiFetch('/api/employers', { method: 'POST', body: JSON.stringify(data) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `createEmployer HTTP ${res.status}`)
  }
  const { employer } = await res.json()
  return employer
}

export async function updateEmployer(id, patch) {
  const res = await apiFetch(`/api/employers?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `updateEmployer HTTP ${res.status}`)
  }
}

export async function addEmployerEmployees(rows) {
  const res = await apiFetch('/api/employer-employees', { method: 'POST', body: JSON.stringify(rows) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `addEmployerEmployees HTTP ${res.status}`)
  }
  const body = await res.json()
  return body.employees || []
}

export async function getEmployerEmployeeCounts() {
  const res = await apiFetch('/api/employer-employees?counts=1')
  if (!res.ok) return {}
  const { counts } = await res.json()
  return counts || {}
}

// ── Audit log ────────────────────────────────────────────────────────────────

export async function writeAuditLog(action, metadata = null) {
  const res = await apiFetch('/api/audit-log', {
    method: 'POST',
    body: JSON.stringify({ action, metadata }),
  })
  return res.ok
}

// ── Radiology referrals ──────────────────────────────────────────────────────

export async function updateRadiologyReferral(id, updates) {
  const res = await apiFetch(`/api/radiology-referrals?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
  return res.ok
}

export async function getRadiologyReferrals({ filter, provider_id, columns } = {}) {
  const params = new URLSearchParams()
  if (filter) params.set('filter', filter)
  if (provider_id) params.set('provider_id', provider_id)
  if (columns) params.set('columns', columns)
  const qs = params.toString() ? `?${params.toString()}` : ''
  const res = await apiFetch(`/api/radiology-referrals${qs}`)
  if (!res.ok) return []
  const { referrals } = await res.json()
  return referrals || []
}

export async function getRadiologyReferralCount({ filter, provider_id } = {}) {
  const params = new URLSearchParams({ count: '1' })
  if (filter) params.set('filter', filter)
  if (provider_id) params.set('provider_id', provider_id)
  const res = await apiFetch(`/api/radiology-referrals?${params.toString()}`)
  if (!res.ok) return 0
  const { count } = await res.json()
  return count || 0
}

// ── Appointments ─────────────────────────────────────────────────────────────
// (updateAppointmentStatus lives further down)

export async function getUpcomingAppointments() {
  const res = await apiFetch('/api/appointments?type=upcoming')
  if (!res.ok) return []
  const { appointments } = await res.json()
  return appointments || []
}

export async function getTodaysAppointments(providerId = null) {
  const qs = providerId ? `?type=today&provider_id=${encodeURIComponent(providerId)}` : '?type=today'
  const res = await apiFetch(`/api/appointments${qs}`)
  if (!res.ok) return []
  const { appointments } = await res.json()
  return appointments || []
}

export async function getReservationCount(sinceIso = null) {
  const qs = sinceIso ? `?type=reservation_count&since=${encodeURIComponent(sinceIso)}` : '?type=reservation_count'
  const res = await apiFetch(`/api/appointments${qs}`)
  if (!res.ok) return 0
  const { count } = await res.json()
  return count || 0
}

// ── Prescriptions (recent list helpers) ──────────────────────────────────────

export async function getRecentPrescriptions(sinceIso, columns = null) {
  const params = new URLSearchParams({ filter: 'recent' })
  if (sinceIso) params.set('since', sinceIso)
  if (columns) params.set('columns', columns)
  const res = await apiFetch(`/api/prescriptions?${params.toString()}`)
  if (!res.ok) return []
  const { prescriptions } = await res.json()
  return prescriptions || []
}

export async function getPatientDocuments(patientId) {
  if (!patientId) return []
  const res = await apiFetch(`/api/patient-documents?patientId=${encodeURIComponent(patientId)}`)
  if (!res.ok) return []
  const { documents } = await res.json()
  return documents || []
}

export async function uploadPatientDocument({ patientId, title, description, file, source }) {
  if (!file) throw new Error('file required')
  const fileBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const s = String(reader.result || '')
      const i = s.indexOf(',')
      resolve(i >= 0 ? s.slice(i + 1) : s)
    }
    reader.onerror = () => reject(reader.error || new Error('read failed'))
    reader.readAsDataURL(file)
  })
  const res = await apiFetch('/api/patient-documents', {
    method: 'POST',
    body: JSON.stringify({
      patientId, title, description,
      fileName: file.name,
      mimeType: file.type,
      fileBase64,
      source: source || 'provider_upload',
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `uploadPatientDocument HTTP ${res.status}`)
  }
  const { document } = await res.json()
  return document
}

// Patient-side upload — anon-callable. Server derives patient_id from
// consultationId, restricts to active consults, source='patient_upload'.
export async function patientUploadDocument({ consultationId, title, description, file }) {
  if (!consultationId) throw new Error('consultationId required')
  if (!file) throw new Error('file required')
  const fileBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const s = String(reader.result || '')
      const i = s.indexOf(',')
      resolve(i >= 0 ? s.slice(i + 1) : s)
    }
    reader.onerror = () => reject(reader.error || new Error('read failed'))
    reader.readAsDataURL(file)
  })
  const res = await apiFetch('/api/patient-upload', {
    method: 'POST',
    body: JSON.stringify({
      consultationId, title, description,
      fileName: file.name,
      mimeType: file.type,
      fileBase64,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `patientUploadDocument HTTP ${res.status}`)
  }
  const { document } = await res.json()
  return document
}

export async function deletePatientDocument(id) {
  const res = await apiFetch(`/api/patient-documents?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `deletePatientDocument HTTP ${res.status}`)
  }
  return true
}

// ── Structured patient history (task #223) — allergens, medications, conditions
// as first-class rows instead of free-text on the patients table. Each
// endpoint follows the same shape: list by patientId, create, update, delete.

function makeCrud(base, singularKey, pluralKey) {
  return {
    async list(patientId) {
      if (!patientId) return []
      const res = await apiFetch(`/api/${base}?patientId=${encodeURIComponent(patientId)}`)
      if (!res.ok) return []
      const body = await res.json()
      return body[pluralKey] || []
    },
    async create(row) {
      const res = await apiFetch(`/api/${base}`, { method: 'POST', body: JSON.stringify(row) })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `create ${singularKey} HTTP ${res.status}`)
      }
      return (await res.json())[singularKey]
    },
    async update(id, patch) {
      const res = await apiFetch(`/api/${base}?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `update ${singularKey} HTTP ${res.status}`)
      }
      return (await res.json())[singularKey]
    },
    async remove(id) {
      const res = await apiFetch(`/api/${base}?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `delete ${singularKey} HTTP ${res.status}`)
      }
      return true
    },
  }
}

export const patientAllergensApi   = makeCrud('patient-allergens',   'allergen',   'allergens')
export const patientMedicationsApi = makeCrud('patient-medications', 'medication', 'medications')
export const patientConditionsApi  = makeCrud('patient-conditions',  'condition',  'conditions')

export async function getPatientPrescriptions(patientId) {
  if (!patientId) return []
  const res = await apiFetch(`/api/prescriptions?patientId=${encodeURIComponent(patientId)}`)
  if (!res.ok) return []
  const { prescriptions } = await res.json()
  return prescriptions || []
}

export async function getRecentPrescriptionsList(limit = 30, columns = null) {
  const params = new URLSearchParams({ filter: 'recent_list', limit: String(limit) })
  if (columns) params.set('columns', columns)
  const res = await apiFetch(`/api/prescriptions?${params.toString()}`)
  if (!res.ok) return []
  const { prescriptions } = await res.json()
  return prescriptions || []
}

// ── ACC claims ───────────────────────────────────────────────────────────────

export async function getAccClaims({ limit = 50, provider_id, status } = {}) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (provider_id) params.set('provider_id', provider_id)
  if (status) params.set('status', status)
  const res = await apiFetch(`/api/acc-claims?${params.toString()}`)
  if (!res.ok) return []
  const { claims } = await res.json()
  return claims || []
}

// Admin ACC-claims list — same underlying /api/acc-claims but higher default
// limit for the Admin > ACC tab, and post-fetch client-side filtering by
// date / min amount / NHI (server currently supports status + provider_id
// only; broader filters live client-side).
export async function listAccClaimsAdmin({ status, from, to, minAmountCents, patientNhi, limit = 500 } = {}) {
  const claims = await getAccClaims({ limit, status: status || undefined })
  return claims.filter(c => {
    if (from && c.created_at && new Date(c.created_at) < new Date(from)) return false
    if (to   && c.created_at && new Date(c.created_at) > new Date(to)) return false
    if (minAmountCents != null && (c.amount_claimed || 0) < minAmountCents) return false
    if (patientNhi && String(c.patient_nhi || '').toLowerCase() !== String(patientNhi).toLowerCase()) return false
    return true
  })
}

// Fetch the assembled per-claim evidence bundle. `reason` is one of the
// audit-log ALLOWED_REASONS; the server rejects anything else with 400.
// The access itself is audit-logged server-side.
export async function getAccAuditBundle(claimId, { reason, reasonNotes } = {}) {
  const params = new URLSearchParams({ claim_id: String(claimId), reason: String(reason || 'quality_audit') })
  if (reasonNotes) params.set('reason_notes', String(reasonNotes))
  const res = await apiFetch(`/api/acc-audit-bundle?${params.toString()}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  const { bundle } = await res.json()
  return bundle
}

// ACC outcome measures (per-consult time-series pain/function/RTW scores).
export async function listAccOutcomeMeasures({ consultationId, claimNumber } = {}) {
  const params = new URLSearchParams()
  if (consultationId) params.set('consultation_id', consultationId)
  if (claimNumber)    params.set('claim_number', claimNumber)
  const res = await apiFetch(`/api/acc-outcome-measures?${params.toString()}`)
  if (!res.ok) return []
  const { measures } = await res.json()
  return measures || []
}

export async function addAccOutcomeMeasure({ consultationId, measureType, valueNumeric, valueText, notes }) {
  const res = await apiFetch('/api/acc-outcome-measures', {
    method: 'POST',
    body: JSON.stringify({
      consultation_id: consultationId,
      measure_type:    measureType,
      value_numeric:   valueNumeric,
      value_text:      valueText,
      notes,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  const { measure } = await res.json()
  return measure
}

export async function deleteAccOutcomeMeasure(id) {
  const res = await apiFetch(`/api/acc-outcome-measures?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  return res.ok
}

// Download the PDF-format bundle for a single claim. Returns a Blob so the
// caller can trigger a browser download.
export async function downloadAccAuditBundlePdf(claimId, { reason, reasonNotes } = {}) {
  const params = new URLSearchParams({ claim_id: String(claimId), reason: String(reason || 'quality_audit'), format: 'pdf' })
  if (reasonNotes) params.set('reason_notes', String(reasonNotes))
  const res = await apiFetch(`/api/acc-audit-bundle?${params.toString()}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.blob()
}

// ── Bookings ─────────────────────────────────────────────────────────────────

export async function getTodaysBookings(providerId = null) {
  const qs = providerId ? `?action=today&provider_id=${encodeURIComponent(providerId)}` : '?action=today'
  const res = await apiFetch(`/api/bookings${qs}`)
  if (!res.ok) return []
  const { bookings } = await res.json()
  return bookings || []
}

// ── SpO2 calibrations ────────────────────────────────────────────────────────

export async function getLatestSpo2Calibration() {
  const res = await apiFetch('/api/spo2-calibrations')
  if (!res.ok) return null
  const { calibration } = await res.json()
  return calibration || null
}

export async function saveSpo2Calibration({ slope, intercept, n, rmse }) {
  const res = await apiFetch('/api/spo2-calibrations', {
    method: 'POST',
    body: JSON.stringify({ slope, intercept, n, rmse: rmse ?? null }),
  })
  return res.ok
}

// ── Job listings ─────────────────────────────────────────────────────────────

export async function createJobListing(payload) {
  const res = await apiFetch('/api/job-listings', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return res.ok
}

export async function updateJobListing(id, patch) {
  const res = await apiFetch(`/api/job-listings?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return res.ok
}

export async function deleteJobListing(id) {
  const res = await apiFetch(`/api/job-listings?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  return res.ok
}

// ── Job listings (read) ──────────────────────────────────────────────────────

export async function getJobListings() {
  const res = await apiFetch('/api/job-listings')
  if (!res.ok) return []
  const { listings } = await res.json()
  return listings || []
}

// ── Job applications ─────────────────────────────────────────────────────────

export async function submitJobApplication(payload) {
  const res = await apiFetch('/api/job-applications', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, error: body.error, id: body.id }
}

export async function getJobApplications({ status, archived } = {}) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (archived) params.set('archived', '1')
  const qs = params.toString() ? `?${params.toString()}` : ''
  const res = await apiFetch(`/api/job-applications${qs}`)
  if (!res.ok) return []
  const { applications } = await res.json()
  return applications || []
}

export async function getJobApplication(id) {
  const res = await apiFetch(`/api/job-applications?id=${encodeURIComponent(id)}`)
  if (!res.ok) return null
  return await res.json()
}

export async function updateJobApplication(id, patch) {
  const res = await apiFetch(`/api/job-applications?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return res.ok
}

export async function addApplicationNote(applicationId, note) {
  const res = await apiFetch(`/api/job-applications?action=note&id=${encodeURIComponent(applicationId)}`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  })
  return res.ok
}

export async function updateOnboardingStep(stepId, patch) {
  const res = await apiFetch(`/api/job-applications?action=step&id=${encodeURIComponent(stepId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return res.ok
}

// ── Video interviews ─────────────────────────────────────────────────
// Backed by job_interviews table + LiveKit rooms. Applicant joins
// anonymously via /interview/:token (a URL token from the email invite);
// interviewer joins from admin via startInterview → LiveKit access token.

export async function listInterviews(applicationId) {
  const res = await apiFetch(`/api/job-applications?action=interviews&id=${encodeURIComponent(applicationId)}`)
  if (!res.ok) return []
  const body = await res.json()
  return body.interviews || []
}

// Cross-applicant queue view — powers Careers → Interviews tab.
export async function listAllInterviews() {
  const res = await apiFetch('/api/job-applications?action=all_interviews')
  if (!res.ok) return []
  const body = await res.json()
  return body.interviews || []
}

export async function scheduleInterview(applicationId, { scheduledAt, mode, proposedSlots, durationMinutes } = {}) {
  const payload = {}
  if (Array.isArray(proposedSlots) && proposedSlots.length > 0) {
    // Slot-picker flow — server sets status='proposed' + emails picker link.
    payload.proposedSlots = proposedSlots
    if (durationMinutes) payload.durationMinutes = durationMinutes
  } else {
    payload.scheduledAt = scheduledAt
    payload.mode = mode || (scheduledAt ? 'scheduled' : 'instant')
    if (durationMinutes) payload.durationMinutes = durationMinutes
  }
  const res = await apiFetch(`/api/job-applications?action=schedule_interview&id=${encodeURIComponent(applicationId)}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Interview scheduling failed')
  return await res.json()
}

// ── Job offers ──────────────────────────────────────────────────────────
export async function listOffers(applicationId) {
  const res = await apiFetch(`/api/job-applications?action=offers&id=${encodeURIComponent(applicationId)}`)
  if (!res.ok) return []
  const body = await res.json()
  return body.offers || []
}

export async function createOffer(applicationId, { roleTitle, compensation, startDate, contractTerms } = {}) {
  const res = await apiFetch(`/api/job-applications?action=create_offer&id=${encodeURIComponent(applicationId)}`, {
    method: 'POST',
    body: JSON.stringify({ roleTitle, compensation, startDate, contractTerms }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Offer create failed')
  return await res.json()
}

export async function countersignOffer(offerId, { signerName } = {}) {
  const res = await apiFetch(`/api/job-applications?action=countersign_offer&id=${encodeURIComponent(offerId)}`, {
    method: 'POST',
    body: JSON.stringify({ signerName }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Countersign failed')
  return await res.json()
}

export async function cancelOffer(offerId) {
  const res = await apiFetch(`/api/job-applications?action=cancel_offer&id=${encodeURIComponent(offerId)}`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return res.ok
}

export async function getOfferPdfUrl(offerId) {
  const res = await apiFetch(`/api/job-applications?action=offer_pdf&id=${encodeURIComponent(offerId)}`)
  if (!res.ok) return null
  const body = await res.json()
  return body.signedUrl || null
}

// ── References ─────────────────────────────────────────────────────────
export async function listReferences(applicationId) {
  const res = await apiFetch(`/api/job-applications?action=references&id=${encodeURIComponent(applicationId)}`)
  if (!res.ok) return []
  const body = await res.json()
  return body.references || []
}

export async function requestReference(applicationId, { refereeName, refereeEmail, refereePhone, refereeRelationship } = {}) {
  const res = await apiFetch(`/api/job-applications?action=request_reference&id=${encodeURIComponent(applicationId)}`, {
    method: 'POST',
    body: JSON.stringify({ refereeName, refereeEmail, refereePhone, refereeRelationship }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Reference request failed')
  return await res.json()
}

export async function cancelReference(referenceId) {
  const res = await apiFetch(`/api/job-applications?action=cancel_reference&id=${encodeURIComponent(referenceId)}`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return res.ok
}

// Applicant-driven referee intake — admin clicks a button, applicant gets
// emailed, fills in 2-3 referees, referee emails fire automatically.
export async function requestRefereesFromApplicant(applicationId) {
  const res = await apiFetch(`/api/job-applications?action=request_referees_from_applicant&id=${encodeURIComponent(applicationId)}`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed')
  return await res.json()
}

export async function getApplicantReferenceIntake(applicationId) {
  const res = await apiFetch(`/api/job-applications?action=applicant_reference_intake_admin&id=${encodeURIComponent(applicationId)}`)
  if (!res.ok) return null
  const body = await res.json()
  return body.intake || null
}

export async function cancelApplicantReferenceIntake(applicationId) {
  const res = await apiFetch(`/api/job-applications?action=cancel_applicant_reference_intake&id=${encodeURIComponent(applicationId)}`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return res.ok
}

// ── Onboarding intake (admin side) ─────────────────────────────────────
export async function createOnboardingIntake(applicationId) {
  const res = await apiFetch(`/api/job-applications?action=create_onboarding_intake&id=${encodeURIComponent(applicationId)}`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Onboarding intake create failed')
  return await res.json()
}

export async function getOnboardingIntake(applicationId) {
  const res = await apiFetch(`/api/job-applications?action=onboarding_intake&id=${encodeURIComponent(applicationId)}`)
  if (!res.ok) return null
  const body = await res.json()
  return body.intake || null
}

export async function revealOnboardingSecret(intakeId, field) {
  const res = await apiFetch(`/api/job-applications?action=reveal_onboarding_secret&id=${encodeURIComponent(intakeId)}`, {
    method: 'POST',
    body: JSON.stringify({ field }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Reveal failed')
  const body = await res.json()
  return body.value
}

export async function getOnboardingFileUrl(intakeId, kind) {
  const res = await apiFetch(`/api/job-applications?action=onboarding_file&id=${encodeURIComponent(intakeId)}&kind=${encodeURIComponent(kind)}`)
  if (!res.ok) return null
  const body = await res.json()
  return body.signedUrl || null
}

export async function cancelOnboarding(applicationId) {
  const res = await apiFetch(`/api/job-applications?action=cancel_onboarding&id=${encodeURIComponent(applicationId)}`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return res.ok
}

// ── Offer templates ────────────────────────────────────────────────────
export async function listOfferTemplates() {
  const res = await apiFetch('/api/job-applications?action=offer_templates')
  if (!res.ok) return []
  const body = await res.json()
  return body.templates || []
}

export async function createOfferTemplate({ name, roleTitleDefault, compensationDefault, contractTerms, sortOrder } = {}) {
  const res = await apiFetch('/api/job-applications?action=create_offer_template', {
    method: 'POST',
    body: JSON.stringify({ name, roleTitleDefault, compensationDefault, contractTerms, sortOrder }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Template create failed')
  return await res.json()
}

export async function updateOfferTemplate(templateId, patch = {}) {
  const res = await apiFetch(`/api/job-applications?action=update_offer_template&id=${encodeURIComponent(templateId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Template update failed')
  return await res.json()
}

export async function deleteOfferTemplate(templateId) {
  const res = await apiFetch(`/api/job-applications?action=delete_offer_template&id=${encodeURIComponent(templateId)}`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return res.ok
}

export async function updateInterview(interviewId, patch) {
  const res = await apiFetch(`/api/job-applications?action=interview&id=${encodeURIComponent(interviewId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return res.ok
}

// Interviewer joins — returns { token, serverUrl, roomName } for LiveKit.
export async function startInterview(interviewId) {
  const res = await apiFetch(`/api/job-applications?action=start_interview&id=${encodeURIComponent(interviewId)}`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error('Could not start interview')
  return await res.json()
}

export async function uploadCvFile(file, applicantEmail) {
  // Direct-to-storage upload with the anon client. Bucket policy allows anon
  // INSERT into the `cvs` bucket; PDF/DOCX only, 5MB limit enforced server-side.
  const safeEmail = (applicantEmail || 'applicant').toLowerCase().replace(/[^a-z0-9]/g, '_')
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
  const path = `${safeEmail}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('cvs').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  })
  if (error) throw error
  const { data } = supabase.storage.from('cvs').getPublicUrl(path)
  return { url: data.publicUrl, filename: file.name }
}

// ── Clinic-wide schedule (single-row config, distinct from provider schedules) ──

export async function saveClinicSchedule({ slots, use_schedule }) {
  const body = {}
  if (slots !== undefined) body.slots = slots
  if (use_schedule !== undefined) body.use_schedule = use_schedule
  const res = await apiFetch('/api/clinic-schedule', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return res.ok
}

// ── Chat messages ────────────────────────────────────────────────────────────

export async function sendChatMessage({ consultation_id, message, photo_url, translated_text, detected_language }) {
  const res = await apiFetch('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ consultation_id, message, photo_url, translated_text, detected_language }),
  })
  return res.ok
}

// ── Appointments ─────────────────────────────────────────────────────────────

const APPOINTMENT_STATUS_TO_ACTION = {
  confirmed: 'confirm',
  cancelled: 'cancel',
  completed: 'complete',
  no_show:   'no_show',
}

export async function updateAppointmentStatus(id, status) {
  const action = APPOINTMENT_STATUS_TO_ACTION[status]
  if (!action) throw new Error(`Unsupported appointment status: ${status}`)
  const res = await apiFetch('/api/appointments', {
    method: 'POST',
    body: JSON.stringify({ action, appointment_id: id }),
  })
  return res.ok
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

// Fire-and-forget patient presence heartbeat. Called from the waiting-room
// and call screens every ~15s so the provider's Call button can decide
// whether to try LiveKit (patient online) or fall straight through to phone.
export async function sendPatientHeartbeat(consultationId) {
  if (!consultationId) return
  try {
    await apiFetch(`/api/patient-heartbeat?id=${encodeURIComponent(consultationId)}`, { method: 'POST' })
  } catch {}
}

// Provider-side action dispatch for the EncounterActionBar. Returns
// { ok, action, deliveryChannel?, reason?, consultation }.
export async function encounterAction(consultationId, action) {
  const res = await apiFetch(`/api/encounter-action?id=${encodeURIComponent(consultationId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `encounterAction HTTP ${res.status}`)
  }
  return await res.json()
}

// Returns a Set of pharmacy_ids that currently have a dispensary_email on
// file. All 3 pharmacy pickers filter pharmacies.json against this so we only
// offer pharmacies we can actually email a prescription to.
let _emailableIdsCache = null
let _emailableIdsAt = 0
export async function fetchEmailablePharmacyIds() {
  if (_emailableIdsCache && Date.now() - _emailableIdsAt < 5 * 60 * 1000) return _emailableIdsCache
  try {
    const res = await apiFetch('/api/pharmacy-contacts')
    if (!res.ok) return _emailableIdsCache || new Set()
    const { ids } = await res.json()
    _emailableIdsCache = new Set(ids || [])
    _emailableIdsAt = Date.now()
    return _emailableIdsCache
  } catch {
    return _emailableIdsCache || new Set()
  }
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
