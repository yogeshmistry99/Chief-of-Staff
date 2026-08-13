import { supabase } from './supabase'
import {
  listProperties, getProperty, updateProperty,
  listingsForProperty, eventsForProperty,
} from '../../api/_lib/propertiesRepo.js'

// Property persistence for the browser. Mirrors taskCache.js.
//
// Reads go straight to Supabase via the anon client (RLS allow-all), so there is
// no serverless endpoint in the read path — no tokens, no function-cap pressure.
// localStorage is a READ-ONLY display cache for instant paint only, never a write
// source. Writes (decision state, notes, manual overrides) go through
// propertiesRepo.js as partial, single-row UPDATEs.

const CACHE_KEY = 'property_cache'

// ─── Change bus ────────────────────────────────────────────────────────────────
const _listeners = new Set()
export function onPropertiesChanged(fn) { _listeners.add(fn); return () => _listeners.delete(fn) }
function notifyChanged() { _listeners.forEach((fn) => { try { fn() } catch {} }) }

// ─── Display cache ───────────────────────────────────────────────────────────────
export function peekCachedProperties() {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch { return [] }
}
function writeCache(props) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(props)) } catch {}
}
function patchCache(prop) {
  if (!prop?.id) return
  const cur = peekCachedProperties()
  const i = cur.findIndex((p) => p.id === prop.id)
  if (i === -1) cur.push(prop); else cur[i] = prop
  writeCache(cur)
}

// ─── Reads ────────────────────────────────────────────────────────────────────────
export async function readPropertiesFromSupabase() {
  if (!supabase) return null
  try {
    const props = await listProperties(supabase)
    writeCache(props)
    return props
  } catch (e) {
    console.warn('property read failed', e)
    return null
  }
}
export async function readProperty(id) { return supabase ? getProperty(supabase, id) : null }
export async function readListings(id) { return supabase ? listingsForProperty(supabase, id) : [] }
export async function readEvents(id) { return supabase ? eventsForProperty(supabase, id) : [] }

// Recent events across all properties (for the dashboard "new / reduced this week").
export async function readRecentEvents(sinceIso) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('property_events').select('id, property_id, type, occurred_at')
    .gte('occurred_at', sinceIso)
  if (error) { console.warn('recent events read failed', error.message); return [] }
  return data ?? []
}

// ─── Writes — one property, one row, loud on failure ──────────────────────────────
export async function updatePropertyRow(id, patch) {
  const saved = await updateProperty(supabase, id, patch)
  patchCache(saved)
  notifyChanged()
  return saved
}

// Set decision state (+ stamp decided_at) in one call.
export async function setDecision(id, decision_state) {
  return updatePropertyRow(id, { decision_state, decided_at: new Date().toISOString() })
}
