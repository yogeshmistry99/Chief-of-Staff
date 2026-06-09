import { useState } from 'react'

const SUGGESTED_PROMPTS = [
  "What should I focus on today?",
  "Show me all P1 tasks",
  "Give me a weekly overview",
  "What quick wins can I do in 30 min?",
]

export default function Chat() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! I'm your Life OS assistant. Connect your Claude API key in Settings and I'll help you manage tasks, plan your day, and stay on top of your life.",
    },
  ])

  function handleSend() {
    const text = input.trim()
    if (!text) return
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    // API connection wired up in a future step
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "Claude API not connected yet. Add your API key in Settings to enable AI responses.",
        },
      ])
    }, 500)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-6 pb-3 border-b border-[#CAC4D0] bg-white">
        <h1 className="text-2xl font-semibold text-[#1C1B1F]">Chat</h1>
        <p className="text-xs text-[#49454F] mt-0.5">Powered by Claude</p>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#6750A4] text-white rounded-br-sm'
                  : 'bg-white border border-[#CAC4D0] text-[#1C1B1F] rounded-bl-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Suggested prompts shown when only the welcome message is present */}
        {messages.length === 1 && (
          <div className="space-y-2 pt-2">
            <p className="text-xs text-[#49454F] font-medium px-1">Try asking:</p>
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => setInput(prompt)}
                className="w-full text-left text-sm px-4 py-2.5 rounded-xl bg-[#EADDFF] text-[#21005D] hover:bg-[#D8CBFF] transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="px-4 py-3 bg-white border-t border-[#CAC4D0] safe-bottom">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything…"
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-[#79747E] px-4 py-2.5 text-sm text-[#1C1B1F] placeholder:text-[#79747E] focus:outline-none focus:border-[#6750A4] leading-relaxed"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#6750A4] disabled:bg-[#CAC4D0] transition-colors flex-shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="white">
              <path d="M120-160v-640l760 320-760 320Zm80-120 474-200-474-200v140l240 60-240 60v140Zm0 0v-400 400Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
