// US states — used by Tere Care landing state picker and intake gate.
// USPS 2-letter codes + full names. All 50 + DC, alphabetical.

export const US_STATES = Object.freeze([
  { code: 'AL', name: 'Alabama' },     { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },     { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },     { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },      { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },    { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },        { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },    { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },       { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },    { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },     { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },      { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },    { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },        { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },      { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },{ code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },   { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },        { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },    { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },   { code: 'WY', name: 'Wyoming' },
])

export function stateName(code) {
  return US_STATES.find(s => s.code === code)?.name || code
}

// IP-based state hint via ipapi.co (free tier, 1000/day, no key needed).
// Silently returns null on failure — caller falls back to manual dropdown.
export async function detectStateFromIP() {
  try {
    const res = await fetch('https://ipapi.co/json/')
    if (!res.ok) return null
    const data = await res.json()
    if (data.country_code === 'US' && data.region_code) return data.region_code
  } catch { /* offline / blocked */ }
  return null
}
