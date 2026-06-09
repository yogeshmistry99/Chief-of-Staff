import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

export default function DiscussionThread() {
  const { bucket, id } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const [title, setTitle] = useState(isNew ? '' : 'Discussion')
  const [editingTitle, setEditingTitle] = useState(isNew)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const inputRef = useRef(null)
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { if (isNew) inputRef.current?.focus() }, [isNew])

  function handleSend() {
    const text = input.trim()
    if (!text) return
    if (isNew && !title.trim()) return
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    setTimeout(() => {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `${bucket} Head is not yet connected. Add VITE_ANTHROPIC_API_KEY in Settings to enable AI responses.`,
      }])
    }, 400)
  }

  function handleArchive() {
    navigate(`/buckets/${bucket}`)
  }

  function handleAddToTasks() {
    // Future: parse last assistant message for task suggestions and add to Todoist
    alert('Add to tasks — coming soon.')
  }

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
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => { if (title.trim()) setEditingTitle(false) }}
                onKeyDown={(e) => { if (e.key === 'Enter' && title.trim()) { setEditingTitle(false); inputRef.current?.focus() } }}
                placeholder="Discussion title…"
                className="w-full text-lg font-semibold text-[#1C1B1F] bg-transparent border-b border-[#6750A4] focus:outline-none pb-0.5"
              />
            ) : (
              <button onClick={() => setEditingTitle(true)} className="text-left w-full">
                <h1 className="text-lg font-semibold text-[#1C1B1F] truncate">{title || 'Untitled'}</h1>
              </button>
            )}
            <p className="text-xs text-[#79747E]">{bucket} · Discussion</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={handleAddToTasks}
              className="text-xs font-medium px-3 py-1.5 rounded-full bg-[#EADDFF] text-[#6750A4] hover:bg-[#D8CBFF] transition-colors"
            >
              + Task
            </button>
            <button
              onClick={handleArchive}
              className="text-xs font-medium px-3 py-1.5 rounded-full bg-[#F3EDF7] text-[#49454F] hover:bg-[#E7E0EC] transition-colors"
            >
              Archive
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
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-[#CAC4D0] px-4 pt-3 pb-3">
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
            disabled={!input.trim() || (isNew && !title.trim())}
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
