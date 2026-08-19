import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { haptic } from '../lib/haptic'
import { formatMinutes, CARDIO_ZONE_LABEL } from '../../api/_lib/health.js'
import {
  fetchHealth, RINGS, DETAIL_GROUPS, displayValue, displayUnit,
  STAGE_LABEL, absentCopy, readSessionHealth, writeSessionHealth,
} from '../lib/healthClient'
import ScoreRing from '../components/health/ScoreRing'
import RecoveryBreakdown from '../components/health/RecoveryBreakdown'
import SleepHypnogram from '../components/health/SleepHypnogram'
import { Card, DetailRow } from '../components/health/HealthCard'

// One ring, opened out.
//
// The ring stays at the top so the screen you tapped is still the screen you are
// on. Below it: what the arc is relative to, then the breakdown that would not
// fit under three rings.
//
// DATA COMES FROM ROUTER STATE, not a fetch. The Health tab already has this
// reading and hands it over on navigation, so tapping a ring costs no Google
// call. Opened cold — a refresh, or a link straight here — there is nothing to
// inherit, so it fetches once for itself. That is a deliberate navigation rather
// than an app-open, which is the distinction the no-fetch-on-glance rule draws.

const RING_BY_KEY = Object.fromEntries(RINGS.map((r) => [r.key, r]))

export default function HealthRingDetail() {
  const { key } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()

  // Router state first, then whatever the session already holds. Only a genuinely
  // cold open — a refresh, a direct link — reaches the fetch.
  const seeded = state?.health ?? readSessionHealth()
  const [health, setHealth] = useState(seeded)
  const [loading, setLoading] = useState(!seeded)

  // Below the state it sets, deliberately: a dependency array is evaluated during
  // render, and a hook above the values it depends on white-screens the app while
  // building perfectly clean.
  useEffect(() => {
    if (health) return
    let cancelled = false
    ;(async () => {
      const data = await fetchHealth()
      if (cancelled) return
      writeSessionHealth(data)
      setHealth(data)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [health])

  const ring = RING_BY_KEY[key]
  const metric = health?.metrics?.[key]
  const back = () => { haptic.light(); navigate(state?.from ?? '/buckets/Health', { state: { tab: 'health' } }) }

  if (!ring) {
    return (
      <div className="p-4">
        <p className="text-sm text-[#79747E]">No such reading.</p>
        <button onClick={back} className="mt-3 text-sm text-[#6750A4]">← Back</button>
      </div>
    )
  }

  const sleep = health?.metrics?.sleep
  const hrv = health?.metrics?.hrv
  const group = DETAIL_GROUPS.find((g) => g.ring === key)

  return (
    <div className="flex flex-col h-full bg-[#F3EDF7]">
      <div className="flex-shrink-0 px-4 pt-4 pb-2">
        <button onClick={back} className="text-sm text-[#6750A4] mb-2">← Today</button>
        <h1 className="text-lg font-semibold text-[#1C1B1F] leading-tight">{ring.label}</h1>
        {health?.date && (
          <p className="text-xs text-[#79747E]">
            {new Date(`${health.date}T00:00:00`).toLocaleDateString('en-GB', {
              weekday: 'long', day: 'numeric', month: 'long',
            })}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-8">
        {loading && !health && (
          <p className="py-8 text-center text-sm text-[#79747E]">Reading from Google Health…</p>
        )}

        {health && (
          <>
            {/* The ring you tapped, still here. */}
            <div className="flex justify-center py-4">
              <ScoreRing
                label={ring.label}
                value={displayValue(key, metric)}
                unit={displayUnit(key)}
                caption={metric?.absent ? absentCopy(metric) : ring.caption}
                position={metric?.position ?? null}
                hasRange={!!metric?.range}
              />
            </div>

            {/* What the arc is relative to, in numbers rather than implied.
                Recovery is excluded: its arc is a 0–100 scale, not a trailing
                window, and "lowest in 30 days: 0" would be a fabricated fact. Its
                own workings take this slot instead. */}
            {key === 'recovery' ? (
              <RecoveryBreakdown metric={metric} />
            ) : (
              <Card title="Your own range">
                {metric?.range ? (
                  <>
                    <DetailRow label="Lowest in 30 days" value={displayValue(key, { value: metric.range.min })} />
                    <DetailRow label="Highest in 30 days" value={displayValue(key, { value: metric.range.max })} />
                    <DetailRow label="Days measured" value={String(metric.range.n)} />
                  </>
                ) : (
                  <p className="text-[#79747E] text-xs leading-relaxed py-1">
                    Not enough recent days to place today in a range yet.
                  </p>
                )}
              </Card>
            )}

            {key === 'sleep' && (
              <>
                <Card title="The night">
                  <SleepHypnogram
                    segments={sleep?.segments}
                    start={sleep?.start}
                    end={sleep?.end}
                    stages={sleep?.stages}
                    stageBaseline={sleep?.stageBaseline}
                    shortAwakenings={sleep?.shortAwakenings}
                    absent={sleep?.absent ? absentCopy(sleep) : sleep?.stagesAbsent ? 'This night was recorded without stage detail.' : null}
                  />
                </Card>
                {sleep?.stages && (
                  <Card title="Time in each stage">
                    {Object.entries(sleep.stages).map(([stage, mins]) => (
                      <DetailRow key={stage} label={STAGE_LABEL[stage] ?? stage} value={formatMinutes(mins)} />
                    ))}
                  </Card>
                )}
                <Card title="Last night">
                  <DetailRow label="Asleep" value={formatMinutes(sleep?.minutesAsleep)} absent={absentCopy(sleep)} />
                  <DetailRow label="Time in bed" value={formatMinutes(sleep?.minutesInSleepPeriod)} absent={absentCopy(sleep)} />
                  <DetailRow
                    label="Sleep efficiency"
                    value={sleep?.efficiency != null ? `${Math.round(sleep.efficiency * 100)}%` : null}
                    absent={absentCopy(sleep)}
                  />
                  <DetailRow label="Time to fall asleep" value={formatMinutes(sleep?.minutesToFallAsleep)} absent={absentCopy(sleep)} />
                  <DetailRow label="Awake" value={formatMinutes(sleep?.minutesAwake)} absent={absentCopy(sleep)} />
                  <DetailRow label="Awake after waking" value={formatMinutes(sleep?.minutesAfterWakeUp)} absent={absentCopy(sleep)} />
                  <DetailRow label="Recording type" value={sleep?.type ? (sleep.type === 'STAGES' ? 'With stages' : 'Classic') : null} />
                </Card>
              </>
            )}

            {key === 'cardio' && (
              <Card title="Minutes by zone">
                {metric?.zones ? (
                  Object.entries(metric.zones).map(([zone, mins]) => (
                    <DetailRow key={zone} label={CARDIO_ZONE_LABEL[zone] ?? zone} value={`${mins} min`} />
                  ))
                ) : (
                  <p className="text-[#79747E] text-xs leading-relaxed py-1">
                    {metric?.absent ? absentCopy(metric) : 'No zone breakdown for today.'}
                  </p>
                )}
              </Card>
            )}

            {/* The rows this ring already owned, unchanged — they simply live here
                now instead of in a card that appeared under the rings. */}
            {group && (
              <Card title={group.title}>
                {group.rows.map((row) => (
                  <DetailRow
                    key={row.key}
                    label={row.label}
                    value={displayValue(row.key, health.metrics?.[row.key])
                      ? `${displayValue(row.key, health.metrics[row.key])}${displayUnit(row.key) ? ` ${displayUnit(row.key)}` : ''}`
                      : null}
                    absent={absentCopy(health.metrics?.[row.key])}
                  />
                ))}
              </Card>
            )}

            {/* HRV's own extras: fields the API returns alongside the average and
                which have nowhere else to go. Not derived, not interpreted.
                They followed HRV onto the Recovery screen when it took the ring —
                otherwise the only route to them was a ring that no longer exists. */}
            {key === 'recovery' && hrv?.raw && (
              <Card title="Also measured overnight">
                <DetailRow
                  label="Non-REM heart rate"
                  value={hrv.raw.nonRemHeartRateBeatsPerMinute ? `${Math.round(Number(hrv.raw.nonRemHeartRateBeatsPerMinute))} bpm` : null}
                />
                <DetailRow
                  label="Deep-sleep RMSSD"
                  value={hrv.raw.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds != null
                    ? `${Math.round(hrv.raw.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds)} ms` : null}
                />
                <DetailRow
                  label="Entropy"
                  value={hrv.raw.entropy != null ? hrv.raw.entropy.toFixed(2) : null}
                />
              </Card>
            )}

            <p className="text-[10px] text-[#79747E] text-center leading-relaxed px-4 pt-2">
              {key === 'recovery'
                ? 'The number is an estimate worked out from the readings above. Everything else on this screen is measured.'
                : 'The number is your reading. The ring shows where it sits in your own last 30 days.'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
