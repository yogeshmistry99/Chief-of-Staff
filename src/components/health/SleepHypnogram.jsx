import { useState } from 'react'
import { haptic } from '../../lib/haptic'
import { formatMinutes } from '../../../api/_lib/health.js'
import {
  layoutSegments, lanesFor, hourTicks, compileLane, stagePercent, typicalRange,
} from '../../lib/hypnogram'

// The night, and the same night compiled.
//
// Two readings of ONE set of blocks. Scattered, they answer "when, and in what
// order" — the same totals are a very different night depending on whether deep
// sleep came in one run or six fragments. Tapped, every lane's pieces slide left
// and pack together, so the four stages become four comparable bars and can be
// read against each other and against what is typical.
//
// THE LANES DO NOT MOVE. Nothing is replaced, nothing is rebuilt: each block
// keeps its width and only its offset changes, which is why the transition is a
// slide rather than a redraw, and why the compiled bar is visibly made of the
// night's own pieces.
//
// The idea is Whoop's. None of the styling is — the stage palette is the one
// already shared with the journal charts, the type scale is the app's, and there
// are no gradients or glows.
//
// NOTHING IS INVENTED. Blocks are the API's own segments. The typical range is
// the real min and max of the nights behind it, not a percentile or a standard
// deviation, and it is drawn only where there is a baseline to draw it from.

function timeLabel(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function Lane({ lane, stages, spanMinutes, baseline, compiled, ticks }) {
  const blocks = compiled ? compileLane(lane.blocks) : lane.blocks
  const percent = stagePercent(lane.type, stages)
  const range = compiled ? typicalRange(lane.type, baseline, spanMinutes) : null

  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="text-[11px] text-[#1C1B1F]">
          {lane.label}
          {percent != null && (
            <span className="ml-1.5 tabular-nums" style={{ color: lane.color }}>{percent}%</span>
          )}
        </span>
        <span className="text-[11px] text-[#1C1B1F] tabular-nums">
          {formatMinutes(stages?.[lane.type])}
        </span>
      </div>

      <div className="relative h-4 rounded bg-[#F3EDF7] overflow-hidden">
        {/* Hour marks, under the blocks. Only meaningful while the night is laid
            out against the clock, so they fade with the compile. */}
        {ticks.map((t) => (
          <span
            key={t.at}
            aria-hidden="true"
            className="absolute top-0 bottom-0 w-px bg-white/70"
            style={{ left: `${t.offset * 100}%`, opacity: compiled ? 0 : 1, transition: 'opacity 0.3s ease' }}
          />
        ))}

        {blocks.map((b) => (
          <span
            key={b.key}
            title={`${b.label} ${timeLabel(b.start)}–${timeLabel(b.end)}`}
            className="absolute top-0 bottom-0"
            style={{
              left: `${(compiled ? b.compiledOffset : b.offset) * 100}%`,
              // A one-minute segment would otherwise be invisible.
              width: `max(2px, ${b.width * 100}%)`,
              backgroundColor: lane.color,
              // Rounded only when packed, so a compiled run reads as one bar
              // while the scattered pieces stay square and countable.
              borderRadius: compiled ? 2 : 1,
              transition: 'left 0.45s cubic-bezier(0.22,1,0.36,1), border-radius 0.3s ease',
            }}
          />
        ))}

        {/* Typical range, over the bar so it can be read against it. */}
        {range && (
          <span
            aria-hidden="true"
            className="absolute top-0 bottom-0 border-x border-dashed border-[#49454F]"
            style={{
              left: `${range.from * 100}%`,
              width: `${(range.to - range.from) * 100}%`,
              backgroundColor: 'rgba(28,27,31,0.10)',
            }}
          />
        )}
      </div>

      {range && (
        <p className="mt-1 text-[10px] text-[#79747E] tabular-nums">
          Typical {formatMinutes(range.min)}–{formatMinutes(range.max)} over {range.nights} nights
        </p>
      )}
    </div>
  )
}

export default function SleepHypnogram({
  segments, start, end, stages, stageBaseline, shortAwakenings, absent,
}) {
  const [compiled, setCompiled] = useState(false)

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
  const spanMinutes = Math.round((Date.parse(end) - Date.parse(start)) / 60000) || null
  const hasBaseline = !!stageBaseline

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="text-[10px] text-[#79747E] uppercase tracking-wide">
          {compiled ? (hasBaseline ? 'Typical range' : 'Totals') : 'Through the night'}
        </span>
        <span className="text-[10px] text-[#79747E] tabular-nums">
          Duration {formatMinutes(spanMinutes)}
        </span>
      </div>

      {/* One target toggles every lane: the point of compiling is to read the
          four against each other, so compiling one alone would answer less. */}
      <button
        type="button"
        onClick={() => { haptic.light(); setCompiled((c) => !c) }}
        className="w-full text-left"
        aria-pressed={compiled}
      >
        {lanes.map((lane) => (
          <Lane
            key={lane.type}
            lane={lane}
            stages={stages}
            spanMinutes={spanMinutes}
            baseline={stageBaseline}
            compiled={compiled}
            ticks={ticks}
          />
        ))}
      </button>

      {!compiled && (
        <div className="flex justify-between mt-0.5">
          <span className="text-[9px] text-[#79747E] tabular-nums">{timeLabel(start)}</span>
          <span className="text-[9px] text-[#79747E] tabular-nums">{timeLabel(end)}</span>
        </div>
      )}

      <p className="mt-2 text-[10px] text-[#79747E] leading-relaxed">
        {compiled
          ? 'Tap to lay the night back out against the clock.'
          : 'Tap to compile each stage into one bar.'}
        {shortAwakenings ? ` ${shortAwakenings} brief awakenings.` : ''}
      </p>
    </div>
  )
}
