import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Register the push-only service worker, which delivers the journal reminder.
//
// This used to unregister every service worker instead, because the worker then
// in public/sw.js cached responses and its stale caches stopped deployed
// updates reaching the app. That worker no longer exists: the current one has
// NO fetch listener and no caching, so it cannot serve a stale response, and it
// purges every leftover cache on activation. See public/sw.js.
//
// Registration is best-effort. The app works without it — only the evening
// reminder is lost — so a failure here must never block startup.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('service worker registration failed; reminders will be unavailable', err)
    })
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
