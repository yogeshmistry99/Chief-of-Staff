import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getAllTasks, closeTask, PROJECTS } from '../lib/todoist'
import { sendMessageStream, SYSTEM_PROMPTS } from '../lib/claude'
import { loadHeadConfig } from '../lib/headConfig'
import { prioritise, scoreTask } from '../lib/priority'
import { haptic } from '../lib/haptic'
import Markdown from '../components/Markdown'
import ChatInput from '../components/ChatInput'
import TaskEditSheet, { PriorityPill } from '../components/TaskEditSheet'

const PROJECT_NAMES = Object.fromEntries(Object.entries(PROJECTS).map(([name, id]) => [id, name]))

export default function ChiefPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [tasks, setTasks] = useState([])
  const [taskIndex, setTaskIndex] = useState(0)
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cos_home_messages') ?? '[]') }
    catch { return [] }
  })
  const endRef = useRef(null)
  const inputRef = useRef(null)
  const autoSentRef = useRef(false)

  useEffect(() => {
    getAllTasks()
      .then((data) => data.map((t) => ({ ...t, _projectName: PROJECT_NAMES[t.project_id] })))
      .then(setTasks)
      .catch(() => {})
  }, [])

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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-[#CAC4D0] px-4 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(location.state?.from ?? '/')} className="text-[#6750A4] p-1 -ml-1 flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
              <path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/>
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-[#1C1B1F]">🎯 Chief of Staff</h1>
            <p className="text-xs text-[#79747E]">Full conversation · shared with home</p>
          </div>
          <button
            onClick={() => navigate('/chief/config')}
            className="flex items-center gap-1 text-xs font-medium text-[#6750A4] py-1.5 px-3 rounded-full bg-[#F3EDF7] hover:bg-[#EADDFF] transition-colors"
          >
            {hasKnowledge && <span className="w-1.5 h-1.5 rounded-full bg-[#6750A4]" />}
            Knowledge
          </button>
        </div>
      </div>

      {/* Messages */}
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

      {/* Task carousel + input */}
      <div className="bg-white border-t border-[#CAC4D0] flex-shrink-0">
        <TaskCarousel tasks={tasks} taskIndex={taskIndex} setTaskIndex={setTaskIndex} onTaskUpdate={(updated) =>
          setTasks((prev) => updated._removed
            ? prev.filter((t) => t.id !== updated.id)
            : prev.map((t) => t.id === updated.id ? { ...t, ...updated } : t))
        } />
        <div className="px-4 pt-3 pb-3">
          <ChatInput
            placeholder="Message your Chief of Staff…"
            onSend={handleSend}
            textareaRef={inputRef}
          />
        </div>
      </div>
    </div>
  )
}

function PriorityDot({ priority }) {
  if (priority === 4) return <span className="text-xs font-semibold text-red-700 bg-[#FFD8E4] px-1.5 py-0.5 rounded">P1</span>
  if (priority === 3) return <span className="text-xs font-semibold text-amber-800 bg-[#FFF0C8] px-1.5 py-0.5 rounded">P2</span>
  return null
}

function PriorityBadge({ task }) {
  const { isOverdue, isToday, days } = scoreTask(task)
  if (isOverdue) return <span className="text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Overdue</span>
  if (isToday)   return <span className="text-xs font-semibold text-[#6750A4] bg-[#EADDFF] px-1.5 py-0.5 rounded">Today</span>
  if (days === 1) return <span className="text-xs font-semibold text-[#49454F] bg-[#E7E0EC] px-1.5 py-0.5 rounded">Tomorrow</span>
  return null
}

function TaskCarousel({ tasks, taskIndex, setTaskIndex, onTaskUpdate }) {
  const { active } = prioritise(tasks)
  const [swipeLevel, setSwipeLevel] = useState(0)
  const upTouchRef = useRef(null)

  // Complete state
  const [pendingComplete, setPendingComplete] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [completingAnim, setCompletingAnim] = useState(false)
  const timerRef = useRef(null)

  // Swipe-left state
  const [swipeX, setSwipeX] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const swipeRef = useRef(null)

  // Hold-to-edit
  const [editOpen, setEditOpen] = useState(false)
  const holdRef = useRef(null)
  const isHoldRef = useRef(false)

  // Inline edit state (level 2)
  const [editContent, setEditContent] = useState('')
  const [editDue, setEditDue] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const idx = active.length ? Math.min(taskIndex, active.length - 1) : 0
  const t = active[idx]

  useEffect(() => {
    setSwipeLevel(0); setPendingComplete(false); setRemoving(false); setSwipeX(0)
    setEditContent(t?.content ?? ''); setEditDue(t?.due?.date ?? '')
  }, [idx, t?.id])

  useEffect(() => {
    if (!removing || !t) return
    const timer = setTimeout(async () => {
      try {
        await closeTask(t.id)
        onTaskUpdate({ ...t, _removed: true })
        setTaskIndex((i) => Math.max(0, i - 1))
      } catch { haptic.error(); setRemoving(false); setPendingComplete(false) }
    }, 380)
    return () => clearTimeout(timer)
  }, [removing])

  useEffect(() => {
    if (swipeLevel === 2) { setEditContent(t?.content ?? ''); setEditDue(t?.due?.date ?? '') }
  }, [swipeLevel])

  function handleComplete(e) {
    e?.stopPropagation?.()
    haptic.success(); haptic.fanfare()
    setCompletingAnim(true); setPendingComplete(true)
    timerRef.current = setTimeout(() => setRemoving(true), 5000)
  }

  function handleUndo(e) {
    e?.stopPropagation?.()
    haptic.light(); clearTimeout(timerRef.current)
    setPendingComplete(false); setRemoving(false); setCompletingAnim(false)
  }

  // Swipe-up/down on the whole card
  function onCardTouchStart(e) {
    upTouchRef.current = { y: e.touches[0].clientY, x: e.touches[0].clientX }
  }
  function onCardTouchEnd(e) {
    if (!upTouchRef.current) return
    const dy = upTouchRef.current.y - e.changedTouches[0].clientY
    const dx = Math.abs(e.changedTouches[0].clientX - upTouchRef.current.x)
    upTouchRef.current = null
    if (Math.abs(dy) < 20 || dx > Math.abs(dy) * 0.8) return
    if (dy > 0) {
      if (swipeLevel === 0) { haptic.light(); setSwipeLevel(1) }
      else if (swipeLevel === 1) { haptic.medium(); setSwipeLevel(2) }
    } else {
      if (swipeLevel > 0) { haptic.light(); setSwipeLevel((l) => l - 1) }
    }
  }

  // Swipe-left on the row
  function onRowTouchStart(e) {
    if (pendingComplete) return
    const touch = e.touches[0]
    swipeRef.current = { startX: touch.clientX, startY: touch.clientY, decided: false, horizontal: false, dx: 0 }
    upTouchRef.current = { y: touch.clientY, x: touch.clientX }
  }
  function onRowTouchMove(e) {
    const tr = swipeRef.current; if (!tr) return
    const touch = e.touches[0]
    const dx = touch.clientX - tr.startX; const dy = touch.clientY - tr.startY
    if (!tr.decided) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      tr.decided = true; tr.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2 && dx < 0
    }
    if (!tr.horizontal) return
    upTouchRef.current = null; clearTimeout(holdRef.current)
    tr.dx = Math.max(dx, -96); setSwipeX(tr.dx); setIsSwiping(true)
  }
  function onRowTouchEnd() {
    const tr = swipeRef.current; swipeRef.current = null
    if (!tr?.horizontal) { setIsSwiping(false); return }
    if (tr.dx < -70) {
      setSwipeX(-96)
      setTimeout(() => { setSwipeX(0); setIsSwiping(false); handleComplete() }, 200)
    } else { setSwipeX(0); setIsSwiping(false) }
  }

  function onRowPointerDown() {
    if (pendingComplete) return
    isHoldRef.current = false
    holdRef.current = setTimeout(() => { isHoldRef.current = true; haptic.medium(); setEditOpen(true) }, 500)
  }
  function onRowPointerUp() { clearTimeout(holdRef.current) }

  async function handleSave() {
    if (!t || saving) return; setSaving(true)
    try {
      const body = { content: editContent }
      if (editDue) body.due_date = editDue
      await fetch(`/api/todoist?path=tasks/${t.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      haptic.success()
      onTaskUpdate({ ...t, content: editContent, due: editDue ? { date: editDue } : t.due })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch { haptic.error() }
    finally { setSaving(false) }
  }

  if (!active.length) return null
  const { isOverdue } = scoreTask(t)

  return (
    <>
    <div
      className="rounded-t-3xl border border-[#E7E0EC] border-b-0 bg-white shadow-sm select-none"
      onTouchStart={onCardTouchStart}
      onTouchEnd={onCardTouchEnd}
    >
      {/* Pip + nav arrows */}
      <div className="flex items-center pt-2 pb-1 px-2">
        <button onClick={(e) => { e.stopPropagation(); haptic.light(); setSwipeLevel(0); setTaskIndex((i) => Math.max(0, i - 1)) }}
          disabled={idx === 0} className="text-[#79747E] disabled:opacity-25 p-0.5 flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor"><path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/></svg>
        </button>
        <div className="flex-1 flex justify-center">
          <div className="w-8 h-1 rounded-full bg-[#CAC4D0]" />
        </div>
        <button onClick={(e) => { e.stopPropagation(); haptic.light(); setSwipeLevel(0); setTaskIndex((i) => Math.min(active.length - 1, i + 1)) }}
          disabled={idx === active.length - 1} className="text-[#79747E] disabled:opacity-25 p-0.5 flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor"><path d="M400-240 640-480 400-720l-56 56 184 184-184 184 56 56Z"/></svg>
        </button>
      </div>

      {/* Task row — matches Home TaskRow */}
      <div className="relative overflow-hidden" style={{ opacity: pendingComplete ? 0.45 : 1, transition: 'opacity 0.15s ease' }}>
        {/* Swipe-left reveal */}
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-[#4CAF50] flex items-center justify-center"
          style={{ opacity: swipeX < -10 ? Math.min((-swipeX - 10) / 50, 1) : 0 }}>
          <svg xmlns="http://www.w3.org/2000/svg" height="22" viewBox="0 0 24 24" width="22" fill="white">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
        </div>
        <div style={{ transform: `translateX(${swipeX}px)`, transition: isSwiping ? 'none' : 'transform 0.28s cubic-bezier(0.25,1,0.5,1)', background: 'white' }}
          onTouchStart={onRowTouchStart} onTouchMove={onRowTouchMove} onTouchEnd={onRowTouchEnd}>
          <div className="flex items-center gap-3 px-3 py-3"
            onPointerDown={onRowPointerDown} onPointerUp={onRowPointerUp} onPointerLeave={onRowPointerUp}>
            <button onClick={(e) => { e.stopPropagation(); handleComplete(e) }} disabled={pendingComplete}
              className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-colors ${
                pendingComplete ? 'border-[#6750A4] bg-[#6750A4]' : 'border-[#CAC4D0] hover:border-[#6750A4] hover:bg-[#EADDFF]'
              }`}
              style={completingAnim ? { animation: 'complete-pop 0.42s cubic-bezier(0.34,1.56,0.64,1) both' } : undefined}
              onAnimationEnd={() => setCompletingAnim(false)}>
              {pendingComplete && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-full h-full p-0.5">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
              )}
            </button>

            <div className="flex-1 min-w-0">
              <p className={`text-sm leading-snug ${pendingComplete ? 'line-through text-[#79747E]' : isOverdue ? 'text-red-900' : 'text-[#1C1B1F]'}`}>
                {t.content}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <PriorityDot priority={t.priority} />
                <PriorityBadge task={t} />
                {t._projectName && <span className="text-xs text-[#79747E]">{t._projectName}</span>}
                <span className="text-[10px] text-[#CAC4D0]">{idx + 1}/{active.length}</span>
              </div>
            </div>

            {pendingComplete ? (
              <button onClick={(e) => { e.stopPropagation(); handleUndo(e) }}
                className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#6750A4] text-white flex-shrink-0">Undo</button>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="#CAC4D0"
                className={`flex-shrink-0 transition-transform duration-200 ${swipeLevel >= 1 ? 'rotate-180' : ''}`}>
                <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z"/>
              </svg>
            )}
          </div>
        </div>

        {pendingComplete && (
          <div className="h-0.5 bg-[#EADDFF] mx-3 -mt-1 mb-1 rounded-full overflow-hidden">
            <div className="h-full bg-[#6750A4] rounded-full" style={{ animation: 'shrink-bar 5s linear forwards' }} />
          </div>
        )}
      </div>

      {/* Level 1: description */}
      <div style={{ maxHeight: swipeLevel >= 1 ? '100px' : '0', overflow: 'hidden', transition: 'max-height 0.25s cubic-bezier(0.4,0,0.2,1)' }}>
        <div className="px-3 pb-2 pl-11">
          {t.description
            ? <p className="text-xs text-[#49454F] leading-relaxed">{t.description}</p>
            : <p className="text-xs text-[#CAC4D0] italic">No description</p>
          }
        </div>
      </div>

      {/* Level 2: inline edit */}
      <div style={{ maxHeight: swipeLevel >= 2 ? '200px' : '0', overflow: 'hidden', transition: 'max-height 0.3s cubic-bezier(0.4,0,0.2,1)' }}>
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-[#F3EDF7]" onTouchStart={(e) => e.stopPropagation()}>
          <input value={editContent} onChange={(e) => setEditContent(e.target.value)}
            className="w-full text-sm text-[#1C1B1F] border border-[#CAC4D0] rounded-xl px-3 py-2 focus:outline-none focus:border-[#6750A4]"
            placeholder="Task name" />
          <div className="flex items-center gap-2">
            <input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)}
              className="flex-1 text-xs text-[#49454F] border border-[#CAC4D0] rounded-xl px-3 py-2 focus:outline-none focus:border-[#6750A4]" />
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 rounded-full bg-[#6750A4] text-white text-xs font-semibold disabled:opacity-50">
              {saved ? '✓' : saving ? '…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>

    <TaskEditSheet
      open={editOpen}
      onClose={() => setEditOpen(false)}
      task={t}
      allTasks={tasks}
      onSaved={(updated) => onTaskUpdate(updated)}
    />
    </>
  )
}
