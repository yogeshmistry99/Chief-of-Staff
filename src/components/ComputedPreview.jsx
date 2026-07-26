import { useMemo, useState } from 'react'
import { rankTasks, placementLine, TIER_DOT, SCORE_FIELDS } from '../lib/scoringDisplay'

// Read-only "Computed (preview)" list — the deterministic ranking running in
// parallel with the CoS-generated priority list. List view shows rank + a
// tier dot only (no raw numbers); tapping a row reveals the four scores and
// the rule that placed it. Purely informational: no writes, no actions.
//
// Display helpers (placementLine / duePhrase / TIER_DOT / SCORE_FIELDS) live in
// src/lib/scoringDisplay.js so they're shared with ScoringPanel and survive this
// component's eventual removal from the main screen.

export default function ComputedPreview({ tasks }) {
  const [expandedId, setExpandedId] = useState(null)
  const ranked = useMemo(() => rankTasks(tasks), [tasks])

  if (!ranked.length) return null

  return (
    <div className="bg-white border border-[#CAC4D0] rounded-2xl p-4 mb-3 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-[#1C1B1F]">Computed (preview)</h2>
        <span className="text-[10px] text-[#79747E]">deterministic · read-only</span>
      </div>
      <p className="text-[11px] text-[#79747E] mb-2">Rule-based ranking from task scores. Tap a row for the why.</p>

      {ranked.slice(0, 15).map((entry, i) => {
        const { task, tier } = entry
        const isOpen = expandedId === task.id
        const unscored = tier === 'unscored'
        return (
          <div key={task.id} className="border-b border-[#F3EDF7] last:border-b-0">
            <button
              onClick={() => setExpandedId(isOpen ? null : task.id)}
              className="w-full flex items-center gap-2.5 py-2 text-left"
            >
              <span className="text-[11px] font-bold text-[#79747E] w-5 flex-shrink-0 text-right">{i + 1}</span>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TIER_DOT[tier]}`} />
              <span className={`flex-1 text-xs leading-snug min-w-0 truncate ${unscored ? 'text-[#79747E]' : 'text-[#1C1B1F]'}`}>
                {task.pinned && <span className="mr-1">📌</span>}
                {task.content}
              </span>
              {unscored && (
                <span className="text-[9px] font-semibold text-[#79747E] bg-[#F3EDF7] px-1.5 py-0.5 rounded-full flex-shrink-0">unscored</span>
              )}
            </button>
            {isOpen && (
              <div className="pb-2.5 pl-9 pr-2">
                {unscored ? (
                  <p className="text-[11px] text-[#79747E]">{placementLine(entry)}</p>
                ) : (
                  <>
                    <div className="flex gap-3 mb-1">
                      {SCORE_FIELDS.map(({ key, label }) => (
                        <div key={key}>
                          <p className="text-[9px] text-[#79747E] uppercase tracking-wide">{label}</p>
                          <p className="text-xs font-semibold text-[#1C1B1F]">{task[key]}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-[#79747E]">{placementLine(entry)}</p>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
