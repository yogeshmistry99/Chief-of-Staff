// Deterministic priority ranking — pure functions, no LLM anywhere.
// Shared by the server and the client preview (plain ESM, no dependencies).
//
// Tiers:
//   Tier 0 (triage): reversibility === 5 AND consequence >= 4 — the window is
//     closing on something major; always surfaces first, regardless of score.
//   Tier 1: everything else scored, ordered by
//     score = (consequence × urgency × reversibility × compounding) / effortWeight
//     where effortWeight S=1, M=2, L=3.
//   Unscored tasks rank below ALL scored tasks and are flagged.
//   pinned floats a task to the top of its tier (manual override; never
//   promotes across tiers).
//
// Urgency curve — multiplies consequence only when a REAL due date exists
// (we never invent dates). Chosen so urgency can lift a task within its
// tier but a distant deadline changes nothing:
//   no due date          → ×1.0
//   due in > 14 days     → ×1.0
//   due in 7–14 days     → ×1.2   (on the radar)
//   due in 48h–7 days    → ×1.5   (this week — matters now)
//   due in < 48h or late → ×2.0   (imminent/overdue — dominates its peers)
// Tier-0 triage uses the RAW consequence (>= 4), not the urgency-boosted
// value, so a closing deadline can't fake its way into triage.

const BUCKET_ORDER = ['Finance', 'Health', 'Work', 'Family', 'Home', 'Personal', 'Systems']
const EFFORT_WEIGHT = { S: 1, M: 2, L: 3 }

function isScored(t) {
  return Number.isInteger(t?.consequence) && t.consequence >= 1 && t.consequence <= 5
    && Number.isInteger(t?.reversibility) && t.reversibility >= 1 && t.reversibility <= 5
    && Number.isInteger(t?.compounding) && t.compounding >= 1 && t.compounding <= 5
    && (t?.effort === 'S' || t?.effort === 'M' || t?.effort === 'L')
}

export function urgencyFactor(task, now = new Date()) {
  const due = task?.due?.date
  if (!due) return 1.0
  const dueMs = new Date(due.slice(0, 10) + 'T23:59:59').getTime()
  if (Number.isNaN(dueMs)) return 1.0
  const hours = (dueMs - now.getTime()) / 3_600_000
  if (hours <= 48) return 2.0        // overdue or due within 48h
  if (hours <= 7 * 24) return 1.5    // within 7 days
  if (hours <= 14 * 24) return 1.2   // within 14 days
  return 1.0
}

export function scoreOf(task, now = new Date()) {
  if (!isScored(task)) return null
  return (task.consequence * urgencyFactor(task, now) * task.reversibility * task.compounding)
    / EFFORT_WEIGHT[task.effort]
}

export function tierOf(task) {
  if (!isScored(task)) return 'unscored'
  if (task.reversibility === 5 && task.consequence >= 4) return 0
  return 1
}

function bucketIndex(t) {
  const i = BUCKET_ORDER.indexOf(t?._projectName)
  return i === -1 ? BUCKET_ORDER.length : i
}

// Rank active (non-completed, top-level) tasks. Returns entries:
//   { task, tier: 0|1|'unscored', score: number|null, rule: string }
// Order: tier 0 → tier 1 → unscored. Within a tier: pinned first, then
// score descending; bucket order breaks ties ONLY (equal scores), then
// created_at (older first) as a final stable fallback.
export function rankTasks(tasks, now = new Date()) {
  const active = (tasks ?? []).filter((t) => !t.is_completed && !t.parent_id)
  const entries = active.map((task) => {
    const tier = tierOf(task)
    const score = scoreOf(task, now)
    const rule = tier === 0
      ? 'Tier 0 triage: irreversible (5) + consequence ≥ 4'
      : tier === 1
        ? `Tier 1: (${task.consequence} × ${urgencyFactor(task, now)}u × ${task.reversibility} × ${task.compounding}) / ${EFFORT_WEIGHT[task.effort]} = ${Math.round(score * 10) / 10}`
        : 'Unscored — ranks below all scored tasks'
    return { task, tier, score, rule }
  })

  const tierRank = (e) => (e.tier === 0 ? 0 : e.tier === 1 ? 1 : 2)
  entries.sort((a, b) => {
    const tr = tierRank(a) - tierRank(b)
    if (tr !== 0) return tr
    const pin = (b.task.pinned === true) - (a.task.pinned === true)
    if (pin !== 0) return pin
    if (a.score !== null || b.score !== null) {
      const sc = (b.score ?? 0) - (a.score ?? 0)
      if (sc !== 0) return sc
    }
    const bu = bucketIndex(a.task) - bucketIndex(b.task)
    if (bu !== 0) return bu
    return String(a.task.created_at ?? '').localeCompare(String(b.task.created_at ?? ''))
  })
  return entries
}
