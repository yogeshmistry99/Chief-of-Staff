// Pure geo helpers. No dependencies, no network.

const R = 6371000 // Earth radius, metres

function toRad(d) { return (d * Math.PI) / 180 }

// Great-circle distance between two {lat, lng} points, in metres.
export function haversineMeters(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Nearest point (and its distance in metres) from a list of {lat,lng,...} to a
// target point. Returns { item, meters } or null when nothing is comparable.
export function nearest(target, points) {
  if (target?.lat == null || target?.lng == null || !Array.isArray(points)) return null
  let best = null
  for (const p of points) {
    const m = haversineMeters(target, p)
    if (m == null) continue
    if (!best || m < best.meters) best = { item: p, meters: Math.round(m) }
  }
  return best
}
