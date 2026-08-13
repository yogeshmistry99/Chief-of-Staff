// OnTheMarket adapter. OTM embeds a JSON state blob (window.__OTM__ / a preloaded
// state object) and ld+json. Structurally complete but DEFERRED — config.searchUrl
// is null until parsing is confirmed against a live page. Same interface.

import {
  extractJsonAssignment, extractLdJson, toNumber, sqftFromText, postcodeFromText,
  mapHouseType, mapStatus, parkingFromText, garageFromText,
} from './parse.js'
import { fetchHtml } from './http.js'

export const source = 'onthemarket'

function state(html) {
  return extractJsonAssignment(html, 'window.__OTM__')
    ?? extractJsonAssignment(html, '__OTM__')
    ?? extractJsonAssignment(html, '__PRELOADED_STATE__')
}

export function parseSearch(html) {
  const st = state(html)
  const props = st?.jsonData?.properties ?? st?.properties ?? st?.search?.properties ?? []
  const out = []
  for (const p of props) {
    const id = String(p?.id ?? p?.property_id ?? '')
    if (!id) continue
    const address = p?.display_address ?? p?.address ?? null
    out.push({
      source,
      source_listing_id: id,
      url: p?.property_link ? `https://www.onthemarket.com${p.property_link}` : (p?.url ?? null),
      price: toNumber(p?.price ?? p?.price_value),
      address,
      postcode: postcodeFromText(address),
      bedrooms: toNumber(p?.bedrooms ?? p?.bedrooms_max),
      bathrooms: toNumber(p?.bathrooms),
      house_type: mapHouseType(p?.property_type ?? p?.humanized_property_type),
      status: mapStatus(p?.status ?? (p?.under_offer ? 'under offer' : '')),
      lat: toNumber(p?.location?.lat ?? p?.latitude),
      lng: toNumber(p?.location?.lon ?? p?.longitude),
    })
  }
  return out
}

export function parseDetail(html) {
  const st = state(html)
  const d = st?.jsonData?.property ?? st?.property ?? null
  const ld = extractLdJson(html).find((x) => /residence|product|offer/i.test(x?.['@type'] ?? ''))
  const src = d ?? {}
  const blob = `${src?.full_description ?? src?.description ?? ''} ${(src?.features ?? []).join(' ')}`
  const sqft = sqftFromText(blob) ?? toNumber(src?.floor_area?.sq_feet)
  const address = src?.display_address ?? src?.address ?? ld?.name ?? null
  return {
    floor_area_sqft: sqft,
    floor_area_source: sqft != null ? 'onthemarket:text' : null,
    bathrooms: toNumber(src?.bathrooms),
    bedrooms: toNumber(src?.bedrooms),
    tenure: src?.tenure ?? null,
    epc: src?.epc_rating ?? null,
    agent: src?.agent?.name ?? src?.branch?.name ?? null,
    lat: toNumber(src?.location?.lat ?? src?.latitude),
    lng: toNumber(src?.location?.lon ?? src?.longitude),
    postcode: postcodeFromText(address),
    house_type: mapHouseType(src?.property_type),
    status: mapStatus(src?.status),
    parking: parkingFromText(blob),
    garage: garageFromText(blob),
    description: src?.full_description ?? src?.description ?? null,
  }
}

export async function discover(sourceCfg, opts = {}) {
  const url = sourceCfg?.searchUrl
  if (!url) return []
  const html = await fetchHtml(url, opts)
  return html ? parseSearch(html) : []
}

export async function enrich(url, opts = {}) {
  const html = await fetchHtml(url, opts)
  return html ? parseDetail(html) : {}
}
