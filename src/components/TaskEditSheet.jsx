import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../lib/haptic'

const P_META = {
  4: { label: 'P1', color: '#DC2626' },
  3: { label: 'P2', color: '#F97316' },
  2: { label: 'P3', color: '#CA8A04' },
  1: { label: 'P4', color: '#9CA3AF' },
}

// ─── Priority circle with hold-to-pick ───────────────────────────────────────
function PriorityCircle({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(null)
  const holdRef = useRef(null)
  const prevHovRef = useRef(null)
  const elRef = useRef(null)

  function onPointerDown(e) {
    e.preventDefault()
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
    if (p !== prevHovRef.current) {
      haptic.light()
      prevHovRef.current = p
      setHovered(p)
    }
  }

  function onPointerUp() {
    clearTimeout(holdRef.current)
    if (open) {
      if (hovered !== null) onChange(hovered)
      setOpen(false)
      setHovered(null)
      prevHovRef.current = null
    }
  }

  const meta = P_META[value] ?? P_META[1]

  return (
    <div ref={elRef} className="relative flex-shrink-0" style={{ touchAction: 'none' }}>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="w-5 h-5 rounded-full cursor-pointer select-none flex items-center justify-center"
        style={{ backgroundColor: meta.color }}
        title="Hold to change priority"
      />
      {open && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white rounded-2xl shadow-2xl px-3 py-2.5 z-[60]"
          style={{ border: '1px solid #E7E0EC' }}>
          {[4, 3, 2, 1].map((p) => {
            const m = P_META[p]
            const isHov = hovered === p
            return (
              <div
                key={p}
                data-prio={p}
                className="rounded-full flex items-center justify-center text-white font-bold select-none transition-all duration-100"
                style={{
                  width: isHov ? 32 : 24,
                  height: isHov ? 32 : 24,
                  fontSize: isHov ? 11 : 9,
                  backgroundColor: m.color,
                  boxShadow: isHov ? `0 0 0 3px ${m.color}40` : 'none',
                }}
              >
                {m.label}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Drag-to-reorder subtask list ────────────────────────────────────────────
function SubtaskList({ subtasks, setSubtasks, onEditSubtask }) {
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  const dragRef = useRef(null)

  function onHandlePointerDown(e, idx) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragIdx(idx)
    dragRef.current = idx
    haptic.light()
  }

  function onHandlePointerMove(e) {
    if (dragRef.current === null) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const row = el?.closest('[data-sub-idx]')
    if (!row) return
    const idx = parseInt(row.dataset.subIdx)
    if (idx !== overIdx) {
      haptic.light()
      setOverIdx(idx)
    }
  }

  function onHandlePointerUp() {
    if (dragRef.current !== null && overIdx !== null && overIdx !== dragRef.current) {
      setSubtasks((prev) => {
        const arr = [...prev]
        const [item] = arr.splice(dragRef.current, 1)
        arr.splice(overIdx, 0, item)
        return arr
      })
    }
    dragRef.current = null
    setDragIdx(null)
    setOverIdx(null)
  }

  return (
    <div className="space-y-0">
      {subtasks.map((sub, i) => (
        <div
          key={sub.id}
          data-sub-idx={i}
          className="flex items-center gap-2 py-2 border-b border-[#F3EDF7] last:border-0"
          style={{
            opacity: dragIdx === i ? 0.4 : 1,
            background: overIdx === i && dragIdx !== null ? '#F3EDF7' : 'transparent',
            transition: 'background 0.1s',
          }}
        >
          {/* Drag handle */}
          <div
            className="text-[#CAC4D0] flex-shrink-0 cursor-grab active:cursor-grabbing p-1 -ml-1 touch-none"
            onPointerDown={(e) => onHandlePointerDown(e, i)}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerUp}
            style={{ touchAction: 'none' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
              <path d="M360-160q-33 0-56.5-23.5T280-240q0-33 23.5-56.5T360-320q33 0 56.5 23.5T440-240q0 33-23.5 56.5T360-160Zm240 0q-33 0-56.5-23.5T520-240q0-33 23.5-56.5T600-320q33 0 56.5 23.5T680-240q0 33-23.5 56.5T600-160ZM360-440q-33 0-56.5-23.5T280-520q0-33 23.5-56.5T360-600q33 0 56.5 23.5T440-520q0 33-23.5 56.5T360-440Zm240 0q-33 0-56.5-23.5T520-520q0-33 23.5-56.5T600-600q33 0 56.5 23.5T680-520q0 33-23.5 56.5T600-440ZM360-720q-33 0-56.5-23.5T280-800q0-33 23.5-56.5T360-880q33 0 56.5 23.5T440-800q0 33-23.5 56.5T360-720Zm240 0q-33 0-56.5-23.5T520-800q0-33 23.5-56.5T600-880q33 0 56.5 23.5T680-800q0 33-23.5 56.5T600-720Z"/>
            </svg>
          </div>

          <span className="flex-1 text-sm text-[#1C1B1F] min-w-0 truncate">{sub.content}</span>

          <button
            onClick={() => onEditSubtask(sub)}
            className="text-[#79747E] p-1 flex-shrink-0"
          >
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
export default function TaskEditSheet({ open, onClose, task, allTasks = [], onSaved }) {
  const [mounted, setMounted] = useState(false)
  const [entered, setEntered] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const sheetRef = useRef(null)
  const startYRef = useRef(0)
  const dragYRef = useRef(0)

  // Field values
  const [content, setContent] = useState('')
  const [priority, setPriority] = useState(1)
  const [due, setDue] = useState('')
  const [description, setDescription] = useState('')
  const [subtasks, setSubtasks] = useState([])
  const [newSubtask, setNewSubtask] = useState('')
  const [saving, setSaving] = useState(false)

  // Inline edit modes
  const [editingContent, setEditingContent] = useState(false)
  const [editingDue, setEditingDue] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [editingSubtask, setEditingSubtask] = useState(null) // { id, content }

  // Sheet animation
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
    setEditingContent(false)
    setEditingDue(false)
    setEditingDesc(false)
    setEditingSubtask(null)
    setNewSubtask('')
  }, [task?.id, open])

  function dismiss() {
    const h = sheetRef.current?.offsetHeight ?? 600
    setEntered(false); setDragY(h)
    setTimeout(() => { setMounted(false); setDragY(0); dragYRef.current = 0; onClose() }, 300)
  }

  function onHandleDown(e) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
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
      setDragY(h + 40)
      setTimeout(() => { setMounted(false); setDragY(0); dragYRef.current = 0; onClose() }, 280)
    } else { setDragY(0); dragYRef.current = 0 }
  }

  async function handleSave() {
    if (!task) return
    setSaving(true)
    try {
      const body = { content, priority, description }
      if (due) body.due_date = due
      const res = await fetch(`/api/todoist?path=tasks/${task.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`Todoist error: ${res.status}`)
      haptic.success()
      onSaved?.({ ...task, content, priority, description, due: due ? { date: due } : task.due })
      dismiss()
    } catch { haptic.error() }
    finally { setSaving(false) }
  }

  async function saveSubtaskEdit() {
    if (!editingSubtask) return
    try {
      await fetch(`/api/todoist?path=tasks/${editingSubtask.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingSubtask.content }),
      })
      setSubtasks((prev) => prev.map((s) => s.id === editingSubtask.id ? { ...s, content: editingSubtask.content } : s))
      haptic.success()
    } catch { haptic.error() }
    finally { setEditingSubtask(null) }
  }

  async function handleAddSubtask() {
    if (!newSubtask.trim() || !task) return
    const body = { content: newSubtask.trim(), parent_id: task.id, project_id: task.project_id }
    try {
      const res = await fetch('/api/todoist?path=tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      const created = await res.json()
      setSubtasks((prev) => [...prev, created])
      setNewSubtask('')
      haptic.success()
    } catch { haptic.error() }
  }

  function fmtDue(iso) {
    if (!iso) return null
    return iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(2, 4)
  }

  if (!mounted) return null

  const sheetTransform = entered ? `translateY(${dragY}px)` : 'translateY(102%)'
  const sheetTransition = isDragging ? 'none' : 'transform 0.32s cubic-bezier(0.4,0,0.2,1)'

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end" style={{ touchAction: 'none' }}>
      <div
        className="absolute inset-0 bg-black/40"
        style={{ opacity: entered ? 1 : 0, transition: 'opacity 0.32s ease', pointerEvents: isDragging ? 'none' : 'auto' }}
        onClick={dismiss}
      />
      <div
        ref={sheetRef}
        className="relative w-full bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[88vh]"
        style={{ transform: sheetTransform, transition: sheetTransition, willChange: 'transform' }}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
          onPointerDown={onHandleDown} onPointerMove={onHandleMove}
          onPointerUp={onHandleUp} onPointerCancel={onHandleUp}
        >
          <div className="w-10 h-1.5 rounded-full bg-[#CAC4D0]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2 flex-shrink-0">
          <h2 className="text-base font-semibold text-[#1C1B1F]">Edit task</h2>
          <button onClick={dismiss} className="p-1 text-[#79747E]">
            <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
              <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
            </svg>
          </button>
        </div>

        {/* Scrollable fields */}
        <div className="flex-1 overflow-y-auto px-4 space-y-px pb-2">

          {/* ── Task name ── */}
          <div className="flex items-start gap-2.5 py-3 border-b border-[#F3EDF7]">
            <PriorityCircle value={priority} onChange={setPriority} />
            <div className="flex-1 min-w-0">
              {editingContent ? (
                <textarea
                  autoFocus
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onBlur={() => setEditingContent(false)}
                  rows={2}
                  className="w-full text-sm text-[#1C1B1F] resize-none outline-none border-b border-[#6750A4] bg-transparent leading-snug"
                />
              ) : (
                <p className="text-sm text-[#1C1B1F] leading-snug">{content || 'No title'}</p>
              )}
            </div>
            {!editingContent && (
              <button onClick={() => setEditingContent(true)} className="text-[#79747E] p-1 flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
                  <path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"/>
                </svg>
              </button>
            )}
          </div>

          {/* ── Due date ── */}
          <div className="flex items-center gap-2 py-3 border-b border-[#F3EDF7]">
            <span className="text-xs text-[#79747E] w-8 flex-shrink-0">Due</span>
            <div className="flex-1 min-w-0">
              {editingDue ? (
                <input
                  autoFocus
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  onBlur={() => setEditingDue(false)}
                  className="text-sm text-[#1C1B1F] outline-none border-b border-[#6750A4] bg-transparent w-full"
                />
              ) : (
                <p className="text-sm text-[#1C1B1F]">{fmtDue(due) ?? <span className="text-[#79747E]">Not set</span>}</p>
              )}
            </div>
            {!editingDue && (
              <button onClick={() => setEditingDue(true)} className="text-[#79747E] p-1 flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
                  <path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"/>
                </svg>
              </button>
            )}
          </div>

          {/* ── Notes ── */}
          <div className="flex items-start gap-2 py-3 border-b border-[#F3EDF7]">
            <span className="text-xs text-[#79747E] w-8 flex-shrink-0 mt-0.5">Notes</span>
            <div className="flex-1 min-w-0">
              {editingDesc ? (
                <textarea
                  autoFocus
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => setEditingDesc(false)}
                  rows={3}
                  placeholder="Add notes…"
                  className="w-full text-sm text-[#1C1B1F] resize-none outline-none border-b border-[#6750A4] bg-transparent leading-relaxed"
                />
              ) : (
                <p className="text-sm text-[#1C1B1F] leading-relaxed whitespace-pre-wrap">
                  {description || <span className="text-[#CAC4D0]">Add notes…</span>}
                </p>
              )}
            </div>
            {!editingDesc && (
              <button onClick={() => setEditingDesc(true)} className="text-[#79747E] p-1 flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
                  <path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"/>
                </svg>
              </button>
            )}
          </div>

          {/* ── Subtasks ── */}
          <div className="py-3">
            <p className="text-xs font-semibold text-[#49454F] mb-2">Subtasks</p>

            {/* Subtask edit inline */}
            {editingSubtask && (
              <div className="flex items-center gap-2 mb-2 bg-[#F3EDF7] rounded-xl px-3 py-2">
                <input
                  autoFocus
                  value={editingSubtask.content}
                  onChange={(e) => setEditingSubtask((s) => ({ ...s, content: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveSubtaskEdit(); if (e.key === 'Escape') setEditingSubtask(null) }}
                  className="flex-1 text-sm text-[#1C1B1F] bg-transparent outline-none"
                />
                <button onClick={saveSubtaskEdit} className="text-xs font-semibold text-[#6750A4]">Save</button>
                <button onClick={() => setEditingSubtask(null)} className="text-xs text-[#79747E]">Cancel</button>
              </div>
            )}

            <SubtaskList
              subtasks={subtasks}
              setSubtasks={setSubtasks}
              onEditSubtask={(sub) => setEditingSubtask({ id: sub.id, content: sub.content })}
            />

            {/* Add new subtask */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[#CAC4D0]">
                <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
                  <path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/>
                </svg>
              </span>
              <input
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubtask() }}
                placeholder="Add subtask…"
                className="flex-1 text-sm text-[#1C1B1F] placeholder:text-[#CAC4D0] outline-none bg-transparent"
              />
              {newSubtask.trim() && (
                <button onClick={handleAddSubtask} className="text-xs font-semibold text-[#6750A4]">Add</button>
              )}
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="px-4 pt-3 pb-4 border-t border-[#E7E0EC] flex-shrink-0 safe-bottom">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-full bg-[#6750A4] text-white font-medium text-sm disabled:opacity-50 active:bg-[#5B4397] transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
