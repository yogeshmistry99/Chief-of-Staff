import { describe, it, expect } from 'vitest'
import { ringBand, RING_BANDS } from './ringBands'

// The colour is a second reading of `position` — the same number the arc's length
// encodes. These tests pin the boundaries, the honest null, and the rule that the
// palette carries no alarm colour.

describe('ringBand', () => {
  it('grades low, typical and strong across the range', () => {
    expect(ringBand(0).key).toBe('low')
    expect(ringBand(0.2).key).toBe('low')
    expect(ringBand(0.5).key).toBe('typical')
    expect(ringBand(0.9).key).toBe('strong')
    expect(ringBand(1).key).toBe('strong')
  })

  it('puts the boundaries where the thirds are', () => {
    expect(ringBand(0.33).key).toBe('low')
    expect(ringBand(0.34).key).toBe('typical')
    expect(ringBand(0.66).key).toBe('typical')
    expect(ringBand(0.67).key).toBe('strong')
  })

  it('is null when there is no position to place — no baseline, no grade', () => {
    // A hue here would imply a comparison that was never made.
    for (const bad of [null, undefined, NaN, Infinity, 'high']) {
      expect(ringBand(bad)).toBeNull()
    }
  })

  it('clamps rather than falling off either end', () => {
    expect(ringBand(-0.5).key).toBe('low')
    expect(ringBand(2).key).toBe('strong')
  })

  it('gives every band a gradient pair and a spoken label', () => {
    for (const b of RING_BANDS) {
      expect(b.from).toMatch(/^#[0-9a-f]{6}$/i)
      expect(b.to).toMatch(/^#[0-9a-f]{6}$/i)
      expect(b.label).toBeTruthy()
    }
  })

  it('carries no alarm colour — a short night is not a failure', () => {
    // Whoop grades down to red. This app shares a codebase with a symptom diary
    // and avoids shame mechanics, so the low end is a calm blue.
    expect(ringBand(0).color).toBe('#00639B')
    const reds = RING_BANDS.filter((b) => /^#[cd][0-9a-f]{5}$/i.test(b.color))
    expect(reds).toHaveLength(0)
  })

  it('keeps the brand purple for an ordinary day', () => {
    // A typical reading should look exactly as the rings always have.
    expect(ringBand(0.5).color).toBe('#6750A4')
  })
})
