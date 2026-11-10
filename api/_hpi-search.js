// HPI search proxy — scoped to Search Practitioner (the only HPI search
// scope approved in IN-3502 round 1).
//
// Previously this file also exposed Location-search variants for pharmacy,
// GP clinic and radiology facility pickers. Those called a scope (facility
// search) that was never approved. Noel Babu's 2026-11-09 IN-3502 review
// flagged them and asked that they not call HPI in production until a
// separate access request is raised. Removed here. Callers are now backed
// by local directories (public/pharmacies.json for pharmacies) or free-text
// entry (GP clinic, radiology facility). See HPI IN-3502 round 2 notes.

const HPI_TOKEN_URL = process.env.HPI_TOKEN_URL
const HPI_BASE_URL  = process.env.HPI_BASE_URL
const HPI_CLIENT_ID = process.env.HPI_CLIENT_ID
const HPI_SECRET    = process.env.HPI_CLIENT_SECRET
const HPI_SCOPES    = process.env.HPI_SCOPES || ''

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

// Mock GP practitioner fallback used only when the Practitioner-search HPI
// call itself fails (network/auth). Keeps the triage flow moving — patient
// can still name their GP. The result is clearly flagged `mock: true` on
// the response so the UI can surface "local list" messaging.
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

function callerUserId(body) {
  if (body?.providerCpn)     return `cpn:${String(body.providerCpn).trim().toUpperCase()}`
  if (body?.providerHpi)     return `hpi:${String(body.providerHpi).trim().toUpperCase()}`
  if (body?.providerId)      return `provider:${String(body.providerId).slice(0, 8)}`
  if (body?.patientNhi)      return `nhi:${String(body.patientNhi).trim().toUpperCase()}`
  if (body?.patientId)       return `patient:${String(body.patientId).slice(0, 8)}`
  if (body?.consultationId)  return `consult:${String(body.consultationId).slice(0, 8)}`
  return null
}

export default async function handler(req, res) {
  const { query, type } = req.body || {}
  if (!query || query.length < 2) return res.json({ results: [] })

  // Only Search Practitioner (`type: 'gp'`) is in scope. Location-search
  // callers (pharmacy, gp_clinic, radiology) used to live here — removed
  // 2026-11-09 per IN-3502 scope review. Returning an empty result rather
  // than a 404 so any stale client doesn't blow up mid-triage.
  if (type !== 'gp') {
    return res.json({ results: [], scope_error: 'facility_search_not_approved' })
  }

  const callerId = callerUserId(req.body)
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
    const hpiRes = await globalThis.fetch(url, { headers: hpiHeaders(token, callerId || 'tere-triage') })
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
