import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PROJECTS } from '../lib/todoist'
import { scoreTask, BUCKET_WEIGHTS } from '../lib/priority'
import { getCachedTasks } from '../lib/taskCache'
import { getNotifications } from '../lib/notifications'
import { BUCKET_META } from '../lib/bucketConfig'

export default function Buckets() {
  const navigate = useNavigate()
  const tasks = getCachedTasks()
  const [search, setSearch] = useState('')

  const allNotifs = getNotifications().filter((n) => n.status === 'pending')
  const buckets = Object.entries(PROJECTS).map(([name]) => {
    const bt = tasks.filter((t) => t._projectName === name)
    const p1Count = bt.filter((t) => t.priority === 4).length
    const overdueCount = bt.filter((t) => scoreTask(t).isOverdue).length
    const notifCount = allNotifs.filter((n) => n.source === name).length
    const { emoji, bg, text } = BUCKET_META[name] ?? {}
    return { name, emoji, bg, text, count: bt.length, p1Count, overdueCount, notifCount }
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

      {tasks.length === 0 && (
        <div className="bg-[#FFF0C8] border border-[#F3EDF7] rounded-xl p-3 mb-4">
          <p className="text-xs text-[#49454F]">No tasks cached yet — go to Settings and tap <strong>Pull tasks</strong>.</p>
        </div>
      )}

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
          {buckets.map(({ name, emoji, bg, text, count, p1Count, overdueCount, notifCount }) => (
            <button
              key={name}
              onClick={() => navigate(`/buckets/${name}`)}
              className={`relative ${bg} ${text} rounded-2xl p-4 text-left active:scale-95 transition-transform shadow-sm`}
            >
              {notifCount > 0 && (
                <span className="absolute top-2.5 right-2.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                  {notifCount}
                </span>
              )}
              <span className="text-3xl mb-3 block">{emoji}</span>
              <p className="font-semibold text-base">{name}</p>
              <p className="text-xs opacity-60 mt-0.5">
                {`${count} task${count !== 1 ? 's' : ''}`}
              </p>
              {(p1Count > 0 || overdueCount > 0) && (
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
