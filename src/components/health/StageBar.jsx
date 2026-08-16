import { formatMinutes } from '../../../api/_lib/health.js'

// Horizontal stacked bar for a night's sleep stages, plus its own key.
//
// A CLASSIC-type night carries no stage breakdown. That is a property of how the
// night was recorded, not a failure — and it must never render as four zero-width
// segments, which would read as "no deep sleep, no REM" and be a false claim
// about a real night. The caller passes `absent` and this renders the sentence
// instead of the bar.

export default function StageBar({ segments, absent = null }) {
  if (absent || !segments?.length) {
    return (
      <p className="text-[#79747E] text-xs leading-relaxed">
        {absent ?? 'No stage detail for this night.'}
      </p>
    )
  }

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-[#F3EDF7]">
        {segments.map((s) => (
          <div
            key={s.key}
            style={{ width: `${s.fraction * 100}%`, backgroundColor: s.color }}
            title={`${s.label} ${formatMinutes(s.minutes)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5">
        {segments.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-[#49454F]">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            {s.label}
            <span className="text-[#79747E] tabular-nums">{formatMinutes(s.minutes)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
