import { PROJECTS } from './todoist'

// Layer 4 — bucket weights (Finance is the foundation, Health is non-negotiable)
export const BUCKET_WEIGHTS = {
  Finance:  35,
  Health:   30,
  Work:     25,
  Family:   20,
  Home:     10,
  Personal:  8,
  Systems:   8,
}

const PROJECT_TO_BUCKET = Object.fromEntries(
  Object.entries(PROJECTS).map(([name, id]) => [id, name])
)

function daysDiff(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Append T00:00:00 so the date parses as local midnight, not UTC midnight
  const due = new Date(dateStr + 'T00:00:00')
  return Math.round((due - today) / (1000 * 60 * 60 * 24))
}

export function scoreTask(task) {
  let score = 0
  const reasons = []

  const bucket = PROJECT_TO_BUCKET[task.project_id]
  const bucketWeight = BUCKET_WEIGHTS[bucket] ?? 5
  const days = task.due ? daysDiff(task.due.date.slice(0, 10)) : null
  const isOverdue = days !== null && days < 0
  const isToday = days === 0
  const isSoon = days !== null && days > 0 && days <= 3

  // Layer 7 — Someday: no due date + P4 → excluded (caller filters these out)
  if (!task.due && task.priority === 1) {
    return { score: -1, reasons: ['someday'], bucket, isOverdue, isToday }
  }

  // Layer 1 — Date proximity.
  // RULE (26 July 2026): only overdue and due-today auto-surface at the top.
  // Everything else with a date weighs in normally rather than jumping the
  // queue — a date alone is no longer a category override. The sub-today bands
  // mirror the urgency curve in api/_lib/ranking.js (×2 / ×1.5 / ×1.2 / ×1) in
  // additive form, but only the first band is large enough to auto-surface.
  // Previously due-tomorrow (+75) and due-in-≤3-days (+55) outweighed even
  // P1 (+50) plus any bucket weight, so any near-dated task topped the list.
  if (isOverdue) {
    score += 90
    reasons.push('overdue')
  } else if (isToday) {
    score += 100
    reasons.push('due today')
  } else if (days !== null && days <= 7) {
    score += 15
    reasons.push(days === 1 ? 'due tomorrow' : `due in ${days} days`)
  } else if (days !== null && days <= 14) {
    score += 8
    reasons.push(`due in ${days} days`)
  }

  // Layer 2 — Triage: P1 is the triage signal
  if (task.priority === 4) {
    score += 50
    reasons.push('P1')
  } else if (task.priority === 3) {
    score += 20
    reasons.push('P2')
  } else if (task.priority === 2) {
    score += 8
    reasons.push('P3')
  }

  // Layer 4 — Bucket weight
  score += bucketWeight

  // Layer 5 — P1 compounds: irreversibility/leverage proxy
  if (task.priority === 4 && (isToday || isOverdue)) {
    score += 25
    reasons.push('urgent P1')
  }

  return { score, reasons, bucket, isOverdue, isToday, days }
}

// Sort tasks by score descending, exclude someday and completed from main list
export function prioritise(tasks) {
  const open = tasks.filter((t) => !t.is_completed)
  const scored = open.map((t) => ({ ...t, _scored: scoreTask(t) }))
  const active = scored
    .filter((t) => t._scored.score >= 0)
    .sort((a, b) => b._scored.score - a._scored.score)
  const someday = scored.filter((t) => t._scored.score === -1)
  return { active, someday }
}
