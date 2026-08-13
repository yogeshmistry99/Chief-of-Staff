// Pure change-detection: compare what we already know about a property against a
// fresh observation and produce (a) the history events to append and (b) the
// column patch to apply. Recording the change rather than overwriting is the
// whole point — this is what turns the dataset into local market memory.

function num(v) { return v == null ? null : Number(v) }

// existing: the stored property row (or null for a brand-new property).
// incoming: a normalized listing summary { price, status, agent, ... }.
// Returns { events: [{type, from_val, to_val, detail}], patch: {...} }.
export function computeMarketChanges(existing, incoming, { source } = {}) {
  const events = []
  const patch = {}

  const newPrice = num(incoming?.price)
  const newStatus = incoming?.status ?? null
  const newAgent = incoming?.agent ?? null

  if (!existing) {
    // First time we've seen this house.
    if (newPrice != null) { patch.asking_price = newPrice; patch.first_seen_price = newPrice }
    if (newStatus) patch.status = newStatus
    if (newAgent) patch.primary_agent = newAgent
    events.push({ type: 'new_listing', from_val: null, to_val: newPrice != null ? String(newPrice) : null, detail: { source } })
    return { events, patch }
  }

  const oldPrice = num(existing.asking_price)
  if (newPrice != null && oldPrice != null && newPrice !== oldPrice) {
    patch.asking_price = newPrice
    events.push({
      type: newPrice < oldPrice ? 'reduced' : 'increased',
      from_val: String(oldPrice), to_val: String(newPrice), detail: { source },
    })
  } else if (newPrice != null && oldPrice == null) {
    patch.asking_price = newPrice
  }
  // Backfill first_seen_price if we never captured one.
  if (existing.first_seen_price == null && (patch.asking_price ?? oldPrice) != null) {
    patch.first_seen_price = patch.asking_price ?? oldPrice
  }

  if (newStatus && newStatus !== existing.status) {
    patch.status = newStatus
    if (newStatus === 'sold_stc') events.push({ type: 'sold_stc', from_val: existing.status, to_val: newStatus, detail: { source } })
    else if (newStatus === 'withdrawn') events.push({ type: 'withdrawn', from_val: existing.status, to_val: newStatus, detail: { source } })
    else if (existing.status === 'sold_stc' && newStatus === 'available') events.push({ type: 'relisted', from_val: existing.status, to_val: newStatus, detail: { source } })
    else events.push({ type: 'status_change', from_val: existing.status, to_val: newStatus, detail: { source } })
  }

  if (newAgent && newAgent !== existing.primary_agent) {
    patch.primary_agent = newAgent
    events.push({ type: 'agent_change', from_val: existing.primary_agent ?? null, to_val: newAgent, detail: { source } })
  }

  return { events, patch }
}

// After enrichment: if floor area appears for the first time, that is itself a
// noteworthy event (a listing gained a floorplan).
export function floorAreaEvent(existing, enriched, { source } = {}) {
  const had = existing?.floor_area_sqft != null
  const now = enriched?.floor_area_sqft != null
  if (!had && now) {
    return { type: 'floor_area_found', from_val: null, to_val: String(enriched.floor_area_sqft), detail: { source } }
  }
  return null
}
