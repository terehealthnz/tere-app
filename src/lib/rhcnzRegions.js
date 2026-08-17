// RHCNZ imaging integration — regional intake routing.
//
// Referrals to RHCNZ are always tagged Urgent and delivered by email to the
// regional intake for the patient's location. RHCNZ then contacts the
// patient to book. Source: docs/regulatory/rhcnz/README.md (confirmed by
// Jesse Thorpe 2026-08-17).
//
// Provider picks a region on the referral form (or auto-selected here);
// server maps id → email so the client can't be spoofed into sending to
// arbitrary addresses.
//
// Each region also carries:
//   - postcodePrefixes: first-digit(s) fallback used when no clinic
//     coordinates are on file yet (heuristic; provider can override)
//   - clinics: array of { name, address, lat, lng, phone, modalities }
//     — POPULATED WHEN RHCNZ BDM SENDS THE CLINIC DIRECTORY. Once every
//     region has at least one clinic with lat/lng, autoSelectRegion()
//     switches automatically to nearest-clinic (haversine) mode.

export const RHCNZ_REGIONS = [
  {
    id: 'arg',
    brand: 'Auckland Radiology (ARG)',
    region: 'Auckland / Northland',
    email: 'bookings@arg.co.nz',
    postcodePrefixes: ['0', '1', '2'],
    clinics: [],
  },
  {
    id: 'bay',
    brand: 'Bay Radiology',
    region: 'Bay of Plenty',
    email: 'info@bayradiology.co.nz',
    // Waikato (30xx-31xx) routes to PR Waikato; BoP (32xx+) to Bay.
    postcodePrefixes: ['32', '33', '34', '35', '36', '37', '38', '39'],
    clinics: [],
  },
  {
    id: 'pr-waikato',
    brand: 'Pacific Radiology',
    region: 'Waikato',
    email: 'waikato@pacificradiology.com',
    postcodePrefixes: ['30', '31'],
    clinics: [],
  },
  {
    id: 'pr-wgtn',
    brand: 'Pacific Radiology',
    region: 'Wellington / Manawatū',
    email: 'appointments@pacificradiology.com',
    postcodePrefixes: ['4', '5', '6'],
    clinics: [],
  },
  {
    id: 'pr-nelson',
    brand: 'Pacific Radiology',
    region: 'Nelson',
    email: 'nelson.admin@pacificradiology.com',
    postcodePrefixes: ['7'],
    clinics: [],
  },
  {
    id: 'pr-cbg',
    brand: 'Pacific Radiology',
    region: 'Canterbury',
    email: 'contactcentrechc@pacificradiology.com',
    postcodePrefixes: ['8'],
    clinics: [],
  },
  {
    id: 'pr-otago',
    brand: 'Pacific Radiology',
    region: 'Otago / Southland',
    email: 'dunedin.reception@pacificradiology.com',
    postcodePrefixes: ['9'],
    clinics: [],
  },
  {
    id: 'cbc',
    brand: 'Canterbury BreastCare',
    region: 'Canterbury (breast)',
    email: 'cbc.admin@pacificradiology.com',
    // Breast subspecialty — never auto-selected by postcode; provider
    // explicitly picks it for breast imaging.
    postcodePrefixes: [],
    clinics: [],
  },
]

export function rhcnzRegionById(id) {
  return RHCNZ_REGIONS.find(r => r.id === id) || null
}

// Tere's Medical Objects shortcode on outbound HL7 (Practice Dispatch field
// on the RHCNZ template). Currently the same as our HPI-O — pending
// confirmation from Tony Cruice at MO Helpdesk (case #1058382).
export const TERE_MO_SHORTCODE = 'G11238-E'

// ── Geolocation helpers ────────────────────────────────────────────────────

/**
 * Haversine great-circle distance in kilometres. Same formula as
 * lib/nearestPharmacy.js — duplicated here to keep rhcnzRegions.js
 * dependency-free.
 */
export function haversineKm(a, b) {
  const R = 6371
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Extract a 4-digit NZ postcode from a free-text address.
 * Returns the first 4-digit sequence found, or null.
 */
export function extractNzPostcode(address) {
  if (!address) return null
  const m = String(address).match(/\b(\d{4})\b/)
  return m ? m[1] : null
}

/**
 * Postcode-prefix lookup (fallback when no clinic coords). Tries the
 * longest matching prefix first (e.g. "30" beats "3").
 * Returns the RHCNZ region id or null.
 */
export function regionByPostcode(postcode) {
  if (!postcode) return null
  const s = String(postcode)
  // Longest prefix wins → check 2-char, then 1-char.
  for (const len of [2, 1]) {
    const prefix = s.slice(0, len)
    for (const r of RHCNZ_REGIONS) {
      if (r.postcodePrefixes?.includes(prefix)) return r.id
    }
  }
  return null
}

/**
 * Walk every clinic in every region, return the closest to userCoords.
 * Returns { regionId, name, address, distanceKm, ...clinic } or null if
 * no clinic has lat/lng on file yet.
 *
 * When BDM sends the clinic directory, populate RHCNZ_REGIONS[i].clinics
 * with { name, address, lat, lng, phone } entries and this automatically
 * activates — no other code changes needed.
 */
export function nearestClinic(userCoords) {
  if (!userCoords || typeof userCoords.lat !== 'number' || typeof userCoords.lng !== 'number') return null
  let best = null
  for (const r of RHCNZ_REGIONS) {
    for (const c of (r.clinics || [])) {
      if (typeof c.lat !== 'number' || typeof c.lng !== 'number') continue
      const distanceKm = haversineKm(userCoords, { lat: c.lat, lng: c.lng })
      if (!best || distanceKm < best.distanceKm) {
        best = { ...c, regionId: r.id, distanceKm }
      }
    }
  }
  return best
}

/**
 * Main entry point for auto-selecting a region from patient input.
 *   - If patientCoords passed AND any region has clinics with lat/lng →
 *     nearest-clinic wins (BDM data active).
 *   - Otherwise falls back to extracting a postcode from patientAddress
 *     and using postcode-prefix lookup.
 *   - Returns { regionId, reason } or null if no confident match.
 */
export function autoSelectRegion({ patientAddress, patientCoords } = {}) {
  if (patientCoords) {
    const nearest = nearestClinic(patientCoords)
    if (nearest) return { regionId: nearest.regionId, reason: `nearest clinic (${nearest.distanceKm.toFixed(1)} km)` }
  }
  const postcode = extractNzPostcode(patientAddress)
  if (postcode) {
    const regionId = regionByPostcode(postcode)
    if (regionId) return { regionId, reason: `postcode ${postcode}` }
  }
  return null
}
