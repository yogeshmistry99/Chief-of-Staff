import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { haptic } from '../lib/haptic'
import { formatMinutes } from '../../api/_lib/health.js'
import {
  fetchHealth, RINGS, DETAIL_GROUPS, displayValue, displayUnit, stageSegments,
} from '../lib/healthClient'
import ScoreRing from '../components/health/ScoreRing'
import StageBar from '../components/health/StageBar'

// Today's health, read from the Google Health API.
//
// DISPLAY ONLY. Nothing is written back to Google, nothing is interpreted, and
// nothing from this screen enters any Claude prompt — the Health head is a
// separate piece of work and the prompt payload is deliberately unchanged.
//
// Fetch happens on tab open and on Update. No cache and no stored copy: a
// remembered reading would show last night as this morning while looking
// current, and the governing rule here is that a gap must look like a gap.

// The reason a metric is missing, in words the wearer can act on. Distinct
// causes get distinct sentences — "not worn" and "not synced" are different
// facts and only one of them is worth doing something about.
const ABSENT_COPY = {
  no_scope:     'Google has no Health permission yet.',
  api_disabled: 'The Google Health API is not enabled.',
  no_data:      'Not recorded — band not worn, or not synced yet.',
  no_stages:    'This night was recorded without stage detail.',
  error:        'Could not be read.',
}

function absentCopy(metric) {
  if (!metric?.absent) return null
  // For a genuine error the DETAIL is the whole point — Google's own message is
  // what identifies the cause. Showing a generic "Could not be read." instead
  // hid "Request contains disallowed OAuth scope(s)" behind three identical
  // rings and made a one-line diagnosis into a server-log hunt. The reason
  // always wins over the generic sentence where one exists.
  if (metric.absent === 'error') return metric.detail ?? ABSENT_COPY.error
  return ABSENT_COPY[metric.absent] ?? metric.detail ?? 'Not available.'
}

// One row in a detail card. Renders a value or a stated gap, never a zero
// standing in for an absence.
function DetailRow({ label, value, absent }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5 border-b border-[#F3EDF7] last:border-0">
      <span className="text-sm text-[#49454F] min-w-0">{label}</span>
      {value != null ? (
        <span className="text-sm font-medium text-[#1C1B1F] tabular-nums flex-shrink-0">{value}</span>
      ) : (
        <span className="text-[11px] text-[#79747E] text-right flex-shrink-0 max-w-[60%] leading-tight">
          {absent ?? 'Not recorded'}
        </span>
      )}
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div className="mb-2 rounded-2xl bg-white border border-[#CAC4D0] overflow-hidden">
      <div className="px-3.5 pt-3 pb-1">
        <h2 className="text-xs font-semibold text-[#49454F] uppercase tracking-wide">{title}</h2>
      </div>
      <div className="px-3.5 pb-2.5">{children}</div>
    </div>
  )
}

// `active` says whether this is actually on screen. It lives inside the Health
// bucket now, where being mounted says nothing about being visible — BucketDetail
// keeps all its tabs mounted and hides the inactive ones. Left undefined, the
// route decides, which is how the standalone /health path still behaves.
export default function Health({ active, embedded = false }) {
  const { pathname } = useLocation()
  const visible = active ?? pathname === '/health'
  const [state, setState] = useState({ loading: true })
  const [open, setOpen] = useState(null)   // which ring's detail is expanded
  const fetched = useRef(false)

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }))
    const data = await fetchHealth()
    setState({ ...data, loading: false })
  }, [])

  // App.jsx's tab strip MOUNTS EVERY TAB AT ONCE so a swipe is instant, which
  // means mounting is not the same as being looked at. Fetching on mount would
  // call Google on every single app load, for a screen the user may never open.
  //
  // So the trigger is the route actually being /health, and it fires once —
  // after that, refreshing is the Update button's job. `load` is declared above
  // this effect deliberately: a dependency array is evaluated DURING render, and
  // referencing a `const` declared below it white-screens the app while building
  // perfectly clean. That has happened here before.
  useEffect(() => {
    if (!visible || fetched.current) return
    fetched.current = true
    load()
  }, [visible, load])

  const metrics = state.metrics ?? {}
  const sleep = metrics.sleep
  const segments = stageSegments(sleep?.stages)

  // Derived sleep detail. Every one of these is arithmetic on fields the API
  // returned — no modelling, no inference.
  const sleepDetail = {
    timeInBed:  formatMinutes(sleep?.minutesInSleepPeriod),
    efficiency: sleep?.efficiency != null ? `${Math.round(sleep.efficiency * 100)}%` : null,
    latency:    formatMinutes(sleep?.minutesToFallAsleep),
    awake:      formatMinutes(sleep?.minutesAwake),
  }

  return (
    <div className="flex flex-col h-full">
      <div className={embedded ? 'px-1 pb-2 flex-shrink-0' : 'bg-[#F3EDF7] px-4 pt-4 pb-3 flex-shrink-0'}>
        {/* Inside the Health bucket the page title would repeat the bucket's own
            header, so only the date and the Update control carry over. */}
        {!embedded && (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-[#1C1B1F] leading-tight">Health</h1>
              <p className="text-xs text-[#79747E]">
                {state.date ? new Date(`${state.date}T00:00:00`).toLocaleDateString('en-GB', {
                  weekday: 'long', day: 'numeric', month: 'long',
                }) : 'Today'}
              </p>
            </div>
          </div>
        )}

        <div className={`flex items-center gap-3 ${embedded ? '' : 'mt-2'}`}>
          {embedded && state.date && (
            <span className="text-xs text-[#79747E] mr-auto">
              {new Date(`${state.date}T00:00:00`).toLocaleDateString('en-GB', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </span>
          )}
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
        {state.loading && !state.metrics && (
          <p className="py-8 text-center text-sm text-[#79747E]">Reading from Google Health…</p>
        )}

        {state.ok === false && (
          <div className="my-3 px-3 py-2.5 rounded-xl bg-[#FCEEEE] text-[#8C1D18] text-xs leading-relaxed break-words">
            <strong>Couldn't load your health data.</strong>{' '}
            {/* A disabled API and a missing scope both arrive as 403 and only
                one is fixed by reconnecting — the same trap the trackers hit
                twice. Each states its own remedy. */}
            {state.serviceDisabled
              ? 'The Google Health API is switched off for your Google Cloud project. Reconnecting will not help — the API has to be turned on.'
              : state.error}
            {state.activationUrl && (
              <div className="mt-2">
                <a
                  href={state.activationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block font-semibold px-3 py-1.5 rounded-full bg-[#8C1D18] text-white"
                >
                  Enable the Health API ↗
                </a>
                <p className="mt-1.5 text-[10px]">
                  Press Enable on that page, give it a minute or two, then tap Update.
                </p>
              </div>
            )}
            {/* Google Health has its OWN consent, separate from the Calendar and
                Drive one, because it refuses a token carrying any other scope.
                So this deliberately does not point at the main reconnect link —
                using that would grant everything except what is needed here. */}
            {(state.needsHealthAuth || state.needsReconsent) && (
              <div className="mt-2">
                <a
                  href="/api/google?action=health-auth&return=/health"
                  className="inline-block font-semibold px-3 py-1.5 rounded-full bg-[#8C1D18] text-white"
                >
                  Connect Google Health
                </a>
                <p className="mt-1.5 text-[10px]">
                  This is a separate permission from Calendar and Drive — connecting it does not affect them.
                </p>
              </div>
            )}
          </div>
        )}

        {state.ok && (
          <>
            {/* The three rings — the whole "how am I today" answer, in one
                glance, above everything else. */}
            <div className="flex gap-1 pt-3 pb-4">
              {RINGS.map((r) => {
                const m = metrics[r.key]
                return (
                  <ScoreRing
                    key={r.key}
                    label={r.label}
                    value={displayValue(r.key, m)}
                    unit={displayUnit(r.key)}
                    caption={m?.absent ? absentCopy(m) : r.caption}
                    position={m?.position ?? null}
                    hasRange={!!m?.range}
                    onClick={() => { haptic.light(); setOpen(open === r.key ? null : r.key) }}
                  />
                )
              })}
            </div>

            {/* What the arc means, said once, plainly. The API has no scores, so
                the ring is context against the wearer's own history — and that
                has to be stated rather than implied. */}
            <p className="text-[10px] text-[#79747E] text-center leading-relaxed px-4 pb-3">
              The number is your reading. The ring shows where it sits in your own last 30 days.
            </p>

            {/* Sleep stages: the one piece of detail earning a place on the
                front screen, because it is the shape of the night rather than
                another number. */}
            <Card title="Sleep stages">
              <StageBar
                segments={segments}
                absent={
                  sleep?.absent ? absentCopy(sleep)
                    : sleep?.stagesAbsent ? ABSENT_COPY.no_stages
                    : null
                }
              />
            </Card>

            {/* Everything else sits one level down, revealed by tapping a ring —
                Whoop's discipline, and the reason the front screen answers in
                two seconds. */}
            {DETAIL_GROUPS.filter((g) => open === g.ring).map((g) => (
              <Card key={g.ring} title={g.title}>
                {g.ring === 'sleep' && g.rows.map((row) => (
                  <DetailRow
                    key={row.key}
                    label={row.label}
                    value={sleepDetail[row.key]}
                    absent={sleep?.absent ? absentCopy(sleep) : null}
                  />
                ))}
                {g.ring !== 'sleep' && g.rows.map((row) => (
                  <DetailRow
                    key={row.key}
                    label={row.label}
                    value={displayValue(row.key, metrics[row.key])
                      ? `${displayValue(row.key, metrics[row.key])}${displayUnit(row.key) ? ` ${displayUnit(row.key)}` : ''}`
                      : null}
                    absent={absentCopy(metrics[row.key])}
                  />
                ))}
              </Card>
            ))}

            {!open && (
              <p className="text-[10px] text-[#79747E] text-center pt-1">Tap a ring for detail</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
