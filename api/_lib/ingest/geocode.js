// Postcode → { lat, lng } via postcodes.io (free, keyless, UK-only).
//
// Injectable fetchFn so tests never hit the network. Fails soft: any error or a
// missing postcode returns null coordinates rather than throwing — a property
// without coordinates simply doesn't appear on the map or in geo factors.

const ENDPOINT = 'https://api.postcodes.io/postcodes/'

function normalise(pc) {
  return String(pc ?? '').toUpperCase().replace(/\s+/g, '').trim()
}

export async function geocodePostcode(postcode, { fetchFn = fetch, timeoutMs = 8000 } = {}) {
  const pc = normalise(postcode)
  if (!pc) return null
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetchFn(ENDPOINT + encodeURIComponent(pc), { signal: ctl.signal })
    if (!res.ok) return null
    const body = await res.json()
    const r = body?.result
    if (r && typeof r.latitude === 'number' && typeof r.longitude === 'number') {
      return { lat: r.latitude, lng: r.longitude }
    }
    return null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
