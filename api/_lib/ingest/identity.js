// Identity resolution: does this listing describe a house we already track (an
// existing P###), or a new physical property? This is the deduplication that
// turns "listings from three portals" into "one permanent record per house".
//
// Pure functions over an in-memory list of existing properties — no I/O.
//
// Strategy, strongest signal first:
//   1. If a listing's stable id already maps to a property (handled by the
//      pipeline via property_listings), that wins — not decided here.
//   2. Same postcode + same leading house number + street-token overlap.
//   3. No postcode on either side → strong address match (number + street).
// Conservative by design: a false merge is worse than a missed one (a missed one
// just mints a new P### that can be merged later; a false merge corrupts history).

const NOISE = new Set([
  'flat', 'apartment', 'the', 'road', 'rd', 'street', 'st', 'avenue', 'ave', 'lane', 'ln',
  'close', 'cl', 'drive', 'dr', 'way', 'court', 'ct', 'place', 'pl', 'gardens', 'gdns',
  'crescent', 'cres', 'grove', 'gr', 'terrace', 'ter', 'walk', 'row', 'hill', 'park',
])

export function normalizeAddress(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizePostcode(pc) {
  return String(pc ?? '').toUpperCase().replace(/\s+/g, '')
}

// Leading house number (or number range like "12-14" → "12").
export function houseNumber(address) {
  const m = /^\s*(\d+)/.exec(String(address ?? ''))
  return m ? m[1] : null
}

// Street tokens = normalized address words minus the leading number and common
// road-type noise words.
function streetTokens(address) {
  const norm = normalizeAddress(address)
  const num = houseNumber(address)
  return norm.split(' ').filter((w) => w && w !== num && !NOISE.has(w) && !/^\d+$/.test(w))
}

function tokenOverlap(a, b) {
  const A = new Set(a), B = new Set(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / Math.min(A.size, B.size)
}

// Do two properties/listings describe the same house?
export function sameProperty(a, b) {
  const pcA = normalizePostcode(a?.postcode)
  const pcB = normalizePostcode(b?.postcode)
  const numA = houseNumber(a?.address)
  const numB = houseNumber(b?.address)
  const overlap = tokenOverlap(streetTokens(a?.address), streetTokens(b?.address))

  if (pcA && pcB) {
    if (pcA !== pcB) return false
    // Same full postcode: require the house number to agree when both present.
    if (numA && numB) return numA === numB
    return overlap >= 0.5
  }
  // No postcode to lean on → demand a strong address match.
  if (numA && numB && numA === numB && overlap >= 0.6) return true
  return false
}

export function mintId(pnum) {
  return `P${pnum}`
}

// Resolve a normalized listing to a property id.
//   { propertyId, isNew, pnum }
// `existing` is the list of live properties (id, pnum, postcode, address).
// `maxPnumSeen` is the highest pnum already used (numbers are never reused).
export function resolveIdentity(listing, existing, maxPnumSeen) {
  const match = (existing ?? []).find((p) => sameProperty(p, listing))
  if (match) return { propertyId: match.id, isNew: false, pnum: match.pnum }
  const pnum = (maxPnumSeen ?? 0) + 1
  return { propertyId: mintId(pnum), isNew: true, pnum }
}
