import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { haptic } from '../lib/haptic'
import { getTracker } from '../lib/trackers'
import {
  fetchTracker, allRows, sections, indexTab, scatterPoints, summaryStats,
  cellByHeader, textByHeader, toNumber, formatGbp,
} from '../lib/sheets'
import TrackerTable from '../components/tracker/TrackerTable'
import TrackerScatter from '../components/tracker/TrackerScatter'
import TrackerDetail from '../components/tracker/TrackerDetail'

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

  const load = useCallback(async () => {
    if (!tracker) return
    setState((s) => ({ ...s, loading: true }))
    const data = await fetchTracker(tracker)
    setState({ loading: false, ...data })
  }, [tracker])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => (tracker && state.tabs ? allRows(tracker, state.tabs) : []), [tracker, state.tabs])
  const points = useMemo(() => (tracker ? scatterPoints(tracker, rows) : []), [tracker, rows])
  const stats = useMemo(() => (tracker ? summaryStats(tracker, rows, points) : []), [tracker, rows, points])
  const groups = useMemo(() => (tracker && state.tabs ? sections(tracker, state.tabs) : []), [tracker, state.tabs])

  // Car's ranked summary tab: model → strategy score, used as a section badge.
  const badges = useMemo(() => {
    if (!tracker?.index || !state.tabs) return {}
    const tab = indexTab(tracker, state.tabs)
    if (!tab) return {}
    const out = {}
    for (const r of tab.rows ?? []) {
      const name = textByHeader(tab.headers, r, tracker.index.key)
      if (name) out[name.trim().toLowerCase()] = textByHeader(tab.headers, r, tracker.index.badge)
    }
    return out
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

        {tracker.view === 'scatter' && state.ok && (
          <div className="rounded-2xl bg-white border border-[#CAC4D0] p-3 mb-3">
            <TrackerScatter
              points={points}
              config={tracker.scatter}
              selected={selected}
              onSelect={(row) => { haptic.light(); setSelected(row) }}
            />
            <p className="text-[10px] text-[#79747E] mt-1">
              Tap a point or a row below to see the full record.
            </p>
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

        {tracker.compare && state.ok && (
          <CompareStrip tracker={tracker} rows={rows} />
        )}

        {state.ok && tracker.view === 'grouped' ? (
          groups.map((g, i) => (
            <div key={`${g.label}-${i}`} className="mt-4">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <h2 className="text-xs font-semibold text-[#1C1B1F]">{g.label ?? 'Other'}</h2>
                {badges[String(g.label ?? '').trim().toLowerCase()] && (
                  <span className="text-[10px] text-[#79747E]">
                    Score {badges[String(g.label ?? '').trim().toLowerCase()]}
                  </span>
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
            <TrackerTable
              headers={headers}
              rows={rows}
              columns={tracker.columns}
              highlight={tracker.highlight}
              selected={selected}
              onSelect={(row) => { haptic.light(); setSelected(row) }}
            />
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
