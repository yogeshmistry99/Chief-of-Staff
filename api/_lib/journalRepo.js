// The only module that touches journal storage.
//
// Modelled directly on api/_lib/tasksRepo.js, for one reason: this app has
// previously told the user something was saved when nothing was written. For a
// task that was bad. For a medical and legal record it is unacceptable — a lost
// entry is evidence that no longer exists.
//
// The rule here is absolute: EVERY write reads the row back and throws if the
// database did not return it. Nothing in this file reports a success it has not
// seen confirmed. Callers must not confirm to the user until one of these
// functions has returned.
//
// Takes an injected Supabase client so the browser and the serverless functions
// share identical semantics.

import { SYMPTOM_KEYS, PROMPT_KEYS, MAX_SCORE } from './journalSymptoms.js'

const COLS = 'id, entry_date, symptoms, prompts, free_text, mode, authored_at, updated_at, '
  + 'drive_file_id, drive_status, drive_error, drive_filed_at, document_md, revision, filed_revision'

function fail(op, error) {
  throw new Error(`journal.${op}: ${error?.message ?? 'unknown error'}`)
}

// ─── Validation ───────────────────────────────────────────────────────────────
// Rejected here rather than at the database, so the caller gets a usable message
// instead of a constraint violation. The DB still backstops mode/drive_status.

export function isValidDate(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d))
}

// Keeps only known symptom keys, clamps scores into range, and normalises the
// shape. Unknown keys are dropped rather than stored: a symptom that isn't in
// the tracked set would silently never appear in the charts or the document.
export function normaliseSymptoms(input) {
  const out = {}
  for (const key of SYMPTOM_KEYS) {
    const raw = input?.[key]
    if (raw == null) continue
    const score = typeof raw === 'number' ? raw : raw.score
    if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) continue
    out[key] = {
      score,
      note: (typeof raw === 'object' && raw.note?.trim()) ? raw.note.trim() : null,
      // True while a pre-filled value is still untouched. The form pre-fills
      // from yesterday (the user's explicit choice); this preserves whether a
      // score was actually reviewed today or merely inherited, which is the one
      // evidential property pre-filling would otherwise destroy.
      carried: (typeof raw === 'object' && raw.carried === true),
    }
  }
  return out
}

export function normalisePrompts(input) {
  const out = {}
  for (const key of PROMPT_KEYS) {
    const v = input?.[key]
    if (typeof v === 'string' && v.trim()) out[key] = v.trim()
  }
  return out
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function listEntries(sb, { since = null, limit = 400 } = {}) {
  let q = sb.from('journal_entries').select(COLS).order('entry_date', { ascending: false }).limit(limit)
  if (since) q = q.gte('entry_date', since)
  const { data, error } = await q
  if (error) fail('list', error)
  return data ?? []
}

export async function getEntryByDate(sb, entryDate) {
  if (!isValidDate(entryDate)) throw new Error(`journal.get: invalid date ${entryDate}`)
  const { data, error } = await sb.from('journal_entries').select(COLS).eq('entry_date', entryDate).maybeSingle()
  if (error) fail('get', error)
  return data ?? null
}

// ─── Writes ───────────────────────────────────────────────────────────────────

// Create or update the entry for a day, in one statement.
//
// `entry_date` is UNIQUE, so upserting on it means a double-submit updates the
// same row instead of creating a second entry for the same day — the duplicate
// is impossible at the database, not merely guarded against in the UI.
//
// Throws unless the database returns the stored row. A caller that gets a return
// value from this function is entitled to tell the user it saved; a caller that
// gets an exception must not.
export async function saveEntry(sb, entry) {
  const entryDate = entry?.entry_date
  if (!isValidDate(entryDate)) throw new Error(`journal.save: invalid entry_date ${entryDate}`)

  const row = {
    entry_date: entryDate,
    symptoms: normaliseSymptoms(entry.symptoms),
    prompts: normalisePrompts(entry.prompts),
    free_text: entry.free_text?.trim() || null,
    mode: entry.mode === 'full' ? 'full' : 'quick',
  }

  const existing = await getEntryByDate(sb, entryDate)

  // authored_at is set once, on first write, and never moved. For a backdated
  // entry it is the honest record of when this was actually written — a diary
  // written a week later carries different evidential weight from one written
  // the same night, and the document says so.
  if (!existing) row.authored_at = new Date().toISOString()
  else row.revision = (existing.revision ?? 1) + 1

  const { data, error } = await sb
    .from('journal_entries')
    .upsert(row, { onConflict: 'entry_date' })
    .select(COLS)

  if (error) fail('save', error)
  if (!data?.length) {
    throw new Error(`journal.save: the database returned no row for ${entryDate} — the entry was NOT saved`)
  }
  return data[0]
}

// Drive filing state is recorded separately from the entry itself, so a filing
// failure can never cost the entry. Every outcome is written down: a failure is
// stored with its reason and surfaces in the history list as retryable, rather
// than being swallowed.
export async function setDriveResult(sb, entryDate, result) {
  if (!isValidDate(entryDate)) throw new Error(`journal.drive: invalid date ${entryDate}`)

  const patch = result.ok
    ? {
        drive_status: 'filed',
        drive_file_id: result.fileId,
        drive_filed_at: new Date().toISOString(),
        drive_error: null,
        // WHICH revision was filed. Not a timestamp: this update bumps
        // updated_at itself, so comparing updated_at against drive_filed_at
        // would report a phantom edit on every successful filing.
        ...(result.revision != null ? { filed_revision: result.revision } : {}),
        ...(result.documentMd ? { document_md: result.documentMd } : {}),
      }
    : {
        drive_status: 'failed',
        drive_error: String(result.error ?? 'unknown error').slice(0, 2000),
      }

  const { data, error } = await sb
    .from('journal_entries')
    .update(patch)
    .eq('entry_date', entryDate)
    .select('entry_date, drive_status, drive_file_id, drive_error, drive_filed_at, revision, filed_revision')

  if (error) fail('drive', error)
  if (!data?.length) throw new Error(`journal.drive: no entry for ${entryDate} — filing state not recorded`)
  return data[0]
}

// Entries whose FILED DOCUMENT IS NOT CURRENT. Ordered oldest first.
//
// That is three different situations and a caller must not treat them alike:
//   • drive_status 'failed'  — filing broke. A problem; worth chasing.
//   • never filed            — a DRAFT. Normal during the day; do not nag.
//   • filed but edited since — the document is stale but a document exists.
// Filter on `drive_status === 'failed'` for "things that went wrong"; use the
// whole list only for a sweep that re-files whatever is out of date.
export async function listUnfiled(sb, { limit = 50 } = {}) {
  const { data, error } = await sb
    .from('journal_entries')
    .select('entry_date, drive_status, drive_error, revision, filed_revision')
    .order('entry_date', { ascending: true })
    .limit(limit * 4)
  if (error) fail('listUnfiled', error)
  // "Unfiled" now includes an entry that WAS filed and has been edited since —
  // its document is stale, which is the same problem as never having filed.
  return (data ?? [])
    .filter((e) => e.drive_status !== 'filed' || (e.revision ?? 1) > (e.filed_revision ?? 0))
    .slice(0, limit)
}
