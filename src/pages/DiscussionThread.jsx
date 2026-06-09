import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProjectTasks, PROJECTS } from '../lib/todoist'
import { sendMessage, SYSTEM_PROMPTS } from '../lib/claude'
import { getDiscussions, saveDiscussion, newDiscussion } from '../lib/discussions'
import Markdown from '../components/Markdown'

export default function DiscussionThread() {
  const { bucket, id } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'

  // Load existing discussion or initialise a new one
  const [discussion, setDiscussion] = useState(() => {
    if (isNew) return newDiscussion('')
    return getDiscussions(bucket).find((d) => d.id === id) ?? null
  })

  const [editingTitle, setEditingTitle] = useState(isNew)
  const [input, setInput] = useState('')
  const [tasks, setTasks] = useState([])
  const inputRef = useRef(null)
  const endRef = useRef(null)

  useEffect(() => {
    const projectId = PROJECTS[bucket]
    if (!projectId) return
    getProjectTasks(projectId)
      .then((data) => setTasks(data.map((t) => ({ ...t, _projectName: bucket }))))
      .catch(() => {})
  }, [bucket])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [discussion?.messages])
  useEffect(() => { if (isNew) inputRef.current?.focus() }, [isNew])

  function updateDiscussion(updates) {
    setDiscussion((prev) => {
      const next = { ...prev, ...updates, updatedAt: new Date().toISOString() }
      saveDiscussion(bucket, next)
      return next
    })
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || !discussion?.title?.trim()) return
    const userMsg = { role: 'user', content: text }
    const withUser = [...(discussion.messages ?? []), userMsg]
    updateDiscussion({ messages: [...withUser, { role: 'assistant', content: '…', pending: true }] })
    setInput('')
    try {
      const history = withUser.map(({ role, content }) => ({ role, content }))
      const reply = await sendMessage(history, SYSTEM_PROMPTS.discussion(bucket, discussion.title, tasks))
      updateDiscussion({ messages: [...withUser, { role: 'assistant', content: reply }] })
    } catch (err) {
      updateDiscussion({ messages: [...withUser, { role: 'assistant', content: `Error: ${err.message}` }] })
    }
  }

  if (!discussion) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-[#49454F]">Discussion not found.</p>
        <button onClick={() => navigate(`/buckets/${bucket}`)} className="text-xs text-[#6750A4]">← Back</button>
      </div>
    )
  }

  const messages = discussion.messages ?? []

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-[#CAC4D0] px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/buckets/${bucket}`)} className="text-[#6750A4] p-1 -ml-1 flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
              <path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                autoFocus
                value={discussion.title}
                onChange={(e) => setDiscussion((prev) => ({ ...prev, title: e.target.value }))}
                onBlur={() => { if (discussion.title.trim()) { updateDiscussion({}); setEditingTitle(false) } }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && discussion.title.trim()) {
                    updateDiscussion({})
                    setEditingTitle(false)
                    inputRef.current?.focus()
                  }
                }}
                placeholder="Discussion title…"
                className="w-full text-lg font-semibold text-[#1C1B1F] bg-transparent border-b border-[#6750A4] focus:outline-none pb-0.5"
              />
            ) : (
              <button onClick={() => setEditingTitle(true)} className="text-left w-full">
                <h1 className="text-lg font-semibold text-[#1C1B1F] truncate">{discussion.title || 'Untitled'}</h1>
              </button>
            )}
            <p className="text-xs text-[#79747E]">{bucket} · Discussion</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => alert('Add to tasks — coming soon.')}
              className="text-xs font-medium px-3 py-1.5 rounded-full bg-[#EADDFF] text-[#6750A4] hover:bg-[#D8CBFF] transition-colors"
            >
              + Task
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <p className="text-sm text-[#49454F]">Start the discussion below.</p>
            <p className="text-xs text-[#79747E] mt-1">Decisions from this thread can be added directly to your task list.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[#6750A4] text-white rounded-br-sm'
                : 'bg-white border border-[#CAC4D0] text-[#1C1B1F] rounded-bl-sm'
            } ${msg.pending ? 'opacity-50' : ''}`}>
              {msg.role === 'assistant' ? <Markdown text={msg.content} /> : msg.content}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-[#CAC4D0] px-4 pt-3 pb-3">
        {editingTitle && (
          <p className="text-xs text-[#79747E] mb-2">Enter a title above first, then start the discussion.</p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Continue the discussion…"
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-[#79747E] px-3 py-2 text-sm text-[#1C1B1F] placeholder:text-[#B0A8BC] focus:outline-none focus:border-[#6750A4] leading-relaxed"
            style={{ maxHeight: '96px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !discussion.title.trim()}
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
