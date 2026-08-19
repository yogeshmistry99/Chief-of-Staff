import { readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'
import {
  METRICS, METRIC_KEYS, KIND, SLEEP_PAGE_SIZE,
  filterField, buildFilter, dayFilter, listRequest,
  civilToday, addDays, isValidDate,
  parseSleep, parseDaily, sumInterval, PICK, num,
  trailingRange, rangePosition, formatMinutes, formatSigned,
  ABSENT, absence, civilDateKey, shapeMetric, baselineValues, RING_METRICS, BASELINE_METRICS,
} from '../../api/_lib/health.js'
import { RECOVERY_METRIC_KEYS } from '../../api/_lib/recovery.js'

// The failure mode this file exists for: a wrong filter field returns an EMPTY
// LIST, not an error. That is indistinguishable from "the band wasn't worn", so
// nothing downstream would ever notice. These assertions are the only guard.

describe('filter fields — wrong one returns empty, never an error', () => {
  it('filters sleep on civil END time, never start', () => {
    // A night begins the previous calendar day. The API supports no start-time
    // filter for sleep at all, and using one would attribute last night to
    // yesterday.
    expect(filterField('sleep')).toBe('sleep.interval.civil_end_time')
    expect(filterField('sleep')).not.toContain('start')
  })

  it('filters daily summaries on .date', () => {
    expect(filterField('hrv')).toBe('daily_heart_rate_variability.date')
    expect(filterField('rhr')).toBe('daily_resting_heart_rate.date')
    expect(filterField('spo2')).toBe('daily_oxygen_saturation.date')
    expect(filterField('breathing')).toBe('daily_respiratory_rate.date')
    expect(filterField('skinTemp')).toBe('daily_sleep_temperature_derivations.date')
  })

  it('filters interval types on civil START time', () => {
    expect(filterField('steps')).toBe('steps.interval.civil_start_time')
    expect(filterField('cardio')).toBe('active_zone_minutes.interval.civil_start_time')
  })

  it('uses civil time everywhere — never a UTC field', () => {
    // The cron reminder already shipped a UTC-vs-London bug. Civil filters are
    // the API's own answer to it.
    for (const key of METRIC_KEYS) {
      const f = filterField(key)
      expect(f === `${METRICS[key].dataType}.date` || f.includes('civil')).toBe(true)
    }
  })

  it('rejects an unknown metric rather than guessing a field', () => {
    expect(() => filterField('readiness')).toThrow(/unknown metric/)
  })
})

describe('the API has no readiness, cardio load or score', () => {
  it('does not offer a readiness or cardio-load metric', () => {
    // Confirmed against the published discovery document: zero occurrences.
    // If someone adds one it must come from a real data type, not a formula.
    expect(METRIC_KEYS).not.toContain('readiness')
    expect(METRIC_KEYS).not.toContain('cardioLoad')
    expect(METRIC_KEYS).not.toContain('strain')
  })

  it('maps "cardio" to active zone minutes, a measured quantity', () => {
    expect(METRICS.cardio.dataType).toBe('active_zone_minutes')
  })
})

describe('civil day windows', () => {
  it('builds a closed-open range so a day cannot double-count its boundary', () => {
    expect(dayFilter('hrv', '2026-08-16')).toBe(
      'daily_heart_rate_variability.date >= "2026-08-16" AND daily_heart_rate_variability.date < "2026-08-17"'
    )
  })

  it('crosses a month end correctly', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('gives the London civil date, not the UTC one, across a BST boundary', () => {
    // 22:30 UTC on 16 Aug is 23:30 BST the SAME day...
    expect(civilToday('Europe/London', new Date('2026-08-16T22:30:00Z'))).toBe('2026-08-16')
    // ...and 23:30 UTC is already 00:30 on the 17th in London.
    expect(civilToday('Europe/London', new Date('2026-08-16T23:30:00Z'))).toBe('2026-08-17')
    // In winter London is UTC, so the same instant stays on the 16th.
    expect(civilToday('Europe/London', new Date('2026-12-16T23:30:00Z'))).toBe('2026-12-16')
  })

  it('refuses an invalid range instead of querying a nonsense window', () => {
    expect(() => buildFilter('hrv', 'yesterday', '2026-08-17')).toThrow(/invalid range/)
    expect(isValidDate('2026-8-1')).toBe(false)
  })
})

describe('page size', () => {
  it('caps sleep at 25 — the maximum AND the default', () => {
    expect(SLEEP_PAGE_SIZE).toBe(25)
    expect(listRequest('sleep', '2026-08-16', '2026-08-17').query).toContain('pageSize=25')
  })

  it('leaves other types on the 1440 default', () => {
    expect(listRequest('steps', '2026-08-16', '2026-08-17').query).not.toContain('pageSize')
  })

  it('addresses users/me with the KEBAB path while the filter stays SNAKE', () => {
    // Confirmed live 2026-08-16: the URL path is kebab-case and the filter
    // field is snake_case. Using snake in the path gives 400 "Invalid data type
    // ID"; using kebab in the filter gives 400
    // INVALID_DATA_POINT_FILTER_DATA_TYPE_RESTRICTION. Every multi-word data
    // type failed silently until this was pinned down against the real API.
    const r = listRequest('rhr', '2026-08-16', '2026-08-17')
    expect(r.path).toBe('users/me/dataTypes/daily-resting-heart-rate/dataPoints')
    expect(decodeURIComponent(r.query)).toContain('daily_resting_heart_rate.date')
  })

  it('uses kebab paths for every multi-word metric', () => {
    for (const key of METRIC_KEYS) {
      const path = listRequest(key, '2026-08-16', '2026-08-17').path
      expect(path).not.toMatch(/dataTypes\/[a-z]+_/)   // no underscore in the path
    }
    expect(listRequest('cardio', '2026-08-16', '2026-08-17').path)
      .toBe('users/me/dataTypes/active-zone-minutes/dataPoints')
    expect(listRequest('hrv', '2026-08-16', '2026-08-17').path)
      .toBe('users/me/dataTypes/daily-heart-rate-variability/dataPoints')
  })

  it('keeps snake_case in every filter FIELD', () => {
    // The field name only — the range literals are dates and legitimately
    // contain hyphens.
    for (const key of METRIC_KEYS) {
      expect(filterField(key)).not.toContain('-')
    }
  })
})

describe('parseSleep', () => {
  const night = (over = {}) => ({
    dataPoints: [{
      sleep: {
        type: 'STAGES',
        metadata: { mainSleep: true },
        interval: { startTime: '2026-08-15T22:40:00Z', endTime: '2026-08-16T06:22:00Z' },
        summary: {
          minutesAsleep: '402', minutesAwake: '38', minutesInSleepPeriod: '462',
          minutesToFallAsleep: '12',
          stagesSummary: [
            { stage: 'DEEP', totalMinutes: '61' },
            { stage: 'REM', totalMinutes: '94' },
            { stage: 'LIGHT', totalMinutes: '247' },
            { stage: 'AWAKE', totalMinutes: '38' },
          ],
        },
        ...over,
      },
    }],
  })

  it('reads the summary and totals the stages', () => {
    const s = parseSleep(night())
    expect(s.minutesAsleep).toBe(402)
    expect(s.stages).toEqual({ DEEP: 61, REM: 94, LIGHT: 247, AWAKE: 38 })
    expect(s.efficiency).toBeCloseTo(402 / 462, 5)
  })

  it('marks a CLASSIC night as having no stages rather than four zeroes', () => {
    // A classic recording is a real night. Rendering 0 DEEP / 0 REM would be a
    // false clinical claim, not a formatting quirk.
    const s = parseSleep(night({ type: 'CLASSIC', summary: { minutesAsleep: '390', minutesInSleepPeriod: '430' } }))
    expect(s.minutesAsleep).toBe(390)
    expect(s.stages).toBeNull()
    expect(s.stagesAbsent).toBe(ABSENT.NO_STAGES)
  })

  it('picks the main sleep when a nap is also present', () => {
    const p = night()
    p.dataPoints.push({ sleep: {
      type: 'STAGES', metadata: { mainSleep: false },
      summary: { minutesAsleep: '25', minutesInSleepPeriod: '30' },
    } })
    expect(parseSleep(p).minutesAsleep).toBe(402)
  })

  it('reports absence when nothing came back', () => {
    expect(parseSleep({ dataPoints: [] }).absent).toBe(ABSENT.NO_DATA)
    expect(parseSleep({}).absent).toBe(ABSENT.NO_DATA)
  })
})

describe('never fabricate a zero', () => {
  it('returns null, not 0, for an absent numeric', () => {
    // Number(null) and Number('') are both 0. Either would invent a reading.
    expect(num(null)).toBeNull()
    expect(num('')).toBeNull()
    expect(num('nonsense')).toBeNull()
    expect(num('0')).toBe(0)
  })

  it('distinguishes "no step data" from "zero steps"', () => {
    expect(sumInterval({ dataPoints: [] }, PICK.steps).absent).toBe(ABSENT.NO_DATA)
    expect(sumInterval({ dataPoints: [{ steps: { count: '0' } }] }, PICK.steps).value).toBe(0)
  })

  it('sums interval points across the day', () => {
    const payload = { dataPoints: [
      { steps: { count: '1200' } }, { steps: { count: '3400' } }, { steps: { count: '55' } },
    ] }
    expect(sumInterval(payload, PICK.steps).value).toBe(4655)
  })

  it('gives no skin-temperature delta when the baseline is missing', () => {
    // A delta from an absent baseline would be a number nobody measured.
    expect(PICK.skinTemp({ nightlyTemperatureCelsius: 34.2 })).toBeNull()
    expect(PICK.skinTemp({ nightlyTemperatureCelsius: 34.2, baselineTemperatureCelsius: 33.9 }))
      .toBeCloseTo(0.3, 5)
  })
})

describe('parseDaily', () => {
  it('reads a daily summary value', () => {
    const p = { dataPoints: [{ dailyRestingHeartRate: { date: '2026-08-16', beatsPerMinute: '54' } }] }
    expect(parseDaily(p, PICK.rhr).value).toBe(54)
  })

  it('reports absence for an empty day', () => {
    expect(parseDaily({ dataPoints: [] }, PICK.rhr).absent).toBe(ABSENT.NO_DATA)
  })
})

describe('the trailing range behind the rings', () => {
  it('needs at least two distinct values to draw an arc', () => {
    expect(trailingRange([])).toBeNull()
    expect(trailingRange([42])).toBeNull()
    expect(trailingRange([42, 42, 42])).toBeNull()   // flat: no meaningful position
    expect(trailingRange([30, 60])).toEqual({ min: 30, max: 60, n: 2 })
  })

  it('ignores gaps rather than treating them as zero', () => {
    expect(trailingRange([30, null, 60, undefined, NaN])).toEqual({ min: 30, max: 60, n: 2 })
  })

  it('places a value in the range and clamps outside it', () => {
    const r = trailingRange([30, 60])
    expect(rangePosition(45, r)).toBeCloseTo(0.5, 5)
    expect(rangePosition(90, r)).toBe(1)
    expect(rangePosition(10, r)).toBe(0)
  })

  it('returns null with no range, so the ring renders unfilled not at a made-up fraction', () => {
    expect(rangePosition(45, null)).toBeNull()
    expect(rangePosition(null, trailingRange([30, 60]))).toBeNull()
  })
})

describe('formatting', () => {
  it('formats sleep as hours and minutes', () => {
    expect(formatMinutes(402)).toBe('6h 42m')
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(null)).toBeNull()
  })

  it('signs a temperature delta', () => {
    expect(formatSigned(0.3)).toBe('+0.3')
    expect(formatSigned(-0.4)).toBe('-0.4')
    expect(formatSigned(null)).toBeNull()
  })
})

describe('absence carries a reason the wearer can act on', () => {
  it('names each distinct cause', () => {
    expect(absence(ABSENT.NO_SCOPE).detail).toMatch(/Reconnect Google/)
    expect(absence(ABSENT.API_DISABLED).detail).toMatch(/not enabled/)
    expect(absence(ABSENT.NO_DATA).detail).toMatch(/not have been worn|synced/)
    expect(absence(ABSENT.NO_STAGES).detail).toMatch(/without stage detail/)
  })

  it('always carries a null value alongside the reason', () => {
    for (const r of Object.values(ABSENT)) expect(absence(r).value).toBeNull()
  })
})

describe('civilDateKey — the API Date is an OBJECT, not a string', () => {
  it('renders {year,month,day} as an ISO day', () => {
    // Comparing the raw object to a string silently never matches, which would
    // look like "no data" rather than a bug.
    expect(civilDateKey({ year: 2026, month: 8, day: 6 })).toBe('2026-08-06')
    expect(civilDateKey({ year: 2026, month: 12, day: 25 })).toBe('2026-12-25')
  })

  it('returns null for a partial date rather than a wrong one', () => {
    expect(civilDateKey({ year: 2026, month: 0, day: 0 })).toBeNull()
    expect(civilDateKey(null)).toBeNull()
  })
})

describe('shapeMetric routes each metric to the right parser', () => {
  it('parses a daily summary', () => {
    const p = { dataPoints: [{ dailyRestingHeartRate: { date: { year: 2026, month: 8, day: 16 }, beatsPerMinute: '54' } }] }
    expect(shapeMetric('rhr', p).value).toBe(54)
  })

  it('sums an interval type', () => {
    const p = { dataPoints: [{ steps: { count: '1000' } }, { steps: { count: '250' } }] }
    expect(shapeMetric('steps', p).value).toBe(1250)
  })

  it('parses sleep through the session parser', () => {
    const p = { dataPoints: [{ sleep: { type: 'STAGES', summary: { minutesAsleep: '400', minutesInSleepPeriod: '440' } } }] }
    expect(shapeMetric('sleep', p).minutesAsleep).toBe(400)
  })

  it('refuses an unknown metric rather than inventing a shape', () => {
    expect(shapeMetric('readiness', { dataPoints: [] }).absent).toBe(ABSENT.ERROR)
  })
})

describe('baselineValues', () => {
  it('takes one value per night for sleep', () => {
    const p = { dataPoints: [
      { sleep: { summary: { minutesAsleep: '400' } } },
      { sleep: { summary: { minutesAsleep: '450' } } },
      { sleep: { summary: {} } },                        // a night with no total: dropped, not zeroed
    ] }
    expect(baselineValues('sleep', p)).toEqual([400, 450])
  })

  it('totals interval points PER CIVIL DAY using the API\'s own local date', () => {
    // Attribution comes from interval.civilStartTime — the subject's own local
    // date — rather than being inferred from a UTC stamp, which is how
    // off-by-one-day bugs get in.
    const p = { dataPoints: [
      { activeZoneMinutes: { activeZoneMinutes: '12', interval: { civilStartTime: { date: { year: 2026, month: 8, day: 14 } } } } },
      { activeZoneMinutes: { activeZoneMinutes: '8',  interval: { civilStartTime: { date: { year: 2026, month: 8, day: 14 } } } } },
      { activeZoneMinutes: { activeZoneMinutes: '30', interval: { civilStartTime: { date: { year: 2026, month: 8, day: 15 } } } } },
    ] }
    expect(baselineValues('cardio', p).sort((a, b) => a - b)).toEqual([20, 30])
  })

  it('drops an interval point with no civil date rather than guessing its day', () => {
    const p = { dataPoints: [{ steps: { count: '500' } }] }
    expect(baselineValues('steps', p)).toEqual([])
  })

  it('covers exactly the metrics that carry a ring', () => {
    expect(RING_METRICS).toEqual(['sleep', 'recovery', 'cardio'])
  })

  it('asks for a baseline for every metric that is actually fetched, recovery aside', () => {
    // Recovery has no baseline of its own because there is nothing to fetch for
    // it — it is computed from the others. Its INPUTS all need one, so the two
    // lists have to stay in step or the score silently loses a signal.
    expect(BASELINE_METRICS).not.toContain('recovery')
    for (const key of RECOVERY_METRIC_KEYS) expect(BASELINE_METRICS).toContain(key)
  })
})

describe('OAuth request shape — the named traps', () => {
  const authSrc = () => readFileSync(`${process.cwd()}/api/google.js`, 'utf8')
  const libSrc  = () => readFileSync(`${process.cwd()}/api/_lib/google.js`, 'utf8')

  it('never sends include_granted_scopes', () => {
    // An incremental-auth token carrying Calendar/Drive/Sheets alongside the
    // health scopes is rejected by the Health data plane with an undocumented
    // internal error. Only a comment may mention this parameter.
    const code = authSrc().split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    expect(code).not.toContain('include_granted_scopes')
  })

  it('requests offline access, or no refresh token is ever issued', () => {
    expect(authSrc()).toMatch(/access_type:\s*'offline'/)
    expect(authSrc()).toMatch(/prompt:\s*'consent'/)
  })

  it('requests a COMPLETE set — all three health scopes, or all of the main set', () => {
    // A partial request fails on this client. Both sets are complete; what
    // changed after the live failure is that they are requested SEPARATELY
    // rather than as one union — see the two-grants suite below.
    const lib = libSrc()
    for (const s of ['googlehealth.sleep.readonly',
                     'googlehealth.activity_and_fitness.readonly',
                     'googlehealth.health_metrics_and_measurements.readonly']) {
      expect(lib).toContain(s)
    }
    expect(authSrc()).toMatch(/\(isHealth \? HEALTH_SCOPES : SCOPES\)\.join/)
  })

  it('asks for read-only health scopes only — never a writeonly one', () => {
    // Read-only makes "this app never writes health data" a property of the
    // grant rather than a rule the code has to remember.
    expect(libSrc()).not.toMatch(/googlehealth\.[a-z_]+\.writeonly/)
  })
})

describe('the two grants must never be combined', () => {
  const libSrc = () => readFileSync(`${process.cwd()}/api/_lib/google.js`, 'utf8')
  const apiSrc = () => readFileSync(`${process.cwd()}/api/google.js`, 'utf8')

  it('keeps health scopes OUT of the main SCOPES list', async () => {
    // Confirmed live 2026-08-16: a token carrying calendar/drive/sheets AND
    // health scopes is rejected by the Health data plane with "Request contains
    // disallowed OAuth scope(s)", even with all three health scopes granted.
    const { SCOPES, HEALTH_SCOPES } = await import('../../api/_lib/google.js')
    for (const s of SCOPES) expect(s).not.toContain('googlehealth')
    expect(HEALTH_SCOPES).toHaveLength(3)
    for (const s of HEALTH_SCOPES) expect(s).toContain('googlehealth')
  })

  it('requests one set or the other, never their union', () => {
    expect(apiSrc()).toMatch(/isHealth\s*\?\s*HEALTH_SCOPES\s*:\s*SCOPES/)
    expect(apiSrc()).not.toMatch(/\[\s*\.\.\.SCOPES\s*,\s*\.\.\.HEALTH_SCOPES/)
  })

  it('stores the health grant in its own row', async () => {
    const { AUTH_KEY, HEALTH_AUTH_KEY } = await import('../../api/_lib/google.js')
    expect(HEALTH_AUTH_KEY).toBe('google_health_auth')
    expect(HEALTH_AUTH_KEY).not.toBe(AUTH_KEY)
  })

  it('detects a health grant polluted with other scopes', async () => {
    const { healthGrantIsClean, HEALTH_SCOPES } = await import('../../api/_lib/google.js')
    expect(healthGrantIsClean({ scope: HEALTH_SCOPES.join(' ') })).toBe(true)
    // exactly the token that failed live
    expect(healthGrantIsClean({
      scope: [...HEALTH_SCOPES, 'https://www.googleapis.com/auth/calendar'].join(' '),
    })).toBe(false)
    expect(healthGrantIsClean({ scope: '' })).toBe(false)
    expect(healthGrantIsClean(null)).toBe(false)
  })

  it('still never sends include_granted_scopes — it would re-mix the scopes', () => {
    const code = apiSrc().split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    expect(code).not.toContain('include_granted_scopes')
  })
})
