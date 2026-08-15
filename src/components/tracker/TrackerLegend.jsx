import { formatGbp } from '../../lib/sheets'

// The key for the coloured scatter.
//
// A legend is not optional here: identity must never be carried by colour
// alone. It also never wraps — one horizontally scrolling row — because it
// lives inside the pinned block, and a legend that grew to two lines would push
// the chart down as soon as it was shown.
//
// Labels are in ink, not in the series colour; the swatch beside them carries
// the identity. Two of the five hues sit below 3:1 against a white surface, and
// a visible label is exactly the relief that permits their use.

function fmt(v, format) {
  if (v == null) return ''
  return format === 'gbp' ? formatGbp(v) : Math.round(v).toLocaleString('en-GB')
}

export default function TrackerLegend({ scale }) {
  if (!scale) return null

  if (scale.mode === 'gradient') {
    return (
      <div className="flex items-center gap-2 mt-2 h-[18px]">
        <span className="text-[9px] text-[#49454F] flex-shrink-0 truncate max-w-[38%]">{scale.label}</span>
        <span className="text-[9px] text-[#79747E] flex-shrink-0">{fmt(scale.min, scale.format)}</span>
        <span className="flex-1 flex h-[8px] rounded-full overflow-hidden min-w-0">
          {scale.stops.map((c) => (
            <span key={c} className="flex-1" style={{ backgroundColor: c }} />
          ))}
        </span>
        <span className="text-[9px] text-[#79747E] flex-shrink-0">{fmt(scale.max, scale.format)}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5 mt-2 h-[18px] overflow-x-auto whitespace-nowrap">
      {scale.legend.map((e) => (
        <span key={e.label} className="flex items-center gap-1 flex-shrink-0">
          <span
            className="w-[9px] h-[9px] rounded-full flex-shrink-0"
            style={{ backgroundColor: e.color }}
          />
          <span className="text-[9px] text-[#49454F]">{e.label}</span>
        </span>
      ))}
    </div>
  )
}
