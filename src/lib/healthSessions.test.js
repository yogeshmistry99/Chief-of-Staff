import { describe, it, expect } from 'vitest'
import {
  parseSleepSessions, parseExerciseSessions, dedupeSessions, buildFeed,
  parseDuration, shapeMetric, buildCache, cacheIsToday, cacheableRings, ABSENT,
  shouldCacheReading, stageBaseline, baselineValues, isNap,
} from '../../api/_lib/health.js'

// Fixtures copied from REAL API responses (2026-08-19, direct calls), not invented.
// The duplicate-walk pair and the nap are the exact records that shaped the design.

// One walk, recorded twice: the band carries calories/HR/AZM, the phone carries
// none of them, and their start times differ by a minute.
const bandWalk = {
  name: 'users/me/dataTypes/exercise/dataPoints/band-1',
  exercise: {
    exerciseType: 'WALKING', displayName: 'Walk',
    interval: { startTime: '2026-08-14T21:20:00Z', endTime: '2026-08-14T21:35:20Z' },
    activeDuration: '920.400s',
    metricsSummary: {
      caloriesKcal: 102, averageHeartRateBeatsPerMinute: '112',
      steps: '1727', distanceMillimeters: 1230500, activeZoneMinutes: '4',
    },
  },
}
const phoneWalk = {
  name: 'users/me/dataTypes/exercise/dataPoints/phone-1',
  exercise: {
    exerciseType: 'WALKING', displayName: 'Walk',
    interval: { startTime: '2026-08-14T21:21:00Z', endTime: '2026-08-14T21:36:39Z' },
    activeDuration: '939.212s',
    metricsSummary: { steps: '1738', distanceMillimeters: 1243296 },
  },
}
const nap = {
  name: 'users/me/dataTypes/sleep/dataPoints/nap-1',
  sleep: {
    type: 'STAGES',
    metadata: { nap: true },
    interval: { startTime: '2026-08-17T12:13:00Z', endTime: '2026-08-17T13:02:00Z' },
    summary: { minutesAsleep: '21', minutesAwake: '7', minutesInSleepPeriod: '28' },
  },
}
const mainSleep = {
  name: 'users/me/dataTypes/sleep/dataPoints/main-1',
  sleep: {
    type: 'STAGES',
    metadata: { nap: false, mainSleep: true },
    interval: { startTime: '2026-08-18T23:32:00Z', endTime: '2026-08-19T05:45:00Z' },
    summary: {
      minutesAsleep: '332', minutesAwake: '41', minutesInSleepPeriod: '373',
      minutesToFallAsleep: '0',
      stagesSummary: [{ stage: 'DEEP', totalMinutes: '48' }, { stage: 'REM', totalMinutes: '69' }],
    },
  },
}

describe('parseDuration', () => {
  it('reads the protobuf Duration string as seconds', () => {
    expect(parseDuration('920.400s')).toBeCloseTo(920.4)
    expect(parseDuration('1776s')).toBe(1776)
  })
  it('is null rather than 0 for a missing or unparseable duration', () => {
    for (const bad of [null, undefined, '', 'abc', 42]) expect(parseDuration(bad)).toBeNull()
  })
})

describe('dedupeSessions — every walk is recorded twice', () => {
  it('collapses the band and phone copies of one walk into a single row', () => {
    const out = dedupeSessions(parseExerciseSessions({ dataPoints: [bandWalk, phoneWalk] }))
    expect(out).toHaveLength(1)
  })

  it('keeps the copy that carries the metrics, whichever order they arrive in', () => {
    for (const order of [[bandWalk, phoneWalk], [phoneWalk, bandWalk]]) {
      const [kept] = dedupeSessions(parseExerciseSessions({ dataPoints: order }))
      expect(kept.calories).toBe(102)
      expect(kept.averageHeartRate).toBe(112)
      expect(kept.activeZoneMinutes).toBe(4)
    }
  })

  it('matches on overlap, not on equal start times — they differ by a minute', () => {
    const a = parseExerciseSessions({ dataPoints: [bandWalk] })[0]
    const b = parseExerciseSessions({ dataPoints: [phoneWalk] })[0]
    expect(a.start).not.toBe(b.start)
    expect(dedupeSessions([a, b])).toHaveLength(1)
  })

  it('does NOT merge two genuinely separate walks', () => {
    const later = {
      ...bandWalk,
      name: 'later',
      exercise: {
        ...bandWalk.exercise,
        interval: { startTime: '2026-08-14T23:00:00Z', endTime: '2026-08-14T23:20:00Z' },
      },
    }
    expect(dedupeSessions(parseExerciseSessions({ dataPoints: [bandWalk, later] }))).toHaveLength(2)
  })

  it('does not merge different activity types that happen to overlap', () => {
    const run = {
      ...bandWalk,
      name: 'run',
      exercise: { ...bandWalk.exercise, exerciseType: 'RUNNING', displayName: 'Run' },
    }
    expect(dedupeSessions(parseExerciseSessions({ dataPoints: [bandWalk, run] }))).toHaveLength(2)
  })
})

describe('parseSleepSessions — naps are ordinary entries', () => {
  it('returns EVERY session, not just the main sleep', () => {
    const out = parseSleepSessions({ dataPoints: [mainSleep, nap] })
    expect(out).toHaveLength(2)
  })

  it('names a nap a nap and flags it', () => {
    const [n] = parseSleepSessions({ dataPoints: [nap] })
    expect(n.name).toBe('Nap')
    expect(n.nap).toBe(true)
    expect(n.durationMinutes).toBe(21)
  })

  it('carries neither calories nor heart rate, because sleep has neither', () => {
    const [n] = parseSleepSessions({ dataPoints: [nap] })
    expect(n.calories).toBeNull()
    expect(n.averageHeartRate).toBeNull()
  })

  it('computes efficiency from two returned fields, never inventing one', () => {
    const [m] = parseSleepSessions({ dataPoints: [mainSleep] })
    expect(m.efficiency).toBeCloseTo(332 / 373)
    const noPeriod = parseSleepSessions({
      dataPoints: [{ sleep: { interval: {}, summary: { minutesAsleep: '100' } } }],
    })[0]
    expect(noPeriod.efficiency).toBeNull()
  })
})

describe('buildFeed', () => {
  it('merges both kinds, deduped, most recent first', () => {
    const feed = buildFeed(
      { dataPoints: [mainSleep, nap] },
      { dataPoints: [bandWalk, phoneWalk] },
    )
    expect(feed).toHaveLength(3)   // 2 sleeps + 1 deduped walk
    const starts = feed.map((s) => s.start)
    expect(starts).toEqual([...starts].sort().reverse())
    expect(feed[0].start).toBe('2026-08-18T23:32:00Z')
  })

  it('is an empty list, not a fabricated row, when nothing was recorded', () => {
    expect(buildFeed({ dataPoints: [] }, { dataPoints: [] })).toEqual([])
    expect(buildFeed(null, null)).toEqual([])
  })
})

describe('cardio absence — the band was worn', () => {
  it('says the day is quiet, not that the band is missing', () => {
    const shaped = shapeMetric('cardio', { dataPoints: [] })
    expect(shaped.absent).toBe(ABSENT.NO_ACTIVITY)
    expect(shaped.detail).toMatch(/active zone minutes/i)
    expect(shaped.detail).not.toMatch(/not worn|synced/i)
  })

  it('leaves other metrics on the generic not-recorded reason', () => {
    expect(shapeMetric('steps', { dataPoints: [] }).absent).toBe(ABSENT.NO_DATA)
    expect(shapeMetric('hrv', { dataPoints: [] }).absent).toBe(ABSENT.NO_DATA)
  })

  it('still reports a real reading when there is one', () => {
    const payload = {
      dataPoints: [
        { activeZoneMinutes: { activeZoneMinutes: '2', heartRateZone: 'CARDIO', interval: {} } },
        { activeZoneMinutes: { activeZoneMinutes: '1', heartRateZone: 'FAT_BURN', interval: {} } },
      ],
    }
    expect(shapeMetric('cardio', payload)).toMatchObject({ value: 3, absent: null })
  })
})

describe('the last-reading cache', () => {
  const metrics = {
    sleep:  { value: 332, absent: null, position: 0.6, range: { min: 15, max: 543, n: 15 } },
    hrv:    { value: 33.35, absent: null, position: 0.43, range: { min: 24, max: 45, n: 24 } },
    cardio: { value: null, absent: 'no_activity', detail: 'No active zone minutes yet today.', position: null, range: null },
    rhr:    { value: 65, absent: null },
  }

  it('stores only what it takes to draw the three rings', () => {
    const rings = cacheableRings(metrics)
    expect(Object.keys(rings).sort()).toEqual(['cardio', 'hrv', 'sleep'])
    // Not a second copy of the data: no raw payloads ride along.
    expect(rings.hrv).not.toHaveProperty('raw')
    expect(rings.sleep).not.toHaveProperty('stages')
  })

  it('keeps an absence as an absence, so a blank ring stays blank', () => {
    const { cardio } = cacheableRings(metrics)
    expect(cardio.value).toBeNull()
    expect(cardio.absent).toBe('no_activity')
    expect(cardio.detail).toMatch(/active zone minutes/i)
  })

  it('records the range only as a boolean — the arc needs no numbers', () => {
    expect(cacheableRings(metrics).sleep.hasRange).toBe(true)
    expect(cacheableRings(metrics).cardio.hasRange).toBe(false)
  })

  it('knows a reading from an earlier day is not today\'s', () => {
    const now = new Date('2026-08-19T08:00:00Z')
    expect(cacheIsToday(buildCache('2026-08-19', now.toISOString(), metrics), 'Europe/London', now)).toBe(true)
    expect(cacheIsToday(buildCache('2026-08-18', now.toISOString(), metrics), 'Europe/London', now)).toBe(false)
    expect(cacheIsToday(null, 'Europe/London', now)).toBe(false)
  })
})

describe('shouldCacheReading — only a full read of today becomes "the last reading"', () => {
  const now = new Date('2026-08-19T08:00:00Z')
  const all = ['sleep', 'hrv', 'cardio', 'rhr', 'spo2', 'breathing', 'skinTemp', 'steps']

  it('caches a full read of today', () => {
    expect(shouldCacheReading('2026-08-19', all, 'Europe/London', now)).toBe(true)
  })

  it('does NOT cache a historical query', () => {
    // Found in production: ?date=2026-08-14 overwrote the home screen's reading
    // with that day's rings.
    expect(shouldCacheReading('2026-08-14', all, 'Europe/London', now)).toBe(false)
  })

  it('does NOT cache a narrowed query missing a ring', () => {
    // ?metrics=sleep,cardio cached two rings, which the home screen would then
    // render as two rings instead of three.
    expect(shouldCacheReading('2026-08-19', ['sleep', 'cardio'], 'Europe/London', now)).toBe(false)
    expect(shouldCacheReading('2026-08-19', ['sleep'], 'Europe/London', now)).toBe(false)
  })

  it('caches when every ring is present even if other metrics are not', () => {
    expect(shouldCacheReading('2026-08-19', ['sleep', 'hrv', 'cardio'], 'Europe/London', now)).toBe(true)
  })
})

describe('naps are not nights', () => {
  // Found against the real 30-day window: six of fifteen sessions were naps of
  // 15–57 minutes. None had REM and half had no deep sleep, so averaging them in
  // put the REM and deep minima at 0 and dragged every mean down. A "typical
  // range" that starts at zero because of an afternoon nap is not typical of
  // anything.
  const night = (deep, rem, light) => ({
    sleep: {
      metadata: { nap: false, mainSleep: true },
      summary: {
        minutesAsleep: String(deep + rem + light),
        stagesSummary: [
          { type: 'DEEP', minutes: String(deep) },
          { type: 'REM', minutes: String(rem) },
          { type: 'LIGHT', minutes: String(light) },
        ],
      },
    },
  })
  const napPoint = (light) => ({
    sleep: {
      metadata: { nap: true },
      summary: {
        minutesAsleep: String(light),
        stagesSummary: [{ type: 'LIGHT', minutes: String(light) }],
      },
    },
  })

  const payload = {
    dataPoints: [night(48, 69, 214), night(26, 54, 177), napPoint(21), napPoint(15), napPoint(41)],
  }

  it('excludes naps from the stage baseline', () => {
    const base = stageBaseline(payload)
    expect(base.DEEP.nights).toBe(2)
    expect(base.REM.nights).toBe(2)
  })

  it('does not let a nap put the REM or deep minimum at zero', () => {
    const base = stageBaseline(payload)
    // A nap has no REM. Counting it would make the floor 0.
    expect(base.REM.min).toBe(54)
    expect(base.DEEP.min).toBe(26)
  })

  it('does not let naps drag the means down', () => {
    const base = stageBaseline(payload)
    expect(base.DEEP.mean).toBe(37)    // (48+26)/2, not (48+26+0+0+0)/5
    expect(base.REM.mean).toBe(62)     // (69+54)/2
  })

  it('excludes naps from the sleep ring\'s trailing range too', () => {
    // The ring placed a full night inside a range whose floor was a 15-minute nap.
    const values = baselineValues('sleep', payload)
    expect(values).toHaveLength(2)
    expect(Math.min(...values)).toBe(257)
  })

  it('still returns naps in the feed — a nap is a real session', () => {
    const sessions = parseSleepSessions(payload)
    expect(sessions).toHaveLength(5)
    expect(sessions.filter((s) => s.nap)).toHaveLength(3)
  })

  it('has no baseline at all when every session in the window is a nap', () => {
    expect(stageBaseline({ dataPoints: [napPoint(21), napPoint(15)] })).toBeNull()
  })
})
