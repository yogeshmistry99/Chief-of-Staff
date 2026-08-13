// Zoopla adapter. Zoopla is a Next.js app, so its data lives in the
// __NEXT_DATA__ JSON blob. Structurally complete but DEFERRED — config.searchUrl
// is null until parsing is confirmed against a live page (Zoopla is aggressively
// Cloudflare-protected and may 403 datacenter IPs). Same interface as rightmove.

import {
  extractNextData, toNumber, sqftFromText, postcodeFromText, mapHouseType, mapStatus,
  parkingFromText, garageFromText,
} from './parse.js'
import { fetchHtml } from './http.js'

export const source = 'zoopla'

// Walk the Next.js tree for the first array that looks like listings.
function findListings(nd) {
  const pp = nd?.props?.pageProps
  return pp?.regularListingsFormatted ?? pp?.listings ?? pp?.searchResults?.listings ?? []
}

export function parseSearch(html) {
  const nd = extractNextData(html)
  const listings = findListings(nd)
  const out = []
  for (const l of listings) {
    const id = String(l?.listingId ?? l?.id ?? '')
    if (!id) continue
    const address = l?.address ?? l?.title ?? null
    out.push({
      source,
      source_listing_id: id,
      url: l?.listingUris?.detail ? `https://www.zoopla.co.uk${l.listingUris.detail}` : (l?.url ?? null),
      price: toNumber(l?.pricing?.value ?? l?.price),
      address,
      postcode: postcodeFromText(address),
      bedrooms: toNumber(l?.counts?.numBedrooms ?? l?.bedrooms),
      bathrooms: toNumber(l?.counts?.numBathrooms ?? l?.bathrooms),
      house_type: mapHouseType(l?.propertyType),
      status: mapStatus(l?.tags?.join?.(' ') ?? l?.listingStatus),
      lat: toNumber(l?.location?.coordinates?.latitude),
      lng: toNumber(l?.location?.coordinates?.longitude),
    })
  }
  return out
}

export function parseDetail(html) {
  const nd = extractNextData(html)
  const d = nd?.props?.pageProps?.listingDetails ?? nd?.props?.pageProps?.listing ?? null
  if (!d) return {}
  const blob = `${d?.detailedDescription ?? d?.description ?? ''} ${(d?.features ?? []).join(' ')}`
  const sqft = sqftFromText(blob) ?? toNumber(d?.floorArea?.value)
  const address = d?.address ?? d?.title ?? null
  return {
    floor_area_sqft: sqft,
    floor_area_source: sqft != null ? 'zoopla:text' : null,
    bathrooms: toNumber(d?.counts?.numBathrooms),
    bedrooms: toNumber(d?.counts?.numBedrooms),
    tenure: d?.tenure ?? null,
    epc: d?.epc?.currentEnergyRating ?? null,
    agent: d?.branch?.name ?? d?.agent?.name ?? null,
    lat: toNumber(d?.location?.coordinates?.latitude),
    lng: toNumber(d?.location?.coordinates?.longitude),
    postcode: postcodeFromText(address),
    house_type: mapHouseType(d?.propertyType),
    status: mapStatus(d?.listingStatus),
    parking: parkingFromText(blob),
    garage: garageFromText(blob),
    description: d?.detailedDescription ?? d?.description ?? null,
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
