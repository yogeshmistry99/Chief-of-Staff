import { supabase } from './supabase'
import {
  listEntries, getEntryByDate, saveEntry, setDriveResult, listUnfiled,
} from '../../api/_lib/journalRepo.js'
import { SYMPTOM_KEYS } from '../../api/_lib/journalSymptoms.js'

// Journal persistence for the browser.
//
// Same posture as taskCache.js: every write goes through the shared repo, which
// reads the row back and throws if the database didn't confirm it. There is
// deliberately NO local cache of entries and NO offline queue.
//
// That is a considered choice, not an omission. A journal entry is medical and
// legal evidence. A cached copy that looks saved but isn't, or a queued write
// replayed later over a newer edit, would both produce exactly the failure this
// feature cannot have. Offline means the save fails, visibly, and the entry
// stays on screen for the user to retry — nothing is ever discarded silently.

function client() {
  if (!supabase) throw new Error('Cannot reach the journal store — no database connection.')
  return supabase
}

// ─── Change bus ───────────────────────────────────────────────────────────────
const _listeners = new Set()

export function onJournalChanged(fn) {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

function notifyChanged() {
  _listeners.forEach((fn) => { try { fn() } catch (e) { console.warn('journal listener failed', e) } })
}

// ─── Dates ────────────────────────────────────────────────────────────────────
// Local calendar date, never a UTC slice. An entry written at 23:30 BST belongs
// to that day, not the next one — the same class of bug already fixed in the
// calendar and completed-task handling.
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return localDate(dt)
}

// ─── Reads ────────────────────────────────────────────────────────────────────
export async function readEntries({ since = null, limit = 400 } = {}) {
  return listEntries(client(), { since, limit })
}

export async function readEntry(entryDate) {
  return getEntryByDate(client(), entryDate)
}

export async function readUnfiled() {
  return listUnfiled(client())
}

// ─── Writes ───────────────────────────────────────────────────────────────────

// Returns the stored row. THROWS if the database did not confirm the write —
// callers must only tell the user it saved once this has returned.
export async function writeEntry(entry) {
  const saved = await saveEntry(client(), entry)
  notifyChanged()
  return saved
}

// File a saved entry to Drive.
//
// Deliberately SEPARATE from writeEntry: the entry is already safely stored
// before this runs, so a filing failure can never cost it. This resolves rather
// than throws — the caller shows the outcome either way, and the endpoint has
// already recorded the failure against the entry so it stays retryable.
export async function fileToDrive(entryDate) {
  try {
    const res = await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry_date: entryDate }),
    })
    const data = await res.json().catch(() => ({}))
    notifyChanged()
    if (!res.ok) return { ok: false, error: data.error ?? `Filing failed (${res.status})` }
    return data
  } catch (e) {
    notifyChanged()
    // A network failure here means we cannot know whether it filed. Say exactly
    // that rather than guessing; the entry row is the source of truth and the
    // history list will show its real state on next load.
    return { ok: false, error: `Could not reach the filing service: ${e.message}` }
  }
}

// Link to a filed entry's document.
//
// Every entry is filed as a native Google Doc, so the canonical URL is
// derivable from the stored file id — no extra Drive call and nothing new to
// store. Returns null for a missing id so a caller can't render a dead link.
export function driveDocUrl(fileId) {
  if (!fileId) return null
  return `https://docs.google.com/document/d/${encodeURIComponent(fileId)}/edit`
}

// Whether Google is connected and carries the Drive permission. Lets the UI warn
// before an entry fails to file rather than after.
export async function driveStatus() {
  try {
    const res = await fetch('/api/google?action=status')
    if (!res.ok) return { connected: false, drive: false }
    return await res.json()
  } catch {
    return { connected: false, drive: false }
  }
}

export async function recordDriveResult(entryDate, result) {
  const out = await setDriveResult(client(), entryDate, result)
  notifyChanged()
  return out
}

// ─── Form helpers ─────────────────────────────────────────────────────────────

// Starting values for a day's form.
//
// Pre-filled from the most recent previous entry — the user's explicit choice,
// made after being told that pre-filled values can be read as copied rather than
// observed. Everything carried across is marked `carried: true` and only flips
// to false when the control is actually touched, so the record still knows which
// scores were reviewed today. The form looks identical either way.
export function seedFromPrevious(previous) {
  const seeded = {}
  if (!previous?.symptoms) return seeded
  for (const key of SYMPTOM_KEYS) {
    const prev = previous.symptoms[key]
    if (prev?.score == null) continue
    seeded[key] = { score: prev.score, note: null, carried: true }
  }
  return seeded
}

// True when the entry was first written on a later day than it describes.
// Surfaced in the UI and stated in the filed document: a diary written a week
// afterwards carries different evidential weight from one written that night,
// and presenting it as contemporaneous would be worse than the delay itself.
export function isBackdated(entry) {
  if (!entry?.authored_at || !entry?.entry_date) return false
  return localDate(new Date(entry.authored_at)) !== entry.entry_date
}

// Days between `from` and `to` inclusive that have no entry. Used by the history
// list to show gaps. Presented neutrally — no streaks, no red marks. Shame
// mechanics on a recovery journal work against the thing it's for.
export function missingDates(entries, from, to) {
  const have = new Set(entries.map((e) => e.entry_date))
  const out = []
  for (let d = from; d <= to; d = shiftDate(d, 1)) {
    if (!have.has(d)) out.push(d)
  }
  return out
}
