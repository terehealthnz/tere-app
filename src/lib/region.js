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
  NZ: 'nz',
  AU: 'au',
  US: 'us',
})

const NZ_HOSTS = new Set([
  'terehealth.co.nz',
  'www.terehealth.co.nz',
  'tere.co.nz',
  'www.tere.co.nz',
])

const US_HOSTS = new Set([
  'terecare.com',
  'www.terecare.com',
])

const AU_HOSTS = new Set([
  // populate when the AU domain is registered
])

/**
 * Detect region from a hostname string. Falls back to NZ for
 * unknown hostnames (including localhost/preview URLs) so nothing
 * accidentally serves the "wrong" brand.
 */
export function regionForHost(hostname) {
  if (!hostname) return REGIONS.NZ
  const h = hostname.toLowerCase()
  if (US_HOSTS.has(h)) return REGIONS.US
  if (AU_HOSTS.has(h)) return REGIONS.AU
  if (NZ_HOSTS.has(h)) return REGIONS.NZ
  return REGIONS.NZ
}

/**
 * Browser-side region detection. Honours dev overrides from
 * localStorage.tere_region and the ?region= query param.
 */
export function detectRegion() {
  if (typeof window === 'undefined') return REGIONS.NZ

  // Query-param override — one-shot, wins over everything
  const qp = new URLSearchParams(window.location.search).get('region')
  if (qp && Object.values(REGIONS).includes(qp)) {
    try { localStorage.setItem('tere_region', qp) } catch {}
    return qp
  }

  // localStorage override — persists across navigations (dev only)
  try {
    const stored = localStorage.getItem('tere_region')
    if (stored && Object.values(REGIONS).includes(stored)) return stored
  } catch {}

  return regionForHost(window.location.hostname)
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
}

export function getRegionConfig(region) {
  return CONFIG[region] || CONFIG[REGIONS.NZ]
}
