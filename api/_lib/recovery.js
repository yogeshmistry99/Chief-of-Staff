import { baselineStats } from './health.js'

// A recovery score, computed here — and the only number in this app that is not a
// measurement.
//
// EVERYTHING ELSE IN THIS FEATURE IS A READING. This is not, and the UI must never
// present it as one. `api/_lib/health.js` opens by saying it never invents a
// number, and that rule stands for every metric there. This module is the
// deliberate, single exception, added 19 Aug 2026 at the owner's explicit request
// after establishing that Fitbit's own Readiness and Cardio Load are computed in
// the Fitbit app and published by no API — not the Google Health API (verified
// against all 44 data types and 31 rollup schemas, revision 20260817) and not the
// legacy Fitbit Web API, which never exposed readiness and is retired in
// September 2026.
//
// So the choice was an empty ring or an honest estimate. This is the estimate,
// and it carries its own workings so it can be argued with.
//
// ─── What it is built from ────────────────────────────────────────────────────
//
// WHOOP publishes the shape of its recovery score: HRV carries most of the
// predictive weight, resting heart rate and sleep matter but less because much of
// what they say is already in the HRV, and respiratory rate was added because it
// held information the others did not. FITBIT describes readiness as HRV, resting
// heart rate and sleep against a personal baseline — it explicitly replaced its
// activity component with resting heart rate.
//
// Both reduce to the same idea: how far is each signal from what is normal FOR
// THIS PERSON. So every input is a z-score against the wearer's own trailing
// window, never against a population norm.
//
// IT WILL NOT MATCH FITBIT'S NUMBER and does not try to. Their weights are not
// published; ours are below, in the open. What it can be is consistent — the same
// physiology moving the same way day to day.
//
// ─── Two kinds of input ───────────────────────────────────────────────────────
//
// DIRECTIONAL — one end is better. Higher HRV is better; lower resting heart rate
// is better; more sleep is better up to a point.
//
// DEVIATION — any departure from your own normal counts against you, in either
// direction. Respiratory rate and skin temperature behave this way: elevated
// suggests strain or illness, and unusually low is not a bonus.

export const RECOVERY_INPUTS = [
  {
    key: 'hrv',
    label: 'Heart rate variability',
    weight: 0.50,
    mode: 'directional',
    higherIsBetter: true,
    // Without HRV there is no score. It carries half the weight and most of the
    // meaning; a "recovery" score built from the remainder would be a different
    // quantity wearing the same name.
    required: true,
  },
  {
    key: 'rhr',
    label: 'Resting heart rate',
    weight: 0.25,
    mode: 'directional',
    higherIsBetter: false,
  },
  {
    key: 'sleep',
    label: 'Sleep',
    weight: 0.15,
    mode: 'directional',
    higherIsBetter: true,
  },
  {
    key: 'breathing',
    label: 'Breathing rate',
    weight: 0.06,
    mode: 'deviation',
  },
  {
    key: 'skinTemp',
    label: 'Skin temperature',
    weight: 0.04,
    mode: 'deviation',
    // Already a deviation from the wearer's own baseline when it arrives, so it
    // is scored against the spread of those deviations rather than re-centred.
  },
]

// Which fetched metrics the score needs a baseline for. The endpoint reads this
// so the list of extra baseline queries can never drift from the inputs above.
export const RECOVERY_METRIC_KEYS = RECOVERY_INPUTS.map((i) => i.key)

// Nights of history before a score is offered at all.
//
// Fitbit asks for a month of nights to build a baseline and says so. Seven is the
// floor at which a z-score means anything; below it the answer is "still learning",
// which is a true statement rather than a hedged number.
export const MIN_BASELINE_NIGHTS = 7

// Beyond this many standard deviations, more is not more.
//
// Clamped because a single freak reading — a night the band slipped, a day with a
// fever — should move the score to its end of the scale and stop, not drag it into
// nonsense. Two SD covers roughly 95% of a normal distribution.
const Z_CLAMP = 2

export function zScore(value, stats) {
  if (value == null || !stats || !Number.isFinite(stats.sd)) return null
  // A flat baseline cannot say whether today is unusual. Zero, not infinity.
  if (stats.sd === 0) return 0
  const z = (value - stats.mean) / stats.sd
  return Math.max(-Z_CLAMP, Math.min(Z_CLAMP, z))
}

// One input's contribution, in the -1..+1 space the weights are applied to.
export function inputScore(input, value, stats) {
  const z = zScore(value, stats)
  if (z == null) return null
  if (input.mode === 'deviation') {
    // Any distance from normal is a negative, and being exactly normal is neutral
    // rather than a bonus — so this half of the scale runs 0 down to -1.
    return -Math.abs(z) / Z_CLAMP
  }
  const signed = input.higherIsBetter ? z : -z
  return signed / Z_CLAMP
}

// The score: 0–100, where 50 is "exactly your own normal".
//
// Deliberately centred rather than stretched to fill the range. A day that is
// unremarkable in every signal should read as unremarkable, and only genuine
// departures should move it far.
// Whole points that add up.
//
// The detail screen lists each input's contribution and the score above it, and
// someone WILL add the column up. Rounding each share on its own does not
// survive that: on the first real day this ran, five shares rounded to -7, +1,
// -2, -1 and 0 — a sum of -9 under a score of 40, which says -10.
//
// Largest remainder instead: floor everything, then hand the leftover points to
// whichever shares were cut hardest. Every number stays an integer, each is
// within a point of its true share, and the column sums to exactly what the
// score claims.
export function apportion(shares, total) {
  const floors = shares.map((v) => Math.floor(v))
  let left = Math.round(total) - floors.reduce((a, b) => a + b, 0)
  const order = shares
    .map((v, i) => ({ i, remainder: v - Math.floor(v) }))
    .sort((a, b) => b.remainder - a.remainder)
  const out = floors.slice()
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k].i] += 1
  // A negative leftover takes back from the shares that were rounded up most
  // generously — the same rule, read from the other end.
  for (let k = order.length - 1; left < 0 && k >= 0; k--, left++) out[order[k].i] -= 1
  return out
}

export function recoveryScore(values, baselines) {
  const contributions = []
  const missing = []
  let weighted = 0
  let weightUsed = 0

  for (const input of RECOVERY_INPUTS) {
    const stats = baselines?.[input.key] ?? null
    const value = values?.[input.key] ?? null
    const score = inputScore(input, value, stats)

    if (score == null) {
      missing.push({
        key: input.key,
        label: input.label,
        // Which of the two reasons it is matters: one resolves itself with time,
        // the other means the band was not worn.
        reason: value == null ? 'no_reading' : 'no_baseline',
      })
      continue
    }

    contributions.push({
      key: input.key,
      label: input.label,
      weight: input.weight,
      value,
      mean: stats.mean,
      sd: stats.sd,
      nights: stats.n,
      z: zScore(value, stats),
      score,
      mode: input.mode,
      higherIsBetter: input.higherIsBetter ?? null,
    })
    weighted += score * input.weight
    weightUsed += input.weight
  }

  const required = RECOVERY_INPUTS.filter((i) => i.required)
  for (const r of required) {
    if (!contributions.some((c) => c.key === r.key)) {
      return {
        score: null,
        absent: 'no_hrv',
        contributions,
        missing,
        weightUsed: 0,
      }
    }
  }

  const nights = Math.min(...contributions.map((c) => c.nights))
  if (nights < MIN_BASELINE_NIGHTS) {
    // No score, so nothing for the points to add up TO. They are left off rather
    // than shown against a number that does not exist.
    return {
      score: null,
      absent: 'learning',
      nights,
      contributions,
      missing,
      weightUsed,
    }
  }

  // Re-weighted over the inputs that were actually available, so a missing minor
  // signal shifts the score's precision rather than dragging it toward zero.
  const normalised = weightUsed > 0 ? weighted / weightUsed : 0
  const score = Math.round(Math.max(0, Math.min(100, 50 + normalised * 50)))

  // Each input's share of the distance from 50, denominated on the weight that
  // was actually used — so a missing minor signal changes how the rest are
  // credited rather than leaving a gap in the column.
  const shares = contributions.map((c) => (c.score * c.weight * 50) / weightUsed)
  const points = apportion(shares, score - 50)
  contributions.forEach((c, i) => { c.points = points[i] })

  return {
    score,
    absent: null,
    contributions,
    missing,
    weightUsed,
    nights,
    // Stated so the UI never has to decide what counts as complete.
    complete: weightUsed >= 0.95,
  }
}

// Bands, for wording and colour. Whoop's thirds, in this app's language and
// without its palette.
export const RECOVERY_BANDS = [
  { key: 'low',     max: 34,       label: 'Take it easy' },
  { key: 'typical', max: 66,       label: 'About normal for you' },
  { key: 'high',    max: Infinity, label: 'Well recovered' },
]

export function recoveryBand(score) {
  if (score == null) return null
  return RECOVERY_BANDS.find((b) => score <= b.max) ?? RECOVERY_BANDS[RECOVERY_BANDS.length - 1]
}

// Baselines for every input, from the payloads already fetched for the window.
export function recoveryBaselines(valuesByKey) {
  const out = {}
  for (const input of RECOVERY_INPUTS) {
    const stats = baselineStats(valuesByKey?.[input.key])
    if (stats) out[input.key] = stats
  }
  return out
}
