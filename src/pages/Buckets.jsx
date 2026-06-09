import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllTasks, PROJECTS } from '../lib/todoist'
import { scoreTask } from '../lib/priority'
import { BUCKET_WEIGHTS } from '../lib/priority'

const BUCKET_META = {
  Finance:  { emoji: '💰', color: 'bg-[#C8F5E1]', text: 'text-[#002115]' },
  Health:   { emoji: '🏃', color: 'bg-[#FFD8E4]', text: 'text-[#31111D]' },
  Home:     { emoji: '🏠', color: 'bg-[#FFF0C8]', text: 'text-[#261900]' },
  Work:     { emoji: '💼', color: 'bg-[#D3E4FF]', text: 'text-[#001D36]' },
  Family:   { emoji: '👨‍👩‍👧', color: 'bg-[#FFE4F3]', text: 'text-[#31001D]' },
  Personal: { emoji: '✨', color: 'bg-[#E8F5E9]', text: 'text-[#1B5E20]' },
  Systems:  { emoji: '⚙️', color: 'bg-[#EADDFF]', text: 'text-[#21005D]' },
}

export default function Buckets() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getAllTasks()
      .then(setTasks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const buckets = Object.entries(PROJECTS).map(([name, projectId]) => {
    const bt = tasks.filter((t) => t.project_id === projectId)
    const p1Count = bt.filter((t) => t.priority === 4).length
    const overdueCount = bt.filter((t) => scoreTask(t).isOverdue).length
    return { name, projectId, count: bt.length, p1Count, overdueCount, ...BUCKET_META[name] }
  }).sort((a, b) => (BUCKET_WEIGHTS[b.name] ?? 0) - (BUCKET_WEIGHTS[a.name] ?? 0))

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-[#1C1B1F]">Buckets</h1>
        <p className="text-sm text-[#49454F] mt-1">Tap a bucket to talk to its Head or start a discussion.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
          <p className="text-xs text-red-600">Could not load tasks — check TODOIST_API_KEY in Vercel.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {buckets.map(({ name, emoji, color, text, count, p1Count, overdueCount }) => (
          <button
            key={name}
            onClick={() => navigate(`/buckets/${name}`)}
            className={`${color} ${text} rounded-2xl p-4 text-left active:scale-95 transition-transform`}
          >
            <span className="text-2xl mb-2 block">{emoji}</span>
            <p className="font-semibold text-sm">{name}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <p className="text-xs opacity-60">
                {loading ? '…' : `${count} task${count !== 1 ? 's' : ''}`}
              </p>
              {!loading && p1Count > 0 && (
                <span className="text-xs font-bold opacity-80">{p1Count} P1</span>
              )}
              {!loading && overdueCount > 0 && (
                <span className="text-xs font-bold text-red-600">{overdueCount} late</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
