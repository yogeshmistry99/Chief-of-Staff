import { useEffect, useState } from 'react'
import { getAllTasks, PROJECTS, priorityLabel, isToday, isOverdue, closeTask } from '../lib/todoist'

const PROJECT_NAME = Object.fromEntries(Object.entries(PROJECTS).map(([k, v]) => [v, k]))

function TaskRow({ task, onComplete }) {
  const [completing, setCompleting] = useState(false)

  async function handleComplete() {
    setCompleting(true)
    try {
      await closeTask(task.id)
      onComplete(task.id)
    } catch {
      setCompleting(false)
    }
  }

  const overdue = isOverdue(task)
  const bucket = PROJECT_NAME[task.project_id] ?? ''

  return (
    <div className={`flex items-start gap-3 py-2.5 border-b border-[#F3EDF7] last:border-0 ${completing ? 'opacity-30' : ''} transition-opacity`}>
      <button
        onClick={handleComplete}
        disabled={completing}
        className="w-5 h-5 rounded-full border-2 border-[#CAC4D0] hover:border-[#6750A4] hover:bg-[#EADDFF] flex-shrink-0 mt-0.5 transition-colors"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#1C1B1F] leading-snug">{task.content}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {task.priority > 1 && (
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
              task.priority === 4 ? 'bg-[#FFD8E4] text-[#31111D]' :
              task.priority === 3 ? 'bg-[#FFF0C8] text-[#261900]' :
              'bg-[#E7E0EC] text-[#49454F]'
            }`}>
              {priorityLabel(task.priority)}
            </span>
          )}
          {bucket && <span className="text-xs text-[#79747E]">{bucket}</span>}
          {task.due && (
            <span className={`text-xs ${overdue ? 'text-red-500 font-medium' : 'text-[#79747E]'}`}>
              {overdue ? 'Overdue · ' : ''}{task.due.date}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getAllTasks()
      .then(setTasks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function removeTask(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  const todayTasks = tasks.filter(isToday)
  const overdueTasks = tasks.filter(isOverdue)
  const p1Tasks = tasks.filter((t) => t.priority === 4)

  // Focus list: P1s first, then overdue, then today — deduplicated, max 8
  const focusList = [
    ...p1Tasks.filter(isToday),
    ...p1Tasks.filter(isOverdue),
    ...overdueTasks.filter((t) => t.priority !== 4),
    ...todayTasks.filter((t) => t.priority !== 4),
    ...p1Tasks.filter((t) => !isToday(t) && !isOverdue(t)),
  ].filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i).slice(0, 8)

  const stats = [
    { label: 'Tasks today', value: loading ? '…' : todayTasks.length, color: 'bg-[#EADDFF] text-[#21005D]' },
    { label: 'Events today', value: '—', color: 'bg-[#D3E4FF] text-[#001D36]' },
    { label: 'Priority 1', value: loading ? '…' : p1Tasks.length, color: 'bg-[#FFD8E4] text-[#31111D]' },
    { label: 'Overdue', value: loading ? '…' : overdueTasks.length, color: overdueTasks.length > 0 ? 'bg-red-100 text-red-900' : 'bg-[#C8F5E1] text-[#002115]' },
  ]

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <div className="mb-6">
        <p className="text-sm text-[#49454F] mb-1">{today}</p>
        <h1 className="text-2xl font-semibold text-[#1C1B1F]">Good morning, Yogesh</h1>
        <p className="text-sm text-[#49454F] mt-1">Here's your life at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {stats.map(({ label, value, color }) => (
          <div key={label} className={`rounded-2xl p-4 ${color}`}>
            <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
            <p className="text-3xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#CAC4D0] rounded-2xl p-4 mb-4">
        <h2 className="text-sm font-semibold text-[#1C1B1F] mb-3">Today's focus</h2>

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

        {error && (
          <p className="text-xs text-red-500">Could not load tasks — check that TODOIST_API_KEY is set in Vercel.</p>
        )}

        {!loading && !error && focusList.length === 0 && (
          <p className="text-sm text-[#79747E]">No P1 tasks or tasks due today. You're clear.</p>
        )}

        {!loading && !error && focusList.map((task) => (
          <TaskRow key={task.id} task={task} onComplete={removeTask} />
        ))}
      </div>

      <div className="bg-white border border-[#CAC4D0] rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-[#1C1B1F] mb-3">Upcoming events</h2>
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
        <p className="text-xs text-[#79747E] mt-3">Connect Google Calendar in Settings to load events.</p>
      </div>
    </div>
  )
}
