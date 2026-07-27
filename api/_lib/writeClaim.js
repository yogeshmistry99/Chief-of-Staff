// Guard against the chat confirming a change it never made.
//
// The CoS system prompt already says "you have changed NOTHING unless you
// actually called the matching tool in THIS turn — no tool result, no ✓".
// A prompt is not enforcement: the chat model (Haiku by default) has been
// observed emitting a ✓ confirmation for a task it never called create_task
// for, leaving the user believing a task exists that was never written.
//
// These helpers let the handler compare what the model SAID against what
// actually landed, and append a correction when they disagree. Pure functions,
// no I/O — this file is unit-tested directly.
//
// NOTE: `api/_lib/` is excluded from Vercel's serverless function count, so
// adding this file does not touch the 12/12 Hobby-plan cap.

// Tools that change stored state. If the model claims a change and none of
// these reported success this turn, the claim is false.
const WRITE_TOOLS = new Set([
  'create_task',
  'update_task',
  'complete_task',
  'create_calendar_event',
  'update_calendar_event',
  'delete_calendar_event',
])

export function isWriteTool(name) {
  return WRITE_TOOLS.has(name)
}

// A tool only counts as a landed write if it reported explicit success. Every
// write tool in api/claude.js returns either { success: true, … } or { error }.
export function isSuccessfulWrite(name, result) {
  return isWriteTool(name) && result?.success === true
}

const VERBS = 'created|added|saved|updated|completed|marked|scheduled|deleted'

// "I created…", "I've added…", "I have just saved…"
const FIRST_PERSON = new RegExp(`\\bI(?:'ve| have| just)*\\s+(?:${VERBS})\\b`, 'i')

// A ✓/✅ line that also carries a write verb. The tick alone is not enough —
// a plain ✓-bulleted list of already-done work is not a claim about this turn.
const TICK_LINE = new RegExp(`^.*[✓✅].*\\b(?:${VERBS})\\b`, 'im')

// "Task created: …", "Event has been scheduled", "the task was added"
const THING_VERBED = new RegExp(
  `\\b(?:task|event|reminder)\\s+(?:has been\\s+|was\\s+|is\\s+)?(?:${VERBS})\\b`,
  'i',
)

// Does this reply assert that a change was made? Deliberately conservative:
// it must be a first-person past-tense claim, a ✓ line naming a write, or an
// explicit "task/event <verbed>". Phrasings like "shall I create one?",
// "I could add that later", or "you completed 5 tasks this week" must NOT
// match — a spurious correction on an honest answer is its own bug.
export function claimsWrite(text) {
  if (!text) return false
  return FIRST_PERSON.test(text) || TICK_LINE.test(text) || THING_VERBED.test(text)
}

export const CORRECTION_TEXT =
  '\n\n⚠️ **Correction: nothing was saved.** I did not actually make that change — ' +
  'no write reached the store. Please ask again.'

// The whole guard in one call: should a correction be appended to this reply?
export function needsCorrection(finalText, writeSucceeded) {
  return !writeSucceeded && claimsWrite(finalText)
}
