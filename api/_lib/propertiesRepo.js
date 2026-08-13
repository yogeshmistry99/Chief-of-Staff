// The ONLY module that touches property storage.
//
// Modelled directly on api/_lib/tasksRepo.js and it inherits the same three
// non-negotiable properties — do not erode them:
//
//   1. A write touches ONE row and only the columns it changes. Updates are
//      partial UPDATEs (patchToRow), never whole-row upserts — so a scrape run
//      refreshing market fields and a person editing their decision/notes never
//      clobber each other.
//   2. Every operation checks BOTH the error and the rows actually affected and
//      throws when a write didn't land. Nothing reports success it hasn't verified.
//   3. Deletes are soft. Every read filters deleted_at IS NULL, so a removed
//      property never surfaces but its row (and its market history) survives.
//
// Takes an injected Supabase client so the browser (anon key) and the serverless
// ingest endpoint share identical semantics — there is no server gateway, because
// api/*.js is at the 12/12 Vercel Hobby function cap.
//
// Unlike tasksRepo there is no legacy blob shape to preserve, so the object shape
// IS the row shape (snake_case column names). rowToProperty only normalises types.

// ─── Column lists ──────────────────────────────────────────────────────────────
const PROP_COLS = [
  'id', 'pnum', 'area', 'address', 'postcode', 'lat', 'lng',
  'bedrooms', 'bathrooms', 'floor_area_sqft', 'house_type', 'tenure',
  'parking', 'garage', 'garden', 'plot_sqft', 'epc', 'council_tax',
  'nearest_school_m', 'nearest_station_m', 'extension_potential',
  'asking_price', 'first_seen_price', 'status', 'primary_agent', 'listed_date',
  'floor_area_source', 'data_quality',
  'decision_state', 'notes', 'decided_at',
  'created_at', 'updated_at',
].join(', ')

const LISTING_COLS = [
  'id', 'property_id', 'source', 'source_listing_id', 'url', 'price', 'status',
  'agent', 'first_seen', 'last_seen', 'raw', 'created_at', 'updated_at',
].join(', ')

const EVENT_COLS = [
  'id', 'property_id', 'type', 'from_val', 'to_val', 'source', 'occurred_at', 'detail', 'created_at',
].join(', ')

// Columns a partial patch is ALLOWED to set. id/pnum/created_at/updated_at are
// never patchable. This whitelist is the anti-clobber boundary.
const PATCHABLE = new Set([
  'area', 'address', 'postcode', 'lat', 'lng',
  'bedrooms', 'bathrooms', 'floor_area_sqft', 'house_type', 'tenure',
  'parking', 'garage', 'garden', 'plot_sqft', 'epc', 'council_tax',
  'nearest_school_m', 'nearest_station_m', 'extension_potential',
  'asking_price', 'first_seen_price', 'status', 'primary_agent', 'listed_date',
  'floor_area_source', 'data_quality',
  'decision_state', 'notes', 'decided_at',
])

// Full column set for INSERT (id + pnum required; the rest optional).
const INSERTABLE = ['id', 'pnum', ...PATCHABLE]

// ─── Shape mapping ──────────────────────────────────────────────────────────────
export function rowToProperty(row) {
  if (!row) return null
  return { ...row } // object shape == row shape; kept as a seam for future coercion
}

export function propertyToRow(p) {
  const row = {}
  for (const k of INSERTABLE) {
    if (Object.prototype.hasOwnProperty.call(p, k)) row[k] = p[k]
  }
  row.id = p.id
  row.pnum = p.pnum
  return row
}

// Partial patch → column patch. Only whitelisted keys actually present are
// emitted, so an UPDATE never overwrites a field the caller didn't mean to touch.
export function patchToRow(patch) {
  const row = {}
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (PATCHABLE.has(k)) row[k] = v
  }
  return row
}

// ─── Failure handling ────────────────────────────────────────────────────────────
function fail(op, error) {
  throw new Error(`properties.${op} failed: ${error?.message ?? String(error)}`)
}
function requireClient(sb) {
  if (!sb) throw new Error('properties: Supabase client not configured')
}

// ─── Reads (every read filters deleted_at IS NULL) ───────────────────────────────
export async function listProperties(sb, {
  area = null, status = null, decision = null, maxPrice = null, includeUnavailable = true,
} = {}) {
  requireClient(sb)
  let q = sb.from('properties').select(PROP_COLS).is('deleted_at', null)
  if (area) q = q.eq('area', area)
  if (status) q = q.eq('status', status)
  if (decision) q = q.eq('decision_state', decision)
  if (maxPrice != null) q = q.lte('asking_price', maxPrice)
  if (!includeUnavailable) q = q.eq('status', 'available')
  const { data, error } = await q
  if (error) fail('list', error)
  return (data ?? []).map(rowToProperty)
}

export async function getProperty(sb, id) {
  requireClient(sb)
  if (!id) throw new Error('properties.get: id is required')
  const { data, error } = await sb
    .from('properties').select(PROP_COLS).eq('id', id).is('deleted_at', null).maybeSingle()
  if (error) fail('get', error)
  return rowToProperty(data)
}

// Highest pnum across ALL rows (incl. soft-deleted) — identity is permanent, so
// numbers are never reused. 0 when the table is empty.
export async function maxPnum(sb) {
  requireClient(sb)
  const { data, error } = await sb
    .from('properties').select('pnum').order('pnum', { ascending: false }).limit(1)
  if (error) fail('maxPnum', error)
  return data?.[0]?.pnum ?? 0
}

// ─── Writes ───────────────────────────────────────────────────────────────────────
export async function createProperty(sb, property) {
  requireClient(sb)
  if (!property?.id) throw new Error('properties.create: id is required')
  if (!(property?.pnum > 0)) throw new Error('properties.create: positive pnum is required')
  const { data, error } = await sb
    .from('properties').insert(propertyToRow(property)).select(PROP_COLS).single()
  if (error) fail('create', error)
  if (!data) throw new Error('properties.create: insert returned no row — NOT saved')
  return rowToProperty(data)
}

export async function updateProperty(sb, id, patch) {
  requireClient(sb)
  if (!id) throw new Error('properties.update: id is required')
  const row = patchToRow(patch ?? {})
  if (!Object.keys(row).length) return getProperty(sb, id)
  const { data, error } = await sb
    .from('properties').update(row).eq('id', id).is('deleted_at', null).select(PROP_COLS)
  if (error) fail('update', error)
  if (!data?.length) throw new Error(`properties.update: no live property with id ${id} — nothing was saved`)
  return rowToProperty(data[0])
}

export async function softDeleteProperty(sb, id) {
  requireClient(sb)
  if (!id) throw new Error('properties.delete: id is required')
  const { data, error } = await sb
    .from('properties').update({ deleted_at: new Date().toISOString() })
    .eq('id', id).is('deleted_at', null).select('id')
  if (error) fail('delete', error)
  if (!data?.length) throw new Error(`properties.delete: no live property with id ${id} — nothing was deleted`)
  return { id, deleted: true }
}

// ─── Listings ─────────────────────────────────────────────────────────────────────
export async function listingsForProperty(sb, propertyId) {
  requireClient(sb)
  const { data, error } = await sb
    .from('property_listings').select(LISTING_COLS)
    .eq('property_id', propertyId).is('deleted_at', null)
  if (error) fail('listings', error)
  return data ?? []
}

export async function getListing(sb, id) {
  requireClient(sb)
  const { data, error } = await sb
    .from('property_listings').select(LISTING_COLS).eq('id', id).maybeSingle()
  if (error) fail('getListing', error)
  return data ?? null
}

// Insert-or-update a listing by its stable id ({source}:{source_listing_id}).
// last_seen always advances; a full upsert here is safe because a listing row is
// owned by one source and rewritten wholesale on each scrape.
export async function upsertListing(sb, listing) {
  requireClient(sb)
  if (!listing?.id) throw new Error('listings.upsert: id is required')
  if (!listing?.property_id) throw new Error('listings.upsert: property_id is required')
  const row = { ...listing, last_seen: listing.last_seen ?? new Date().toISOString() }
  const { data, error } = await sb
    .from('property_listings').upsert(row, { onConflict: 'id' }).select(LISTING_COLS).single()
  if (error) fail('upsertListing', error)
  if (!data) throw new Error('listings.upsert: no row returned — NOT saved')
  return data
}

// ─── Events (append-only history) ──────────────────────────────────────────────
export async function appendEvent(sb, event) {
  requireClient(sb)
  if (!event?.id) throw new Error('events.append: id is required')
  if (!event?.property_id) throw new Error('events.append: property_id is required')
  if (!event?.type) throw new Error('events.append: type is required')
  const { data, error } = await sb
    .from('property_events').insert(event).select(EVENT_COLS).single()
  if (error) fail('appendEvent', error)
  if (!data) throw new Error('events.append: no row returned — NOT saved')
  return data
}

export async function eventsForProperty(sb, propertyId) {
  requireClient(sb)
  const { data, error } = await sb
    .from('property_events').select(EVENT_COLS)
    .eq('property_id', propertyId).order('occurred_at', { ascending: false })
  if (error) fail('events', error)
  return data ?? []
}

export const _internal = { PROP_COLS, LISTING_COLS, EVENT_COLS, PATCHABLE, INSERTABLE }
