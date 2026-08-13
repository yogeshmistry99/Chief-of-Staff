// Deterministic factor enrichment — no network, no tokens. Given a geocoded
// property, computes the model's factor columns from bundled open datasets and
// simple heuristics.

import { nearest } from './geo.js'
import { STATIONS } from './data/stations.js'
import { SCHOOLS } from './data/schools.js'

// Nearest station distance in metres (null if the property isn't geocoded or the
// dataset is empty).
export function nearestStationMeters(property) {
  const hit = nearest({ lat: property?.lat, lng: property?.lng }, STATIONS)
  return hit ? hit.meters : null
}

// Nearest school distance in metres. Returns null while SCHOOLS is empty — we do
// not fabricate a distance.
export function nearestSchoolMeters(property) {
  const hit = nearest({ lat: property?.lat, lng: property?.lng }, SCHOOLS)
  return hit ? hit.meters : null
}

// Extension-potential heuristic → 0..3 ordinal (none/loft/rear/large).
//
// This is a rough signal to feed the model, not a survey. It is intentionally
// conservative and null-safe, and the detail page lets you override it manually.
// Logic:
//   • detached / bungalow with meaningful spare plot → 3 (large)
//   • semi/end-terrace with spare plot, OR any house with a garden → 2 (rear)
//   • a house with no plot signal but a pitched-roof type → 1 (loft)
//   • flats → 0
export function extensionPotential(property) {
  const type = property?.house_type
  if (type === 'flat') return 0

  const area = Number(property?.floor_area_sqft) || 0
  const plot = Number(property?.plot_sqft) || 0
  const spare = plot > 0 && area > 0 ? plot - area : null // crude footprint proxy

  if ((type === 'detached' || type === 'bungalow') && spare != null && spare > area) return 3
  if (spare != null && spare > area * 0.5) return 2
  if (property?.garden === true) return 2
  if (type && type !== 'flat') return 1
  return null
}

// Apply all factors to a property object in place-ish (returns a patch of the
// factor columns only). Callers merge this into their update.
export function computeFactors(property) {
  return {
    nearest_station_m: nearestStationMeters(property),
    nearest_school_m: nearestSchoolMeters(property),
    extension_potential: extensionPotential(property),
  }
}
