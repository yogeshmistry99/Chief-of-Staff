import { priceFor, costOf, bucketOf } from './pricing.js'

// Pure summarisation of Anthropic's Admin Usage & Cost reports.
//
// Separated from the HTTP call in api/status.js so the one thing that must not
// go wrong — turning a beta, changeable API payload into numbers — is testable
// without a network or an admin key.
//
// THE GOVERNING RULE (the cost endpoints are beta): an unexpected shape degrades
// that section to `available: false`, never to a wrong number. A section is only
// `available: true` when the payload was recognisably parsed. A genuinely empty
// month (fetch succeeded, no rows) is a real zero and stays available; a payload
// with rows we could not read is drift and becomes unavailable. The two are
// distinguished by "rows present but none parsed".
//
// The ONE authoritative figure is the billed spend from the cost report. Every
// per-model cost and the cache saving are DERIVED from token counts × list
// prices (pricing.js) and are marked `estimated: true` — the tokens are real,
// the money attached to them is an estimate, and the UI says so.

// First instant of the current UTC month, plus month framing for the header.
export function monthWindow(now = new Date()) {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  return {
    startingAt: new Date(Date.UTC(y, m, 1, 0, 0, 0)).toISOString(),
    month: `${y}-${String(m + 1).padStart(2, '0')}`,
    daysInMonth: new Date(Date.UTC(y, m + 1, 0)).getUTCDate(),
    dayOfMonth: now.getUTCDate(),
  }
}

// Turn the per-request HTTP outcomes into a single honest reason for the card,
// so an auth failure never masquerades as a schema problem. `outcomes` is a list
// of { status } / { error } — one per report request.
//   401 / 403 → the admin key was reached but rejected or unauthorised
//   any other non-2xx → a plain http error carrying the status
//   a thrown request (network/timeout) with no status → 'network'
// Returns null when every request was a 2xx, i.e. nothing to explain.
export function httpFailureReason(outcomes = []) {
  let httpStatus = null
  let networked = false
  for (const o of outcomes) {
    if (o?.status == null) { if (o?.error) networked = true; continue }
    if (o.status === 401 || o.status === 403) return 'admin-key-rejected'
    if (o.status < 200 || o.status >= 300) httpStatus = httpStatus ?? o.status
  }
  if (httpStatus != null) return `http-${httpStatus}`
  if (networked) return 'network'
  return null
}

// A finite number or null — the guard every extraction passes through. A string
// decimal ("12.34", how the cost report renders money) is accepted; anything
// non-finite (undefined, null, NaN, "", {}) becomes null and is skipped, never 0.
function num(v) {
  if (v == null) return null
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : null
}

// Flatten data[].results[] out of the report envelope, tolerant of the metric
// sitting either under `results` or directly on the bucket.
function resultRows(json) {
  const data = Array.isArray(json?.data) ? json.data : []
  const rows = []
  for (const bucket of data) {
    if (Array.isArray(bucket?.results)) {
      for (const r of bucket.results) if (r && typeof r === 'object') rows.push(r)
    } else if (bucket && typeof bucket === 'object') {
      rows.push(bucket)
    }
  }
  return rows
}

// Sum billed cost (USD) from the cost report. `json` is the parsed payload, or
// null when the HTTP fetch itself failed.
export function sumCost(json) {
  if (!json || typeof json !== 'object') return { available: false }
  const rows = resultRows(json)
  const byDescription = {}
  let total = 0
  let parsed = 0
  for (const r of rows) {
    const amt = num(r.amount)
    const currency = String(r.currency ?? 'USD').toUpperCase()
    // Never mix currencies into one total — a non-USD line is dropped, not summed.
    if (amt == null || currency !== 'USD') continue
    total += amt
    parsed += 1
    const d = typeof r.description === 'string' ? r.description : null
    if (d) byDescription[d] = (byDescription[d] ?? 0) + amt
  }
  // Rows present but none parseable ⇒ the shape moved ⇒ unavailable, not $0.
  if (rows.length > 0 && parsed === 0) return { available: false, reason: 'unrecognized-cost-shape' }
  return { available: true, amountUsd: total, byDescription }
}

// Read the four token dimensions off one usage row, tolerating the field-name
// variants the usage report has shipped. Returns null when a row yields none of
// them, so the caller can tell drift (rows, no tokens) from an empty month.
function readTokens(r) {
  if (!r || typeof r !== 'object') return null
  const uncachedInput = num(r.uncached_input_tokens) ?? num(r.input_tokens)
  const cacheRead = num(r.cache_read_input_tokens)
  let cacheWrite = num(r.cache_creation_input_tokens)
  if (cacheWrite == null && r.cache_creation && typeof r.cache_creation === 'object') {
    const a = num(r.cache_creation.ephemeral_5m_input_tokens) ?? 0
    const b = num(r.cache_creation.ephemeral_1h_input_tokens) ?? 0
    cacheWrite = a + b
  }
  const output = num(r.output_tokens)
  if (uncachedInput == null && cacheRead == null && cacheWrite == null && output == null) return null
  return {
    uncachedInput: uncachedInput ?? 0,
    cacheRead: cacheRead ?? 0,
    cacheWrite: cacheWrite ?? 0,
    output: output ?? 0,
    model: typeof r.model === 'string' ? r.model : null,
  }
}

// Aggregate the usage report into totals and per-model (haiku/sonnet) buckets.
export function aggregateUsage(json) {
  if (!json || typeof json !== 'object') return { available: false }
  const rows = resultRows(json)
  const totals = { uncachedInput: 0, cacheRead: 0, cacheWrite: 0, output: 0 }
  const byModel = {}
  let read = 0
  for (const r of rows) {
    const t = readTokens(r)
    if (!t) continue
    read += 1
    totals.uncachedInput += t.uncachedInput
    totals.cacheRead += t.cacheRead
    totals.cacheWrite += t.cacheWrite
    totals.output += t.output
    const key = bucketOf(t.model ?? '')
    const bm = byModel[key] ?? (byModel[key] = { uncachedInput: 0, cacheRead: 0, cacheWrite: 0, output: 0 })
    bm.uncachedInput += t.uncachedInput
    bm.cacheRead += t.cacheRead
    bm.cacheWrite += t.cacheWrite
    bm.output += t.output
  }
  if (rows.length > 0 && read === 0) return { available: false, reason: 'unrecognized-usage-shape' }
  return { available: true, totals, byModel }
}

// Combine the two reports into the shape the client renders. Each section
// (spend / tokens / cache / byModel) carries its own availability, so a good
// spend figure still shows when the token breakdown drifts, and vice versa.
export function summarise({ cost, usage } = {}, now = new Date()) {
  const win = monthWindow(now)
  const c = sumCost(cost)
  const u = aggregateUsage(usage)

  const spend = c.available ? { available: true, amountUsd: c.amountUsd } : { available: false }

  let tokens = { available: false }
  let cache = { available: false }
  let byModel = []

  if (u.available) {
    tokens = { available: true, ...u.totals }

    // Cache saving = what the cache-read tokens would have cost at full input
    // price, minus what they cost at the cache-read price — per model, so each
    // uses its own rate. Estimated from list prices; the tokens are real.
    let savingUsd = 0
    for (const [key, t] of Object.entries(u.byModel)) {
      const p = priceFor(key)
      savingUsd += (t.cacheRead / 1_000_000) * (p.in - p.cacheRead)
    }
    const inputTotal = u.totals.uncachedInput + u.totals.cacheRead
    cache = {
      available: true,
      estimated: true,
      cachedInputPct: inputTotal > 0 ? (u.totals.cacheRead / inputTotal) * 100 : null,
      savingUsd,
    }

    byModel = Object.entries(u.byModel).map(([key, t]) => ({
      model: key,
      ...t,
      estimated: true,
      estCostUsd: costOf(key, {
        input: t.uncachedInput, output: t.output, cacheWrite: t.cacheWrite, cacheRead: t.cacheRead,
      }),
    }))
  }

  return {
    month: win.month,
    daysInMonth: win.daysInMonth,
    dayOfMonth: win.dayOfMonth,
    spend,
    tokens,
    cache,
    byModel,
  }
}
