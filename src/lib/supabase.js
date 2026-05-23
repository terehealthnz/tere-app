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
  if (!/^[A-Z]{3}\d{4,5}$/.test(clean)) throw new Error('Invalid NHI format')
  return clean
}

function validatePhone(phone) {
  if (!phone) return null
  const clean = String(phone).replace(/\s/g, '')
  // NZ mobile/landline: starts with 0 (local) or +64
  if (!/^(\+64|0)\d{8,10}$/.test(clean)) throw new Error('Invalid NZ phone number')
  return clean
}

function validateEmail(email) {
  if (!email) return null
  const clean = String(email).trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('Invalid email address')
  return clean
}

// ── Consultation helpers ─────────────────────────────────────────────────────

export async function createConsultation(data) {
  const { data: consult, error } = await supabase
    .from('consultations')
    .insert({
      patient_first_name: sanitizeString(data.firstName),
      patient_last_name:  sanitizeString(data.lastName),
      patient_nhi:        validateNHI(data.nhi),
      patient_dob:        data.dob || null,
      patient_phone:      validatePhone(data.phone),
      patient_email:      validateEmail(data.email),
      patient_location:   sanitizeString(data.location),
      chief_complaint:    sanitizeString(data.complaint),
      pharmacy:           data.pharmacy || null,
      acc_eligible:       data.accEligible,
      acc_employer:       data.employer,
      acc_injury_date:    data.injuryDate || null,
      acc_injury_details: data.injuryDetails,
      patient_allergies:  data.allergies || null,
      medical_history:    data.medicalHistory || null,
      medications:        data.medications || null,
      recording_consent:  data.recordingConsent,
      acc_consent:        data.accConsent,
      patient_language:   data.patientLanguage || 'en',
      employer_paid:      data.employerPaid || false,
      employer_id:        data.employerId || null,
      employer_name:      data.employerName || null,
      gp_name:            data.gpName || null,
      gp_email:           data.gpEmail || null,
      gp_clinic:          data.gpClinic || null,
      status:             data.status || 'waiting',
      vitals:             null,
      daily_room_url:     null,
    })
    .select()
    .single()

  if (error) throw error
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
    .from('waitlist')
    .select('*')
    .eq('notified', false)
    .order('created_at', { ascending: true })
  if (error) return []
  return data || []
}

export async function markWaitlistNotified() {
  const { error } = await supabase
    .from('waitlist')
    .update({ notified: true })
    .eq('notified', false)
  if (error) throw error
}
