import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllTasks, closeTask, PROJECTS } from '../lib/todoist'
import { prioritise, scoreTask } from '../lib/priority'
import { haptic } from '../lib/haptic'
import ChatInput from '../components/ChatInput'
import EditSheet from '../components/EditSheet'
import QuickAdd from '../components/QuickAdd'

async function fetchUpcomingEvents() {
  const now = new Date()
  // Start from midnight local time so already-started today events are included
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const end = new Date(startOfToday); end.setDate(end.getDate() + 7)
  const url = `/api/calendar?start=${encodeURIComponent(startOfToday.toISOString())}&end=${encodeURIComponent(end.toISOString())}`
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

function formatDuration(start, end) {
  if (!start || !end) return null
  const mins = Math.round((new Date(end) - new Date(start)) / 60000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60), m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function HomeEventRow({ event: initialEvent }) {
  const [e, setE] = useState(initialEvent)
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editSummary, setEditSummary] = useState(initialEvent.summary ?? '')
  const [editLocation, setEditLocation] = useState(initialEvent.location ?? '')
  const [editDesc, setEditDesc] = useState(initialEvent.description?.replace(/<[^>]*>/g, '').trim() ?? '')
  const [saving, setSaving] = useState(false)
  const holdRef = useRef(null)
  const isHoldRef = useRef(false)

  const isAllDay  = !!e.start?.date && !e.start?.dateTime
  const startTime = formatEventTime(e.start?.dateTime, e.start?.timeZone)
  const endTime   = formatEventTime(e.end?.dateTime,   e.end?.timeZone)
  const duration  = formatDuration(e.start?.dateTime, e.end?.dateTime)
  const day       = formatEventDay(e)
  const attendees = e.attendees ?? []
  const selfRsvp  = attendees.find((a) => a.self)?.responseStatus
  const description = e.description?.replace(/<[^>]*>/g, '').trim()
  const meetLink  = e.hangoutLink ?? e.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri
  const rsvpColor = { accepted: 'text-green-700', declined: 'text-red-600', tentative: 'text-amber-600' }

  function handlePointerDown() {
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
          className="flex items-center gap-3 py-2.5 cursor-pointer select-none"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onClick={handleClick}
        >
          <div className="w-10 h-10 rounded-xl bg-[#D3E4FF] flex-shrink-0 flex flex-col items-center justify-center">
            {isAllDay
              ? <span className="text-[10px] font-bold text-[#001D36] leading-tight text-center px-0.5">{day.slice(0,3)}</span>
              : <>
                  <span className="text-[10px] text-[#001D36] leading-none">{day.slice(0,3)}</span>
                  <span className="text-xs font-bold text-[#001D36] leading-none">{startTime}</span>
                </>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#1C1B1F] leading-snug truncate">{e.summary}</p>
            <p className="text-xs text-[#79747E]">{isAllDay ? `${day} · All day` : `${day}${duration ? ` · ${duration}` : ''}`}</p>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="#CAC4D0"
            className={`flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
            <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z"/>
          </svg>
        </div>

        <div style={{
          maxHeight: expanded ? '280px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        }}>
          <div className="pb-3 pl-13 space-y-1.5" style={{ paddingLeft: '3.25rem' }}>
            {!isAllDay && startTime && (
              <p className="text-xs text-[#49454F]">{startTime} – {endTime}{duration ? ` (${duration})` : ''}</p>
            )}
            {e.location && <p className="text-xs text-[#49454F]">📍 {e.location}</p>}
            {meetLink && (
              <a href={meetLink} target="_blank" rel="noopener noreferrer"
                onClick={(ev) => ev.stopPropagation()}
                className="text-xs text-[#6750A4] font-medium block"
              >▶ Join video call</a>
            )}
            {selfRsvp && (
              <p className={`text-xs font-medium ${rsvpColor[selfRsvp] ?? 'text-[#79747E]'}`}>
                {selfRsvp === 'accepted' ? '✓ Accepted' : selfRsvp === 'declined' ? '✗ Declined' : '~ Tentative'}
              </p>
            )}
            {attendees.length > 0 && (
              <p className="text-xs text-[#79747E]">
                {attendees.length} attendee{attendees.length !== 1 ? 's' : ''}
                {attendees.slice(0,3).map((a) => ` · ${a.displayName?.split(' ')[0] ?? a.email.split('@')[0]}`)}
                {attendees.length > 3 ? ` +${attendees.length - 3}` : ''}
              </p>
            )}
            {description && <p className="text-xs text-[#49454F] leading-relaxed line-clamp-3">{description}</p>}
            <p className="text-[10px] text-[#CAC4D0] mt-1">Hold to edit</p>
          </div>
        </div>
      </div>

      <EditSheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit event" onSave={handleSave} saving={saving}>
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
      </EditSheet>
    </>
  )
}

const PROJECT_NAMES = Object.fromEntries(Object.entries(PROJECTS).map(([name, id]) => [id, name]))


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

function TaskRow({ task, onComplete, index = 0 }) {
  const [localTask, setLocalTask] = useState(task)
  const [pendingComplete, setPendingComplete] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [completingAnim, setCompletingAnim] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editContent, setEditContent] = useState(task.content)
  const [editPriority, setEditPriority] = useState(task.priority ?? 1)
  const [editDue, setEditDue] = useState(task.due?.date ?? '')
  const [editDesc, setEditDesc] = useState(task.description ?? '')
  const [saving, setSaving] = useState(false)
  const [swipeX, setSwipeX] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const timerRef = useRef(null)
  const holdRef = useRef(null)
  const isHoldRef = useRef(false)
  const swipeRef = useRef(null)
  const { bucket, isOverdue } = scoreTask(localTask)

  // When removing state triggers, wait for collapse animation then call API + remove
  useEffect(() => {
    if (!removing) return
    const t = setTimeout(async () => {
      try { await closeTask(localTask.id); onComplete(localTask.id) }
      catch { haptic.error(); setRemoving(false); setPendingComplete(false) }
    }, 380)
    return () => clearTimeout(t)
  }, [removing])

  function handleComplete(e) {
    e.stopPropagation()
    haptic.success()
    haptic.fanfare()
    setCompletingAnim(true)
    setPendingComplete(true)
    timerRef.current = setTimeout(() => setRemoving(true), 5000)
  }

  function handleUndo(e) {
    e.stopPropagation()
    haptic.light()
    clearTimeout(timerRef.current)
    setPendingComplete(false)
    setRemoving(false)
  }

  function handleRowPointerDown() {
    if (pendingComplete) return
    isHoldRef.current = false
    holdRef.current = setTimeout(() => {
      isHoldRef.current = true
      haptic.medium()
      setEditContent(localTask.content)
      setEditPriority(localTask.priority ?? 1)
      setEditDue(localTask.due?.date ?? '')
      setEditDesc(localTask.description ?? '')
      setEditOpen(true)
    }, 500)
  }

  function handleRowPointerUp() { clearTimeout(holdRef.current) }

  function handleRowClick() {
    if (isHoldRef.current) { isHoldRef.current = false; return }
    if (!pendingComplete && swipeX === 0) setExpanded((x) => !x)
  }

  function handleTouchStart(e) {
    if (pendingComplete) return
    const t = e.touches[0]
    swipeRef.current = { startX: t.clientX, startY: t.clientY, decided: false, horizontal: false, dx: 0 }
  }

  function handleTouchMove(e) {
    const tr = swipeRef.current
    if (!tr) return
    const t = e.touches[0]
    const dx = t.clientX - tr.startX
    const dy = t.clientY - tr.startY
    if (!tr.decided) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      tr.decided = true
      tr.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2 && dx < 0
    }
    if (!tr.horizontal) return
    clearTimeout(holdRef.current)
    tr.dx = Math.max(dx, -96)
    setSwipeX(tr.dx)
    setIsSwiping(true)
  }

  function handleTouchEnd() {
    const tr = swipeRef.current
    swipeRef.current = null
    if (!tr?.horizontal) { setIsSwiping(false); return }
    if (tr.dx < -70) {
      setSwipeX(-96)
      setTimeout(() => {
        setSwipeX(0)
        setIsSwiping(false)
        handleComplete({ stopPropagation: () => {} })
      }, 200)
    } else {
      setSwipeX(0)
      setIsSwiping(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const body = { content: editContent, priority: editPriority, description: editDesc }
      if (editDue) body.due_date = editDue
      await fetch(`/api/todoist?path=tasks/${localTask.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      haptic.success()
      setLocalTask((prev) => ({
        ...prev,
        content: editContent,
        priority: editPriority,
        description: editDesc,
        due: editDue ? { date: editDue } : prev.due,
      }))
      setEditOpen(false)
    } catch { haptic.error() }
    finally { setSaving(false) }
  }

  return (
    <>
    {/* Grid wrapper: collapses height smoothly when removing */}
    <div style={{
      display: 'grid',
      gridTemplateRows: removing ? '0fr' : '1fr',
      opacity: removing ? 0 : 1,
      transition: 'grid-template-rows 0.38s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease',
      animation: `fade-up 0.36s ease ${0.18 + index * 0.065}s both`,
    }}>
    <div style={{ overflow: 'hidden' }}>
    <div className="border-b border-[#F3EDF7] last:border-0 relative overflow-hidden"
      style={{ opacity: pendingComplete ? 0.45 : 1, transition: 'opacity 0.15s ease' }}>
      {/* Swipe-left reveal */}
      <div className="absolute right-0 top-0 bottom-0 w-24 bg-[#4CAF50] flex items-center justify-center rounded-r-2xl"
        style={{ opacity: swipeX < -10 ? Math.min((-swipeX - 10) / 50, 1) : 0 }}>
        <svg xmlns="http://www.w3.org/2000/svg" height="22" viewBox="0 0 24 24" width="22" fill="white">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
      </div>
      <div
        data-task-swipe
        style={{ transform: `translateX(${swipeX}px)`, transition: isSwiping ? 'none' : 'transform 0.28s cubic-bezier(0.25,1,0.5,1)', background: 'white' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
      <div
        className="flex items-center gap-3 py-3 cursor-pointer select-none"
        onPointerDown={handleRowPointerDown}
        onPointerUp={handleRowPointerUp}
        onPointerLeave={handleRowPointerUp}
        onClick={handleRowClick}
      >
        <button
          onClick={handleComplete}
          disabled={pendingComplete}
          className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-colors ${
            pendingComplete ? 'border-[#6750A4] bg-[#6750A4]' : 'border-[#CAC4D0] hover:border-[#6750A4] hover:bg-[#EADDFF]'
          }`}
          style={completingAnim ? { animation: 'complete-pop 0.42s cubic-bezier(0.34,1.56,0.64,1) both' } : undefined}
          onAnimationEnd={() => setCompletingAnim(false)}
        >
          {pendingComplete && (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-full h-full p-0.5">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-snug ${pendingComplete ? 'line-through text-[#79747E]' : isOverdue ? 'text-red-900' : 'text-[#1C1B1F]'}`}>
            {localTask.content}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <PriorityDot priority={localTask.priority} />
            <PriorityBadge task={localTask} />
            {bucket && <span className="text-xs text-[#79747E]">{bucket}</span>}
          </div>
        </div>

        {pendingComplete ? (
          <button
            onClick={handleUndo}
            className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#6750A4] text-white flex-shrink-0"
          >
            Undo
          </button>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="#CAC4D0"
            className={`flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
            <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z"/>
          </svg>
        )}
      </div>

      {/* Undo countdown bar */}
      {pendingComplete && (
        <div className="h-0.5 bg-[#EADDFF] mx-0 -mt-1 mb-1 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#6750A4] rounded-full"
            style={{ animation: 'shrink-bar 5s linear forwards' }}
          />
        </div>
      )}

      {/* Expanded details */}
      <div style={{
        maxHeight: expanded ? '180px' : '0',
        overflow: 'hidden',
        transition: 'max-height 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <div className="pb-3 pl-8 space-y-1.5">
          {localTask.description && (
            <p className="text-xs text-[#49454F] leading-relaxed">{localTask.description}</p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {localTask.due?.date && (
              <span className="text-xs text-[#79747E]">
                Due {new Date(localTask.due.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            )}
            {localTask.due?.datetime && (
              <span className="text-xs text-[#79747E]">
                at {new Date(localTask.due.datetime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {localTask.labels?.length > 0 && (
              <span className="text-xs text-[#79747E]">{localTask.labels.join(', ')}</span>
            )}
          </div>
          {localTask.url && (
            <a
              href={localTask.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-[#6750A4] font-medium"
            >
              Open in Todoist ↗
            </a>
          )}
          <p className="text-[10px] text-[#CAC4D0]">Hold to edit · swipe left to complete</p>
        </div>
      </div>
      </div>{/* end swipe wrapper */}
    </div>
    </div>
    </div>

    <EditSheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit task" onSave={handleSave} saving={saving}>
      <div className="space-y-1">
        <label className="text-xs font-medium text-[#49454F]">Task</label>
        <textarea
          value={editContent}
          onChange={(ev) => setEditContent(ev.target.value)}
          className="w-full rounded-xl border border-[#79747E] px-3 py-2 text-sm text-[#1C1B1F] focus:outline-none focus:border-[#6750A4] resize-none"
          rows={2}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-[#49454F]">Priority</label>
        <div className="flex gap-2">
          {[{label:'P1',val:4},{label:'P2',val:3},{label:'P3',val:2},{label:'P4',val:1}].map(({label,val}) => (
            <button key={val}
              onClick={() => setEditPriority(val)}
              className={`flex-1 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                editPriority === val ? 'bg-[#6750A4] text-white border-[#6750A4]' : 'border-[#CAC4D0] text-[#49454F]'
              }`}
            >{label}</button>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-[#49454F]">Due date</label>
        <input
          type="date"
          value={editDue}
          onChange={(ev) => setEditDue(ev.target.value)}
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
    </EditSheet>
    </>
  )
}

const QUOTES = [
  { text: "The details are not the details. They make the design.", author: "Charles Eames" },
  { text: "You can't connect the dots looking forward; you can only connect them looking backwards.", author: "Steve Jobs" },
  { text: "Compound interest is the eighth wonder of the world. He who understands it, earns it.", author: "Albert Einstein" },
  { text: "Be the change you wish to see in the world.", author: "Gandhi" },
  { text: "The quality of a father can be seen in the goals, dreams and aspirations he sets not only for himself, but for his family.", author: "Reed Markham" },
  { text: "An architect's most useful tools are an eraser at the drafting board and a wrecking ball on the site.", author: "Frank Lloyd Wright" },
  { text: "Small daily improvements over time lead to stunning results.", author: "Robin Sharma" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Your body is your most priceless possession. Take care of it.", author: "Jack LaLanne" },
  { text: "A man who dares to waste one hour of time has not discovered the value of life.", author: "Charles Darwin" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "Design is not just what it looks like and feels like. Design is how it works.", author: "Steve Jobs" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "The most important investment you can make is in yourself.", author: "Warren Buffett" },
  { text: "We do not remember days, we remember moments.", author: "Cesare Pavese" },
  { text: "Architecture is the learned game, correct and magnificent, of forms assembled in the light.", author: "Le Corbusier" },
  { text: "What you do today can improve all your tomorrows.", author: "Ralph Marston" },
  { text: "The groundwork of all happiness is health.", author: "Leigh Hunt" },
  { text: "Your children need your presence more than your presents.", author: "Jesse Jackson" },
  { text: "A good system shortens the road to the goal.", author: "Orison Swett Marden" },
  { text: "Build your own dreams, or someone else will hire you to build theirs.", author: "Farrah Gray" },
  { text: "The first wealth is health.", author: "Ralph Waldo Emerson" },
  { text: "You will never always be motivated. You have to learn to be disciplined.", author: "Unknown" },
  { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
  { text: "The home should be the treasure chest of living.", author: "Le Corbusier" },
  { text: "Don't count the days, make the days count.", author: "Muhammad Ali" },
  { text: "Every moment is a fresh beginning.", author: "T.S. Eliot" },
  { text: "Work hard in silence, let success be your noise.", author: "Frank Ocean" },
  { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { text: "The scariest moment is always just before you start.", author: "Stephen King" },
  { text: "To design is much more than simply to assemble, to order, or even to edit: it is to add value and meaning.", author: "Paul Rand" },
  { text: "Nothing will work unless you do.", author: "Maya Angelou" },
  { text: "The key is not to prioritise what's on your schedule, but to schedule your priorities.", author: "Stephen Covey" },
  { text: "A strong man stands up for himself. A stronger man stands up for others.", author: "Unknown" },
  { text: "You are the average of the five people you spend the most time with.", author: "Jim Rohn" },
  { text: "Don't wish it were easier; wish you were better.", author: "Jim Rohn" },
  { text: "The goal is not to be perfect by the end. The goal is to be better today.", author: "Simon Sinek" },
  { text: "Good enough never is.", author: "Debbi Fields" },
  { text: "Take care of your body. It's the only place you have to live.", author: "Jim Rohn" },
  { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
  { text: "Either you run the day or the day runs you.", author: "Jim Rohn" },
  { text: "A home is a kingdom of its own in the midst of the world.", author: "Dietrich Bonhoeffer" },
  { text: "If you want to go fast, go alone. If you want to go far, go together.", author: "African Proverb" },
  { text: "The secret to getting ahead is getting started.", author: "Agatha Christie" },
  { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "Do not wait to strike till the iron is hot, but make it hot by striking.", author: "W.B. Yeats" },
  { text: "The expert in anything was once a beginner.", author: "Helen Hayes" },
  { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
  { text: "A year from now you will wish you had started today.", author: "Karen Lamb" },
  { text: "It's not about having time, it's about making time.", author: "Unknown" },
  { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
]

function getDailyQuote() {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((now - start) / (1000 * 60 * 60 * 24))
  return QUOTES[dayOfYear % QUOTES.length]
}


  const navigate = useNavigate()
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const [tasks, setTasks]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [error, setError]             = useState(null)
  const [events, setEvents]           = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const inputRef = useRef(null)
  const scrollRef = useRef(null)
  const pullRef = useRef({ startY: 0, pulling: false, dist: 0 })
  const [pullDistance, setPullDistance] = useState(0)
  const inputHoldRef = useRef(null)

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

  // Pull-to-refresh
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function onTouchStart(e) {
      if (el.scrollTop === 0) {
        pullRef.current = { startY: e.touches[0].clientY, pulling: true, dist: 0 }
      }
    }
    function onTouchMove(e) {
      if (!pullRef.current.pulling) return
      const dy = e.touches[0].clientY - pullRef.current.startY
      if (dy > 0) {
        e.preventDefault()
        pullRef.current.dist = Math.min(dy * 0.5, 60)
        setPullDistance(pullRef.current.dist)
      } else {
        pullRef.current.pulling = false
        setPullDistance(0)
      }
    }
    function onTouchEnd() {
      if (pullRef.current.pulling && pullRef.current.dist > 40) {
        loadTasks(true)
      }
      pullRef.current = { startY: 0, pulling: false, dist: 0 }
      setPullDistance(0)
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  function removeTask(id) { setTasks((prev) => prev.filter((t) => t.id !== id)) }

  function handleSend(content, attachmentName) {
    navigate('/chief', { state: { initialMessage: content, attachmentName } })
  }

  const { active, someday } = prioritise(tasks)
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
  const todayCount   = tasks.filter((t) => t.due?.date?.slice(0, 10) === todayStr).length
  const p1Count      = tasks.filter((t) => t.priority === 4).length
  const overdueCount = active.filter((t) => scoreTask(t).isOverdue).length
  const focusList    = active.slice(0, 8)
  const todayEvents  = events.filter((e) => {
    if (e.start?.date) return e.start.date === todayStr
    if (e.start?.dateTime) return new Date(e.start.dateTime).toLocaleDateString('en-CA') === todayStr
    return false
  })

  return (
    <div className="flex flex-col h-full">
      {/* Pull-to-refresh indicator */}
      {pullDistance > 0 && (
        <div className="flex justify-center py-1" style={{ height: pullDistance, transition: 'height 0.1s', overflow: 'hidden' }}>
          <div className={`w-6 h-6 rounded-full border-2 border-[#6750A4] border-t-transparent ${pullDistance > 40 ? 'animate-spin' : ''}`} style={{ marginTop: Math.max(pullDistance - 28, 0) }} />
        </div>
      )}
      {/* Scrollable content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-5 pb-2 max-w-lg mx-auto w-full">

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div style={{ animation: 'logo-in 0.9s cubic-bezier(0.22, 1, 0.36, 1) both' }}>
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

        {/* Quote of the day */}
        {(() => { const q = getDailyQuote(); return (
          <div className="bg-[#F3EDF7] rounded-2xl px-4 py-3 mb-4" style={{ animation: 'fade-up 0.6s cubic-bezier(0.22,1,0.36,1) 0.1s both' }}>
            <p className="text-xs font-medium text-[#6750A4] mb-1">Quote of the day</p>
            <p className="text-sm text-[#1C1B1F] leading-snug italic">"{q.text}"</p>
            <p className="text-xs text-[#79747E] mt-1.5">— {q.author}</p>
          </div>
        )})()}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: 'Today',    value: loading ? '…' : todayCount,   color: 'bg-[#EADDFF] text-[#21005D]' },
            { label: 'Events',   value: eventsLoading ? '…' : todayEvents.length, color: 'bg-[#D3E4FF] text-[#001D36]' },
            { label: 'P1',       value: loading ? '…' : p1Count,       color: 'bg-[#FFD8E4] text-[#31111D]' },
            { label: 'Overdue',  value: loading ? '…' : overdueCount,  color: overdueCount > 0 ? 'bg-red-100 text-red-900' : 'bg-[#C8F5E1] text-[#002115]' },
          ].map(({ label, value, color }, i) => (
            <div key={label} className={`rounded-xl p-3 ${color}`}
              style={{ animation: `fade-up 0.5s cubic-bezier(0.22,1,0.36,1) ${0.18 + i * 0.08}s both` }}>
              <p className="text-xs opacity-60 mb-0.5">{label}</p>
              <p className="text-xl font-bold leading-none">{value}</p>
            </div>
          ))}
        </div>

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

          {!loading && !error && focusList.map((task, i) => (
            <TaskRow key={task.id} task={task} onComplete={removeTask} index={i} />
          ))}
        </div>

        {/* Someday / Weekly Review */}
        {!loading && someday.length > 0 && (
          <div className="bg-[#F3EDF7] rounded-xl px-4 py-2.5 mb-3 flex items-center justify-between">
            <p className="text-xs text-[#49454F]">
              <span className="font-semibold text-[#6750A4]">{someday.length} someday</span> — no date, P4.
            </p>
            <button onClick={() => navigate('/weekly-review')} className="text-xs font-semibold text-[#6750A4] ml-2 flex-shrink-0">
              Weekly review →
            </button>
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
            <div>
              {events.slice(0, 5).map((e) => <HomeEventRow key={e.id} event={e} />)}
            </div>
          )}
        </div>
      </div>

      {/* CoS input bar */}
      <div
        className="bg-white border-t border-[#CAC4D0] px-4 pt-2.5 pb-2 safe-bottom max-w-lg mx-auto w-full"
        onPointerDown={() => {
          inputHoldRef.current = setTimeout(() => {
            haptic.medium()
            setQuickAddOpen(true)
            inputHoldRef.current = null
          }, 550)
        }}
        onPointerUp={() => clearTimeout(inputHoldRef.current)}
        onPointerLeave={() => clearTimeout(inputHoldRef.current)}
      >
        <ChatInput
          placeholder="Message your Chief of Staff…"
          onSend={handleSend}
          textareaRef={inputRef}
        />
      </div>
      <QuickAdd open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </div>
  )
}
