// Drug classification for the NZ Director-General's temporary signature
// exemption (August 2024, expires 31 October 2027). Prescriptions containing
// Class A, B, or C controlled drugs still require a wet-ink prescriber
// signature; only the Class C exempt/partially-exempt drugs may be sent
// signature-exempt.
//
// Source of truth: "Temporary Exemption for Signatures on Prescriptions
// without NZePS" (Health NZ | Te Whatu Ora, updated 10 October 2024),
// Appendix 3.
//
// If a drug is on the CONTROLLED list → wet-ink signature required, do
// NOT use the signature-exempt path.
// If a drug is on the CLASS_C_EXEMPT list → signature-exempt is legal.
// Anything else → assumed non-controlled, signature-exempt is legal.
//
// Matching is case-insensitive and looks for substring anywhere in the
// drug name (so "Panadeine Forte 500/30 tablet" matches "panadeine").
// Brand names and common variants are covered explicitly.

// Class A/B/C controlled drugs (NOT exempt, NOT partially exempt) that
// REQUIRE a wet-ink prescriber signature and the original prescription
// sent to the pharmacy per Misuse of Drugs Regulations 1977.
const CONTROLLED_DRUGS = [
  // Class C opioids & analgesics
  'buprenorphine', 'subutex', 'suboxone',
  'codeine',       // plain codeine only — combination products handled below
  'dihydrocodeine', 'dhc continus',
  'phenobarbitone', 'phenobarbital',
  'tramadol', 'tramal',

  // Class C5 benzodiazepines
  'alprazolam',  'xanax',
  'clobazam',    'frisium',
  'clonazepam',  'paxam', 'rivotril',
  'diazepam',    'valium', 'stesolid',
  'lorazepam',   'ativan',
  'midazolam',   'hypnovel',
  'nitrazepam',  'nitrados', 'mogadon',
  'oxazepam',    'ox-pam', 'serepax',
  'temazepam',   'normison',
  'triazolam',   'hypam', 'halcion',
  'zopiclone',
  'phentermine', 'duromine', 'metermine',

  // Class B — extremely unlikely in telehealth but block for safety
  'morphine', 'oxycodone', 'oxycontin', 'oxynorm',
  'methadone', 'fentanyl', 'pethidine',
  'methylphenidate', 'ritalin', 'concerta',
  'dexamphetamine', 'lisdexamfetamine', 'vyvanse',
  'ketamine',
]

// Class C drugs that ARE exempt or partially exempt — signature-exempt
// prescriptions are legal for these under the DG authorisation. Matched
// AFTER the CONTROLLED list so combination products (e.g. paracetamol +
// codeine like Panadeine) correctly bypass the "codeine" block above.
const CLASS_C_EXEMPT = [
  // Paracetamol + codeine combinations
  'panadeine', 'codral',
  'paracetamol.*codeine', 'codeine.*paracetamol',

  // Other exempt Class C
  'gee\'s linctus', 'gees linctus',
  'pholcodine',
]

function normalise(name) {
  return String(name || '').toLowerCase().trim()
}

function matchesAny(name, list) {
  const n = normalise(name)
  if (!n) return false
  return list.some(term => {
    if (term.includes('.*')) {
      // Regex-style term — allow either order (e.g. paracetamol.*codeine)
      try { return new RegExp(term, 'i').test(n) } catch { return false }
    }
    return n.includes(term)
  })
}

// Returns true if this drug requires a wet-ink prescriber signature
// (i.e. NOT signature-exempt eligible).
export function requiresWetInkSignature(drugName) {
  if (matchesAny(drugName, CLASS_C_EXEMPT)) return false
  if (matchesAny(drugName, CONTROLLED_DRUGS)) return true
  return false
}

// Returns true if this drug is eligible for the signature-exempt path
// under the DG August 2024 authorisation. Convenience inverse of
// requiresWetInkSignature.
export function isSignatureExempt(drugName) {
  return !requiresWetInkSignature(drugName)
}

// Returns a short human-readable classification for audit logging and UI
// hints. One of: 'controlled_wet_ink', 'class_c_exempt', 'non_controlled'.
export function classifyDrug(drugName) {
  if (matchesAny(drugName, CLASS_C_EXEMPT)) return 'class_c_exempt'
  if (matchesAny(drugName, CONTROLLED_DRUGS)) return 'controlled_wet_ink'
  return 'non_controlled'
}
