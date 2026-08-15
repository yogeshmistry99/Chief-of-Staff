import { textByHeader } from '../../api/_lib/sheetTable.js'
import { numericValue } from './trackerSort'

// Colouring the scatter by one column.
//
// ── Why these five hues, and why only five ────────────────────────────────────
// A scatter is an "all pairs" chart: any two points can end up side by side, so
// EVERY pair of colours must be separable, not just neighbouring ones in a
// legend. That is a much harder gate than a bar chart's, and it is why this list
// is short. The five below were selected by running the palette validator over
// every subset of the reference palette and keeping the largest that clears the
// all-pairs gates on this app's surface (#FFFBFE):
//
//   worst-pair CVD ΔE 13.0 (protan) · worst-pair normal-vision ΔE 16.3 — PASS
//
// The obvious "just take the first N of the standard palette" fails: its fourth
// slot puts yellow next to orange, at normal-vision ΔE 13.7 — below the floor of
// 15, meaning full-colour readers cannot reliably tell them apart. Do not extend
// this list by eye. Re-run the validator; six hues do not clear it.
export const CATEGORICAL = ['#2a78d6', '#eda100', '#e87ba4', '#008300', '#4a3aa7']

// Anything past the fifth commonest value. Neutral by design — "Other" is not a
// series, and giving it a hue would imply it were one.
export const OTHER_COLOR = '#8E8E93'
export const OTHER_LABEL = 'Other'
export const MAX_CATEGORIES = CATEGORICAL.length

// Sequential = ONE hue, light→dark. Steps taken from the reference blue ramp
// rather than interpolated, so every colour used is one that was validated.
// Starts at step 200 instead of 100: a mark lighter than that disappears into a
// white surface, which is fine for a heatmap cell and useless for a dot.
export const SEQUENTIAL = ['#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']

// Build the colour scale for one column.
//
// ROWS MUST BE THE UNFILTERED SET. Colour follows the entity, not its rank: if
// the scale were built from the filtered rows, filtering out an area would
// repaint every surviving area, and a point would change colour without
// changing anything about itself. Building from the full set also keeps the
// legend fixed, so the pinned block cannot change height as you filter.
export function buildColorScale(def, rows, headers) {
  if (!def) return null

  const valueOf = (row) => String(textByHeader(row.headers ?? headers, row, def.column) ?? '').trim()

  if (def.type === 'range') {
    const nums = rows.map((r) => numericValue(valueOf(r))).filter((n) => n != null)
    if (!nums.length) return null
    const min = Math.min(...nums)
    const max = Math.max(...nums)

    return {
      mode: 'gradient',
      column: def.column,
      label: def.label ?? def.column,
      format: def.format,
      min,
      max,
      stops: SEQUENTIAL,
      colorFor(row) {
        const n = numericValue(valueOf(row))
        if (n == null) return null // no value → no colour, never a guessed one
        if (max === min) return SEQUENTIAL[SEQUENTIAL.length - 1]
        const t = (n - min) / (max - min)
        const i = Math.min(SEQUENTIAL.length - 1, Math.max(0, Math.floor(t * SEQUENTIAL.length)))
        return SEQUENTIAL[i]
      },
    }
  }

  // Categorical: the commonest values take the slots, in a fixed order. Ordering
  // by frequency (not alphabetically) means the colours that appear most often
  // are the ones furthest apart in the palette.
  const counts = new Map()
  for (const r of rows) {
    const v = valueOf(r)
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  if (!counts.size) return null

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const named = ranked.slice(0, MAX_CATEGORIES)
  const overflow = ranked.length - named.length

  const map = new Map(named.map(([v], i) => [v, CATEGORICAL[i]]))

  return {
    mode: 'categorical',
    column: def.column,
    label: def.label ?? def.column,
    map,
    overflow,
    legend: [
      ...named.map(([value], i) => ({ label: value, color: CATEGORICAL[i] })),
      ...(overflow > 0 ? [{ label: `${OTHER_LABEL} (${overflow})`, color: OTHER_COLOR }] : []),
    ],
    colorFor(row) {
      const v = valueOf(row)
      if (!v) return null
      return map.get(v) ?? OTHER_COLOR
    },
  }
}

// The swatch for one chip in the filter panel, so the chips double as the key.
export function chipColor(scale, value) {
  if (!scale || scale.mode !== 'categorical') return null
  return scale.map.get(value) ?? OTHER_COLOR
}
