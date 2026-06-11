import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getAllTasks, PROJECTS } from '../lib/todoist'
import { sendMessageStream, SYSTEM_PROMPTS } from '../lib/claude'
import { loadHeadConfig } from '../lib/headConfig'
import { haptic } from '../lib/haptic'
import Markdown from '../components/Markdown'
import ChatInput from '../components/ChatInput'
import TaskEditSheet from '../components/TaskEditSheet'

const PROJECT_NAMES = Object.fromEntries(Object.entries(PROJECTS).map(([name, id]) => [id, name]))

export default function ChiefPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [tasks, setTasks] = useState([])
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

      {/* Input */}
      <div className="bg-white border-t border-[#CAC4D0] px-4 pt-3 pb-3 flex-shrink-0">
        <ChatInput
          placeholder="Message your Chief of Staff…"
          onSend={handleSend}
          textareaRef={inputRef}
        />
      </div>
    </div>
  )
}

