import { useMemo, useState } from 'react'
import { haptic } from '../lib/haptic'
import JournalChart from './JournalChart'
import {
  RANGES, OVERALL_KEY, buildSeries, chartOptions, coverage, dateRange,
} from '../lib/journalChart'

// Layering more than a handful of lines makes all of them unreadable, which is
// worse than not offering it. The cap is stated in the UI when it is reached
// rather than taps being silently ignored.
const MAX_SERIES = 6

export default function JournalTrends({ entries }) {
  const [rangeKey, setRangeKey] = useState('month')
  const [selected, setSelected] = useState([OVERALL_KEY])
  const [pickerOpen, setPickerOpen] = useState(false)

  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[1]
  const dates = useMemo(() => dateRange(range.days), [range.days])
  const series = useMemo(() => buildSeries(entries, selected, dates), [entries, selected, dates])
  const { logged, total } = useMemo(() => coverage(entries, dates), [entries, dates])

  const options = useMemo(chartOptions, [])
  const grouped = useMemo(() => {
    const out = []
    for (const o of options) {
      const last = out[out.length - 1]
      if (last?.group === o.group) last.items.push(o)
      else out.push({ group: o.group, items: [o] })
    }
    return out
  }, [options])

  const atCap = selected.length >= MAX_SERIES

  function toggle(key) {
    haptic.light()
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key)
      if (prev.length >= MAX_SERIES) return prev
      return [...prev, key]
    })
  }

  return (
    <div className="pb-4">
      {/* Range */}
      <div className="flex gap-1.5 my-3">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => { haptic.light(); setRangeKey(r.key) }}
            className={`flex-1 py-2 rounded-full text-xs font-medium transition-colors ${
              r.key === rangeKey ? 'bg-[#6750A4] text-white' : 'bg-[#F3EDF7] text-[#49454F]'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-white border border-[#CAC4D0] p-3">
        <JournalChart dates={dates} series={series} />

        {/* Coverage is shown with the chart, not buried: a flat-looking year
            with nine entries in it means something very different from a flat
            year with three hundred, and the line alone doesn't say which. */}
        <p className="mt-1 text-[11px] text-[#79747E]">
          {logged} {logged === 1 ? 'entry' : 'entries'} in these {total} days
          {logged < total && ' · gaps are days with no entry, and the line breaks across them'}
        </p>

        {series.length > 0 && (
          <div className="mt-2.5 pt-2.5 border-t border-[#F3EDF7] space-y-1.5">
            {series.map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-[11px]">
                <span
                  className="w-4 h-0 border-t-2 flex-shrink-0"
                  style={{ borderColor: s.color, borderStyle: s.inverted ? 'dashed' : 'solid' }}
                  aria-hidden
                />
                <span className="text-[#1C1B1F] flex-1 min-w-0">{s.label}</span>
                <span className="text-[#79747E] flex-shrink-0">
                  {s.recorded} {s.recorded === 1 ? 'day' : 'days'}
                </span>
              </div>
            ))}
            {series.some((s) => s.inverted) && (
              <p className="text-[11px] text-[#79747E] pt-1 leading-relaxed">
                Dashed line: sleep quality runs the opposite way — 4 is good sleep, where 4 is worst
                for everything else.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Picker */}
      <button
        onClick={() => { haptic.light(); setPickerOpen((v) => !v) }}
        className="w-full mt-3 py-3 rounded-2xl bg-[#F3EDF7] text-sm text-[#49454F] font-medium"
      >
        {pickerOpen ? 'Done choosing' : `Choose what to plot (${selected.length})`}
      </button>

      {pickerOpen && (
        <div className="mt-2 rounded-2xl bg-white border border-[#CAC4D0] p-3">
          {atCap && (
            <p className="mb-2 text-[11px] text-[#79747E] leading-relaxed">
              Showing the most that stay readable at once. Remove one to add another.
            </p>
          )}
          {grouped.map(({ group, items }) => (
            <div key={group} className="mb-3 last:mb-0">
              <p className="text-[11px] text-[#79747E] mb-1.5">{group}</p>
              <div className="flex flex-wrap gap-1.5">
                {items.map((o) => {
                  const on = selected.includes(o.key)
                  const colour = series.find((s) => s.key === o.key)?.color
                  return (
                    <button
                      key={o.key}
                      onClick={() => toggle(o.key)}
                      aria-pressed={on}
                      disabled={!on && atCap}
                      className={`px-3 py-2 rounded-full text-xs transition-colors ${
                        on
                          ? 'text-white'
                          : atCap
                            ? 'bg-[#F3EDF7] text-[#CAC4D0]'
                            : 'bg-[#F3EDF7] text-[#49454F]'
                      }`}
                      style={on && colour ? { backgroundColor: colour } : undefined}
                    >
                      {o.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
