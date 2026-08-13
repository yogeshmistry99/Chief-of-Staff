// Ingestion orchestrator. One bounded, weekly run:
//   discover → resolve identity → diff vs known → record events → enrich → store.
//
// No LLM anywhere. Everything degrades gracefully: a blocked source, a failed
// fetch, or a bad row is logged and skipped — the run never throws as a whole.
// Enrichment is capped (RUN_LIMITS.maxDetailFetches) so the run stays within the
// 60s function budget; uncovered properties are picked up on a later run.

import { areaConfig, DEFAULT_AREA, RUN_LIMITS } from './config.js'
import { resolveIdentity } from './identity.js'
import { computeMarketChanges, floorAreaEvent } from './diff.js'
import { geocodePostcode } from './geocode.js'
import { computeFactors } from './factors.js'
import { sleep } from './sources/http.js'
import * as rightmove from './sources/rightmove.js'
import * as zoopla from './sources/zoopla.js'
import * as onthemarket from './sources/onthemarket.js'
import {
  listProperties, maxPnum, createProperty, updateProperty,
  upsertListing, getListing, appendEvent,
} from '../propertiesRepo.js'

const ADAPTERS = { rightmove, zoopla, onthemarket }

let _seq = 0
function eventId(propertyId, type) {
  _seq = (_seq + 1) % 1e6
  return `${propertyId}:${type}:${Date.now()}:${_seq}`
}

async function safeAppend(sb, propertyId, ev, source, now) {
  try {
    await appendEvent(sb, {
      id: eventId(propertyId, ev.type),
      property_id: propertyId,
      type: ev.type,
      from_val: ev.from_val ?? null,
      to_val: ev.to_val ?? null,
      source: ev.detail?.source ?? source ?? null,
      occurred_at: now,
      detail: ev.detail ?? {},
    })
  } catch (e) {
    console.warn(`event append failed (${ev.type} on ${propertyId}): ${e.message}`)
  }
}

// Run ingestion for one area. Returns a summary object (also the endpoint's JSON).
export async function runIngest(sb, { area = DEFAULT_AREA, fetchFn = fetch, now = new Date().toISOString() } = {}) {
  const cfg = areaConfig(area)
  if (!cfg) return { ok: false, error: `unknown area: ${area}` }

  const summary = {
    ok: true, area, sources: {}, discovered: 0, newProperties: 0,
    updatedProperties: 0, events: 0, enriched: 0, errors: [],
  }

  // Known live properties for this area — the identity/diff working set.
  let known
  try {
    known = await listProperties(sb, { area })
  } catch (e) {
    return { ok: false, error: `could not load existing properties: ${e.message}` }
  }
  let pnumHigh = await maxPnum(sb).catch(() => known.reduce((m, p) => Math.max(m, p.pnum || 0), 0))
  const byId = new Map(known.map((p) => [p.id, p]))

  // ── Discover across sources ──────────────────────────────────────────────
  const summaries = []
  for (const [name, cfgSrc] of Object.entries(cfg.sources ?? {})) {
    const adapter = ADAPTERS[name]
    if (!adapter || !cfgSrc?.searchUrl) { summary.sources[name] = 'skipped'; continue }
    try {
      const found = await adapter.discover(cfgSrc, { fetchFn })
      // 3-bed floor: keep to the brief; never store a listing below the min beds.
      const kept = found.filter((s) => s?.price != null && (s.bedrooms == null || s.bedrooms >= (cfg.minBedrooms ?? 0)))
      summaries.push(...kept)
      summary.sources[name] = kept.length
      await sleep(RUN_LIMITS.perRequestDelayMs)
    } catch (e) {
      summary.sources[name] = `error: ${e.message}`
      summary.errors.push(`discover ${name}: ${e.message}`)
    }
  }
  summary.discovered = summaries.length

  // ── Resolve identity + diff + store ──────────────────────────────────────
  // Track which properties are new / need enrichment this run.
  const needsEnrich = [] // { propertyId, url, source, existingBefore }
  for (const s of summaries) {
    try {
      // A known listing already maps to a property; otherwise resolve identity.
      const existingListing = await getListing(sb, `${s.source}:${s.source_listing_id}`)
      let propertyId, isNew, pnum
      if (existingListing?.property_id) {
        propertyId = existingListing.property_id; isNew = false; pnum = byId.get(propertyId)?.pnum
      } else {
        ({ propertyId, isNew, pnum } = resolveIdentity(s, known, pnumHigh))
        if (isNew) pnumHigh = pnum
      }

      const existing = byId.get(propertyId) ?? null
      const { events, patch } = computeMarketChanges(existing, s, { source: s.source })

      if (isNew && !existing) {
        const created = await createProperty(sb, {
          id: propertyId, pnum, area,
          address: s.address ?? null, postcode: s.postcode ?? null,
          lat: s.lat ?? null, lng: s.lng ?? null,
          bedrooms: s.bedrooms ?? null, bathrooms: s.bathrooms ?? null,
          house_type: s.house_type ?? null,
          listed_date: now.slice(0, 10),
          ...patch,
        })
        byId.set(propertyId, created)
        known.push(created)
        summary.newProperties++
      } else if (Object.keys(patch).length) {
        const updated = await updateProperty(sb, propertyId, patch)
        byId.set(propertyId, updated)
        summary.updatedProperties++
      }

      for (const ev of events) { await safeAppend(sb, propertyId, ev, s.source, now); summary.events++ }

      await upsertListing(sb, {
        id: `${s.source}:${s.source_listing_id}`,
        property_id: propertyId,
        source: s.source,
        source_listing_id: String(s.source_listing_id),
        url: s.url ?? null,
        price: s.price ?? null,
        status: s.status ?? null,
        agent: s.agent ?? null,
        last_seen: now,
        raw: s,
      })
      if (!existingListing && !isNew) {
        // A new portal for a house we already knew about.
        await safeAppend(sb, propertyId, { type: 'portal_added', to_val: s.source, detail: { source: s.source } }, s.source, now)
        summary.events++
      }

      const prop = byId.get(propertyId)
      if (s.url && (isNew || prop?.floor_area_sqft == null || prop?.lat == null)) {
        needsEnrich.push({ propertyId, url: s.url, source: s.source })
      }
    } catch (e) {
      summary.errors.push(`store ${s.source}:${s.source_listing_id}: ${e.message}`)
    }
  }

  // ── Enrich a bounded batch (new + still-missing first) ───────────────────
  const batch = needsEnrich.slice(0, RUN_LIMITS.maxDetailFetches)
  for (const item of batch) {
    try {
      const adapter = ADAPTERS[item.source]
      const before = byId.get(item.propertyId) ?? null
      const enriched = await adapter.enrich(item.url, { fetchFn })
      await sleep(RUN_LIMITS.perRequestDelayMs)
      if (!enriched || !Object.keys(enriched).length) continue

      // Geocode if we still lack coordinates and have a postcode.
      let coords = { lat: enriched.lat ?? before?.lat ?? null, lng: enriched.lng ?? before?.lng ?? null }
      const postcode = enriched.postcode ?? before?.postcode ?? null
      if ((coords.lat == null || coords.lng == null) && postcode) {
        const g = await geocodePostcode(postcode, { fetchFn })
        if (g) coords = g
      }

      const merged = { ...before, ...enriched, ...coords, postcode }
      const factors = computeFactors(merged)

      // Only patch columns that enrichment actually produced (don't null things out).
      const patch = {}
      for (const k of ['floor_area_sqft', 'floor_area_source', 'bathrooms', 'bedrooms', 'tenure',
        'epc', 'agent', 'house_type', 'parking', 'garage', 'plot_sqft']) {
        if (enriched[k] != null) patch[k === 'agent' ? 'primary_agent' : k] = enriched[k]
      }
      if (coords.lat != null) patch.lat = coords.lat
      if (coords.lng != null) patch.lng = coords.lng
      if (postcode) patch.postcode = postcode
      for (const [k, v] of Object.entries(factors)) if (v != null) patch[k] = v

      const faEv = floorAreaEvent(before, enriched, { source: item.source })
      if (Object.keys(patch).length) {
        const updated = await updateProperty(sb, item.propertyId, patch)
        byId.set(item.propertyId, updated)
        summary.enriched++
      }
      if (faEv) { await safeAppend(sb, item.propertyId, faEv, item.source, now); summary.events++ }
    } catch (e) {
      summary.errors.push(`enrich ${item.propertyId}: ${e.message}`)
    }
  }

  return summary
}
