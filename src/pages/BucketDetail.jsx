import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProjectTasks, PROJECTS } from '../lib/todoist'
import { scoreTask, BUCKET_WEIGHTS } from '../lib/priority'
import { sendMessage, SYSTEM_PROMPTS } from '../lib/claude'
import Markdown from '../components/Markdown'
import { getDiscussions, deleteDiscussion } from '../lib/discussions'

const BUCKET_DESCRIPTIONS = {
  Finance:  'Investments, tax, budgets, and financial decisions.',
  Health:   'Physical health, fitness, medical, and mental wellbeing.',
  Work:     'Professional projects, Gensler, clients, and career.',
  Family:   'Family relationships, obligations, and shared goals.',
  Home:     'Property, maintenance, renovations, and household ops.',
  Personal: 'Personal growth, hobbies, learning, and interests.',
  Systems:  'Tools, automations, life OS, and productivity systems.',
}

const BUCKET_META = {
  Finance:  { emoji: '💰', bg: 'bg-[#C8F5E1]', text: 'text-[#002115]' },
  Health:   { emoji: '🏃', bg: 'bg-[#FFD8E4]', text: 'text-[#31111D]' },
  Home:     { emoji: '🏠', bg: 'bg-[#FFF0C8]', text: 'text-[#261900]' },
  Work:     { emoji: '💼', bg: 'bg-[#D3E4FF]', text: 'text-[#001D36]' },
  Family:   { emoji: '👨‍👩‍👧', bg: 'bg-[#FFE4F3]', text: 'text-[#31001D]' },
  Personal: { emoji: '✨', bg: 'bg-[#E8F5E9]', text: 'text-[#1B5E20]' },
  Systems:  { emoji: '⚙️', bg: 'bg-[#EADDFF]', text: 'text-[#21005D]' },
}

function HeadTab({ bucket, tasks }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const inputRef = useRef(null)
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text) return
    const userMsg = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setMessages((prev) => [...prev, { role: 'assistant', content: '…', pending: true }])
    try {
      const history = [...messages, userMsg]
        .filter((m) => !m.pending)
        .map(({ role, content }) => ({ role, content }))
      const reply = await sendMessage(history, SYSTEM_PROMPTS.head(bucket, tasks))
      setMessages((prev) => [...prev.slice(0, -1), { role: 'assistant', content: reply }])
    } catch (err) {
      setMessages((prev) => [...prev.slice(0, -1), { role: 'assistant', content: `Error: ${err.message}` }])
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <p className="text-sm text-[#49454F]">Chat with your {bucket} Head.</p>
            <p className="text-xs text-[#79747E] mt-1">{BUCKET_DESCRIPTIONS[bucket]}</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[#6750A4] text-white rounded-br-sm'
                : 'bg-white border border-[#CAC4D0] text-[#1C1B1F] rounded-bl-sm'
            }`}>
              {msg.role === 'assistant' ? <Markdown text={msg.content} /> : msg.content}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="bg-white border-t border-[#CAC4D0] px-4 pt-3 pb-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder={`Ask your ${bucket} Head…`}
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-[#79747E] px-3 py-2 text-sm text-[#1C1B1F] placeholder:text-[#B0A8BC] focus:outline-none focus:border-[#6750A4] leading-relaxed"
            style={{ maxHeight: '96px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#6750A4] disabled:bg-[#CAC4D0] transition-colors flex-shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="white">
              <path d="M120-160v-640l760 320-760 320Zm80-120 474-200-474-200v140l240 60-240 60v140Zm0 0v-400 400Z" />
            </svg>
          </button>
        </div>
      </div>
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
              <div key={d.id} className="relative">
                <button
                  onClick={() => navigate(`/buckets/${bucket}/discussions/${d.id}`)}
                  className="w-full text-left bg-white border border-[#CAC4D0] rounded-2xl p-4 hover:border-[#6750A4] transition-colors pr-10"
                >
                  <p className="text-sm font-medium text-[#1C1B1F]">{d.title}</p>
                  <p className="text-xs text-[#79747E] mt-0.5">
                    {d.messages.length} message{d.messages.length !== 1 ? 's' : ''} · {new Date(d.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </p>
                </button>
                <button
                  onClick={(e) => handleDelete(e, d.id)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#CAC4D0] hover:text-red-400 p-1 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor">
                    <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="px-4 pb-4 pt-2 border-t border-[#CAC4D0] bg-white">
        <button
          onClick={() => navigate(`/buckets/${bucket}/discussions/new`)}
          className="w-full py-2.5 rounded-full bg-[#6750A4] text-white text-sm font-medium hover:bg-[#5B4397] transition-colors"
        >
          + New discussion
        </button>
      </div>
    </div>
  )
}

function TasksTab({ tasks, loading, onComplete }) {
  const scored = tasks
    .map((t) => ({ ...t, _scored: scoreTask(t) }))
    .filter((t) => t._scored.score >= 0)
    .sort((a, b) => b._scored.score - a._scored.score)
  const someday = tasks.filter((t) => scoreTask(t).score === -1)

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

  if (!scored.length && !someday.length) return (
    <div className="text-center py-10">
      <p className="text-sm text-[#49454F]">No tasks in this bucket.</p>
    </div>
  )

  return (
    <div className="overflow-y-auto h-full px-4 py-3">
      {scored.map((task) => {
        const { isOverdue, isToday, days, bucket: b } = task._scored
        return (
          <TaskItem key={task.id} task={task} isOverdue={isOverdue} isToday={isToday} days={days} onComplete={onComplete} />
        )
      })}
      {someday.length > 0 && (
        <div className="bg-[#F3EDF7] rounded-xl px-4 py-2.5 mt-3">
          <p className="text-xs text-[#49454F]">
            <span className="font-semibold text-[#6750A4]">{someday.length} someday</span> — no date, P4.
          </p>
        </div>
      )}
    </div>
  )
}

function TaskItem({ task, isOverdue, isToday, days, onComplete }) {
  const [completing, setCompleting] = useState(false)

  async function handleComplete() {
    setCompleting(true)
    try {
      const { closeTask } = await import('../lib/todoist')
      await closeTask(task.id)
      onComplete(task.id)
    } catch { setCompleting(false) }
  }

  return (
    <div className={`flex items-start gap-3 py-3 border-b border-[#F3EDF7] last:border-0 transition-opacity ${completing ? 'opacity-20' : ''}`}>
      <button
        onClick={handleComplete}
        disabled={completing}
        className="w-5 h-5 rounded-full border-2 border-[#CAC4D0] hover:border-[#6750A4] hover:bg-[#EADDFF] flex-shrink-0 mt-0.5 transition-colors"
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${isOverdue ? 'text-red-900' : 'text-[#1C1B1F]'}`}>{task.content}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {task.priority === 4 && <span className="text-xs font-semibold text-red-700 bg-[#FFD8E4] px-1.5 py-0.5 rounded">P1</span>}
          {task.priority === 3 && <span className="text-xs font-semibold text-amber-800 bg-[#FFF0C8] px-1.5 py-0.5 rounded">P2</span>}
          {isOverdue && <span className="text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Overdue</span>}
          {isToday && !isOverdue && <span className="text-xs font-semibold text-[#6750A4] bg-[#EADDFF] px-1.5 py-0.5 rounded">Today</span>}
          {days === 1 && <span className="text-xs font-semibold text-[#49454F] bg-[#E7E0EC] px-1.5 py-0.5 rounded">Tomorrow</span>}
          {task.due?.date && days > 1 && <span className="text-xs text-[#79747E]">{task.due.date}</span>}
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
  const [loading, setLoading] = useState(true)

  const projectId = PROJECTS[bucket]

  useEffect(() => {
    if (!projectId) return
    getProjectTasks(projectId)
      .then((data) => data.map((t) => ({ ...t, _projectName: bucket })))
      .then(setTasks)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-[#49454F]">Unknown bucket.</p>
        <button onClick={() => navigate('/buckets')} className="text-xs text-[#6750A4]">← Back</button>
      </div>
    )
  }

  function removeTask(id) { setTasks((prev) => prev.filter((t) => t.id !== id)) }

  const weight = BUCKET_WEIGHTS[bucket] ?? 5
  const open = tasks.filter((t) => !t.is_completed)
  const overdue = open.filter((t) => scoreTask(t).isOverdue).length
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
        <div className="flex gap-0">
          {[
            { id: 'tasks', label: 'Tasks' },
            { id: 'head', label: 'Head' },
            { id: 'discussions', label: 'Discussions' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? 'border-current opacity-100'
                  : 'border-transparent opacity-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'tasks' && <TasksTab tasks={tasks} loading={loading} onComplete={removeTask} />}
        {tab === 'head' && <HeadTab bucket={bucket} tasks={tasks} />}
        {tab === 'discussions' && <DiscussionsTab bucket={bucket} tasks={tasks} />}
      </div>
    </div>
  )
}
