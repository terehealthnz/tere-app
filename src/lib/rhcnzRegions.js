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

// Clinic-level detail sourced from Holly Johnson (RHCNZ BDM support) via
// RHCNZ_XR_Ultrasound_Clinics.xlsx on 2026-08-19. Modalities: 'xr' =
// general X-ray, 'us' = ultrasound. Some clinics offer only one — the
// referral builder should filter by modality before showing options.
// Lat/lng not yet populated — nearestClinic() falls back to postcode
// until we geocode. Pricing NOT provided; Holly declined per BDM policy
// (pricing discussed with patients at booking time).
export const RHCNZ_REGIONS = [
  {
    id: 'arg',
    brand: 'Auckland Radiology (ARG)',
    region: 'Auckland / Northland',
    email: 'bookings@arg.co.nz',
    postcodePrefixes: ['0', '1', '2'],
    clinics: [
      { name: 'Remuera', address: '99 Remuera Road, Remuera, Auckland', postcode: '1050', phone: '09 529 4850', email: 'bookings@arg.co.nz', modalities: ['xr', 'us'] },
      { name: 'Glenfield', address: '212 Wairau Road, Glenfield, Auckland', postcode: '0627', phone: '09 529 4850', email: 'bookings@arg.co.nz', modalities: ['xr', 'us'] },
      { name: 'Hauraki', address: '327 Lake Road, Hauraki, Auckland', postcode: '0622', phone: '09 529 4850', email: 'bookings@arg.co.nz', modalities: ['xr', 'us'] },
      { name: 'Henderson', address: '53 Lincoln Road, Henderson, Auckland', postcode: '0610', phone: '09 529 4850', email: 'bookings@arg.co.nz', modalities: ['xr', 'us'] },
      { name: 'Howick', address: '18 Fencible Drive, Howick, Auckland', postcode: '2014', phone: '09 529 4850', email: 'bookings@arg.co.nz', modalities: ['xr', 'us'] },
      { name: 'Papakura', address: "6-18 O'Shannessey Street, Papakura, Auckland", postcode: '2110', phone: '09 529 4850', email: 'bookings@arg.co.nz', modalities: ['xr', 'us'] },
      { name: 'Ponsonby', address: 'Level 1, 1 Jervois Road, Ponsonby, Auckland', postcode: '1011', phone: '09 529 4850', email: 'bookings@arg.co.nz', modalities: ['xr', 'us'] },
      { name: 'Pukekohe', address: 'Pukekohe Health Centre, 10 West Street, Pukekohe, Auckland', postcode: '2120', phone: '09 529 4850', email: 'bookings@arg.co.nz', modalities: ['xr', 'us'] },
      { name: 'Queen Street', address: '79 Queen Street, 4th Floor, Infosys House, Auckland', postcode: '1010', phone: '09 529 4850', email: 'bookings@arg.co.nz', modalities: ['xr', 'us'] },
      { name: 'Royal Oak', address: '641 Manukau Road, Royal Oak, Auckland', postcode: '1023', phone: '09 529 4850', email: 'bookings@arg.co.nz', modalities: ['xr', 'us'] },
      { name: 'St Johns', address: '730/261 Morrin Road, St Johns, Auckland', postcode: '1072', phone: '09 529 4850', email: 'bookings@arg.co.nz', modalities: ['xr', 'us'] },
      { name: 'Whangārei (Te Tai Tokerau)', address: '27 Porowini Avenue, Morningside, Whangārei', postcode: '0110', phone: '09 955 9950 / 0800 738 638', email: 'bookings@arg.co.nz', modalities: ['xr', 'us'] },
      { name: 'Avondale', address: '2144 Great North Road, Avondale, Auckland', postcode: '0600', phone: '09 529 4850', email: 'bookings@arg.co.nz', modalities: ['xr'] },
      { name: 'Parnell', address: '8 Maunsell Road, Parnell, Auckland', postcode: '1052', phone: '09 529 4850', email: 'bookings@arg.co.nz', modalities: ['xr'] },
      { name: 'Takanini', address: '154 Great South Road, Takanini, Auckland', postcode: '2112', phone: '09 529 4850', email: 'bookings@arg.co.nz', modalities: ['us'] },
    ],
  },
  {
    id: 'bay',
    brand: 'Bay Radiology',
    region: 'Bay of Plenty',
    email: 'info@bayradiology.co.nz',
    // Waikato (30xx-31xx) routes to PR Waikato; BoP (32xx+) to Bay.
    postcodePrefixes: ['32', '33', '34', '35', '36', '37', '38', '39'],
    clinics: [
      { name: 'Grace Campus', address: '281 Cheyne Road, Oropi, Tauranga', postcode: '3112', phone: '07 578 0273 / 0800 467 426', email: 'info@bayradiology.co.nz', modalities: ['xr', 'us'] },
      { name: 'Matamata', address: 'Pohlen Hospital, 56 Rawhiti Avenue, Matamata', postcode: '3400', phone: '07 578 0273 / 0800 467 426', email: 'info@bayradiology.co.nz', modalities: ['xr', 'us'] },
      { name: 'Mount Maunganui', address: '8 Grenada Street, Mount Maunganui', postcode: '3116', phone: '07 578 0273 / 0800 467 426', email: 'info@bayradiology.co.nz', modalities: ['xr', 'us'] },
      { name: 'Papamoa', address: '1 Tara Road, Papamoa', postcode: '3187', phone: '07 578 0273 / 0800 467 426', email: 'info@bayradiology.co.nz', modalities: ['xr', 'us'] },
      { name: 'Tauranga - 17th Avenue', address: '230 Seventeenth Avenue, Tauranga', postcode: '3112', phone: '07 578 0273 / 0800 467 426', email: 'info@bayradiology.co.nz', modalities: ['xr', 'us'] },
      { name: 'Whakatāne', address: 'Horizon House, 17-19 Pyne Street, Whakatāne', postcode: '3120', phone: '07 578 0273 / 0800 467 426', email: 'info@bayradiology.co.nz', modalities: ['xr', 'us'] },
      { name: 'Katikati', address: 'Katikati Medical Centre, 4 Clive Road, Katikati', postcode: '3129', phone: '07 578 0273 / 0800 467 426', email: 'info@bayradiology.co.nz', modalities: ['xr'] },
      { name: 'The Doctors Tauranga', address: '434 Devonport Road, Tauranga', postcode: '3112', phone: '07 578 0273 / 0800 467 426', email: 'info@bayradiology.co.nz', modalities: ['xr'] },
    ],
  },
  {
    id: 'pr-waikato',
    brand: 'Pacific Radiology',
    region: 'Waikato',
    email: 'waikato@pacificradiology.com',
    postcodePrefixes: ['30', '31'],
    clinics: [
      { name: 'Hamilton - North (Pukete)', address: '41-45 Karewa Place, Pukete, Hamilton', postcode: '3200', phone: '0800 633 462', email: 'waikato@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Hamilton - Puutikitiki', address: 'Level 1, 21 Puutikitiki Street, Hamilton', postcode: '3216', phone: '0800 633 462', email: 'waikato@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Cambridge', address: '14 Dick Street, Cambridge', postcode: '3434', phone: '0800 633 462', email: 'waikato@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Hamilton - Pembroke', address: '35 Pembroke Street, Hamilton Lake, Hamilton', postcode: '3240', phone: '0800 633 462', email: 'waikato@pacificradiology.com', modalities: ['us'] },
    ],
  },
  {
    id: 'pr-wgtn',
    brand: 'Pacific Radiology',
    region: 'Wellington / Manawatū',
    email: 'appointments@pacificradiology.com',
    postcodePrefixes: ['4', '5', '6'],
    clinics: [
      { name: 'Kāpiti - Paraparaumu', address: '150 Kāpiti Road, Paraparaumu', postcode: '5032', phone: '0800 674 722', email: 'appointments@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Manawatū - Palmerston North', address: '33-43 Princess Street, Palmerston North', postcode: '4410', phone: '0800 674 722', email: 'appointments@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Lower Hutt - Boulcott', address: 'Boulcott Specialist Centre, 668 High Street, Lower Hutt', postcode: '5010', phone: '0800 674 722', email: 'appointments@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Wellington - Crofton Downs (Bowen Centre)', address: 'Bowen Centre, 98 Churchill Drive, Crofton Downs, Wellington', postcode: '6035', phone: '0800 674 722', email: 'appointments@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Wellington - Lambton Quay', address: 'Level 1, 142 Lambton Quay, Wellington', postcode: '6011', phone: '0800 674 722', email: 'appointments@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Porirua - Hartham Place', address: '2 Hartham Place South, Porirua', postcode: '5022', phone: '0800 674 722', email: 'appointments@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Upper Hutt', address: 'Off Queen Street Carpark, Upper Hutt', postcode: '5018', phone: '0800 674 722', email: 'appointments@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Wellington - Newtown (Wakefield)', address: '99 Rintoul Street, Newtown, Wellington', postcode: '6021', phone: '0800 674 722', email: 'appointments@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Wellington - Newtown (After Hours)', address: '17 Adelaide Road, Newtown, Wellington', postcode: '6021', phone: '0800 674 722', email: 'appointments@pacificradiology.com', modalities: ['xr'] },
    ],
  },
  {
    id: 'pr-nelson',
    brand: 'Pacific Radiology',
    region: 'Nelson / Tasman',
    email: 'nelson.fax@pacificradiology.com',
    // Postcodes 70 (Nelson city) + 71 (Tasman/Motueka/Golden Bay).
    // Marlborough 72/73 routes to MMI (below), not Nelson — MMI is
    // Blenheim-local and avoids the ferry/drive.
    postcodePrefixes: ['70', '71'],
    clinics: [
      { name: 'Nelson - Collingwood Street', address: '105 Collingwood Street, Nelson', postcode: '7010', phone: '03 548 2745', email: 'nelson.fax@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Nelson - Richmond', address: 'Level 1, 186 Queen Street, Richmond', postcode: '7020', phone: '03 548 2745', email: 'nelson.fax@pacificradiology.com', modalities: ['xr', 'us'] },
    ],
  },
  {
    id: 'mmi',
    brand: 'Marlborough Medical Imaging',
    region: 'Marlborough (Blenheim)',
    email: 'bookings@mmimaging.co.nz',
    // Pacific Radiology affiliate — uses PR's InteleViewer for image
    // access but bookings + reports flow through MMI directly.
    // Referral requirements (confirmed by Kelly, MMI, 2026-07-06):
    //   • Accepts referrals by email to bookings@mmimaging.co.nz
    //   • Reports via EDI, fax, or mail — NOT direct email
    //   • Requires referring doctor names + MCNZ numbers pre-registered
    //   • ACC referrals: include claim number + all ACC details
    //   • Cannot forward reports to patient GP — provider must forward
    postcodePrefixes: ['72', '73'],
    clinics: [
      { name: 'Blenheim - Churchill Specialist Centre', address: 'Churchill Specialist Centre, Hospital Road, Blenheim', postcode: '7201', phone: '03 578 9109', email: 'bookings@mmimaging.co.nz', modalities: ['xr', 'us', 'ct', 'mri'] },
    ],
  },
  {
    id: 'pr-cbg',
    brand: 'Pacific Radiology',
    region: 'Canterbury',
    email: 'contactcentrechc@pacificradiology.com',
    postcodePrefixes: ['8'],
    clinics: [
      { name: 'Ashburton', address: '135 Tancred Street, Eastfield Health Centre, Ashburton', postcode: '7700', phone: '0800 869 729', email: 'contactcentrechc@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Christchurch - After Hours', address: '401 Madras Street, Pegasus House, Christchurch', postcode: '8013', phone: '0800 869 729', email: 'contactcentrechc@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Canterbury Breastcare', address: "Level 2 Leinster Chambers, St George's Medical Centre, 249 Papanui Road, Christchurch", postcode: '8014', phone: '0800 869 729', email: 'contactcentrechc@pacificradiology.com', modalities: ['us'] },
      { name: 'Christchurch - Forté', address: 'Forte 2, 132 Peterborough Street, Christchurch', postcode: '8013', phone: '0800 869 729', email: 'contactcentrechc@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Christchurch - Metro', address: '136 Moorhouse Avenue, Addington, Christchurch', postcode: '8011', phone: '0800 869 729', email: 'contactcentrechc@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Christchurch - Northwood', address: 'Level 1, 1 Radcliffe Road, Northwood Supa Centre, Christchurch', postcode: '8051', phone: '0800 869 729', email: 'contactcentrechc@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Christchurch - Southern Cross', address: '129 Bealey Avenue, Christchurch', postcode: '8013', phone: '0800 869 729', email: 'contactcentrechc@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Christchurch - Wigram', address: '67 Skyhawk Road, Wigram Health, Christchurch', postcode: '8042', phone: '0800 869 729', email: 'contactcentrechc@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Rangiora', address: 'Durham Health, 17 Durham Street, Rangiora', postcode: '7400', phone: '0800 869 729', email: 'contactcentrechc@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Rolleston', address: 'Unit 2, 3 Norman Kirk Drive, Rolleston', postcode: '7614', phone: '0800 869 729', email: 'contactcentrechc@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Timaru', address: '45 Elizabeth Street, Seaview, Timaru', postcode: '7910', phone: '0800 869 729', email: 'contactcentrechc@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Christchurch - Reflect', address: '13 Rutland Street, St Albans, Christchurch', postcode: '8014', phone: '0800 869 729', email: 'contactcentrechc@pacificradiology.com', modalities: ['us'] },
      { name: 'Christchurch - Riccarton', address: '6 Yaldhurst Road, Christchurch', postcode: '8041', phone: '0800 869 729', email: 'contactcentrechc@pacificradiology.com', modalities: ['xr'] },
      { name: "Christchurch - St George's", address: '151 Leinster Road, Strowan, Christchurch', postcode: '8014', phone: '0800 869 729', email: 'contactcentrechc@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Greymouth', address: 'Radiology Department, Ground Floor, Te Nikau Grey Hospital, Greymouth', postcode: '7805', phone: '0800 505 909', email: 'contactcentrechc@pacificradiology.com', modalities: ['us'] },
    ],
  },
  {
    id: 'pr-otago',
    brand: 'Pacific Radiology',
    region: 'Otago / Southland',
    email: 'dunedin.reception@pacificradiology.com',
    postcodePrefixes: ['9'],
    clinics: [
      { name: 'Balclutha', address: 'Clutha Health First, 9-11 Charlotte Street, Balclutha', postcode: '9230', phone: '0800 505 909', email: 'dunedin.reception@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Cromwell', address: '192 Waenga Drive, Cromwell', postcode: '9310', phone: '0800 505 909', email: 'dunedin.reception@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Dunedin - Central', address: 'L5 Mataukareao Building, 30 Great King Street, Dunedin', postcode: '9016', phone: '0800 505 909', email: 'dunedin.reception@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Dunedin - Marinoto', address: 'Marinoto Clinic Building, 72 Newington Avenue, Maori Hill, Dunedin', postcode: '9010', phone: '0800 505 909', email: 'dunedin.reception@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Invercargill', address: '2-10 Dee Street, Invercargill', postcode: '9810', phone: '0800 505 909', email: 'dunedin.reception@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Queenstown - Isle Street', address: 'Queenstown Medical Centre, 9 Isle Street, Queenstown', postcode: '9300', phone: '0800 505 909', email: 'dunedin.reception@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Queenstown - Kawarau Park', address: '24 Eleventh Avenue, Kawarau Park, Lake Hayes Estate, Queenstown', postcode: '9304', phone: '0800 505 909', email: 'dunedin.reception@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Wānaka', address: 'Wanaka Lakes Health Centre, 23 Cardrona Valley Road, Wanaka', postcode: '9305', phone: '0800 505 909', email: 'dunedin.reception@pacificradiology.com', modalities: ['xr', 'us'] },
      { name: 'Gore', address: 'Gore Hospital, 9 Birch Lane, Gore', postcode: '9710', phone: '0800 505 909', email: 'dunedin.reception@pacificradiology.com', modalities: ['xr'] },
    ],
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
