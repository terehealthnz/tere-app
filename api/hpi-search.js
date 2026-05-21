import fetch from 'node-fetch'

let cachedToken = null
let tokenExpiry = 0

async function getHpiToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  const clientId = process.env.HPI_CLIENT_ID
  const clientSecret = process.env.HPI_CLIENT_SECRET

  if (!clientId || !clientSecret) return null

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'openid',
  })

  const res = await fetch('https://auth.digital.health.nz/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) return null

  const data = await res.json()
  cachedToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
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

const MOCK_RADIOLOGY = [
  { name: 'Marlborough Medical Imaging', hpiId: 'FAC0001001', address: '25 Alma Road, Blenheim 7201', phone: '03 579 8050', email: 'referrals@mmi.co.nz', fax: '03 579 8051' },
  { name: 'Pacific Radiology Nelson', hpiId: 'FAC0001002', address: '98 Waimea Road, Nelson 7010', phone: '03 546 9100', email: 'nelson@pacificradiology.co.nz', fax: '03 546 9101' },
  { name: 'Medray Marlborough', hpiId: 'FAC0001003', address: '5 Scott Street, Blenheim 7201', phone: '03 577 7733', email: 'bookings@medray.co.nz', fax: '' },
  { name: 'Nelson Hospital Radiology', hpiId: 'FAC0001004', address: 'Tipahi Street, Nelson 7010', phone: '03 546 1800', email: 'radiology@nmdhb.govt.nz', fax: '03 546 1801' },
]

export default async function handler(req, res) {
  const { query, type } = req.body || {}
  if (!query || query.length < 2) return res.json({ results: [] })

  const locationType = type === 'radiology' ? 'RADDX' : 'PHARM'
  const mockData = type === 'radiology' ? MOCK_RADIOLOGY : MOCK_PHARMACIES

  const token = await getHpiToken()

  if (!token) {
    // Mock fallback
    const q = query.toLowerCase()
    const results = mockData.filter(r => r.name.toLowerCase().includes(q)).slice(0, 6)
    return res.json({ results, mock: true })
  }

  try {
    const url = `https://hpi.digital.health.nz/fhir/v1/Location?name=${encodeURIComponent(query)}&type=${locationType}&_count=8&status=active`
    const hpiRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/fhir+json',
      },
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
