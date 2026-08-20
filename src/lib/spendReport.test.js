import { describe, it, expect } from 'vitest'
import {
  monthWindow, sumCost, aggregateUsage, summarise, httpFailureReason,
} from '../../api/_lib/spendReport.js'

// The beta-schema contract: a recognisable payload parses; an empty month is a
// real zero; a payload whose shape moved degrades to unavailable, never to a
// wrong number.

const usageJson = {
  data: [{
    starting_at: '2026-08-01T00:00:00Z',
    results: [
      { model: 'claude-sonnet-4-6', uncached_input_tokens: 1000, cache_read_input_tokens: 9000, cache_creation_input_tokens: 500, output_tokens: 2000 },
      // Field-name variants: input_tokens (not uncached_*) and the nested
      // cache_creation object rather than a flat number.
      { model: 'claude-haiku-4-5', input_tokens: 100, cache_read_input_tokens: 400, cache_creation: { ephemeral_5m_input_tokens: 50, ephemeral_1h_input_tokens: 10 }, output_tokens: 300 },
    ],
  }],
}

const costJson = {
  data: [{
    results: [
      { currency: 'USD', amount: '12.34', description: 'Claude Sonnet Input Tokens' },
      { currency: 'USD', amount: '1.66', description: 'Claude Haiku Output Tokens' },
    ],
  }],
}

describe('monthWindow', () => {
  it('starts at the first instant of the UTC month and frames the days', () => {
    const w = monthWindow(new Date('2026-08-20T09:00:00Z'))
    expect(w.startingAt).toBe('2026-08-01T00:00:00.000Z')
    expect(w.month).toBe('2026-08')
    expect(w.daysInMonth).toBe(31)
    expect(w.dayOfMonth).toBe(20)
  })
})

describe('httpFailureReason', () => {
  it('flags a rejected key on 401 or 403 — never as a schema problem', () => {
    expect(httpFailureReason([{ path: 'cost_report', status: 401 }, { path: 'usage', status: 401 }])).toBe('admin-key-rejected')
    expect(httpFailureReason([{ path: 'cost_report', status: 200 }, { path: 'usage', status: 403 }])).toBe('admin-key-rejected')
  })
  it('reports other non-2xx by status, and a thrown request as network', () => {
    expect(httpFailureReason([{ status: 500 }])).toBe('http-500')
    expect(httpFailureReason([{ path: 'x', error: 'aborted' }])).toBe('network')
  })
  it('is null when every request was a 2xx', () => {
    expect(httpFailureReason([{ status: 200 }, { status: 200 }])).toBeNull()
    expect(httpFailureReason([])).toBeNull()
  })
})

describe('sumCost', () => {
  it('sums USD amounts and groups by description', () => {
    const c = sumCost(costJson)
    expect(c.available).toBe(true)
    expect(c.amountUsd).toBeCloseTo(14.0, 6)
    expect(c.byDescription['Claude Sonnet Input Tokens']).toBeCloseTo(12.34, 6)
  })
  it('treats a fetch failure (null) as unavailable, not $0', () => {
    expect(sumCost(null).available).toBe(false)
  })
  it('treats an empty month as a real zero', () => {
    const c = sumCost({ data: [] })
    expect(c.available).toBe(true)
    expect(c.amountUsd).toBe(0)
  })
  it('degrades to unavailable when rows are present but unparseable (drift)', () => {
    const c = sumCost({ data: [{ results: [{ description: 'x', total: 5 }] }] })
    expect(c.available).toBe(false)
  })
})

describe('aggregateUsage', () => {
  it('sums the four token dimensions across field-name variants', () => {
    const u = aggregateUsage(usageJson)
    expect(u.available).toBe(true)
    expect(u.totals.uncachedInput).toBe(1100)
    expect(u.totals.cacheRead).toBe(9400)
    expect(u.totals.cacheWrite).toBe(560) // 500 + (50 + 10)
    expect(u.totals.output).toBe(2300)
    expect(u.byModel.sonnet.cacheRead).toBe(9000)
    expect(u.byModel.haiku.cacheWrite).toBe(60)
  })
  it('null is unavailable; an empty month is an available zero', () => {
    expect(aggregateUsage(null).available).toBe(false)
    const empty = aggregateUsage({ data: [] })
    expect(empty.available).toBe(true)
    expect(empty.totals.output).toBe(0)
  })
  it('degrades to unavailable when no row yields any known token field', () => {
    const u = aggregateUsage({ data: [{ results: [{ foo: 1, bar: 2 }] }] })
    expect(u.available).toBe(false)
  })
})

describe('summarise', () => {
  it('combines both reports: real spend, real tokens, estimated saving and per-model cost', () => {
    const s = summarise({ cost: costJson, usage: usageJson }, new Date('2026-08-20T00:00:00Z'))
    expect(s.spend.available).toBe(true)
    expect(s.spend.amountUsd).toBeCloseTo(14.0, 6)
    expect(s.tokens.available).toBe(true)
    // Saving = sonnet 9000×(3.00−0.30) + haiku 400×(1.00−0.10), per 1M.
    expect(s.cache.available).toBe(true)
    expect(s.cache.savingUsd).toBeCloseTo(0.02466, 5)
    expect(s.cache.cachedInputPct).toBeCloseTo((9400 / 10500) * 100, 4)
    expect(s.cache.estimated).toBe(true)
    const sonnet = s.byModel.find((m) => m.model === 'sonnet')
    expect(sonnet.estimated).toBe(true)
    expect(sonnet.estCostUsd).toBeGreaterThan(0)
  })

  it('keeps section availability independent — good spend survives token drift', () => {
    const s = summarise(
      { cost: costJson, usage: { data: [{ results: [{ nope: 1 }] }] } },
      new Date('2026-08-20T00:00:00Z'),
    )
    expect(s.spend.available).toBe(true)   // cost parsed fine
    expect(s.tokens.available).toBe(false) // usage drifted
    expect(s.cache.available).toBe(false)
    expect(s.byModel).toEqual([])
  })

  it('reports spend unavailable when only the cost report fails', () => {
    const s = summarise({ cost: null, usage: usageJson }, new Date('2026-08-20T00:00:00Z'))
    expect(s.spend.available).toBe(false)
    expect(s.tokens.available).toBe(true) // token breakdown still shows
  })
})
