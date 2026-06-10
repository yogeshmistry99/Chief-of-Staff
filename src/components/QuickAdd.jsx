import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/haptic'
import { PROJECTS } from '../lib/todoist'

const BUCKET_META = {
  Finance:  { emoji: '💰' },
  Health:   { emoji: '🏃' },
  Home:     { emoji: '🏠' },
  Work:     { emoji: '💼' },
  Family:   { emoji: '👨‍👩‍👧' },
  Personal: { emoji: '✨' },
  Systems:  { emoji: '⚙️' },
}

const BUCKETS = Object.keys(PROJECTS)

// open/onClose controlled by parent
export default function QuickAdd({ open, onClose }) {
  const [mounted, setMounted] = useState(false)
  const [entered, setEntered] = useState(false)
  const [content, setContent] = useState('')
  const [bucket, setBucket] = useState('Work')
  const [priority, setPriority] = useState(1)
  const [attachment, setAttachment] = useState(null) // { name, dataUrl, type }
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const inputRef = useRef(null)
  const fileRef = useRef(null)
  const galleryRef = useRef(null)
  const cameraRef = useRef(null)

  useEffect(() => {
    if (open) {
      setContent('')
      setAttachment(null)
      setSaved(false)
      setMounted(true)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setEntered(true)
        setTimeout(() => inputRef.current?.focus(), 80)
      }))
    } else {
      setEntered(false)
      const t = setTimeout(() => setMounted(false), 280)
      return () => clearTimeout(t)
    }
  }, [open])

  function handleClose() {
    setEntered(false)
    setTimeout(() => { setMounted(false); onClose?.() }, 280)
  }

  function handleAttachFile(e, source) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (ev) => setAttachment({ name: file.name, dataUrl: ev.target.result, type: 'image' })
      reader.readAsDataURL(file)
    } else {
      setAttachment({ name: file.name, dataUrl: null, type: 'file' })
    }
    e.target.value = ''
  }

  async function handleSubmit() {
    if (!content.trim()) return
    setSaving(true)
    try {
      const desc = attachment ? `[Attachment: ${attachment.name}]` : undefined
      await fetch('/api/todoist?path=tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim(),
          priority,
          project_id: PROJECTS[bucket],
          ...(desc ? { description: desc } : {}),
        }),
      })
      haptic.success()
      setSaved(true)
      setTimeout(handleClose, 600)
    } catch {
      haptic.error()
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
    if (e.key === 'Escape') handleClose()
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        style={{ opacity: entered ? 1 : 0, transition: 'opacity 0.28s ease' }}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl px-4 pt-4 pb-6 max-w-lg mx-auto"
        style={{
          transform: entered ? 'translateY(0)' : 'translateY(102%)',
          transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        {/* Handle */}
        <div className="w-9 h-1 bg-[#CAC4D0] rounded-full mx-auto mb-4" />

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-[#1C1B1F]">Quick add task</h2>
          <button onClick={handleClose} className="text-[#79747E] p-1 -mr-1">
            <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
              <path d="M480-424 284-228q-11 11-28 11t-28-11q-11-11-11-28t11-28l196-196-196-196q-11-11-11-28t11-28q11-11 28-11t28 11l196 196 196-196q11-11 28-11t28 11q11 11 11 28t-11 28L536-480l196 196q11 11 11 28t-11 28q-11 11-28 11t-28-11L480-424Z"/>
            </svg>
          </button>
        </div>

        {/* Task input */}
        <textarea
          ref={inputRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What needs to be done?"
          rows={2}
          className="w-full rounded-xl border border-[#CAC4D0] px-3 py-2.5 text-sm text-[#1C1B1F] focus:outline-none focus:border-[#6750A4] resize-none mb-3"
        />

        {/* Attachment preview */}
        {attachment && (
          <div className="flex items-center gap-2 mb-3 bg-[#F3EDF7] rounded-xl px-3 py-2">
            {attachment.type === 'image' && attachment.dataUrl
              ? <img src={attachment.dataUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
              : <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="#6750A4"><path d="M320-240h320v-80H320v80Zm0-160h320v-80H320v80ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z"/></svg>
            }
            <span className="text-xs text-[#1C1B1F] flex-1 truncate">{attachment.name}</span>
            <button onClick={() => setAttachment(null)} className="text-[#79747E] flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
                <path d="M480-424 284-228q-11 11-28 11t-28-11q-11-11-11-28t11-28l196-196-196-196q-11-11-11-28t11-28q11-11 28-11t28 11l196 196 196-196q11-11 28-11t28 11q11 11 11 28t-11 28L536-480l196 196q11 11 11 28t-11 28q-11 11-28 11t-28-11L480-424Z"/>
              </svg>
            </button>
          </div>
        )}

        {/* Attach buttons */}
        <div className="flex gap-2 mb-4">
          <button onClick={() => galleryRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F3EDF7] text-xs text-[#49454F] font-medium">
            <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
              <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm40-80h480L570-480 450-320l-90-120-120 160Zm-40 80v-560 560Z"/>
            </svg>
            Gallery
          </button>
          <button onClick={() => cameraRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F3EDF7] text-xs text-[#49454F] font-medium">
            <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
              <path d="M480-260q75 0 127.5-52.5T660-440q0-75-52.5-127.5T480-620q-75 0-127.5 52.5T300-440q0 75 52.5 127.5T480-260Zm0-80q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29ZM160-120q-33 0-56.5-23.5T80-200v-480q0-33 23.5-56.5T160-760h126l74-80h240l74 80h126q33 0 56.5 23.5T880-680v480q0 33-23.5 56.5T800-120H160Zm0-80h640v-480H638l-73-80H395l-73 80H160v480Zm320-240Z"/>
            </svg>
            Camera
          </button>
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F3EDF7] text-xs text-[#49454F] font-medium">
            <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
              <path d="M320-240h320v-80H320v80Zm0-160h320v-80H320v80ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z"/>
            </svg>
            File
          </button>
        </div>

        {/* Hidden file inputs */}
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleAttachFile(e, 'gallery')} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleAttachFile(e, 'camera')} />
        <input ref={fileRef} type="file" accept=".pdf,.txt,.doc,.docx,.csv" className="hidden" onChange={(e) => handleAttachFile(e, 'file')} />

        {/* Bucket picker */}
        <p className="text-xs font-medium text-[#49454F] mb-2">Bucket</p>
        <div className="flex gap-2 flex-wrap mb-3">
          {BUCKETS.map((b) => (
            <button key={b} onClick={() => setBucket(b)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                bucket === b ? 'bg-[#6750A4] text-white' : 'bg-[#F3EDF7] text-[#49454F]'
              }`}>
              {BUCKET_META[b]?.emoji} {b}
            </button>
          ))}
        </div>

        {/* Priority picker */}
        <p className="text-xs font-medium text-[#49454F] mb-2">Priority</p>
        <div className="flex gap-2 mb-5">
          {[{label:'P1',val:4},{label:'P2',val:3},{label:'P3',val:2},{label:'P4',val:1}].map(({label,val}) => (
            <button key={val} onClick={() => setPriority(val)}
              className={`flex-1 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                priority === val ? 'bg-[#6750A4] text-white border-[#6750A4]' : 'border-[#CAC4D0] text-[#49454F]'
              }`}>{label}</button>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving || !content.trim()}
          className={`w-full py-3 rounded-full text-sm font-semibold transition-colors ${
            saved ? 'bg-green-500 text-white' :
            saving || !content.trim() ? 'bg-[#E7E0EC] text-[#79747E]' :
            'bg-[#6750A4] text-white hover:bg-[#5B4397]'
          }`}
        >
          {saved ? '✓ Added' : saving ? 'Adding…' : 'Add task'}
        </button>
      </div>
    </div>,
    document.body
  )
}
