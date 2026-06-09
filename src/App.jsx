import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useRef } from 'react'
import BottomNav from './components/BottomNav'
import Home from './pages/Home'
import Buckets from './pages/Buckets'
import BucketDetail from './pages/BucketDetail'
import DiscussionThread from './pages/DiscussionThread'
import Settings from './pages/Settings'
import Calendar from './pages/Calendar'

const TAB_ROUTES = ['/', '/calendar', '/buckets', '/settings']

function SwipeNavigator({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const touchStart = useRef(null)

  function handleTouchStart(e) {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }

  function handleTouchEnd(e) {
    if (!touchStart.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touchStart.current.x
    const dy = t.clientY - touchStart.current.y
    touchStart.current = null

    // Only act on clearly horizontal swipes
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return

    // Only swipe between top-level tabs
    const currentTab = TAB_ROUTES.find((r) =>
      r === '/' ? location.pathname === '/' : location.pathname.startsWith(r)
    )
    const idx = TAB_ROUTES.indexOf(currentTab)
    if (idx === -1) return

    if (dx < 0 && idx < TAB_ROUTES.length - 1) {
      navigate(TAB_ROUTES[idx + 1])
    } else if (dx > 0 && idx > 0) {
      navigate(TAB_ROUTES[idx - 1])
    }
  }

  return (
    <div className="flex-1 overflow-y-auto" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {children}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col h-full">
        <SwipeNavigator>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/buckets" element={<Buckets />} />
            <Route path="/buckets/:bucket" element={<BucketDetail />} />
            <Route path="/buckets/:bucket/discussions/:id" element={<DiscussionThread />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SwipeNavigator>
        <BottomNav />
      </div>
    </BrowserRouter>
  )
}
