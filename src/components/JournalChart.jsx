import { MAX_SCORE } from '../../api/_lib/journalSymptoms.js'
import { axisDates } from '../lib/journalChart'

// Hand-rolled inline SVG rather than a charting library.
//
// The data is date × 0–4 — a line and some gridlines. A library would add
// ~100KB to a bundle that is already 490KB, on a page reached from a tab strip
// that mounts every screen at once, to draw something this simple.
//
// Two properties that are NOT cosmetic, because this chart sits beside a
// clinical record and a personal injury claim:
//   • A day with no entry breaks the line. Nothing is interpolated across a
//     gap — a drawn-through line would show a trend nobody observed.
//   • A single isolated entry always renders as a dot, at every zoom level. One
//     observation is still evidence and must not disappear into a dense window.

const VB_W = 320
const VB_H = 180
const PAD = { top: 10, right: 8, bottom: 20, left: 24 }

const PLOT_W = VB_W - PAD.left - PAD.right
const PLOT_H = VB_H - PAD.top - PAD.bottom

export default function JournalChart({ dates, series }) {
  const n = dates.length

  const x = (i) => (n <= 1 ? PAD.left + PLOT_W / 2 : PAD.left + (i / (n - 1)) * PLOT_W)
  const y = (v) => PAD.top + (1 - v / MAX_SCORE) * PLOT_H

  // Dots would turn a six-month window into a solid band, so they are dropped
  // once the days outnumber the pixels available for them — except for runs of
  // one, which are drawn always (see the note above).
  const showDots = n <= 45

  const anyData = series.some((s) => s.recorded > 0)

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width="100%"
      role="img"
      aria-label={
        anyData
          ? `Symptom scores over the last ${n} days: ${series.map((s) => s.label).join(', ')}`
          : 'No entries recorded in this period'
      }
      className="block"
    >
      {/* Gridlines and the 0–4 scale. Every score gets a line, so a reader can
          place a point without counting. */}
      {Array.from({ length: MAX_SCORE + 1 }, (_, v) => (
        <g key={v}>
          <line
            x1={PAD.left} y1={y(v)} x2={VB_W - PAD.right} y2={y(v)}
            stroke={v === 0 ? '#CAC4D0' : '#F3EDF7'} strokeWidth="1"
          />
          <text
            x={PAD.left - 6} y={y(v) + 3}
            textAnchor="end" fontSize="8" fill="#79747E"
          >
            {v}
          </text>
        </g>
      ))}

      {/* x-axis: first, middle, last */}
      {axisDates(dates).map(({ i, label }) => (
        <text
          key={i}
          x={x(i)}
          y={VB_H - 6}
          textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
          fontSize="8"
          fill="#79747E"
        >
          {label}
        </text>
      ))}

      {series.map((s) =>
        s.segments.map((seg, si) => {
          // A run of one has no line to draw — only a point. Always rendered.
          if (seg.length === 1) {
            return (
              <circle
                key={`${s.key}-${si}`}
                cx={x(seg[0].i)} cy={y(seg[0].v)} r="2.2"
                fill={s.color}
              />
            )
          }
          const d = seg.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ')
          return (
            <g key={`${s.key}-${si}`}>
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                // Sleep quality runs the opposite way to every other item, so it
                // is dashed — a reader who misses the legend still sees that this
                // line is not like the others.
                strokeDasharray={s.inverted ? '4 3' : undefined}
              />
              {showDots && seg.map((p) => (
                <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r="1.8" fill={s.color} />
              ))}
            </g>
          )
        })
      )}

      {!anyData && (
        <text
          x={PAD.left + PLOT_W / 2} y={PAD.top + PLOT_H / 2}
          textAnchor="middle" fontSize="9" fill="#79747E"
        >
          No entries in this period
        </text>
      )}
    </svg>
  )
}
