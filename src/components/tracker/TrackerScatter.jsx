// Scatter plot for a tracker, x and y chosen per-tracker in config.
//
// Inline SVG rather than a charting library, matching JournalChart.jsx — the
// approach is already proven here and a library would add ~100KB to a bundle
// that is already near 500KB.
//
// Points are the interaction: tapping one opens the same detail card the table
// rows open, so the chart is a way into the data rather than a picture beside it.

const VB_W = 320
const VB_H = 210
const PAD = { top: 12, right: 10, bottom: 30, left: 46 }
const PLOT_W = VB_W - PAD.left - PAD.right
const PLOT_H = VB_H - PAD.top - PAD.bottom

function niceTicks(min, max, count = 4) {
  if (min === max) return [min]
  const step = (max - min) / count
  return Array.from({ length: count + 1 }, (_, i) => min + step * i)
}

function short(n) {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (a >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(Math.round(n))
}

export default function TrackerScatter({ points, domainPoints, pinned = false, config, selected, onSelect, colorFor, onBackgroundClick }) {
  // TWO DOMAIN MODES, chosen by `pinned` — default fitted.
  //
  // FITTED (default): the axes derive from whatever is currently visible, so
  // filtering or searching to a subset reframes the chart to that subset and the
  // points spread out to fill the frame. The filtering does the zooming; there is
  // no pan or pinch. Answers "how do these compare to each other".
  //
  // PINNED: the axes stay fixed to the whole plottable dataset (domainPoints), so
  // filtering removes points without moving the survivors and you can read where a
  // subset sits inside the full market. Answers "where does this sit in the whole".
  //
  // Either way the axis LABELS are computed from the domain actually in use below,
  // so a shifted domain always carries its own real values — never a rescaled axis
  // with stale numbers.
  const total = domainPoints?.length ? domainPoints.length : points.length
  // When the current set is empty (filters/search exclude everything), fall back
  // to the full extent so the frame stays drawn rather than collapsing — the
  // "no records" overlay is shown over it. Pinned always uses the full extent.
  const basis = pinned
    ? (domainPoints?.length ? domainPoints : points)
    : (points.length ? points : (domainPoints?.length ? domainPoints : points))

  if (!basis.length) {
    return (
      <div className="py-10 text-center text-xs text-[#79747E]">
        Nothing to plot — no rows have both {config.xLabel ?? config.x} and {config.yLabel ?? config.y}.
      </div>
    )
  }

  const xs = basis.map((p) => p.x)
  const ys = basis.map((p) => p.y)
  // Pad the range by 5% so points never sit on the axis line.
  const pad = (lo, hi) => { const d = (hi - lo) || Math.abs(hi) || 1; return [lo - d * 0.05, hi + d * 0.05] }
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs))
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys))

  const sx = (v) => PAD.left + ((v - x0) / (x1 - x0)) * PLOT_W
  const sy = (v) => PAD.top + (1 - (v - y0) / (y1 - y0)) * PLOT_H

  // Radius scales inversely with how many points are on screen: a handful show as
  // large, clearly separated dots; the full ~120-point set stays legible at the
  // small end. Clamped both ways so it never balloons or vanishes.
  const n = points.length || 1
  const baseR = Math.max(3.5, Math.min(8, 26 / Math.sqrt(n)))

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" role="img"
      aria-label={`${config.yLabel ?? config.y} against ${config.xLabel ?? config.x}, ${points.length} of ${total} points shown`}
      // Clicking anywhere that isn't a point toggles the axis mode — the same
      // Fit/Full switch as the corner buttons, on the whole plot's whitespace.
      // Point clicks stopPropagation below, so tapping a mark still opens its
      // record rather than flipping the frame under it.
      onClick={onBackgroundClick}
      style={onBackgroundClick ? { cursor: 'pointer' } : undefined}
      className="block">
      {niceTicks(y0, y1).map((v, i) => (
        <g key={`y${i}`}>
          <line x1={PAD.left} y1={sy(v)} x2={VB_W - PAD.right} y2={sy(v)} stroke="#F3EDF7" strokeWidth="1" />
          <text x={PAD.left - 5} y={sy(v) + 3} textAnchor="end" fontSize="7.5" fill="#79747E">{short(v)}</text>
        </g>
      ))}
      {niceTicks(x0, x1).map((v, i) => (
        <text key={`x${i}`} x={sx(v)} y={VB_H - 14} textAnchor="middle" fontSize="7.5" fill="#79747E">{short(v)}</text>
      ))}

      {points.map((p, i) => {
        const on = selected && p.row.sheetRow === selected.sheetRow
        // A row with no value in the coloured column gets the neutral default
        // rather than a colour that would imply a value it does not have.
        const c = colorFor?.(p.row) ?? null
        const fill = on ? '#6750A4' : (c ?? 'rgba(103,80,164,0.45)')
        return (
          <circle
            key={i}
            cx={sx(p.x)} cy={sy(p.y)} r={on ? baseR + 1.5 : baseR}
            fill={fill}
            // A surface-coloured ring separates overlapping marks. On a dense
            // scatter this is what stops two adjacent points reading as one
            // larger blob of an in-between colour.
            stroke="#fff" strokeWidth={on ? 1.5 : 0.6}
            // Ease between domains rather than snapping when the frame reflows.
            // Chromium (the Android target) transitions these SVG geometry
            // properties via CSS; where it isn't supported the points simply jump,
            // which is the current behaviour, so nothing is lost.
            style={{ cursor: 'pointer', transition: 'cx .35s ease, cy .35s ease, r .2s ease' }}
            onClick={(e) => { e.stopPropagation(); onSelect(p.row) }}
          >
            <title>{p.label}</title>
          </circle>
        )
      })}

      {/* Filters can exclude everything. The axes stay drawn rather than the
          chart collapsing to a message, so the frame does not disappear from
          under you mid-adjustment. */}
      {!points.length && (
        <text x={PAD.left + PLOT_W / 2} y={PAD.top + PLOT_H / 2} textAnchor="middle"
          fontSize="9" fill="#79747E">
          No records match these filters
        </text>
      )}

      <text x={PAD.left + PLOT_W / 2} y={VB_H - 2} textAnchor="middle" fontSize="8" fill="#49454F">
        {config.xLabel ?? config.x}
      </text>
      <text x={10} y={PAD.top + PLOT_H / 2} textAnchor="middle" fontSize="8" fill="#49454F"
        transform={`rotate(-90 10 ${PAD.top + PLOT_H / 2})`}>
        {config.yLabel ?? config.y}
      </text>
    </svg>
  )
}
