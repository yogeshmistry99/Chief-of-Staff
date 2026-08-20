import { textByHeader, toNumber } from '../../api/_lib/sheetTable.js'

// Filtering for the trackers. Pure, so it can be tested against real sheet data
// without a browser.
//
// THE ROW SET IS FILTERED ONCE, UPSTREAM, AND EVERYTHING DERIVES FROM IT — the
// scatter, the table, the summary strip and the detail card. That is the same
// property the trackers were built with in the first place: if the chart were
// filtered separately from the table they could show different answers to the
// same question, which is worse than having no filter at all.
//
// Options come from the loaded rows, never from a hardcoded list. These sheets
// gain values by hand (a new area, a new listing status), and a fixed list would
// quietly stop offering them while looking complete.

// The distinct values / numeric bounds actually present for each configured
// filter. `blanks` is carried because it decides how a row with no value is
// treated, and the UI says so rather than dropping rows invisibly.
export function filterOptions(tracker, rows) {
  return (tracker.filters ?? []).map((def) => {
    const texts = rows.map((r) => String(textByHeader(r.headers, r, def.column) ?? '').trim())
    const filled = texts.filter(Boolean)

    if (def.type === 'range') {
      const nums = filled.map(toNumber).filter((n) => n != null)
      if (!nums.length) return { ...def, steps: [], min: null, max: null, blanks: rows.length }
      return {
        ...def,
        min: Math.min(...nums),
        max: Math.max(...nums),
        blanks: rows.length - nums.length,
        steps: rangeSteps(nums, def.step ?? 1),
      }
    }

    // Commonest first: on a 184-row register the useful areas should not be
    // buried under one-off values in alphabetical order.
    const counts = new Map()
    for (const t of filled) counts.set(t, (counts.get(t) ?? 0) + 1)
    const values = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count }))

    return { ...def, values, blanks: rows.length - filled.length }
  })
}

// Threshold options for a range control.
//
// Deliberately NOT a slider: a slider needs a precise drag, which is poor on a
// phone — the same reasoning that shaped the journal's tap targets. These become
// two dropdowns, so a bound is one tap.
//
// The configured step is doubled only if the list would be unusable, as a last
// resort against a pathological range. THE CAP IS DELIBERATELY GENEROUS: at 18
// it quietly coarsened £25,000 price steps into £100,000 ones, which is far too
// blunt for choosing a house and gave no sign it had happened. A native select
// is a scrollable picker on a phone, so forty entries costs nothing — the
// configured step should survive unless the range is genuinely absurd.
export function rangeSteps(nums, step, maxOptions = 40) {
  if (!nums.length || !(step > 0)) return []
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  let s = step
  while ((Math.ceil(hi / s) - Math.floor(lo / s)) > maxOptions) s *= 2

  const out = []
  for (let v = Math.floor(lo / s) * s; v <= Math.ceil(hi / s) * s; v += s) out.push(v)
  return out
}

// Rows surviving every active filter. Filters are ANDed across columns and ORed
// within a column, which is what "Langley or Upton, and available" means.
export function applyFilters(tracker, rows, state) {
  const defs = tracker?.filters ?? []
  if (!defs.length || !state) return rows

  return rows.filter((row) => defs.every((def) => {
    const sel = state[def.column]
    if (sel == null) return true
    const text = String(textByHeader(row.headers, row, def.column) ?? '').trim()

    if (def.type === 'range') {
      const { min, max } = sel
      if (min == null && max == null) return true
      const n = toNumber(text)
      // A row with no figure cannot satisfy a numeric bound, so it is excluded
      // while that bound is set. 79 of the 184 house rows have no floor area,
      // which is why the control states its blank count instead of letting them
      // disappear without explanation.
      if (n == null) return false
      if (min != null && n < min) return false
      if (max != null && n > max) return false
      return true
    }

    if (!Array.isArray(sel) || !sel.length) return true
    return sel.includes(text)
  }))
}

// Free-text narrowing across the tracker's configured search columns.
//
// Runs AFTER applyFilters and on the same row set, so a search combines with an
// active filter (both narrow) rather than replacing it. A blank query, or a
// tracker with no `search` config, returns the rows untouched — clearing the
// field restores the full filtered list with no special case.
//
// Match is a case-insensitive substring against ANY of the columns (address,
// area, id for the house register). Deliberately simple and predictable: it
// filters as you type, so a surprising fuzzy match would be worse than a miss.
export function applySearch(tracker, rows, query) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return rows
  const cols = tracker?.search?.columns ?? []
  if (!cols.length) return rows
  return rows.filter((row) =>
    cols.some((col) =>
      String(textByHeader(row.headers, row, col) ?? '').toLowerCase().includes(q),
    ),
  )
}

// How many filters are actually narrowing the results — drives the "Filters (2)"
// badge, so a collapsed panel can never hide that a view is filtered.
export function activeFilterCount(tracker, state) {
  if (!state) return 0
  return (tracker?.filters ?? []).reduce((n, def) => {
    const sel = state[def.column]
    if (sel == null) return n
    if (def.type === 'range') return n + (sel.min != null || sel.max != null ? 1 : 0)
    return n + (Array.isArray(sel) && sel.length ? 1 : 0)
  }, 0)
}

// Toggle one value of a select filter, returning a NEW state object.
export function toggleValue(state, column, value) {
  const current = Array.isArray(state?.[column]) ? state[column] : []
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  const out = { ...state }
  if (next.length) out[column] = next
  else delete out[column]
  return out
}

export function setRange(state, column, bound, value) {
  const current = state?.[column] ?? { min: null, max: null }
  const next = { ...current, [bound]: value }
  const out = { ...state }
  if (next.min == null && next.max == null) delete out[column]
  else out[column] = next
  return out
}
