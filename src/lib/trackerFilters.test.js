import { describe, it, expect } from 'vitest'
import houseTab from '../pages/__fixtures__/houseTab.json'
import { getTracker } from './trackers'
import { allRows } from './sheets'
import {
  filterOptions, applyFilters, applySearch, activeFilterCount, toggleValue, setRange, rangeSteps,
  selectComparator,
} from './trackerFilters'

const house = getTracker('house')
const rows = allRows(house, [houseTab])

describe('applySearch', () => {
  it('returns every row for a blank query', () => {
    expect(applySearch(house, rows, '')).toBe(rows)
    expect(applySearch(house, rows, '   ')).toBe(rows)
  })

  it('matches case-insensitively across the configured columns', () => {
    // Area group carries 'Langley' in the register; searching it narrows to a
    // non-empty subset smaller than the whole.
    const hits = applySearch(house, rows, 'langley')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.length).toBeLessThan(rows.length)
    // Same result regardless of case — it is a substring match, lower-cased.
    expect(applySearch(house, rows, 'LANGLEY').length).toBe(hits.length)
  })

  it('combines with an active filter by running on the already-filtered rows', () => {
    const langley = applyFilters(house, rows, { 'Area group': ['Langley'] })
    // A term absent from the Langley subset empties it — the search is ANDed.
    expect(applySearch(house, langley, 'zzzznotathing')).toHaveLength(0)
    // …and a term present in it leaves rows.
    expect(applySearch(house, langley, 'langley').length).toBe(langley.length)
  })

  it('returns rows untouched when the tracker has no search config', () => {
    expect(applySearch({ }, rows, 'anything')).toBe(rows)
  })
})

describe('rangeSteps', () => {
  // The regression this file exists for: the option cap silently coarsened the
  // configured step, turning £25,000 price increments into £100,000 ones with
  // nothing on screen to say it had happened.
  const price = [375_000, 1_300_000]

  it('keeps the configured step for a real price range', () => {
    const s = rangeSteps(price, 25_000)
    expect(s[1] - s[0]).toBe(25_000)
  })

  it('keeps the configured step for floor area and £/sq ft', () => {
    expect(rangeSteps([613, 2469], 100)[1] - rangeSteps([613, 2469], 100)[0]).toBe(100)
    expect(rangeSteps([299, 902], 50)[1] - rangeSteps([299, 902], 50)[0]).toBe(50)
  })

  it('spans the data on both sides', () => {
    const s = rangeSteps(price, 25_000)
    expect(s[0]).toBeLessThanOrEqual(price[0])
    expect(s[s.length - 1]).toBeGreaterThanOrEqual(price[1])
  })

  it('still coarsens rather than emitting thousands of options', () => {
    const s = rangeSteps([0, 10_000_000], 1)
    expect(s.length).toBeLessThanOrEqual(41)
  })

  it('is safe on degenerate input', () => {
    expect(rangeSteps([], 100)).toEqual([])
    expect(rangeSteps([5], 0)).toEqual([])
    expect(rangeSteps([7, 7], 1)).toHaveLength(1)
  })
})

describe('filterOptions', () => {
  it('derives values from the rows, commonest first, with counts', () => {
    const area = filterOptions(house, rows).find((o) => o.column === 'Area group')
    expect(area.values.length).toBeGreaterThan(1)
    const counts = area.values.map((v) => v.count)
    expect([...counts].sort((a, b) => b - a)).toEqual(counts)
    expect(counts.reduce((a, b) => a + b, 0)).toBe(rows.length - area.blanks)
  })

  it('reports blanks so a sparse column cannot silently drop rows', () => {
    const fa = filterOptions(house, rows).find((o) => o.column === 'Floor area (sq ft)')
    expect(fa.blanks).toBeGreaterThanOrEqual(0)
    expect(fa.min).toBeLessThanOrEqual(fa.max)
  })

  it('is empty for a tracker with no filters configured', () => {
    expect(filterOptions(getTracker('medical'), rows)).toEqual([])
  })

  it('orders the house Decision status by its configured precedence', () => {
    // The register's shortlist verdict is a ranked vocabulary, not a frequency
    // list: PRIORITY must lead even when REJECT is far commoner.
    const graded = [
      mkRow(['Decision status'], ['REJECT']),
      mkRow(['Decision status'], ['REJECT']),
      mkRow(['Decision status'], ['REJECT']),
      mkRow(['Decision status'], ['VIEW']),
      mkRow(['Decision status'], ['PRIORITY']),
    ]
    const opt = filterOptions(house, graded).find((o) => o.column === 'Decision status')
    expect(opt.values.map((v) => v.value)).toEqual(['PRIORITY', 'VIEW', 'REJECT'])
  })
})

// A minimal row for exercising the pure filter helpers without the full fixture.
function mkRow(headers, texts) {
  return { headers, cells: texts.map((text) => ({ text, url: null })) }
}

describe('selectComparator', () => {
  const order = ['PRIORITY', 'VIEW', 'MONITOR', 'PASS', 'REJECT']
  const sort = (defOrder, vals) => vals.slice().sort(selectComparator(defOrder)).map((v) => v.value)

  it('with no order, falls back to commonest-first then alphabetical', () => {
    const out = sort(undefined, [
      { value: 'b', count: 1 }, { value: 'a', count: 1 }, { value: 'c', count: 5 },
    ])
    expect(out).toEqual(['c', 'a', 'b'])
  })

  it('pins known values into the configured sequence regardless of count', () => {
    const out = sort(order, [
      { value: 'REJECT', count: 40 }, { value: 'PRIORITY', count: 1 }, { value: 'MONITOR', count: 9 },
    ])
    expect(out).toEqual(['PRIORITY', 'MONITOR', 'REJECT'])
  })

  it('matches the order case-insensitively', () => {
    const out = sort(order, [{ value: 'reject', count: 2 }, { value: 'Priority', count: 1 }])
    expect(out).toEqual(['Priority', 'reject'])
  })

  it('keeps unrecognised values, after the known ones, commonest first', () => {
    const out = sort(order, [
      { value: 'Unreviewed', count: 50 }, { value: 'PASS', count: 3 }, { value: 'Maybe', count: 4 },
    ])
    expect(out).toEqual(['PASS', 'Unreviewed', 'Maybe'])
  })
})

describe('applyFilters', () => {
  const areaOf = (r) => r.cells[1]?.text ?? ''

  it('returns everything when nothing is set', () => {
    expect(applyFilters(house, rows, {}).length).toBe(rows.length)
    expect(applyFilters(house, rows, null).length).toBe(rows.length)
  })

  it('ORs values within a column', () => {
    const areas = [...new Set(rows.map(areaOf))].filter(Boolean).slice(0, 2)
    const a = applyFilters(house, rows, { 'Area group': [areas[0]] }).length
    const b = applyFilters(house, rows, { 'Area group': [areas[1]] }).length
    expect(applyFilters(house, rows, { 'Area group': areas }).length).toBe(a + b)
  })

  it('ANDs across columns', () => {
    const area = areaOf(rows[0])
    const wide = applyFilters(house, rows, { 'Area group': [area] })
    const narrow = applyFilters(house, rows, {
      'Area group': [area],
      'Asking price': { min: 10_000_000, max: null },
    })
    expect(narrow.length).toBeLessThan(wide.length)
    expect(narrow.length).toBe(0)
  })

  it('excludes rows with no figure while a bound is active', () => {
    const fa = filterOptions(house, rows).find((o) => o.column === 'Floor area (sq ft)')
    const got = applyFilters(house, rows, { 'Floor area (sq ft)': { min: fa.min, max: fa.max } })
    expect(got.length).toBe(rows.length - fa.blanks)
  })

  it('treats an empty range as inert', () => {
    expect(applyFilters(house, rows, { 'Asking price': { min: null, max: null } }).length).toBe(rows.length)
    expect(activeFilterCount(house, { 'Asking price': { min: null, max: null } })).toBe(0)
  })
})

describe('state helpers', () => {
  it('toggleValue adds, removes, and deletes an emptied key', () => {
    let s = toggleValue({}, 'Area group', 'Langley')
    expect(s['Area group']).toEqual(['Langley'])
    s = toggleValue(s, 'Area group', 'Langley')
    expect('Area group' in s).toBe(false)
  })

  it('setRange deletes the key when both bounds clear', () => {
    let s = setRange({}, 'Asking price', 'min', 400_000)
    expect(s['Asking price']).toEqual({ min: 400_000, max: null })
    s = setRange(s, 'Asking price', 'min', null)
    expect('Asking price' in s).toBe(false)
  })

  it('activeFilterCount counts columns, not values', () => {
    expect(activeFilterCount(house, { 'Area group': ['a', 'b'] })).toBe(1)
    expect(activeFilterCount(house, { 'Area group': ['a'], 'Asking price': { min: 1, max: null } })).toBe(2)
  })
})
