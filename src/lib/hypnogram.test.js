import { describe, it, expect } from 'vitest'
import { layoutSegments, lanesFor, hourTicks, stageComparison, LANE_ORDER } from './hypnogram'

// Real segments from 19 Aug 2026 — the night the hypnogram was built against.
const night = { start: '2026-08-18T23:32:00Z', end: '2026-08-19T05:45:00Z' }
const segments = [
  { type: 'AWAKE', start: '2026-08-18T23:32:00Z', end: '2026-08-18T23:46:00Z', minutes: 14 },
  { type: 'LIGHT', start: '2026-08-18T23:46:00Z', end: '2026-08-19T00:00:00Z', minutes: 14 },
  { type: 'DEEP',  start: '2026-08-19T00:00:00Z', end: '2026-08-19T00:22:00Z', minutes: 22 },
  { type: 'LIGHT', start: '2026-08-19T00:22:00Z', end: '2026-08-19T01:11:00Z', minutes: 49 },
  { type: 'REM',   start: '2026-08-19T01:11:00Z', end: '2026-08-19T01:15:00Z', minutes: 4 },
]

describe('layoutSegments', () => {
  it('places the first block at the start and spans the night', () => {
    const blocks = layoutSegments(segments, night.start, night.end)
    expect(blocks).toHaveLength(5)
    expect(blocks[0].offset).toBe(0)
    expect(blocks[0].width).toBeCloseTo(14 / 373, 3)
  })

  it('keeps every block inside the window', () => {
    for (const b of layoutSegments(segments, night.start, night.end)) {
      expect(b.offset).toBeGreaterThanOrEqual(0)
      expect(b.offset + b.width).toBeLessThanOrEqual(1.0001)
    }
  })

  it('orders blocks by time even when the API does not', () => {
    const shuffled = [segments[3], segments[0], segments[2], segments[1], segments[4]]
    const blocks = layoutSegments(shuffled, night.start, night.end)
    const offsets = blocks.map((b) => b.offset)
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
  })

  it('drops a segment outside the window rather than clamping it', () => {
    // A block hanging off the end would misrepresent when the stage happened.
    const stray = [{ type: 'REM', start: '2026-08-19T09:00:00Z', end: '2026-08-19T09:30:00Z', minutes: 30 }]
    expect(layoutSegments(stray, night.start, night.end)).toEqual([])
  })

  it('is empty rather than throwing on a night with no segments or no window', () => {
    expect(layoutSegments(null, night.start, night.end)).toEqual([])
    expect(layoutSegments(segments, null, null)).toEqual([])
    expect(layoutSegments(segments, night.end, night.start)).toEqual([])
  })
})

describe('lanesFor', () => {
  it('draws a lane only for stages the night actually has', () => {
    const lanes = lanesFor(layoutSegments(segments, night.start, night.end))
    expect(lanes.map((l) => l.type)).toEqual(['AWAKE', 'REM', 'LIGHT', 'DEEP'])
  })

  it('never invents an empty lane — that would claim a stage was measured at zero', () => {
    const onlyDeep = layoutSegments([segments[2]], night.start, night.end)
    expect(lanesFor(onlyDeep).map((l) => l.type)).toEqual(['DEEP'])
  })

  it('keeps lanes in reading order, not in the order segments arrived', () => {
    const lanes = lanesFor(layoutSegments(segments, night.start, night.end))
    const expected = LANE_ORDER.filter((t) => lanes.some((l) => l.type === t))
    expect(lanes.map((l) => l.type)).toEqual(expected)
  })
})

describe('hourTicks', () => {
  it('marks each hour inside the night', () => {
    const ticks = hourTicks(night.start, night.end)
    expect(ticks.length).toBeGreaterThan(3)
    for (const t of ticks) {
      expect(new Date(t.at).getMinutes()).toBe(0)
      expect(t.offset).toBeGreaterThan(0)
      expect(t.offset).toBeLessThan(1)
    }
  })

  it('is empty for a nonsense window rather than looping', () => {
    expect(hourTicks(null, null)).toEqual([])
    expect(hourTicks(night.end, night.start)).toEqual([])
  })
})

describe('stageComparison — tonight against the usual', () => {
  const stages = { DEEP: 48, REM: 69, LIGHT: 214, AWAKE: 41 }
  const baseline = { DEEP: { mean: 60, nights: 14 }, REM: { mean: 65, nights: 14 } }

  it('scales both bars to the larger of the two', () => {
    const c = stageComparison('DEEP', stages, baseline)
    expect(c.tonight).toBe(48)
    expect(c.usual).toBe(60)
    expect(c.usualFraction).toBe(1)          // usual is the larger
    expect(c.tonightFraction).toBeCloseTo(48 / 60)
  })

  it('states the difference rather than leaving it to be worked out', () => {
    expect(stageComparison('DEEP', stages, baseline).difference).toBe(-12)
    expect(stageComparison('REM', stages, baseline).difference).toBe(4)
  })

  it('has no usual when there is no baseline for that stage', () => {
    const c = stageComparison('LIGHT', stages, baseline)
    expect(c.tonight).toBe(214)
    expect(c.usual).toBeNull()
    expect(c.usualFraction).toBeNull()
    expect(c.difference).toBeNull()
  })

  it('is null when the stage was not recorded tonight', () => {
    expect(stageComparison('RESTLESS', stages, baseline)).toBeNull()
  })

  it('carries how many nights the usual is drawn from', () => {
    expect(stageComparison('DEEP', stages, baseline).nights).toBe(14)
  })
})
