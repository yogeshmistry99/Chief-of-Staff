import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { haptic } from '../lib/haptic'
import { formatMinutes } from '../../api/_lib/health.js'
import { fetchHealth, sessionTime, STAGE_LABEL } from '../lib/healthClient'
import StageBar from '../components/health/StageBar'
import { stageSegments } from '../lib/healthClient'
import { Card, DetailRow } from '../components/health/HealthCard'

// One session, opened out.
//
// The feed row and its drop-down answer "what was it and roughly how hard". This
// answers everything the API actually returned for that session — distance, pace,
// time in each heart-rate zone, the full sleep summary — without any of it having
// to fit on a row.
//
// Same data rule as the ring screen: the session travels in router state, so
// opening it costs no Google call. Opened cold it fetches once and finds itself
// by id, and says plainly when it cannot.
//
// The id is a Google resource name containing slashes, so it rides in a QUERY
// parameter rather than a path segment — an encoded %2F in a path is handled
// inconsistently and would 404 on some hosts.

function fmtPace(secondsPerMeter) {
  if (secondsPerMeter == null || secondsPerMeter <= 0) return null
  const perKm = secondsPerMeter * 1000
  const m = Math.floor(perKm / 60)
  const s = Math.round(perKm % 60)
  return `${m}:${String(s).padStart(2, '0')} /km`
}

export default function HealthSessionDetail() {
  const [params] = useSearchParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const id = state?.session?.id ?? params.get('id')

  const [session, setSession] = useState(state?.session ?? null)
  const [loading, setLoading] = useState(!state?.session)
  const [missing, setMissing] = useState(false)

  // Declared below the state it sets — see the hook-order trap.
  useEffect(() => {
    if (session || !id) { if (!id) setMissing(true); return }
    let cancelled = false
    ;(async () => {
      const data = await fetchHealth()
      if (cancelled) return
      const found = (data?.sessions ?? []).find((s) => s.id === id)
      if (found) setSession(found)
      else setMissing(true)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [session, id])

  const back = () => { haptic.light(); navigate(state?.from ?? '/buckets/Health', { state: { tab: 'health' } }) }

  const isSleep = session?.kind === 'sleep'
  const segments = isSleep ? stageSegments(session?.stages) : []

  return (
    <div className="flex flex-col h-full bg-[#F3EDF7]">
      <div className="flex-shrink-0 px-4 pt-4 pb-2">
        <button onClick={back} className="text-sm text-[#6750A4] mb-2">← Today</button>
        <h1 className="text-lg font-semibold text-[#1C1B1F] leading-tight">
          {session?.name ?? 'Session'}
        </h1>
        {session?.start && (
          <p className="text-xs text-[#79747E]">
            {sessionTime(session.start)}
            {session.end ? `–${sessionTime(session.end)}` : ''}
            {session.durationMinutes != null ? ` · ${formatMinutes(session.durationMinutes)}` : ''}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-8">
        {loading && !session && !missing && (
          <p className="py-8 text-center text-sm text-[#79747E]">Reading from Google Health…</p>
        )}

        {missing && (
          <p className="py-8 text-center text-sm text-[#79747E] leading-relaxed px-4">
            That session isn’t in today’s readings. Open it from Today so it can be shown.
          </p>
        )}

        {session && (
          <>
            {isSleep ? (
              <>
                {(session.stages || session.sleepType) && (
                  <Card title="Sleep stages">
                    <StageBar
                      segments={segments}
                      absent={session.stages ? null : 'This session was recorded without stage detail.'}
                    />
                  </Card>
                )}
                {session.stages && (
                  <Card title="Time in each stage">
                    {Object.entries(session.stages).map(([stage, mins]) => (
                      <DetailRow key={stage} label={STAGE_LABEL[stage] ?? stage} value={formatMinutes(mins)} />
                    ))}
                  </Card>
                )}
                <Card title="Summary">
                  <DetailRow label="Asleep" value={formatMinutes(session.minutesAsleep)} />
                  <DetailRow label="Time in bed" value={formatMinutes(session.minutesInSleepPeriod)} />
                  <DetailRow
                    label="Sleep efficiency"
                    value={session.efficiency != null ? `${Math.round(session.efficiency * 100)}%` : null}
                  />
                  <DetailRow label="Time to fall asleep" value={formatMinutes(session.minutesToFallAsleep)} />
                  <DetailRow label="Awake" value={formatMinutes(session.minutesAwake)} />
                  <DetailRow label="Recording type" value={session.sleepType === 'STAGES' ? 'With stages' : session.sleepType ? 'Classic' : null} />
                  <DetailRow label="Counted as" value={session.nap ? 'Nap' : 'Main sleep'} />
                </Card>
              </>
            ) : (
              <>
                <Card title="Effort">
                  <DetailRow
                    label="Calories"
                    value={session.calories != null ? `${Math.round(session.calories)} kcal` : null}
                  />
                  <DetailRow
                    label="Average heart rate"
                    value={session.averageHeartRate != null ? `${Math.round(session.averageHeartRate)} bpm` : null}
                  />
                  <DetailRow
                    label="Active zone minutes"
                    value={session.activeZoneMinutes != null ? String(Math.round(session.activeZoneMinutes)) : null}
                  />
                </Card>

                <Card title="Movement">
                  <DetailRow
                    label="Distance"
                    value={session.distanceKm != null ? `${session.distanceKm.toFixed(2)} km` : null}
                  />
                  <DetailRow
                    label="Steps"
                    value={session.steps != null ? Math.round(session.steps).toLocaleString('en-GB') : null}
                  />
                  <DetailRow label="Average pace" value={fmtPace(session.paceSecondsPerMeter)} />
                  <DetailRow
                    label="Elevation gain"
                    value={session.elevationGainMm != null ? `${Math.round(session.elevationGainMm / 1000)} m` : null}
                  />
                </Card>

                {/* Real returned data, not a derived "peak" — the API has no peak
                    heart rate field, only time spent in each zone. */}
                {session.zoneMinutes && (
                  <Card title="Time in heart-rate zones">
                    {Object.entries(session.zoneMinutes).map(([zone, mins]) => (
                      <DetailRow key={zone} label={zone} value={formatMinutes(mins)} />
                    ))}
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
