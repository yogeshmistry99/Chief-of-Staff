import { useState } from 'react'
import { haptic } from '../../lib/haptic'
import { formatMinutes } from '../../../api/_lib/health.js'
import { layoutSegments, lanesFor, hourTicks, stageComparison } from '../../lib/hypnogram'

// The night against the clock, and each stage against what is usual.
//
// Two views of the same data, which is the point. The lanes answer "when, and in
// what order" — the same totals can be one unbroken run of deep sleep or six
// fragments, and only a time axis tells those apart. Tapping a lane switches to
// the comparison: how much of that stage tonight, against the average of the
// nights behind it.
//
// The idea is Whoop's; none of the styling is. Colours are the stage palette
// already shared with the stage bar and the journal charts, the type scale is
// the app's, and there are no gradients or glows.
//
// NOTHING IS INVENTED. Blocks come from the API's own stage segments, and the
// "usual" line only appears where there were at least two nights to average.
// A stage with no baseline shows its own total and says the comparison is not
// available rather than drawing a bar against nothing.

function timeLabel(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function Comparison({ comparison, onBack }) {
  const { label, color, tonight, usual, nights, tonightFraction, usualFraction, difference } = comparison
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2.5">
        <span className="text-sm text-[#1C1B1F]">{label}</span>
        <button type="button" onClick={onBack} className="text-[11px] text-[#6750A4]">
          ← Back to the night
        </button>
      </div>

      <div className="space-y-2">
        <div>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="text-[11px] text-[#49454F]">Last night</span>
            <span className="text-[11px] text-[#1C1B1F] tabular-nums">{formatMinutes(tonight)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-[#F3EDF7] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${tonightFraction * 100}%`, backgroundColor: color }} />
          </div>
        </div>

        {usual != null ? (
          <div>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-[11px] text-[#49454F]">Usual for you</span>
              <span className="text-[11px] text-[#1C1B1F] tabular-nums">{formatMinutes(usual)}</span>
            </div>
            {/* The usual bar is muted: it is the reference, not the reading. */}
            <div className="h-2.5 rounded-full bg-[#F3EDF7] overflow-hidden">
              <div className="h-full rounded-full bg-[#CAC4D0]" style={{ width: `${usualFraction * 100}%` }} />
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-[#79747E] leading-relaxed">
            Not enough recent nights to say what is usual for this stage yet.
          </p>
        )}
      </div>

      {difference != null && (
        <p className="mt-2 text-[11px] text-[#79747E] leading-relaxed">
          {difference === 0
            ? `Exactly your usual, across ${nights} nights.`
            : `${formatMinutes(Math.abs(difference))} ${difference > 0 ? 'more' : 'less'} than your usual, across ${nights} nights.`}
        </p>
      )}
    </div>
  )
}

export default function SleepHypnogram({ segments, start, end, stages, stageBaseline, shortAwakenings, absent }) {
  const [selected, setSelected] = useState(null)

  const blocks = layoutSegments(segments, start, end)

  // A night with totals but no segments is a real night recorded without the
  // per-stage timing — it must say so rather than render an empty axis.
  if (absent || !blocks.length) {
    return (
      <p className="text-[#79747E] text-xs leading-relaxed">
        {absent ?? 'This night was recorded without stage timings.'}
      </p>
    )
  }

  const lanes = lanesFor(blocks)
  const ticks = hourTicks(start, end)
  const comparison = selected ? stageComparison(selected, stages, stageBaseline) : null

  if (comparison) {
    return <Comparison comparison={comparison} onBack={() => { haptic.light(); setSelected(null) }} />
  }

  return (
    <div>
      <div className="space-y-1">
        {lanes.map((lane) => (
          <button
            key={lane.type}
            type="button"
            onClick={() => { haptic.light(); setSelected(lane.type) }}
            className="w-full flex items-center gap-2 text-left"
          >
            <span className="w-11 flex-shrink-0 text-[10px] text-[#49454F]">{lane.label}</span>
            <span className="relative flex-1 h-4 rounded bg-[#F3EDF7] overflow-hidden">
              {/* Hour marks sit under the blocks so they never obscure a stage. */}
              {ticks.map((t) => (
                <span
                  key={t.at}
                  aria-hidden="true"
                  className="absolute top-0 bottom-0 w-px bg-white/70"
                  style={{ left: `${t.offset * 100}%` }}
                />
              ))}
              {lane.blocks.map((b) => (
                <span
                  key={b.key}
                  title={`${b.label} ${timeLabel(b.start)}–${timeLabel(b.end)}`}
                  className="absolute top-0 bottom-0 rounded-sm"
                  style={{
                    left: `${b.offset * 100}%`,
                    // A one-minute segment would otherwise be invisible.
                    width: `max(2px, ${b.width * 100}%)`,
                    backgroundColor: lane.color,
                  }}
                />
              ))}
            </span>
            <span className="w-10 flex-shrink-0 text-[10px] text-[#79747E] tabular-nums text-right">
              {formatMinutes(stages?.[lane.type])}
            </span>
          </button>
        ))}
      </div>

      {/* The axis, at the two ends. Hour marks are drawn but not labelled — on a
          phone the labels would collide, and the ends are what anchor the night. */}
      <div className="flex justify-between mt-1 pl-[52px] pr-[44px]">
        <span className="text-[9px] text-[#79747E] tabular-nums">{timeLabel(start)}</span>
        <span className="text-[9px] text-[#79747E] tabular-nums">{timeLabel(end)}</span>
      </div>

      <p className="mt-2 text-[10px] text-[#79747E] leading-relaxed">
        Tap a stage to compare it with your usual.
        {shortAwakenings ? ` ${shortAwakenings} brief awakenings.` : ''}
      </p>
    </div>
  )
}
