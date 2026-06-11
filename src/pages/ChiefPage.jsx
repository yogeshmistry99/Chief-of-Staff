import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getAllTasks, PROJECTS } from '../lib/todoist'
import { sendMessageStream, SYSTEM_PROMPTS } from '../lib/claude'
import { loadHeadConfig } from '../lib/headConfig'
import { prioritise } from '../lib/priority'
import { haptic } from '../lib/haptic'
import Markdown from '../components/Markdown'
import ChatInput from '../components/ChatInput'
import EditSheet from '../components/EditSheet'

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
    const { initialMessage, attachmentName, from } = location.state ?? {}
    if (initialMessage && !autoSentRef.current) {
      autoSentRef.current = true
      // Clear transient fields but preserve 'from' for back navigation
      window.history.replaceState({ from }, '')
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
          setTasks((prev) => prev.map((t) => t.id === updated.id ? { ...t, ...updated } : t))
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

const PRIORITY_COLOURS = { P1: 'text-red-600 bg-red-50', P2: 'text-orange-500 bg-orange-50', P3: 'text-yellow-600 bg-yellow-50', P4: 'text-[#79747E] bg-[#F3EDF7]' }

function fmtDate(iso) {
  if (!iso) return null
  return iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(2, 4)
}

function TaskCarousel({ tasks, taskIndex, setTaskIndex, onTaskUpdate }) {
  const { active } = prioritise(tasks)
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editPriority, setEditPriority] = useState(1)
  const [editDue, setEditDue] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const holdRef = useRef(null)
  const isHoldRef = useRef(false)

  if (!active.length) return null
  const idx = Math.min(taskIndex, active.length - 1)
  const t = active[idx]
  const priority = ['', 'P4', 'P3', 'P2', 'P1'][t.priority] ?? 'P4'
  const due = fmtDate(t.due?.date)

  // Collapse expanded detail when navigating to a different task
  useEffect(() => { setExpanded(false) }, [idx])

  function openEdit() {
    setEditContent(t.content)
    setEditPriority(t.priority ?? 1)
    setEditDue(t.due?.date ?? '')
    setEditDesc(t.description ?? '')
    setEditOpen(true)
  }

  function handlePointerDown() {
    isHoldRef.current = false
    holdRef.current = setTimeout(() => {
      isHoldRef.current = true
      haptic.medium()
      openEdit()
    }, 500)
  }

  function handlePointerUp() { clearTimeout(holdRef.current) }

  function handleTap() {
    if (isHoldRef.current) { isHoldRef.current = false; return }
    setExpanded((x) => !x)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const body = { content: editContent, priority: editPriority, description: editDesc }
      if (editDue) body.due_date = editDue
      const res = await fetch(`/api/todoist?path=tasks/${t.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`Todoist error: ${res.status}`)
      haptic.success()
      onTaskUpdate({ id: t.id, content: editContent, priority: editPriority, description: editDesc, due: editDue ? { date: editDue } : t.due })
      setEditOpen(false)
    } catch { haptic.error() }
    finally { setSaving(false) }
  }

  return (
    <>
      <div className="border-b border-[#F3EDF7]">
        {/* Collapsed row */}
        <div
          className="flex items-center gap-2 px-3 py-2 select-none cursor-pointer"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onClick={handleTap}
        >
          <button
            onClick={(e) => { e.stopPropagation(); haptic.light(); setExpanded(false); setTaskIndex((i) => Math.max(0, i - 1)) }}
            disabled={idx === 0}
            className="text-[#79747E] disabled:opacity-25 p-0.5 flex-shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor">
              <path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/>
            </svg>
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-xs text-[#1C1B1F] leading-snug truncate">{t.content}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${PRIORITY_COLOURS[priority]}`}>{priority}</span>
              {t._projectName && <span className="text-[10px] text-[#79747E]">{t._projectName}</span>}
              {due && <span className="text-[10px] text-[#79747E]">{due}</span>}
              <span className="text-[10px] text-[#CAC4D0]">{idx + 1}/{active.length}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="#CAC4D0"
              className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
              <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z"/>
            </svg>
            <button
              onClick={(e) => { e.stopPropagation(); haptic.light(); setExpanded(false); setTaskIndex((i) => Math.min(active.length - 1, i + 1)) }}
              disabled={idx === active.length - 1}
              className="text-[#79747E] disabled:opacity-25 p-0.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor">
                <path d="M400-240 640-480 400-720l-56 56 184 184-184 184 56 56Z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Expanded detail */}
        <div style={{ maxHeight: expanded ? '200px' : '0', overflow: 'hidden', transition: 'max-height 0.25s cubic-bezier(0.4,0,0.2,1)' }}>
          <div className="px-3 pb-3 space-y-1.5">
            {t.description && <p className="text-xs text-[#49454F] leading-relaxed">{t.description}</p>}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {t.due?.date && <span className="text-xs text-[#79747E]">Due {fmtDate(t.due.date)}</span>}
              {t.due?.datetime && (
                <span className="text-xs text-[#79747E]">
                  at {new Date(t.due.datetime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {t.labels?.length > 0 && <span className="text-xs text-[#79747E]">{t.labels.join(', ')}</span>}
            </div>
            {t.url && (
              <a href={t.url} target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-[#6750A4] font-medium block">
                Open in Todoist ↗
              </a>
            )}
            <p className="text-[10px] text-[#CAC4D0]">Hold to edit</p>
          </div>
        </div>
      </div>

      <EditSheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit task" onSave={handleSave} saving={saving}>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[#49454F]">Task</label>
          <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={2}
            className="w-full rounded-xl border border-[#79747E] px-3 py-2 text-sm text-[#1C1B1F] focus:outline-none focus:border-[#6750A4] resize-none" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[#49454F]">Priority</label>
          <div className="flex gap-2">
            {[{label:'P1',val:4},{label:'P2',val:3},{label:'P3',val:2},{label:'P4',val:1}].map(({label,val}) => (
              <button key={val} onClick={() => setEditPriority(val)}
                className={`flex-1 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  editPriority === val ? 'bg-[#6750A4] text-white border-[#6750A4]' : 'border-[#CAC4D0] text-[#49454F]'
                }`}>{label}</button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[#49454F]">Due date</label>
          <input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)}
            className="w-full rounded-xl border border-[#79747E] px-3 py-2 text-sm text-[#1C1B1F] focus:outline-none focus:border-[#6750A4]" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[#49454F]">Notes</label>
          <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} placeholder="Add notes"
            className="w-full rounded-xl border border-[#79747E] px-3 py-2 text-sm text-[#1C1B1F] focus:outline-none focus:border-[#6750A4] resize-none" />
        </div>
      </EditSheet>
    </>
  )
}
