import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllTasks, closeTask, PROJECTS } from '../lib/todoist'
import { haptic } from '../lib/haptic'

const PROJECT_NAMES = Object.fromEntries(Object.entries(PROJECTS).map(([name, id]) => [id, name]))

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function weekEndStr() {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function TaskLine({ task, onComplete }) {
  const [removing, setRemoving] = useState(false)
  const [pendingComplete, setPendingComplete] = useState(false)
  const timerRef = useRef(null)

  function handleComplete(e) {
    e.stopPropagation()
    haptic.success()
    setPendingComplete(true)
    timerRef.current = setTimeout(() => {
      setRemoving(true)
      setTimeout(async () => {
        try { await closeTask(task.id); onComplete(task.id) }
        catch { haptic.error(); setRemoving(false); setPendingComplete(false) }
      }, 380)
    }, 5000)
  }

  function handleUndo(e) {
    e.stopPropagation()
    haptic.light()
    clearTimeout(timerRef.current)
    setPendingComplete(false)
    setRemoving(false)
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateRows: removing ? '0fr' : '1fr',
      opacity: removing ? 0 : 1,
      transition: 'grid-template-rows 0.38s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease',
    }}>
      <div style={{ overflow: 'hidden' }}>
        <div className="flex items-center gap-3 py-2.5 border-b border-[#F3EDF7] last:border-0"
          style={{ opacity: pendingComplete ? 0.45 : 1 }}>
          <button
            onClick={handleComplete}
            disabled={pendingComplete}
            className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-colors ${
              pendingComplete ? 'border-[#6750A4] bg-[#6750A4]' : 'border-[#CAC4D0] hover:border-[#6750A4]'
            }`}
          >
            {pendingComplete && (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-full h-full p-0.5">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            )}
          </button>
          <div className="flex-1 min-w-0">
            <p className={`text-sm leading-snug ${pendingComplete ? 'line-through text-[#79747E]' : 'text-[#1C1B1F]'}`}>
              {task.content}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {task._projectName && <span className="text-xs text-[#79747E]">{task._projectName}</span>}
              {task.priority === 4 && <span className="text-xs font-semibold text-red-700 bg-[#FFD8E4] px-1.5 py-0.5 rounded">P1</span>}
              {task.priority === 3 && <span className="text-xs font-semibold text-amber-800 bg-[#FFF0C8] px-1.5 py-0.5 rounded">P2</span>}
              {task.due?.date && <span className="text-xs text-[#79747E]">{task.due.date}</span>}
            </div>
          </div>
          {pendingComplete && (
            <button onClick={handleUndo} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#6750A4] text-white flex-shrink-0">
              Undo
            </button>
          )}
        </div>
        {pendingComplete && (
          <div className="h-0.5 bg-[#EADDFF] -mt-1 mb-1 rounded-full overflow-hidden">
            <div className="h-full bg-[#6750A4] rounded-full" style={{ animation: 'shrink-bar 5s linear forwards' }} />
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, color, tasks, onComplete }) {
  if (!tasks.length) return null
  return (
    <div className="mb-4">
      <div className={`flex items-center justify-between px-4 py-2 rounded-t-2xl ${color}`}>
        <h3 className="text-xs font-semibold uppercase tracking-wide">{title}</h3>
        <span className="text-xs opacity-70">{tasks.length}</span>
      </div>
      <div className="bg-white border border-t-0 border-[#CAC4D0] rounded-b-2xl px-4 pb-1 shadow-sm">
        {tasks.map((t) => <TaskLine key={t.id} task={t} onComplete={onComplete} />)}
      </div>
    </div>
  )
}

export default function WeeklyReview() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAllTasks()
      .then((data) => data.map((t) => ({ ...t, _projectName: PROJECT_NAMES[t.project_id] })))
      .then(setTasks)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function removeTask(id) { setTasks((prev) => prev.filter((t) => t.id !== id)) }

  const today = todayStr()
  const weekEnd = weekEndStr()

  const overdue   = tasks.filter((t) => t.due?.date && t.due.date < today)
  const todayList = tasks.filter((t) => t.due?.date === today)
  const thisWeek  = tasks.filter((t) => t.due?.date && t.due.date > today && t.due.date <= weekEnd)
  const later     = tasks.filter((t) => t.due?.date && t.due.date > weekEnd)
  const someday   = tasks.filter((t) => !t.due?.date)

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-[#CAC4D0] px-4 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-[#6750A4] p-1 -ml-1">
            <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
              <path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/>
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-semibold text-[#1C1B1F]">Weekly Review</h1>
            <p className="text-xs text-[#79747E]">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
        {loading ? (
          <div className="space-y-3 pt-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse px-2">
                <div className="w-5 h-5 rounded-full bg-[#E7E0EC] flex-shrink-0" />
                <div className="h-4 bg-[#E7E0EC] rounded-full flex-1" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <Section title="Overdue" color="bg-red-100 text-red-800" tasks={overdue} onComplete={removeTask} />
            <Section title="Today" color="bg-[#EADDFF] text-[#21005D]" tasks={todayList} onComplete={removeTask} />
            <Section title="This week" color="bg-[#D3E4FF] text-[#001D36]" tasks={thisWeek} onComplete={removeTask} />
            <Section title="Later" color="bg-[#F3EDF7] text-[#49454F]" tasks={later} onComplete={removeTask} />
            <Section title="Someday" color="bg-[#E7E0EC] text-[#49454F]" tasks={someday} onComplete={removeTask} />
            {!overdue.length && !todayList.length && !thisWeek.length && !later.length && !someday.length && (
              <p className="text-sm text-[#49454F] text-center py-10">All clear — no tasks found.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
