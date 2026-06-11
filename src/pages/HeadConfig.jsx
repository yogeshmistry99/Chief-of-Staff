import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { haptic } from '../lib/haptic'
import { loadHeadConfig, saveHeadConfig } from '../lib/headConfig'

const HEAD_LABELS = {
  Finance:  { emoji: '💰', role: 'Finance Head' },
  Health:   { emoji: '🏃', role: 'Health Head' },
  Home:     { emoji: '🏠', role: 'Home Head' },
  Work:     { emoji: '💼', role: 'Work Head' },
  Family:   { emoji: '👨‍👩‍👧', role: 'Family Head' },
  Personal: { emoji: '✨', role: 'Personal Head' },
  Systems:  { emoji: '⚙️', role: 'Systems Head' },
  chief:    { emoji: '🎯', role: 'Chief of Staff' },
}

export default function HeadConfig() {
  const params = useParams()
  // Works for /buckets/:bucket/config (param=bucket) and /chief/config (no param → 'chief')
  const key = params.bucket ?? 'chief'
  const navigate = useNavigate()
  const meta = HEAD_LABELS[key] ?? { emoji: '🤖', role: key }

  const initial = loadHeadConfig(key)
  const [instructions, setInstructions] = useState(initial.instructions)
  const [context, setContext] = useState(initial.context)
  const [files, setFiles] = useState(initial.files)
  const [saved, setSaved] = useState(false)
  const fileInputRef = useRef(null)
  const saveTimerRef = useRef(null)
  const tickTimerRef = useRef(null)
  // Track whether this is the first render so we don't auto-save on mount
  const isFirstRender = useRef(true)

  function triggerSave(newInstructions, newContext, newFiles) {
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveHeadConfig(key, { instructions: newInstructions, context: newContext, files: newFiles })
      haptic.success()
      setSaved(true)
      clearTimeout(tickTimerRef.current)
      tickTimerRef.current = setTimeout(() => setSaved(false), 2000)
    }, 800)
  }

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    triggerSave(instructions, context, files)
  }, [instructions, context, files])

  function handleFileUpload(e) {
    const picked = Array.from(e.target.files)
    picked.forEach((file) => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        setFiles((prev) => [...prev, { name: file.name, content: ev.target.result, size: file.size }])
      }
      reader.readAsText(file)
    })
    e.target.value = ''
  }

  function removeFile(i) {
    haptic.light()
    setFiles((prev) => prev.filter((_, j) => j !== i))
  }

  const totalChars = instructions.length + context.length + files.reduce((s, f) => s + f.content.length, 0)

  return (
    <div className="flex flex-col h-full bg-[#FFFBFE]">
      {/* Header */}
      <div className="bg-white border-b border-[#CAC4D0] px-4 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-[#6750A4] p-1 -ml-1 flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
              <path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/>
            </svg>
          </button>
          <span className="text-xl">{meta.emoji}</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-[#1C1B1F]">{meta.role} · Knowledge</h1>
            <p className="text-xs text-[#79747E]">Instructions, context and files injected into every conversation</p>
          </div>
          <span
            className="text-xs font-medium text-green-600 flex items-center gap-1 transition-opacity duration-500 flex-shrink-0"
            style={{ opacity: saved ? 1 : 0 }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 -960 960 960" width="14" fill="currentColor">
              <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/>
            </svg>
            Saved
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6 pb-6">

        {/* Instructions */}
        <section>
          <div className="mb-2">
            <h2 className="text-sm font-semibold text-[#1C1B1F]">Instructions</h2>
            <p className="text-xs text-[#79747E] mt-0.5">How this Head should behave — style, focus areas, constraints, and approach.</p>
          </div>
          <textarea
            value={instructions}
            onChange={(e) => { setInstructions(e.target.value); setSaved(false) }}
            placeholder={`e.g. "Always lead with tax implications. Prefer low-cost index funds. Flag anything that affects our retirement timeline..."`}
            rows={5}
            className="w-full rounded-xl border border-[#CAC4D0] px-3 py-2.5 text-sm text-[#1C1B1F] focus:outline-none focus:border-[#6750A4] resize-none bg-white"
          />
        </section>

        {/* Context */}
        <section>
          <div className="mb-2">
            <h2 className="text-sm font-semibold text-[#1C1B1F]">Context</h2>
            <p className="text-xs text-[#79747E] mt-0.5">Background knowledge — facts, goals, history this Head should always know.</p>
          </div>
          <textarea
            value={context}
            onChange={(e) => { setContext(e.target.value); setSaved(false) }}
            placeholder={`e.g. "Mortgage: £420k remaining at 4.2% fixed until 2027. Pension: Vanguard SIPP, target retirement at 55..."`}
            rows={6}
            className="w-full rounded-xl border border-[#CAC4D0] px-3 py-2.5 text-sm text-[#1C1B1F] focus:outline-none focus:border-[#6750A4] resize-none bg-white"
          />
        </section>

        {/* Files */}
        <section>
          <div className="mb-2">
            <h2 className="text-sm font-semibold text-[#1C1B1F]">Files</h2>
            <p className="text-xs text-[#79747E] mt-0.5">Upload documents this Head should reference — reports, statements, notes. Text files only.</p>
          </div>

          {files.length > 0 && (
            <div className="space-y-2 mb-3">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-3 bg-white border border-[#CAC4D0] rounded-xl px-3 py-2.5">
                  <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="#6750A4" className="flex-shrink-0">
                    <path d="M320-240h320v-80H320v80Zm0-160h320v-80H320v80ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z"/>
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#1C1B1F] truncate">{f.name}</p>
                    <p className="text-xs text-[#79747E]">{(f.content.length / 1000).toFixed(1)}k chars</p>
                  </div>
                  <button onClick={() => removeFile(i)} className="text-[#79747E] hover:text-red-500 transition-colors p-1">
                    <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor">
                      <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.csv,.json,.yaml,.html"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-2.5 rounded-xl border-2 border-dashed border-[#CAC4D0] text-sm text-[#49454F] hover:border-[#6750A4] hover:text-[#6750A4] transition-colors"
          >
            + Upload files
          </button>
        </section>

        {totalChars > 0 && (
          <p className="text-xs text-[#79747E]">~{Math.round(totalChars / 4)} tokens injected per conversation</p>
        )}
      </div>

    </div>
  )
}
