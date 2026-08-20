// Client side of the cost dashboard. There is NO admin key here — the browser
// calls our own /api/status?report=cost, which holds the key server-side and
// returns only numbers. Nothing in this file, or anything it imports, touches a
// credential.

// Anthropic bills in USD. We show USD as the real figure and a GBP figure only
// as a clearly-labelled ESTIMATE — there is no FX source in this app (fetching
// one would add a network call the build forbids, and a hidden hardcoded rate is
// exactly the "silently wrong number" this dashboard exists to avoid). So the
// rate is a visible constant, updated by hand, and every GBP value is captioned
// with it. USD stays authoritative.
export const USD_TO_GBP = 0.79
export const GBP_RATE_NOTE = 'est. at ~$1.27 / £1'

export function toGbpEstimate(usd) {
  if (usd == null || !Number.isFinite(usd)) return null
  return usd * USD_TO_GBP
}

// Fetch the billed-spend report. Resolves with the endpoint's JSON, or a plain
// unavailable object on any network/parse failure — the card renders "unavailable"
// rather than throwing or blanking.
export async function fetchSpendReport() {
  try {
    const res = await fetch('/api/status?report=cost')
    const data = await res.json().catch(() => null)
    if (!data || typeof data !== 'object') return { available: false, reason: 'bad-response' }
    return data
  } catch {
    return { available: false, reason: 'network' }
  }
}

export function fmtUsd(n) {
  if (n == null || !Number.isFinite(n)) return null
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtGbpEstimate(usd) {
  const g = toGbpEstimate(usd)
  if (g == null) return null
  return `≈ £${g.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
