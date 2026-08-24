// NZ vs international residency detection from a free-text home address
// captured in triage. Both Payment.jsx (client, for country dropdown
// pre-select) and api/_create-payment-intent.js (server, authoritative
// pricing check) import from this file.
//
// Design: three-way return — true / false / null — so downstream can
// distinguish "definitely NZ" from "definitely foreign" from "can't tell
// with confidence, ask the patient". We never silently apply a rate the
// patient hasn't confirmed when the signal is weak.
//
// Priority order:
//   1. Foreign-country keyword (Australia, UK, USA, etc.)  → non-NZ
//   2. NZ / Aotearoa / New Zealand keyword                 → NZ
//   3. Known NZ city / suburb / region name                → NZ
//   4. 4-digit block in the valid NZ postcode range        → NZ
//   5. Otherwise                                            → ambiguous

const NZ_PLACES = new Set([
  // Major cities + regional centres
  'auckland', 'wellington', 'christchurch', 'hamilton', 'tauranga',
  'napier', 'hastings', 'dunedin', 'palmerston north', 'nelson',
  'rotorua', 'whangarei', 'whangārei', 'new plymouth', 'invercargill',
  'timaru', 'gisborne', 'blenheim', 'whanganui', 'wanganui', 'masterton',
  'levin', 'porirua', 'lower hutt', 'upper hutt', 'kapiti', 'paraparaumu',
  // Auckland suburbs + North Shore
  'takapuna', 'north shore', 'manukau', 'papatoetoe', 'howick', 'east tamaki',
  'mangere', 'onehunga', 'ellerslie', 'newmarket', 'ponsonby', 'grey lynn',
  'mt eden', 'mount eden', 'epsom', 'remuera', 'parnell', 'devonport',
  'karaka', 'pukekohe', 'orewa', 'silverdale', 'warkworth', 'hibiscus coast',
  // South Island towns often written on their own line
  'picton', 'havelock', 'kaikoura', 'oamaru', 'ashburton', 'greymouth',
  'westport', 'hokitika', 'motueka', 'takaka', 'queenstown', 'wanaka',
  'wānaka', 'te anau', 'cromwell', 'alexandra', 'balclutha', 'gore',
  // Regions / broader areas
  'northland', 'waikato', 'bay of plenty', 'coromandel', 'east cape',
  'hawkes bay', "hawke's bay", 'taranaki', 'manawatu', 'wairarapa',
  'marlborough', 'canterbury', 'otago', 'southland', 'west coast',
  'stewart island', 'chatham islands', 'marlborough sounds',
])

const NON_NZ_COUNTRIES = new Set([
  'australia', 'aus', 'aust', 'united states', 'usa', 'america',
  'united kingdom', 'uk', 'england', 'scotland', 'wales', 'ireland',
  'canada', 'india', 'china', 'japan', 'south korea', 'korea',
  'germany', 'france', 'spain', 'italy', 'netherlands', 'holland',
  'singapore', 'malaysia', 'thailand', 'philippines', 'vietnam',
  'south africa', 'brazil', 'mexico', 'argentina', 'russia',
  'switzerland', 'sweden', 'norway', 'denmark', 'finland',
  'greece', 'portugal', 'poland', 'austria', 'belgium',
  // Australian state abbreviations that appear in Aus street addresses
  // ("Sydney NSW 2000") — treat presence as a strong non-NZ signal.
  'nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt',
])

const NZ_POSTCODE_RE = /(?:^|[^\d])(\d{4})(?:[^\d]|$)/

/**
 * @param {string} address
 * @returns {{ nz: true|false|null, reason: string, hit?: string }}
 */
export function detectNzAddress(address) {
  const raw = String(address || '').toLowerCase().trim()
  if (!raw) return { nz: null, reason: 'empty' }

  for (const c of NON_NZ_COUNTRIES) {
    // Escape 2-letter country codes so regex chars don't leak — none of the
    // entries above contain regex specials, but be defensive.
    const esc = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${esc}\\b`).test(raw)) return { nz: false, reason: 'foreign-country', hit: c }
  }

  if (/\b(new zealand|nz|aotearoa)\b/.test(raw)) return { nz: true, reason: 'nz-word' }

  for (const p of NZ_PLACES) {
    if (raw.includes(p)) return { nz: true, reason: 'city', hit: p }
  }

  const m = raw.match(NZ_POSTCODE_RE)
  if (m) {
    const n = parseInt(m[1], 10)
    // NZ Post issues postcodes in the range 0110 (Wellsford) — 9893
    // (Stewart Island). Anything outside is likely a foreign postcode
    // (e.g. Australian 2000, US 90210, UK numeric formats).
    if (n >= 110 && n <= 9893) return { nz: true, reason: 'postcode', hit: m[1] }
  }

  return { nz: null, reason: 'ambiguous' }
}
