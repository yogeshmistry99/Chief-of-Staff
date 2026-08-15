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
