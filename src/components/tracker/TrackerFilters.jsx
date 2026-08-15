import { useState } from 'react'
import { formatGbp } from '../../lib/sheets'
import { toggleValue, setRange } from '../../lib/trackerFilters'

// The filter panel. Collapsed by default so it never competes with the data,
// but the active count sits on the closed header — a filtered view must never
// look like a complete one.
//
// EACH CATEGORY COLLAPSES TOO, and closed is the default. Seven categories
// opened at once ran to well over a screen (Property type alone is 17 values),
// which pushed the chart off the top on a phone and made the panel something to
// scroll through rather than scan. Closed, the whole filter set fits in a
// glance and you open only the one you want.
//
// A closed category still states itself: its current selection when it has one,
// otherwise what is inside it. Hiding a control must never hide that it is
// active — the same rule as the panel's own count.
//
// Select values are chips rather than a multi-select control: one tap each, no
// long-press, no dragging.

function fmt(v, format) {
  if (v == null) return ''
  return format === 'gbp' ? formatGbp(v) : v.toLocaleString('en-GB')
}

// What a closed category shows on the right when it IS filtering.
function selectionLabel(def, sel) {
  if (def.type === 'range') {
    const { min = null, max = null } = sel ?? {}
    if (min == null && max == null) return null
    if (min != null && max != null) return `${fmt(min, def.format)} – ${fmt(max, def.format)}`
    if (min != null) return `${fmt(min, def.format)}+`
    return `up to ${fmt(max, def.format)}`
  }
  if (!Array.isArray(sel) || !sel.length) return null
  return sel.length === 1 ? sel[0] : `${sel[0]} +${sel.length - 1}`
}

// …and what it shows when it is not: enough to judge whether opening it is
// worth a tap.
function restingHint(def) {
  if (def.type === 'range') {
    return def.steps.length ? `${fmt(def.min, def.format)} – ${fmt(def.max, def.format)}` : 'no values'
  }
  return `${def.values.length} options`
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
  // Per-category, keyed by column. Independent rather than an accordion —
  // comparing an area against a price band means having both open.
  const [openSections, setOpenSections] = useState({})
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
        <div className="border-t border-[#F3EDF7]">
          {options.map((def) => {
            const sel = state[def.column]
            const chosen = selectionLabel(def, sel)
            const isOpen = !!openSections[def.column]

            return (
              <div key={def.column} className="border-b border-[#F3EDF7] last:border-b-0">
                <button
                  onClick={() => setOpenSections((s) => ({ ...s, [def.column]: !s[def.column] }))}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
                >
                  <span className="text-[11px] font-medium text-[#49454F] flex-shrink-0">
                    {def.label ?? def.column}
                  </span>
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className={`text-[10px] truncate ${
                        chosen ? 'text-[#6750A4] font-medium' : 'text-[#79747E]'
                      }`}
                    >
                      {chosen ?? restingHint(def)}
                    </span>
                    <span className="text-[10px] text-[#6750A4] flex-shrink-0">
                      {isOpen ? '▲' : '▼'}
                    </span>
                  </span>
                </button>

                {isOpen && (
                  <div className="px-3 pb-3">
                    {/* Sparse columns are called out: a range bound excludes
                        rows with no figure, and that should be known before it
                        happens rather than inferred from a shrinking list. */}
                    {def.blanks > 0 && (
                      <p className="text-[10px] text-[#79747E] mb-1.5">
                        {def.blanks} of {total} records have no value here
                        {def.type === 'range' ? ' and are excluded while a bound is set.' : '.'}
                      </p>
                    )}

                    {def.type === 'range' ? (
                      def.steps.length ? (
                        <RangeRow
                          def={def}
                          value={sel}
                          onSet={(bound, v) => onChange(setRange(state, def.column, bound, v))}
                        />
                      ) : (
                        <p className="text-[10px] text-[#79747E]">No numeric values in this column.</p>
                      )
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {def.values.map(({ value, count }) => {
                          const on = (sel ?? []).includes(value)
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
                )}
              </div>
            )
          })}

          {activeCount > 0 && (
            <div className="px-3 py-2.5">
              <button
                onClick={() => onChange({})}
                className="text-[11px] font-medium text-[#6750A4] underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
