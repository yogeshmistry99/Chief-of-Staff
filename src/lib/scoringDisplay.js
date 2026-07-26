// Shared presentation helpers for the four priority-scoring fields
// (consequence / reversibility / compounding / effort) and the computed tier.
//
// Extracted from ComputedPreview.jsx so the scoring data stays renderable after
// the "Computed (preview)" list is removed from the main screen — the preview was
// the only place these lived, and removing it would have taken the display logic
// with it. Pure functions only: no React, no side effects.

import { rankTasks, scoreOf, tierOf, urgencyFactor } from '../../api/_lib/ranking.js'

export { rankTasks, scoreOf, tierOf, urgencyFactor }

// The four scored dimensions, in the order they should always be displayed.
// `key` matches the task field; `short` is for tight layouts.
export const SCORE_FIELDS = [
  { key: 'consequence',   label: 'Consequence',   short: 'Conseq.' },
  { key: 'reversibility', label: 'Reversibility', short: 'Revers.' },
  { key: 'compounding',   label: 'Compounding',   short: 'Compound.' },
  { key: 'effort',        label: 'Effort',        short: 'Effort' },
]

export const EFFORT_OPTIONS = [
  { value: 'S', label: 'S', hint: 'under 30 min' },
  { value: 'M', label: 'M', hint: 'half a day' },
  { value: 'L', label: 'L', hint: 'multi-day' },
]

// 1–5 scales share these end labels so the meaning of "5" is never ambiguous.
export const SCALE_HINTS = {
  consequence:   '5 = life-altering impact',
  reversibility: '5 = the window closes forever',
  compounding:   '5 = foundational, unlocks other things',
}

export const TIER_DOT = {
  0: 'bg-red-500',          // triage: irreversible + high consequence
  1: 'bg-[#6750A4]',        // scored
  unscored: 'bg-[#CAC4D0]', // unscored — ranks last
}

export const TIER_LABEL = {
  0: 'Triage',
  1: 'Scored',
  unscored: 'Unscored',
}

// True when all four fields hold valid values (mirrors ranking.js's isScored,
// which isn't exported).
export function isTaskScored(task) {
  return Number.isInteger(task?.consequence) && task.consequence >= 1 && task.consequence <= 5
    && Number.isInteger(task?.reversibility) && task.reversibility >= 1 && task.reversibility <= 5
    && Number.isInteger(task?.compounding) && task.compounding >= 1 && task.compounding <= 5
    && (task?.effort === 'S' || task?.effort === 'M' || task?.effort === 'L')
}

// Human "due in …" phrase from a YYYY-MM-DD date (matches ranking's urgency curve).
export function duePhrase(date) {
  if (!date) return null
  const dueMs = new Date(date.slice(0, 10) + 'T23:59:59').getTime()
  if (Number.isNaN(dueMs)) return null
  const hours = (dueMs - Date.now()) / 3_600_000
  if (hours <= 0) return 'overdue'
  if (hours <= 36) return 'due in 1 day'
  return `due in ${Math.round(hours / 24)} days`
}

// One plain-language line stating which rule placed the task.
// Accepts a rankTasks() entry: { task, tier, score, rank, urgency }.
export function placementLine(entry) {
  if (!entry) return null
  if (entry.tier === 'unscored') return 'Unscored — ranks below all scored tasks'
  if (entry.tier === 0) return 'Triage — irreversible + high consequence'
  const score = entry.score.toFixed(1)
  if (!entry.urgency || entry.urgency === 1) return `Rank #${entry.rank} — score ${score}, no urgency modifier`
  const due = duePhrase(entry.task.due?.date)
  return `Rank #${entry.rank} — score ${score}, ×${entry.urgency} urgency${due ? ` (${due})` : ''}`
}

// Standalone placement line for a single task, with no ranked list to hand
// (task detail / discussion header, where there is no rank number to show).
// Returns null for an unscored task so callers can render their own empty state.
export function scoreSummary(task, now = new Date()) {
  if (!isTaskScored(task)) return null
  const tier = tierOf(task)
  const score = scoreOf(task, now)
  const urgency = urgencyFactor(task, now)
  const due = duePhrase(task.due?.date)
  return {
    tier,
    score,
    urgency,
    label: tier === 0
      ? 'Triage — irreversible + high consequence'
      : `Score ${score.toFixed(1)}${urgency === 1 ? ', no urgency modifier' : ` · ×${urgency} urgency${due ? ` (${due})` : ''}`}`,
  }
}
