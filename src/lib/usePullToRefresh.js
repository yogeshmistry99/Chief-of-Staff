import { useEffect, useRef, useState } from 'react'

// Pull down at the top of a scroller to refresh.
//
// The app had no such gesture, so this is new rather than borrowed. It exists
// because refreshing had to stop being automatic: a reading is held for the
// session, and pulling is how you say you want a new one.
//
// Only arms when the scroller is ALREADY at the top, so an ordinary scroll is
// never mistaken for a pull. Once armed and moving downward it calls
// preventDefault — the gesture belongs to this now, and the page must not scroll
// underneath it — which is why touchmove is registered non-passive.
//
// State is mirrored into refs because the listeners are attached once and would
// otherwise close over the first render's values and never see an update.
export function usePullToRefresh(scrollRef, onRefresh, { threshold = 70 } = {}) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const pullRef = useRef(0)
  const refreshingRef = useRef(false)
  const handlerRef = useRef(onRefresh)
  handlerRef.current = onRefresh

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const setBoth = (v) => { pullRef.current = v; setPull(v) }
    const gesture = { y: 0, armed: false }

    function onStart(e) {
      gesture.armed = el.scrollTop <= 0 && !refreshingRef.current
      gesture.y = e.touches[0].clientY
    }

    function onMove(e) {
      if (!gesture.armed) return
      const dy = e.touches[0].clientY - gesture.y
      if (dy <= 0) {
        // Pulled back up past the start: hand the gesture back to the scroller.
        if (pullRef.current) setBoth(0)
        gesture.armed = el.scrollTop <= 0
        return
      }
      e.preventDefault()
      // Resistance, and a ceiling, so the sheet cannot be dragged arbitrarily far.
      setBoth(Math.min(dy * 0.5, threshold * 1.6))
    }

    async function onEnd() {
      if (!gesture.armed) return
      gesture.armed = false
      const reached = pullRef.current >= threshold
      setBoth(0)
      if (!reached || refreshingRef.current) return
      refreshingRef.current = true
      setRefreshing(true)
      try {
        await handlerRef.current?.()
      } finally {
        refreshingRef.current = false
        setRefreshing(false)
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [scrollRef, threshold])

  return { pull, refreshing, ready: pull >= threshold }
}
