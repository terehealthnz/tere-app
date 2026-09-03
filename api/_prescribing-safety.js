// Prescribing safety guards — task #423.
//
// Server-side check called from /api/generate-prescription-pdf BEFORE the
// prescription is persisted. Detects:
//   • Duplicate prescription for same drug within N days (early refill)
//   • Cross-provider doctor-shopping signature (same drug from 3+ providers
//     in 90 days)
//   • Controlled-drug tighter windows
//
// Returns { blocked, warnings[], reason } — caller decides whether to
// hard-block (blocked=true) or surface warnings to the prescriber. Provider
// can override a hard-block by re-submitting with { override: true,
// override_reason: '...' } — the override is audit-logged either way.
//
// Uses only own prescription history + Medsafe class tag from
// _drug-classifications.js. No NZF dependency (that comes later, task #229).

// Approximate matching: strip formulation/dose so "amoxicillin 500mg" and
// "amoxicillin 1g" collide. Names normalised to lowercase alphanumeric root.
function drugRoot(name) {
  return String(name || '').toLowerCase()
    .replace(/\d+\s*(mg|mcg|g|ml|iu|units?)/g, '')
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .split(' ')[0] || ''
}

const WINDOWS = {
  // days — a prescription for the same drug inside this window = early refill
  controlled_a_b: { warn: 60, block: 30 }, // rare in general practice; strict
  controlled_c:   { warn: 30, block: 14 },
  antibiotic:     { warn: 5,  block: 3 },  // finish previous course first
  benzodiazepine: { warn: 30, block: 14 },
  opioid:         { warn: 30, block: 14 },
  regular:        { warn: 14, block: 0 },  // warn only; provider can proceed
}

const DOCTOR_SHOPPING_PROVIDER_THRESHOLD = 3  // distinct providers within lookback
const DOCTOR_SHOPPING_LOOKBACK_DAYS      = 90

// Best-effort class tagging when Medsafe class hasn't classified.
function inferGuardBucket(drugName, medsafeClass) {
  if (medsafeClass === 'A' || medsafeClass === 'B') return 'controlled_a_b'
  if (medsafeClass === 'C') return 'controlled_c'
  const n = String(drugName || '').toLowerCase()
  if (/(amox|augment|azithro|cefalex|cefaclor|cipro|clarithro|clindam|doxy|flucloxa|metronid|nitrofur|penicill|trimeth)/.test(n)) return 'antibiotic'
  if (/(diazepam|lorazepam|oxazepam|temazepam|midazolam|clonazepam|zopiclone|zolpidem)/.test(n))                                 return 'benzodiazepine'
  if (/(codeine|tramadol|morphine|oxycodone|fentanyl|methadone|buprenorphine)/.test(n))                                          return 'opioid'
  return 'regular'
}

export async function checkPrescribingSafety({
  supabase,
  patientNhi,
  patientEmail,
  patientName,
  drug,
  quantity,
  medsafeClass,   // 'A' | 'B' | 'C' | null — from _drug-classifications.js
  bypassChecks,   // provider-set override (audit-logged)
}) {
  if (!drug) return { blocked: false, warnings: [], reason: null, bucket: 'regular' }
  if (bypassChecks) return { blocked: false, warnings: ['manual_override'], reason: null, bucket: 'regular' }

  const bucket   = inferGuardBucket(drug, medsafeClass)
  const window   = WINDOWS[bucket] || WINDOWS.regular
  const root     = drugRoot(drug)
  const lookback = new Date(Date.now() - DOCTOR_SHOPPING_LOOKBACK_DAYS * 86400 * 1000).toISOString()

  const warnings = []
  let blocked = false
  let reason  = null

  // Fetch recent prescriptions for this patient. Match by NHI or email.
  // We can't do exact match on patient_id because ad-hoc scripts don't
  // always FK a patient row.
  let recent = []
  try {
    let q = supabase.from('prescriptions')
      .select('id, drug, quantity, repeats, provider_id, provider_name, created_at, approval_status')
      .gte('created_at', lookback)
      .in('approval_status', ['approved', 'pending_approval'])
      .limit(200)
    if (patientNhi)   q = q.eq('patient_nhi', patientNhi)
    else if (patientEmail) q = q.eq('patient_email', patientEmail)
    else               q = q.eq('patient_name', patientName || '')
    const { data } = await q
    recent = data || []
  } catch (e) {
    // If the read fails, don't block — degrade safe (log a warning).
    return { blocked: false, warnings: ['safety_check_read_failed'], reason: null, bucket }
  }

  const sameDrug = recent.filter(r => drugRoot(r.drug) === root)

  // 1. Early-refill / duplicate detection.
  if (sameDrug.length) {
    const mostRecent = sameDrug.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
    const daysSince  = Math.floor((Date.now() - new Date(mostRecent.created_at).getTime()) / 86400000)
    if (window.block > 0 && daysSince < window.block) {
      blocked = true
      reason  = `Same drug (${drug}) prescribed ${daysSince}d ago (bucket ${bucket}, block-window ${window.block}d)`
    } else if (daysSince < window.warn) {
      warnings.push(`same_drug_prescribed_${daysSince}d_ago`)
    }
  }

  // 2. Doctor-shopping across providers.
  const distinctProviders = new Set(sameDrug.map(r => r.provider_id).filter(Boolean))
  if (distinctProviders.size >= DOCTOR_SHOPPING_PROVIDER_THRESHOLD) {
    // Never a hard block on this alone (patient might legitimately see
    // multiple providers), but escalate to a warning + suggest admin review.
    warnings.push(`cross_provider_${distinctProviders.size}_in_${DOCTOR_SHOPPING_LOOKBACK_DAYS}d`)
  }

  // 3. Cumulative controlled dose watch — for benzos/opioids, count total
  // quantity in the last 90d.
  if (bucket === 'benzodiazepine' || bucket === 'opioid' || bucket === 'controlled_c') {
    const qtySum = sameDrug.reduce((sum, r) => sum + (Number(r.quantity) || 0) * (1 + (Number(r.repeats) || 0)), 0)
    if (qtySum > 0) {
      warnings.push(`cumulative_qty_${qtySum}_in_${DOCTOR_SHOPPING_LOOKBACK_DAYS}d`)
    }
  }

  return { blocked, warnings, reason, bucket, prior_count: sameDrug.length, distinct_providers: distinctProviders.size }
}
