import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { PROJECTS } from '../lib/todoist'
import { getCachedTasks } from '../lib/taskCache'
import { haptic } from '../lib/haptic'
import EditSheet from '../components/EditSheet'
import { onCalendarChange } from '../lib/claude'
import { isoDate, addDays, startOfWeek, formatTime, formatDuration, getEventAccent } from '../lib/calendarUtils'
import { BUCKET_META } from '../lib/bucketConfig'

const PROJECT_NAMES = Object.fromEntries(Object.entries(PROJECTS).map(([name, id]) => [id, name]))

function EventRow({ event: initialEvent }) {
  const [e, setE] = useState(initialEvent)
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editSummary, setEditSummary] = useState(initialEvent.summary ?? '')
  const [editLocation, setEditLocation] = useState(initialEvent.location ?? '')
  const [editDesc, setEditDesc] = useState(initialEvent.description?.replace(/<[^>]*>/g, '').trim() ?? '')
  const [saving, setSaving] = useState(false)
  const holdRef = useRef(null)
  const isHoldRef = useRef(false)
  const isReadOnly = !!e._readOnly

  const accent   = getEventAccent(e)
  const isAllDay = !!e.start?.date && !e.start?.dateTime
  const startTime = formatTime(e.start?.dateTime, e.start?.timeZone)
  const endTime   = formatTime(e.end?.dateTime,   e.end?.timeZone)
  const duration  = formatDuration(e.start?.dateTime, e.end?.dateTime)
  const attendees = e.attendees ?? []
  const selfRsvp  = attendees.find((a) => a.self)?.responseStatus
  const description = e.description?.replace(/<[^>]*>/g, '').trim()
  const meetLink  = e.hangoutLink ?? e.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri
  const rsvpColor = { accepted: 'text-green-700', declined: 'text-red-600', tentative: 'text-amber-600' }

  function handlePointerDown() {
    if (isReadOnly) return
    isHoldRef.current = false
    holdRef.current = setTimeout(() => {
      isHoldRef.current = true
      haptic.medium()
      setEditSummary(e.summary ?? '')
      setEditLocation(e.location ?? '')
      setEditDesc(e.description?.replace(/<[^>]*>/g, '').trim() ?? '')
      setEditOpen(true)
    }, 500)
  }
  function handlePointerUp() { clearTimeout(holdRef.current) }
  function handleClick() {
    if (isHoldRef.current) { isHoldRef.current = false; return }
    setExpanded((x) => !x)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const updates = { summary: editSummary, location: editLocation, description: editDesc }
      await fetch('/api/calendar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: e.id, ...updates }),
      })
      haptic.success()
      setE((prev) => ({ ...prev, ...updates }))
      setEditOpen(false)
    } catch { haptic.error() }
    finally { setSaving(false) }
  }

  return (
    <>
      <div className="border-b border-[#F3EDF7] last:border-0">
        <div
          className="flex gap-3 items-center py-2 cursor-pointer select-none"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onClick={handleClick}
        >
          <div className="w-10 flex-shrink-0 text-right">
            {isAllDay
              ? <span className="text-xs text-[#79747E]">All day</span>
              : <span className={`text-xs font-medium ${accent.time}`}>{startTime}</span>}
          </div>
          {/* Coloured-bar bubble */}
          <div className={`flex-1 min-w-0 rounded-lg overflow-hidden flex ${accent.bg}`}>
            <div className={`w-1 flex-shrink-0 ${accent.bar}`} />
            <div className="flex-1 min-w-0 px-2.5 py-1.5">
              <p className={`text-sm leading-snug truncate font-medium ${accent.label}`}>{e.summary}</p>
              {!isAllDay && endTime && !expanded && (
                <p className="text-xs text-[#79747E]">until {endTime}{duration ? ` · ${duration}` : ''}</p>
              )}
              {isReadOnly && !expanded && e._calendarName && (
                <p className="text-[10px] text-[#CAC4D0] uppercase tracking-wide">{e._calendarName}</p>
              )}
            </div>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="#CAC4D0"
            className={`flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
            <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z"/>
          </svg>
        </div>

        <div style={{
          maxHeight: expanded ? '360px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        }}>
          <div className="pl-13 pr-6 pb-3 space-y-2" style={{ paddingLeft: '3.25rem' }}>
            {!isAllDay && startTime && (
              <p className="text-xs text-[#49454F]">{startTime} – {endTime}{duration ? ` (${duration})` : ''}</p>
            )}
            {e.location && (
              <div className="flex items-start gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" height="13" viewBox="0 -960 960 960" width="13" fill="#79747E" className="mt-0.5 flex-shrink-0">
                  <path d="M480-480q33 0 56.5-23.5T560-560q0-33-23.5-56.5T480-640q-33 0-56.5 23.5T400-560q0 33 23.5 56.5T480-480Zm0 294q122-112 181-203.5T720-560q0-117-74.5-188.5T480-820q-91 0-165.5 71.5T240-560q0 75 59 166.5T480-186Z"/>
                </svg>
                <p className="text-xs text-[#49454F]">{e.location}</p>
              </div>
            )}
            {meetLink && (
              <a href={meetLink} target="_blank" rel="noopener noreferrer"
                onClick={(ev) => ev.stopPropagation()}
                className="flex items-center gap-1.5 text-xs text-[#6750A4] font-medium"
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="13" viewBox="0 -960 960 960" width="13" fill="currentColor">
                  <path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h480q33 0 56.5 23.5T720-720v180l160-160v440L720-420v180q0 33-23.5 56.5T640-160H160Z"/>
                </svg>
                Join video call
              </a>
            )}
            {selfRsvp && (
              <p className={`text-xs font-medium ${rsvpColor[selfRsvp] ?? 'text-[#79747E]'}`}>
                {selfRsvp === 'needsAction' ? 'Not responded' : selfRsvp === 'accepted' ? '✓ Accepted' : selfRsvp === 'declined' ? '✗ Declined' : '~ Tentative'}
              </p>
            )}
            {attendees.length > 0 && (
              <p className="text-xs text-[#79747E]">
                {attendees.length} attendee{attendees.length !== 1 ? 's' : ''}
                {attendees.slice(0, 3).map((a) => ` · ${a.displayName?.split(' ')[0] ?? a.email.split('@')[0]}`)}
                {attendees.length > 3 ? ` +${attendees.length - 3}` : ''}
              </p>
            )}
            {description && (
              <p className="text-xs text-[#49454F] leading-relaxed line-clamp-3">{description}</p>
            )}
            {!isReadOnly && <p className="text-[10px] text-[#CAC4D0]">Hold to edit</p>}
          </div>
        </div>
      </div>

      {!isReadOnly && <EditSheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit event" onSave={handleSave} saving={saving}>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[#49454F]">Title</label>
          <textarea
            value={editSummary}
            onChange={(ev) => setEditSummary(ev.target.value)}
            className="w-full rounded-xl border border-[#79747E] px-3 py-2 text-sm text-[#1C1B1F] focus:outline-none focus:border-[#6750A4] resize-none"
            rows={2}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[#49454F]">Location</label>
          <input
            type="text"
            value={editLocation}
            onChange={(ev) => setEditLocation(ev.target.value)}
            placeholder="Add location"
            className="w-full rounded-xl border border-[#79747E] px-3 py-2 text-sm text-[#1C1B1F] focus:outline-none focus:border-[#6750A4]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[#49454F]">Notes</label>
          <textarea
            value={editDesc}
            onChange={(ev) => setEditDesc(ev.target.value)}
            placeholder="Add notes"
            className="w-full rounded-xl border border-[#79747E] px-3 py-2 text-sm text-[#1C1B1F] focus:outline-none focus:border-[#6750A4] resize-none"
            rows={3}
          />
        </div>
      </EditSheet>}
    </>
  )
}

async function fetchEvents(start, end) {
  const url = `/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Calendar error')
  return data
}

export default function Calendar() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [events, setEvents] = useState([])
  const [calendarError, setCalendarError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(isoDate(new Date()))
  const [monthOffset, setMonthOffset] = useState(0)
  const [weekOffset, setWeekOffset] = useState(0)
  const stripRef = useRef(null)
  const stripSwipeRef = useRef({})

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Attach non-passive touch listeners so we can preventDefault on horizontal swipes
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    function onStart(e) {
      const t = e.touches[0]
      stripSwipeRef.current = { startX: t.clientX, startY: t.clientY, decided: false, horizontal: false }
    }
    function onMove(e) {
      const s = stripSwipeRef.current
      if (!s.startX) return
      const dx = e.touches[0].clientX - s.startX
      const dy = e.touches[0].clientY - s.startY
      if (!s.decided && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        s.decided = true
        s.horizontal = Math.abs(dx) > Math.abs(dy)
      }
      if (s.horizontal) e.preventDefault()
    }
    function onEnd(e) {
      const s = stripSwipeRef.current
      if (!s.decided || !s.horizontal) return
      const dx = e.changedTouches[0].clientX - s.startX
      if (Math.abs(dx) > 40) {
        haptic.light()
        setWeekOffset((o) => (dx < 0 ? o + 1 : o - 1))
      }
      stripSwipeRef.current = {}
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove',  onMove,  { passive: false })
    el.addEventListener('touchend',   onEnd,   { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove',  onMove)
      el.removeEventListener('touchend',   onEnd)
    }
  }, [])

  // Load tasks from cache
  useEffect(() => {
    const cached = getCachedTasks()
    setTasks(cached.filter((t) => !t.is_completed).map((t) => ({ ...t, _bucket: PROJECT_NAMES[t.project_id] ?? t._projectName })))
    setLoading(false)
  }, [])

  // Load events — window covers both month view and week view
  const loadEvents = useCallback(() => {
    setCalendarError(null)
    const weekViewStart = startOfWeek(addDays(today, weekOffset * 7))
    const weekViewEnd   = addDays(weekViewStart, 7)
    const monthViewStart = new Date(today.getFullYear(), today.getMonth() + monthOffset - 1, 1)
    const monthViewEnd   = new Date(today.getFullYear(), today.getMonth() + monthOffset + 2, 1)
    const start = new Date(Math.min(weekViewStart.getTime(), monthViewStart.getTime())).toISOString()
    const end   = new Date(Math.max(weekViewEnd.getTime(),   monthViewEnd.getTime())).toISOString()
    fetchEvents(start, end)
      .then(setEvents)
      .catch((e) => setCalendarError(e.message))
  }, [monthOffset, weekOffset])

  useEffect(() => { loadEvents() }, [loadEvents])
  useEffect(() => onCalendarChange(loadEvents), [loadEvents])

  // Index tasks by due date
  const tasksByDate = {}
  tasks.forEach((t) => {
    if (t.due?.date) {
      if (!tasksByDate[t.due.date]) tasksByDate[t.due.date] = []
      tasksByDate[t.due.date].push(t)
    }
  })

  // Index events by date
  const eventsByDate = {}
  events.forEach((e) => {
    const dateStr = e.start?.date ?? e.start?.dateTime?.split('T')[0]
    if (!dateStr) return
    if (!eventsByDate[dateStr]) eventsByDate[dateStr] = []
    eventsByDate[dateStr].push(e)
  })

  // Weekly strip
  const weekStart = startOfWeek(addDays(today, weekOffset * 7))
  const weekDays  = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekEnd   = addDays(weekStart, 6)

  function weekLabel() {
    if (weekOffset === 0) return 'This week'
    if (weekOffset === 1) return 'Next week'
    if (weekOffset === -1) return 'Last week'
    const fmt = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    return `${fmt(weekStart)} – ${fmt(weekEnd)}`
  }

  // Monthly grid
  const viewMonth  = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
  const totalDays  = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()
  const firstDow   = (viewMonth.getDay() + 6) % 7
  const totalCells = Math.ceil((firstDow + totalDays) / 7) * 7
  const monthLabel = viewMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  // Selected day content
  const selectedTasks  = tasksByDate[selectedDate] ?? []
  const selectedEvents = (eventsByDate[selectedDate] ?? []).sort((a, b) => {
    const at = a.start?.dateTime ?? a.start?.date ?? ''
    const bt = b.start?.dateTime ?? b.start?.date ?? ''
    return at.localeCompare(bt)
  })

  function DayCell({ d, compact = false }) {
    const iso       = isoDate(d)
    const isToday   = iso === isoDate(today)
    const isSelected = iso === selectedDate
    const isPast    = d < today && !isToday
    const taskCount = tasksByDate[iso]?.length ?? 0
    const hasP1     = tasksByDate[iso]?.some((t) => t.priority === 4)
    const eventsHere = eventsByDate[iso] ?? []
    const personalEvents = eventsHere.filter((e) => !e._readOnly)
    const hasVideo  = personalEvents.some((e) => !!(e.hangoutLink ?? e.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')))
    const hasMeeting = personalEvents.some((e) => (e.attendees?.length ?? 0) > 0)

    return (
      <button
        onClick={() => setSelectedDate(iso)}
        className={`flex flex-col items-center rounded-xl transition-colors ${compact ? 'py-1' : 'py-2'} ${
          isSelected ? 'bg-[#6750A4]' : isToday ? 'bg-[#EADDFF]' : 'hover:bg-[#F3EDF7]'
        }`}
      >
        {!compact && (
          <span className={`text-xs mb-1 ${isSelected ? 'text-white/70' : 'text-[#79747E]'}`}>
            {d.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2)}
          </span>
        )}
        <span className={`text-sm font-semibold leading-none ${
          isSelected ? 'text-white' : isToday ? 'text-[#6750A4]' : isPast ? 'text-[#C0BAC8]' : 'text-[#1C1B1F]'
        }`}>
          {d.getDate()}
        </span>
        <div className="flex gap-0.5 mt-0.5 h-1.5 items-center">
          {taskCount > 0 && (
            <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : hasP1 ? 'bg-red-400' : 'bg-[#6750A4]'}`} />
          )}
          {hasVideo && (
            <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/70' : 'bg-[#26C6DA]'}`} />
          )}
          {!hasVideo && hasMeeting && (
            <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/70' : 'bg-[#42A5F5]'}`} />
          )}
          {!hasVideo && !hasMeeting && personalEvents.length > 0 && (
            <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/60' : 'bg-[#9E9E9E]'}`} />
          )}
        </div>
      </button>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-4">
      <div className="px-4 pt-5 max-w-lg mx-auto w-full">

        {/* Calendar error banner */}
        {calendarError && (
          <div className="mb-4 rounded-2xl bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm font-semibold text-red-800 mb-0.5">Google Calendar error</p>
            <p className="text-xs text-red-700 leading-relaxed">{calendarError}</p>
            {calendarError.toLowerCase().includes('token') && (
              <p className="text-xs text-red-600 mt-1.5">
                The Google refresh token has expired. Go to Vercel → Environment Variables and update <code className="bg-red-100 px-1 rounded">GOOGLE_REFRESH_TOKEN</code> with a new token from the OAuth Playground.
              </p>
            )}
            <button onClick={loadEvents} className="mt-2 text-xs font-medium text-red-700 underline">Retry</button>
          </div>
        )}

        {/* Weekly strip */}
        <div className="mb-5">
          {/* Strip header: label + nav */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => { haptic.light(); setWeekOffset((o) => o - 1) }}
              className="p-1 text-[#79747E] hover:text-[#6750A4] hover:bg-[#EADDFF] rounded-full transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
                <path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/>
              </svg>
            </button>
            <button
              onClick={() => { if (weekOffset !== 0) { haptic.light(); setWeekOffset(0) } }}
              className="text-xs font-medium uppercase tracking-wide text-[#79747E] hover:text-[#6750A4] transition-colors px-2 py-0.5 rounded-full hover:bg-[#F3EDF7]"
            >
              {weekLabel()}
            </button>
            <button
              onClick={() => { haptic.light(); setWeekOffset((o) => o + 1) }}
              className="p-1 text-[#79747E] hover:text-[#6750A4] hover:bg-[#EADDFF] rounded-full transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
                <path d="M400-240 640-480 400-720l-56 56 184 184-184 184 56 56Z"/>
              </svg>
            </button>
          </div>
          {/* Swipeable day grid */}
          <div ref={stripRef} className="grid grid-cols-7 gap-1">
            {weekDays.map((d) => <DayCell key={isoDate(d)} d={d} />)}
          </div>
        </div>

        {/* Selected day panel */}
        <div className="bg-white border border-[#CAC4D0] rounded-2xl p-4 mb-5">
          <p className="text-xs font-semibold text-[#49454F] mb-3">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: '2-digit', year: '2-digit' })}
          </p>

          {selectedEvents.length > 0 && (
            <div className="mb-3">
              {selectedEvents.map((e) => <EventRow key={e.id} event={e} />)}
            </div>
          )}

          {selectedTasks.length > 0 && (
            <div className="space-y-0">
              {selectedTasks.map((t) => {
                const m = BUCKET_META[t._bucket]
                return (
                  <div key={t.id} className="flex items-start gap-2 py-2 border-b border-[#F3EDF7] last:border-0">
                    <div className="w-10 flex-shrink-0 text-right">
                      <span className="text-xs text-[#79747E]">Task</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#1C1B1F] leading-snug">{t.content}</p>
                      <div className="flex gap-1 mt-0.5">
                        {t._bucket && m && <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${m.bg} ${m.text}`}>{t._bucket}</span>}
                        {t.priority === 4 && <span className="text-xs font-semibold text-red-700 bg-[#FFD8E4] px-1.5 py-0.5 rounded">P1</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {selectedEvents.length === 0 && selectedTasks.length === 0 && !loading && (
            <p className="text-sm text-[#79747E]">Nothing on this day.</p>
          )}
        </div>

        {/* Monthly grid */}
        <div className="bg-white border border-[#CAC4D0] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setMonthOffset((o) => o - 1)} className="p-1 text-[#6750A4] hover:bg-[#EADDFF] rounded-full transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
                <path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/>
              </svg>
            </button>
            <p className="text-sm font-semibold text-[#1C1B1F]">{monthLabel}</p>
            <button onClick={() => setMonthOffset((o) => o + 1)} className="p-1 text-[#6750A4] hover:bg-[#EADDFF] rounded-full transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
                <path d="M400-240 640-480 400-720l-56 56 184 184-184 184 56 56Z"/>
              </svg>
            </button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
              <p key={d} className="text-center text-xs text-[#79747E] font-medium py-1">{d}</p>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {Array.from({ length: totalCells }, (_, i) => {
              const dayNum = i - firstDow + 1
              if (dayNum < 1 || dayNum > totalDays) return <div key={i} />
              const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), dayNum)
              return <DayCell key={i} d={d} compact />
            })}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#6750A4]" />
              <span className="text-xs text-[#79747E]">Tasks</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-xs text-[#79747E]">P1</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#26C6DA]" />
              <span className="text-xs text-[#79747E]">Video call</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#42A5F5]" />
              <span className="text-xs text-[#79747E]">Meeting</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#9E9E9E]" />
              <span className="text-xs text-[#79747E]">Event</span>
            </div>
          </div>
        </div>

        {/* Colour legend for event bubbles */}
        <div className="mt-3 px-1">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {[
              { bar: 'bg-[#6750A4]', label: 'Personal' },
              { bar: 'bg-[#42A5F5]', label: 'Meeting' },
              { bar: 'bg-[#26C6DA]', label: 'Video call' },
              { bar: 'bg-[#81C784]', label: 'Holiday' },
              { bar: 'bg-amber-300',  label: 'Tentative' },
              { bar: 'bg-red-300',    label: 'Declined' },
            ].map(({ bar, label }) => (
              <div key={label} className="flex items-center gap-1">
                <span className={`w-2 h-3 rounded-sm flex-shrink-0 ${bar}`} />
                <span className="text-[10px] text-[#79747E]">{label}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
