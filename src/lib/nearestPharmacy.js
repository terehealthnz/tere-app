// nearestPharmacy — client-side helpers for the "closest to me" flow.
//
// Everything stays in the browser: we ask navigator.geolocation for the
// user's coords, run a Haversine distance against pharmacies that have
// lat/lng in the register, and return the top N. No coordinates are
// ever sent to a Tere server or persisted anywhere.

/**
 * Haversine distance in kilometres between two lat/lng pairs.
 * Small enough distances (<< earth radius) that we don't need
 * higher-precision formulae — accurate to ~10 m at typical NZ distances.
 */
export function haversineKm(a, b) {
  const R = 6371  // km
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
 * Wrap navigator.geolocation.getCurrentPosition in a Promise so we can
 * `await` it in click handlers. Times out after 10s so the picker doesn't
 * hang forever if the user has flaky location services.
 */
export function requestUserLocation(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation not available in this browser'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 300000 },
    )
  })
}

/**
 * Given the user's coords and a list of pharmacies, return the N nearest
 * ones with a `distanceKm` field attached. Pharmacies without lat/lng are
 * silently excluded (they still show up in text search — this is purely
 * for the geolocation sort path).
 */
export function nearestPharmacies(userCoords, pharmacies, n = 3) {
  const withCoords = []
  for (const p of pharmacies) {
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue
    const distanceKm = haversineKm(userCoords, { lat: p.lat, lng: p.lng })
    withCoords.push({ ...p, distanceKm })
  }
  withCoords.sort((a, b) => a.distanceKm - b.distanceKm)
  return withCoords.slice(0, n)
}

/**
 * Format a distance for UI display. Uses metres under 1 km, one decimal
 * for 1–10 km, and integer km beyond.
 */
export function formatDistance(km) {
  if (km == null || Number.isNaN(km)) return ''
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}
