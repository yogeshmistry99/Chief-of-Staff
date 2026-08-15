import { useState } from 'react'
import { formatGbp } from '../../lib/sheets'
import { toggleValue, setRange } from '../../lib/trackerFilters'

// The filter panel. Collapsed by default so it never competes with the data,
// but the active count sits on the closed header — a filtered view must never
// look like a complete one.
//
// Select values are chips rather than a multi-select control: one tap each, no
// long-press, no dragging, and the whole set is visible at a glance.

function fmt(v, format) {
  if (v == null) return ''
  return format === 'gbp' ? formatGbp(v) : v.toLocaleString('en-GB')
}

function RangeRow({ def, value, onSet }) {
  const { min = null, max = null } = value ?? {}
  const sel = 'text-[11px] rounded-lg border border-[#CAC4D0] bg-white px-2 py-1.5 flex-1 min-w-0 text-[#1C1B1F]'
  const num = (v) => (v === '' ? null : Number(v))

  return (
    <div className="flex items-center gap-2">
      <select className={sel} value={min ?? ''} onChange={(e) => onSet('min', num(e.target.value))}>
        <option value="">No minimum</option>
        {def.steps.map((s) => <option key={s} value={s}>{fmt(s, def.format)}+</option>)}
      </select>
      <span className="text-[10px] text-[#79747E] flex-shrink-0">to</span>
      <select className={sel} value={max ?? ''} onChange={(e) => onSet('max', num(e.target.value))}>
        <option value="">No maximum</option>
        {def.steps.map((s) => <option key={s} value={s}>up to {fmt(s, def.format)}</option>)}
      </select>
    </div>
  )
}

export default function TrackerFilters({ options, state, onChange, activeCount, shown, total }) {
  const [open, setOpen] = useState(false)
  if (!options?.length) return null

  return (
    <div className="rounded-2xl bg-white border border-[#CAC4D0] mb-3 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <span className="text-xs font-semibold text-[#1C1B1F]">
          Filters
          {activeCount > 0 && (
            <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#EADDFF] text-[#6750A4]">
              {activeCount}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2 flex-shrink-0">
          {/* Always visible, open or closed — the one number that says whether
              what you are looking at is everything. */}
          <span className="text-[10px] text-[#79747E]">
            {shown === total ? `${total} records` : `${shown} of ${total}`}
          </span>
          <span className="text-[10px] text-[#6750A4]">{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-[#F3EDF7] pt-3">
          {options.map((def) => (
            <div key={def.column}>
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-medium text-[#49454F]">{def.label ?? def.column}</span>
                {/* Sparse columns are called out: a range bound excludes rows
                    with no figure, and that should be known before it happens
                    rather than inferred from a shrinking list. */}
                {def.blanks > 0 && (
                  <span className="text-[10px] text-[#79747E]">{def.blanks} blank</span>
                )}
              </div>

              {def.type === 'range' ? (
                def.steps.length ? (
                  <RangeRow
                    def={def}
                    value={state[def.column]}
                    onSet={(bound, v) => onChange(setRange(state, def.column, bound, v))}
                  />
                ) : (
                  <p className="text-[10px] text-[#79747E]">No numeric values in this column.</p>
                )
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {def.values.map(({ value, count }) => {
                    const on = (state[def.column] ?? []).includes(value)
                    return (
                      <button
                        key={value}
                        onClick={() => onChange(toggleValue(state, def.column, value))}
                        className={`text-[11px] px-2.5 py-1.5 rounded-full border ${
                          on
                            ? 'bg-[#6750A4] text-white border-[#6750A4] font-medium'
                            : 'bg-white text-[#49454F] border-[#CAC4D0]'
                        }`}
                      >
                        {value} <span className={on ? 'opacity-70' : 'text-[#79747E]'}>{count}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}

          {activeCount > 0 && (
            <button
              onClick={() => onChange({})}
              className="text-[11px] font-medium text-[#6750A4] underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}
