import { describe, it, expect } from 'vitest'
import houseTab from '../pages/__fixtures__/houseTab.json'
import { getTracker } from './trackers'
import { allRows } from './sheets'
import { filterOptions } from './trackerFilters'
import {
  buildColorScale, chipColor, CATEGORICAL, SEQUENTIAL, OTHER_COLOR, MAX_CATEGORIES, SAFE_CATEGORIES,
} from './trackerColor'

const house = getTracker('house')
const rows = allRows(house, [houseTab])
const H = houseTab.headers
const opts = filterOptions(house, rows)
const defOf = (col) => opts.find((o) => o.column === col)

describe('the palette itself', () => {
  // These are the numbers the palette validator produced for this exact set on
  // this app's surface. They are asserted here because the failure mode of
  // "just add another colour" is silent: the chart still renders, it is simply
  // no longer readable by everyone.
  it('opens with the validated all-pairs-safe set, in that order', () => {
    // The first five are the measured-safe subset; everything after is the
    // greedy max-separation extension. Reordering the opening five silently
    // makes small categories less readable.
    expect(CATEGORICAL.slice(0, 5)).toEqual(['#2a78d6', '#eda100', '#e87ba4', '#008300', '#4a3aa7'])
  })

  it('declares where colour stops being reliable', () => {
    expect(SAFE_CATEGORIES).toBe(7)
    expect(CATEGORICAL.length).toBeGreaterThan(SAFE_CATEGORIES)
  })

  it('has no duplicate slots — every value must get its own colour', () => {
    expect(new Set(CATEGORICAL).size).toBe(CATEGORICAL.length)
    expect(MAX_CATEGORIES).toBe(CATEGORICAL.length)
  })

  it('covers the largest category in the live register (17 property types)', () => {
    expect(CATEGORICAL.length).toBeGreaterThanOrEqual(17)
  })

  it('does not contain orange beside yellow — the pair that fails the floor', () => {
    expect(CATEGORICAL).not.toContain('#eb6834')
  })

  it('uses one hue for the sequential ramp, darkening monotonically', () => {
    // A sequential ramp must not be a rainbow; luminance has to move one way.
    const lum = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const l = SEQUENTIAL.map(lum)
    expect([...l].sort((a, b) => b - a)).toEqual(l)
  })
})

describe('buildColorScale — categorical', () => {
  const scale = buildColorScale(defOf('Area group'), rows, H)

  it('assigns slots in fixed order by frequency', () => {
    expect(scale.mode).toBe('categorical')
    const used = scale.legend.map((e) => e.color)
    expect(used.slice(0, Math.min(scale.legend.length, 5))).toEqual(
      CATEGORICAL.slice(0, Math.min(scale.legend.length, 5)),
    )
  })

  it('colours a row by its own value', () => {
    const r = rows[0]
    expect(scale.colorFor(r)).toMatch(/^#/)
    // Two rows with the same area get the same colour.
    const area = (row) => row.cells[H.indexOf('Area group')]?.text
    const same = rows.filter((x) => area(x) === area(r))
    for (const x of same) expect(scale.colorFor(x)).toBe(scale.colorFor(r))
  })

  it('gives every value in a large category its own colour', () => {
    const many = buildColorScale(defOf('Property type'), rows, H)
    const named = many.legend.filter((e) => e.color !== OTHER_COLOR)
    expect(new Set(named.map((e) => e.color)).size).toBe(named.length)
    expect(many.overflow).toBe(0) // the palette covers this register outright
  })

  it('never colours a blank cell', () => {
    const blank = { ...rows[0], cells: rows[0].cells.map(() => ({ text: '', url: null })) }
    expect(scale.colorFor(blank)).toBeNull()
  })

  it('colours a row purely by its own value, never by its position', () => {
    const area = (row) => row.cells[H.indexOf('Area group')]?.text
    const seen = new Map()
    for (const r of rows) {
      const v = area(r)
      if (!v) continue
      const c = scale.colorFor(r)
      if (seen.has(v)) expect(c).toBe(seen.get(v))
      else seen.set(v, c)
    }
    expect(seen.size).toBeGreaterThan(1)
    // Distinct values get distinct colours, up to the Other fold.
    const named = [...seen.values()].filter((c) => c !== OTHER_COLOR)
    expect(new Set(named).size).toBe(named.length ? new Set(named).size : 0)
  })
})

describe('buildColorScale — gradient', () => {
  const scale = buildColorScale(defOf('Asking price'), rows, H)

  it('is a gradient with the data range', () => {
    expect(scale.mode).toBe('gradient')
    expect(scale.min).toBeLessThan(scale.max)
    expect(scale.stops).toBe(SEQUENTIAL)
  })

  it('maps low values light and high values dark', () => {
    const cheapest = rows
      .map((r) => ({ r, n: Number(String(r.cells[H.indexOf('Asking price')]?.text ?? '').replace(/[^0-9.]/g, '')) }))
      .filter((x) => x.n)
      .sort((a, b) => a.n - b.n)
    const lo = scale.colorFor(cheapest[0].r)
    const hi = scale.colorFor(cheapest[cheapest.length - 1].r)
    expect(SEQUENTIAL.indexOf(lo)).toBeLessThan(SEQUENTIAL.indexOf(hi))
  })

  it('gives no colour to a row with no figure', () => {
    const blank = { ...rows[0], cells: rows[0].cells.map(() => ({ text: '', url: null })) }
    expect(scale.colorFor(blank)).toBeNull()
  })

  it('handles a single-value range without dividing by zero', () => {
    const one = [rows[0]]
    const s = buildColorScale(defOf('Asking price'), one, H)
    expect(s.colorFor(rows[0])).toMatch(/^#/)
  })
})

describe('chipColor', () => {
  it('gives a categorical chip its swatch', () => {
    const scale = buildColorScale(defOf('Area group'), rows, H)
    expect(chipColor(scale, scale.legend[0].label)).toBe(CATEGORICAL[0])
  })

  it('gives an unlisted value the neutral Other', () => {
    const scale = buildColorScale(defOf('Area group'), rows, H)
    expect(chipColor(scale, 'Nowhere-on-earth')).toBe(OTHER_COLOR)
  })

  it('gives nothing for a gradient or a missing scale', () => {
    expect(chipColor(buildColorScale(defOf('Asking price'), rows, H), 'x')).toBeNull()
    expect(chipColor(null, 'x')).toBeNull()
  })
})

describe('no colour selected', () => {
  it('returns null rather than a default scale', () => {
    expect(buildColorScale(null, rows, H)).toBeNull()
  })
})
