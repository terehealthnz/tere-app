// Region detection + per-region config for the Tere platform.
//
// Tere runs one codebase serving three jurisdictions:
//   - NZ (Tere Health)          — terehealth.co.nz
//   - AU (Tere Health Australia)— TBD (Pty Ltd forming)
//   - US (Tere Care)            — terecare.com
//
// Region is determined at request time from the browser hostname.
// Anywhere the platform behaves differently by jurisdiction
// (currency, emergency number, e-prescribing provider, consent copy,
// state/region licensing check, poison centre) reads from this module.
//
// Dev override: set localStorage.tere_region = 'us' | 'au' | 'nz'
// or add ?region=us to the URL — this only affects the client detection
// and is intended for design/QA on a laptop. Production always trusts
// the hostname.

export const REGIONS = Object.freeze({
  NZ:   'nz',
  AU:   'au',
  US:   'us',
  // CORP = Tere Health Ltd corporate / tech-IP holding page. Not a patient
  // jurisdiction — serves the parent-company narrative (mission, licensed
  // jurisdictions, compliance posture, contact). Distinct from AU/NZ/US
  // patient surfaces so no health data flows or intake logic ever fires
  // on this hostname.
  CORP: 'corp',
})

const NZ_HOSTS = new Set([
  'terehealth.co.nz',
  'www.terehealth.co.nz',
])

const US_HOSTS = new Set([
  'terecare.com',
  'www.terecare.com',
])

// AU launch domain TBD. Empty until we register an AU-facing hostname
// (e.g. tere.com.au). tere.co.nz used to sit here as an AU-beta preview
// but was repurposed 2026-08-21 as the corporate page after Shively
// declined and AU-launch timing became open-ended.
const AU_HOSTS = new Set([])

const CORP_HOSTS = new Set([
  'tere.co.nz',
  'www.tere.co.nz',
])

/**
 * Detect region from a hostname string. Falls back to NZ for
 * unknown hostnames (including localhost/preview URLs) so nothing
 * accidentally serves the "wrong" brand.
 */
export function regionForHost(hostname) {
  if (!hostname) return REGIONS.NZ
  const h = hostname.toLowerCase()
  if (US_HOSTS.has(h))   return REGIONS.US
  if (AU_HOSTS.has(h))   return REGIONS.AU
  if (CORP_HOSTS.has(h)) return REGIONS.CORP
  if (NZ_HOSTS.has(h))   return REGIONS.NZ
  return REGIONS.NZ
}

/**
 * Browser-side region detection. Honours dev overrides from
 * localStorage.tere_region and the ?region= query param.
 *
 * Dev overrides are ONLY honoured on localhost / Vercel preview hosts
 * — never on the production hostnames (terehealth.co.nz, terecare.com).
 * Otherwise a one-time `?region=nz` used for QA on a laptop would
 * silently override the real hostname routing on subsequent visits to
 * prod, which broke terecare.com when a stale value was in localStorage.
 */
function isDevHost(hostname) {
  if (!hostname) return false
  const h = hostname.toLowerCase()
  return h === 'localhost'
      || h === '127.0.0.1'
      || h.endsWith('.local')
      || h.endsWith('.vercel.app')      // preview deployments
}

/**
 * Convenience predicate: true when the current SPA is loaded on the US
 * (Tere Care) surface. Used to gate NHI displays + NZ-only intake copy
 * so US patients never see New Zealand identifiers or clinician tools
 * accidentally leak NHI into the US admin/provider view.
 *
 * Read-only at module scope is fine — hostname doesn't change during the
 * SPA session, so callers can invoke this from render bodies without a
 * hook. If we ever add SSR, wrap this in a proper React context.
 */
export function isUS() {
  return detectRegion() === REGIONS.US
}

// Positive-form predicates for the other two surfaces. Prefer these to
// `!isUS()` when the intent is really "NZ-only" (e.g. NHI display, ACC
// billing, MCNZ registration) — the negation was written when AU didn't
// exist yet, and now `!isUS()` incorrectly matches AU too. Similarly,
// prefer `isAU()` over the previous `!isUS() && !isNZ()` compound.
export function isNZ() {
  return detectRegion() === REGIONS.NZ
}

export function isAU() {
  return detectRegion() === REGIONS.AU
}

export function isCorp() {
  return detectRegion() === REGIONS.CORP
}

export function detectRegion() {
  if (typeof window === 'undefined') return REGIONS.NZ
  const hostname = window.location.hostname
  const isDev = isDevHost(hostname)

  // Query-param override — one-shot, only on dev/preview hosts
  const qp = new URLSearchParams(window.location.search).get('region')
  if (isDev && qp && Object.values(REGIONS).includes(qp)) {
    try { localStorage.setItem('tere_region', qp) } catch {}
    return qp
  }

  // localStorage override — only on dev/preview hosts. Prod hostnames
  // ignore any stale localStorage value; production routing is ALWAYS
  // driven by the real hostname.
  if (isDev) {
    try {
      const stored = localStorage.getItem('tere_region')
      if (stored && Object.values(REGIONS).includes(stored)) return stored
    } catch {}
  }

  return regionForHost(hostname)
}

/**
 * Per-region config. Anything that varies between NZ / AU / US lives here.
 * Add new keys as we hit them — don't sprinkle hostname checks around the app.
 */
const CONFIG = {
  [REGIONS.NZ]: {
    brand:            'Tere Health',
    tagline:          'Rural telemedicine, on your phone.',
    currency:         'NZD',
    currencySymbol:   '$',
    emergency:        '111',
    emergencyLabel:   'call 111',
    poisonCentre:     '0800 764 766',
    poisonLabel:      'National Poisons Centre',
    ePrescribing:     'nzeps',                 // NZ e-prescription service
    jurisdiction:     'New Zealand',
    privacyLaw:       'Health Information Privacy Code 2020',
    breachNotifyDays: 3,                       // OPC target
    complaintsBody:   'Health & Disability Commissioner (HDC)',
    supportEmail:     'support@terehealth.co.nz',
    homeHost:         'terehealth.co.nz',
    licensedStates:   null,                    // n/a — country-wide
  },
  [REGIONS.AU]: {
    brand:            'Tere Health Australia',
    tagline:          'Rural telemedicine, on your phone.',
    currency:         'AUD',
    currencySymbol:   '$',
    emergency:        '000',
    emergencyLabel:   'call 000',
    poisonCentre:     '13 11 26',
    poisonLabel:      'Poisons Information Centre',
    ePrescribing:     'erx',                   // eRx Script Exchange (sole AU provider)
    jurisdiction:     'Australia',
    privacyLaw:       'Privacy Act 1988 (Australian Privacy Principles)',
    breachNotifyDays: 30,                      // Notifiable Data Breaches scheme
    complaintsBody:   'Australian Health Practitioner Regulation Agency (AHPRA)',
    supportEmail:     'support@terehealth.co.nz',  // update when AU domain live
    homeHost:         null,                    // AU domain TBD
    licensedStates:   null,
  },
  [REGIONS.US]: {
    brand:            'Tere Care',
    tagline:          'Urgent telemedicine. Cash pay. No insurance headaches.',
    currency:         'USD',
    currencySymbol:   '$',
    emergency:        '911',
    emergencyLabel:   'call 911',
    poisonCentre:     '1-800-222-1222',
    poisonLabel:      'Poison Help (national)',
    ePrescribing:     'dosespot',              // US e-prescribing via SureScripts
    jurisdiction:     'United States',
    privacyLaw:       'Health Insurance Portability and Accountability Act (HIPAA)',
    breachNotifyDays: 60,                      // HITECH Act
    complaintsBody:   'HHS Office for Civil Rights',
    supportEmail:     'hello@terecare.com',        // Cloudflare Email Routing → terehealthnz@gmail.com
    homeHost:         'terecare.com',
    licensedStates:   ['WA', 'CA', 'MO', 'TX', 'UT', 'ID'],  // Patrick's state licences
  },
  [REGIONS.CORP]: {
    brand:            'Tere Health Ltd',
    tagline:          'Rural telemedicine platform — New Zealand, United States, and Australia.',
    // No currency / emergency / poison / e-prescribing — corporate page
    // never serves patient intake so these fields are left null.
    currency:         null,
    currencySymbol:   null,
    emergency:        null,
    emergencyLabel:   null,
    poisonCentre:     null,
    poisonLabel:      null,
    ePrescribing:     null,
    jurisdiction:     'Global (NZ parent, operating in NZ / US / AU)',
    privacyLaw:       null,
    breachNotifyDays: null,
    complaintsBody:   null,
    supportEmail:     'hello@terehealth.co.nz',
    homeHost:         'tere.co.nz',
    licensedStates:   null,
  },
}

export function getRegionConfig(region) {
  return CONFIG[region] || CONFIG[REGIONS.NZ]
}
