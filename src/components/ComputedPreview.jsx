import { useMemo, useState } from 'react'
import { rankTasks } from '../../api/_lib/ranking.js'

// Read-only "Computed (preview)" list — the deterministic ranking running in
// parallel with the CoS-generated priority list. List view shows rank + a
// tier dot only (no raw numbers); tapping a row reveals the four scores and
// the rule that placed it. Purely informational: no writes, no actions.

// Human "due in …" phrase from a YYYY-MM-DD date (matches ranking's urgency curve).
function duePhrase(date) {
  if (!date) return null
  const dueMs = new Date(date.slice(0, 10) + 'T23:59:59').getTime()
  if (Number.isNaN(dueMs)) return null
  const hours = (dueMs - Date.now()) / 3_600_000
  if (hours <= 0) return 'overdue'
  if (hours <= 36) return 'due in 1 day'
  return `due in ${Math.round(hours / 24)} days`
}

// One plain-language line stating which rule placed the task.
function placementLine(entry) {
  if (entry.tier === 'unscored') return 'Unscored — ranks below all scored tasks'
  if (entry.tier === 0) return 'Triage — irreversible + high consequence'
  const score = entry.score.toFixed(1)
  if (!entry.urgency || entry.urgency === 1) return `Rank #${entry.rank} — score ${score}, no urgency modifier`
  const due = duePhrase(entry.task.due?.date)
  return `Rank #${entry.rank} — score ${score}, ×${entry.urgency} urgency${due ? ` (${due})` : ''}`
}

const TIER_DOT = {
  0: 'bg-red-500',          // triage: irreversible + high consequence
  1: 'bg-[#6750A4]',        // scored
  unscored: 'bg-[#CAC4D0]', // unscored — ranks last
}

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
                      {[
                        ['Consequence', task.consequence],
                        ['Reversibility', task.reversibility],
                        ['Compounding', task.compounding],
                        ['Effort', task.effort],
                      ].map(([label, v]) => (
                        <div key={label}>
                          <p className="text-[9px] text-[#79747E] uppercase tracking-wide">{label}</p>
                          <p className="text-xs font-semibold text-[#1C1B1F]">{v}</p>
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
