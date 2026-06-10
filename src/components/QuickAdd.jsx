import { useState, useRef, useEffect } from 'react'
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

export default function QuickAdd() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [entered, setEntered] = useState(false)
  const [content, setContent] = useState('')
  const [bucket, setBucket] = useState('Work')
  const [priority, setPriority] = useState(1)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const inputRef = useRef(null)

  function openSheet() {
    haptic.light()
    setContent('')
    setSaved(false)
    setMounted(true)
    setOpen(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)))
  }

  function closeSheet() {
    setEntered(false)
    setTimeout(() => { setMounted(false); setOpen(false) }, 280)
  }

  useEffect(() => {
    if (entered) setTimeout(() => inputRef.current?.focus(), 80)
  }, [entered])

  async function handleSubmit() {
    if (!content.trim()) return
    setSaving(true)
    try {
      await fetch('/api/todoist?path=tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim(),
          priority,
          project_id: PROJECTS[bucket],
        }),
      })
      haptic.success()
      setSaved(true)
      setTimeout(closeSheet, 600)
    } catch {
      haptic.error()
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
    if (e.key === 'Escape') closeSheet()
  }

  return (
    <>
      {/* FAB */}
      <button
        onClick={openSheet}
        className="w-14 h-14 rounded-full bg-[#6750A4] text-white shadow-lg flex items-center justify-center active:scale-90 transition-transform"
        style={{ boxShadow: '0 4px 14px rgba(103,80,164,0.4)' }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
          <path d="M440-280h80v-160h160v-80H520v-160h-80v160H280v80h160v160Z"/>
        </svg>
      </button>

      {mounted && createPortal(
        <div className="fixed inset-0 z-50" style={{ pointerEvents: entered ? 'auto' : 'none' }}>
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            style={{ opacity: entered ? 1 : 0, transition: 'opacity 0.28s ease' }}
            onClick={closeSheet}
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

            <h2 className="text-base font-semibold text-[#1C1B1F] mb-4">Quick add task</h2>

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

            {/* Bucket picker */}
            <p className="text-xs font-medium text-[#49454F] mb-2">Bucket</p>
            <div className="flex gap-2 flex-wrap mb-3">
              {BUCKETS.map((b) => (
                <button key={b} onClick={() => setBucket(b)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    bucket === b ? 'bg-[#6750A4] text-white' : 'bg-[#F3EDF7] text-[#49454F]'
                  }`}>
                  <span>{BUCKET_META[b]?.emoji}</span>{b}
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
      )}
    </>
  )
}
