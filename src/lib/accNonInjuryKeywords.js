// accNonInjuryKeywords — client-side hint for the ACC confirm popup.
//
// If the provider has already typed/dictated a diagnosis before clicking
// Complete Encounter and that diagnosis matches any of these infection/
// illness terms, AccConfirmModal shows a stronger warning banner. Does
// NOT block "Yes, this is ACC" — a splinter-caused cellulitis is still
// legitimately ACC — just flags that most of these presentations aren't.
//
// Keep this list tight and high-precision. False positives (telling the
// provider "this doesn't look like ACC" when it actually is) erode trust
// in the hint. Err on the side of silence; the popup itself is already
// the gate.

const NON_INJURY_PATTERNS = [
  // Ear
  /\botitis\s+(externa|media)\b/i,
  /\bswimmer'?s?\s+ear\b/i,
  // Respiratory
  /\b(urti|uri|upper\s+respiratory)\b/i,
  /\bcommon\s+cold\b/i,
  /\binfluenza\b/i, /\bflu\b/i,
  /\bbronchitis\b/i,
  /\bpneumonia\b/i,
  /\bpharyngitis\b/i, /\btonsillitis\b/i,
  /\bstrep\s+throat\b/i,
  // Urinary / genital
  /\buti\b/i, /\burinary\s+tract\s+infection\b/i,
  /\bcystitis\b/i,
  /\bthrush\b/i, /\bcandidiasis\b/i,
  // GI
  /\bgastroenteritis\b/i, /\bviral\s+gastro\b/i,
  // Skin (infective only — "cellulitis" alone is ambiguous, could be
  // post-trauma; we need an infection qualifier)
  /\bimpetigo\b/i,
  /\bshingles\b/i, /\bherpes\s+zoster\b/i,
  /\bcold\s+sore\b/i,
  /\btinea\b/i, /\bringworm\b/i,
  /\bscabies\b/i,
  // Eye
  /\bconjunctivitis\b/i,
  // Review / chronic / medication
  /\brepeat\s+(script|prescription|medication)\b/i,
  /\bmedication\s+review\b/i,
  /\bhypertension\s+review\b/i,
  /\bdiabetes\s+review\b/i,
  /\bcontracept(ion|ive)\b/i,
  // Mental health / sexual health
  /\banxiety\b/i, /\bdepression\b/i,
  /\bsti\b/i, /\bchlamydia\b/i, /\bgonorr?hoea\b/i,
]

export function diagnosisLooksNonInjury(diagnosisText) {
  if (!diagnosisText || typeof diagnosisText !== 'string') return null
  const t = diagnosisText.trim()
  if (!t) return null
  for (const pattern of NON_INJURY_PATTERNS) {
    const match = t.match(pattern)
    if (match) return match[0]
  }
  return null
}
