// Push-only service worker.
//
// READ THIS BEFORE ADDING ANYTHING: there is deliberately NO `fetch` listener
// and no caching in this file.
//
// A previous version of this worker cached responses, and its stale caches
// stopped deployed updates from reaching the app — which is why src/main.jsx
// unregistered every service worker on load. Re-enabling a worker to deliver
// the journal reminder only reverses that decision safely because a worker with
// no `fetch` listener is structurally incapable of serving a stale response.
// Adding a `fetch` handler here would bring the original bug back.

const NOTIFICATION_TAG = 'journal-reminder'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Delete EVERY cache, not just outdated ones — the old life-os-v* caches
    // are what broke updates, and nothing here creates caches any more.
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('push', (event) => {
  // The payload is JSON, but a push can arrive without one (or malformed). A
  // reminder that fails to render is a missed journal entry, so fall back to a
  // usable default rather than throwing.
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }

  const title = payload.title || 'Journal'
  const options = {
    body: payload.body || 'Ready to log today?',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/badge-72.png',
    // A single tag so a second reminder replaces the first rather than stacking
    // — a column of identical nudges is the kind of friction this is meant to
    // remove.
    tag: payload.tag || NOTIFICATION_TAG,
    renotify: false,
    requireInteraction: false,
    // The app's haptic signature, in the same family as the in-app pulses
    // (light 10, chat 12, success [10,50,10]): a soft double tap, spaced a
    // little wider so it reads as calm rather than urgent. This is the ONE part
    // of the alert sound a web push can actually choose — the tone itself comes
    // from the phone's notification channel and cannot be set from here, so the
    // vibration is what carries the app's voice when the app is closed.
    vibrate: payload.vibrate || [12, 70, 12],
    silent: false,
    data: { url: payload.url || '/journal' },
  }

  event.waitUntil((async () => {
    await self.registration.showNotification(title, options)
    // If a window is open, let the page play the app's own two-note tone — a
    // service worker has no AudioContext, so this is the only way the reminder
    // can sound like the rest of the app rather than like a generic alert.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      client.postMessage({ type: 'journal-reminder' })
    }
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/journal'

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })
    // Focus an open window rather than launching a second copy of the app.
    for (const client of clientList) {
      if ('focus' in client) {
        if ('navigate' in client) {
          try { await client.navigate(target) } catch { /* focus alone is enough */ }
        }
        return client.focus()
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target)
  })())
})
