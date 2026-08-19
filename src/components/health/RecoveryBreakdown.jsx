import { displayValue, displayUnit } from '../../lib/healthClient'
import { RECOVERY_INPUTS, MIN_BASELINE_NIGHTS } from '../../../api/_lib/recovery.js'
import { Card } from './HealthCard'

// The recovery score, shown with its workings.
//
// THIS SCREEN EXISTS BECAUSE THE NUMBER IS COMPUTED. Sleep and cardio are
// readings and need no defence; recovery is the app's one deliberate estimate,
// and the terms of adding it were that it would carry its inputs in the open
// rather than arrive as an oracle. Everything below is that: which signals were
// used, what each one read today, what it usually reads, and how many points it
// moved the score. A reader who disagrees with the score can see exactly which
// input they disagree with.
//
// No new number is invented here. Every value on the left is a reading already
// in the response; every mean is that reading's own trailing window; the points
// come straight from api/_lib/recovery.js.

const SIGN = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0')

const MISSING_REASON = {
  no_reading: 'not recorded',
  no_baseline: 'no baseline yet',
}

function reading(key, value) {
  const shown = displayValue(key, { value })
  if (shown == null) return null
  const unit = displayUnit(key)
  return unit ? `${shown} ${unit}` : shown
}

export default function RecoveryBreakdown({ metric }) {
  if (!metric) return null

  const contributions = metric.contributions ?? []
  const missing = metric.missing ?? []
  const weightPercent = Math.round((metric.weightUsed ?? 0) * 100)

  return (
    <>
      <Card title="What this number is">
        <p className="text-xs text-[#49454F] leading-relaxed py-1">
          An <span className="font-medium text-[#1C1B1F]">estimate</span>, not a reading. Your band
          does not measure recovery — this score is worked out here from the overnight signals it
          does measure, by comparing each one against your own recent normal.
        </p>
        {metric.bandLabel && (
          <p className="text-sm font-medium text-[#1C1B1F] pt-1 pb-1">{metric.bandLabel}</p>
        )}
        {metric.detail && (
          <p className="text-xs text-[#79747E] leading-relaxed pt-1">{metric.detail}</p>
        )}
      </Card>

      {contributions.length > 0 && (
        <Card title="How it was worked out">
          {contributions.map((c) => (
            <div
              key={c.key}
              className="flex items-baseline justify-between gap-3 py-2.5 border-b border-[#F3EDF7] last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm text-[#49454F]">{c.label}</p>
                <p className="text-[11px] text-[#79747E] tabular-nums leading-tight">
                  {reading(c.key, c.value)} today · usually {reading(c.key, c.mean)}
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-sm font-medium text-[#1C1B1F] tabular-nums">{SIGN(c.points)}</p>
                <p className="text-[11px] text-[#79747E] tabular-nums leading-tight">
                  {Math.round(c.weight * 100)}% weight
                </p>
              </div>
            </div>
          ))}
        </Card>
      )}

      {missing.length > 0 && (
        <Card title="Left out">
          {missing.map((m) => (
            <div
              key={m.key}
              className="flex items-baseline justify-between gap-3 py-2.5 border-b border-[#F3EDF7] last:border-0"
            >
              <span className="text-sm text-[#49454F]">{m.label}</span>
              <span className="text-[11px] text-[#79747E] flex-shrink-0">
                {MISSING_REASON[m.reason] ?? 'not available'}
              </span>
            </div>
          ))}
        </Card>
      )}

      <p className="text-[10px] text-[#79747E] leading-relaxed px-4 pt-2 pb-1">
        Built from {contributions.length} of {RECOVERY_INPUTS.length} signals, carrying{' '}
        {weightPercent}% of the weight
        {metric.nights != null && `, against ${metric.nights} night${metric.nights === 1 ? '' : 's'} of your own history`}
        . {MIN_BASELINE_NIGHTS} nights is the minimum before a score is offered at all.
      </p>
    </>
  )
}
