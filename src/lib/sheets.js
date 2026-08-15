import { trackerQuery } from './trackers'
import { cellByHeader, textByHeader, toNumber, median } from '../../api/_lib/sheetTable.js'

export { cellByHeader, textByHeader, toNumber, median }

// Browser access to the tracker sheets.
//
// NO PERSISTENCE AND NO CACHE, deliberately. The sheets are the source of truth
// and they update themselves; a cached copy would show stale prices and statuses
// while looking authoritative. Fetch happens on open and on the Update button,
// and that is the whole policy.

export async function fetchTracker(tracker) {
  try {
    const res = await fetch(`/api/google?${trackerQuery(tracker)}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok && !data.error) return { ok: false, error: `Could not load (${res.status})` }
    return data
  } catch (e) {
    return { ok: false, error: `Could not reach the sheet: ${e.message}` }
  }
}

// ─── Shaping for the views ────────────────────────────────────────────────────

// Rows from every non-index tab, tagged with which tab they came from.
//
// The Car tracker splits its listings across one tab per model, so "the rows"
// for a tracker is not always one tab. Tabs marked role:'index' are lookup
// tables (Car's ranked summary) and are excluded from the row set.
export function allRows(tracker, tabs) {
  const out = []
  ;(tabs ?? []).forEach((tab, i) => {
    if (tracker.tabs[i]?.role === 'index') return
    for (const row of tab.rows ?? []) {
      out.push({ ...row, headers: tab.headers, tabTitle: tab.title, tabIndex: i })
    }
  })
  return out
}

export function indexTab(tracker, tabs) {
  const i = tracker.tabs.findIndex((t) => t.role === 'index')
  return i >= 0 ? (tabs ?? [])[i] ?? null : null
}

// Sections for the grouped view.
//
// Two shapes produce sections, and both are real:
//   • banner rows inside one tab (Medical's categories)
//   • one tab per section (Car's per-model listing tabs)
// Whichever a tracker uses, the view renders the same structure.
export function sections(tracker, tabs) {
  const out = []
  ;(tabs ?? []).forEach((tab, i) => {
    if (tracker.tabs[i]?.role === 'index') return
    const rows = (tab.rows ?? []).map((r) => ({ ...r, headers: tab.headers, tabIndex: i }))
    if (!rows.length) return

    if (tab.groups?.length) {
      for (const g of tab.groups) {
        out.push({ label: g.label, headers: tab.headers, rows: g.rowIndexes.map((n) => rows[n]).filter(Boolean) })
      }
      // Rows above the first banner belong to no category; keep them rather
      // than dropping data just because it sits before a heading.
      const grouped = new Set(tab.groups.flatMap((g) => g.rowIndexes))
      const ungrouped = rows.filter((_, n) => !grouped.has(n))
      if (ungrouped.length) out.unshift({ label: null, headers: tab.headers, rows: ungrouped })
    } else {
      out.push({ label: tab.title, headers: tab.headers, rows })
    }
  })
  return out
}

// Join a section label to a row in the index tab.
//
// These are two different namings of the same thing and they do not match: the
// Car tracker's sections come from tab titles ("Corolla 2.0", "ProCeed GT")
// while its index tab names models in full ("Toyota Corolla Touring Sports",
// "Kia ProCeed GT Shooting Brake"). Exact matching resolves none of them, so the
// index tab would be fetched and then silently contribute nothing.
//
// A MATCH IS ONLY RETURNED WHEN IT IS UNIQUE. Every distinctive word of the
// label must appear in the candidate, and exactly one candidate may qualify —
// which is what stops "Kia EV6" binding to "Kia ProCeed" on the shared "kia".
// An ambiguous label yields null and simply shows no badge, because a confident
// wrong score is worse than an absent one.
const NOISE = /^\d*$/
const words = (s) => String(s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
const distinctive = (s) => words(s).filter((w) => w.length >= 3 && !NOISE.test(w))

export function matchIndexKey(label, keys) {
  const norm = (s) => words(s).join(' ')
  const exact = keys.find((k) => norm(k) === norm(label))
  if (exact) return exact

  const need = distinctive(label)
  if (!need.length) return null

  const hits = keys.filter((k) => {
    const have = new Set(words(k))
    return need.every((w) => have.has(w))
  })
  return hits.length === 1 ? hits[0] : null
}

// Points for the scatter view. A row missing either axis is NOT plotted — it is
// counted, and the count is shown, so a thin chart reads as thin data rather
// than as a complete picture.
export function scatterPoints(tracker, rows) {
  const cfg = tracker.scatter
  if (!cfg) return []
  return rows
    .filter((r) => {
      if (!cfg.filter) return true
      const v = textByHeader(r.headers, r, cfg.filter.column).trim().toLowerCase()
      return v === String(cfg.filter.equals).toLowerCase()
    })
    .map((r) => ({
      row: r,
      x: toNumber(textByHeader(r.headers, r, cfg.x)),
      y: toNumber(textByHeader(r.headers, r, cfg.y)),
      label: textByHeader(r.headers, r, cfg.label),
    }))
    .filter((p) => p.x != null && p.y != null)
}

export function formatGbp(n) {
  if (n == null) return '—'
  return `£${Math.round(n).toLocaleString('en-GB')}`
}

export function summaryStats(tracker, rows, points) {
  return (tracker.summary ?? []).map((s) => {
    if (s.stat === 'count') return { label: s.label, value: String(rows.length) }
    if (s.stat === 'plotted') return { label: s.label, value: `${points.length} of ${rows.length}` }
    const nums = rows.map((r) => toNumber(textByHeader(r.headers, r, s.column)))
    const v = s.stat === 'median' ? median(nums) : null
    return { label: s.label, value: s.format === 'gbp' ? formatGbp(v) : (v == null ? '—' : String(v)) }
  })
}
