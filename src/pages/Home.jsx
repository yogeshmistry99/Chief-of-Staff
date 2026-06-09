import { useEffect, useState } from 'react'
import { getAllTasks, closeTask } from '../lib/todoist'
import { prioritise, scoreTask } from '../lib/priority'

function PriorityBadge({ task }) {
  const { isOverdue, isToday, days, reasons } = scoreTask(task)
  if (isOverdue) return <span className="text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Overdue</span>
  if (isToday) return <span className="text-xs font-semibold text-[#6750A4] bg-[#EADDFF] px-1.5 py-0.5 rounded">Today</span>
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
    setCompleting(true)
    try {
      await closeTask(task.id)
      onComplete(task.id)
    } catch {
      setCompleting(false)
    }
  }

  return (
    <div className={`flex items-start gap-3 py-3 border-b border-[#F3EDF7] last:border-0 transition-opacity ${completing ? 'opacity-20' : ''}`}>
      <button
        onClick={handleComplete}
        disabled={completing}
        className="w-5 h-5 rounded-full border-2 border-[#CAC4D0] hover:border-[#6750A4] hover:bg-[#EADDFF] flex-shrink-0 mt-0.5 transition-colors"
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${isOverdue ? 'text-red-900' : 'text-[#1C1B1F]'}`}>
          {task.content}
        </p>
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
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

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

  const { active, someday } = prioritise(tasks)

  const todayCount = tasks.filter((t) => t.due?.date === new Date().toISOString().split('T')[0]).length
  const p1Count = tasks.filter((t) => t.priority === 4).length
  const overdueCount = active.filter((t) => scoreTask(t).isOverdue).length
  const focusList = active.slice(0, 8)

  const stats = [
    { label: 'Tasks today', value: loading ? '…' : todayCount, color: 'bg-[#EADDFF] text-[#21005D]' },
    { label: 'Events today', value: '—', color: 'bg-[#D3E4FF] text-[#001D36]' },
    { label: 'Priority 1', value: loading ? '…' : p1Count, color: 'bg-[#FFD8E4] text-[#31111D]' },
    {
      label: 'Overdue',
      value: loading ? '…' : overdueCount,
      color: overdueCount > 0 ? 'bg-red-100 text-red-900' : 'bg-[#C8F5E1] text-[#002115]',
    },
  ]

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <div className="mb-6">
        <p className="text-sm text-[#49454F] mb-1">{today}</p>
        <h1 className="text-2xl font-semibold text-[#1C1B1F]">{greeting}, Yogesh</h1>
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

      {/* Focus list */}
      <div className="bg-white border border-[#CAC4D0] rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#1C1B1F]">Today's focus</h2>
          {!loading && active.length > 8 && (
            <span className="text-xs text-[#79747E]">{active.length} total</span>
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

        {error && (
          <p className="text-xs text-red-500">Could not load tasks — check that TODOIST_API_KEY is set in Vercel.</p>
        )}

        {!loading && !error && focusList.length === 0 && (
          <p className="text-sm text-[#79747E]">Nothing active. Check the Someday list.</p>
        )}

        {!loading && !error && focusList.map((task) => (
          <TaskRow key={task.id} task={task} onComplete={removeTask} />
        ))}
      </div>

      {/* Someday notice */}
      {!loading && someday.length > 0 && (
        <div className="bg-[#F3EDF7] rounded-2xl px-4 py-3 mb-4">
          <p className="text-xs text-[#49454F]">
            <span className="font-semibold text-[#6750A4]">{someday.length} someday tasks</span> — no due date, P4. Surface in weekly review.
          </p>
        </div>
      )}

      {/* Upcoming events placeholder */}
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
