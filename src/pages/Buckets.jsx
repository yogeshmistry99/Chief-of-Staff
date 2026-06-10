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

const PROJECT_NAMES = Object.fromEntries(Object.entries(PROJECTS).map(([name, id]) => [id, name]))

export default function Buckets() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    getAllTasks()
      .then((data) => data.map((t) => ({ ...t, _projectName: PROJECT_NAMES[t.project_id] })))
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

  const query = search.trim().toLowerCase()
  const searchResults = query.length > 1
    ? tasks.filter((t) => t.content.toLowerCase().includes(query) || t.description?.toLowerCase().includes(query))
    : null

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-[#1C1B1F]">Buckets</h1>
        <p className="text-sm text-[#49454F] mt-1">Tap a bucket to talk to its Head or start a discussion.</p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="#79747E"
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/>
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search all tasks…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#CAC4D0] text-sm text-[#1C1B1F] focus:outline-none focus:border-[#6750A4] bg-white"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#79747E]">
            <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor">
              <path d="M480-424 284-228q-11 11-28 11t-28-11q-11-11-11-28t11-28l196-196-196-196q-11-11-11-28t11-28q11-11 28-11t28 11l196 196 196-196q11-11 28-11t28 11q11 11 11 28t-11 28L536-480l196 196q11 11 11 28t-11 28q-11 11-28 11t-28-11L480-424Z"/>
            </svg>
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
          <p className="text-xs text-red-600">Could not load tasks — check TODOIST_API_KEY in Vercel.</p>
        </div>
      )}

      {/* Chief of Staff tile */}
      <button
        onClick={() => navigate('/chief')}
        className="bg-[#EADDFF] text-[#21005D] rounded-2xl p-4 text-left active:scale-[0.98] transition-transform shadow-sm mb-3 w-full flex items-center gap-3"
      >
        <span className="text-3xl flex-shrink-0">🎯</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base">Chief of Staff</p>
          <p className="text-xs opacity-60">Strategy, priorities, cross-bucket decisions</p>
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor" className="opacity-40 flex-shrink-0">
          <path d="M400-240 160-480l240-240 56 56-184 184 184 184-56 56Zm264 0L424-480l240-240 56 56-184 184 184 184-56 56Z"/>
        </svg>
      </button>

      {/* Search results */}
      {searchResults !== null ? (
        <div>
          <p className="text-xs text-[#79747E] mb-3">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{query}"</p>
          {searchResults.length === 0 ? (
            <p className="text-sm text-[#49454F] text-center py-6">No tasks match your search.</p>
          ) : (
            <div className="bg-white border border-[#CAC4D0] rounded-2xl overflow-hidden shadow-sm">
              {searchResults.map((task, i) => {
                const { isOverdue, isToday } = scoreTask(task)
                const meta = BUCKET_META[task._projectName] ?? {}
                return (
                  <div key={task.id}
                    className="flex items-start gap-3 px-4 py-3 border-b border-[#F3EDF7] last:border-0 cursor-pointer active:bg-[#F3EDF7]"
                    onClick={() => navigate(`/buckets/${task._projectName}`)}>
                    <span className="text-base mt-0.5">{meta.emoji ?? '📁'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${isOverdue ? 'text-red-900' : 'text-[#1C1B1F]'}`}>{task.content}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-xs text-[#79747E]">{task._projectName}</span>
                        {task.priority === 4 && <span className="text-xs font-semibold text-red-700 bg-[#FFD8E4] px-1.5 py-0.5 rounded">P1</span>}
                        {task.priority === 3 && <span className="text-xs font-semibold text-amber-800 bg-[#FFF0C8] px-1.5 py-0.5 rounded">P2</span>}
                        {isOverdue && <span className="text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Overdue</span>}
                        {isToday && !isOverdue && <span className="text-xs font-semibold text-[#6750A4] bg-[#EADDFF] px-1.5 py-0.5 rounded">Today</span>}
                        {task.due?.date && <span className="text-xs text-[#79747E]">{task.due.date}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {buckets.map(({ name, emoji, color, text, count, p1Count, overdueCount }) => (
            <button
              key={name}
              onClick={() => navigate(`/buckets/${name}`)}
              className={`${color} ${text} rounded-2xl p-4 text-left active:scale-95 transition-transform shadow-sm`}
            >
              <span className="text-3xl mb-3 block">{emoji}</span>
              <p className="font-semibold text-base">{name}</p>
              <p className="text-xs opacity-60 mt-0.5">
                {loading ? '…' : `${count} task${count !== 1 ? 's' : ''}`}
              </p>
              {!loading && (p1Count > 0 || overdueCount > 0) && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {p1Count > 0 && (
                    <span className="text-[10px] font-bold bg-black/10 px-1.5 py-0.5 rounded-full">{p1Count} P1</span>
                  )}
                  {overdueCount > 0 && (
                    <span className="text-[10px] font-bold bg-red-500/20 text-red-700 px-1.5 py-0.5 rounded-full">{overdueCount} late</span>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
