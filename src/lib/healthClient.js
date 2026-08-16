import { METRIC_KEYS, formatMinutes, formatSigned } from '../../api/_lib/health.js'

export { METRIC_KEYS, formatMinutes, formatSigned }

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
