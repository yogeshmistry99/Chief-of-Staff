import { useEffect, useState, useCallback } from 'react'
import { getAllTasks, PROJECTS } from '../lib/todoist'

const PROJECT_NAMES = Object.fromEntries(Object.entries(PROJECTS).map(([name, id]) => [id, name]))

const BUCKET_COLORS = {
  Finance:  'bg-[#C8F5E1] text-[#002115]',
  Health:   'bg-[#FFD8E4] text-[#31111D]',
  Home:     'bg-[#FFF0C8] text-[#261900]',
  Work:     'bg-[#D3E4FF] text-[#001D36]',
  Family:   'bg-[#FFE4F3] text-[#31001D]',
  Personal: 'bg-[#E8F5E9] text-[#1B5E20]',
  Systems:  'bg-[#EADDFF] text-[#21005D]',
}

function isoDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r }

function startOfWeek(d) {
  const r = new Date(d)
  const day = r.getDay()
  r.setDate(r.getDate() - ((day + 6) % 7)) // Monday
  return r
}

function formatTime(dateTime, timeZone) {
  if (!dateTime) return null
  return new Date(dateTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone })
}

async function fetchEvents(start, end) {
  const url = `/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Calendar error')
  return data
}

export default function Calendar() {
  const [tasks, setTasks] = useState([])
  const [events, setEvents] = useState([])
  const [calendarError, setCalendarError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(isoDate(new Date()))
  const [monthOffset, setMonthOffset] = useState(0)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Load tasks
  useEffect(() => {
    getAllTasks()
      .then((data) => setTasks(data.map((t) => ({ ...t, _bucket: PROJECT_NAMES[t.project_id] }))))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Load calendar events — fetch a wide window covering this month ± 1
  const loadEvents = useCallback(() => {
    const start = new Date(today.getFullYear(), today.getMonth() + monthOffset - 1, 1).toISOString()
    const end = new Date(today.getFullYear(), today.getMonth() + monthOffset + 2, 1).toISOString()
    fetchEvents(start, end)
      .then(setEvents)
      .catch((e) => setCalendarError(e.message))
  }, [monthOffset])

  useEffect(() => { loadEvents() }, [loadEvents])

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

  // --- Weekly strip ---
  const weekStart = startOfWeek(today)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // --- Monthly grid ---
  const viewMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
  const totalDays = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()
  const firstDow = (viewMonth.getDay() + 6) % 7 // Mon=0
  const totalCells = Math.ceil((firstDow + totalDays) / 7) * 7
  const monthLabel = viewMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  // Selected day content
  const selectedTasks = tasksByDate[selectedDate] ?? []
  const selectedEvents = (eventsByDate[selectedDate] ?? []).sort((a, b) => {
    const at = a.start?.dateTime ?? a.start?.date ?? ''
    const bt = b.start?.dateTime ?? b.start?.date ?? ''
    return at.localeCompare(bt)
  })

  function DayCell({ d, compact = false }) {
    const iso = isoDate(d)
    const isToday = iso === isoDate(today)
    const isSelected = iso === selectedDate
    const isPast = d < today && !isToday
    const taskCount = tasksByDate[iso]?.length ?? 0
    const hasP1 = tasksByDate[iso]?.some((t) => t.priority === 4)
    const eventCount = eventsByDate[iso]?.length ?? 0

    return (
      <button
        onClick={() => setSelectedDate(iso)}
        className={`flex flex-col items-center rounded-xl transition-colors ${compact ? 'py-1' : 'py-2'} ${
          isSelected ? 'bg-[#6750A4]' :
          isToday ? 'bg-[#EADDFF]' :
          'hover:bg-[#F3EDF7]'
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
          {eventCount > 0 && (
            <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/60' : 'bg-[#49454F]'}`} />
          )}
        </div>
      </button>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-4">
      <div className="px-4 pt-5 max-w-lg mx-auto w-full">

        {/* Weekly strip */}
        <div className="mb-5">
          <p className="text-xs text-[#79747E] mb-2 font-medium uppercase tracking-wide">This week</p>
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((d) => <DayCell key={isoDate(d)} d={d} />)}
          </div>
        </div>

        {/* Selected day panel */}
        <div className="bg-white border border-[#CAC4D0] rounded-2xl p-4 mb-5">
          <p className="text-xs font-semibold text-[#49454F] mb-3">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>

          {/* Events */}
          {selectedEvents.length > 0 && (
            <div className="mb-3 space-y-2">
              {selectedEvents.map((e) => {
                const startTime = formatTime(e.start?.dateTime, e.start?.timeZone)
                const endTime = formatTime(e.end?.dateTime, e.end?.timeZone)
                const isAllDay = !!e.start?.date && !e.start?.dateTime
                return (
                  <div key={e.id} className="flex gap-3 items-start">
                    <div className="w-10 flex-shrink-0 text-right">
                      {isAllDay ? (
                        <span className="text-xs text-[#79747E]">All day</span>
                      ) : (
                        <span className="text-xs font-medium text-[#6750A4]">{startTime}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 bg-[#F3EDF7] rounded-lg px-2.5 py-1.5">
                      <p className="text-sm font-medium text-[#1C1B1F] leading-snug">{e.summary}</p>
                      {!isAllDay && endTime && (
                        <p className="text-xs text-[#79747E]">until {endTime}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Tasks */}
          {selectedTasks.length > 0 && (
            <div className="space-y-0">
              {selectedTasks.map((t) => {
                const color = BUCKET_COLORS[t._bucket] ?? 'bg-[#E7E0EC] text-[#49454F]'
                return (
                  <div key={t.id} className="flex items-start gap-2 py-2 border-b border-[#F3EDF7] last:border-0">
                    <div className="w-10 flex-shrink-0 text-right">
                      <span className="text-xs text-[#79747E]">Task</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#1C1B1F] leading-snug">{t.content}</p>
                      <div className="flex gap-1 mt-0.5">
                        {t._bucket && <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${color}`}>{t._bucket}</span>}
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

          {calendarError && (
            <p className="text-xs text-amber-600 mt-2">Calendar not connected — showing tasks only. Add Google credentials in Vercel to enable events.</p>
          )}
        </div>

        {/* Monthly grid */}
        <div className="bg-white border border-[#CAC4D0] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setMonthOffset((o) => o - 1)} className="p-1 text-[#6750A4] hover:bg-[#EADDFF] rounded-full transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
                <path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z" />
              </svg>
            </button>
            <p className="text-sm font-semibold text-[#1C1B1F]">{monthLabel}</p>
            <button onClick={() => setMonthOffset((o) => o + 1)} className="p-1 text-[#6750A4] hover:bg-[#EADDFF] rounded-full transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
                <path d="M400-240 640-480 400-720l-56 56 184 184-184 184 56 56Z" />
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

          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#6750A4]" />
              <span className="text-xs text-[#79747E]">Tasks</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-xs text-[#79747E]">P1 tasks</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#49454F]" />
              <span className="text-xs text-[#79747E]">Events</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
