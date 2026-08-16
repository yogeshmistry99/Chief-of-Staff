// Google Health API v4 — the only module that understands its shape.
//
// Pure functions over plain objects: no fetch, no token, no I/O. That is
// deliberate. The API is unreachable without a consented health-scoped token,
// so the parts that can be WRONG — which day a reading belongs to, which filter
// field a data type takes, whether a missing value is a gap or a zero — have to
// be testable without one.
//
// THE GOVERNING RULE: this module never invents a number. A metric is either a
// measured value or a stated absence. It does not compute readiness, it does not
// average a missing day into existence, and a zero is only ever a real zero.
//
// `api/_lib/` is excluded from Vercel's serverless function count, so this file
// costs no slot.

// ─── Data types ───────────────────────────────────────────────────────────────
//
// Verified against the published discovery document
// (https://health.googleapis.com/$discovery/rest?version=v4) on 2026-08-16.
//
// NOT AVAILABLE, and do not go looking again: `readiness`, `cardio load`,
// `strain`, and any field named *score*. Zero occurrences across all 44
// DataPoint types and every schema. Those are scores the Fitbit app computes;
// this API exposes the underlying physiology only. Deriving them here would be
// interpretation, which this feature explicitly does not do.

// How a data type is filtered by time. Getting this wrong returns an EMPTY LIST
// rather than an error, so a mistake here looks exactly like "no data yet".
export const KIND = {
  INTERVAL: 'interval',   // {type}.interval.civil_start_time   — steps, active zone minutes
  SAMPLE:   'sample',     // {type}.sample_time.civil_time      — weight
  DAILY:    'daily',      // {type}.date                        — the daily_* summaries
  SESSION:  'session',    // {type}.interval.civil_start_time    — exercise
  SLEEP:    'sleep',      // {type}.interval.civil_END_time     — sleep ONLY
}

// Sleep and exercise cap at 25 — that is both the DEFAULT and the MAXIMUM.
// Everything else defaults to 1440 with a 10000 ceiling. Asking for more than
// 25 on sleep does not error; it is silently truncated.
export const SLEEP_PAGE_SIZE = 25

export const METRICS = {
  sleep: {
    dataType: 'sleep',
    kind: KIND.SLEEP,
    scope: 'sleep',
    // A night that ENDS today is today's sleep. It began yesterday, which is
    // why the API supports no start-time filter for sleep at all.
    pageSize: SLEEP_PAGE_SIZE,
  },
  hrv: {
    dataType: 'daily_heart_rate_variability',
    kind: KIND.DAILY,
    scope: 'health_metrics',
  },
  rhr: {
    dataType: 'daily_resting_heart_rate',
    kind: KIND.DAILY,
    scope: 'health_metrics',
  },
  spo2: {
    dataType: 'daily_oxygen_saturation',
    kind: KIND.DAILY,
    scope: 'health_metrics',
  },
  breathing: {
    dataType: 'daily_respiratory_rate',
    kind: KIND.DAILY,
    scope: 'health_metrics',
  },
  skinTemp: {
    dataType: 'daily_sleep_temperature_derivations',
    kind: KIND.DAILY,
    scope: 'health_metrics',
  },
  steps: {
    dataType: 'steps',
    kind: KIND.INTERVAL,
    scope: 'activity',
  },
  cardio: {
    dataType: 'active_zone_minutes',
    kind: KIND.INTERVAL,
    scope: 'activity',
  },
}

export const METRIC_KEYS = Object.keys(METRICS)

export function metricByKey(key) {
  return METRICS[key] ?? null
}

// ─── Civil dates ──────────────────────────────────────────────────────────────
//
// CIVIL (local) time throughout, never UTC. The API offers a civil variant of
// every filter and it is the correct one for a day view: "today" is a calendar
// day where the user is standing, not a UTC window. The journal reminder cron
// already shipped a UTC-vs-London bug; this avoids the same class.

export function isValidDate(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d))
}

// The civil date in a named timezone. Defaults to London, which is where the
// readings are taken.
export function civilToday(timeZone = 'Europe/London', now = new Date()) {
  // en-CA formats as YYYY-MM-DD, which is the format the API expects.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

export function addDays(date, n) {
  if (!isValidDate(date)) throw new Error(`health: invalid date ${date}`)
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ─── Filter expressions ───────────────────────────────────────────────────────
//
// AIP-160. Closed-open: >= start AND < end, so a day never double-counts its
// boundary with the next.

// THE URL PATH AND THE FILTER FIELD USE DIFFERENT CONVENTIONS. This is not a
// guess — both were confirmed against the live API on 2026-08-16:
//
//   path   users/me/dataTypes/daily-resting-heart-rate/dataPoints   KEBAB-case
//   filter daily_resting_heart_rate.date >= "…"                     SNAKE_case
//
// Getting the path wrong gives 400 "Invalid data type ID referenced in the
// parent data type collection"; getting the filter wrong gives 400
// "INVALID_DATA_POINT_FILTER_DATA_TYPE_RESTRICTION". The published docs show
// only snake_case (their filter examples) and single-word path examples like
// `steps` and `weight`, which never disambiguate the two — so every multi-word
// data type silently failed.
//
// Derived from one canonical name so the two can never drift apart.
export function dataTypePath(dataType) {
  return String(dataType).replace(/_/g, '-')
}

export function filterField(metric) {
  const m = typeof metric === 'string' ? metricByKey(metric) : metric
  if (!m) throw new Error(`health: unknown metric ${metric}`)
  const t = m.dataType
  switch (m.kind) {
    case KIND.SLEEP:    return `${t}.interval.civil_end_time`
    case KIND.INTERVAL: return `${t}.interval.civil_start_time`
    case KIND.SESSION:  return `${t}.interval.civil_start_time`
    case KIND.SAMPLE:   return `${t}.sample_time.civil_time`
    case KIND.DAILY:    return `${t}.date`
    default: throw new Error(`health: unknown kind ${m.kind}`)
  }
}

// A closed-open civil range over [from, to). `to` is exclusive.
export function buildFilter(metric, from, to) {
  if (!isValidDate(from) || !isValidDate(to)) {
    throw new Error(`health: invalid range ${from}..${to}`)
  }
  const f = filterField(metric)
  return `${f} >= "${from}" AND ${f} < "${to}"`
}

// One civil day.
export function dayFilter(metric, date) {
  return buildFilter(metric, date, addDays(date, 1))
}

// Request path + query for a metric over a range. `parent` is always users/me.
export function listRequest(metricKey, from, to) {
  const m = metricByKey(metricKey)
  if (!m) throw new Error(`health: unknown metric ${metricKey}`)
  const params = new URLSearchParams({ filter: buildFilter(m, from, to) })
  // Only set pageSize where the cap actually matters. Leaving it unset elsewhere
  // takes the 1440 default, which is ample for a day of interval data.
  if (m.pageSize) params.set('pageSize', String(m.pageSize))
  // Kebab in the path, snake in the filter — see dataTypePath above.
  return { path: `users/me/dataTypes/${dataTypePath(m.dataType)}/dataPoints`, query: params.toString() }
}

// ─── Absence ──────────────────────────────────────────────────────────────────
//
// A gap is data. Every metric resolves to a value or to one of these, and the UI
// prints the reason rather than a dash — "not worn" and "not synced" are
// different facts and the wearer can act on one of them.

export const ABSENT = {
  NO_SCOPE:      'no_scope',       // permission never granted
  API_DISABLED:  'api_disabled',   // not enabled on the Cloud project
  NO_DATA:       'no_data',        // API returned nothing for the day
  NO_STAGES:     'no_stages',      // classic-type sleep: a real night, no stage breakdown
  ERROR:         'error',
}

export const ABSENT_TEXT = {
  [ABSENT.NO_SCOPE]:     'Google is connected but has no Health permission yet. Reconnect Google in Settings.',
  [ABSENT.API_DISABLED]: 'The Google Health API is not enabled on your Cloud project.',
  [ABSENT.NO_DATA]:      'Nothing recorded — the band may not have been worn, or has not synced yet.',
  [ABSENT.NO_STAGES]:    'This night was recorded without stage detail.',
  [ABSENT.ERROR]:        'Could not be read.',
}

export function absence(reason, detail = null) {
  return { value: null, absent: reason, detail: detail ?? ABSENT_TEXT[reason] ?? null }
}

// ─── Parsing ──────────────────────────────────────────────────────────────────
//
// Google returns numbers as strings for int64 fields (minutesAsleep, steps
// count, bpm). Number('') is 0 and Number(null) is 0, both of which would
// fabricate a reading — so an empty or absent value must return null, never 0.

// The API's `Date` is an OBJECT — {year, month, day} — not an ISO string. It
// appears on every daily summary and inside civil times. Comparing it to a
// string silently never matches, so it is converted in exactly one place.
export function civilDateKey(date) {
  const y = date?.year, m = date?.month, d = date?.day
  if (!y || !m || !d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function num(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const points = (payload) => (Array.isArray(payload?.dataPoints) ? payload.dataPoints : [])

// Sleep — the main session of the night, with stage totals where present.
export function parseSleep(payload) {
  const all = points(payload).map((p) => p.sleep).filter(Boolean)
  if (!all.length) return absence(ABSENT.NO_DATA)

  // Prefer the session the device marked as the main sleep; otherwise the
  // longest, which is the same answer on every ordinary night.
  const main = all.find((s) => s.metadata?.mainSleep === true)
    ?? all.slice().sort((a, b) => (num(b.summary?.minutesInSleepPeriod) ?? 0) - (num(a.summary?.minutesInSleepPeriod) ?? 0))[0]

  const sum = main.summary ?? {}
  const stages = {}
  for (const s of (sum.stagesSummary ?? [])) {
    const t = s.stage ?? s.type
    const mins = num(s.totalMinutes ?? s.minutes ?? s.durationMinutes)
    if (t && mins != null) stages[t] = (stages[t] ?? 0) + mins
  }

  const minutesAsleep = num(sum.minutesAsleep)
  const inPeriod = num(sum.minutesInSleepPeriod)

  return {
    value: minutesAsleep,
    absent: null,
    minutesAsleep,
    minutesAwake: num(sum.minutesAwake),
    minutesInSleepPeriod: inPeriod,
    minutesToFallAsleep: num(sum.minutesToFallAsleep),
    minutesAfterWakeUp: num(sum.minutesAfterWakeUp),
    // asleep / in bed. A genuine ratio of two returned fields — not a score.
    efficiency: (minutesAsleep != null && inPeriod) ? minutesAsleep / inPeriod : null,
    type: main.type ?? null,
    // CLASSIC nights carry no stage breakdown. That is a property of the
    // recording, not a failure, and it must not render as four zeroes.
    stages: Object.keys(stages).length ? stages : null,
    stagesAbsent: Object.keys(stages).length ? null : ABSENT.NO_STAGES,
    start: main.interval?.startTime ?? null,
    end: main.interval?.endTime ?? null,
  }
}

// A daily summary type: at most one point per civil day. `pick` pulls the value.
export function parseDaily(payload, pick) {
  const rows = points(payload)
  for (const p of rows) {
    const body = p.dailyHeartRateVariability ?? p.dailyRestingHeartRate ?? p.dailyOxygenSaturation
      ?? p.dailyRespiratoryRate ?? p.dailySleepTemperatureDerivations
    if (!body) continue
    const v = pick(body)
    if (v != null) return { value: v, absent: null, date: body.date ?? null, raw: body }
  }
  return absence(ABSENT.NO_DATA)
}

// An interval type summed across the day. Steps and active zone minutes arrive
// as many points; the total is the figure worth showing.
export function sumInterval(payload, pick) {
  const rows = points(payload)
  let total = null
  for (const p of rows) {
    const body = p.steps ?? p.activeZoneMinutes
    if (!body) continue
    const v = pick(body)
    if (v == null) continue
    total = (total ?? 0) + v
  }
  // null, not 0 — "no points at all" is not "zero steps".
  return total == null ? absence(ABSENT.NO_DATA) : { value: total, absent: null }
}

export const PICK = {
  hrv:       (b) => num(b.averageHeartRateVariabilityMilliseconds),
  rhr:       (b) => num(b.beatsPerMinute),
  spo2:      (b) => num(b.averagePercentage),
  breathing: (b) => num(b.breathsPerMinute),
  // The VARIATION, which is what a wearer reads: tonight against their own
  // baseline. Both fields come from the API; the subtraction is arithmetic, not
  // interpretation. Null unless BOTH are present — a delta from a missing
  // baseline would be a fabricated number.
  skinTemp:  (b) => {
    const n = num(b.nightlyTemperatureCelsius)
    const base = num(b.baselineTemperatureCelsius)
    return (n != null && base != null) ? n - base : null
  },
  steps:     (b) => num(b.count),
  cardio:    (b) => num(b.activeZoneMinutes),
}

// ─── Trailing range ───────────────────────────────────────────────────────────
//
// The rings show where today sits within the wearer's own recent history. This
// is a DISPLAY NORMALISATION and the UI says so on its face — the dominant
// number is always the measured value. It is not a score and not advice.

export function trailingRange(values) {
  const nums = (values ?? []).filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (nums.length < 2) return null   // one point has no range; do not draw an arc
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  return max === min ? null : { min, max, n: nums.length }
}

// 0..1 position of `value` within the range, clamped. Null when there is no
// range to place it in, so the ring renders unfilled rather than at a made-up
// fraction.
export function rangePosition(value, range) {
  if (value == null || !range) return null
  const t = (value - range.min) / (range.max - range.min)
  return Math.max(0, Math.min(1, t))
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatMinutes(mins) {
  if (mins == null) return null
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

export function formatSigned(n, digits = 1) {
  if (n == null) return null
  const s = n.toFixed(digits)
  return n > 0 ? `+${s}` : s
}

// ─── Shaping ──────────────────────────────────────────────────────────────────
//
// One place that knows which parser a metric takes, so the endpoint holds no
// per-metric knowledge and a new metric is one entry here.

// Which metrics get a ring, and therefore a trailing baseline. Kept here rather
// than in the endpoint so the two cannot drift.
export const RING_METRICS = ['sleep', 'hrv', 'cardio']

export function shapeMetric(key, payload) {
  if (key === 'sleep') return parseSleep(payload)
  const m = metricByKey(key)
  if (!m) return absence(ABSENT.ERROR, `Unknown metric ${key}`)
  const pick = PICK[key]
  if (!pick) return absence(ABSENT.ERROR, `No parser for ${key}`)
  return m.kind === KIND.INTERVAL ? sumInterval(payload, pick) : parseDaily(payload, pick)
}

// Every value in a baseline window, for the ring arc.
//
// Deliberately NOT day-attributed. The window is queried separately from today,
// so each point simply contributes its value — which avoids reasoning about a
// point's civil day from a UTC timestamp, the exact operation that produces
// off-by-one-day bugs. Gaps drop out; they are not zeroes.
export function baselineValues(key, payload) {
  const rows = Array.isArray(payload?.dataPoints) ? payload.dataPoints : []
  if (key === 'sleep') {
    return rows.map((p) => num(p.sleep?.summary?.minutesAsleep)).filter((v) => v != null)
  }
  const pick = PICK[key]
  if (!pick) return []
  const m = metricByKey(key)
  if (m?.kind === KIND.INTERVAL) {
    // Interval types arrive as many points per day, so a per-day baseline needs
    // each point attributed to a day. The API supplies `interval.civilStartTime`
    // — the subject's OWN local date — so this is a read, not a timezone
    // inference on a UTC stamp. A point without it is dropped rather than
    // guessed at.
    const byDay = {}
    for (const p of rows) {
      const body = p.steps ?? p.activeZoneMinutes
      if (!body) continue
      const day = civilDateKey(body.interval?.civilStartTime?.date)
      const v = pick(body)
      if (!day || v == null) continue
      byDay[day] = (byDay[day] ?? 0) + v
    }
    return Object.values(byDay)
  }
  return rows
    .map((p) => {
      const body = p.dailyHeartRateVariability ?? p.dailyRestingHeartRate ?? p.dailyOxygenSaturation
        ?? p.dailyRespiratoryRate ?? p.dailySleepTemperatureDerivations
      return body ? pick(body) : null
    })
    .filter((v) => v != null)
}
