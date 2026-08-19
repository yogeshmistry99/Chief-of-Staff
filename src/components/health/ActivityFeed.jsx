import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../../lib/haptic'
import { sessionTime, sessionSummary, sessionDetail } from '../../lib/healthClient'

// The day's sessions, most recent first.
//
// A RECORD OF THE DAY, not a stats table. One line of meaning per entry: what it
// was, when it started, how long, and — only where the session actually carries
// them — how hard. Everything else is behind a tap, which is the discipline that
// keeps this readable in two seconds.
//
// Naps are ordinary rows. They are not a special case grafted onto the sleep
// ring; a nap is a sleep session that happens to be short, and it belongs in the
// same chronological list as a walk.
//
// Built from the app's own tokens: the divider and type scale come from
// DetailRow, the left rule echoes Home's coloured-bar bubble. No icons, no
// gradients — a session is identified by its name, which the API already
// localises for us.

function SessionRow({ session, open, onToggle, onOpen }) {
  const time = sessionTime(session.start)
  const summary = sessionSummary(session)
  const detail = sessionDetail(session)
  return (
    <div className="border-b border-[#F3EDF7] last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-2.5 py-2.5 text-left"
      >
        {/* Session marker. Sleep takes the muted outline colour rather than the
            brand purple: it is something that happened to the body, not
            something done. */}
        <span
          aria-hidden="true"
          className="w-0.5 self-stretch rounded-full flex-shrink-0 mt-0.5"
          style={{ backgroundColor: session.kind === 'sleep' ? '#CAC4D0' : '#6750A4' }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-[#1C1B1F] truncate">{session.name}</span>
            {time && (
              <span className="text-[11px] text-[#79747E] tabular-nums flex-shrink-0">{time}</span>
            )}
          </div>
          {summary.length > 0 && (
            <p className="text-[11px] text-[#79747E] leading-relaxed tabular-nums">
              {summary.join(' · ')}
            </p>
          )}
        </div>
      </button>

      {open && (
        <div className="pl-3 pb-2.5">
          {detail.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3 py-1">
              <span className="text-[11px] text-[#49454F]">{row.label}</span>
              <span className="text-[11px] text-[#1C1B1F] tabular-nums">{row.value}</span>
            </div>
          ))}
          {/* The drop-down stays the quick answer; this is the way to everything
              the API returned for the session. A separate control rather than a
              second meaning for the row tap — one target, one outcome. */}
          <button
            type="button"
            onClick={onOpen}
            className="mt-1.5 text-[11px] text-[#6750A4] underline"
          >
            Full detail →
          </button>
        </div>
      )}
    </div>
  )
}

export default function ActivityFeed({ sessions, from = '/buckets/Health' }) {
  const [open, setOpen] = useState(null)
  const navigate = useNavigate()

  // An empty day says so. Never an empty card, and never a zero standing in for
  // "nothing was recorded".
  if (!sessions?.length) {
    return (
      <p className="text-[#79747E] text-xs leading-relaxed py-1">
        No sessions recorded today.
      </p>
    )
  }

  return (
    <div>
      {sessions.map((s) => (
        <SessionRow
          key={s.id}
          session={s}
          open={open === s.id}
          onToggle={() => { haptic.light(); setOpen(open === s.id ? null : s.id) }}
          onOpen={() => {
            haptic.light()
            // The session travels with the navigation, so the detail screen costs
            // no Google call.
            navigate(`/health/session?id=${encodeURIComponent(s.id)}`, {
              state: { session: s, from },
            })
          }}
        />
      ))}
    </div>
  )
}
