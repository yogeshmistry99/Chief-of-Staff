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

// Keyed variant for collapsibles rendered in a list, where one ref won't do.
// Returns [measureFor, heights]:
//   measureFor(key) → a ref callback for that row's content wrapper
//   heights[key]    → that row's measured height (undefined until first measure)
//
// Used by the archived-task rows, which are produced by a .map() — extracting each
// into its own component just to hold a hook would be a much larger refactor for
// no behavioural gain.
export function useMeasuredHeights() {
  const [heights, setHeights] = useState({})
  const observers = useRef(new Map())

  const measureFor = useCallback((key) => (node) => {
    const existing = observers.current.get(key)
    if (existing) { existing.disconnect(); observers.current.delete(key) }
    if (!node) return

    const measure = () => setHeights((h) => (
      h[key] === node.scrollHeight ? h : { ...h, [key]: node.scrollHeight }
    ))
    measure()

    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(node)
    observers.current.set(key, ro)
  }, [])

  useEffect(() => () => {
    observers.current.forEach((ro) => ro.disconnect())
    observers.current.clear()
  }, [])

  return [measureFor, heights]
}

export default useMeasuredHeight
