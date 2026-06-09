import { useRef, useState } from 'react'

const ACCEPTED = 'image/jpeg,image/png,image/gif,image/webp,application/pdf'

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Returns content suitable for the Claude API:
// plain string if no attachment, array of blocks if attachment present
export function buildContent(text, attachment) {
  if (!attachment) return text || ''
  const blocks = []
  if (attachment.mediaType === 'application/pdf') {
    blocks.push({ type: 'document', source: { type: 'base64', media_type: attachment.mediaType, data: attachment.data } })
  } else {
    blocks.push({ type: 'image', source: { type: 'base64', media_type: attachment.mediaType, data: attachment.data } })
  }
  if (text) blocks.push({ type: 'text', text })
  return blocks
}

export default function ChatInput({ placeholder, onSend, disabled, extraAbove, textareaRef: externalRef }) {
  const [input, setInput]           = useState('')
  const [attachment, setAttachment] = useState(null)
  const [loading, setLoading]       = useState(false)
  const internalRef = useRef(null)
  const textareaRef = externalRef ?? internalRef
  const fileRef = useRef(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const data = await fileToBase64(file)
      const preview = file.type.startsWith('image/') ? `data:${file.type};base64,${data}` : null
      setAttachment({ name: file.name, mediaType: file.type, data, preview })
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  async function handleSend() {
    const text = input.trim()
    if (!text && !attachment) return
    const content = buildContent(text, attachment)
    onSend(content, attachment?.name ?? null)
    setInput('')
    setAttachment(null)
  }

  const canSend = (input.trim() || attachment) && !disabled

  return (
    <div>
      {extraAbove}

      {/* Attachment preview */}
      {attachment && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-[#F3EDF7] rounded-xl">
          {attachment.preview ? (
            <img src={attachment.preview} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-[#EADDFF] flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="#6750A4">
                <path d="M360-460h240v-80H360v80Zm0 120h240v-80H360v80Zm-60 180q-33 0-56.5-23.5T220-240v-480q0-33 23.5-56.5T300-800h360q33 0 56.5 23.5T740-720v480q0 33-23.5 56.5T660-160H300Zm0-80h360v-480H300v480Zm0-480v480-480Z"/>
              </svg>
            </div>
          )}
          <p className="flex-1 min-w-0 text-xs text-[#1C1B1F] truncate">{attachment.name}</p>
          <button onClick={() => setAttachment(null)} className="text-[#79747E] hover:text-red-400 flex-shrink-0 p-1">
            <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
              <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
            </svg>
          </button>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        {/* Attachment button */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-[#F3EDF7] text-[#6750A4] hover:bg-[#EADDFF] transition-colors flex-shrink-0 disabled:opacity-50"
        >
          {loading ? (
            <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor" className="animate-spin">
              <path d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q17 0 28.5 11.5T520-840q0 17-11.5 28.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160q133 0 226.5-93.5T800-480q0-17 11.5-28.5T840-520q17 0 28.5 11.5T880-480q0 82-31.5 155t-86 127.5Q708-143 635-111.5T480-80Z"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor">
              <path d="M460-340v-320L380-580l-56-56 156-156 156 156-56 56-80-80v320h-40ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
            </svg>
          )}
        </button>
        <input ref={fileRef} type="file" accept={ACCEPTED} onChange={handleFile} className="hidden" />

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder={placeholder}
          rows={1}
          className="flex-1 resize-none rounded-2xl border border-[#79747E] px-3 py-2 text-sm text-[#1C1B1F] placeholder:text-[#B0A8BC] focus:outline-none focus:border-[#6750A4] leading-relaxed"
          style={{ maxHeight: '96px' }}
        />

        <button
          onClick={handleSend}
          disabled={!canSend}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-[#6750A4] disabled:bg-[#CAC4D0] transition-colors flex-shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="white">
            <path d="M120-160v-640l760 320-760 320Zm80-120 474-200-474-200v140l240 60-240 60v140Zm0 0v-400 400Z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
