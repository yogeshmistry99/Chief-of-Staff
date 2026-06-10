import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'

export default function EditSheet({ open, onClose, title, onSave, saving, children }) {
  const [mounted, setMounted] = useState(false)
  const [entered, setEntered] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const sheetRef = useRef(null)
  const startYRef = useRef(0)
  const dragYRef = useRef(0)

  // Mount then slide up
  useEffect(() => {
    if (open) {
      setDragY(0)
      dragYRef.current = 0
      setMounted(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)))
    }
  }, [open])

  // Slide down then unmount when closed externally
  useEffect(() => {
    if (!open && mounted) {
      setEntered(false)
      const t = setTimeout(() => { setMounted(false); setDragY(0); dragYRef.current = 0 }, 320)
      return () => clearTimeout(t)
    }
  }, [open])

  function dismiss() {
    const sheetH = sheetRef.current?.offsetHeight ?? 600
    setEntered(false)
    setDragY(sheetH)
    setTimeout(() => {
      setMounted(false)
      setDragY(0)
      dragYRef.current = 0
      onClose()
    }, 300)
  }

  // Drag handle pointer events — capture to handle so move/up follow finger off-element
  function onHandleDown(e) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    startYRef.current = e.clientY
    dragYRef.current = 0
    setIsDragging(true)
  }

  function onHandleMove(e) {
    const dy = Math.max(0, e.clientY - startYRef.current)
    dragYRef.current = dy
    setDragY(dy)
  }

  function onHandleUp() {
    setIsDragging(false)
    const sheetH = sheetRef.current?.offsetHeight ?? 600
    if (dragYRef.current > Math.min(sheetH * 0.32, 140)) {
      // crossed threshold — dismiss with momentum
      setDragY(sheetH + 40)
      setTimeout(() => {
        setMounted(false)
        setDragY(0)
        dragYRef.current = 0
        onClose()
      }, 280)
    } else {
      // snap back
      setDragY(0)
      dragYRef.current = 0
    }
  }

  if (!mounted) return null

  const sheetTransform = entered ? `translateY(${dragY}px)` : 'translateY(102%)'
  const sheetTransition = isDragging ? 'none' : 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)'

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end" style={{ touchAction: 'none' }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        style={{ opacity: entered ? 1 : 0, transition: 'opacity 0.32s ease', pointerEvents: isDragging ? 'none' : 'auto' }}
        onClick={dismiss}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="relative w-full bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[88vh]"
        style={{ transform: sheetTransform, transition: sheetTransition, willChange: 'transform' }}
      >
        {/* Drag handle — pointer events here drive the drag */}
        <div
          className="flex justify-center pt-3 pb-2 flex-shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <div className="w-10 h-1.5 rounded-full bg-[#CAC4D0]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2 flex-shrink-0">
          <h2 className="text-base font-semibold text-[#1C1B1F]">{title}</h2>
          <button onClick={dismiss} className="p-1 text-[#79747E]">
            <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
              <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
          {children}
        </div>

        {/* Save button */}
        <div className="px-4 pt-3 pb-4 border-t border-[#E7E0EC] flex-shrink-0 safe-bottom">
          <button
            onClick={onSave}
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
