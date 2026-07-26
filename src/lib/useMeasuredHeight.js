import { useCallback, useEffect, useRef, useState } from 'react'

// Measures an element's natural height so a collapsible container can animate to
// its ACTUAL content height instead of a hardcoded max-height.
//
// Why this exists: the task-detail drawers used a guessed clamp
// (`maxHeight: scoringOpen ? '460px' : '180px'`) with `overflow: hidden`. Any task
// whose description + scoring panel + metadata exceeded the guess got visibly cut
// off where the next card began (confirmed live 2026-07-26). A larger constant is
// the same bug with a longer fuse, so the content drives the height instead.
//
// Usage:
//   const [ref, height] = useMeasuredHeight()
//   <div style={{ maxHeight: open ? `${height}px` : 0, overflow: 'hidden', transition: … }}>
//     <div ref={ref}> … </div>
//   </div>
//
// ResizeObserver keeps the measurement live, so nested collapsibles expanding,
// text reflowing on rotation, and async content all grow the container correctly.
// Falls back to a one-off measurement where ResizeObserver is unavailable.
export function useMeasuredHeight() {
  const [height, setHeight] = useState(0)
  const elRef = useRef(null)
  const observerRef = useRef(null)

  // Callback ref so we start observing as soon as the node mounts, and re-observe
  // if React swaps the node out.
  const ref = useCallback((node) => {
    if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null }
    elRef.current = node
    if (!node) return

    const measure = () => setHeight(node.scrollHeight)
    measure()

    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(node)
    observerRef.current = ro
  }, [])

  useEffect(() => () => observerRef.current?.disconnect(), [])

  return [ref, height]
}

export default useMeasuredHeight
