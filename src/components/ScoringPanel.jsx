import { useState } from 'react'
import {
  SCORE_FIELDS, EFFORT_OPTIONS, SCALE_HINTS, TIER_DOT, TIER_LABEL,
  isTaskScored, scoreSummary,
} from '../lib/scoringDisplay'

// Collapsed-by-default "Scoring" section surfacing the four priority-scoring
// fields (consequence / reversibility / compounding / effort) plus the computed
// tier. Sits alongside the description rather than on a screen of its own.
//
// Two modes:
//   read-only (default) — task detail view, discussion header.
//   editable            — the edit sheet. Effort is rendered first and largest:
//                         it's the least reliable and highest-leverage number,
//                         so it's the one that most needs correcting by hand.
//
// Unscored tasks render an explicit empty state (never a crash, never blank
// zeros) — an unscored task is a real, common state, not an error.

function ScaleRow({ label, hint, value, onChange }) {
  return (
    <div className="mb-2.5">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[11px] font-medium text-[#49454F]">{label}</p>
        <p className="text-[9px] text-[#79747E]">{hint}</p>
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              value === n
                ? 'bg-[#6750A4] text-white'
                : 'bg-[#F3EDF7] text-[#6750A4] hover:bg-[#EADDFF]'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ScoringPanel({
  task,
  editable = false,
  values = null,
  onChange = null,
  defaultOpen = false,
  // Fired with the new open state. Callers that render this inside a fixed
  // max-height container (the task-detail drawers) need it to grow the container,
  // otherwise the expanded panel is clipped.
  onToggle = null,
  className = '',
}) {
  const [open, setOpen] = useState(defaultOpen)

  function toggle() {
    const next = !open
    setOpen(next)
    onToggle?.(next)
  }

  // In editable mode the live edit state wins so the summary updates as you type;
  // otherwise read straight off the task.
  const current = editable && values ? { ...task, ...values } : task
  const scored = isTaskScored(current)
  const summary = scoreSummary(current)
  const tier = scored ? summary.tier : 'unscored'

  return (
    <div className={`border border-[#CAC4D0] rounded-xl overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left bg-[#F7F2FA]"
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TIER_DOT[tier]}`} />
        <span className="text-xs font-semibold text-[#1C1B1F]">Scoring</span>
        <span className="text-[10px] text-[#79747E] flex-1 min-w-0 truncate">
          {scored ? `${TIER_LABEL[tier]} · ${summary.score.toFixed(1)}` : 'Not yet scored'}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 -960 960 960" width="14"
          fill="#79747E" className={`flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z" />
        </svg>
      </button>

      {open && (
        <div className="px-3 py-2.5 bg-white">
          {editable ? (
            <>
              {/* Effort first and largest — least reliable, highest leverage. */}
              <div className="mb-3">
                <p className="text-[11px] font-medium text-[#49454F] mb-1">Effort</p>
                <div className="flex gap-1.5">
                  {EFFORT_OPTIONS.map(({ value, label, hint }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onChange?.('effort', value)}
                      className={`flex-1 py-2 rounded-lg transition-colors ${
                        current?.effort === value
                          ? 'bg-[#6750A4] text-white'
                          : 'bg-[#F3EDF7] text-[#6750A4] hover:bg-[#EADDFF]'
                      }`}
                    >
                      <span className="block text-sm font-bold leading-none">{label}</span>
                      <span className="block text-[9px] opacity-75 mt-0.5">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {['consequence', 'reversibility', 'compounding'].map((key) => (
                <ScaleRow
                  key={key}
                  label={SCORE_FIELDS.find((f) => f.key === key).label}
                  hint={SCALE_HINTS[key]}
                  value={current?.[key] ?? null}
                  onChange={(n) => onChange?.(key, n)}
                />
              ))}

              <p className="text-[10px] text-[#79747E] mt-1">
                {scored
                  ? summary.label
                  : 'Set all four to score this task — until then it ranks below every scored task.'}
              </p>
            </>
          ) : scored ? (
            <>
              <div className="flex gap-4 mb-1.5">
                {SCORE_FIELDS.map(({ key, short }) => (
                  <div key={key}>
                    <p className="text-[9px] text-[#79747E] uppercase tracking-wide">{short}</p>
                    <p className="text-sm font-semibold text-[#1C1B1F]">{current[key]}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[#79747E]">{summary.label}</p>
            </>
          ) : (
            <p className="text-[11px] text-[#79747E]">
              Not yet scored — ranks below all scored tasks. Scores are set automatically on
              creation, or by hand on the edit screen.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
