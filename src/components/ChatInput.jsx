import { useRef, useState, useEffect } from 'react'
import { haptic } from '../lib/haptic'

const ACCEPTED_FILE    = 'application/pdf,.doc,.docx,.txt'
const ACCEPTED_IMAGE   = 'image/jpeg,image/png,image/gif,image/webp'

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

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
  const [attachOpen, setAttachOpen] = useState(false)
  const [recording, setRecording]   = useState(false)

  const internalRef    = useRef(null)
  const textareaRef    = externalRef ?? internalRef
  const fileRef        = useRef(null)
  const imageRef       = useRef(null)
  const cameraRef      = useRef(null)
  const holdTimer      = useRef(null)
  const recognitionRef = useRef(null)
  const isHoldRef      = useRef(false)

  // Clean up on unmount
  useEffect(() => () => {
    clearTimeout(holdTimer.current)
    recognitionRef.current?.abort()
  }, [])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    haptic.light()
    setLoading(true)
    setAttachOpen(false)
    try {
      const data = await fileToBase64(file)
      const preview = file.type.startsWith('image/') ? `data:${file.type};base64,${data}` : null
      setAttachment({ name: file.name, mediaType: file.type, data, preview })
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  async function doSend() {
    const text = input.trim()
    if (!text && !attachment) return
    haptic.medium()
    const content = buildContent(text, attachment)
    onSend(content, attachment?.name ?? null)
    setInput('')
    setAttachment(null)
  }

  // Voice recording via Web Speech API
  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    haptic.medium()
    setRecording(true)
    const r = new SR()
    r.continuous = false
    r.interimResults = true
    r.lang = 'en-GB'
    r.onresult = (ev) => {
      const transcript = Array.from(ev.results).map((res) => res[0].transcript).join('')
      setInput(transcript)
    }
    r.onend = () => setRecording(false)
    r.onerror = () => setRecording(false)
    recognitionRef.current = r
    r.start()
  }

  function stopVoice() {
    recognitionRef.current?.stop()
    setRecording(false)
  }

  function handleSendPointerDown(e) {
    e.preventDefault()
    isHoldRef.current = false
    holdTimer.current = setTimeout(() => {
      isHoldRef.current = true
      startVoice()
    }, 350)
  }

  function handleSendPointerUp(e) {
    e.preventDefault()
    clearTimeout(holdTimer.current)
    if (recording) {
      stopVoice()
    } else if (!isHoldRef.current) {
      doSend()
    }
    isHoldRef.current = false
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
          <button onClick={() => { haptic.light(); setAttachment(null) }} className="text-[#79747E] hover:text-red-400 flex-shrink-0 p-1">
            <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
              <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
            </svg>
          </button>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-1.5">
        {/* Plus / close toggle */}
        <button
          onClick={() => { haptic.light(); setAttachOpen((x) => !x) }}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-[#F3EDF7] text-[#6750A4] hover:bg-[#EADDFF] flex-shrink-0"
          style={{ transform: attachOpen ? 'rotate(45deg)' : 'rotate(0deg)', transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1)' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor">
            <path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/>
          </svg>
        </button>

        {/* Inline attach icons — slide in when open */}
        <div style={{
          maxWidth: attachOpen ? '120px' : '0',
          overflow: 'hidden',
          transition: 'max-width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}>
          <div className="flex gap-1.5 pr-1.5">
            {/* File */}
            <button onClick={() => { fileRef.current?.click(); haptic.light() }} disabled={loading} title="File"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-[#F3EDF7] text-[#6750A4] hover:bg-[#EADDFF] flex-shrink-0 disabled:opacity-50">
              <svg xmlns="http://www.w3.org/2000/svg" height="17" viewBox="0 -960 960 960" width="17" fill="currentColor">
                <path d="M320-240h320v-80H320v80Zm0-160h320v-80H320v80ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z"/>
              </svg>
            </button>
            <input ref={fileRef} type="file" accept={ACCEPTED_FILE} onChange={handleFile} className="hidden" />

            {/* Image from gallery */}
            <button onClick={() => { imageRef.current?.click(); haptic.light() }} disabled={loading} title="Image from gallery"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-[#F3EDF7] text-[#6750A4] hover:bg-[#EADDFF] flex-shrink-0 disabled:opacity-50">
              <svg xmlns="http://www.w3.org/2000/svg" height="17" viewBox="0 -960 960 960" width="17" fill="currentColor">
                <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm40-80h480L570-480 450-320l-90-120-120 160Zm-40 80v-560 560Z"/>
              </svg>
            </button>
            <input ref={imageRef} type="file" accept={ACCEPTED_IMAGE} onChange={handleFile} className="hidden" />

            {/* Camera */}
            <button onClick={() => { cameraRef.current?.click(); haptic.light() }} disabled={loading} title="Camera"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-[#F3EDF7] text-[#6750A4] hover:bg-[#EADDFF] flex-shrink-0 disabled:opacity-50">
              <svg xmlns="http://www.w3.org/2000/svg" height="17" viewBox="0 -960 960 960" width="17" fill="currentColor">
                <path d="M480-260q75 0 127.5-52.5T660-440q0-75-52.5-127.5T480-620q-75 0-127.5 52.5T300-440q0 75 52.5 127.5T480-260Zm0-80q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29ZM160-120q-33 0-56.5-23.5T80-200v-480q0-33 23.5-56.5T160-760h126l74-80h240l74 80h126q33 0 56.5 23.5T880-680v480q0 33-23.5 56.5T800-120H160Z"/>
              </svg>
            </button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
          </div>
        </div>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend() } }}
          placeholder={recording ? 'Listening…' : placeholder}
          rows={1}
          className="flex-1 resize-none rounded-2xl border border-[#79747E] px-3 py-2 text-sm text-[#1C1B1F] placeholder:text-[#B0A8BC] focus:outline-none focus:border-[#6750A4] leading-relaxed"
          style={{ maxHeight: '96px' }}
        />

        {/* Send / voice button */}
        <button
          onPointerDown={handleSendPointerDown}
          onPointerUp={handleSendPointerUp}
          onPointerLeave={() => { clearTimeout(holdTimer.current); if (recording) stopVoice() }}
          disabled={!canSend && !recording}
          className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors flex-shrink-0 select-none touch-none ${
            recording ? 'bg-red-500 animate-pulse' : canSend ? 'bg-[#6750A4]' : 'bg-[#CAC4D0]'
          }`}
        >
          {recording ? (
            <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="white">
              <path d="M480-400q-50 0-85-35t-35-85v-240q0-50 35-85t85-35q50 0 85 35t35 85v240q0 50-35 85t-85 35Zm0-240Zm-40 520v-123q-104-14-172-93t-68-184h80q0 83 58.5 141.5T480-320q83 0 141.5-58.5T680-520h80q0 105-68 184t-172 93v123h-80Z"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="white">
              <path d="M120-160v-640l760 320-760 320Zm80-120 474-200-474-200v140l240 60-240 60v140Zm0 0v-400 400Z" />
            </svg>
          )}
        </button>
      </div>

      {recording && (
        <p className="text-xs text-red-500 text-center mt-1.5 animate-pulse">Recording… release to send</p>
      )}
    </div>
  )
}
