import { useState, useRef, useEffect, useCallback } from 'react'
import TaskEditSheet from '../components/TaskEditSheet'
import { useParams, useNavigate } from 'react-router-dom'
import { getProjectSections, PROJECTS } from '../lib/todoist'
import { getCachedTasks, saveToCache, readTasksFromSupabase } from '../lib/taskCache'
import { scoreTask, BUCKET_WEIGHTS } from '../lib/priority'
import { sendMessageStream, sendMessage, SYSTEM_PROMPTS, REFRESH_PROMPTS } from '../lib/claude'
import { loadHeadConfig } from '../lib/headConfig'
import { getNotifications, getNotificationsForTask, saveNotifications, clearNotificationsForSource, dismissNotification, acceptNotification } from '../lib/notifications'
import NotificationCard, { notifDotClass } from '../components/NotificationCard'
import { haptic } from '../lib/haptic'
import Markdown from '../components/Markdown'
import ChatInput from '../components/ChatInput'
import ImageLightbox from '../components/ImageLightbox'
import { getDiscussions, deleteDiscussion, saveDiscussion, newDiscussion, findDiscussionByTask, archiveDiscussionsForTask, restoreDiscussionsForTask } from '../lib/discussions'
import { archiveTask, restoreTask } from '../lib/taskCache'
import { closeTask } from '../lib/todoist'
import { BUCKET_META } from '../lib/bucketConfig'

function extractJSON(text) {
  // Try clean parse first
  try { return JSON.parse(text.trim()) } catch {}
  // Strip markdown code fences
  const stripped = text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
  try { return JSON.parse(stripped) } catch {}
  // Find first {...} block in the text (handles preamble like "Proceeding...")
  const match = text.match(/\{[\s\S]*\}/)
  if (match) { try { return JSON.parse(match[0]) } catch {} }
  throw new Error('No valid JSON found in response')
}

const BUCKET_DESCRIPTIONS = {
  Finance:  'Investments, tax, budgets, and financial decisions.',
  Health:   'Physical health, fitness, medical, and mental wellbeing.',
  Work:     'Professional projects, Gensler, clients, and career.',
  Family:   'Family relationships, obligations, and shared goals.',
  Home:     'Property, maintenance, renovations, and household ops.',
  Personal: 'Personal growth, hobbies, learning, and interests.',
  Systems:  'Tools, automations, life OS, and productivity systems.',
}

// HeadTab receives messages/setMessages from parent so state survives tab switches
function HeadTab({ bucket, tasks, setTasks, messages, setMessages }) {
  const navigate = useNavigate()
  const endRef = useRef(null)
  const [lightboxSrc, setLightboxSrc] = useState(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function handleSend(content, attachmentName, attachmentPreview) {
    const userMsg = { role: 'user', content, attachmentName, attachmentPreview }
    setMessages((prev) => [...prev, userMsg])
    // Add empty streaming message immediately
    setMessages((prev) => [...prev, { role: 'assistant', content: '', streaming: true }])
    const cfg = loadHeadConfig(bucket)
    try {
      const history = [...messages, userMsg]
        .filter((m) => !m.streaming)
        .map(({ role, content }) => ({ role, content }))
      await sendMessageStream(history, SYSTEM_PROMPTS.head(bucket, tasks, cfg), (chunk) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || !last.streaming) return prev
          return [...prev.slice(0, -1), { ...last, content: last.content + chunk }]
        })
        endRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, tasks, (updatedTasks) => {
        setTasks(updatedTasks)
        saveToCache(updatedTasks).catch(() => {})
      }, cfg.model || null)
      // Mark streaming done
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (!last || !last.streaming) return prev
        return [...prev.slice(0, -1), { ...last, streaming: false }]
      })
    } catch (err) {
      const msg = err.message?.includes('fetch') ? 'Connection error — please try again.' : `Error: ${err.message}`
      setMessages((prev) => [...prev.slice(0, -1), { role: 'assistant', content: msg }])
    }
  }

  const cfg = loadHeadConfig(bucket)
  const hasKnowledge = !!(cfg.instructions || cfg.context || cfg.files?.length)

  return (
    <div className="flex flex-col h-full">
      {/* Head toolbar */}
      <div className="flex items-center justify-between px-4 pt-2 pb-1 border-b border-[#F3EDF7]">
        <p className="text-xs text-[#79747E]">{BUCKET_DESCRIPTIONS[bucket]}</p>
        <button
          onClick={() => navigate(`/buckets/${bucket}/config`)}
          className="flex items-center gap-1 text-xs font-medium text-[#6750A4] py-1 px-2 rounded-full hover:bg-[#F3EDF7] transition-colors"
        >
          {hasKnowledge ? (
            <span className="w-1.5 h-1.5 rounded-full bg-[#6750A4] inline-block" />
          ) : null}
          Knowledge
          <svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 -960 960 960" width="14" fill="currentColor">
            <path d="M480-120q-33 0-56.5-23.5T400-200q0-33 23.5-56.5T480-280q33 0 56.5 23.5T560-200q0 33-23.5 56.5T480-120Zm0-240q-33 0-56.5-23.5T400-440v-320q0-33 23.5-56.5T480-840q33 0 56.5 23.5T560-760v320q0 33-23.5 56.5T480-360Z"/>
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <p className="text-sm text-[#49454F]">Chat with your {bucket} Head.</p>
            {!hasKnowledge && (
              <button onClick={() => navigate(`/buckets/${bucket}/config`)}
                className="text-xs text-[#6750A4] mt-2 underline">
                Add knowledge →
              </button>
            )}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed select-text ${
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
                  {msg.attachmentPreview ? (
                    <img
                      src={msg.attachmentPreview}
                      alt={msg.attachmentName ?? 'attachment'}
                      className="w-32 h-32 object-cover rounded-xl mb-1 cursor-pointer"
                      onClick={() => setLightboxSrc(msg.attachmentPreview)}
                    />
                  ) : msg.attachmentName ? (
                    <span className="text-xs opacity-70 block mb-0.5">📎 {msg.attachmentName}</span>
                  ) : null}
                  {typeof msg.content === 'string' ? msg.content : msg.content.find((b) => b.type === 'text')?.text ?? ''}
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="bg-white border-t border-[#CAC4D0] px-4 pt-3 pb-3">
        <ChatInput placeholder={`Ask your ${bucket} Head…`} onSend={handleSend} />
      </div>
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  )
}

function DiscussionsTab({ bucket }) {
  const navigate = useNavigate()
  const [discussions, setDiscussions] = useState(() => getDiscussions(bucket))

  useEffect(() => { setDiscussions(getDiscussions(bucket)) }, [bucket])

  function handleDelete(e, id) {
    e.stopPropagation()
    if (!confirm('Delete this discussion?')) return
    deleteDiscussion(bucket, id)
    setDiscussions(getDiscussions(bucket))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {discussions.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-[#49454F]">No discussions yet.</p>
            <p className="text-xs text-[#79747E] mt-1">Start a new thread to work through a decision or problem.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {discussions.map((d) => (
              <div key={d.id} className="bg-white border border-[#CAC4D0] rounded-2xl overflow-hidden">
                <div className="flex items-start">
                  <button
                    onClick={() => navigate(`/buckets/${bucket}/discussions/${d.id}`, { state: { from: `/buckets/${bucket}` } })}
                    className="flex-1 min-w-0 text-left p-4 pr-2"
                  >
                    <p className="text-sm font-medium text-[#1C1B1F] leading-snug break-words">{d.title}</p>
                    <p className="text-xs text-[#79747E] mt-0.5">
                      {d.messages.length} message{d.messages.length !== 1 ? 's' : ''} · {new Date(d.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </p>
                  </button>
                  <div className="flex items-center pr-2 pt-3">
                    <button
                      onClick={(e) => handleDelete(e, d.id)}
                      className="text-[#CAC4D0] hover:text-red-400 p-1 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor">
                        <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="px-4 pb-4 pt-2 border-t border-[#CAC4D0] bg-white">
        <button
          onClick={() => navigate(`/buckets/${bucket}/discussions/new`, { state: { from: `/buckets/${bucket}` } })}
          className="w-full py-2.5 rounded-full bg-[#6750A4] text-white text-sm font-medium hover:bg-[#5B4397] transition-colors"
        >
          + New discussion
        </button>
      </div>
    </div>
  )
}

const SORT_OPTIONS = [
  { id: 'priority', label: 'Priority' },
  { id: 'date',     label: 'Date' },
  { id: 'category', label: 'Category' },
]

function sortTasks(tasks, sort) {
  const copy = [...tasks]
  if (sort === 'priority') {
    return copy.sort((a, b) => (b.priority ?? 1) - (a.priority ?? 1))
  }
  if (sort === 'date') {
    return copy.sort((a, b) => {
      const da = a.due?.date ?? a.due?.datetime?.split('T')[0] ?? '9999'
      const db = b.due?.date ?? b.due?.datetime?.split('T')[0] ?? '9999'
      return da.localeCompare(db)
    })
  }
  return copy
}

// Build an ordered list of { sectionId, name, tasks[] } groups
function groupBySection(tasks, sections) {
  const sectionMap = Object.fromEntries(sections.map((s) => [s.id, s.name]))
  const groups = {}
  const order = []
  sections.forEach((s) => { groups[s.id] = []; order.push(s.id) })
  tasks.forEach((t) => {
    const sid = t.section_id ?? '__none__'
    if (!groups[sid]) { groups[sid] = []; order.push(sid) }
    groups[sid].push(t)
  })
  const result = order
    .map((sid) => ({ id: sid, name: sectionMap[sid] ?? (sid === '__none__' ? null : sid), tasks: groups[sid] ?? [] }))
    .filter((g) => g.tasks.length > 0)
  return result
}

function TaskCard({ title, tasks, onComplete, indexOffset = 0, allTasks = [], bucket = '', onRespond }) {
  return (
    <div className="bg-white border border-[#CAC4D0] rounded-2xl px-4 pt-3 pb-1 shadow-sm mb-3"
      style={{ animation: `fade-up 0.4s cubic-bezier(0.22,1,0.36,1) ${0.05 + indexOffset * 0.06}s both` }}>
      {title && (
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-semibold text-[#49454F] uppercase tracking-wide">{title}</h3>
          <span className="text-xs text-[#79747E]">{tasks.length}</span>
        </div>
      )}
      {tasks.map((task, i) => (
        <TaskItem key={task.id} task={task} onComplete={onComplete} index={indexOffset + i} allTasks={allTasks} bucket={bucket} onRespond={onRespond} />
      ))}
    </div>
  )
}

function TasksTab({ tasks, sections, loading, onComplete, allTasks, bucket = '', onRefresh, refreshing, onRespond }) {
  const [sort, setSort] = useState('category')
  const [commentsOnly, setCommentsOnly] = useState(false)

  // Tasks with pending notifications from the last refresh
  const tasksWithNotifs = new Set(
    getNotifications().filter((n) => n.source === bucket && n.status === 'pending').map((n) => n.taskId)
  )
  const notifCount = tasksWithNotifs.size

  const filtered = commentsOnly ? tasks.filter((t) => tasksWithNotifs.has(t.id)) : tasks

  const allScored = filtered.map((t) => ({ ...t, _scored: scoreTask(t) }))
  const active  = allScored.filter((t) => t._scored.score >= 0)
  const someday = allScored.filter((t) => t._scored.score === -1)

  if (loading) return (
    <div className="px-4 py-4 space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          <div className="w-5 h-5 rounded-full bg-[#E7E0EC] flex-shrink-0" />
          <div className="h-4 bg-[#E7E0EC] rounded-full flex-1" />
        </div>
      ))}
    </div>
  )

  if (!active.length && !someday.length) return (
    <div className="text-center py-10">
      {commentsOnly
        ? <p className="text-sm text-[#49454F]">No tasks with comments from last refresh.</p>
        : <p className="text-sm text-[#49454F]">No tasks in this bucket.</p>}
    </div>
  )

  let content
  if (sort === 'category') {
    const groups = groupBySection(allScored, sections)
    let offset = 0
    content = groups.map((g) => {
      const el = <TaskCard key={g.id} title={g.name} tasks={g.tasks} onComplete={onComplete} indexOffset={offset} allTasks={allTasks} bucket={bucket} onRespond={onRespond} />
      offset += g.tasks.length
      return el
    })
  } else {
    const sorted = sortTasks(active, sort)
    content = <TaskCard title={null} tasks={sorted} onComplete={onComplete} allTasks={allTasks} bucket={bucket} onRespond={onRespond} />
  }

  return (
    <div>
      {/* Sort controls + Refresh */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        {SORT_OPTIONS.map(({ id, label }) => (
          <button key={id} onClick={() => setSort(id)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              sort === id
                ? 'bg-[#6750A4] text-white'
                : 'bg-[#F3EDF7] text-[#6750A4] hover:bg-[#EADDFF]'
            }`}>
            {label}
          </button>
        ))}
        {notifCount > 0 && (
          <button
            onClick={() => setCommentsOnly((x) => !x)}
            className={`relative flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              commentsOnly
                ? 'bg-amber-500 text-white'
                : 'bg-[#FFF0C8] text-amber-800 hover:bg-amber-100'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="11" viewBox="0 -960 960 960" width="11" fill="currentColor">
              <path d="M240-400h320v-80H240v80Zm0-120h480v-80H240v80Zm0-120h480v-80H240v80ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Z"/>
            </svg>
            {notifCount}
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
            refreshing ? 'bg-[#F3EDF7] text-[#79747E]' : 'bg-[#F3EDF7] text-[#6750A4] hover:bg-[#EADDFF]'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" height="13" viewBox="0 -960 960 960" width="13" fill="currentColor"
            style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined}>
            <path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z"/>
          </svg>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="px-4 pb-4">
        {content}
        {someday.length > 0 && sort !== 'category' && (
          <div className="bg-[#F3EDF7] rounded-xl px-4 py-2.5 mt-1">
            <p className="text-xs text-[#49454F]">
              <span className="font-semibold text-[#6750A4]">{someday.length} someday</span> — no date, P4.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function TaskItem({ task: initialTask, onComplete, index = 0, allTasks = [], bucket = '', onRespond }) {
  const navigate = useNavigate()
  const [localTask, setLocalTask] = useState(initialTask)
  const [pendingComplete, setPendingComplete] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [completingAnim, setCompletingAnim] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [swipeX, setSwipeX] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const [swipeTriggered, setSwipeTriggered] = useState(null)
  const [activeNotif, setActiveNotif] = useState(null)
  const [notifs, setNotifs] = useState(() => getNotificationsForTask(localTask.id))
  const timerRef = useRef(null)
  const holdRef = useRef(null)
  const isHoldRef = useRef(false)
  const swipeRef = useRef(null)

  const topNotif = notifs[0] ?? null

  function refreshNotifs() { setNotifs(getNotificationsForTask(localTask.id)) }

  const { isOverdue, isToday, days } = scoreTask(localTask)

  useEffect(() => {
    if (!removing) return
    const t = setTimeout(async () => {
      try {
        onComplete(localTask.id)
      } catch { haptic.error(); setRemoving(false); setPendingComplete(false) }
    }, 380)
    return () => clearTimeout(t)
  }, [removing])

  function handleComplete(e) {
    e.stopPropagation()
    const openSubs = allTasks.filter((t) => t.parent_id === localTask.id && !t.is_completed)
    if (openSubs.length > 0) {
      const msg = openSubs.length === 1
        ? 'There is still 1 open step — complete and archive anyway?'
        : `There are still ${openSubs.length} open steps — complete and archive anyway?`
      if (!window.confirm(msg)) return
    }
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
      tr.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2
    }
    if (!tr.horizontal) return
    clearTimeout(holdRef.current)
    tr.dx = Math.max(Math.min(dx, 96), -96)
    setSwipeX(tr.dx)
    setIsSwiping(true)
    if (tr.dx < -70 && swipeTriggered !== 'left') {
      setSwipeTriggered('left')
    } else if (tr.dx > 70 && swipeTriggered !== 'right') {
      setSwipeTriggered('right')
      haptic.chat()
    } else if (Math.abs(tr.dx) <= 70 && swipeTriggered) {
      setSwipeTriggered(null)
    }
  }
  function handleTouchEnd() {
    const tr = swipeRef.current
    swipeRef.current = null
    setSwipeTriggered(null)
    if (!tr?.horizontal) { setIsSwiping(false); return }
    if (tr.dx < -70) {
      setSwipeX(-96)
      setTimeout(() => {
        setSwipeX(0); setIsSwiping(false)
        handleComplete({ stopPropagation: () => {} })
      }, 200)
    } else if (tr.dx > 70 && bucket) {
      setSwipeX(96)
      setTimeout(() => {
        setSwipeX(0); setIsSwiping(false)
        haptic.light()
        const existing = findDiscussionByTask(bucket, localTask.id)
        if (existing) {
          navigate(`/buckets/${bucket}/discussions/${existing.id}`, { state: { from: `/buckets/${bucket}` } })
        } else {
          const disc = newDiscussion(localTask.content, localTask.id)
          saveDiscussion(bucket, disc)
          navigate(`/buckets/${bucket}/discussions/${disc.id}`, { state: { from: `/buckets/${bucket}` } })
        }
      }, 200)
    } else {
      setSwipeX(0); setIsSwiping(false)
    }
  }


  return (
    <>
    <div style={{
      display: 'grid',
      gridTemplateRows: removing ? '0fr' : '1fr',
      opacity: removing ? 0 : 1,
      transition: 'grid-template-rows 0.38s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease',
      animation: `fade-up 0.36s ease ${0.12 + index * 0.055}s both`,
    }}>
    <div style={{ overflow: 'hidden' }}>
    <div className="border-b border-[#F3EDF7] last:border-0 relative overflow-hidden"
      style={{ opacity: pendingComplete ? 0.45 : 1, transition: 'opacity 0.15s ease' }}>
      {/* Swipe-left reveal (complete) */}
      <div className="absolute right-0 top-0 bottom-0 w-24 bg-[#4CAF50] flex items-center justify-center"
        style={{ opacity: swipeX < -10 ? Math.min((-swipeX - 10) / 50, 1) : 0 }}>
        <svg xmlns="http://www.w3.org/2000/svg" height="22" viewBox="0 0 24 24" width="22" fill="white"
          style={swipeTriggered === 'left' ? { animation: 'swipe-tick-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both' } : undefined}>
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
      </div>
      {/* Swipe-right reveal (discuss) */}
      <div className="absolute left-0 top-0 bottom-0 w-24 bg-[#6750A4] flex items-center justify-center"
        style={{ opacity: swipeX > 10 ? Math.min((swipeX - 10) / 50, 1) : 0 }}>
        <svg xmlns="http://www.w3.org/2000/svg" height="22" viewBox="0 -960 960 960" width="22" fill="white"
          style={swipeTriggered === 'right' ? { animation: 'swipe-chat-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both' } : undefined}>
          <path d="M240-400h320v-80H240v80Zm0-120h480v-80H240v80Zm0-120h480v-80H240v80ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Z"/>
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
          <p className={`text-sm leading-snug select-text ${pendingComplete ? 'line-through text-[#79747E]' : isOverdue ? 'text-red-900' : 'text-[#1C1B1F]'}`}>
            {localTask.content}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {localTask.priority === 4 && <span className="text-xs font-semibold text-red-700 bg-[#FFD8E4] px-1.5 py-0.5 rounded">P1</span>}
            {localTask.priority === 3 && <span className="text-xs font-semibold text-amber-800 bg-[#FFF0C8] px-1.5 py-0.5 rounded">P2</span>}
            {isOverdue && <span className="text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Overdue</span>}
            {isToday && !isOverdue && <span className="text-xs font-semibold text-[#6750A4] bg-[#EADDFF] px-1.5 py-0.5 rounded">Today</span>}
            {days === 1 && <span className="text-xs font-semibold text-[#49454F] bg-[#E7E0EC] px-1.5 py-0.5 rounded">Tomorrow</span>}
            {localTask.due?.date && days > 1 && (
              <span className="text-xs text-[#79747E]">
                {new Date(localTask.due.date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
              </span>
            )}
            {localTask._sectionName && (
              <span className="text-xs text-[#79747E]">{localTask._sectionName}</span>
            )}
            {localTask.labels?.length > 0 && (
              <span className="text-xs text-[#79747E]">{localTask.labels.join(', ')}</span>
            )}
            {bucket && findDiscussionByTask(bucket, localTask.id) && (
              <svg xmlns="http://www.w3.org/2000/svg" height="11" viewBox="0 -960 960 960" width="11" fill="#6750A4">
                <path d="M240-400h320v-80H240v80Zm0-120h480v-80H240v80Zm0-120h480v-80H240v80ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Z"/>
              </svg>
            )}
          </div>
        </div>

        {topNotif && !pendingComplete && (
          <button
            onClick={(e) => { e.stopPropagation(); setActiveNotif(topNotif) }}
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-white ${notifDotClass(topNotif.type)}`}
          />
        )}
        {pendingComplete ? (
          <button onClick={handleUndo}
            className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#6750A4] text-white flex-shrink-0">
            Undo
          </button>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="#CAC4D0"
            className={`flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
            <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z"/>
          </svg>
        )}
      </div>

      {pendingComplete && (
        <div className="h-0.5 bg-[#EADDFF] -mt-1 mb-1 rounded-full overflow-hidden">
          <div className="h-full bg-[#6750A4] rounded-full" style={{ animation: 'shrink-bar 5s linear forwards' }} />
        </div>
      )}

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
                Due {new Date(localTask.due.date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
              </span>
            )}
            {localTask.due?.datetime && (
              <span className="text-xs text-[#79747E]">
                at {new Date(localTask.due.datetime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          {localTask.url && (
            <a href={localTask.url} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()} className="text-xs text-[#6750A4] font-medium">
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

    <TaskEditSheet
      open={editOpen}
      onClose={() => setEditOpen(false)}
      task={localTask}
      allTasks={allTasks}
      onSaved={(updated) => setLocalTask((prev) => ({ ...prev, ...updated }))}
    />
    {activeNotif && (
      <NotificationCard
        notification={activeNotif}
        onClose={() => setActiveNotif(null)}
        onAccept={() => { acceptNotification(activeNotif.id); setActiveNotif(null); refreshNotifs() }}
        onDecline={() => { dismissNotification(activeNotif.id); setActiveNotif(null); refreshNotifs() }}
        onRespond={() => { setActiveNotif(null); onRespond?.(activeNotif) }}
      />
    )}
    </>
  )
}

function ArchivedSection({ tasks, allTasks, bucket, onRestore }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const allDiscussions = getDiscussions(bucket)

  const filtered = tasks.filter((t) =>
    !search || t.content.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="px-4 pb-6 mt-2">
      <button
        onClick={() => setOpen((x) => !x)}
        className="w-full flex items-center justify-between py-2 text-left"
      >
        <span className="text-xs font-semibold text-[#79747E] uppercase tracking-wide">
          Archived ({tasks.length})
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="#79747E"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
          <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z"/>
        </svg>
      </button>

      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 0.25s ease' }}>
        <div style={{ overflow: 'hidden' }}>
          {tasks.length > 3 && (
            <div className="relative mb-2 mt-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search archived…"
                className="w-full rounded-xl border border-[#E7E0EC] bg-[#F3EDF7] px-3 py-1.5 text-xs text-[#1C1B1F] placeholder-[#79747E] focus:outline-none focus:border-[#6750A4]"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#79747E]">
                  ×
                </button>
              )}
            </div>
          )}

          <div className="space-y-1.5 pt-1">
            {filtered.length === 0 && search && (
              <p className="text-xs text-[#79747E] text-center py-2">No matches.</p>
            )}
            {filtered.map((t) => {
              const subtasks = allTasks.filter((s) => s.parent_id === t.id)
              const discussion = allDiscussions.find((d) => d.taskId === t.id)
              const isExpanded = expandedId === t.id

              return (
                <div key={t.id} className="bg-white border border-[#E7E0EC] rounded-2xl overflow-hidden">
                  {/* Task row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : t.id)}
                    className="w-full flex items-start gap-2.5 py-2.5 px-3 text-left"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" height="15" viewBox="0 -960 960 960" width="15" fill="#6750A4" className="flex-shrink-0 mt-0.5">
                      <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/>
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#79747E] line-through leading-snug">{t.content}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {t.completed_at && (
                          <span className="text-[10px] text-[#79747E]">
                            {new Date(t.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                        {subtasks.length > 0 && (
                          <span className="text-[10px] text-[#79747E]">{subtasks.length} step{subtasks.length !== 1 ? 's' : ''}</span>
                        )}
                        {discussion && (
                          <svg xmlns="http://www.w3.org/2000/svg" height="10" viewBox="0 -960 960 960" width="10" fill="#6750A4">
                            <path d="M240-400h320v-80H240v80Zm0-120h480v-80H240v80Zm0-120h480v-80H240v80ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Z"/>
                          </svg>
                        )}
                      </div>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 -960 960 960" width="14" fill="#CAC4D0"
                      className="flex-shrink-0 transition-transform duration-200"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                      <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z"/>
                    </svg>
                  </button>

                  {/* Expanded detail */}
                  <div style={{
                    maxHeight: isExpanded ? '400px' : '0',
                    overflow: 'hidden',
                    transition: 'max-height 0.25s cubic-bezier(0.4,0,0.2,1)',
                  }}>
                    <div className="px-3 pb-3 space-y-2 border-t border-[#F3EDF7]">
                      {t.description && (
                        <p className="text-xs text-[#49454F] leading-relaxed pt-2">{t.description}</p>
                      )}

                      {subtasks.length > 0 && (
                        <div className="pt-1">
                          <p className="text-[10px] text-[#79747E] uppercase tracking-wide mb-1">Steps</p>
                          <div className="space-y-0.5">
                            {subtasks.map((s) => (
                              <div key={s.id} className="flex items-center gap-1.5">
                                <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${s.is_completed ? 'border-[#6750A4] bg-[#6750A4]' : 'border-[#CAC4D0]'}`}>
                                  {s.is_completed && (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-full h-full p-0.5">
                                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                    </svg>
                                  )}
                                </div>
                                <p className={`text-xs leading-snug ${s.is_completed ? 'text-[#79747E] line-through' : 'text-[#49454F]'}`}>{s.content}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {discussion && (
                        <div className="pt-1">
                          <p className="text-[10px] text-[#79747E] uppercase tracking-wide mb-1">Discussion</p>
                          <button
                            onClick={() => navigate(`/buckets/${bucket}/discussions/${discussion.id}`, { state: { from: `/buckets/${bucket}` } })}
                            className="flex items-center gap-1.5 text-xs text-[#6750A4] font-medium"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" height="13" viewBox="0 -960 960 960" width="13" fill="currentColor">
                              <path d="M240-400h320v-80H240v80Zm0-120h480v-80H240v80Zm0-120h480v-80H240v80ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Z"/>
                            </svg>
                            {discussion.title} · {discussion.messages.length} message{discussion.messages.length !== 1 ? 's' : ''} →
                          </button>
                        </div>
                      )}

                      <button
                        onClick={() => onRestore(t.id)}
                        className="flex items-center gap-1 text-xs font-medium text-[#6750A4] bg-[#F3EDF7] hover:bg-[#EADDFF] px-3 py-1.5 rounded-full transition-colors mt-1"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" height="13" viewBox="0 -960 960 960" width="13" fill="currentColor">
                          <path d="M440-122q-121-15-200.5-105.5T160-440q0-66 26-126t74-108l56 56q-38 36-57 84t-19 94q0 92 60 158t160 80v80Zm80 0v-80q100-14 160-80t60-158q0-100-70-170t-170-70h-3l44 44-56 56-140-140 140-140 56 56-44 44h3q134 0 227 93t93 227q0 121-79.5 211.5T520-122Z"/>
                        </svg>
                        Restore
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BucketDetail() {
  const { bucket } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('tasks')
  const [tasks, setTasks] = useState([])
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  // Head chat — persisted to localStorage so history survives navigation and sessions
  const storageKey = `cos_head_${bucket}`
  const [headMessages, setHeadMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`cos_head_${bucket}`) ?? '[]') }
    catch { return [] }
  })
  useEffect(() => {
    const toSave = headMessages.filter((m) => !m.streaming)
    if (toSave.length) localStorage.setItem(storageKey, JSON.stringify(toSave))
  }, [headMessages, storageKey])

  const projectId = PROJECTS[bucket]

  useEffect(() => {
    if (!projectId) return
    // Load from cache immediately for instant display
    const cached = getCachedTasks().filter((t) => t._projectName === bucket)
    if (cached.length) { setTasks(cached); setLoading(false) }
    // Replace with Supabase data (source of truth)
    readTasksFromSupabase().then((all) => {
      if (all) {
        const bucketTasks = all.filter((t) => t._projectName === bucket)
        if (bucketTasks.length) setTasks(bucketTasks)
        setLoading(false)
      }
    }).catch(() => {})
    // Fetch sections from Todoist for display grouping
    getProjectSections(projectId)
      .then((sectionData) => {
        const sections = Array.isArray(sectionData) ? sectionData : []
        setSections(sections)
        if (!cached.length) setLoading(false)
      })
      .catch((e) => { setLoadError(e.message ?? 'Could not load tasks'); setLoading(false) })
  }, [projectId])

  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-[#49454F]">Unknown bucket.</p>
        <button onClick={() => navigate('/buckets')} className="text-xs text-[#6750A4]">← Back</button>
      </div>
    )
  }

  function removeTask(id) {
    setTasks((prev) => prev.map((t) =>
      t.id === id ? { ...t, is_completed: true, completed_at: new Date().toISOString() } : t
    ))
    archiveTask(id).catch(() => {})
    archiveDiscussionsForTask(bucket, id)
    if (!id.startsWith('local_')) closeTask(id).catch(() => {})
  }

  function handleRestore(id) {
    setTasks((prev) => prev.map((t) =>
      t.id === id ? { ...t, is_completed: false, completed_at: null } : t
    ))
    restoreTask(id).catch(() => {})
    restoreDiscussionsForTask(bucket, id)
  }

  function handleRespond(notif) {
    setTab('head')
    setHeadMessages((prev) => [...prev, {
      role: 'user',
      content: `Re: notification — ${notif.description}`,
    }])
  }

  async function handleRefresh() {
    setRefreshing(true)
    clearNotificationsForSource(bucket)
    try {
      const cfg = loadHeadConfig(bucket)
      const allTasks = getCachedTasks()
      const system = REFRESH_PROMPTS.head(bucket, allTasks, cfg)
      const { content } = await sendMessage(
        [{ role: 'user', content: 'Run the priority refresh now.' }],
        system,
        null
      )
      const result = extractJSON(content)

      // Apply priority updates to cache
      if (result.priorityUpdates?.length) {
        const updated = getCachedTasks().map((t) => {
          const upd = result.priorityUpdates.find((u) => u.taskId === t.id)
          return upd ? { ...t, priority: upd.priority } : t
        })
        saveToCache(updated)
        setTasks(updated.filter((t) => t._projectName === bucket))
      }

      // Save notifications
      if (result.notifications?.length) {
        const existing = getNotifications().filter((n) => n.source !== bucket)
        saveNotifications([
          ...existing,
          ...result.notifications.map((n) => ({ ...n, source: bucket, status: 'pending' })),
        ])
      }

      // Post summary to head chat
      if (result.summary) {
        setTab('head')
        setHeadMessages((prev) => [
          ...prev,
          { role: 'assistant', content: result.summary },
        ])
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : JSON.stringify(e)
      setHeadMessages((prev) => [...prev, { role: 'assistant', content: `Refresh failed: ${msg}` }])
      setTab('head')
    } finally {
      setRefreshing(false)
    }
  }

  const open     = tasks.filter((t) => !t.is_completed)
  const archived = tasks.filter((t) => t.is_completed)
  const overdue  = open.filter((t) => scoreTask(t).isOverdue).length
  const meta = BUCKET_META[bucket] ?? { emoji: '📁', bg: 'bg-[#E7E0EC]', text: 'text-[#49454F]' }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`${meta.bg} ${meta.text} px-4 pt-4 pb-0`}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/buckets')} className="opacity-70 p-1 -ml-1">
            <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
              <path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z" />
            </svg>
          </button>
          <span className="text-2xl">{meta.emoji}</span>
          <div className="flex-1">
            <h1 className="text-lg font-semibold leading-tight">{bucket}</h1>
            <p className="text-xs opacity-60">
              {loading ? '…' : `${open.length} tasks`}
              {overdue > 0 && <span className="text-red-600 opacity-100"> · {overdue} overdue</span>}
            </p>
          </div>
        </div>
        {/* Tabs */}
        {(() => {
          const bucketNotifCount = getNotifications().filter((n) => n.source === bucket && n.status === 'pending').length
          return (
            <div className="flex gap-0">
              {[
                { id: 'tasks', label: 'Tasks' },
                { id: 'head', label: 'Head' },
                { id: 'discussions', label: 'Discuss' },
              ].map(({ id, label }) => (
                <button key={id} onClick={() => { haptic.light(); setTab(id) }}
                  className={`relative flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                    tab === id ? 'border-current opacity-100' : 'border-transparent opacity-50'
                  }`}>
                  {label}
                  {bucketNotifCount > 0 && id === 'tasks' && (
                    <span className="absolute top-1 ml-0.5 min-w-[14px] h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full inline-flex items-center justify-center px-0.5">
                      {bucketNotifCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )
        })()}
      </div>

      {/* Tab content — all three stay mounted; only active one is visible */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 overflow-y-auto ${tab === 'tasks' ? '' : 'invisible pointer-events-none'}`}>
          {loadError
            ? <p className="px-4 pt-6 text-sm text-red-500">Could not load tasks — {loadError}</p>
            : <>
                <TasksTab tasks={open} sections={sections} loading={loading} onComplete={removeTask} allTasks={tasks} bucket={bucket} onRefresh={handleRefresh} refreshing={refreshing} onRespond={handleRespond} />
                {archived.length > 0 && <ArchivedSection tasks={archived} allTasks={tasks} bucket={bucket} onRestore={handleRestore} />}
              </>}
        </div>
        <div className={`absolute inset-0 ${tab === 'head' ? '' : 'invisible pointer-events-none'}`}>
          <HeadTab bucket={bucket} tasks={tasks} setTasks={setTasks} messages={headMessages} setMessages={setHeadMessages} />
        </div>
        <div className={`absolute inset-0 ${tab === 'discussions' ? '' : 'invisible pointer-events-none'}`}>
          <DiscussionsTab bucket={bucket} />
        </div>
      </div>
    </div>
  )
}
