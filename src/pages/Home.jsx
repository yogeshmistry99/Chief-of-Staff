import { useEffect, useRef, useState } from 'react'
import { getAllTasks, closeTask, PROJECTS } from '../lib/todoist'
import { prioritise, scoreTask } from '../lib/priority'
import { sendMessage, SYSTEM_PROMPTS } from '../lib/claude'
import { haptic } from '../lib/haptic'
import Markdown from '../components/Markdown'
import ChatInput from '../components/ChatInput'

async function fetchUpcomingEvents() {
  const now = new Date()
  const end = new Date(now); end.setDate(end.getDate() + 7)
  const url = `/api/calendar?start=${encodeURIComponent(now.toISOString())}&end=${encodeURIComponent(end.toISOString())}`
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Calendar error')
  return data
}

function formatEventTime(dateTime, timeZone) {
  if (!dateTime) return null
  return new Date(dateTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone })
}

function formatEventDay(event) {
  const dt = event.start?.dateTime ?? event.start?.date
  if (!dt) return ''
  const d = new Date(event.start?.dateTime ? dt : dt + 'T00:00:00')
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`
  const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  if (dStr === todayStr) return 'Today'
  if (dStr === tomorrowStr) return 'Tomorrow'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

const PROJECT_NAMES = Object.fromEntries(Object.entries(PROJECTS).map(([name, id]) => [id, name]))

const INPUT_MODES = [
  { id: 'task',     label: 'Quick task',  placeholder: 'Add a task — e.g. "Call dentist P1 Health"' },
  { id: 'email',    label: 'From email',  placeholder: 'Paste email — CoS will extract tasks…' },
  { id: 'calendar', label: 'Calendar',    placeholder: 'e.g. "Cancel Monday 3pm standup"' },
  { id: 'note',     label: 'Note',        placeholder: 'Jot a thought — CoS will route it…' },
]

function PriorityBadge({ task }) {
  const { isOverdue, isToday, days } = scoreTask(task)
  if (isOverdue) return <span className="text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Overdue</span>
  if (isToday)   return <span className="text-xs font-semibold text-[#6750A4] bg-[#EADDFF] px-1.5 py-0.5 rounded">Today</span>
  if (days === 1) return <span className="text-xs font-semibold text-[#49454F] bg-[#E7E0EC] px-1.5 py-0.5 rounded">Tomorrow</span>
  return null
}

function PriorityDot({ priority }) {
  if (priority === 4) return <span className="text-xs font-semibold text-red-700 bg-[#FFD8E4] px-1.5 py-0.5 rounded">P1</span>
  if (priority === 3) return <span className="text-xs font-semibold text-amber-800 bg-[#FFF0C8] px-1.5 py-0.5 rounded">P2</span>
  return null
}

function TaskRow({ task, onComplete }) {
  const [completing, setCompleting] = useState(false)
  const { bucket, isOverdue } = scoreTask(task)

  async function handleComplete() {
    haptic.success()
    setCompleting(true)
    try { await closeTask(task.id); onComplete(task.id) }
    catch { haptic.error(); setCompleting(false) }
  }

  return (
    <div className={`flex items-start gap-3 py-3 border-b border-[#F3EDF7] last:border-0 transition-opacity ${completing ? 'opacity-20' : ''}`}>
      <button
        onClick={handleComplete}
        disabled={completing}
        className="w-5 h-5 rounded-full border-2 border-[#CAC4D0] hover:border-[#6750A4] hover:bg-[#EADDFF] flex-shrink-0 mt-0.5 transition-colors"
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${isOverdue ? 'text-red-900' : 'text-[#1C1B1F]'}`}>{task.content}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <PriorityDot priority={task.priority} />
          <PriorityBadge task={task} />
          {bucket && <span className="text-xs text-[#79747E]">{bucket}</span>}
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const [tasks, setTasks]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [error, setError]             = useState(null)
  const [events, setEvents]           = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [mode, setMode]               = useState('task')
  const [messages, setMessages]       = useState([])
  const inputRef = useRef(null)
  const messagesEndRef = useRef(null)

  function loadTasks(showRefreshing = false) {
    if (showRefreshing) setRefreshing(true)
    else setLoading(true)
    getAllTasks()
      .then((data) => data.map((t) => ({ ...t, _projectName: PROJECT_NAMES[t.project_id] })))
      .then(setTasks)
      .catch((e) => setError(e.message))
      .finally(() => { setLoading(false); setRefreshing(false) })
  }

  useEffect(() => { loadTasks() }, [])
  useEffect(() => {
    fetchUpcomingEvents()
      .then(setEvents)
      .catch(() => {})
      .finally(() => setEventsLoading(false))
  }, [])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function removeTask(id) { setTasks((prev) => prev.filter((t) => t.id !== id)) }

  async function handleSend(content, attachmentName) {
    const userMsg = { role: 'user', content, mode, attachmentName }
    setMessages((prev) => [...prev, userMsg])
    setMessages((prev) => [...prev, { role: 'assistant', content: '…', pending: true }])
    try {
      const history = [...messages, userMsg]
        .filter((m) => !m.pending)
        .map(({ role, content }) => ({ role, content }))
      const reply = await sendMessage(history, SYSTEM_PROMPTS.cos(tasks))
      setMessages((prev) => [...prev.slice(0, -1), { role: 'assistant', content: reply }])
    } catch (err) {
      setMessages((prev) => [...prev.slice(0, -1), { role: 'assistant', content: `Error: ${err.message}` }])
    }
  }

  const currentMode = INPUT_MODES.find((m) => m.id === mode)
  const { active, someday } = prioritise(tasks)
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
  const todayCount   = tasks.filter((t) => t.due?.date === todayStr).length
  const p1Count      = tasks.filter((t) => t.priority === 4).length
  const overdueCount = active.filter((t) => scoreTask(t).isOverdue).length
  const focusList    = active.slice(0, 8)
  const todayEvents  = events.filter((e) => {
    const d = e.start?.date ?? e.start?.dateTime?.split('T')[0]
    return d === todayStr
  })

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-2 max-w-lg mx-auto w-full">

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-[#49454F]">{today}</p>
            <h1 className="text-xl font-semibold text-[#1C1B1F]">{greeting}, Yogesh</h1>
          </div>
          <button
            onClick={() => loadTasks(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-[#EADDFF] text-[#6750A4] hover:bg-[#D8CBFF] transition-colors disabled:opacity-50 mt-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 -960 960 960" width="14" fill="currentColor" className={refreshing ? 'animate-spin' : ''}>
              <path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
            </svg>
            {refreshing ? 'Refreshing…' : 'Refresh all'}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: 'Today',    value: loading ? '…' : todayCount,   color: 'bg-[#EADDFF] text-[#21005D]' },
            { label: 'Events',   value: eventsLoading ? '…' : todayEvents.length, color: 'bg-[#D3E4FF] text-[#001D36]' },
            { label: 'P1',       value: loading ? '…' : p1Count,       color: 'bg-[#FFD8E4] text-[#31111D]' },
            { label: 'Overdue',  value: loading ? '…' : overdueCount,  color: overdueCount > 0 ? 'bg-red-100 text-red-900' : 'bg-[#C8F5E1] text-[#002115]' },
          ].map(({ label, value, color }) => (
            <div key={label} className={`rounded-xl p-3 ${color}`}>
              <p className="text-xs opacity-60 mb-0.5">{label}</p>
              <p className="text-xl font-bold leading-none">{value}</p>
            </div>
          ))}
        </div>

        {/* CoS conversation */}
        {messages.length > 0 && (
          <div className="space-y-2 mb-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#6750A4] text-white rounded-br-sm'
                    : 'bg-white border border-[#CAC4D0] text-[#1C1B1F] rounded-bl-sm'
                }`}>
                  {msg.role === 'user' && msg.mode && (
                    <span className="text-xs opacity-60 block mb-0.5 capitalize">{msg.mode}</span>
                  )}
                  {msg.role === 'assistant' ? (
                    <Markdown text={msg.content} />
                  ) : (
                    <>
                      {msg.attachmentName && (
                        <span className="text-xs opacity-70 block mb-0.5">📎 {msg.attachmentName}</span>
                      )}
                      {typeof msg.content === 'string' ? msg.content : msg.content.find((b) => b.type === 'text')?.text ?? ''}
                    </>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Priority list */}
        <div className="bg-white border border-[#CAC4D0] rounded-2xl p-4 mb-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-[#1C1B1F]">Priority list</h2>
            {!loading && active.length > 8 && (
              <span className="text-xs text-[#79747E]">{active.length} active</span>
            )}
          </div>

          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-5 h-5 rounded-full bg-[#E7E0EC] flex-shrink-0" />
                  <div className="h-4 bg-[#E7E0EC] rounded-full flex-1" />
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-red-500">Could not load tasks — check TODOIST_API_KEY in Vercel.</p>}

          {!loading && !error && focusList.length === 0 && (
            <p className="text-sm text-[#79747E]">Nothing active.</p>
          )}

          {!loading && !error && focusList.map((task) => (
            <TaskRow key={task.id} task={task} onComplete={removeTask} />
          ))}
        </div>

        {/* Someday */}
        {!loading && someday.length > 0 && (
          <div className="bg-[#F3EDF7] rounded-xl px-4 py-2.5 mb-3">
            <p className="text-xs text-[#49454F]">
              <span className="font-semibold text-[#6750A4]">{someday.length} someday</span> — no date, P4. Surface in weekly review.
            </p>
          </div>
        )}

        {/* Upcoming events */}
        <div className="bg-white border border-[#CAC4D0] rounded-2xl p-4 mb-4 shadow-sm">
          <h2 className="text-sm font-semibold text-[#1C1B1F] mb-3">Upcoming events</h2>
          {eventsLoading && (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-xl bg-[#D3E4FF] flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="h-4 bg-[#E7E0EC] rounded-full w-3/4" />
                    <div className="h-3 bg-[#E7E0EC] rounded-full w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!eventsLoading && events.length === 0 && (
            <p className="text-sm text-[#79747E]">No upcoming events. Connect Google Calendar in Settings.</p>
          )}
          {!eventsLoading && events.length > 0 && (
            <div className="space-y-2">
              {events.slice(0, 5).map((e) => {
                const isAllDay = !!e.start?.date && !e.start?.dateTime
                const startTime = formatEventTime(e.start?.dateTime, e.start?.timeZone)
                const day = formatEventDay(e)
                return (
                  <div key={e.id} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#D3E4FF] flex-shrink-0 flex flex-col items-center justify-center">
                      {isAllDay ? (
                        <span className="text-[10px] font-bold text-[#001D36] leading-tight text-center px-0.5">{day.slice(0,3)}</span>
                      ) : (
                        <>
                          <span className="text-[10px] text-[#001D36] leading-none">{day.slice(0,3)}</span>
                          <span className="text-xs font-bold text-[#001D36] leading-none">{startTime}</span>
                        </>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1C1B1F] leading-snug truncate">{e.summary}</p>
                      <p className="text-xs text-[#79747E]">{isAllDay ? `${day} · All day` : day}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* CoS input bar — fixed at bottom */}
      <div className="bg-white border-t border-[#CAC4D0] px-4 pt-3 pb-2 safe-bottom max-w-lg mx-auto w-full">
        <ChatInput
          placeholder={currentMode.placeholder}
          onSend={handleSend}
          textareaRef={inputRef}
          extraAbove={
            <div className="flex gap-2 mb-2 overflow-x-auto pb-1 scrollbar-none">
              {INPUT_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setMode(m.id); inputRef.current?.focus() }}
                  className={`flex-shrink-0 text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                    mode === m.id ? 'bg-[#6750A4] text-white' : 'bg-[#F3EDF7] text-[#49454F] hover:bg-[#E8DEF8]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          }
        />
      </div>
    </div>
  )
}
