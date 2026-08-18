// Where an entry stands between "being written" and "filed as evidence".
//
// This lives under api/_lib rather than src/lib because BOTH sides need it: the
// journal UI renders the state, and the evening reminder decides whether to
// nudge from it. src imports from api/_lib freely; api must never import from
// src (it would pull in the browser Supabase client), so the shared rule has to
// sit on this side. src/lib/journal.js re-exports it, so UI code is unchanged.
//
// Saving and publishing are deliberately separate actions: the day is written in
// pieces as things are remembered, and only submitted once at the end. So an
// entry that has been saved but not filed is a DRAFT, not a failure — the
// history list must not nag about it the way it does about a filing that broke.
//
//   draft      saved, never filed — the normal state during the day
//   published  filed, and the document matches what is stored
//   edited     filed, then changed since — the document is now stale
//   failed     filing was attempted and broke; retryable, and worth chasing
//
// `edited` is decided on revision, not timestamps: recording a successful filing
// updates the row, which bumps updated_at, so comparing updated_at against
// drive_filed_at reports a phantom edit on every single publish.
export function publishState(entry) {
  if (!entry) return null
  if (entry.drive_status === 'failed') return 'failed'
  if (entry.drive_status !== 'filed') return 'draft'
  const filed = entry.filed_revision ?? 0
  return (entry.revision ?? 1) > filed ? 'edited' : 'published'
}

// Whether the evening reminder should still nudge about this day.
//
// PUBLISHING is the finish line, not saving. The reminder used to skip whenever
// a row existed at all, which meant a day that had been started in the morning
// and left as a draft went unmentioned every evening — exactly the day most
// worth a nudge. Both 17 and 18 Aug 2026 were unpublished drafts at the fire
// time and stayed silent, which is what surfaced this.
//
//   no entry   nothing written        → remind
//   draft      written, not filed     → remind, this is the whole point
//   failed     filing broke           → remind, it is not filed and can be retried
//   published  filed and current      → stay quiet
//   edited     filed, then changed    → stay quiet; it HAS been published, and
//                                       chasing a re-publish is a different job
//                                       from asking someone to write their day
export function needsReminder(entry) {
  const state = publishState(entry)
  return state === null || state === 'draft' || state === 'failed'
}
