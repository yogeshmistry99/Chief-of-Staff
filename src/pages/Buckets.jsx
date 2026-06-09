import { useEffect, useState } from 'react'
import { getAllTasks, PROJECTS, priorityLabel, closeTask } from '../lib/todoist'

const BUCKET_META = {
  Finance:  { emoji: '💰', color: 'bg-[#C8F5E1]', text: 'text-[#002115]', ring: 'border-[#002115]' },
  Health:   { emoji: '🏃', color: 'bg-[#FFD8E4]', text: 'text-[#31111D]', ring: 'border-[#31111D]' },
  Home:     { emoji: '🏠', color: 'bg-[#FFF0C8]', text: 'text-[#261900]', ring: 'border-[#261900]' },
  Work:     { emoji: '💼', color: 'bg-[#D3E4FF]', text: 'text-[#001D36]', ring: 'border-[#001D36]' },
  Family:   { emoji: '👨‍👩‍👧', color: 'bg-[#FFE4F3]', text: 'text-[#31001D]', ring: 'border-[#31001D]' },
  Personal: { emoji: '✨', color: 'bg-[#E8F5E9]', text: 'text-[#1B5E20]', ring: 'border-[#1B5E20]' },
  Systems:  { emoji: '⚙️', color: 'bg-[#EADDFF]', text: 'text-[#21005D]', ring: 'border-[#21005D]' },
}

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

  return (
    <div className={`flex items-start gap-3 py-2.5 border-b border-[#F3EDF7] last:border-0 ${completing ? 'opacity-30' : ''} transition-opacity`}>
      <button
        onClick={handleComplete}
        disabled={completing}
        className="w-5 h-5 rounded-full border-2 border-[#CAC4D0] hover:border-[#6750A4] hover:bg-[#EADDFF] flex-shrink-0 mt-0.5 transition-colors"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#1C1B1F] leading-snug">{task.content}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {task.priority > 1 && (
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
              task.priority === 4 ? 'bg-[#FFD8E4] text-[#31111D]' :
              task.priority === 3 ? 'bg-[#FFF0C8] text-[#261900]' :
              'bg-[#E7E0EC] text-[#49454F]'
            }`}>
              {priorityLabel(task.priority)}
            </span>
          )}
          {task.due && <span className="text-xs text-[#79747E]">{task.due.date}</span>}
        </div>
      </div>
    </div>
  )
}

export default function Buckets() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    getAllTasks()
      .then(setTasks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function removeTask(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  const buckets = Object.entries(PROJECTS).map(([name, projectId]) => {
    const bucketTasks = tasks.filter((t) => t.project_id === projectId)
    const p1Count = bucketTasks.filter((t) => t.priority === 4).length
    return { name, projectId, tasks: bucketTasks, p1Count, ...BUCKET_META[name] }
  })

  const selectedBucket = buckets.find((b) => b.name === selected)

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B1F]">Buckets</h1>
        <p className="text-sm text-[#49454F] mt-1">Your life, organised by area.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
          <p className="text-xs text-red-600">Could not load tasks — check TODOIST_API_KEY in Vercel.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-6">
        {buckets.map(({ name, emoji, color, text, tasks: bt, p1Count }) => (
          <button
            key={name}
            onClick={() => setSelected(selected === name ? null : name)}
            className={`${color} ${text} rounded-2xl p-4 text-left active:scale-95 transition-transform border-2 ${
              selected === name ? 'border-current' : 'border-transparent'
            }`}
          >
            <span className="text-2xl mb-2 block">{emoji}</span>
            <p className="font-semibold text-sm">{name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs opacity-60">
                {loading ? '…' : `${bt.length} task${bt.length !== 1 ? 's' : ''}`}
              </p>
              {!loading && p1Count > 0 && (
                <span className="text-xs font-bold opacity-80">{p1Count} P1</span>
              )}
            </div>
          </button>
        ))}
      </div>

      {selectedBucket && (
        <div className="bg-white border border-[#CAC4D0] rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">{selectedBucket.emoji}</span>
            <h2 className="text-sm font-semibold text-[#1C1B1F]">{selectedBucket.name}</h2>
            <span className="text-xs text-[#79747E] ml-auto">{selectedBucket.tasks.length} tasks</span>
          </div>

          {selectedBucket.tasks.length === 0 ? (
            <p className="text-sm text-[#79747E]">No open tasks in this bucket.</p>
          ) : (
            [...selectedBucket.tasks]
              .sort((a, b) => b.priority - a.priority)
              .map((task) => (
                <TaskRow key={task.id} task={task} onComplete={removeTask} />
              ))
          )}
        </div>
      )}

      {!selectedBucket && !loading && (
        <div className="bg-white border border-[#CAC4D0] rounded-2xl p-5 text-center">
          <p className="text-sm text-[#49454F]">Tap a bucket to see its tasks.</p>
        </div>
      )}
    </div>
  )
}
