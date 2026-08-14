// /api/hpi — server-side proxy to the Te Whatu Ora Health Identity
// Platform (HPI) FHIR API.
//
// Why server-side: the Client ID doubles as the API Key and the Client
// Secret is HNZ's shared secret — neither may ever touch the browser
// bundle. This endpoint does the OAuth2 client-credentials grant against
// the KeyCloak token URL, caches the bearer for its TTL, and proxies
// only the FHIR calls we're actually approved for (Get/Search Practitioner
// and Get Location).
//
// Access: admin providers only. HPI lookups reveal PII about clinicians
// (name, scope of practice, registration status) so we treat the endpoint
// as an admin-onboarding tool, not a general clinician surface.
//
// Actions (all GET unless noted):
//   ?action=ping                              — health/env check
//   ?action=get_practitioner&cpn=<HPI-CPN>    — single practitioner by HPI number
//   ?action=search_practitioner&family=X&given=Y — name search
//   ?action=get_facility&hpi=<HPI-Facility>   — single facility/location

import { guardProvider } from './_auth.js'

const TOKEN_URL = process.env.HPI_TOKEN_URL
const BASE_URL  = process.env.HPI_BASE_URL
const CLIENT_ID = process.env.HPI_CLIENT_ID
const SECRET    = process.env.HPI_CLIENT_SECRET
const SCOPES    = process.env.HPI_SCOPES || ''

// In-memory token cache. Vercel serverless containers reuse this between
// warm invocations, so most calls hit the cache and skip the token grant.
let cached = { token: null, expires: 0 }

async function getBearer() {
  if (!TOKEN_URL || !CLIENT_ID || !SECRET) {
    const missing = []
    if (!TOKEN_URL) missing.push('HPI_TOKEN_URL')
    if (!CLIENT_ID) missing.push('HPI_CLIENT_ID')
    if (!SECRET)    missing.push('HPI_CLIENT_SECRET')
    throw new Error(`HPI env missing: ${missing.join(', ')}`)
  }
  const now = Date.now()
  if (cached.token && cached.expires > now + 5000) return cached.token
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     CLIENT_ID,
    client_secret: SECRET,
  })
  if (SCOPES) body.set('scope', SCOPES)
  const r = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`HPI token grant ${r.status}: ${text.slice(0, 200)}`)
  }
  const j = await r.json()
  const ttlMs = (Number(j.expires_in) || 300) * 1000
  cached = { token: j.access_token, expires: now + ttlMs - 5000 }
  return cached.token
}

async function fhirGet(path, params) {
  if (!BASE_URL) throw new Error('HPI env missing: HPI_BASE_URL')
  const token = await getBearer()
  const url = new URL(BASE_URL.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, ''))
  for (const [k, v] of Object.entries(params || {})) {
    if (v != null && v !== '') url.searchParams.set(k, v)
  }
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept:        'application/fhir+json',
    },
  })
  const text = await r.text()
  let body
  try { body = text ? JSON.parse(text) : {} } catch { body = { raw: text.slice(0, 400) } }
  return { status: r.status, ok: r.ok, body }
}

// Extract just the fields our admin UI actually needs, so we don't
// return the entire FHIR resource to the client. Keeps the surface small
// and audit-friendly.
function shapePractitioner(p) {
  if (!p) return null
  const name = Array.isArray(p.name) ? p.name.find(n => n.use === 'official') || p.name[0] : null
  const family = name?.family || ''
  const given  = Array.isArray(name?.given) ? name.given.join(' ') : (name?.given || '')
  const cpn = (p.identifier || []).find(i =>
    /HPI|Common Person Number/i.test(i.type?.text || '') ||
    /^https?:\/\/standards\.digital\.health\.nz\/ns\/hpi-person-id/i.test(i.system || '')
  )
  return {
    id:      p.id,
    active:  p.active !== false,
    family, given,
    cpn:     cpn?.value || p.id || null,
    scope:   (p.qualification || []).map(q => q.code?.text || q.code?.coding?.[0]?.display).filter(Boolean),
  }
}

function shapeLocation(l) {
  if (!l) return null
  return {
    id:      l.id,
    name:    l.name || '',
    status:  l.status || '',
    address: (l.address?.line || []).join(', '),
    hpi:     (l.identifier || [])[0]?.value || l.id || null,
  }
}

export default async function handler(req, res) {
  const auth = await guardProvider(req, res)
  if (!auth) return
  if (!auth.provider?.is_admin) return res.status(403).json({ error: 'Admin only' })

  const { action } = req.query || {}

  try {
    if (action === 'ping') {
      return res.status(200).json({
        ok: true,
        env: {
          HPI_TOKEN_URL:    !!TOKEN_URL,
          HPI_BASE_URL:     !!BASE_URL,
          HPI_CLIENT_ID:    !!CLIENT_ID,
          HPI_CLIENT_SECRET:!!SECRET,
          HPI_SCOPES:       !!SCOPES,
        },
      })
    }

    if (action === 'get_practitioner') {
      const cpn = String(req.query.cpn || '').trim()
      if (!cpn) return res.status(400).json({ error: 'cpn required' })
      const r = await fhirGet(`Practitioner/${encodeURIComponent(cpn)}`)
      if (r.status === 404) return res.status(404).json({ error: 'Not found', body: r.body })
      if (!r.ok)            return res.status(r.status).json({ error: 'HPI error', body: r.body })
      return res.status(200).json({ practitioner: shapePractitioner(r.body), raw: r.body })
    }

    if (action === 'search_practitioner') {
      const family = String(req.query.family || '').trim()
      const given  = String(req.query.given  || '').trim()
      if (!family && !given) return res.status(400).json({ error: 'family or given required' })
      const r = await fhirGet('Practitioner', { family, given, _count: 20 })
      if (!r.ok) return res.status(r.status).json({ error: 'HPI error', body: r.body })
      const entries = Array.isArray(r.body?.entry) ? r.body.entry : []
      return res.status(200).json({
        results: entries.map(e => shapePractitioner(e.resource)).filter(Boolean),
        total:   r.body?.total ?? entries.length,
      })
    }

    if (action === 'get_facility') {
      const hpi = String(req.query.hpi || '').trim()
      if (!hpi) return res.status(400).json({ error: 'hpi required' })
      const r = await fhirGet(`Location/${encodeURIComponent(hpi)}`)
      if (r.status === 404) return res.status(404).json({ error: 'Not found', body: r.body })
      if (!r.ok)            return res.status(r.status).json({ error: 'HPI error', body: r.body })
      return res.status(200).json({ facility: shapeLocation(r.body), raw: r.body })
    }

    return res.status(400).json({ error: 'Invalid action' })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'HPI proxy error' })
  }
}
