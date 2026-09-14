// NZ address autocomplete via OpenStreetMap Nominatim.
//
// Runs server-side so:
//   1. We don't leak patient IP + address queries to a third-party
//      geocoder (privacy for a health platform)
//   2. We can set a proper User-Agent header (browsers block that)
//   3. One place to swap providers later (AddressFinder, LINZ, etc.)
//      if OSM coverage becomes a real gap
//
// Anon endpoint — no PHI in the query, just fragments of a postal
// address the patient is typing. Rate-limited at the CF edge (task
// #295) to prevent abuse.

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const UA = 'TereHealth/1.0 (patient-address-autocomplete; hello@terehealth.co.nz)'

// Small in-memory cache so we don't hit Nominatim on every keystroke
// as the patient types — a lot of users will land on the same street
// name and this shaves off obvious duplicates. Rolls out oldest entries
// once we hit MAX, TTL evicts on read after 1h. Kept minimal — no need
// to add lru-cache as a dep for this.
const CACHE_MAX = 500
const CACHE_TTL_MS = 60 * 60 * 1000
const cache = new Map() // key → { at, value }
function cacheGet(k) {
  const e = cache.get(k)
  if (!e) return null
  if (Date.now() - e.at > CACHE_TTL_MS) { cache.delete(k); return null }
  return e.value
}
function cacheSet(k, v) {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value
    if (first) cache.delete(first)
  }
  cache.set(k, { at: Date.now(), value: v })
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const q = String(req.query?.q || '').trim().slice(0, 200)
  if (q.length < 3) return res.status(200).json({ results: [] })

  const cacheKey = q.toLowerCase()
  const cached = cacheGet(cacheKey)
  if (cached) {
    res.setHeader('X-Cache', 'HIT')
    return res.status(200).json({ results: cached })
  }

  try {
    const url = new URL(NOMINATIM)
    url.searchParams.set('q', q)
    url.searchParams.set('countrycodes', 'nz')
    url.searchParams.set('format', 'json')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('limit', '8')

    const ctl = new AbortController()
    const to = setTimeout(() => ctl.abort(), 5000)
    const r = await fetch(url.toString(), {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
      signal: ctl.signal,
    })
    clearTimeout(to)

    if (!r.ok) {
      console.error('[address-search] upstream', r.status)
      return res.status(200).json({ results: [] })
    }
    const data = await r.json()

    // Slim the response down to only what the UI renders — Nominatim
    // returns a lot of extra fields (bounding boxes, OSM ids, licence
    // strings) the patient doesn't need.
    const slim = (Array.isArray(data) ? data : []).slice(0, 8).map(row => ({
      place_id:     row.place_id,
      display_name: row.display_name,
      lat:          row.lat,
      lon:          row.lon,
      address: {
        house_number: row.address?.house_number || null,
        road:         row.address?.road || null,
        suburb:       row.address?.suburb || row.address?.neighbourhood || null,
        city:         row.address?.city || row.address?.town || row.address?.village || null,
        state:        row.address?.state || null,
        postcode:     row.address?.postcode || null,
        country:      row.address?.country || 'New Zealand',
      },
    }))

    cacheSet(cacheKey, slim)
    res.setHeader('X-Cache', 'MISS')
    return res.status(200).json({ results: slim })
  } catch (e) {
    console.error('[address-search] error', e?.message || e)
    return res.status(200).json({ results: [] })
  }
}
