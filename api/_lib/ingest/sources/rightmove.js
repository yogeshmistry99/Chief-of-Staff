// Rightmove adapter. Parses the JSON Rightmove embeds in its own pages:
//   • search results:  window.jsonModel = { properties: [...] }
//   • detail page:      window.PAGE_MODEL = { propertyData: {...} }
//
// Everything here is best-effort and defensive — portal markup changes, and a
// datacenter IP may be challenged. Any failure returns [] / {} so one bad source
// never fails the whole run. parseSearch/parseDetail are pure (fixture-testable).

import {
  extractJsonAssignment, extractNextData, toNumber, sqftFromSizing, sqftFromText,
  postcodeFromText, mapHouseType, mapStatus, parkingFromText, garageFromText,
} from './parse.js'
import { fetchHtml } from './http.js'

const BASE = 'https://www.rightmove.co.uk'

export const source = 'rightmove'

// ─── Pure parsers ────────────────────────────────────────────────────────────
export function parseSearch(html) {
  const model = extractJsonAssignment(html, 'window.jsonModel')
    ?? extractJsonAssignment(html, 'jsonModel')
    ?? nextDataProperties(html)
  const props = model?.properties ?? []
  const out = []
  for (const p of props) {
    const id = String(p?.id ?? '')
    if (!id) continue
    const url = p?.propertyUrl ? BASE + p.propertyUrl : `${BASE}/properties/${id}`
    const address = p?.displayAddress ?? null
    out.push({
      source,
      source_listing_id: id,
      url,
      price: toNumber(p?.price?.amount ?? p?.price?.displayPrices?.[0]?.displayPrice),
      address,
      postcode: postcodeFromText(address),
      bedrooms: toNumber(p?.bedrooms),
      bathrooms: toNumber(p?.bathrooms),
      house_type: mapHouseType(p?.propertySubType ?? p?.propertyTypeFullDescription),
      status: mapStatus(p?.displayStatus ?? p?.propertyStatus),
      lat: toNumber(p?.location?.latitude),
      lng: toNumber(p?.location?.longitude),
    })
  }
  return out
}

export function parseDetail(html) {
  const model = extractJsonAssignment(html, 'window.PAGE_MODEL')
    ?? extractJsonAssignment(html, 'PAGE_MODEL')
  const d = model?.propertyData ?? model?.property ?? null
  if (!d) return {}
  const desc = d?.text?.description ?? ''
  const features = Array.isArray(d?.keyFeatures) ? d.keyFeatures.join(' ') : ''
  const blob = `${desc} ${features}`
  const sqft = sqftFromSizing(d?.sizings) ?? sqftFromText(blob)
  const address = d?.address?.displayAddress ?? null
  const outIn = [d?.address?.outcode, d?.address?.incode].filter(Boolean).join(' ')
  return {
    floor_area_sqft: sqft,
    floor_area_source: sqft != null ? (d?.sizings?.length ? 'rightmove:sizing' : 'rightmove:text') : null,
    bathrooms: toNumber(d?.bathrooms),
    bedrooms: toNumber(d?.bedrooms),
    tenure: d?.tenure?.tenureType ?? null,
    epc: d?.epcGraphs?.[0]?.epcRating ?? null,
    agent: d?.customer?.branchDisplayName ?? d?.customer?.companyName ?? null,
    lat: toNumber(d?.location?.latitude),
    lng: toNumber(d?.location?.longitude),
    postcode: (outIn && postcodeFromText(outIn)) || postcodeFromText(address),
    house_type: mapHouseType(d?.propertySubType),
    status: mapStatus(d?.status?.published === false ? 'withdrawn' : d?.transactionType),
    parking: parkingFromText(blob),
    garage: garageFromText(blob),
    description: desc || null,
  }
}

function nextDataProperties(html) {
  const nd = extractNextData(html)
  const p = nd?.props?.pageProps
  return p?.searchResults ?? p?.properties ? { properties: p.searchResults?.properties ?? p.properties } : null
}

// ─── Network-backed methods ──────────────────────────────────────────────────
export async function discover(sourceCfg, opts = {}) {
  const url = sourceCfg?.searchUrl
  if (!url) return []
  const pages = opts.pages ?? 1
  const size = sourceCfg.pageSize ?? 24
  const all = []
  for (let i = 0; i < pages; i++) {
    const pageUrl = i === 0 ? url : `${url}${url.includes('?') ? '&' : '?'}index=${i * size}`
    const html = await fetchHtml(pageUrl, opts)
    if (!html) break
    const found = parseSearch(html)
    all.push(...found)
    if (found.length < size) break
  }
  return all
}

export async function enrich(url, opts = {}) {
  const html = await fetchHtml(url, opts)
  if (!html) return {}
  return parseDetail(html)
}
