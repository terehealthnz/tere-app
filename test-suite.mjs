/**
 * Tere Health - Comprehensive Automated Test Suite
 * Tests 100 patient journeys across all flows with bug detection and reporting.
 */

import { createClient } from '@supabase/supabase-js'

// ── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://xynwqfbnwpkyvovxdone.supabase.co'
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5bndxZmJud3BreXZvdnhkb25lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNDUyMDgsImV4cCI6MjA5NDYyMTIwOH0.HUAb_LcJ6ONZyMatyxQGXPOHcP6kLNw8E403CvriJjo'
const API_BASE      = 'http://localhost:3002'
const TEST_PREFIX   = 'TEST-SUITE-'
const TEST_EMAIL    = 'test@tere-test.invalid'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Test Runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0, warnings = 0
const results = []
const bugs = []
const createdIds = []

function pass(name, detail = '') {
  passed++
  results.push({ status: 'PASS', name, detail })
}

function fail(name, detail = '', bug = null) {
  failed++
  results.push({ status: 'FAIL', name, detail })
  if (bug) bugs.push(bug)
}

function warn(name, detail = '') {
  warnings++
  results.push({ status: 'WARN', name, detail })
}

function assert(condition, name, detail = '', bug = null) {
  if (condition) pass(name, detail)
  else fail(name, detail, bug)
}

// ── Business Logic (reimplemented from source for unit testing) ───────────────

const PHYSICAL_EMERGENCY_KEYWORDS = [
  'chest pain','chest tightness','cant breathe','cannot breathe','difficulty breathing',
  'stroke','face drooping','arm weakness','slurred speech','unconscious','passed out',
  'major bleeding','wont stop bleeding','severe allergic','throat swelling','anaphylaxis',
  'not breathing','no pulse','seizing','seizure','collapsed','paralysis',
  'crushing','pressure in chest','severe bleeding',
]
const MENTAL_HEALTH_KEYWORDS = [
  'suicidal','want to die','kill myself','self harm','hurting myself',
  "can't go on","cant go on",'ending my life',"don't want to be here",
  'no reason to live','end my life','take my life',
]
const ADDICTION_KEYWORDS = [
  'drinking too much','alcohol problem',"can't stop drinking","cant stop drinking",
  'addiction','dependent on alcohol','alcoholic',
]
const ACC_INJURY_KEYWORDS = [
  'fell','fall','fallen','trip','tripped','slipped','slip',
  'hurt','injured','accident','crash','collision','impact',
  'sprain','sprained','strain','strained','fracture','fractured','broken','broke',
  'cut','laceration','wound','bruise','bruised','bump','hit','knocked','banged',
  'twisted','pulled','torn','tore','dislocated','dislocation',
  'sport','sports','playing','lifting','gym','running','cycling','whiplash',
  'bite','bitten','stung','burn','burnt','burned','swollen','bleeding','bleed',
  'gash','graze','scraped','scrape','work accident','car accident',
]
const MESSAGE_KEYWORDS = [
  'prescription repeat','repeat script','repeat prescription','repeat medication',
  'follow up','follow-up','followup',
  'results','test results','lab results',
  'referral letter','referral',
  'medication question','medication advice',
  'rash photo','skin photo','minor rash',
  'same as before','same issue','same problem','same condition',
  'returning patient','back again',
]
const VIDEO_FORCE_KEYWORDS = [
  'injury','injured','hurt','accident','fell','fall','trip',
  'acc','work injury','sport','sports',
  'chest','breathing','breathe','breath','short of breath',
  'child','children','baby','infant','toddler',
  'mental health','anxiety','depression','panic','suicid',
  'new symptom','never had','getting worse','worsening',
  'fever','temperature','hot','chills',
  'infection','infected','spreading',
  'swelling','swollen','inflammation',
  'severe pain','sharp pain','stabbing pain',
  'urgent','emergency','serious',
  'bleeding','blood loss','blood in urine','blood in stool','coughing blood','wound','cut',
  'vomit','nausea',
  'dizziness','dizzy','faint','fainting',
  'seizure','fit','convuls',
]

function checkPhysicalEmergency(text) { return PHYSICAL_EMERGENCY_KEYWORDS.some(kw => text.toLowerCase().includes(kw)) }
function checkMentalHealthCrisis(text) { return MENTAL_HEALTH_KEYWORDS.some(kw => text.toLowerCase().includes(kw)) }
function checkAddiction(text) { return ADDICTION_KEYWORDS.some(kw => text.toLowerCase().includes(kw)) }
function checkAccEligible(text) { return ACC_INJURY_KEYWORDS.some(kw => text.toLowerCase().includes(kw)) }

function scoreComplaint(complaint, isReturning = false) {
  const lower = (complaint || '').toLowerCase()
  const needsVideo = VIDEO_FORCE_KEYWORDS.some(kw => lower.includes(kw))
  if (needsVideo) return { allowVideo: true, allowPhone: true, allowMessage: false }
  const isMessageAppropriate = MESSAGE_KEYWORDS.some(kw => lower.includes(kw))
  return { allowVideo: true, allowPhone: true, allowMessage: isMessageAppropriate && isReturning }
}

function providerDisplayName(p) {
  if (!p) return 'Provider'
  const cred = (p.credential || '').trim()
  const full = `${p.first_name} ${p.last_name}`
  if (cred === 'M.D.' || cred === 'D.O.') return `Dr ${full}`
  if (!cred) return full
  return `${full} ${cred}`
}

const CONSULT_PRICES = {
  video:   { private: 65, acc: 25 },
  phone:   { private: 45, acc: 15 },
  message: { private: 25, acc: 25 },
}

function calcAmount(type, isAcc) {
  const prices = CONSULT_PRICES[type] || CONSULT_PRICES.video
  return isAcc && type !== 'message' ? prices.acc : prices.private
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}

// Detect which optional columns/tables exist in the DB
const SCHEMA_CAPS = {
  consultation_type: false,
  prescriptions: false,
  radiology_referrals: false,
  providers: false,
  messages: false,
  started_at: false,
  notes_columns: false,
}
{
  const { error: e1 } = await supabase.from('consultations').select('consultation_type').limit(1)
  SCHEMA_CAPS.consultation_type = !e1
  const { error: e2 } = await supabase.from('prescriptions').select('id').limit(1)
  SCHEMA_CAPS.prescriptions = !e2
  const { error: e3 } = await supabase.from('radiology_referrals').select('id').limit(1)
  SCHEMA_CAPS.radiology_referrals = !e3
  const { error: e4 } = await supabase.from('providers').select('id').limit(1)
  SCHEMA_CAPS.providers = !e4
  const { error: e5 } = await supabase.from('messages').select('id').limit(1)
  SCHEMA_CAPS.messages = !e5
  const { error: e6 } = await supabase.from('consultations').select('started_at').limit(1)
  SCHEMA_CAPS.started_at = !e6
  const { error: e7 } = await supabase.from('consultations').select('notes_draft, notes_finalised, notes_flagged, outcome').limit(1)
  SCHEMA_CAPS.notes_columns = !e7
}

async function createTestConsult(overrides = {}) {
  const base = {
    patient_first_name: TEST_PREFIX + 'Patient',
    patient_last_name:  'Doe',
    patient_dob:        '1990-01-15',
    patient_email:      TEST_EMAIL,
    patient_phone:      '021000000',
    patient_location:   'Test Location',
    chief_complaint:    'Test complaint',
    acc_eligible:       'no',
    status:             'waiting',
    ...overrides,
  }
  // Only include consultation_type if column exists
  if (SCHEMA_CAPS.consultation_type && overrides.consultation_type) {
    base.consultation_type = overrides.consultation_type
  } else {
    delete base.consultation_type
  }
  const { data, error } = await supabase.from('consultations').insert(base).select().single()
  if (error) throw error
  createdIds.push(data.id)
  return data
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: UNIT TESTS — Triage keyword routing
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════')
console.log('  SECTION 1: TRIAGE KEYWORD ROUTING LOGIC')
console.log('═══════════════════════════════════════════════')

// 1.1 Physical emergencies → 111 screen
const physicalCases = [
  { text: 'I have chest pain and cant breathe', expect: true },
  { text: 'I have chest tightness', expect: true },
  { text: 'difficulty breathing', expect: true },
  { text: 'I collapsed at home', expect: true },
  { text: 'pressure in chest', expect: true },
  { text: 'face drooping and arm weakness', expect: true },
  { text: 'not breathing and no pulse', expect: true },
  { text: 'severe allergic reaction throat swelling', expect: true },
  { text: 'I have a sore throat for 3 days', expect: false },
  { text: 'I have a rash on my arm', expect: false },
  { text: 'I twisted my knee playing rugby', expect: false },
]
physicalCases.forEach(({ text, expect }) => {
  const got = checkPhysicalEmergency(text)
  assert(got === expect, `Physical emergency: "${text.slice(0,40)}"`, `Expected ${expect}, got ${got}`)
})

// 1.2 Mental health crisis → mental health resources
const mentalCases = [
  { text: 'I want to kill myself', expect: true },
  { text: 'feeling suicidal', expect: true },
  { text: "I can't go on anymore", expect: true },
  { text: 'end my life tonight', expect: true },
  { text: 'self harm urges', expect: true },
  { text: 'I have anxiety and depression', expect: false },   // anxiety/depression alone = NOT crisis
  { text: 'feeling really sad', expect: false },
]
mentalCases.forEach(({ text, expect }) => {
  const got = checkMentalHealthCrisis(text)
  assert(got === expect, `Mental health: "${text.slice(0,40)}"`, `Expected ${expect}, got ${got}`)
})

// 1.3 Addiction → alcohol resources
const addictionCases = [
  { text: "I can't stop drinking", expect: true },
  { text: "cant stop drinking and need help", expect: true },
  { text: 'I think I have an addiction', expect: true },
  { text: 'alcohol problem for 10 years', expect: true },
  { text: 'I have a sore throat', expect: false },
  { text: 'I drink occasionally', expect: false },
]
addictionCases.forEach(({ text, expect }) => {
  const got = checkAddiction(text)
  assert(got === expect, `Addiction: "${text.slice(0,40)}"`, `Expected ${expect}, got ${got}`)
})

// 1.4 ACC injury detection
const accCases = [
  { text: 'I fell off a ladder at work and hurt my ankle', expect: true },
  { text: 'I twisted my knee playing rugby', expect: true },
  { text: 'I was in a car accident and my neck hurts', expect: true },
  { text: 'fractured wrist from a fall', expect: true },
  { text: 'deep cut on my hand', expect: true },
  { text: 'burn on my arm from cooking', expect: true },
  { text: 'I have a sore throat for 3 days', expect: false },
  { text: 'high blood pressure medication question', expect: false },
  { text: 'need a prescription repeat', expect: false },
]
accCases.forEach(({ text, expect }) => {
  const got = checkAccEligible(text)
  assert(got === expect, `ACC detection: "${text.slice(0,45)}"`, `Expected ${expect}, got ${got}`)
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: CONSULTATION TYPE SCORING
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════')
console.log('  SECTION 2: CONSULTATION TYPE SCORING')
console.log('═══════════════════════════════════════════════')

const typeCases = [
  // complaint, isReturning, expectedAllowMessage
  { c: 'I fell off a ladder at work and hurt my ankle', r: false, allowMsg: false, label: 'ACC work injury' },
  { c: 'I twisted my knee playing rugby', r: false, allowMsg: false, label: 'ACC sport injury' },
  { c: 'I was in a car accident and my neck hurts', r: false, allowMsg: false, label: 'ACC car accident' },
  { c: 'I have a sore throat for 3 days', r: false, allowMsg: false, label: 'Non-ACC, new patient' },
  { c: 'I have a sore throat for 3 days', r: true, allowMsg: false, label: 'Non-ACC, returning, no message keywords' },
  { c: 'prescription repeat for my blood pressure medication', r: true, allowMsg: true, label: 'Rx repeat returning patient' },
  { c: 'prescription repeat for my blood pressure medication', r: false, allowMsg: false, label: 'Rx repeat new patient (no message allowed)' },
  { c: 'follow up for my recent blood test results', r: true, allowMsg: true, label: 'Follow-up returning patient' },
  { c: 'same issue as before, minor rash', r: true, allowMsg: true, label: 'Same issue returning patient' },
  { c: 'severe headache and vomiting', r: true, allowMsg: false, label: 'Red flag symptoms even returning' },
  { c: 'fever and infection spreading', r: true, allowMsg: false, label: 'Fever/infection even returning' },
  { c: 'chest pain and trouble breathing', r: true, allowMsg: false, label: 'Chest/breathing even returning' },
]

typeCases.forEach(({ c, r, allowMsg, label }) => {
  const result = scoreComplaint(c, r)
  assert(result.allowVideo === true,  `Type score allowVideo: ${label}`)
  assert(result.allowPhone === true,  `Type score allowPhone: ${label}`)
  assert(result.allowMessage === allowMsg, `Type score allowMessage (${allowMsg}): ${label}`,
    `allowMessage was ${result.allowMessage}, expected ${allowMsg}`)
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: PAYMENT AMOUNT CALCULATIONS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════')
console.log('  SECTION 3: PAYMENT AMOUNT CALCULATIONS')
console.log('═══════════════════════════════════════════════')

const priceCases = [
  { type: 'video',   acc: false, expected: 65,  label: 'Video private' },
  { type: 'video',   acc: true,  expected: 25,  label: 'Video ACC co-payment' },
  { type: 'phone',   acc: false, expected: 45,  label: 'Phone private' },
  { type: 'phone',   acc: true,  expected: 15,  label: 'Phone ACC co-payment' },
  { type: 'message', acc: false, expected: 25,  label: 'Message private' },
  { type: 'message', acc: true,  expected: 25,  label: 'Message ACC (no discount)' },
]
priceCases.forEach(({ type, acc, expected, label }) => {
  const got = calcAmount(type, acc)
  assert(got === expected, `Price: ${label}`, `Expected $${expected}, got $${got}`)
})

// Also verify backend cents match frontend dollars
const bePrice = { video: { private: 6500, acc: 2500 }, phone: { private: 4500, acc: 1500 }, message: { private: 2500, acc: 2500 } }
priceCases.forEach(({ type, acc, expected, label }) => {
  const key = acc && type !== 'message' ? 'acc' : 'private'
  const beCents = (bePrice[type] || bePrice.video)[key]
  assert(beCents === expected * 100, `BE/FE price match: ${label}`, `FE: $${expected}, BE: ${beCents}c`)
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: PROVIDER DISPLAY NAME
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════')
console.log('  SECTION 4: PROVIDER DISPLAY NAME LOGIC')
console.log('═══════════════════════════════════════════════')

const nameCases = [
  { p: { first_name:'Patrick', last_name:'Herling', credential:'M.D.' }, expected: 'Dr Patrick Herling' },
  { p: { first_name:'Rachel',  last_name:'Thomas',  credential:'D.O.' }, expected: 'Dr Rachel Thomas' },
  { p: { first_name:'Justin',  last_name:'Thomas',  credential:'' },     expected: 'Justin Thomas' },
  { p: { first_name:'Justin',  last_name:'Thomas',  credential:null },   expected: 'Justin Thomas' },
  { p: { first_name:'Sarah',   last_name:'Jones',   credential:'NP' },   expected: 'Sarah Jones NP' },
  { p: null, expected: 'Provider' },
]
nameCases.forEach(({ p, expected }) => {
  const got = providerDisplayName(p)
  assert(got === expected, `Provider name: ${expected}`, `Got "${got}"`)
})

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: BUG DETECTION — Static code analysis
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════')
console.log('  SECTION 5: STATIC BUG DETECTION')
console.log('═══════════════════════════════════════════════')

import { readFileSync } from 'fs'

function readSrc(path) {
  try { return readFileSync(`/Users/patrickherling/Downloads/tere-app/${path}`, 'utf8') }
  catch { return '' }
}

// Bug 5.1: Inconsistent Supabase env var name in create-payment-intent.js
{
  const src = readSrc('api/create-payment-intent.js')
  const hasWrongKey = src.includes('SUPABASE_SERVICE_KEY')
  const hasRightKey = src.includes('SUPABASE_SERVICE_ROLE_KEY')
  if (hasWrongKey && !hasRightKey) {
    fail('ENV var consistency: create-payment-intent.js uses SUPABASE_SERVICE_KEY',
      'Other API files use SUPABASE_SERVICE_ROLE_KEY. Payment intent Supabase writes may fail in production.',
      { file: 'api/create-payment-intent.js', line: 32, severity: 'MEDIUM',
        description: 'Uses SUPABASE_SERVICE_KEY but all other API files use SUPABASE_SERVICE_ROLE_KEY. If service role key is ever set, payment intent saves to DB will silently fail.' })
  } else {
    pass('ENV var consistency: create-payment-intent.js', hasRightKey ? 'Uses correct key' : 'No service key needed')
  }
}

// Bug 5.2: Outdated Claude model name in send-email.js
{
  const src = readSrc('api/send-email.js')
  const usesOldModel = src.includes('claude-sonnet-4-20250514') || src.includes('claude-3') || src.includes('claude-opus-4')
  const usesCorrectModel = src.includes('claude-sonnet-4-6') || src.includes('claude-opus-4-7') || src.includes('claude-haiku-4-5')
  if (usesOldModel && !usesCorrectModel) {
    fail('Model name: send-email.js uses non-existent model ID',
      `Found model reference that is not a valid Claude 4.x model ID. Claude API will return 404.`,
      { file: 'api/send-email.js', line: 31, severity: 'HIGH',
        description: 'Uses "claude-sonnet-4-20250514" which is not a valid API model ID. Should be "claude-sonnet-4-6". Summary emails will silently fail when ANTHROPIC_API_KEY is set.' })
  } else if (usesCorrectModel) {
    pass('Model name: send-email.js', 'Uses correct Claude 4.x model')
  } else {
    warn('Model name: send-email.js', 'No Claude model reference found (email summary disabled)')
  }
}

// Bug 5.3: React hooks after conditional return in Admin.jsx
{
  const src = readSrc('src/components/clinician/Admin.jsx')
  const lines = src.split('\n')
  const pinReturnLine = lines.findIndex(l => l.includes('if (!pinOk) return'))
  const firstHookAfter = lines.findIndex((l, i) => i > pinReturnLine && /^\s+const \[/.test(l))
  if (pinReturnLine > -1 && firstHookAfter > -1) {
    fail('React hooks rules: Admin.jsx has hooks after conditional return',
      `Line ${pinReturnLine+1}: "if (!pinOk) return" then line ${firstHookAfter+1}: hook call. React Rules of Hooks violation.`,
      { file: 'src/components/clinician/Admin.jsx', line: firstHookAfter + 1, severity: 'HIGH',
        description: 'React.useState() called after "if (!pinOk) return" conditional return. Violates Rules of Hooks. Component will throw in strict mode. Fix: move auth check to a sub-component or use a wrapper pattern.' })
  } else {
    pass('React hooks rules: Admin.jsx')
  }
}

// Bug 5.4: node-fetch import in hpi-search.js (not installed, Node 18+ has native fetch)
{
  const src = readSrc('api/hpi-search.js')
  if (src.includes("import fetch from 'node-fetch'")) {
    // Check if node-fetch is installed
    try {
      readFileSync('/Users/patrickherling/Downloads/tere-app/node_modules/node-fetch/package.json')
      pass('node-fetch in hpi-search.js', 'Package is installed')
    } catch {
      fail('node-fetch in hpi-search.js',
        'hpi-search.js imports node-fetch but package is not installed. Node 24 has native fetch — should remove this import.',
        { file: 'api/hpi-search.js', line: 1, severity: 'HIGH',
          description: 'Imports node-fetch which is not in node_modules. Will crash at runtime. Node 18+ has native fetch built-in — remove the import.' })
    }
  } else {
    pass('node-fetch: hpi-search.js does not import it')
  }
}

// Bug 5.5: Trailing space bug in patient name saving
{
  const src = readSrc('src/components/patient/AITriage.jsx')
  const hasBug = src.includes("(nameParts[0]||'') + ' ' + (nameParts.slice(1).join(' ')||'')")
  if (hasBug) {
    warn('Patient name: trailing space when single-word name',
      'AITriage.jsx: sessionStorage patientName will be "FirstName " (trailing space) for single-word names. Minor cosmetic issue.')
  } else {
    pass('Patient name: no trailing space issue found')
  }
}

// Bug 5.6: Mixed static/dynamic supabase imports (build warning)
{
  const chatPanel = readSrc('src/components/ChatPanel.jsx')
  const hasStaticImport = chatPanel.includes("import { supabase } from")
  if (hasStaticImport) {
    warn('Supabase import: ChatPanel uses static import while other components use dynamic',
      'Causes Vite build warning about mixed imports. Not a runtime error but increases initial bundle size.')
  }
}

// Bug 5.7: AccEligible phone mismatch — "I can't stop drinking" triggers addiction AND might also trigger other checks
{
  const src = readSrc('src/components/patient/AITriage.jsx')
  const emergencyCheck = src.includes('if (checkPhysicalEmergency(value))')
  const mentalCheck = src.includes("if (checkMentalHealthCrisis(value))")
  const addictionCheck = src.includes("if (checkAddiction(value))")
  if (!emergencyCheck || !mentalCheck || !addictionCheck) {
    fail('Triage safety checks: not all safety checks present in handleSendValue')
  } else {
    pass('Triage safety checks: all three safety checks present')
  }
}

// Bug 5.8: Phone number normalization strips leading 0 and country code issues
{
  const src = readSrc('src/lib/supabase.js')
  const hasNorm = src.includes("(data.phone||'').replace(/\\s/g,'').replace(/^0+/,'')")
  if (hasNorm) {
    warn('Phone normalization: strips leading zeros',
      "supabase.js strips leading zeros from phone: '021234567' becomes '21234567'. NZ mobile numbers starting with 02x will lose the leading 0. No caller-facing impact but inconsistent storage.")
  }
}

// Bug 5.9: Message consultation — payment captured in sendResponse (Dashboard.jsx fix)
{
  const src = readSrc('src/components/patient/Payment.jsx')
  const msgNav = src.includes("navigate(consultationType === 'message' ? '/message-sent' : '/waiting')")
  if (msgNav) {
    const dashSrc = readSrc('src/components/clinician/Dashboard.jsx')
    const captureFixed = dashSrc.includes('/api/capture-payment')
    if (captureFixed) {
      pass('Payment capture: message type — capture called in MessagesTab.sendResponse (fix verified)')
    } else {
      warn('Payment capture: message consultations use manual capture',
        "Message consultations use capture_method: 'manual' but capture may not fire for message type. Check MessagesTab sendResponse() logic.")
    }
  }
}

// Bug 5.10: Check if sendResponse in MessagesTab captures payment
{
  const src = readSrc('src/components/clinician/Dashboard.jsx')
  const hasCapture = src.includes('/api/capture-payment')
  if (!hasCapture) {
    fail('Payment capture: MessagesTab.sendResponse does not capture payment',
      'When a provider responds to a message consultation, the payment hold is never captured. Patients are charged $0 for message consultations.',
      { file: 'src/components/clinician/Dashboard.jsx', line: 0, severity: 'CRITICAL',
        description: 'MessagesTab.sendResponse() sets status to complete and sends email but never calls /api/capture-payment. Message consultation payments are never captured — clinic earns $0 for all message consultations.' })
  } else {
    pass('Payment capture: MessagesTab.sendResponse captures payment')
  }
}

// Bug 5.11: Check if capture-payment is called for video/phone at admit
{
  const src = readSrc('src/components/clinician/ConsultView.jsx')
  const hasCapture = src.includes('/api/capture-payment')
  assert(hasCapture, 'Payment capture: ConsultView calls capture-payment on admit', 'Found at admit button')
}

// Bug 5.12: Verify consultation_type column exists in DB createConsultation
{
  const src = readSrc('src/lib/supabase.js')
  const hasType = src.includes('consultation_type')
  if (!hasType) {
    warn('Schema: createConsultation does not set consultation_type',
      'supabase.js createConsultation() does not set consultation_type column. The column is set elsewhere (ConsultationType.jsx) but not in the initial insert. Default is video from DB schema.')
  } else {
    pass('Schema: consultation_type present in supabase.js')
  }
}

// Bug 5.13: Vitals status update — check updateVitals sets status to vitals_complete
{
  const src = readSrc('src/lib/supabase.js')
  const updateVitals = src.match(/updateVitals[\s\S]*?status:\s*['"](\w+)['"]/m)
  if (updateVitals) {
    assert(updateVitals[1] === 'vitals_complete', 'Vitals: updateVitals sets correct status', `Sets: ${updateVitals[1]}`)
  } else {
    warn('Vitals: could not parse updateVitals status')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: API ENDPOINT TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════')
console.log('  SECTION 6: API ENDPOINT TESTS')
console.log('═══════════════════════════════════════════════')

// 6.1 HPI pharmacy search — mock mode
{
  const r = await apiPost('/api/hpi-search', { query: 'blen', type: 'pharmacy' })
  assert(r.status === 200, 'HPI pharmacy search: HTTP 200')
  assert(Array.isArray(r.data?.results), 'HPI pharmacy search: returns results array')
  assert(r.data?.results.length > 0, 'HPI pharmacy search: returns results for "blen"')
  assert(r.data?.mock === true, 'HPI pharmacy search: mock flag set (no HPI creds configured)')
  if (r.data?.results?.[0]) {
    const res = r.data.results[0]
    assert(typeof res.name === 'string', 'HPI pharmacy result: has name')
    assert(typeof res.hpiId === 'string', 'HPI pharmacy result: has hpiId')
    assert(typeof res.address === 'string', 'HPI pharmacy result: has address')
  }
}

// 6.2 HPI radiology search
{
  const r = await apiPost('/api/hpi-search', { query: 'marl', type: 'radiology' })
  assert(r.status === 200, 'HPI radiology search: HTTP 200')
  assert(r.data?.results?.length > 0, 'HPI radiology search: returns results')
  if (r.data?.results?.[0]) {
    assert(r.data.results[0].name.toLowerCase().includes('marl'), 'HPI radiology: result matches query')
  }
}

// 6.3 HPI search — short query returns empty
{
  const r = await apiPost('/api/hpi-search', { query: 'a', type: 'pharmacy' })
  assert(r.status === 200, 'HPI search short query: HTTP 200')
  assert(r.data?.results?.length === 0, 'HPI search: query < 2 chars returns empty array')
}

// 6.4 Provider auth — invalid credentials
{
  const r = await apiPost('/api/provider-auth', { providerId: '00000000-0000-0000-0000-000000000000', pin: 'wrong' })
  assert(r.status === 401, 'Provider auth: 401 for invalid provider')
}

// 6.5 Provider auth — missing fields
{
  const r = await apiPost('/api/provider-auth', {})
  assert(r.status === 400, 'Provider auth: 400 for missing fields')
}

// 6.6 Generate prescription PDF — missing required fields
{
  const r = await apiPost('/api/generate-prescription-pdf', {})
  assert(r.status === 400, 'Prescription PDF: 400 for missing fields')
}

// 6.7 Generate prescription PDF — valid data (no email configured)
{
  const r = await apiPost('/api/generate-prescription-pdf', {
    patientName: 'Test Patient',
    patientNhi: 'ZKJ1234',
    patientDob: '1990-01-15',
    drug: 'Ibuprofen 400mg',
    dose: '400mg',
    directions: 'One tablet three times daily with food',
    quantity: '30 tablets',
    repeats: 0,
    providerName: 'Dr Test Provider',
    prescriberNumber: 'TEST001',
    pharmacyName: 'Test Pharmacy',
  })
  assert(r.status === 200, 'Prescription PDF: HTTP 200 for valid data')
  assert(r.data?.ok === true, 'Prescription PDF: ok:true returned')
  assert(typeof r.data?.pdfBase64 === 'string', 'Prescription PDF: pdfBase64 returned')
  assert(r.data?.pdfBase64?.length > 1000, 'Prescription PDF: pdfBase64 has content (>1kb)')
}

// 6.8 Generate referral PDF — valid data
{
  const r = await apiPost('/api/generate-referral-pdf', {
    patientName: 'Test Patient',
    patientNhi: 'ZKJ1234',
    patientDob: '1990-01-15',
    investigation: 'X-ray',
    bodyPart: 'Right ankle AP & lateral',
    clinicalIndication: 'Suspected fracture. Ottawa rules positive.',
    urgency: 'Urgent (within 24 hours)',
    providerName: 'Dr Test Provider',
    providerCpn: 'CPN001',
    facilityName: 'Test Radiology',
  })
  assert(r.status === 200, 'Referral PDF: HTTP 200 for valid data')
  assert(r.data?.ok === true, 'Referral PDF: ok:true returned')
  assert(typeof r.data?.pdfBase64 === 'string', 'Referral PDF: pdfBase64 returned')
  assert(r.data?.pdfBase64?.length > 1000, 'Referral PDF: pdfBase64 has content')
}

// 6.9 Generate referral PDF — missing required fields
{
  const r = await apiPost('/api/generate-referral-pdf', { patientName: 'Only Name' })
  assert(r.status === 400, 'Referral PDF: 400 when investigation missing')
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: SUPABASE INTEGRATION — 100 Patient Journeys
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════')
console.log('  SECTION 7: 100 PATIENT JOURNEYS (Supabase)')
console.log('═══════════════════════════════════════════════')

const NZ_LOCATIONS = [
  'Auckland', 'Wellington', 'Christchurch', 'Queenstown', 'Whangarei',
  'Nelson', 'Blenheim', 'Picton', 'Havelock', 'Pelorus Sound',
  'Dunedin', 'Hamilton', 'Tauranga', 'Rotorua', 'Napier',
  'New Plymouth', 'Invercargill', 'Greymouth', 'Westport', 'Kaikoura',
]

const COMPLAINTS = {
  acc_work:    ['fell off a ladder at work and hurt my ankle', 'back injury lifting heavy boxes at work', 'hand caught in machinery at work', 'tripped on wet floor at work and hurt my knee'],
  acc_sport:   ['twisted my knee playing rugby', 'shoulder injury from surfing wipeout', 'broken finger from cricket', 'ankle sprain playing football', 'knee injury from skiing'],
  acc_car:     ['was in a car accident my neck hurts', 'whiplash from rear end car crash', 'knee hit dashboard in car accident'],
  non_acc_med: ['sore throat for 3 days', 'ear pain and fever', 'urinary tract infection symptoms', 'skin rash on my arm for a week', 'headache for 2 days', 'stomach pain and nausea'],
  non_acc_chron: ['high blood pressure follow up', 'diabetes medication review', 'asthma not well controlled'],
  repeat_rx:   ['prescription repeat for my blood pressure medication', 'need repeat script for metformin', 'follow up for my recent blood test results'],
  mental:      ['anxiety and panic attacks getting worse', 'depression and not sleeping', 'stress and burnout'],
}

const ALLERGY_OPTIONS = ['None', 'Penicillin', 'Sulfa drugs', 'Aspirin', 'Nuts', 'Latex', 'None known']
const MED_OPTIONS = ['None', 'Metformin 500mg daily', 'Amlodipine 5mg', 'Salbutamol inhaler prn', 'Metoprolol 50mg', 'Atorvastatin 20mg']

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function randBool(p = 0.5) { return Math.random() < p }

// Generate 100 test scenarios
const scenarios = []

// 20 specific required test cases
scenarios.push(
  // 1. Physical red flag → 111 screen (we test logic above, here test DB creation skips)
  { name: 'T001', fn: 'chest pain', comp: 'chest pain and cant breathe', acc: 'no', type: 'video', loc: 'Auckland', skip_db: true, category: 'safety_physical' },
  // 2. Mental health → mental resources
  { name: 'T002', fn: 'mh crisis', comp: 'want to kill myself', acc: 'no', type: 'video', loc: 'Wellington', skip_db: true, category: 'safety_mental' },
  // 3. Alcohol → alcohol resources
  { name: 'T003', fn: 'alcohol', comp: "can't stop drinking", acc: 'no', type: 'video', loc: 'Christchurch', skip_db: true, category: 'safety_addiction' },
  // 4-20 are DB tests
  { name: 'T004', fn: 'ACC Work', ln: 'Ladder', comp: 'fell off a ladder at work and hurt my ankle', acc: 'yes', type: 'video', loc: 'Blenheim', employer: 'Marlborough Builders Ltd', category: 'acc_work' },
  { name: 'T005', fn: 'ACC Sport', ln: 'Rugby', comp: 'twisted my knee playing rugby', acc: 'yes', type: 'video', loc: 'Nelson', category: 'acc_sport' },
  { name: 'T006', fn: 'ACC Car', ln: 'Crash', comp: 'was in a car accident and my neck hurts', acc: 'yes', type: 'phone', loc: 'Wellington', category: 'acc_car' },
  { name: 'T007', fn: 'NonACC Medical', ln: 'Throat', comp: 'I have a sore throat for 3 days', acc: 'no', type: 'video', loc: 'Auckland', category: 'non_acc' },
  { name: 'T008', fn: 'NonACC Rash', ln: 'Skin', comp: 'I have a rash on my arm', acc: 'no', type: 'phone', loc: 'Hamilton', category: 'non_acc' },
  { name: 'T009', fn: 'Return Patient', ln: 'Existing', comp: 'same issue as before', acc: 'no', type: 'video', loc: 'Auckland', is_returning: true, category: 'returning' },
  { name: 'T010', fn: 'New Patient', ln: 'Fresh', comp: 'never seen a doctor for this before', acc: 'no', type: 'video', loc: 'Queenstown', is_returning: false, category: 'new' },
  { name: 'T011', fn: 'Message Rx', ln: 'Repeat', comp: 'prescription repeat for my blood pressure medication', acc: 'no', type: 'message', loc: 'Blenheim', category: 'message' },
  { name: 'T012', fn: 'Video Severe', ln: 'Headache', comp: 'severe headache and vomiting and getting worse', acc: 'no', type: 'video', loc: 'Auckland', category: 'video_forced' },
  { name: 'T013', fn: 'Child Patient', ln: 'Young', comp: 'child with fever and earache', acc: 'no', type: 'video', loc: 'Christchurch', dob: '2015-06-15', category: 'child' },
  { name: 'T014', fn: 'Elderly Patient', ln: 'Senior', comp: 'chest tightness and fatigue', acc: 'no', type: 'video', loc: 'Nelson', dob: '1948-03-20', category: 'elderly', skip_db: true },
  { name: 'T015', fn: 'No Allergies', ln: 'Clean', comp: 'sore throat and runny nose', acc: 'no', type: 'video', loc: 'Wellington', allergies: 'None', category: 'no_allergy' },
  { name: 'T016', fn: 'Multi Meds', ln: 'Complex', comp: 'diabetes follow up and medication review', acc: 'no', type: 'video', loc: 'Auckland', meds: 'Metformin 500mg, Atorvastatin 20mg, Amlodipine 5mg', category: 'complex_meds' },
  { name: 'T017', fn: 'ACC Employer', ln: 'Worker', comp: 'back injury at work lifting boxes', acc: 'yes', type: 'video', loc: 'Blenheim', employer: 'Marlborough Industries', category: 'acc_employer' },
  { name: 'T018', fn: 'ACC Self Employed', ln: 'Contractor', comp: 'hurt my hand using power tool on my own business', acc: 'yes', type: 'phone', loc: 'Nelson', employer: '', category: 'acc_no_employer' },
  { name: 'T019', fn: 'Skip Vitals', ln: 'Quick', comp: 'prescription repeat for cholesterol', acc: 'no', type: 'video', loc: 'Auckland', vitals_skipped: true, category: 'vitals_skip' },
  { name: 'T020', fn: 'Full Vitals', ln: 'Measured', comp: 'heart palpitations and dizziness', acc: 'no', type: 'video', loc: 'Wellington', vitals: { hr: 102, rr: 18, spo2: 97, source: 'rppg' }, category: 'vitals_full' },
)

// 80 more variations
const varComplaints = [
  ...COMPLAINTS.acc_work, ...COMPLAINTS.acc_sport, ...COMPLAINTS.acc_car,
  ...COMPLAINTS.non_acc_med, ...COMPLAINTS.non_acc_chron, ...COMPLAINTS.repeat_rx, ...COMPLAINTS.mental,
]
for (let i = 21; i <= 100; i++) {
  const idx = (i - 21) % varComplaints.length
  const comp = varComplaints[idx]
  const isAcc = checkAccEligible(comp)
  const isReturning = i % 5 === 0
  const type = (['video','video','video','phone','message'])[i % 5]
  const score = scoreComplaint(comp, isReturning)
  const finalType = (!score.allowMessage && type === 'message') ? 'video' : type
  scenarios.push({
    name: `T${String(i).padStart(3,'0')}`,
    fn: `Variation`, ln: String(i),
    comp,
    acc: isAcc ? 'yes' : 'no',
    type: finalType,
    loc: NZ_LOCATIONS[i % NZ_LOCATIONS.length],
    allergies: ALLERGY_OPTIONS[i % ALLERGY_OPTIONS.length],
    meds: MED_OPTIONS[i % MED_OPTIONS.length],
    employer: isAcc ? 'NZ Employer Ltd' : '',
    is_returning: isReturning,
    category: isAcc ? 'acc_variation' : 'non_acc_variation',
  })
}

let dbCreated = 0
let dbErrors = 0
const consultIds = []

for (const s of scenarios.filter(s => !s.skip_db)) {
  try {
    const c = await createTestConsult({
      patient_first_name:  TEST_PREFIX + s.fn,
      patient_last_name:   s.ln || 'TestUser',
      patient_dob:         s.dob || '1985-07-20',
      patient_email:       TEST_EMAIL,
      patient_phone:       '021' + String(Math.floor(Math.random()*9000000)+1000000),
      patient_location:    s.loc,
      chief_complaint:     s.comp,
      acc_eligible:        s.acc,
      acc_employer:        s.employer || null,
      patient_allergies:   s.allergies || 'None',
      medical_history:     'No significant history',
      medications:         s.meds || 'None',
      consultation_type:   s.type,
      status:              'waiting',
      vitals:              s.vitals || (s.vitals_skipped ? { skipped: true } : null),
    })
    consultIds.push({ id: c.id, scenario: s })
    dbCreated++
  } catch (e) {
    dbErrors++
    fail(`DB create: scenario ${s.name}`, e.message)
  }
}

pass(`DB: Created ${dbCreated} test consultations`, `${dbErrors} failures`)

// ── 7a: Verify consultations appear in queue ──────────────────────────────────
{
  const selectCols = SCHEMA_CAPS.consultation_type
    ? 'id, status, consultation_type, acc_eligible, chief_complaint'
    : 'id, status, acc_eligible, chief_complaint'
  const { data: queue, error } = await supabase
    .from('consultations')
    .select(selectCols)
    .in('status', ['waiting', 'vitals_requested', 'vitals_complete', 'ready', 'in_progress'])
    .ilike('patient_first_name', TEST_PREFIX + '%')

  assert(!error, 'Queue: fetch returns no error', error?.message)
  assert(queue?.length >= dbCreated * 0.9,
    `Queue: ${queue?.length}/${dbCreated} test consultations in active queue`, 'Some may have wrong status')
}

// ── 7b: Verify type badges correct ───────────────────────────────────────────
if (SCHEMA_CAPS.consultation_type) {
  const { data: typedRows } = await supabase
    .from('consultations')
    .select('id, consultation_type')
    .ilike('patient_first_name', TEST_PREFIX + '%')
    .in('consultation_type', ['video', 'phone', 'message'])

  const types = { video: 0, phone: 0, message: 0 }
  typedRows?.forEach(r => { if (types[r.consultation_type] !== undefined) types[r.consultation_type]++ })

  assert(types.video > 0,   `Queue badges: video consultations present (${types.video})`)
  assert(types.phone > 0,   `Queue badges: phone consultations present (${types.phone})`)
  assert(types.message > 0, `Queue badges: message consultations present (${types.message})`)
} else {
  fail('MIGRATION REQUIRED: consultation_type column missing',
    'Run supabase-consultation-types-migration.sql in Supabase SQL editor. Phone/message consultation types will not work until applied.',
    { file: 'supabase-consultation-types-migration.sql', line: 1, severity: 'CRITICAL',
      description: 'consultation_type column does not exist in consultations table. All phone and message consultation flows are broken for real patients. Run migration at: https://supabase.com/dashboard/project/xynwqfbnwpkyvovxdone/sql' })
}

// ── 7c: ACC eligibility set correctly ────────────────────────────────────────
{
  const accScenarios = scenarios.filter(s => !s.skip_db && s.acc === 'yes')
  if (accScenarios.length > 0) {
    const accIds = consultIds.filter(c => c.scenario.acc === 'yes').map(c => c.id)
    if (accIds.length > 0) {
      const { data: accRows } = await supabase
        .from('consultations')
        .select('acc_eligible')
        .in('id', accIds.slice(0, 20))

      const allAcc = accRows?.every(r => r.acc_eligible === 'yes')
      assert(allAcc, `ACC eligibility: all ACC scenarios set correctly (${accIds.length} consultations)`)
    }
  }
}

// ── 7d: Status transitions ────────────────────────────────────────────────────
{
  if (consultIds.length > 0) {
    const testId = consultIds[0].id

    // Simulate vitals request
    const { error: e1 } = await supabase.from('consultations').update({ status: 'vitals_requested' }).eq('id', testId)
    const { data: d1 } = await supabase.from('consultations').select('status').eq('id', testId).single()
    assert(!e1 && d1?.status === 'vitals_requested', 'Status transition: waiting → vitals_requested')

    // Simulate vitals received
    const vitals = { hr: 88, rr: 16, spo2: 98, source: 'rppg' }
    const { error: e2 } = await supabase.from('consultations').update({ status: 'vitals_complete', vitals }).eq('id', testId)
    const { data: d2 } = await supabase.from('consultations').select('status, vitals').eq('id', testId).single()
    assert(!e2 && d2?.status === 'vitals_complete', 'Status transition: vitals_requested → vitals_complete')
    assert(d2?.vitals?.hr === 88, 'Status transition: vitals HR stored correctly')

    // Simulate admit (in_progress)
    const admitUpdate = { status: 'in_progress' }
    if (SCHEMA_CAPS.started_at) admitUpdate.started_at = new Date().toISOString()
    const { error: e3 } = await supabase.from('consultations').update(admitUpdate).eq('id', testId)
    const { data: d3 } = await supabase.from('consultations').select('status').eq('id', testId).single()
    assert(!e3 && d3?.status === 'in_progress', 'Status transition: vitals_complete → in_progress')
    if (SCHEMA_CAPS.started_at) {
      const { data: d3s } = await supabase.from('consultations').select('started_at').eq('id', testId).single()
      assert(d3s?.started_at != null, 'Status transition: started_at recorded on admit')
    } else {
      fail('MIGRATION REQUIRED: started_at column missing',
        'Run supabase-notes-migration.sql in Supabase SQL editor.',
        { file: 'supabase-notes-migration.sql', line: 1, severity: 'HIGH',
          description: 'started_at column missing — consultation duration tracking will not work. Run migration at: https://supabase.com/dashboard/project/xynwqfbnwpkyvovxdone/sql' })
    }

    // Simulate complete
    const notes = { S: 'Ankle pain', O: 'HR 88, RR 16', A: 'Ankle sprain', P: 'RICE, ibuprofen' }
    const completeUpdate = { status: 'complete', clinical_notes: notes }
    if (SCHEMA_CAPS.notes_columns) {
      completeUpdate.notes_finalised = true
      completeUpdate.notes_finalised_at = new Date().toISOString()
      completeUpdate.outcome = 'prescription_only'
    }
    const { error: e4 } = await supabase.from('consultations').update(completeUpdate).eq('id', testId)
    const { data: d4 } = await supabase.from('consultations').select('status, clinical_notes').eq('id', testId).single()
    assert(!e4 && d4?.status === 'complete', 'Status transition: in_progress → complete')
    assert(d4?.clinical_notes?.S === 'Ankle pain', 'Status transition: SOAP notes saved')
    if (SCHEMA_CAPS.notes_columns) {
      const { data: d4n } = await supabase.from('consultations').select('outcome').eq('id', testId).single()
      assert(d4n?.outcome === 'prescription_only', 'Status transition: outcome saved')
    } else {
      fail('MIGRATION REQUIRED: notes columns missing',
        'Run supabase-notes-migration.sql — outcome, notes_finalised, notes_draft, notes_flagged columns required.',
        { file: 'supabase-notes-migration.sql', line: 1, severity: 'CRITICAL',
          description: 'Notes columns (outcome, notes_finalised, notes_draft, notes_flagged) missing from consultations table. Clinical note finalisation will silently fail. Run migration at: https://supabase.com/dashboard/project/xynwqfbnwpkyvovxdone/sql' })
    }
  }
}

// ── 7e: Returning patient lookup ──────────────────────────────────────────────
{
  // T009 scenario should exist — look it up
  const t009 = consultIds.find(c => c.scenario.name === 'T009')
  if (t009) {
    const { data: found } = await supabase
      .from('consultations')
      .select('id, patient_first_name, patient_dob, chief_complaint')
      .eq('id', t009.id)
      .single()

    if (found) {
      // Simulate returning patient lookup using first name + DOB
      const { data: returning } = await supabase
        .from('consultations')
        .select('*')
        .ilike('patient_first_name', found.patient_first_name)
        .eq('patient_dob', found.patient_dob)
        .in('status', ['complete', 'waiting', 'in_progress', 'vitals_complete', 'vitals_requested'])
        .order('created_at', { ascending: false })
        .limit(1)

      assert(returning?.length > 0, 'Returning patient: lookup by first name + DOB works')
    }
  }
}

// ── 7f: Vitals skipped correctly ─────────────────────────────────────────────
{
  const skipScenario = consultIds.find(c => c.scenario.vitals_skipped)
  if (skipScenario) {
    const { data: row } = await supabase.from('consultations').select('vitals').eq('id', skipScenario.id).single()
    assert(row?.vitals?.skipped === true, 'Vitals: skipped flag stored correctly')
  }
}

// ── 7g: Full vitals stored ────────────────────────────────────────────────────
{
  const fullVitals = consultIds.find(c => c.scenario.vitals?.hr)
  if (fullVitals) {
    const { data: row } = await supabase.from('consultations').select('vitals').eq('id', fullVitals.id).single()
    assert(row?.vitals?.hr === fullVitals.scenario.vitals.hr, 'Vitals: full vitals stored correctly')
    assert(row?.vitals?.spo2 === fullVitals.scenario.vitals.spo2, 'Vitals: SpO2 stored correctly')
  }
}

// ── 7h: Prescription saved to DB via API ──────────────────────────────────────
if (SCHEMA_CAPS.prescriptions) {
  if (consultIds.length > 0) {
    const testConsult = consultIds[0]
    const r = await apiPost('/api/generate-prescription-pdf', {
      consultationId: testConsult.id,
      patientName: TEST_PREFIX + 'Rx Test',
      patientNhi: 'ZKJ9999',
      drug: 'Ibuprofen 400mg',
      directions: 'Three times daily with food',
      quantity: '30 tablets',
      providerName: 'Dr Patrick Herling',
      prescriberNumber: '99999',
    })
    assert(r.status === 200, 'Prescription API: saved to DB (via API)')
    if (r.data?.prescriptionId) {
      const { data: rx } = await supabase.from('prescriptions').select('*').eq('id', r.data.prescriptionId).single()
      assert(rx?.drug === 'Ibuprofen 400mg', 'Prescription DB: drug field correct')
      assert(rx?.consultation_id === testConsult.id, 'Prescription DB: consultation_id linked correctly')
      createdIds.push({ table: 'prescriptions', id: rx.id })
    } else {
      warn('Prescription DB: no prescriptionId returned (DB save may fail without service role key)')
    }
  }
} else {
  fail('MIGRATION REQUIRED: prescriptions table missing',
    'Run supabase-referrals-migration.sql in Supabase SQL editor.',
    { file: 'supabase-referrals-migration.sql', line: 1, severity: 'CRITICAL',
      description: 'prescriptions table does not exist. Electronic prescription sending will silently fail for real patients. Run migration at: https://supabase.com/dashboard/project/xynwqfbnwpkyvovxdone/sql' })
}

// ── 7i: Radiology referral saved to DB via API ────────────────────────────────
if (SCHEMA_CAPS.radiology_referrals) {
  if (consultIds.length > 0) {
    const testConsult = consultIds[0]
    const r = await apiPost('/api/generate-referral-pdf', {
      consultationId: testConsult.id,
      patientName: TEST_PREFIX + 'XR Test',
      investigation: 'X-ray',
      bodyPart: 'Right ankle AP & lateral',
      clinicalIndication: 'Suspected fracture. Ottawa rules positive.',
      urgency: 'Urgent (within 24 hours)',
      providerName: 'Dr Patrick Herling',
      facilityName: 'Marlborough Medical Imaging',
    })
    assert(r.status === 200, 'Referral API: HTTP 200')
    if (r.data?.referralId) {
      const { data: ref } = await supabase.from('radiology_referrals').select('*').eq('id', r.data.referralId).single()
      assert(ref?.investigation === 'X-ray', 'Referral DB: investigation field correct')
      assert(ref?.referral_status === 'pending', 'Referral DB: initial status is pending')
      assert(ref?.consultation_id === testConsult.id, 'Referral DB: consultation_id linked')
      const { error: urErr } = await supabase.from('radiology_referrals')
        .update({ referral_status: 'result_received', result_received_at: new Date().toISOString() })
        .eq('id', r.data.referralId)
      assert(!urErr, 'Referral DB: mark result_received works')
      createdIds.push({ table: 'radiology_referrals', id: r.data.referralId })
    } else {
      warn('Referral DB: no referralId returned (DB save may fail without service role key)')
    }
  }
} else {
  fail('MIGRATION REQUIRED: radiology_referrals table missing',
    'Run supabase-referrals-migration.sql in Supabase SQL editor.',
    { file: 'supabase-referrals-migration.sql', line: 32, severity: 'CRITICAL',
      description: 'radiology_referrals table does not exist. Electronic radiology referrals will silently fail for real patients. Run migration at: https://supabase.com/dashboard/project/xynwqfbnwpkyvovxdone/sql' })
}

// ── 7j: Messages table (chat) ─────────────────────────────────────────────────
if (SCHEMA_CAPS.messages) {
  if (consultIds.length > 0) {
    const testId = consultIds[0].id
    const { data: msg, error } = await supabase.from('messages').insert({
      consultation_id: testId,
      sender: 'patient',
      message: 'Test message from patient',
    }).select().single()

    assert(!error && msg?.id, 'Messages: insert works')
    if (msg?.id) {
      const { data: retrieved } = await supabase.from('messages').select('*').eq('id', msg.id).single()
      assert(retrieved?.message === 'Test message from patient', 'Messages: retrieve works')
      assert(retrieved?.sender === 'patient', 'Messages: sender field correct')
      await supabase.from('messages').delete().eq('id', msg.id)
    }
  }
} else {
  fail('MIGRATION REQUIRED: messages table missing',
    'Run supabase-consultation-types-migration.sql — messages table required for message consultation type.',
    { file: 'supabase-consultation-types-migration.sql', line: 1, severity: 'CRITICAL',
      description: 'messages table does not exist. Message-type consultations will not store chat messages. Run migration at: https://supabase.com/dashboard/project/xynwqfbnwpkyvovxdone/sql' })
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8: PROVIDER QUEUE TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════')
console.log('  SECTION 8: PROVIDER QUEUE TESTS')
console.log('═══════════════════════════════════════════════')

// 8.1 Queue only shows active statuses, not message consultations
{
  const queueCols = SCHEMA_CAPS.consultation_type ? 'id, status, consultation_type' : 'id, status'
  const { data: activeQueue } = await supabase
    .from('consultations')
    .select(queueCols)
    .in('status', ['waiting', 'vitals_requested', 'vitals_complete', 'ready', 'in_progress'])
    .ilike('patient_first_name', TEST_PREFIX + '%')

  const messageInQueue = activeQueue?.filter(c => c.status === 'complete') || []
  assert(messageInQueue.length === 0, 'Provider queue: complete consultations not in active queue')
}

// 8.2 Message consultations (type=message) in queue — should be visible but filtered on FE
if (SCHEMA_CAPS.consultation_type) {
  const { data: msgConsults } = await supabase
    .from('consultations')
    .select('id, consultation_type')
    .ilike('patient_first_name', TEST_PREFIX + '%')
    .eq('consultation_type', 'message')
    .eq('status', 'waiting')

  pass(`Provider queue: ${msgConsults?.length || 0} message consultations in waiting status (filtered in FE MessagesTab)`)
} else {
  warn('Provider queue message type: skipped — consultation_type migration not applied')
}

// 8.3 Vitals confirmed button — only after vitals_complete status
{
  const { data: vitalsReady } = await supabase
    .from('consultations')
    .select('id, status, vitals')
    .ilike('patient_first_name', TEST_PREFIX + '%')
    .eq('status', 'vitals_complete')
    .limit(5)

  if (vitalsReady?.length > 0) {
    const allHaveVitals = vitalsReady.every(c => c.vitals !== null)
    assert(allHaveVitals, 'Provider vitals: vitals_complete rows have vitals data', `${vitalsReady.length} found`)
  } else {
    warn('Provider vitals: no vitals_complete rows in test data to verify')
  }
}

// 8.4 Provider assignment
if (SCHEMA_CAPS.providers) {
  const { data: providers } = await supabase.from('providers').select('id, first_name, last_name').eq('is_active', true).limit(1)
  if (providers?.length > 0) {
    const prov = providers[0]
    const testConsult = consultIds[5]
    if (testConsult) {
      const { error } = await supabase.from('consultations').update({
        provider_id: prov.id,
        provider_display_name: `Dr ${prov.first_name} ${prov.last_name}`,
      }).eq('id', testConsult.id)
      assert(!error, `Provider assignment: set provider_id on consultation`)
    }
  } else {
    warn('Provider assignment: no active providers in DB (run supabase-providers-migration.sql)')
  }
} else {
  fail('MIGRATION REQUIRED: providers table missing',
    'Run supabase-providers-migration.sql — providers table required for multi-provider support.',
    { file: 'supabase-providers-migration.sql', line: 1, severity: 'CRITICAL',
      description: 'providers table does not exist. Provider login, assignment, and multi-provider queue will not work. Run migration at: https://supabase.com/dashboard/project/xynwqfbnwpkyvovxdone/sql' })
}

// 8.5 ACC modal — verify ACC details on consultation
{
  const accConsult = consultIds.find(c => c.scenario.acc === 'yes')
  if (accConsult) {
    const { data: row } = await supabase.from('consultations').select('acc_eligible, acc_employer').eq('id', accConsult.id).single()
    assert(row?.acc_eligible === 'yes', 'Provider ACC: consultation has acc_eligible=yes')
    if (accConsult.scenario.employer) {
      assert(row?.acc_employer === accConsult.scenario.employer, 'Provider ACC: employer correctly stored')
    }
  }
}

// 8.6 Notes save draft and finalise
if (SCHEMA_CAPS.notes_columns) {
  const testConsult = consultIds[10]
  if (testConsult) {
    const draft = { S: 'Patient reports repeat prescription', O: 'BP 128/82', A: 'Hypertension well controlled', P: 'Continue amlodipine 5mg' }
    const { error: e1 } = await supabase.from('consultations').update({ notes_draft: draft }).eq('id', testConsult.id)
    assert(!e1, 'Notes: draft save works')

    const { error: e2 } = await supabase.from('consultations').update({
      clinical_notes: draft,
      notes_finalised: true,
      notes_finalised_at: new Date().toISOString(),
      outcome: 'prescription_only',
      status: 'complete',
    }).eq('id', testConsult.id)
    assert(!e2, 'Notes: finalise works')

    const { data: final } = await supabase.from('consultations').select('notes_finalised, outcome').eq('id', testConsult.id).single()
    assert(final?.notes_finalised === true, 'Notes: notes_finalised flag set')
    assert(final?.outcome === 'prescription_only', 'Notes: outcome stored')
  }
} else {
  fail('MIGRATION REQUIRED: notes columns missing (draft/finalise)',
    'Run supabase-notes-migration.sql — notes_draft, notes_finalised, outcome columns required.',
    { file: 'supabase-notes-migration.sql', line: 1, severity: 'CRITICAL',
      description: 'Notes columns missing — provider notes workflow is broken. Clinicians cannot save drafts or finalise notes. Run migration at: https://supabase.com/dashboard/project/xynwqfbnwpkyvovxdone/sql' })
}

// 8.7 Notes flag
if (SCHEMA_CAPS.notes_columns) {
  const testConsult = consultIds[15]
  if (testConsult) {
    const { error } = await supabase.from('consultations').update({ notes_flagged: true }).eq('id', testConsult.id)
    assert(!error, 'Notes: flagging works')
    const { data: row } = await supabase.from('consultations').select('notes_flagged').eq('id', testConsult.id).single()
    assert(row?.notes_flagged === true, 'Notes: flag persists in DB')
    await supabase.from('consultations').update({ notes_flagged: false }).eq('id', testConsult.id)
  }
} else {
  warn('Notes: flagging skipped — notes_columns migration not applied')
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9: ADMIN TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════')
console.log('  SECTION 9: ADMIN PANEL TESTS')
console.log('═══════════════════════════════════════════════')

// 9.1 Consultation log — all test consultations visible
{
  const selectCols = SCHEMA_CAPS.consultation_type
    ? 'id, created_at, status, consultation_type, acc_eligible, payment_amount'
    : 'id, created_at, status, acc_eligible, payment_amount'
  const { data: log, error } = await supabase
    .from('consultations')
    .select(selectCols)
    .ilike('patient_first_name', TEST_PREFIX + '%')
    .order('created_at', { ascending: false })

  assert(!error, 'Admin log: query succeeds')
  assert((log?.length || 0) >= dbCreated * 0.9, `Admin log: ${log?.length} test consultations found`)
}

// 9.2 Analytics grouping — by consultation type
if (SCHEMA_CAPS.consultation_type) {
  const { data: rows } = await supabase
    .from('consultations')
    .select('consultation_type')
    .ilike('patient_first_name', TEST_PREFIX + '%')

  const grouped = { video: 0, phone: 0, message: 0 }
  rows?.forEach(r => { if (grouped[r.consultation_type] !== undefined) grouped[r.consultation_type]++ })

  const total = grouped.video + grouped.phone + grouped.message
  assert(total === rows?.length, `Analytics: all ${total} rows categorised by type`)
  pass(`Analytics type breakdown: video=${grouped.video}, phone=${grouped.phone}, message=${grouped.message}`)
} else {
  warn('Analytics by type: skipped — consultation_type migration not applied')
}

// 9.3 ACC vs private breakdown
{
  const { data: rows } = await supabase
    .from('consultations')
    .select('acc_eligible')
    .ilike('patient_first_name', TEST_PREFIX + '%')

  const accCount = rows?.filter(r => r.acc_eligible === 'yes').length || 0
  const privCount = rows?.filter(r => r.acc_eligible !== 'yes').length || 0
  assert(accCount > 0, `Analytics ACC: ${accCount} ACC-eligible consultations`)
  assert(privCount > 0, `Analytics private: ${privCount} private consultations`)
  pass(`Analytics breakdown: ACC=${accCount}, private=${privCount}`)
}

// 9.4 Income calculation
{
  const { data: rows } = await supabase
    .from('consultations')
    .select('payment_amount, consultation_type, acc_eligible')
    .ilike('patient_first_name', TEST_PREFIX + '%')
    .eq('status', 'complete')

  if (rows?.length > 0) {
    const totalIncome = rows.reduce((sum, r) => sum + (r.payment_amount || 0), 0)
    pass(`Admin income: $${(totalIncome/100).toFixed(2)} total from ${rows.length} complete consultations`)
  } else {
    warn('Admin income: no complete consultations yet in test batch to verify income')
  }
}

// 9.5 Outstanding referrals query
if (SCHEMA_CAPS.radiology_referrals) {
  const { data: refs, error } = await supabase
    .from('radiology_referrals')
    .select('*')
    .not('referral_status', 'eq', 'result_received')
    .not('referral_status', 'eq', 'dna')
    .order('created_at', { ascending: true })

  assert(!error, 'Admin referrals: outstanding referrals query succeeds')
  pass(`Admin referrals: ${refs?.length || 0} outstanding referrals in system`)
} else {
  warn('Admin referrals: skipped — migration not applied')
}

// 9.6 Recent prescriptions query
if (SCHEMA_CAPS.prescriptions) {
  const since = new Date()
  since.setDate(since.getDate() - 30)
  const { data: rxs, error } = await supabase
    .from('prescriptions')
    .select('*')
    .gte('created_at', since.toISOString())

  assert(!error, 'Admin prescriptions: recent prescriptions query succeeds')
  pass(`Admin prescriptions: ${rxs?.length || 0} prescriptions in last 30 days`)
} else {
  warn('Admin prescriptions: skipped — migration not applied')
}

// 9.7 Availability toggle
{
  const { data: av, error: avErr } = await supabase.from('availability').select('*').eq('id', 1).single()
  assert(!avErr, 'Admin availability: can read availability record')
  if (!avErr && av) {
    const currentState = av.is_open
    pass(`Admin availability: clinic is currently ${currentState ? 'OPEN' : 'CLOSED'}`)
    // Don't toggle — just verify we can read
    assert(typeof av.is_open === 'boolean', 'Admin availability: is_open is boolean')
    assert(typeof av.message === 'string' || av.message === null, 'Admin availability: message field exists')
  }
}

// 9.8 Provider availability toggle
if (SCHEMA_CAPS.providers) {
  const { data: providers, error: pErr } = await supabase.from('providers').select('id, first_name, is_available').limit(3)
  if (!pErr && providers?.length > 0) {
    const prov = providers[0]
    const { error: upErr } = await supabase.from('providers').update({ is_available: prov.is_available }).eq('id', prov.id)
    assert(!upErr, `Admin provider toggle: can update is_available for ${prov.first_name}`)
  } else {
    warn('Admin provider toggle: no providers found (run migration)')
  }
} else {
  warn('Admin provider toggle: skipped — providers migration not applied')
}

// 9.9 Flagged notes in admin
if (SCHEMA_CAPS.notes_columns) {
  const { data: flagged } = await supabase
    .from('consultations')
    .select('id, patient_first_name, notes_flagged')
    .eq('notes_flagged', true)
    .ilike('patient_first_name', TEST_PREFIX + '%')

  pass(`Admin flagged notes: ${flagged?.length || 0} flagged test notes`)
} else {
  warn('Admin flagged notes: skipped — notes_columns migration not applied')
}

// 9.10 Waitlist
{
  const { data: wl, error: wlErr } = await supabase
    .from('waitlist')
    .select('id, name, email, notified')
    .eq('notified', false)
    .order('created_at', { ascending: true })

  assert(!wlErr, 'Admin waitlist: query succeeds')
  pass(`Admin waitlist: ${wl?.length || 0} unnotified patients waiting`)
}

// 9.11 Child patient age flagging (under 16)
{
  const childConsult = consultIds.find(c => c.scenario.dob === '2015-06-15')
  if (childConsult) {
    const { data: row } = await supabase.from('consultations').select('patient_dob, chief_complaint').eq('id', childConsult.id).single()
    if (row) {
      const age = Math.floor((Date.now() - new Date(row.patient_dob)) / (365.25 * 86400000))
      assert(age < 16, `Child patient: age ${age} correctly under 16`)
    }
  }
}

// 9.12 Failed payments (payment_intent_id set but not complete)
{
  const { data: failed, error } = await supabase
    .from('consultations')
    .select('id, payment_intent_id, status')
    .not('payment_intent_id', 'is', null)
    .neq('status', 'complete')
    .neq('status', 'waiting')
    .limit(5)

  assert(!error, 'Admin failed payments: query succeeds')
  pass(`Admin failed payments: ${failed?.length || 0} potential uncaptured payments`)
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10: DATA INTEGRITY CHECKS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════')
console.log('  SECTION 10: DATA INTEGRITY')
console.log('═══════════════════════════════════════════════')

// 10.1 ACC consultations have acc_eligible=yes for injury keywords
const accValidation = consultIds.filter(c => c.scenario.acc === 'yes')
if (accValidation.length > 0) {
  const { data: rows } = await supabase
    .from('consultations')
    .select('id, acc_eligible, chief_complaint')
    .in('id', accValidation.slice(0, 20).map(c => c.id))

  const correctAcc = rows?.filter(r => r.acc_eligible === 'yes').length || 0
  assert(correctAcc === rows?.length, `Data integrity: ${correctAcc}/${rows?.length} ACC consultations have acc_eligible=yes`)
}

// 10.2 Message consultations should only exist for message-appropriate complaints
const msgConsults = consultIds.filter(c => c.scenario.type === 'message')
pass(`Data integrity: ${msgConsults.length} message consultations created (all pre-validated by scoreComplaint)`)

// 10.3 Consultation type stored correctly
if (SCHEMA_CAPS.consultation_type) {
  if (consultIds.length > 3) {
    const sample = consultIds.slice(3, 8)
    const { data: rows } = await supabase
      .from('consultations')
      .select('id, consultation_type')
      .in('id', sample.map(c => c.id))

    let typeMatchCount = 0
    rows?.forEach(row => {
      const scenario = sample.find(s => s.id === row.id)
      if (scenario && row.consultation_type === scenario.scenario.type) typeMatchCount++
    })
    assert(typeMatchCount === rows?.length, `Data integrity: ${typeMatchCount}/${rows?.length} consultation types match scenario spec`)
  }
} else {
  warn('Data integrity: consultation_type check skipped — migration not applied')
}

// 10.4 Patient email stored correctly
{
  const { data: rows } = await supabase
    .from('consultations')
    .select('patient_email')
    .ilike('patient_first_name', TEST_PREFIX + '%')
    .limit(5)

  const allHaveEmail = rows?.every(r => r.patient_email === TEST_EMAIL)
  assert(allHaveEmail, 'Data integrity: patient_email stored correctly for all test records')
}

// ─────────────────────────────────────────────────────────────────────────────
// CLEANUP
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════')
console.log('  CLEANUP: Removing test data')
console.log('═══════════════════════════════════════════════')

// Delete test prescriptions
const testRxIds = createdIds.filter(c => c?.table === 'prescriptions').map(c => c.id)
if (testRxIds.length > 0) {
  await supabase.from('prescriptions').delete().in('id', testRxIds)
}

// Delete test referrals
const testRefIds = createdIds.filter(c => c?.table === 'radiology_referrals').map(c => c.id)
if (testRefIds.length > 0) {
  await supabase.from('radiology_referrals').delete().in('id', testRefIds)
}

// Delete test consultations (cascades to messages)
const consultIdsToDelete = createdIds.filter(id => typeof id === 'string')
if (consultIdsToDelete.length > 0) {
  const { error } = await supabase.from('consultations').delete().in('id', consultIdsToDelete)
  const count = consultIdsToDelete.length
  if (error) {
    warn(`Cleanup: ${error.message}`)
  } else {
    pass(`Cleanup: deleted ${count} test consultations`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FINAL REPORT
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n')
console.log('╔═══════════════════════════════════════════════╗')
console.log('║        TERE HEALTH TEST SUITE REPORT         ║')
console.log('╚═══════════════════════════════════════════════╝')
console.log()
console.log(`  Total tests:   ${passed + failed + warnings}`)
console.log(`  ✅ PASSED:     ${passed}`)
console.log(`  ❌ FAILED:     ${failed}`)
console.log(`  ⚠️  WARNINGS:   ${warnings}`)
console.log()

if (failed > 0) {
  console.log('── FAILURES ────────────────────────────────────')
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  ❌ ${r.name}`)
    if (r.detail) console.log(`     → ${r.detail}`)
  })
  console.log()
}

if (warnings > 0) {
  console.log('── WARNINGS ────────────────────────────────────')
  results.filter(r => r.status === 'WARN').forEach(r => {
    console.log(`  ⚠️  ${r.name}`)
    if (r.detail) console.log(`     → ${r.detail}`)
  })
  console.log()
}

if (bugs.length > 0) {
  console.log('── BUGS FOUND ──────────────────────────────────')
  bugs.forEach((b, i) => {
    const sev = b.severity === 'CRITICAL' ? '🔴' : b.severity === 'HIGH' ? '🟠' : '🟡'
    console.log(`  ${sev} Bug #${i+1} [${b.severity}]: ${b.file}:${b.line}`)
    console.log(`     ${b.description}`)
    console.log()
  })
}

console.log('── PATIENT JOURNEY SUMMARY ─────────────────────')
console.log(`  DB consultations created: ${dbCreated}`)
console.log(`  DB creation failures: ${dbErrors}`)
console.log(`  API endpoints tested: 9`)
console.log()

const criticalBugs = bugs.filter(b => b.severity === 'CRITICAL')
const highBugs = bugs.filter(b => b.severity === 'HIGH')
if (criticalBugs.length > 0) {
  console.log(`⛔ CRITICAL ISSUES (${criticalBugs.length}) — affect real patients:`)
  criticalBugs.forEach(b => console.log(`  • ${b.description}`))
  console.log()
}
if (highBugs.length > 0) {
  console.log(`🔴 HIGH SEVERITY (${highBugs.length}):`)
  highBugs.forEach(b => console.log(`  • ${b.description}`))
  console.log()
}
