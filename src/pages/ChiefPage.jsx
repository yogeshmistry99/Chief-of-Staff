import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { sendMessageStream, sendMessage, SYSTEM_PROMPTS, REFRESH_PROMPTS } from '../lib/claude'
import { loadHeadConfig } from '../lib/headConfig'
import { getCachedTasks, saveToCache } from '../lib/taskCache'
import { getNotifications, getNotificationsForTask, saveNotifications, clearNotificationsForSource, dismissNotification, acceptNotification } from '../lib/notifications'
import NotificationCard, { notifDotClass } from '../components/NotificationCard'
import { prioritise, scoreTask } from '../lib/priority'
import { haptic } from '../lib/haptic'
import Markdown from '../components/Markdown'
import ChatInput from '../components/ChatInput'
import TaskEditSheet from '../components/TaskEditSheet'

export default function ChiefPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [tasks, setTasks] = useState(() => getCachedTasks())
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cos_home_messages') ?? '[]') }
    catch { return [] }
  })
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState('priorities')
  const endRef = useRef(null)
  const inputRef = useRef(null)
  const autoSentRef = useRef(false)

  async function handleRefresh() {
    setRefreshing(true)
    clearNotificationsForSource('chief')
    try {
      const cfg = loadHeadConfig('chief')
      const allTasks = getCachedTasks()
      const system = REFRESH_PROMPTS.cos(allTasks, cfg)
      const { content } = await sendMessage(
        [{ role: 'user', content: 'Run the priority refresh now.' }],
        system,
        null,
        { model: 'claude-sonnet-4-6' }
      )
      const clean = content.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
      const result = JSON.parse(clean)

      if (result.priorityUpdates?.length) {
        const updated = getCachedTasks().map((t) => {
          const upd = result.priorityUpdates.find((u) => u.taskId === t.id)
          return upd ? { ...t, priority: upd.priority } : t
        })
        saveToCache(updated)
        setTasks(updated)
      }

      if (result.notifications?.length) {
        const existing = getNotifications().filter((n) => n.source !== 'chief')
        saveNotifications([
          ...existing,
          ...result.notifications.map((n) => ({ ...n, source: 'chief', status: 'pending' })),
        ])
      }

      if (result.summary) {
        setMessages((prev) => [...prev, { role: 'assistant', content: result.summary }])
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : JSON.stringify(e)
      setMessages((prev) => [...prev, { role: 'assistant', content: `Refresh failed: ${msg}` }])
    } finally {
      setRefreshing(false)
    }
  }

  // Auto-send message passed from Home via navigation state
  useEffect(() => {
    const { initialMessage, attachmentName } = location.state ?? {}
    if (initialMessage && !autoSentRef.current) {
      autoSentRef.current = true
      // Clear transient fields but keep 'from' for back navigation
      window.history.replaceState({ from: location.state?.from }, '')
      handleSend(initialMessage, attachmentName)
    }
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    const toSave = messages.filter((m) => !m.streaming && !m.pending)
    localStorage.setItem('cos_home_messages', JSON.stringify(toSave))
  }, [messages])

  async function handleSend(content, attachmentName) {
    const userMsg = { role: 'user', content, attachmentName }
    setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '', streaming: true }])
    const cfg = loadHeadConfig('chief')
    try {
      const history = [...messages, userMsg]
        .filter((m) => !m.streaming && !m.pending)
        .map(({ role, content }) => ({ role, content }))
      await sendMessageStream(history, SYSTEM_PROMPTS.cos(tasks, cfg), (chunk) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last?.streaming) return prev
          return [...prev.slice(0, -1), { ...last, content: last.content + chunk }]
        })
      }, tasks, (updatedTasks) => {
        setTasks(updatedTasks)
        saveToCache(updatedTasks)
      })
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (!last?.streaming) return prev
        return [...prev.slice(0, -1), { ...last, streaming: false }]
      })
    } catch (err) {
      setMessages((prev) => [...prev.slice(0, -1), { role: 'assistant', content: `Error: ${err.message}` }])
    }
  }

  const cfg = loadHeadConfig('chief')
  const hasKnowledge = !!(cfg.instructions || cfg.context || cfg.files?.length)
  const chiefNotifCount = getNotifications().filter((n) => n.source === 'chief' && n.status === 'pending').length
  const { active: prioritisedTasks } = prioritise(tasks)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-[#F3EDF7] px-4 pt-4 pb-0 flex-shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(location.state?.from ?? '/')} className="opacity-70 p-1 -ml-1 text-[#1C1B1F]">
            <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
              <path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/>
            </svg>
          </button>
          <span className="text-2xl">🎯</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold leading-tight text-[#1C1B1F]">Chief of Staff</h1>
            <p className="text-xs opacity-60 text-[#1C1B1F]">{tasks.length} tasks across all buckets</p>
          </div>
          <button
            onClick={() => navigate('/chief/config')}
            className="flex items-center gap-1 text-xs font-medium text-[#6750A4] py-1.5 px-3 rounded-full bg-white/70 transition-colors"
          >
            {hasKnowledge && <span className="w-1.5 h-1.5 rounded-full bg-[#6750A4]" />}
            Knowledge
          </button>
        </div>
        {/* Tabs */}
        <div className="flex gap-0 text-[#1C1B1F]">
          {[
            { id: 'priorities', label: 'Priorities' },
            { id: 'chief', label: 'Chief of Staff' },
          ].map(({ id, label }) => (
            <button key={id} onClick={() => { haptic.light(); setTab(id) }}
              className={`relative flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === id ? 'border-current opacity-100' : 'border-transparent opacity-50'
              }`}>
              {label}
              {chiefNotifCount > 0 && (id === 'priorities' || id === 'chief') && (
                <span className="absolute top-1 ml-0.5 min-w-[14px] h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full inline-flex items-center justify-center px-0.5">
                  {chiefNotifCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden relative">

        {/* Priorities tab */}
        <div className={`absolute inset-0 ${tab === 'priorities' ? '' : 'invisible pointer-events-none'}`}>
          <div className="overflow-y-auto h-full">
            {/* Refresh button */}
            <div className="flex justify-end px-4 pt-3 pb-1">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#F3EDF7] text-[#6750A4] hover:bg-[#EADDFF] transition-colors disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="12" viewBox="0 -960 960 960" width="12" fill="currentColor"
                  style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined}>
                  <path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z"/>
                </svg>
                {refreshing ? 'Refreshing…' : 'Refresh priorities'}
              </button>
            </div>
            {prioritisedTasks.length === 0 ? (
              <div className="text-center py-12 px-4">
                <p className="text-sm text-[#49454F]">No tasks cached yet.</p>
                <p className="text-xs text-[#79747E] mt-1">Pull tasks from Settings first.</p>
              </div>
            ) : (
              <div className="px-4 pb-4 space-y-1">
                {prioritisedTasks.map((task, i) => {
                  const { isOverdue, isToday } = scoreTask(task)
                  const notifs = getNotificationsForTask(task.id)
                  const topNotif = notifs[0] ?? null
                  return (
                    <CosPriorityRow
                      key={task.id}
                      task={task}
                      isOverdue={isOverdue}
                      isToday={isToday}
                      topNotif={topNotif}
                      index={i}
                      onNotifRespond={(notif) => {
                        setTab('chief')
                        setMessages((prev) => [...prev, { role: 'user', content: `Re: ${notif.description}` }])
                      }}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Chief of Staff chat tab */}
        <div className={`absolute inset-0 flex flex-col ${tab === 'chief' ? '' : 'invisible pointer-events-none'}`}>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <p className="text-3xl mb-3">🎯</p>
                <p className="text-sm text-[#49454F]">Your Chief of Staff is ready.</p>
                <p className="text-xs text-[#79747E] mt-1">Ask about priorities, decisions, or anything across all seven buckets.</p>
                {!hasKnowledge && (
                  <button onClick={() => navigate('/chief/config')}
                    className="text-xs text-[#6750A4] mt-3 underline block mx-auto">
                    Add knowledge →
                  </button>
                )}
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#6750A4] text-white rounded-br-sm'
                    : 'bg-white border border-[#CAC4D0] text-[#1C1B1F] rounded-bl-sm'
                }`}>
                  {msg.role === 'assistant' ? (
                    <>
                      <Markdown text={msg.content || ' '} />
                      {msg.streaming && (
                        <span style={{ animation: 'blink 0.9s step-end infinite', display: 'inline-block', marginLeft: '1px', lineHeight: 1 }}>▌</span>
                      )}
                    </>
                  ) : (
                    <>
                      {msg.attachmentName && <span className="text-xs opacity-70 block mb-0.5">📎 {msg.attachmentName}</span>}
                      {typeof msg.content === 'string' ? msg.content : msg.content.find?.((b) => b.type === 'text')?.text ?? ''}
                    </>
                  )}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="bg-white border-t border-[#CAC4D0] px-4 pt-3 pb-3 flex-shrink-0">
            <ChatInput placeholder="Message your Chief of Staff…" onSend={handleSend} textareaRef={inputRef} />
          </div>
        </div>

      </div>
    </div>
  )
}

function CosPriorityRow({ task, isOverdue, isToday, topNotif, index, onNotifRespond }) {
  const [activeNotif, setActiveNotif] = useState(null)
  const [editOpen, setEditOpen] = useState(false)
  const [notifs, setNotifs] = useState(() => topNotif ? [topNotif] : [])
  const currentTopNotif = notifs[0] ?? null

  function refreshNotifs() {
    setNotifs(getNotificationsForTask(task.id))
  }

  return (
    <>
      <div
        className="flex items-center gap-3 py-2.5 px-3 bg-white rounded-xl border border-[#F3EDF7]"
        style={{ animation: `fade-up 0.3s ease ${index * 0.03}s both` }}
        onPointerDown={() => {}}
        onClick={() => setEditOpen(true)}
      >
        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-snug ${isOverdue ? 'text-red-900' : 'text-[#1C1B1F]'}`}>{task.content}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {task.priority === 4 && <span className="text-xs font-semibold text-red-700 bg-[#FFD8E4] px-1.5 py-0.5 rounded">P1</span>}
            {task.priority === 3 && <span className="text-xs font-semibold text-amber-800 bg-[#FFF0C8] px-1.5 py-0.5 rounded">P2</span>}
            {isOverdue && <span className="text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Overdue</span>}
            {isToday && !isOverdue && <span className="text-xs font-semibold text-[#6750A4] bg-[#EADDFF] px-1.5 py-0.5 rounded">Today</span>}
            {task._projectName && <span className="text-xs text-[#79747E]">{task._projectName}</span>}
          </div>
        </div>
        {currentTopNotif && (
          <button
            onClick={(e) => { e.stopPropagation(); setActiveNotif(currentTopNotif) }}
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-white ${notifDotClass(currentTopNotif.type)}`}
          />
        )}
      </div>
      <TaskEditSheet open={editOpen} onClose={() => setEditOpen(false)} task={task} allTasks={[]} onSaved={() => {}} />
      {activeNotif && (
        <NotificationCard
          notification={activeNotif}
          onClose={() => setActiveNotif(null)}
          onAccept={() => { acceptNotification(activeNotif.id); setActiveNotif(null); refreshNotifs() }}
          onDecline={() => { dismissNotification(activeNotif.id); setActiveNotif(null); refreshNotifs() }}
          onRespond={() => { setActiveNotif(null); onNotifRespond(activeNotif) }}
        />
      )}
    </>
  )
}

