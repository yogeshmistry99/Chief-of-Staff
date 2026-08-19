import { STAGE_ORDER, STAGE_COLOR, STAGE_LABEL } from './stagePalette'

// Laying a night out against the clock.
//
// The stage bar answers "how much of each". This answers "when, and in what
// order" — the same totals can be one unbroken run of deep sleep or six
// fragments, and only a time axis tells them apart.
//
// Pure: takes segments and returns positions. No dates formatted, no DOM, no
// colours chosen beyond the palette already shared with the stage bar — so the
// arithmetic that decides where a block sits is testable on its own.

// Lanes top to bottom. REM above light above deep is the convention every sleep
// chart uses, and AWAKE sits at the top because it is the surface.
export const LANE_ORDER = ['AWAKE', 'REM', 'LIGHT', 'DEEP', 'ASLEEP', 'RESTLESS']

// Segments as 0..1 offsets and widths across the night.
//
// The window is the night's own start and end, so the chart always spans exactly
// the sleep period. Segments outside it are dropped rather than clamped: a block
// hanging off the end would misrepresent when the stage happened.
export function layoutSegments(segments, start, end) {
  const t0 = Date.parse(start ?? '')
  const t1 = Date.parse(end ?? '')
  if (!Array.isArray(segments) || !segments.length || Number.isNaN(t0) || Number.isNaN(t1) || t1 <= t0) return []
  const span = t1 - t0

  // Sorted here as well as at the parser, so the layout does not depend on the
  // server having done it. Blocks are positioned absolutely and would render in
  // the right places either way, but a caller reading them in order — a legend, a
  // test, a future timeline — should get them in order.
  return [...segments]
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .map((s) => {
      const a = Date.parse(s.start)
      const b = Date.parse(s.end)
      if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null
      if (b <= t0 || a >= t1) return null
      const offset = (a - t0) / span
      const width = (b - a) / span
      return {
        key: `${s.type}-${s.start}`,
        type: s.type,
        label: STAGE_LABEL[s.type] ?? s.type,
        color: STAGE_COLOR[s.type] ?? '#79747E',
        minutes: s.minutes,
        start: s.start,
        end: s.end,
        offset: Math.max(0, Math.min(1, offset)),
        width: Math.max(0, Math.min(1 - Math.max(0, offset), width)),
      }
    })
    .filter(Boolean)
}

// Which lanes to draw, in order, for the stages this night actually has.
//
// Only lanes with a segment: an empty lane implies a stage was measured and came
// back zero, which is a different claim from it never appearing.
export function lanesFor(blocks) {
  const present = new Set(blocks.map((b) => b.type))
  return LANE_ORDER.filter((t) => present.has(t)).map((type) => ({
    type,
    label: STAGE_LABEL[type] ?? type,
    color: STAGE_COLOR[type] ?? '#79747E',
    blocks: blocks.filter((b) => b.type === type),
  }))
}

// Hour marks across the night, for the axis.
//
// On the hour, in local time, so the labels line up with how someone reads a
// clock. Returns offsets in the same 0..1 space as the blocks.
export function hourTicks(start, end) {
  const t0 = Date.parse(start ?? '')
  const t1 = Date.parse(end ?? '')
  if (Number.isNaN(t0) || Number.isNaN(t1) || t1 <= t0) return []
  const span = t1 - t0
  const ticks = []
  const cursor = new Date(t0)
  cursor.setMinutes(0, 0, 0)
  cursor.setHours(cursor.getHours() + 1)
  while (cursor.getTime() < t1) {
    ticks.push({ at: cursor.toISOString(), offset: (cursor.getTime() - t0) / span })
    cursor.setHours(cursor.getHours() + 1)
  }
  return ticks
}

// The same blocks, packed left into one contiguous run.
//
// THIS IS THE WHOLE TRICK. Compiling a stage does not rebuild the lane — every
// block keeps its width and only its offset changes, from where it happened to
// where it lands when the pieces are pushed together. The lane stays in place,
// the run reads as that stage's total, and because only `left` moves it can be
// a CSS transition rather than a redraw. The scattered view and the compiled
// view are the same fourteen pieces of the same night.
export function compileLane(blocks) {
  let cursor = 0
  return blocks.map((b) => {
    const compiledOffset = cursor
    cursor += b.width
    return { ...b, compiledOffset }
  })
}

// The share of the night a stage took, as a percentage of the stages recorded.
//
// Denominated on the stage totals rather than the sleep period, so the four
// percentages add to 100 and can be read against each other. Null when there is
// nothing to divide by — never 0%, which would claim the stage was measured.
export function stagePercent(type, stages) {
  const total = Object.values(stages ?? {}).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0)
  const value = stages?.[type]
  if (!total || value == null) return null
  return Math.round((value / total) * 100)
}

// Where the typical range sits on a lane's track, as 0..1 offsets.
//
// The track spans the whole night, so a stage's bar and its typical range are
// measured in the same units and the bracket lands where the comparison actually
// is. Null without a baseline — a bracket drawn from one night is not a range.
export function typicalRange(type, baseline, spanMinutes) {
  const b = baseline?.[type]
  if (!b || !spanMinutes || b.min == null || b.max == null) return null
  const from = Math.max(0, Math.min(1, b.min / spanMinutes))
  const to = Math.max(0, Math.min(1, b.max / spanMinutes))
  if (to <= from) return null
  // Fractions and minutes are both wanted here and must not be confused: `from`
  // and `to` position the bracket, `min`/`max`/`mean` are the real minutes the
  // label prints. Spreading the baseline last used to overwrite the computed
  // fraction with raw minutes, which put the bracket off the end of the track.
  return {
    from,
    to,
    meanFraction: Math.max(0, Math.min(1, b.mean / spanMinutes)),
    min: b.min,
    max: b.max,
    mean: b.mean,
    nights: b.nights,
  }
}

// Tonight against the usual, for one stage.
//
// Both bars are scaled to whichever is larger, so the comparison is read from
// the bar lengths rather than from two independently scaled bars that would make
// any night look average. Null when there is no baseline to compare against —
// "usual" needs more than one night, and inventing one would be the whole thing
// this app refuses to do.
export function stageComparison(type, stages, baseline) {
  const tonight = stages?.[type]
  if (tonight == null) return null
  const usual = baseline?.[type]?.mean ?? null
  const nights = baseline?.[type]?.nights ?? null
  const max = Math.max(tonight, usual ?? 0) || 1
  return {
    type,
    label: STAGE_LABEL[type] ?? type,
    color: STAGE_COLOR[type] ?? '#79747E',
    tonight,
    usual,
    nights,
    tonightFraction: tonight / max,
    usualFraction: usual == null ? null : usual / max,
    // Stated rather than left to the reader to work out, but only where there is
    // something real to compare.
    difference: usual == null ? null : tonight - usual,
  }
}

export { STAGE_ORDER, STAGE_COLOR, STAGE_LABEL }
