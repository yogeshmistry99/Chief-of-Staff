import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { haptic } from './lib/haptic'
import BottomNav from './components/BottomNav'
import Home from './pages/Home'
import Buckets from './pages/Buckets'
import BucketDetail from './pages/BucketDetail'
import DiscussionThread from './pages/DiscussionThread'
import Settings from './pages/Settings'
import Calendar from './pages/Calendar'

const TABS = [
  { path: '/',          Component: Home },
  { path: '/calendar',  Component: Calendar },
  { path: '/buckets',   Component: Buckets },
  { path: '/settings',  Component: Settings },
]

function getTabIdx(pathname) {
  if (pathname === '/') return 0
  return TABS.findIndex((t, i) => i > 0 && pathname.startsWith(t.path))
}

function isSubRoute(pathname) {
  return pathname.startsWith('/buckets/') && pathname !== '/buckets'
}

function TabStrip() {
  const navigate   = useNavigate()
  const location   = useLocation()
  const [drag, setDrag]           = useState(0)
  const [animating, setAnimating] = useState(false)
  const stripRef = useRef(null)
  const touchRef = useRef(null) // { startX, startY, dx, decided }
  const idxRef   = useRef(0)

  const idx = getTabIdx(location.pathname)
  idxRef.current = idx

  useEffect(() => {
    const el = stripRef.current
    if (!el) return

    function onStart(e) {
      const t = e.touches[0]
      touchRef.current = { startX: t.clientX, startY: t.clientY, dx: 0, decided: false }
      setAnimating(false)
    }

    function onMove(e) {
      const tr = touchRef.current
      if (!tr) return
      const t  = e.touches[0]
      const dx = t.clientX - tr.startX
      const dy = t.clientY - tr.startY

      if (!tr.decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
        tr.decided = true
        tr.horizontal = Math.abs(dx) > Math.abs(dy)
      }
      if (!tr.horizontal) return
      e.preventDefault()

      const i = idxRef.current
      // Rubber-band at edges
      let d = dx
      if ((i === 0 && dx > 0) || (i === TABS.length - 1 && dx < 0)) {
        d = dx * 0.18
      }
      tr.dx = d
      setDrag(d)
    }

    function onEnd() {
      const tr = touchRef.current
      if (!tr || !tr.horizontal) { touchRef.current = null; return }
      const i = idxRef.current
      const { dx } = tr
      touchRef.current = null
      setAnimating(true)

      if (dx < -55 && i < TABS.length - 1) {
        haptic.light()
        setDrag(-(window.innerWidth))
        setTimeout(() => { navigate(TABS[i + 1].path); setDrag(0); setAnimating(false) }, 260)
      } else if (dx > 55 && i > 0) {
        haptic.light()
        setDrag(window.innerWidth)
        setTimeout(() => { navigate(TABS[i - 1].path); setDrag(0); setAnimating(false) }, 260)
      } else {
        setDrag(0)
        setTimeout(() => setAnimating(false), 300)
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove',  onMove,  { passive: false })
    el.addEventListener('touchend',   onEnd,   { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove',  onMove)
      el.removeEventListener('touchend',   onEnd)
    }
  }, [navigate])

  const translatePct = -(idx * 100) + (drag / window.innerWidth) * 100

  return (
    <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
      <div
        ref={stripRef}
        style={{
          display: 'flex',
          height: '100%',
          width: `${TABS.length * 100}vw`,
          transform: `translateX(${translatePct}vw)`,
          transition: animating ? 'transform 0.28s cubic-bezier(0.25, 1, 0.5, 1)' : 'none',
          willChange: 'transform',
        }}
      >
        {TABS.map(({ path, Component }) => (
          <div key={path} style={{ width: '100vw', height: '100%', overflowY: 'auto', flexShrink: 0 }}>
            <Component />
          </div>
        ))}
      </div>
    </div>
  )
}

function AppInner() {
  const location = useLocation()

  if (isSubRoute(location.pathname)) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto min-h-0">
          <Routes>
            <Route path="/buckets/:bucket"                      element={<BucketDetail />} />
            <Route path="/buckets/:bucket/discussions/:id"      element={<DiscussionThread />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <TabStrip />
      <BottomNav />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  )
}
