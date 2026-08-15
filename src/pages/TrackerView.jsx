import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { haptic } from '../lib/haptic'
import { getTracker } from '../lib/trackers'
import {
  fetchTracker, allRows, sections, indexTab, scatterPoints, summaryStats,
  cellByHeader, textByHeader, toNumber, formatGbp, matchIndexKey,
} from '../lib/sheets'
import { filterOptions, applyFilters, activeFilterCount } from '../lib/trackerFilters'
import TrackerTable from '../components/tracker/TrackerTable'
import TrackerScatter from '../components/tracker/TrackerScatter'
import TrackerDetail from '../components/tracker/TrackerDetail'
import TrackerFilters from '../components/tracker/TrackerFilters'

// The generic tracker screen. Everything specific to a tracker comes from its
// config in src/lib/trackers.js — this file must stay tracker-agnostic, or the
// "one reusable component" property is lost the first time a fifth is added.
//
// Fetch happens on open and on Update. There is no cache and no stored copy:
// the sheets update themselves, and a stale price shown confidently is worse
// than a spinner.

export default function TrackerView() {
  const { key } = useParams()
  const navigate = useNavigate()
  const tracker = getTracker(key)

  const [state, setState] = useState({ loading: true })
  const [selected, setSelected] = useState(null)
  const [filters, setFilters] = useState({})
  const [tableOpen, setTableOpen] = useState(!tracker?.tableCollapsed)

  const load = useCallback(async () => {
    if (!tracker) return
    setState((s) => ({ ...s, loading: true }))
    const data = await fetchTracker(tracker)
    setState({ loading: false, ...data })
  }, [tracker])

  useEffect(() => { load() }, [load])

  // allRows → FILTER → everything else. Applying the filter once here is what
  // guarantees the chart, the table, the stats and the detail card are all
  // describing the same set of properties.
  const allTrackerRows = useMemo(
    () => (tracker && state.tabs ? allRows(tracker, state.tabs) : []),
    [tracker, state.tabs],
  )
  const rows = useMemo(
    () => (tracker ? applyFilters(tracker, allTrackerRows, filters) : []),
    [tracker, allTrackerRows, filters],
  )
  const options = useMemo(
    () => (tracker ? filterOptions(tracker, allTrackerRows) : []),
    [tracker, allTrackerRows],
  )
  const activeCount = useMemo(() => activeFilterCount(tracker, filters), [tracker, filters])

  // Drop a selection the filters have just excluded. Leaving the detail card
  // open on a record that is no longer in the chart or the table would state,
  // confidently, that it matches the current filters.
  //
  // MUST sit below `rows`. A hook's dependency array is evaluated during render,
  // not deferred with the callback, so referencing a `const` declared further
  // down throws "Cannot access 'rows' before initialization" and takes the whole
  // app to the error boundary — which is exactly what it did.
  useEffect(() => {
    if (!selected) return
    const stillHere = rows.some(
      (r) => r.sheetRow === selected.sheetRow && r.tabIndex === selected.tabIndex,
    )
    if (!stillHere) setSelected(null)
  }, [rows, selected])

  const points = useMemo(() => (tracker ? scatterPoints(tracker, rows) : []), [tracker, rows])

  // The plottable set BEFORE filtering, used only to fix the axis scale so the
  // chart does not rescale under the filters. Derived from allTrackerRows, not
  // from rows, and deliberately not memoised on `filters`.
  const domainPoints = useMemo(
    () => (tracker ? scatterPoints(tracker, allTrackerRows) : []),
    [tracker, allTrackerRows],
  )
  const stats = useMemo(() => (tracker ? summaryStats(tracker, rows, points) : []), [tracker, rows, points])
  const groups = useMemo(() => {
    if (!tracker || !state.tabs) return []
    const raw = sections(tracker, state.tabs)
    if (!tracker.filters?.length) return raw
    // Grouped trackers filter within each section, so configuring filters on one
    // later cannot silently do nothing.
    return raw
      .map((g) => ({ ...g, rows: applyFilters(tracker, g.rows, filters) }))
      .filter((g) => g.rows.length)
  }, [tracker, state.tabs, filters])

  // Car's ranked dashboard: model → strategy score, shown as a section badge.
  //
  // The dashboard names models in full while the sections are named after tabs,
  // so this is a fuzzy join (matchIndexKey) rather than a lookup — and one that
  // returns nothing rather than guessing when a label is ambiguous.
  const badgeFor = useMemo(() => {
    if (!tracker?.index || !state.tabs) return () => null
    const tab = indexTab(tracker, state.tabs)
    if (!tab) return () => null
    const entries = (tab.rows ?? [])
      .map((r) => ({
        key: textByHeader(tab.headers, r, tracker.index.key),
        badge: textByHeader(tab.headers, r, tracker.index.badge),
      }))
      .filter((e) => e.key)
    const keys = entries.map((e) => e.key)
    return (label) => {
      if (!label) return null
      const hit = matchIndexKey(label, keys)
      return hit ? entries.find((e) => e.key === hit)?.badge ?? null : null
    }
  }, [tracker, state.tabs])

  if (!tracker) {
    return (
      <div className="p-4">
        <p className="text-sm text-[#79747E]">Unknown tracker.</p>
        <button onClick={() => navigate('/')} className="mt-3 text-sm text-[#6750A4]">Back</button>
      </div>
    )
  }

  const headers = state.tabs?.[0]?.headers ?? []

  return (
    <div className="flex flex-col h-full">
      <div className="bg-[#F3EDF7] px-4 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-[#1C1B1F] leading-tight">{tracker.title}</h1>
            <p className="text-xs text-[#79747E]">{tracker.subtitle}</p>
          </div>
          <button onClick={() => navigate('/')} className="text-sm text-[#6750A4] flex-shrink-0">Close</button>
        </div>

        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={() => { haptic.light(); load() }}
            disabled={state.loading}
            className="text-[11px] font-medium px-3 py-1.5 rounded-full bg-[#EADDFF] text-[#6750A4] disabled:opacity-50"
          >
            {state.loading ? 'Updating…' : 'Update'}
          </button>
          {state.fetchedAt && !state.loading && (
            <span className="text-[10px] text-[#79747E]">
              Updated {new Date(state.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {state.loading && !state.tabs && (
          <p className="py-8 text-center text-sm text-[#79747E]">Loading from Google Sheets…</p>
        )}

        {state.ok === false && (
          <div className="my-3 px-3 py-2.5 rounded-xl bg-[#FCEEEE] text-[#8C1D18] text-xs leading-relaxed break-words">
            <strong>Couldn't load this tracker.</strong>{' '}
            {/* A disabled API and a missing scope both arrive as 403, and only
                one of them is fixed by reconnecting. Showing the wrong remedy
                costs real time, so each states its own. */}
            {state.serviceDisabled
              ? 'The Google Sheets API is switched off for your Google Cloud project, so Google is refusing to read any spreadsheet. Reconnecting will not help — the API has to be turned on.'
              : state.error}
            {state.serviceDisabled && state.activationUrl && (
              <div className="mt-2">
                <a
                  href={state.activationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block font-semibold px-3 py-1.5 rounded-full bg-[#8C1D18] text-white"
                >
                  Enable the Sheets API ↗
                </a>
                <p className="mt-1.5 text-[10px]">
                  Press Enable on that page, give it a minute or two, then tap Update.
                </p>
              </div>
            )}
            {state.needsReconsent && (
              <div className="mt-1.5">
                <a href="/api/google?return=/" className="underline font-semibold">Reconnect Google</a>
              </div>
            )}
          </div>
        )}

        {stats.length > 0 && state.ok && (
          <div className="flex gap-2 my-3 overflow-x-auto">
            {stats.map((s) => (
              <div key={s.label} className="flex-1 min-w-[80px] rounded-xl bg-white border border-[#CAC4D0] px-2.5 py-2">
                <p className="text-[10px] text-[#79747E] leading-tight">{s.label}</p>
                <p className="text-sm font-semibold text-[#1C1B1F]">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* The chart is PINNED and sits ABOVE the filters.
            Filtering is only useful if you can watch the chart respond to it;
            with the panel below a scrolling chart, opening the filters pushed
            the graph off screen and every chip tap was a change you could not
            see. */}
        {tracker.view === 'scatter' && state.ok && (
          <div className="sticky top-0 z-20 -mx-3 px-3 pt-1 pb-2 bg-[#FFFBFE] border-b border-[#F3EDF7]">
            <div className="rounded-2xl bg-white border border-[#CAC4D0] p-3">
              <TrackerScatter
                points={points}
                domainPoints={domainPoints}
                config={tracker.scatter}
                selected={selected}
                onSelect={(row) => { haptic.light(); setSelected(row) }}
              />
              <p className="text-[10px] text-[#79747E] mt-1">
                {points.length === domainPoints.length
                  ? 'Tap a point to see the full record.'
                  : `Showing ${points.length} of ${domainPoints.length} plotted properties.`}
              </p>
            </div>
          </div>
        )}

        {selected && (
          <TrackerDetail
            row={selected}
            headers={headers}
            config={tracker.detail}
            onClose={() => setSelected(null)}
          />
        )}

        {state.ok && (
          <div className="mt-3">
            <TrackerFilters
              options={options}
              state={filters}
              onChange={(next) => { haptic.light(); setFilters(next) }}
              activeCount={activeCount}
              shown={rows.length}
              total={allTrackerRows.length}
            />
          </div>
        )}

        {state.ok && activeCount > 0 && rows.length === 0 && tracker.view !== 'scatter' && (
          <p className="py-6 text-center text-xs text-[#79747E]">
            No records match these filters.
          </p>
        )}

        {tracker.compare && state.ok && (
          <CompareStrip tracker={tracker} rows={rows} />
        )}

        {state.ok && tracker.view === 'grouped' ? (
          groups.map((g, i) => (
            <div key={`${g.label}-${i}`} className="mt-4">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <h2 className="text-xs font-semibold text-[#1C1B1F]">{g.label ?? 'Other'}</h2>
                {badgeFor(g.label) && (
                  <span className="text-[10px] text-[#79747E]">Score {badgeFor(g.label)}</span>
                )}
              </div>
              <TrackerTable
                headers={g.headers}
                rows={g.rows}
                columns={tracker.columns}
                highlight={tracker.highlight}
                selected={selected}
                onSelect={(row) => { haptic.light(); setSelected(row) }}
              />
            </div>
          ))
        ) : state.ok ? (
          <div className="mt-3">
            {/* Conditional render rather than a max-height clamp: the clamped
                drawers elsewhere in this app clipped their own content, and a
                184-row table has no height worth guessing. */}
            {tracker.tableCollapsed && (
              <button
                onClick={() => { haptic.light(); setTableOpen((o) => !o) }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 mb-1 rounded-2xl bg-white border border-[#CAC4D0] text-left"
              >
                <span className="text-xs font-semibold text-[#1C1B1F]">
                  {tracker.tableLabel ?? 'All records'}
                  <span className="ml-1.5 text-[10px] font-normal text-[#79747E]">{rows.length}</span>
                </span>
                <span className="text-[10px] text-[#6750A4] flex-shrink-0">
                  {tableOpen ? 'Hide ▲' : 'Show ▼'}
                </span>
              </button>
            )}
            {tableOpen && (
              <TrackerTable
                headers={headers}
                rows={rows}
                columns={tracker.columns}
                highlight={tracker.highlight}
                selected={selected}
                onSelect={(row) => { haptic.light(); setSelected(row) }}
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// Finished value against an equivalent conventional house — the comparison the
// pub model exists to make. Rows with neither figure are skipped rather than
// shown as zero.
function CompareStrip({ tracker, rows }) {
  const c = tracker.compare
  const items = rows
    .map((r) => ({
      label: textByHeader(r.headers, r, tracker.detail.title),
      a: toNumber(textByHeader(r.headers, r, c.a)),
      b: toNumber(textByHeader(r.headers, r, c.b)),
    }))
    .filter((i) => i.a != null || i.b != null)

  if (!items.length) return null

  return (
    <div className="mt-3 rounded-2xl bg-white border border-[#CAC4D0] p-3">
      <h2 className="text-xs font-semibold text-[#1C1B1F] mb-2">{c.label}</h2>
      {items.map((i, n) => (
        <div key={n} className="flex items-baseline justify-between gap-3 py-1 border-b border-[#F3EDF7] last:border-0">
          <span className="text-[11px] text-[#1C1B1F] flex-1 min-w-0 truncate">{i.label}</span>
          <span className="text-[11px] text-[#1C1B1F] flex-shrink-0">{formatGbp(i.a)}</span>
          <span className="text-[10px] text-[#79747E] flex-shrink-0">vs {formatGbp(i.b)}</span>
        </div>
      ))}
    </div>
  )
}
