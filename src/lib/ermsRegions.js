// ERMS (Electronic Request Management System, Pegasus) regional routing for
// X-ray + ultrasound. ERMS is a provider-upload rail (not API): provider
// generates the Tere PDF and uploads it to app.erms.health.nz. Each region
// exposes 1-3 billing paths. See ERMS portal for the authoritative matrix.

import { extractNzPostcode } from './rhcnzRegions'

export const ERMS_XR_US_REGIONS = [
  {
    id: 'canterbury',          label: 'Canterbury',          paths: { dhb: true, acc: true, private: true  },
    postcodePrefixes: ['74','75','76','77','80','81','82','83','84','85','86','87','88','89'],
  },
  {
    id: 'west_coast',          label: 'West Coast',          paths: { dhb: true, acc: true, private: true  },
    postcodePrefixes: ['78'],
  },
  {
    id: 'nelson_marlborough',  label: 'Nelson-Marlborough',  paths: { dhb: true, acc: true, private: true  },
    postcodePrefixes: ['70','71','72','73'],
  },
  {
    id: 'south_canterbury',    label: 'South Canterbury',    paths: { dhb: true, acc: true, private: true  },
    postcodePrefixes: ['79'],
  },
  {
    id: 'southern',            label: 'Southern',            paths: { dhb: true, acc: true, private: true  },
    postcodePrefixes: ['90','91','92','93','94','95','96','97','98','99'],
  },
  {
    id: 'whanganui',           label: 'Whanganui',           paths: { dhb: true, acc: true, private: false },
    postcodePrefixes: ['45'],
  },
  {
    id: 'wairarapa',           label: 'Wairarapa',           paths: { dhb: true, acc: true, private: false },
    postcodePrefixes: ['57','58','59'],
  },
]

export function ermsRegionById(id) {
  if (!id) return null
  return ERMS_XR_US_REGIONS.find(r => r.id === id) || null
}

// Postcode-prefix lookup, longest-prefix-first (2-char beats 1-char). Returns
// the ERMS region object or null.
export function ermsRegionByPostcode(postcode) {
  if (!postcode) return null
  const s = String(postcode)
  for (const len of [2, 1]) {
    const prefix = s.slice(0, len)
    for (const r of ERMS_XR_US_REGIONS) {
      if (r.postcodePrefixes?.includes(prefix)) return r
    }
  }
  return null
}

// Resolve the transport for a given (patient address, billing path):
//   - ERMS region matches + path available → { kind: 'erms', ermsRegion, path }
//   - ERMS region matches but path unavailable (e.g. Whanganui + Private) →
//     { kind: 'rhcnz', reason } (RHCNZ fallback for private)
//   - No ERMS region match → { kind: 'rhcnz', reason }
// billingPath is 'dhb' | 'acc' | 'private'.
export function resolveImagingTransport({ patientAddress, billingPath }) {
  const postcode = extractNzPostcode(patientAddress)
  const region = ermsRegionByPostcode(postcode)
  if (!region) {
    return {
      kind: 'rhcnz',
      ermsRegion: null,
      path: billingPath,
      reason: postcode
        ? `No ERMS coverage for postcode ${postcode} - routed via RHCNZ.`
        : 'No patient postcode on file - routed via RHCNZ.',
    }
  }
  if (!region.paths?.[billingPath]) {
    return {
      kind: 'rhcnz',
      ermsRegion: region,
      path: billingPath,
      reason: `ERMS not available for ${billingPath === 'private' ? 'Private' : billingPath.toUpperCase()} in ${region.label} - routed to RHCNZ private.`,
    }
  }
  return {
    kind: 'erms',
    ermsRegion: region,
    path: billingPath,
    reason: `ERMS ${region.label} (${billingPath === 'dhb' ? 'Public' : billingPath === 'acc' ? 'ACC' : 'Private'}).`,
  }
}
