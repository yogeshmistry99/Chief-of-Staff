import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SpendCards, { SubscriptionCard } from './SpendCards'

// The two meters must stay distinct, the subscription card must never show a
// number/percentage, and missing billed data must degrade to a plain statement
// plus a clearly-labelled estimate — never a zero wearing the "billed" label.

const stubFetch = (payload) => {
  global.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve(payload) }))
}

const fullReport = {
  available: true,
  currency: 'USD',
  fetchedAt: '2026-08-20T09:00:00Z',
  month: '2026-08', daysInMonth: 31, dayOfMonth: 20,
  spend: { available: true, amountUsd: 14 },
  tokens: { available: true, uncachedInput: 1100, cacheRead: 9400, cacheWrite: 560, output: 2300 },
  cache: { available: true, estimated: true, cachedInputPct: 89.5, savingUsd: 0.0247 },
  byModel: [
    { model: 'sonnet', uncachedInput: 1000, cacheRead: 9000, cacheWrite: 500, output: 2000, estCostUsd: 0.05, estimated: true },
  ],
}

afterEach(() => { vi.restoreAllMocks() })

describe('SubscriptionCard (Meter 1)', () => {
  it('explains the mechanism, links out, and shows NO percentage or spend number', () => {
    const { container } = render(<SubscriptionCard />)
    expect(screen.getByText(/Claude subscription/)).toBeInTheDocument()
    expect(screen.getByText(/5-hour session/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Settings → Usage/ })).toBeInTheDocument()
    // The whole point: never a fabricated percentage.
    expect(container.textContent).not.toContain('%')
  })
})

describe('ApiSpendCard (Meter 2)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders billed USD with a labelled GBP estimate and the cache saving', async () => {
    stubFetch(fullReport)
    render(<SpendCards spendLimitUsd={25} localEstimateUsd={9} />)
    expect(await screen.findByText('$14.00')).toBeInTheDocument()
    // GBP is present but marked an estimate, never a bare pound figure.
    expect(screen.getByText(/≈ £/)).toBeInTheDocument()
    // Cache saving stays visible at the top.
    expect(screen.getByText(/saving ~/)).toBeInTheDocument()
    // Day-in-month context.
    expect(screen.getByText(/Day 20 of 31/)).toBeInTheDocument()
  })

  it('reveals the by-model breakdown and the honest per-surface note on tap', async () => {
    stubFetch(fullReport)
    render(<SpendCards spendLimitUsd={25} localEstimateUsd={9} />)
    fireEvent.click(await screen.findByRole('button', { name: /Breakdown by model/ }))
    expect(await screen.findByText('sonnet')).toBeInTheDocument()
    expect(screen.getByText(/Per-surface split/)).toBeInTheDocument()
  })

  it('says so plainly when the admin key is missing, and shows the labelled estimate', async () => {
    stubFetch({ available: false, reason: 'admin-key-missing' })
    render(<SpendCards spendLimitUsd={25} localEstimateUsd={9} />)
    expect(await screen.findByText(/ANTHROPIC_ADMIN_KEY/)).toBeInTheDocument()
    // The fallback is present but explicitly NOT the billed figure.
    expect(screen.getByText(/not billed/)).toBeInTheDocument()
    // And no $14-style billed headline is shown.
    expect(screen.queryByText('$14.00')).not.toBeInTheDocument()
  })

  it('keeps the token breakdown when only the spend figure drifts', async () => {
    stubFetch({
      ...fullReport,
      spend: { available: false },
    })
    render(<SpendCards spendLimitUsd={25} localEstimateUsd={9} />)
    expect(await screen.findByText(/billed spend is unavailable/i)).toBeInTheDocument()
    // Cache section still renders from the (available) token data.
    expect(screen.getByText(/saving ~/)).toBeInTheDocument()
  })
})
