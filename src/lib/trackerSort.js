import { cellByHeader } from '../../api/_lib/sheetTable.js'

// Sorting the record list by tapped column headings.
//
// PRECEDENCE IS TAP ORDER: the first heading you tap is the primary sort, the
// second is the tie-breaker within it, and so on. That is the whole model, and
// it is why sort state is an ordered array rather than a {column, dir} pair —
// the order carries the meaning.
//
// One heading cycles through three states on repeated taps: ascending →
// descending → off. A single tap target does the whole job, which matters on a
// phone where there is no right-click and long-press is already taken by the
// browser.

// A value is treated as a number only when the whole cell IS one. This is
// deliberately stricter than toNumber(), which strips any non-digit and would
// therefore read "SL3" as 3, "P001" as 1 and "2022 (22 reg)" as 202222 —
// producing an order that looks arbitrary and is very hard to distrust.
// Anything else is compared as text.
const NUMERIC = /^[£$€]?\s*-?\d[\d,]*(\.\d+)?\s*%?$/

export function numericValue(text) {
  const t = String(text ?? '').trim()
  if (!NUMERIC.test(t)) return null
  const n = Number(t.replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}

export function compareCells(a, b) {
  const na = numericValue(a)
  const nb = numericValue(b)
  if (na != null && nb != null) return na - nb
  // numeric:true so "P2" precedes "P10" rather than following it.
  return String(a).localeCompare(String(b), 'en-GB', { sensitivity: 'base', numeric: true })
}

// asc → desc → off. Tapping a heading that is not yet sorting APPENDS it, so it
// becomes the least significant key — the earlier taps keep their precedence.
export function toggleSort(sort, column) {
  const i = (sort ?? []).findIndex((s) => s.column === column)
  if (i < 0) return [...(sort ?? []), { column, dir: 'asc' }]
  if (sort[i].dir === 'asc') {
    const next = [...sort]
    next[i] = { column, dir: 'desc' }
    return next
  }
  return sort.filter((s) => s.column !== column)
}

export function sortEntry(sort, column) {
  const i = (sort ?? []).findIndex((s) => s.column === column)
  return i < 0 ? null : { ...sort[i], rank: i + 1 }
}

export function sortRows(headers, rows, sort) {
  if (!sort?.length) return rows

  // Copy first: Array.prototype.sort mutates, and these rows are shared with
  // the chart and the detail card.
  return [...rows].sort((ra, rb) => {
    for (const { column, dir } of sort) {
      const ta = cellByHeader(ra.headers ?? headers, ra, column).text
      const tb = cellByHeader(rb.headers ?? headers, rb, column).text

      const ea = !String(ta ?? '').trim()
      const eb = !String(tb ?? '').trim()
      // BLANKS ALWAYS SINK, in both directions. A missing floor area is not
      // "the smallest floor area", and reversing the sort should not promote
      // the rows that have no answer to the top.
      if (ea !== eb) return ea ? 1 : -1
      if (ea && eb) continue

      const c = compareCells(ta, tb)
      if (c) return dir === 'desc' ? -c : c
    }
    return 0 // stable sort keeps the sheet's own order for full ties
  })
}

// "Asking price ↑, then Area ↓" — so the precedence is stated in words and not
// only inferred from small arrows scattered across a scrolling header row.
export function describeSort(sort) {
  if (!sort?.length) return null
  return sort
    .map((s, i) => `${i ? 'then ' : ''}${s.column} ${s.dir === 'asc' ? '↑' : '↓'}`)
    .join(', ')
}
