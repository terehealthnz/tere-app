// node-fetch not needed — using built-in fetch
//
// HPI client bootstrap — reads all endpoints + credentials from the same env
// vars api/_hpi.js uses (HPI_TOKEN_URL, HPI_BASE_URL, HPI_CLIENT_ID,
// HPI_CLIENT_SECRET, HPI_SCOPES). Previously these were hardcoded to
// production hosts with a wrong path, which meant every request failed auth
// against our UAT credentials and the code silently served mock data.

const HPI_TOKEN_URL = process.env.HPI_TOKEN_URL
const HPI_BASE_URL  = process.env.HPI_BASE_URL
const HPI_CLIENT_ID = process.env.HPI_CLIENT_ID
const HPI_SECRET    = process.env.HPI_CLIENT_SECRET
const HPI_SCOPES    = process.env.HPI_SCOPES || ''

// HNZ HPI FHIR API requires this header set on every request (per
// hpi-ig.hip.digital.health.nz/general.html + onboarding email):
//   Authorization:    Bearer {token}
//   x-api-key:        {HPI_CLIENT_ID}   ← mandatory; rejection without this
//                                          is silent (comes back as 401/403)
//   userid:           {string}          ← end-user identifier
//   User-Agent:       {string}          ← identifies our app
//   X-Correlation-Id: {uuid}            ← recommended for HNZ traceability
function hpiHeaders(token, userId) {
  const corrId = (globalThis.crypto?.randomUUID?.() ||
                  String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10))
  return {
    Authorization:      `Bearer ${token}`,
    Accept:             'application/fhir+json',
    'x-api-key':        HPI_CLIENT_ID,
    userid:             String(userId || 'tere-service'),
    'User-Agent':       'TereHealth/1.0 (server; HPI FHIR proxy)',
    'X-Correlation-Id': corrId,
  }
}

let cachedToken = null
let tokenExpiry = 0

async function getHpiToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken
  if (!HPI_TOKEN_URL || !HPI_CLIENT_ID || !HPI_SECRET) return null

  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     HPI_CLIENT_ID,
    client_secret: HPI_SECRET,
  })
  if (HPI_SCOPES) params.set('scope', HPI_SCOPES)

  const res = await globalThis.fetch(HPI_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) return null

  const data = await res.json()
  cachedToken = data.access_token
  tokenExpiry = Date.now() + (Number(data.expires_in) - 60) * 1000
  return cachedToken
}

function parseFhirLocation(resource) {
  const name = resource.name || ''
  const telecom = resource.telecom || []
  const address = resource.address || {}

  const phone = telecom.find(t => t.system === 'phone')?.value || ''
  const email = telecom.find(t => t.system === 'email')?.value || ''
  const fax = telecom.find(t => t.system === 'fax')?.value || ''

  const addressParts = [
    ...(address.line || []),
    address.city,
    address.postalCode,
  ].filter(Boolean)

  const hpiId = resource.identifier?.find(i =>
    i.system?.includes('hpi') || i.system?.includes('health-provider-index')
  )?.value || resource.id || ''

  return { name, hpiId, address: addressParts.join(', '), phone, email, fax }
}

const MOCK_PHARMACIES = [
  { name: 'Havelock Pharmacy', hpiId: 'FAC0000101', address: '47 Main Road, Havelock 7100', phone: '03 574 2321', email: 'rx@havelockpharmacy.co.nz', fax: '' },
  { name: 'Blenheim Pharmacy Plus', hpiId: 'FAC0000102', address: '12 Market Street, Blenheim 7201', phone: '03 578 4400', email: 'dispensary@blenheimpharmacyplus.co.nz', fax: '' },
  { name: 'Picton Pharmacy', hpiId: 'FAC0000103', address: '10 High Street, Picton 7220', phone: '03 573 6300', email: 'pictonrx@gmail.com', fax: '' },
  { name: 'Nelson City Pharmacy', hpiId: 'FAC0000104', address: '265 Trafalgar Street, Nelson 7010', phone: '03 548 2424', email: 'dispensary@nelsoncitypharmacy.co.nz', fax: '' },
  { name: 'Unichem Blenheim', hpiId: 'FAC0000105', address: '120 High Street, Blenheim 7201', phone: '03 578 3200', email: 'blenheim@unichem.co.nz', fax: '' },
]

const MOCK_GPS = [
  { name: 'Dr Sarah Mitchell',  clinic: 'Havelock Medical Centre',    email: 'reception@havelockmedical.co.nz',    hpiId: 'G00012345' },
  { name: 'Dr James Chen',      clinic: 'Blenheim Family Health',      email: 'reception@blenheimfh.co.nz',         hpiId: 'G00012346' },
  { name: 'Dr Emma Wilson',     clinic: 'Marlborough Family Practice', email: 'admin@marlboroughfp.co.nz',          hpiId: 'G00012347' },
  { name: 'Dr Mike Tane',       clinic: 'Picton Medical Centre',       email: 'reception@pictonmed.co.nz',          hpiId: 'G00012348' },
  { name: 'Dr Lisa Park',       clinic: 'Nelson Bays Primary Health',  email: 'reception@nbph.co.nz',              hpiId: 'G00012349' },
  { name: 'Dr Anna Lawson',     clinic: 'Rai Valley Health',           email: 'info@raivalleyhealth.co.nz',         hpiId: 'G00012350' },
  { name: 'Dr Tom Stevenson',   clinic: 'Renwick Health Centre',       email: 'reception@renwickhealth.co.nz',     hpiId: 'G00012351' },
  { name: 'Dr Priya Sharma',    clinic: 'Blenheim Health Centre',      email: 'admin@blenheimhealthcentre.co.nz',  hpiId: 'G00012352' },
  { name: 'Dr Peter Herling',   clinic: 'Tere Health',                 email: 'terehealthnz@gmail.com',            hpiId: 'G00012353' },
]

const MOCK_RADIOLOGY = [
  { name: 'Marlborough Medical Imaging', hpiId: 'FAC0001001', address: '25 Alma Road, Blenheim 7201', phone: '03 579 8050', email: 'referrals@mmi.co.nz', fax: '03 579 8051' },
  { name: 'Pacific Radiology Nelson', hpiId: 'FAC0001002', address: '98 Waimea Road, Nelson 7010', phone: '03 546 9100', email: 'nelson@pacificradiology.co.nz', fax: '03 546 9101' },
  { name: 'Medray Marlborough', hpiId: 'FAC0001003', address: '5 Scott Street, Blenheim 7201', phone: '03 577 7733', email: 'bookings@medray.co.nz', fax: '' },
  { name: 'Nelson Hospital Radiology', hpiId: 'FAC0001004', address: 'Tipahi Street, Nelson 7010', phone: '03 546 1800', email: 'radiology@nmdhb.govt.nz', fax: '03 546 1801' },
]

export default async function handler(req, res) {
  const { query, type } = req.body || {}
  if (!query || query.length < 2) return res.json({ results: [] })

  // GP practitioner search — uses HPI sandbox Practitioner endpoint
  if (type === 'gp') {
    const q = query.toLowerCase().replace(/^dr\.?\s*/i, '')
    const mockResults = MOCK_GPS.filter(g =>
      g.name.toLowerCase().replace(/^dr\.?\s*/i, '').includes(q) ||
      g.clinic.toLowerCase().includes(q)
    ).slice(0, 4)

    const token = await getHpiToken()
    if (!token) return res.json({ results: mockResults, mock: true })

    try {
      if (!HPI_BASE_URL) return res.json({ results: mockResults, mock: true })
      const base = HPI_BASE_URL.replace(/\/+$/, '')
      const url = `${base}/Practitioner?name=${encodeURIComponent(query)}&active=true&_count=5`
      const hpiRes = await globalThis.fetch(url, { headers: hpiHeaders(token, 'tere-triage') })
      if (!hpiRes.ok) return res.json({ results: mockResults, mock: true })

      const bundle = await hpiRes.json()
      const hpiResults = (bundle.entry || []).map(e => {
        const r = e.resource
        const nameObj = r.name?.[0] || {}
        const displayName = [
          nameObj.prefix?.[0],
          ...(nameObj.given || []),
          nameObj.family,
        ].filter(Boolean).join(' ')
        const email = r.telecom?.find(t => t.system === 'email')?.value || ''
        return { name: displayName, clinic: '', email, hpiId: r.id || '' }
      }).filter(r => r.name)

      return res.json({ results: hpiResults.length ? hpiResults : mockResults, mock: !hpiResults.length })
    } catch {
      return res.json({ results: mockResults, mock: true })
    }
  }

  const locationType = type === 'radiology' ? 'RADDX' : 'PHARM'
  const mockData = type === 'radiology' ? MOCK_RADIOLOGY : MOCK_PHARMACIES

  const token = await getHpiToken()

  if (!token) {
    // Mock fallback
    const q = query.toLowerCase()
    const results = mockData.filter(r => r.name.toLowerCase().includes(q)).slice(0, 6)
    return res.json({ results, mock: true })
  }

  if (!HPI_BASE_URL) {
    const q = query.toLowerCase()
    return res.json({ results: mockData.filter(r => r.name.toLowerCase().includes(q)).slice(0, 6), mock: true })
  }

  try {
    const base = HPI_BASE_URL.replace(/\/+$/, '')
    const url = `${base}/Location?name=${encodeURIComponent(query)}&type=${locationType}&_count=8&status=active`
    const hpiRes = await globalThis.fetch(url, {
      headers: hpiHeaders(token, type === 'radiology' ? 'tere-referral' : 'tere-prescribe'),
    })

    if (!hpiRes.ok) {
      const q = query.toLowerCase()
      return res.json({ results: mockData.filter(r => r.name.toLowerCase().includes(q)).slice(0, 6), mock: true })
    }

    const bundle = await hpiRes.json()
    const results = (bundle.entry || []).map(e => parseFhirLocation(e.resource))
    return res.json({ results })
  } catch (e) {
    const q = query.toLowerCase()
    return res.json({ results: mockData.filter(r => r.name.toLowerCase().includes(q)).slice(0, 6), mock: true })
  }
}
