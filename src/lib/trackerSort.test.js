import { describe, it, expect } from 'vitest'
import houseTab from '../pages/__fixtures__/houseTab.json'
import { getTracker } from './trackers'
import { allRows } from './sheets'
import { toggleSort, sortRows, sortEntry, describeSort, numericValue, compareCells } from './trackerSort'

const rows = allRows(getTracker('house'), [houseTab])
const H = houseTab.headers
const col = (r, name) => r.cells[H.indexOf(name)]?.text ?? ''

describe('numericValue — only a cell that IS a number', () => {
  it('accepts formatted numbers', () => {
    expect(numericValue('£575,000')).toBe(575000)
    expect(numericValue('1,060')).toBe(1060)
    expect(numericValue('8.5')).toBe(8.5)
    expect(numericValue('20.0%')).toBe(20)
    expect(numericValue('-5')).toBe(-5)
  })

  it('rejects text that merely contains digits', () => {
    // These are the cases that make a lenient parser produce an order nobody
    // can explain: SL3 as 3, P001 as 1, "2022 (22 reg)" as 202222.
    expect(numericValue('SL3')).toBeNull()
    expect(numericValue('P001')).toBeNull()
    expect(numericValue('2022 (22 reg)')).toBeNull()
    expect(numericValue('Available')).toBeNull()
    expect(numericValue('')).toBeNull()
    expect(numericValue(null)).toBeNull()
  })
})

describe('compareCells', () => {
  it('compares numbers numerically, not lexically', () => {
    expect(compareCells('£90,000', '£100,000')).toBeLessThan(0)
    expect(compareCells('9', '10')).toBeLessThan(0)
  })

  it('compares text naturally, so P2 precedes P10', () => {
    expect(compareCells('P2', 'P10')).toBeLessThan(0)
    expect(compareCells('Available', 'Sold STC')).toBeLessThan(0)
  })

  it('is case-insensitive', () => {
    expect(compareCells('available', 'Available')).toBe(0)
  })
})

describe('toggleSort — asc, desc, off', () => {
  it('cycles a single column through three states', () => {
    let s = toggleSort([], 'Asking price')
    expect(s).toEqual([{ column: 'Asking price', dir: 'asc' }])
    s = toggleSort(s, 'Asking price')
    expect(s).toEqual([{ column: 'Asking price', dir: 'desc' }])
    s = toggleSort(s, 'Asking price')
    expect(s).toEqual([])
  })

  it('appends a second column so tap order is precedence', () => {
    const s = toggleSort(toggleSort([], 'Area group'), 'Asking price')
    expect(s.map((x) => x.column)).toEqual(['Area group', 'Asking price'])
    expect(sortEntry(s, 'Area group').rank).toBe(1)
    expect(sortEntry(s, 'Asking price').rank).toBe(2)
  })

  it('changing the secondary direction does not disturb the primary', () => {
    let s = toggleSort(toggleSort([], 'Area group'), 'Asking price')
    s = toggleSort(s, 'Asking price')
    expect(s).toEqual([
      { column: 'Area group', dir: 'asc' },
      { column: 'Asking price', dir: 'desc' },
    ])
  })

  it('removing the primary promotes the secondary', () => {
    let s = toggleSort(toggleSort([], 'Area group'), 'Asking price')
    s = toggleSort(toggleSort(s, 'Area group'), 'Area group') // desc, then off
    expect(s.map((x) => x.column)).toEqual(['Asking price'])
    expect(sortEntry(s, 'Asking price').rank).toBe(1)
  })
})

describe('sortRows', () => {
  it('returns the input untouched when nothing is sorting', () => {
    expect(sortRows(H, rows, [])).toBe(rows)
  })

  it('does not mutate the array it is given', () => {
    const before = rows.map((r) => r.sheetRow)
    sortRows(H, rows, [{ column: 'Asking price', dir: 'desc' }])
    expect(rows.map((r) => r.sheetRow)).toEqual(before)
  })

  it('sorts numerically on a money column', () => {
    const asc = sortRows(H, rows, [{ column: 'Asking price', dir: 'asc' }])
      .map((r) => numericValue(col(r, 'Asking price')))
      .filter((n) => n != null)
    expect([...asc].sort((a, b) => a - b)).toEqual(asc)

    const desc = sortRows(H, rows, [{ column: 'Asking price', dir: 'desc' }])
      .map((r) => numericValue(col(r, 'Asking price')))
      .filter((n) => n != null)
    expect([...desc].sort((a, b) => b - a)).toEqual(desc)
  })

  it('applies the second key only within ties of the first', () => {
    const sorted = sortRows(H, rows, [
      { column: 'Area group', dir: 'asc' },
      { column: 'Asking price', dir: 'asc' },
    ])
    const areas = sorted.map((r) => col(r, 'Area group'))
    // Primary: areas are grouped, never interleaved.
    expect([...areas].sort((a, b) => a.localeCompare(b))).toEqual(areas)

    // Secondary: prices ascend within each area block.
    for (let i = 1; i < sorted.length; i++) {
      if (areas[i] !== areas[i - 1]) continue
      const a = numericValue(col(sorted[i - 1], 'Asking price'))
      const b = numericValue(col(sorted[i], 'Asking price'))
      if (a != null && b != null) expect(b).toBeGreaterThanOrEqual(a)
    }
  })

  it('sinks blanks in BOTH directions', () => {
    const blanksAt = (dir) => {
      const vals = sortRows(H, rows, [{ column: 'Floor area (sq ft)', dir }])
        .map((r) => String(col(r, 'Floor area (sq ft)')).trim())
      const firstBlank = vals.findIndex((v) => !v)
      return { firstBlank, anyFilledAfter: vals.slice(firstBlank + 1).some(Boolean) }
    }
    for (const dir of ['asc', 'desc']) {
      const { firstBlank, anyFilledAfter } = blanksAt(dir)
      if (firstBlank >= 0) expect(anyFilledAfter).toBe(false)
    }
  })

  it('is stable — full ties keep the sheet order', () => {
    // Every row has the same Decision status in this register, so sorting on it
    // must not reorder anything at all.
    const sorted = sortRows(H, rows, [{ column: 'Decision status', dir: 'asc' }])
    expect(sorted.map((r) => r.sheetRow)).toEqual(rows.map((r) => r.sheetRow))
  })
})

describe('describeSort', () => {
  it('states the precedence in words', () => {
    expect(describeSort([])).toBeNull()
    expect(describeSort([{ column: 'Asking price', dir: 'asc' }])).toBe('Asking price ↑')
    expect(
      describeSort([
        { column: 'Area group', dir: 'asc' },
        { column: 'Asking price', dir: 'desc' },
      ]),
    ).toBe('Area group ↑, then Asking price ↓')
  })
})
