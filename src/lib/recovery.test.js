import { describe, it, expect } from 'vitest'
import {
  RECOVERY_INPUTS, RECOVERY_METRIC_KEYS, MIN_BASELINE_NIGHTS,
  zScore, inputScore, recoveryScore, recoveryBand, recoveryBaselines, RECOVERY_BANDS,
} from '../../api/_lib/recovery.js'

// The one computed number in an app of measurements, so it gets tested harder
// than the parsers do. What is being protected is not an exact score — the
// weights are a judgement call and may be revised — but the PROPERTIES that make
// the number honest: it never appears without HRV, never appears on a baseline
// too short to mean anything, is bounded, and moves in the direction the
// physiology says it should.

const stats = (mean, sd, n = 30) => ({ mean, sd, n })

// A day that is exactly average in every signal.
const NORMAL = { hrv: 40, rhr: 60, sleep: 420, breathing: 14, skinTemp: 0 }
const BASE = {
  hrv: stats(40, 5), rhr: stats(60, 3), sleep: stats(420, 40),
  breathing: stats(14, 0.5), skinTemp: stats(0, 0.3),
}

describe('zScore', () => {
  it('is the ordinary z where the baseline has spread', () => {
    expect(zScore(45, stats(40, 5))).toBe(1)
    expect(zScore(30, stats(40, 5))).toBe(-2)
  })

  it('clamps at two standard deviations in both directions', () => {
    // A night the band slipped, or a day with a fever, should push the score to
    // its end of the scale and stop — not drag it somewhere nonsensical.
    expect(zScore(400, stats(40, 5))).toBe(2)
    expect(zScore(-400, stats(40, 5))).toBe(-2)
  })

  it('calls a flat baseline zero rather than infinity', () => {
    expect(zScore(40, stats(40, 0))).toBe(0)
  })

  it('is null with no reading or no baseline, never a stand-in number', () => {
    expect(zScore(null, stats(40, 5))).toBeNull()
    expect(zScore(40, null)).toBeNull()
  })
})

describe('inputScore — the two kinds of input', () => {
  const hrv = RECOVERY_INPUTS.find((i) => i.key === 'hrv')
  const rhr = RECOVERY_INPUTS.find((i) => i.key === 'rhr')
  const breathing = RECOVERY_INPUTS.find((i) => i.key === 'breathing')

  it('rewards a high reading where higher is better', () => {
    expect(inputScore(hrv, 50, stats(40, 5))).toBeGreaterThan(0)
    expect(inputScore(hrv, 30, stats(40, 5))).toBeLessThan(0)
  })

  it('inverts where lower is better — a low resting heart rate is a good day', () => {
    expect(inputScore(rhr, 55, stats(60, 3))).toBeGreaterThan(0)
    expect(inputScore(rhr, 65, stats(60, 3))).toBeLessThan(0)
  })

  it('counts any departure against you on a deviation input, in either direction', () => {
    // Breathing rate is not "more is worse" — it is "unusual is worse". An
    // unusually LOW respiratory rate is not a bonus.
    const high = inputScore(breathing, 15, stats(14, 0.5))
    const low  = inputScore(breathing, 13, stats(14, 0.5))
    expect(high).toBeLessThan(0)
    expect(low).toBeLessThan(0)
    expect(high).toBeCloseTo(low, 10)
  })

  it('tops out at neutral on a deviation input — normal is normal, not a reward', () => {
    // toBeCloseTo, not toBe: negating a zero magnitude gives -0, which is the
    // same neutral contribution and not worth contorting the formula to avoid.
    expect(inputScore(breathing, 14, stats(14, 0.5))).toBeCloseTo(0, 10)
  })
})

describe('recoveryScore', () => {
  it('reads exactly 50 on a day that is average in every signal', () => {
    // 50 means "your own normal". It is the anchor the whole scale hangs off.
    expect(recoveryScore(NORMAL, BASE).score).toBe(50)
  })

  it('rises on a good day and falls on a bad one', () => {
    const good = recoveryScore({ ...NORMAL, hrv: 50, rhr: 55 }, BASE).score
    const bad  = recoveryScore({ ...NORMAL, hrv: 30, rhr: 66 }, BASE).score
    expect(good).toBeGreaterThan(50)
    expect(bad).toBeLessThan(50)
  })

  it('stays inside 0–100 however extreme the day', () => {
    const wild = { hrv: 9999, rhr: -9999, sleep: 9999, breathing: 14, skinTemp: 0 }
    const s = recoveryScore(wild, BASE).score
    expect(s).toBeLessThanOrEqual(100)
    expect(s).toBeGreaterThanOrEqual(0)
  })

  it('refuses a score without HRV rather than quietly renaming the remainder', () => {
    // HRV carries half the weight and most of the meaning. A "recovery" score
    // built from what is left would be a different quantity wearing the name.
    const r = recoveryScore({ ...NORMAL, hrv: null }, BASE)
    expect(r.score).toBeNull()
    expect(r.absent).toBe('no_hrv')
  })

  it('refuses a score on too short a baseline, and says how far along it is', () => {
    const short = Object.fromEntries(Object.entries(BASE).map(([k, v]) => [k, { ...v, n: 3 }]))
    const r = recoveryScore(NORMAL, short)
    expect(r.score).toBeNull()
    expect(r.absent).toBe('learning')
    expect(r.nights).toBe(3)
  })

  it('takes the SHORTEST input baseline as the age of the score', () => {
    // A score is only as established as its least established input, so the
    // learning gate has to read the minimum, not the average.
    const mixed = { ...BASE, breathing: stats(14, 0.5, 4) }
    expect(recoveryScore(NORMAL, mixed).nights).toBe(4)
    expect(recoveryScore(NORMAL, mixed).absent).toBe('learning')
  })

  it('offers a score at exactly the minimum, not one night later', () => {
    const atMin = Object.fromEntries(
      Object.entries(BASE).map(([k, v]) => [k, { ...v, n: MIN_BASELINE_NIGHTS }]),
    )
    expect(recoveryScore(NORMAL, atMin).score).toBe(50)
  })

  it('re-weights over what it had rather than treating a missing signal as zero', () => {
    // Skin temperature carries 4%. Losing it must not drag an otherwise good day
    // 4% toward the middle — it should cost precision, not points.
    const withAll = recoveryScore({ ...NORMAL, hrv: 50 }, BASE)
    const without = recoveryScore({ ...NORMAL, hrv: 50, skinTemp: null }, BASE)
    // The naive alternative — counting the missing 4% as a zero contribution —
    // would pull a good day toward the middle by that much. Re-weighting instead
    // moves it a point at most, and never in the direction of 50.
    expect(without.score).toBeGreaterThanOrEqual(withAll.score)
    expect(without.score - withAll.score).toBeLessThanOrEqual(2)
    expect(without.weightUsed).toBeCloseTo(0.96, 10)
    expect(without.complete).toBe(true)
  })

  it('distinguishes a signal that was not recorded from one with no baseline yet', () => {
    // One resolves itself with time; the other means the band was not worn. The
    // UI says different things about them.
    const r = recoveryScore({ ...NORMAL, skinTemp: null }, { ...BASE, breathing: null })
    expect(r.missing).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'skinTemp', reason: 'no_reading' }),
      expect.objectContaining({ key: 'breathing', reason: 'no_baseline' }),
    ]))
  })

  it('shows its working for every input it used', () => {
    const c = recoveryScore(NORMAL, BASE).contributions.find((x) => x.key === 'hrv')
    expect(c).toMatchObject({ label: 'Heart rate variability', weight: 0.5, value: 40, mean: 40, z: 0, points: 0 })
  })

  it('reports points that add up to the score, on every day of a real month', () => {
    // Someone WILL add the column up. Rounding each share on its own does not
    // survive that — the first real day this ran produced shares of -7, +1, -2,
    // -1 and 0 under a score of 40, a column that said 41.
    const days = []
    for (let i = 0; i < 200; i++) {
      days.push({
        hrv: 40 + ((i * 7) % 23) - 11,
        rhr: 60 + ((i * 5) % 11) - 5,
        sleep: 420 + ((i * 31) % 181) - 90,
        breathing: 14 + (((i * 3) % 7) - 3) / 4,
        skinTemp: (((i * 11) % 9) - 4) / 10,
      })
    }
    for (const day of days) {
      const r = recoveryScore(day, BASE)
      const total = r.contributions.reduce((n, c) => n + c.points, 0)
      expect(r.score).toBe(50 + total)
    }
  })

  it('keeps every point within one of its true share', () => {
    // Largest remainder must not shunt a whole point onto one input to make the
    // sum work — each share stays honest to a rounding.
    const r = recoveryScore({ ...NORMAL, hrv: 50, rhr: 66, breathing: 15.2 }, BASE)
    for (const c of r.contributions) {
      const share = (c.score * c.weight * 50) / r.weightUsed
      expect(Math.abs(c.points - share)).toBeLessThan(1)
    }
  })

  it('offers no points at all while the baseline is still building', () => {
    const short = Object.fromEntries(Object.entries(BASE).map(([k, v]) => [k, { ...v, n: 3 }]))
    for (const c of recoveryScore(NORMAL, short).contributions) {
      expect(c.points).toBeUndefined()
    }
  })

  it('weights sum to one, so a complete day uses the whole scale', () => {
    expect(RECOVERY_INPUTS.reduce((n, i) => n + i.weight, 0)).toBeCloseTo(1, 10)
  })

  it('names every metric it needs fetched', () => {
    expect(RECOVERY_METRIC_KEYS).toEqual(['hrv', 'rhr', 'sleep', 'breathing', 'skinTemp'])
  })
})

describe('bands', () => {
  it('reads the boundaries as stated, not one off', () => {
    expect(recoveryBand(34).key).toBe('low')
    expect(recoveryBand(35).key).toBe('typical')
    expect(recoveryBand(66).key).toBe('typical')
    expect(recoveryBand(67).key).toBe('high')
  })

  it('covers the whole scale with no gap', () => {
    for (let s = 0; s <= 100; s++) expect(recoveryBand(s)).toBeTruthy()
  })

  it('has no band for an absent score', () => {
    expect(recoveryBand(null)).toBeNull()
  })

  it('says what to do, not what you are', () => {
    // The label is read at 7am by someone deciding whether to train. "Take it
    // easy" is actionable; a bare grade is a verdict on the person.
    expect(RECOVERY_BANDS.map((b) => b.label)).toEqual([
      'Take it easy', 'About normal for you', 'Well recovered',
    ])
  })
})

describe('recoveryBaselines', () => {
  it('builds stats for every input that has enough history', () => {
    const b = recoveryBaselines({ hrv: [30, 40, 50], rhr: [60, 60, 60] })
    expect(b.hrv.mean).toBeCloseTo(40, 10)
    expect(b.rhr.sd).toBe(0)
  })

  it('omits an input with too few points rather than inventing a baseline', () => {
    expect(recoveryBaselines({ hrv: [40, 41] }).hrv).toBeUndefined()
  })
})
