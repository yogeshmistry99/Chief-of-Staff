import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/haptic'
import { getCachedTasks, saveToCache } from '../lib/taskCache'

const P_META = {
  4: { label: 'P1', color: '#DC2626', bg: '#FEF2F2' },
  3: { label: 'P2', color: '#F97316', bg: '#FFF7ED' },
  2: { label: 'P3', color: '#CA8A04', bg: '#FEFCE8' },
  1: { label: 'P4', color: '#9CA3AF', bg: '#F9FAFB' },
}

// Shared priority pill — colored badge with P label, hold to change
export function PriorityPill({ value, onChange, size = 'md' }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(null)
  const holdRef = useRef(null)
  const prevHovRef = useRef(null)

  const meta = P_META[value] ?? P_META[1]
  const pad = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'

  function onPointerDown(e) {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    holdRef.current = setTimeout(() => {
      haptic.medium()
      setOpen(true)
      setHovered(value)
      prevHovRef.current = value
    }, 300)
  }

  function onPointerMove(e) {
    if (!open) return
    const under = document.elementFromPoint(e.clientX, e.clientY)
    const opt = under?.closest('[data-prio]')
    if (!opt) return
    const p = parseInt(opt.dataset.prio)
    if (p !== prevHovRef.current) { haptic.light(); prevHovRef.current = p; setHovered(p) }
  }

  function onPointerUp(e) {
    clearTimeout(holdRef.current)
    if (open) {
      if (hovered !== null) onChange?.(hovered)
      setOpen(false); setHovered(null); prevHovRef.current = null
    }
  }

  return (
    <div className="relative inline-flex" style={{ touchAction: 'none' }}>
      <span
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        className={`${pad} rounded-full font-semibold select-none cursor-pointer`}
        style={{ color: meta.color, backgroundColor: meta.bg }}
      >
        {meta.label}
      </span>
      {open && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2.5 bg-white rounded-2xl shadow-2xl px-3 py-2 z-[60]"
          style={{ border: '1px solid #E7E0EC' }}>
          {[4, 3, 2, 1].map((p) => {
            const m = P_META[p]; const isHov = hovered === p
            return (
              <span
                key={p} data-prio={p}
                className="rounded-full font-bold select-none transition-all duration-100 flex items-center justify-center"
                style={{
                  width: isHov ? 34 : 26, height: isHov ? 34 : 26,
                  fontSize: isHov ? 11 : 9,
                  color: m.color, backgroundColor: m.bg,
                  border: `2px solid ${m.color}`,
                  boxShadow: isHov ? `0 0 0 3px ${m.color}30` : 'none',
                }}
              >{m.label}</span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── SubtaskList ──────────────────────────────────────────────────────────────
function SubtaskList({ subtasks, setSubtasks, onEditSubtask }) {
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  const dragRef = useRef(null)

  function onHandleDown(e, idx) {
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId)
    setDragIdx(idx); dragRef.current = idx; haptic.light()
  }
  function onHandleMove(e) {
    if (dragRef.current === null) return
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-sub-idx]')
    if (!row) return
    const idx = parseInt(row.dataset.subIdx)
    if (idx !== overIdx) { haptic.light(); setOverIdx(idx) }
  }
  function onHandleUp() {
    if (dragRef.current !== null && overIdx !== null && overIdx !== dragRef.current) {
      setSubtasks((prev) => {
        const arr = [...prev]; const [item] = arr.splice(dragRef.current, 1)
        arr.splice(overIdx, 0, item); return arr
      })
    }
    dragRef.current = null; setDragIdx(null); setOverIdx(null)
  }

  return (
    <div>
      {subtasks.map((sub, i) => (
        <div key={sub.id} data-sub-idx={i}
          className="flex items-center gap-2 py-2 border-b border-[#F3EDF7] last:border-0"
          style={{
            opacity: dragIdx === i ? 0.4 : 1,
            background: overIdx === i && dragIdx !== null ? '#F3EDF7' : 'transparent',
          }}>
          <div className="text-[#CAC4D0] flex-shrink-0 p-1 -ml-1 touch-none"
            onPointerDown={(e) => onHandleDown(e, i)}
            onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}
            style={{ touchAction: 'none', cursor: 'grab' }}>
            <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
              <path d="M360-160q-33 0-56.5-23.5T280-240q0-33 23.5-56.5T360-320q33 0 56.5 23.5T440-240q0 33-23.5 56.5T360-160Zm240 0q-33 0-56.5-23.5T520-240q0-33 23.5-56.5T600-320q33 0 56.5 23.5T680-240q0 33-23.5 56.5T600-160ZM360-440q-33 0-56.5-23.5T280-520q0-33 23.5-56.5T360-600q33 0 56.5 23.5T440-520q0 33-23.5 56.5T360-440Zm240 0q-33 0-56.5-23.5T520-520q0-33 23.5-56.5T600-600q33 0 56.5 23.5T680-520q0 33-23.5 56.5T600-440ZM360-720q-33 0-56.5-23.5T280-800q0-33 23.5-56.5T360-880q33 0 56.5 23.5T440-800q0 33-23.5 56.5T360-720Zm240 0q-33 0-56.5-23.5T520-800q0-33 23.5-56.5T600-880q33 0 56.5 23.5T680-800q0 33-23.5 56.5T600-720Z"/>
            </svg>
          </div>
          <span className="flex-1 text-sm text-[#1C1B1F] min-w-0 truncate">{sub.content}</span>
          <button onClick={() => onEditSubtask(sub)} className="text-[#79747E] p-1 flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
              <path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"/>
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
// tasks: optional array of all navigable tasks (enables left/right swipe nav)
// onNavigate: called with new index when user swipes between tasks
export default function TaskEditSheet({ open, onClose, task, allTasks = [], tasks, onNavigate, onSaved }) {
  // Sheet animation
  const [mounted, setMounted] = useState(false)
  const [entered, setEntered] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const sheetRef = useRef(null)
  const startYRef = useRef(0)
  const dragYRef = useRef(0)

  // Task navigation animation
  const [exitDir, setExitDir] = useState(null) // 'left'|'right'|null
  const [enterDir, setEnterDir] = useState(null)
  const [transitioning, setTransitioning] = useState(false)
  const swipeRef = useRef(null)
  // Field values for current task
  const [content, setContent] = useState('')
  const [priority, setPriority] = useState(1)
  const [due, setDue] = useState('')
  const [description, setDescription] = useState('')
  const [subtasks, setSubtasks] = useState([])
  const [newSubtask, setNewSubtask] = useState('')
  const [newSubtaskPriority, setNewSubtaskPriority] = useState(1)

  // Inline edit modes
  const [editingContent, setEditingContent] = useState(false)
  const [editingDue, setEditingDue] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [editingSubtask, setEditingSubtask] = useState(null)

  // Autosave
  const [autoSaved, setAutoSaved] = useState(false)
  const autoSaveRef = useRef(null)
  const autoSaveTickRef = useRef(null)

  // Save-button hold
  const saving = useRef(false)
  const holdSaveRef = useRef(null)

  const currentTaskRef = useRef(task)
  currentTaskRef.current = task

  // Sheet open/close animation
  useEffect(() => {
    if (open) {
      setDragY(0); dragYRef.current = 0
      setMounted(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)))
    }
  }, [open])
  useEffect(() => {
    if (!open && mounted) {
      setEntered(false)
      const t = setTimeout(() => { setMounted(false); setDragY(0); dragYRef.current = 0 }, 320)
      return () => clearTimeout(t)
    }
  }, [open])

  // Populate fields when task changes
  useEffect(() => {
    if (!task || !open) return
    setContent(task.content ?? '')
    setPriority(task.priority ?? 1)
    setDue(task.due?.date ?? '')
    setDescription(task.description ?? '')
    setSubtasks(allTasks.filter((t) => t.parent_id === task.id))
    setEditingContent(false); setEditingDue(false); setEditingDesc(false)
    setEditingSubtask(null); setNewSubtask(''); setNewSubtaskPriority(1)
    clearTimeout(autoSaveRef.current)
  }, [task?.id, open])

  // Autosave debounce when fields change
  const fieldsChanged = useRef(false)
  useEffect(() => {
    if (!task || !open) return
    if (!fieldsChanged.current) { fieldsChanged.current = true; return }
    clearTimeout(autoSaveRef.current)
    autoSaveRef.current = setTimeout(() => doSave(false), 1500)
  }, [content, priority, due, description])

  // Reset fieldsChanged when task changes
  useEffect(() => { fieldsChanged.current = false }, [task?.id])

  function dismiss() {
    const h = sheetRef.current?.offsetHeight ?? 600
    setEntered(false); setDragY(h)
    setTimeout(() => { setMounted(false); setDragY(0); dragYRef.current = 0; onClose() }, 300)
  }

  async function doSave(closeAfter = true) {
    if (!task || saving.current) return
    saving.current = true
    clearTimeout(autoSaveRef.current)
    try {
      const body = { content, priority, description }
      if (due) body.due_date = due
      const res = await fetch(`/api/todoist?path=tasks/${task.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      haptic.success()
      const savedTask = { ...task, content, priority, description, due: due ? { date: due } : task.due }
      onSaved?.(savedTask)
      // Update the task cache so edits persist to Supabase immediately
      const cached = getCachedTasks()
      const updated = cached.map((t) => t.id === task.id ? { ...t, content, priority, description, due: due ? { date: due } : task.due } : t)
      saveToCache(updated).catch(() => {})
      if (closeAfter) dismiss()
      else {
        setAutoSaved(true)
        clearTimeout(autoSaveTickRef.current)
        autoSaveTickRef.current = setTimeout(() => setAutoSaved(false), 2000)
      }
    } catch { haptic.error() }
    finally { saving.current = false }
  }

  // Drag handle for dismissing sheet
  function onHandleDown(e) {
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId)
    startYRef.current = e.clientY; dragYRef.current = 0; setIsDragging(true)
  }
  function onHandleMove(e) {
    const dy = Math.max(0, e.clientY - startYRef.current)
    dragYRef.current = dy; setDragY(dy)
  }
  function onHandleUp() {
    setIsDragging(false)
    const h = sheetRef.current?.offsetHeight ?? 600
    if (dragYRef.current > Math.min(h * 0.32, 140)) {
      setDragY(h + 40); setTimeout(() => { setMounted(false); setDragY(0); dragYRef.current = 0; onClose() }, 280)
    } else { setDragY(0); dragYRef.current = 0 }
  }

  // Left/right swipe between tasks in the content area
  function onContentTouchStart(e) {
    if (!tasks?.length) return
    const t = e.touches[0]
    swipeRef.current = { startX: t.clientX, startY: t.clientY, decided: false }
  }
  function onContentTouchMove(e) {
    const tr = swipeRef.current
    if (!tr || !tasks?.length) return
    const dx = e.touches[0].clientX - tr.startX
    const dy = e.touches[0].clientY - tr.startY
    if (!tr.decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      tr.decided = true; tr.horizontal = Math.abs(dx) > Math.abs(dy) * 1.3
    }
    if (tr.horizontal) e.preventDefault()
  }
  function onContentTouchEnd(e) {
    const tr = swipeRef.current; swipeRef.current = null
    if (!tr?.horizontal || !tasks?.length) return
    const dx = tr.startX - e.changedTouches[0].clientX
    const curIdx = tasks.findIndex((t) => t.id === task?.id)
    if (Math.abs(dx) > 70) {
      if (dx > 0 && curIdx < tasks.length - 1) swapTask(curIdx + 1, 'left')
      else if (dx < 0 && curIdx > 0) swapTask(curIdx - 1, 'right')
    }
  }

  function swapTask(newIdx, dir) {
    if (transitioning) return
    setTransitioning(true)
    setExitDir(dir)
    clearTimeout(autoSaveRef.current)
    doSave(false)
    setTimeout(() => {
      setExitDir(null)
      setEnterDir(dir === 'left' ? 'right' : 'left')
      onNavigate?.(newIdx)
      setTimeout(() => { setEnterDir(null); setTransitioning(false) }, 280)
    }, 240)
  }

  // Hold-to-save: long press = fanfare + dismiss, tap = normal save
  function onSaveDown(e) {
    holdSaveRef.current = setTimeout(() => {
      holdSaveRef.current = null
      haptic.fanfare()
      doSave(true)
    }, 400)
  }
  function onSaveUp(e) {
    if (holdSaveRef.current !== null) {
      clearTimeout(holdSaveRef.current); holdSaveRef.current = null
      doSave(true)
    }
  }

  async function saveSubtaskEdit() {
    if (!editingSubtask) return
    try {
      await fetch(`/api/todoist?path=tasks/${editingSubtask.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingSubtask.content }),
      })
      setSubtasks((prev) => prev.map((s) => s.id === editingSubtask.id ? { ...s, content: editingSubtask.content } : s))
      haptic.success()
    } catch { haptic.error() }
    finally { setEditingSubtask(null) }
  }

  async function handleAddSubtask() {
    if (!newSubtask.trim() || !task) return
    try {
      const res = await fetch('/api/todoist?path=tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newSubtask.trim(), parent_id: task.id, project_id: task.project_id, priority: newSubtaskPriority }),
      })
      if (!res.ok) throw new Error()
      const created = await res.json()
      setSubtasks((prev) => [...prev, created])
      setNewSubtask(''); setNewSubtaskPriority(1); haptic.success()
    } catch { haptic.error() }
  }

  function fmtDue(iso) {
    if (!iso) return null
    return iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(2, 4)
  }

  if (!mounted) return null

  const sheetTransform = entered ? `translateY(${dragY}px)` : 'translateY(102%)'
  const sheetTransition = isDragging ? 'none' : 'transform 0.32s cubic-bezier(0.4,0,0.2,1)'

  const curIdx = tasks ? tasks.findIndex((t) => t.id === task?.id) : -1
  const hasNext = tasks && curIdx >= 0 && curIdx < tasks.length - 1
  const hasPrev = tasks && curIdx > 0

  let contentAnim = {}
  if (exitDir === 'left')  contentAnim = { animation: 'task-exit-left 0.24s cubic-bezier(0.4,0,1,1) forwards' }
  if (exitDir === 'right') contentAnim = { animation: 'task-exit-right 0.24s cubic-bezier(0.4,0,1,1) forwards' }
  if (enterDir === 'right') contentAnim = { animation: 'task-enter-from-right 0.28s cubic-bezier(0,0,0.2,1) forwards' }
  if (enterDir === 'left')  contentAnim = { animation: 'task-enter-from-left 0.28s cubic-bezier(0,0,0.2,1) forwards' }

  const EditIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
      <path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"/>
    </svg>
  )

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end" style={{ touchAction: 'none' }}>
      <div className="absolute inset-0 bg-black/40"
        style={{ opacity: entered ? 1 : 0, transition: 'opacity 0.32s ease', pointerEvents: isDragging ? 'none' : 'auto' }}
        onClick={dismiss} />

      <div ref={sheetRef}
        className="relative w-full bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[88vh]"
        style={{ transform: sheetTransform, transition: sheetTransition, willChange: 'transform' }}>

        {/* Drag handle — pip row with nav arrows at far ends */}
        <div className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
          onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}>
          <div className="flex items-center pt-3 pb-1 px-2">
            {tasks?.length > 1
              ? <>
                  <button onPointerDown={(e) => e.stopPropagation()} onClick={() => hasPrev && swapTask(curIdx - 1, 'right')}
                    disabled={!hasPrev} className="text-[#79747E] disabled:opacity-25 p-1 cursor-pointer flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor"><path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/></svg>
                  </button>
                  <div className="flex-1 flex items-center justify-center gap-2">
                    <div className="w-8 h-1 rounded-full bg-[#CAC4D0]" />
                    <span className="text-[10px] text-[#CAC4D0]">{curIdx + 1}/{tasks.length}</span>
                    {autoSaved && (
                      <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                        <svg xmlns="http://www.w3.org/2000/svg" height="10" viewBox="0 -960 960 960" width="10" fill="currentColor"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>
                        Saved
                      </span>
                    )}
                    <div className="w-8 h-1 rounded-full bg-[#CAC4D0]" />
                  </div>
                  <button onPointerDown={(e) => e.stopPropagation()} onClick={() => hasNext && swapTask(curIdx + 1, 'left')}
                    disabled={!hasNext} className="text-[#79747E] disabled:opacity-25 p-1 cursor-pointer flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor"><path d="M400-240 640-480 400-720l-56 56 184 184-184 184 56 56Z"/></svg>
                  </button>
                </>
              : <div className="flex-1 flex items-center justify-center gap-2">
                  <div className="w-10 h-1.5 rounded-full bg-[#CAC4D0]" />
                  {autoSaved && (
                    <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                      <svg xmlns="http://www.w3.org/2000/svg" height="10" viewBox="0 -960 960 960" width="10" fill="currentColor"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>
                      Saved
                    </span>
                  )}
                </div>
            }
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          <div style={contentAnim} className="px-4 space-y-px pb-2">

            {/* Task name */}
            <div className="flex items-start gap-2.5 py-3 border-b border-[#F3EDF7]">
              <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                <PriorityPill value={priority} onChange={setPriority} />
                <span className="text-[9px] text-[#CAC4D0] leading-none">hold</span>
              </div>
              <div className="flex-1 min-w-0">
                {editingContent
                  ? <textarea autoFocus value={content} onChange={(e) => setContent(e.target.value)}
                      onBlur={() => setEditingContent(false)} rows={2}
                      className="w-full text-sm font-bold text-[#1C1B1F] resize-none outline-none border-b border-[#6750A4] bg-transparent leading-snug" />
                  : <p onClick={() => setEditingContent(true)} className="text-sm font-bold text-[#1C1B1F] leading-snug cursor-text">{content || 'No title'}</p>
                }
              </div>
            </div>

            {/* Due date */}
            <div className="flex items-center gap-2 py-3 border-b border-[#F3EDF7]">
              <span className="text-xs text-[#79747E] w-8 flex-shrink-0">Due</span>
              <div className="flex-1 min-w-0">
                {editingDue
                  ? <input autoFocus type="date" value={due} onChange={(e) => setDue(e.target.value)}
                      onBlur={() => setEditingDue(false)}
                      className="text-sm text-[#1C1B1F] outline-none border-b border-[#6750A4] bg-transparent w-full" />
                  : <p className="text-sm text-[#1C1B1F]">{fmtDue(due) || <span className="text-[#CAC4D0]">Not set</span>}</p>
                }
              </div>
              {!editingDue && (
                <button onClick={() => setEditingDue(true)} className="text-[#79747E] p-1 flex-shrink-0"><EditIcon /></button>
              )}
            </div>

            {/* Description */}
            <div className="py-3 border-b border-[#F3EDF7]">
              <p className="text-xs font-semibold text-[#49454F] mb-1.5">Description</p>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  {editingDesc
                    ? <textarea autoFocus value={description} onChange={(e) => setDescription(e.target.value)}
                        onBlur={() => setEditingDesc(false)} rows={3} placeholder="Add description…"
                        className="w-full text-sm text-[#1C1B1F] resize-none outline-none border-b border-[#6750A4] bg-transparent leading-relaxed" />
                    : <p className="text-sm text-[#1C1B1F] leading-relaxed whitespace-pre-wrap">
                        {description || <span className="text-[#CAC4D0]">Add description…</span>}
                      </p>
                  }
                </div>
                {!editingDesc && (
                  <button onClick={() => setEditingDesc(true)} className="text-[#79747E] p-1 flex-shrink-0"><EditIcon /></button>
                )}
              </div>
            </div>

            {/* Subtasks */}
            <div className="py-3">
              <p className="text-xs font-semibold text-[#49454F] mb-2">Subtasks</p>
              {editingSubtask && (
                <div className="flex items-center gap-2 mb-2 bg-[#F3EDF7] rounded-xl px-3 py-2">
                  <input autoFocus value={editingSubtask.content}
                    onChange={(e) => setEditingSubtask((s) => ({ ...s, content: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveSubtaskEdit(); if (e.key === 'Escape') setEditingSubtask(null) }}
                    className="flex-1 text-sm text-[#1C1B1F] bg-transparent outline-none" />
                  <button onClick={saveSubtaskEdit} className="text-xs font-semibold text-[#6750A4]">Save</button>
                  <button onClick={() => setEditingSubtask(null)} className="text-xs text-[#79747E]">Cancel</button>
                </div>
              )}
              <SubtaskList subtasks={subtasks} setSubtasks={setSubtasks}
                onEditSubtask={(sub) => setEditingSubtask({ id: sub.id, content: sub.content })} />
              {/* Add subtask row */}
              <div className="flex items-center gap-2 mt-2 py-1">
                <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                  <PriorityPill value={newSubtaskPriority} onChange={setNewSubtaskPriority} size="sm" />
                  <span className="text-[9px] text-[#CAC4D0] leading-none">hold</span>
                </div>
                <input value={newSubtask} onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubtask() }}
                  placeholder="Add subtask…"
                  className="flex-1 text-sm text-[#1C1B1F] placeholder:text-[#CAC4D0] outline-none bg-transparent" />
                <button onClick={handleAddSubtask} disabled={!newSubtask.trim()}
                  className="w-7 h-7 rounded-full bg-[#6750A4] disabled:bg-[#CAC4D0] text-white flex items-center justify-center flex-shrink-0 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Save button — tap to save+close, hold for "done" feel */}
        <div className="px-4 pt-3 pb-4 border-t border-[#E7E0EC] flex-shrink-0 safe-bottom">
          <button
            onPointerDown={onSaveDown} onPointerUp={onSaveUp} onPointerCancel={() => clearTimeout(holdSaveRef.current)}
            className="w-full py-3 rounded-full bg-[#6750A4] text-white font-medium text-sm active:bg-[#5B4397] transition-colors select-none"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
