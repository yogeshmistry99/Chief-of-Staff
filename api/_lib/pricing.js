// Anthropic model pricing — single source of truth for cost estimation.
// Rates are USD per 1,000,000 tokens, verified against the live pricing page
// on 2026-07-26 (https://platform.claude.com/docs/en/about-claude/pricing).
//
//   cacheWrite = 5-minute cache write (1.25x base input); the app sends the
//                `prompt-caching-2024-07-31` beta, whose default TTL is 5 min.
//   cacheRead  = cache hit (0.1x base input).
//
// Add new models here as they are adopted. Unknown models fall back to the
// most expensive known entry (see priceFor) so spend is never under-estimated.
const PRICES = {
  haiku:  { in: 1.00, out: 5.00,  cacheWrite: 1.25, cacheRead: 0.10 }, // Claude Haiku 4.5 (default model)
  sonnet: { in: 3.00, out: 15.00, cacheWrite: 3.75, cacheRead: 0.30 }, // Claude Sonnet 4.6
}

// Map a model id (e.g. "claude-haiku-4-5-20251001", "claude-sonnet-4-6") to a
// price row. Unknown ids fall back to the most expensive row (sonnet) so a
// newly-adopted model can never silently under-price.
export function priceFor(model = '') {
  const id = String(model).toLowerCase()
  if (id.includes('haiku'))  return PRICES.haiku
  if (id.includes('sonnet')) return PRICES.sonnet
  return PRICES.sonnet
}

// Normalized bucket name for per-model breakdown storage ('haiku' | 'sonnet').
export function bucketOf(model = '') {
  const id = String(model).toLowerCase()
  return id.includes('sonnet') ? 'sonnet' : 'haiku'
}

// Dollar cost of a single call's token usage.
export function costOf(model, { input = 0, output = 0, cacheWrite = 0, cacheRead = 0 } = {}) {
  const p = priceFor(model)
  return (input      / 1_000_000) * p.in
       + (output     / 1_000_000) * p.out
       + (cacheWrite / 1_000_000) * p.cacheWrite
       + (cacheRead  / 1_000_000) * p.cacheRead
}

export { PRICES }
