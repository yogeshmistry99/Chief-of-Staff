import { describe, it, expect } from 'vitest'
import { fitModel, opportunities, marketStats, redFlags, DEFAULT_BUDGET } from './propertyModel'

// Build a dataset whose price is an EXACT linear function so we can assert the
// recovered coefficients. price = 100000 + 300·area + 20000·parking.
function synth() {
  const rows = [
    { area: 800, parking: false }, { area: 900, parking: true },
    { area: 1000, parking: false }, { area: 1100, parking: true },
    { area: 1200, parking: false }, { area: 1300, parking: true },
  ]
  return rows.map((r, i) => ({
    id: `P${i + 1}`, status: 'available',
    floor_area_sqft: r.area, parking: r.parking,
    asking_price: 100000 + 300 * r.area + 20000 * (r.parking ? 1 : 0),
  }))
}

describe('fitModel', () => {
  it('recovers the floor-area coefficient with R²≈1 on pure-linear data', () => {
    // price = 120000 + 350·area, no other factor → floor-area-only fit is exact.
    const pure = [800, 900, 1000, 1100, 1200, 1300].map((a, i) => ({
      id: `P${i + 1}`, status: 'available', floor_area_sqft: a, asking_price: 120000 + 350 * a,
    }))
    const m = fitModel(pure, [])
    expect(m.ok).toBe(true)
    expect(m.r2).toBeGreaterThan(0.999)
    expect(m.coefficients.find((c) => c.id === 'floor_area').coef).toBeCloseTo(350, 0)
    expect(m.intercept).toBeCloseTo(120000, 0)
  })

  it('recovers the parking premium when the parking factor is enabled', () => {
    const m = fitModel(synth(), ['parking'])
    expect(m.ok).toBe(true)
    expect(m.r2).toBeGreaterThan(0.999)
    const area = m.coefficients.find((c) => c.id === 'floor_area').coef
    const park = m.coefficients.find((c) => c.id === 'parking').coef
    expect(area).toBeCloseTo(300, 0)
    expect(park).toBeCloseTo(20000, 0)
    expect(m.intercept).toBeCloseTo(100000, 0)
  })

  it('reports insufficient data rather than fitting with too few rows', () => {
    const m = fitModel(synth().slice(0, 2), ['parking', 'garage'])
    expect(m.ok).toBe(false)
    expect(m.insufficient).toBe(true)
    // still returns scored rows (with null expected) so the UI can render points
    expect(Array.isArray(m.scored)).toBe(true)
  })

  it('never guesses: a property missing floor area gets a null expected', () => {
    const data = [...synth(), { id: 'Px', status: 'available', floor_area_sqft: null, asking_price: 400000 }]
    const m = fitModel(data, [])
    const px = m.scored.find((p) => p.id === 'Px')
    expect(px.expected).toBeNull()
    expect(px.pctBelow).toBeNull()
  })
})

describe('opportunities', () => {
  it('buckets by position vs model, budget and status', () => {
    const scored = [
      { id: 'A', status: 'available', asking_price: 400000, pctBelow: -0.12, tenure: 'Freehold', floor_area_sqft: 1000 },
      { id: 'B', status: 'available', asking_price: 400000, pctBelow: -0.12, tenure: 'Leasehold', floor_area_sqft: 1000 },
      { id: 'C', status: 'sold_stc',  asking_price: 400000, pctBelow: -0.20, tenure: 'Freehold', floor_area_sqft: 1000 },
      { id: 'D', status: 'available', asking_price: 500000, pctBelow: -0.15, tenure: 'Freehold', floor_area_sqft: 1000 },
      { id: 'E', status: 'available', asking_price: 400000, pctBelow: 0.02,  tenure: 'Freehold', floor_area_sqft: 1000 },
    ]
    const o = opportunities(scored, { budget: 450000, threshold: 0.05 })
    expect(o.high.map((p) => p.id)).toContain('A')     // clean, in budget, below
    expect(o.investigate.map((p) => p.id)).toContain('B') // below but leasehold flag
    expect(o.evidence.map((p) => p.id)).toContain('C')  // sold-STC market evidence
    expect(o.high.map((p) => p.id)).not.toContain('D')  // over budget
    expect(o.high.map((p) => p.id)).not.toContain('E')  // not below model
  })
})

describe('redFlags', () => {
  it('flags leasehold and missing floor area', () => {
    expect(redFlags({ tenure: 'Leasehold', floor_area_sqft: 900 })).toContain('Leasehold')
    expect(redFlags({ tenure: 'Freehold', floor_area_sqft: null })).toContain('No floor area')
    expect(redFlags({ tenure: 'Freehold', floor_area_sqft: 900 })).toHaveLength(0)
  })
})

describe('marketStats', () => {
  it('counts tracked / measured / within-budget correctly', () => {
    const props = synth()
    const m = fitModel(props, [])
    const s = marketStats(props, m.scored, [], { budget: DEFAULT_BUDGET })
    expect(s.tracked).toBe(6)
    expect(s.measured).toBe(6)
    expect(s.withinBudget).toBe(props.filter((p) => p.asking_price <= DEFAULT_BUDGET).length)
  })
})
