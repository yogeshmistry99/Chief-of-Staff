import { SYMPTOM_GROUPS, isInverted, symptomLabel } from '../../api/_lib/journalSymptoms.js'
import { localDate, shiftDate } from './journal'

// Pure charting logic for the journal trends view.
//
// Kept separate from the SVG component so the parts that could be WRONG — which
// day a point belongs to, whether a gap is a gap, how a mean is taken — are
// testable without a browser. The component only turns numbers into geometry.
//
// The governing rule everywhere below: THIS CHART MUST NOT INVENT DATA. It is
// read alongside a clinical record and a personal injury claim, so a day with
// no entry has to look like a day with no entry — never a line drawn straight
// through it, which would show a trend that was never observed.

export const RANGES = [
  { key: 'week',  label: 'Week',     days: 7 },
  { key: 'month', label: 'Month',    days: 30 },
  { key: 'sixmo', label: '6 months', days: 182 },
  { key: 'year',  label: 'Year',     days: 365 },
]

// The mean of every non-inverted item for a day — the one line worth showing by
// default, and the same figure the history list and the filed document report.
export const OVERALL_KEY = '__overall__'
export const OVERALL_LABEL = 'Overall severity'

// Chosen to stay distinguishable when several are layered, and to survive the
// common forms of colour blindness reasonably well (varied lightness, not just
// hue). Overall is the app's own purple; the rest are assigned in pick order.
export const OVERALL_COLOR = '#6750A4'
export const SERIES_COLORS = [
  '#B3261E', // red
  '#006C51', // green
  '#0B57D0', // blue
  '#8A5000', // amber
  '#7D2A8B', // magenta
  '#00639B', // teal
  '#4A4458', // slate
]

// Every option the picker can offer, in display order, grouped as the form is.
export function chartOptions() {
  return [
    { key: OVERALL_KEY, label: OVERALL_LABEL, group: 'Summary' },
    ...SYMPTOM_GROUPS.flatMap((g) =>
      g.symptoms.map((s) => ({ key: s.key, label: s.label, group: g.title }))
    ),
  ]
}

export function optionLabel(key) {
  return key === OVERALL_KEY ? OVERALL_LABEL : symptomLabel(key)
}

// The mean across items where a higher number means a worse day. sleep_quality
// is excluded because it runs the other way — averaging it in would cancel out
// real symptom load. Same exclusion as the filed document; the two must agree.
export function overallSeverity(entry) {
  const vals = Object.entries(entry?.symptoms ?? {})
    .filter(([k, v]) => v?.score != null && !isInverted(k))
    .map(([, v]) => v.score)
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

// A day's value for one series. null means NOT RECORDED, and null is load-
// bearing: it becomes a break in the line rather than a point on it.
export function valueFor(entry, key) {
  if (!entry) return null
  if (key === OVERALL_KEY) return overallSeverity(entry)
  const v = entry.symptoms?.[key]
  return v?.score ?? null
}

// Oldest → newest, which is the direction a trend is read in. (The history list
// runs the other way because there the useful end is today.)
export function dateRange(days, today = localDate()) {
  const out = []
  for (let i = days - 1; i >= 0; i--) out.push(shiftDate(today, -i))
  return out
}

// Contiguous runs of recorded days. A single isolated day yields a run of one,
// which the component draws as a dot — a lone observation is still evidence and
// must not vanish just because it has no neighbour to join to.
export function segments(values) {
  const out = []
  let run = []
  values.forEach((v, i) => {
    if (v == null) {
      if (run.length) out.push(run)
      run = []
    } else {
      run.push({ i, v })
    }
  })
  if (run.length) out.push(run)
  return out
}

export function buildSeries(entries, keys, dates) {
  const byDate = Object.fromEntries((entries ?? []).map((e) => [e.entry_date, e]))
  let colorIndex = 0
  return (keys ?? []).map((key) => {
    const color = key === OVERALL_KEY
      ? OVERALL_COLOR
      : SERIES_COLORS[colorIndex++ % SERIES_COLORS.length]
    const values = dates.map((d) => valueFor(byDate[d], key))
    return {
      key,
      label: optionLabel(key),
      color,
      inverted: key !== OVERALL_KEY && isInverted(key),
      values,
      segments: segments(values),
      recorded: values.filter((v) => v != null).length,
    }
  })
}

// How much of the window actually has an entry. Shown next to the chart because
// a flat-looking year with nine entries in it means something very different
// from a flat year with three hundred.
export function coverage(entries, dates) {
  const have = new Set((entries ?? []).map((e) => e.entry_date))
  const logged = dates.filter((d) => have.has(d)).length
  return { logged, total: dates.length }
}

// Short x-axis labels: first, middle and last day of the window. More than three
// is unreadable at phone width.
export function axisDates(dates) {
  if (!dates.length) return []
  const pick = dates.length < 3
    ? dates.map((_, i) => i)
    : [0, Math.floor((dates.length - 1) / 2), dates.length - 1]
  return [...new Set(pick)].map((i) => ({ i, date: dates[i], label: shortDate(dates[i]) }))
}

export function shortDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  if (!y || !m || !d) return String(dateStr)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
