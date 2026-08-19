import {
  METRIC_KEYS, formatMinutes, formatSigned, HEALTH_CACHE_KEY, cacheIsToday,
} from '../../api/_lib/health.js'
import { readFromSupabase } from './sync'

export { METRIC_KEYS, formatMinutes, formatSigned, HEALTH_CACHE_KEY, cacheIsToday }

// Browser access to the Health tab's data.
//
// NO PERSISTENCE AND NO CACHE, deliberately — the same policy as the trackers.
// A cached reading would show yesterday's night as though it were this morning's
// while looking entirely current, and "never render a stale value as though it
// were current" is the governing rule of this feature. Fetch happens on tab open
// and on the Update button, and that is the whole policy.

export async function fetchHealth({ metrics = null, date = null } = {}) {
  const params = new URLSearchParams({ action: 'health' })
  if (metrics?.length) params.set('metrics', metrics.join(','))
  if (date) params.set('date', date)
  // The device's own zone, so a day is the day where the wearer is standing.
  // Falls back to London, which is where the readings are taken.
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz) params.set('tz', tz)
  } catch { /* default applies server-side */ }

  try {
    const res = await fetch(`/api/google?${params}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok && !data.error) return { ok: false, error: `Could not load (${res.status})` }
    return data
  } catch (e) {
    return { ok: false, error: `Could not reach Google Health: ${e.message}` }
  }
}

// ─── Display ──────────────────────────────────────────────────────────────────

// The three rings, in reading order. Each names the measured quantity — none is
// a score, and the labels avoid implying one.
export const RINGS = [
  { key: 'sleep',  label: 'Sleep',  caption: 'asleep last night' },
  { key: 'hrv',    label: 'HRV',    caption: 'overnight average' },
  { key: 'cardio', label: 'Cardio', caption: 'active zone minutes' },
]

// How each metric renders. `value` returns the display string or null; null
// always means "no reading", never "zero".
export const FORMAT = {
  sleep:     { value: (m) => formatMinutes(m.value), unit: null },
  hrv:       { value: (m) => (m.value == null ? null : String(Math.round(m.value))), unit: 'ms' },
  cardio:    { value: (m) => (m.value == null ? null : String(Math.round(m.value))), unit: 'min' },
  rhr:       { value: (m) => (m.value == null ? null : String(Math.round(m.value))), unit: 'bpm' },
  spo2:      { value: (m) => (m.value == null ? null : `${m.value.toFixed(1)}`), unit: '%' },
  breathing: { value: (m) => (m.value == null ? null : m.value.toFixed(1)), unit: 'br/min' },
  skinTemp:  { value: (m) => formatSigned(m.value), unit: '°C' },
  steps:     { value: (m) => (m.value == null ? null : Math.round(m.value).toLocaleString('en-GB')), unit: null },
}

export function displayValue(key, metric) {
  if (!metric || metric.value == null) return null
  return FORMAT[key]?.value(metric) ?? String(metric.value)
}

export function displayUnit(key) {
  return FORMAT[key]?.unit ?? null
}

// Sleep stages in the order they are worth reading, with colours taken from the
// journal chart's palette so the two health surfaces agree. AWAKE last because
// it is the absence of sleep rather than a kind of it.
export const STAGE_ORDER = ['DEEP', 'REM', 'LIGHT', 'ASLEEP', 'RESTLESS', 'AWAKE']

export const STAGE_COLOR = {
  DEEP:     '#4A3AA7',
  REM:      '#0B57D0',
  LIGHT:    '#00639B',
  ASLEEP:   '#006C51',
  RESTLESS: '#8A5000',
  AWAKE:    '#CAC4D0',
}

export const STAGE_LABEL = {
  DEEP: 'Deep', REM: 'REM', LIGHT: 'Light',
  ASLEEP: 'Asleep', RESTLESS: 'Restless', AWAKE: 'Awake',
}

// Stage totals as drawable segments. Returns [] when there are no stages, which
// is the CLASSIC-sleep case and must render as a stated absence rather than an
// empty bar.
export function stageSegments(stages) {
  if (!stages) return []
  const entries = STAGE_ORDER
    .filter((k) => typeof stages[k] === 'number' && stages[k] > 0)
    .map((k) => ({ key: k, label: STAGE_LABEL[k] ?? k, minutes: stages[k], color: STAGE_COLOR[k] ?? '#79747E' }))
  const total = entries.reduce((n, e) => n + e.minutes, 0)
  if (!total) return []
  return entries.map((e) => ({ ...e, fraction: e.minutes / total }))
}

// The detail rows under each ring — Whoop's discipline is that most data sits
// one level down, and these are the ones cut from the front screen.
export const DETAIL_GROUPS = [
  {
    ring: 'sleep',
    title: 'Last night',
    rows: [
      { key: 'timeInBed',   label: 'Time in bed' },
      { key: 'efficiency',  label: 'Sleep efficiency' },
      { key: 'latency',     label: 'Time to fall asleep' },
      { key: 'awake',       label: 'Awake' },
    ],
  },
  {
    ring: 'hrv',
    title: 'Overnight body signals',
    rows: [
      { key: 'rhr',       label: 'Resting heart rate' },
      { key: 'spo2',      label: 'Blood oxygen' },
      { key: 'breathing', label: 'Breathing rate' },
      { key: 'skinTemp',  label: 'Skin temperature vs baseline' },
    ],
  },
  {
    ring: 'cardio',
    title: 'Movement',
    rows: [
      { key: 'steps', label: 'Steps' },
    ],
  },
]

// ─── Activity feed ────────────────────────────────────────────────────────────

// What sits ON a feed row versus behind a tap.
//
// The restraint test is whether a number changes what you would do next. Type,
// time and duration answer "what did I do"; calories and average heart rate say
// how hard it was. Everything else — distance, steps, zone minutes, the sleep
// stage split — is reference, and reference belongs one level down. A crowded
// row is a Fitbit dashboard.
//
// Nothing is invented to fill a gap: a field the API did not return for that
// session type is simply absent from the row, never a dash and never a zero.

// Asleep stages in one line: "Deep 48m · REM 1h 9m · Light 3h 34m".
//
// AWAKE is deliberately left out — it is the absence of sleep rather than a kind
// of it, and it already has its own row. Null when the night carries no stage
// breakdown at all, so nothing renders rather than an empty string.
export function stageSummary(stages) {
  if (!stages) return null
  const parts = STAGE_ORDER
    .filter((k) => k !== 'AWAKE' && typeof stages[k] === 'number' && stages[k] > 0)
    .map((k) => `${STAGE_LABEL[k] ?? k} ${formatMinutes(stages[k])}`)
  return parts.length ? parts.join(' · ') : null
}

export function sessionTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// The one-line summary under a row's title. Only what the session actually has.
export function sessionSummary(s) {
  const parts = []
  if (s.durationMinutes != null) parts.push(formatMinutes(s.durationMinutes))
  if (s.calories != null) parts.push(`${Math.round(s.calories)} kcal`)
  if (s.averageHeartRate != null) parts.push(`${Math.round(s.averageHeartRate)} bpm avg`)
  return parts
}

// The rows revealed by tapping a session. Built by filtering, so a session type
// that carries none of them expands to nothing rather than to a list of dashes.
export function sessionDetail(s) {
  const rows = []
  const add = (label, value) => { if (value != null) rows.push({ label, value }) }

  if (s.kind === 'sleep') {
    // The shape of the night in one line. The full split has its own screen; this
    // is the summary that answers "was it decent" without leaving the feed.
    add('Stages', stageSummary(s.stages))
    add('Time in bed', formatMinutes(s.minutesInSleepPeriod))
    add('Sleep efficiency', s.efficiency != null ? `${Math.round(s.efficiency * 100)}%` : null)
    add('Time to fall asleep', formatMinutes(s.minutesToFallAsleep))
    add('Awake', formatMinutes(s.minutesAwake))
  } else {
    add('Distance', s.distanceKm != null ? `${s.distanceKm.toFixed(2)} km` : null)
    add('Steps', s.steps != null ? Math.round(s.steps).toLocaleString('en-GB') : null)
    add('Active zone minutes', s.activeZoneMinutes != null ? String(Math.round(s.activeZoneMinutes)) : null)
  }
  return rows
}

// ─── Last-reading cache ───────────────────────────────────────────────────────
//
// Read-only, and deliberately NOT a fetch: the home screen must never call the
// Health API. It renders whatever the Health tab last really read, stamped with
// when that was.
export async function readCachedRings() {
  try {
    const value = await readFromSupabase(HEALTH_CACHE_KEY)
    if (!value?.fetchedAt) return null
    return value
  } catch {
    return null
  }
}

// ─── Absence copy ─────────────────────────────────────────────────────────────
//
// Lifted out of Health.jsx so the tab and both detail screens say the same thing
// about the same gap. A gap is data here; the reason is the content.

// The reason a metric is missing, in words the wearer can act on. Distinct
// causes get distinct sentences — "not worn" and "not synced" are different
// facts and only one of them is worth doing something about.
export const ABSENT_COPY = {
  no_scope:     'Google has no Health permission yet.',
  api_disabled: 'The Google Health API is not enabled.',
  no_data:      'Not recorded — band not worn, or not synced yet.',
  no_stages:    'This night was recorded without stage detail.',
  // NOT "band not worn": active zone minutes are earned, not measured, so an
  // empty reading on a worn band means a quiet day. Saying otherwise blames the
  // hardware for something it recorded correctly.
  no_activity:  'No active zone minutes yet today.',
  error:        'Could not be read.',
}

export function absentCopy(metric) {
  if (!metric?.absent) return null
  // For a genuine error the DETAIL is the whole point — Google's own message is
  // what identifies the cause. Showing a generic "Could not be read." instead
  // hid "Request contains disallowed OAuth scope(s)" behind three identical
  // rings and made a one-line diagnosis into a server-log hunt. The reason
  // always wins over the generic sentence where one exists.
  if (metric.absent === 'error') return metric.detail ?? ABSENT_COPY.error
  return ABSENT_COPY[metric.absent] ?? metric.detail ?? 'Not available.'
}

// ─── Session hold ─────────────────────────────────────────────────────────────
//
// The last reading, kept IN MEMORY for as long as the app is open.
//
// Not a cache in the sense this file rules out elsewhere, and specifically not
// persistence: it lives in a module variable, dies on reload, and is never
// written anywhere. What it prevents is re-fetching a reading the app already
// has — opening the Health tab, going into a ring's screen, coming back, and
// switching tabs each unmount and remount the page, and every one of those was
// calling Google again for data that had not changed.
//
// THE SAME-DAY GUARD IS THE HONEST PART. An app left open overnight would
// otherwise hold last night's reading and present it as this morning's, which is
// the exact failure the no-cache rule exists to prevent. A held reading is only
// reused while it is still the civil day it was taken on; after that it is
// dropped and the next open fetches. The tab also always shows the time it was
// read, so a held reading is never passed off as a fresh one.
let sessionHealth = null

export function readSessionHealth(now = new Date()) {
  if (!sessionHealth?.date) return null
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  if (sessionHealth.date !== today) {
    sessionHealth = null
    return null
  }
  return sessionHealth
}

export function writeSessionHealth(data) {
  // Only a good reading is worth holding. An error response must not stick
  // around and suppress the retry that would fix it.
  sessionHealth = data?.ok ? data : sessionHealth
  return sessionHealth
}

export function clearSessionHealth() {
  sessionHealth = null
}
