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

// Remove ✓ claim lines from a reply, keeping any genuine prose around them.
// Used when a false confirmation is replaced by a real, tool-derived one.
export function stripClaimLines(text) {
  return String(text ?? '').replace(/^\s*[✓✅].*$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
}

// Build the confirmation line from what the tool actually verified, so the ✓ on
// the recovery path is derived from the row that landed rather than written by
// the model. A confirmation produced here cannot be false.
export function confirmationLine(name, result) {
  const v = result?.verified ?? {}
  if (name === 'create_task') {
    const bits = [v.bucket, v.due_date ? `due ${v.due_date}` : null].filter(Boolean)
    return `✓ Task created — ${v.content}${bits.length ? ` (${bits.join(', ')})` : ''}`
  }
  if (name === 'complete_task') return `✓ Completed — ${v.content}`
  if (name === 'update_task') {
    const bits = [v.priority ? `P${5 - v.priority}` : null, v.due?.date ? `due ${v.due.date}` : null].filter(Boolean)
    return `✓ Updated — ${v.content}${bits.length ? ` (${bits.join(', ')})` : ''}`
  }
  if (name === 'create_calendar_event') {
    return `✓ Event created — ${v.title}${v.date ? ` (${v.date}${v.start_time ? ` ${v.start_time}` : ''})` : ''}`
  }
  if (name === 'update_calendar_event') return `✓ Event updated — ${v.title ?? ''}`.trim()
  if (name === 'delete_calendar_event') return '✓ Event deleted'
  return '✓ Done'
}

// Sent as the corrective turn when forcing the tool call. Deliberately states
// the rule rather than the specific task — the model still chooses the content.
export const FORCE_RETRY_PROMPT =
  'You said you made that change, but you did not call any tool, so nothing was saved. ' +
  'Call the tool that actually makes the change now, using the details from your previous message. ' +
  'Do not reply with text.'

export const CORRECTION_TEXT =
  '\n\n⚠️ **Correction: nothing was saved.** I did not actually make that change — ' +
  'no write reached the store. Please ask again.'

// The whole guard in one call: should a correction be appended to this reply?
export function needsCorrection(finalText, writeSucceeded) {
  return !writeSucceeded && claimsWrite(finalText)
}
