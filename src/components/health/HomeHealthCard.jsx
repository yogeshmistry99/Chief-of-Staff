import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../../lib/haptic'
import { readCachedRings, cacheIsToday, RINGS, displayValue, displayUnit } from '../../lib/healthClient'
import ScoreRing from './ScoreRing'

// The three headline rings on the front page.
//
// IT NEVER CALLS GOOGLE. This renders only what the Health tab last actually
// read, from app_data. A fetch here would hit the Health API on every glance at
// the phone — the front page is opened dozens of times a day and the Health tab
// a handful. Refreshing stays the Health tab's job: its Update button, or opening
// it.
//
// Which makes the timestamp load-bearing rather than decoration. A stale value
// shown with an honest "as of" is correct; the same value shown as though it were
// current is not, so a reading from an earlier day names its day instead of
// quietly passing as today's.

function asOf(cache) {
  const when = new Date(cache.fetchedAt)
  if (Number.isNaN(when.getTime())) return 'as of an unknown time'
  const time = when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (cacheIsToday(cache)) return `as of ${time}`
  // Not today's reading. Say which day, rather than showing a time that reads as
  // this morning.
  const day = when.toLocaleDateString('en-GB', { weekday: 'long' })
  return `as of ${day} ${time}`
}

export default function HomeHealthCard() {
  const navigate = useNavigate()
  const [cache, setCache] = useState(null)
  const [loaded, setLoaded] = useState(false)

  // Reads the cache, and nothing else. Declared below the state it sets — a
  // dependency array is evaluated during render, and a hook above the values it
  // depends on white-screens the app while building perfectly clean.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const value = await readCachedRings()
      if (cancelled) return
      setCache(value)
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [])

  // Nothing rendered until the cache has been looked for, so the card cannot
  // flash "no reading yet" at someone who has one.
  if (!loaded) return null

  const openHealth = () => {
    haptic.light()
    navigate('/buckets/Health', { state: { from: '/' } })
  }

  return (
    <button
      type="button"
      onClick={openHealth}
      className="w-full text-left bg-white border border-[#CAC4D0] rounded-2xl p-4 mb-3 shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="text-xs font-semibold text-[#49454F] uppercase tracking-wide">Health</h2>
        {cache && <span className="text-[10px] text-[#79747E]">{asOf(cache)}</span>}
      </div>

      {!cache ? (
        // Never a row of empty rings pretending to be a reading.
        <p className="text-xs text-[#79747E] leading-relaxed py-1">
          No reading yet — open Health to take one.
        </p>
      ) : (
        <div className="flex gap-1 pt-1">
          {RINGS.map((r) => {
            const m = cache.rings?.[r.key]
            return (
              <ScoreRing
                key={r.key}
                label={r.label}
                value={displayValue(r.key, m)}
                unit={displayUnit(r.key)}
                caption={m?.absent ? (m.detail ?? 'Not recorded') : r.caption}
                position={m?.position ?? null}
                hasRange={!!m?.hasRange}
              />
            )
          })}
        </div>
      )}
    </button>
  )
}
