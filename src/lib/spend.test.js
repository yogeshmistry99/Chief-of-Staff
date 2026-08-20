import { describe, it, expect } from 'vitest'
import { toGbpEstimate, fmtUsd, fmtGbpEstimate, USD_TO_GBP } from './spend'

describe('currency helpers', () => {
  it('estimates GBP from USD at the labelled rate', () => {
    expect(toGbpEstimate(100)).toBeCloseTo(100 * USD_TO_GBP, 6)
  })
  it('null-guards every formatter rather than printing NaN or 0', () => {
    expect(toGbpEstimate(null)).toBeNull()
    expect(toGbpEstimate(undefined)).toBeNull()
    expect(toGbpEstimate(NaN)).toBeNull()
    expect(fmtUsd(null)).toBeNull()
    expect(fmtGbpEstimate(null)).toBeNull()
  })
  it('formats USD with a dollar sign and two decimals', () => {
    expect(fmtUsd(14)).toBe('$14.00')
  })
  it('formats the GBP estimate with a pound sign and an approx marker', () => {
    expect(fmtGbpEstimate(100)).toMatch(/^≈ £/)
  })
})
