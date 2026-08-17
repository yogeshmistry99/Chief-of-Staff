// Dirty-field tracking for the task edit sheet.
//
// The sheet used to send every field it owns on every save, so a save that only
// touched the title still wrote `description` too. If that description had
// changed out of band while the sheet sat open — MCP via Claude.ai, a Head chat,
// CoS — the sheet's stale copy overwrote it, with no error and nothing on screen
// to show it happened. Yogesh edits from all three surfaces routinely, so a
// concurrent edit is normal use here, not an edge case, and a silent overwrite is
// the one failure class this app rules out everywhere else.
//
// The rule: compare current form state against a snapshot taken when the task was
// loaded into the form, and send ONLY the fields that diverge. An untouched field
// is absent from the patch, `tasksRepo.patchToRow` leaves absent fields out of the
// UPDATE, and the other surface's write survives.
//
// This is deliberately NOT optimistic concurrency. There are no versions, no
// conflict detection and no merge UI — for a single-user app that would be
// disproportionate. Two surfaces editing the SAME field still resolves
// last-write-wins; what is fixed is one surface silently reverting a field it
// never touched.

// Every field the sheet can write. Anything absent from this list (is_completed,
// project_id, parent_id, pinned, bucket…) is not the sheet's to send at all.
export const EDITABLE_FIELDS = [
  'content', 'priority', 'description', 'due',
  'consequence', 'reversibility', 'compounding', 'effort',
]

// The sheet's flat view of a task: primitives only, so divergence is a `!==`.
//
// `due` is normalised to a bare 'YYYY-MM-DD' ('' = not set) because that is what
// `<input type="date">` holds — and normalising in ONE place is what keeps the
// diff honest. If the snapshot and the form field disagreed on shape, `due` would
// read as changed on every save and be written every time.
export function editSnapshot(task) {
  return {
    content: task?.content ?? '',
    priority: task?.priority ?? 1,
    description: task?.description ?? '',
    due: task?.due?.date ? task.due.date.slice(0, 10) : '',
    consequence: task?.consequence ?? null,
    reversibility: task?.reversibility ?? null,
    compounding: task?.compounding ?? null,
    effort: task?.effort ?? null,
  }
}

// Returns a patch holding only diverged fields — `{}` when nothing changed, which
// callers should treat as "no write needed" rather than an empty UPDATE.
export function diffTaskEdits(baseline, current) {
  const patch = {}
  if (!baseline || !current) return patch
  for (const field of EDITABLE_FIELDS) {
    if (current[field] === baseline[field]) continue
    if (field === 'due') {
      // Clearing the date is a real edit, so it must send an explicit null.
      // Omitting it would silently discard the user's clear — and the old code
      // fell back to the task's existing `due` here, which is why a due date
      // could not be cleared from this sheet at all.
      patch.due = current.due ? { date: current.due } : null
    } else {
      patch[field] = current[field]
    }
  }
  return patch
}
