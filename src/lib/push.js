import { supabase } from './supabase'
import { saveSubscription, deleteSubscription, getSubscription } from '../../api/_lib/pushRepo.js'

// Push subscription handling for the browser.
//
// Same posture as src/lib/journal.js: writes go through the shared repo, which
// reads the row back and throws if the database didn't confirm it. The UI must
// not say "reminders on" until one of these has returned — a toggle that lies
// costs the entries it was meant to protect.
//
// There is deliberately no endpoint behind this. api/*.js is at the Vercel
// Hobby 12-function cap, and subscriptions are stored client-side straight to
// Supabase exactly as journal entries and tasks already are.

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

function client() {
  if (!supabase) throw new Error('Cannot reach the reminder store — no database connection.')
  return supabase
}

// The push API wants the VAPID key as a Uint8Array, not the base64url string.
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function pushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

export function permissionState() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission   // 'default' | 'granted' | 'denied'
}

export function isConfigured() {
  return !!VAPID_PUBLIC_KEY
}

// ─── On by default ────────────────────────────────────────────────────────────
//
// The reminder is meant to be ON. It exists because the symptoms being tracked —
// cognitive fatigue, reduced executive function — are exactly the ones that make
// remembering to journal unreliable, so a reminder that has to be remembered
// about defeats itself.
//
// The thing that kept turning it off was not a preference. Notification
// PERMISSION persists per origin, but the push SUBSCRIPTION does not: clearing
// site data, reinstalling the home-screen app, or the server pruning a dead
// endpoint all leave permission granted and the subscription gone. The toggle
// then read "off" and stayed off until noticed and tapped again — which had
// already happened three times by 16 Aug 2026.
//
// So: whenever permission is already granted, the subscription is restored
// silently. That needs no prompt (requestPermission() returns 'granted'
// immediately) and overrides nothing — the permission was the consent.
//
// TURNING IT OFF STILL STICKS. Auto-restore is skipped after an explicit
// switch-off, or it would flip itself back on and be impossible to refuse.
// localStorage is the right scope: a push subscription is per-browser anyway.
const OPT_OUT_KEY = 'journal_reminder_optout'

export function reminderOptedOut() {
  try { return localStorage.getItem(OPT_OUT_KEY) === '1' } catch { return false }
}

function setOptOut(v) {
  try {
    if (v) localStorage.setItem(OPT_OUT_KEY, '1')
    else localStorage.removeItem(OPT_OUT_KEY)
  } catch { /* private mode: default-on simply doesn't persist a refusal */ }
}

// Should the reminder be restored without asking? Only with permission already
// granted and no explicit refusal — never prompts, never overrides a choice.
export function shouldAutoEnable(status) {
  return !!status?.supported
    && status.permission === 'granted'
    && !status.enabled
    && !reminderOptedOut()
}

// Whether THIS browser is subscribed and the row is actually in the database.
//
// Both halves are checked on purpose. A browser can hold a PushManager
// subscription whose row we never stored (or which was deleted as dead), and in
// that case reminders will not arrive — so reporting "on" from the browser
// alone would be exactly the false confirmation this app has form for.
export async function reminderStatus() {
  if (!pushSupported()) return { supported: false, enabled: false, permission: 'unsupported' }
  const permission = permissionState()
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager?.getSubscription()
    if (!sub) return { supported: true, enabled: false, permission }
    const row = await getSubscription(client(), sub.endpoint)
    return { supported: true, enabled: !!row, permission, endpoint: sub.endpoint }
  } catch (e) {
    return { supported: true, enabled: false, permission, error: e.message }
  }
}

// Turn reminders on for this browser. Throws with a usable message on every
// failure path — the caller shows it rather than silently leaving a dead toggle.
export async function enableReminders() {
  if (!pushSupported()) {
    throw new Error('This browser cannot show reminders. Try adding the app to your home screen.')
  }
  if (!isConfigured()) {
    throw new Error('Reminders are not configured yet — VITE_VAPID_PUBLIC_KEY is missing.')
  }

  const permission = await Notification.requestPermission()
  if (permission === 'denied') {
    // Sticky, and not recoverable from inside the page — say where to fix it.
    throw new Error('Notifications are blocked for this site. Allow them in your browser settings for this site, then try again.')
  }
  if (permission !== 'granted') {
    throw new Error('Reminders need notification permission to work.')
  }

  const reg = await navigator.serviceWorker.ready
  // Reuse an existing subscription if the browser already has one; only create
  // a fresh one otherwise, so the endpoint stays stable across toggles.
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  // Throws if the database did not hand the row back.
  await saveSubscription(client(), sub.toJSON(), navigator.userAgent)
  // Turning it on clears any previous refusal, so auto-restore resumes.
  setOptOut(false)
  return true
}

// Send a real push to THIS device, right now.
//
// Deliberately goes through the server and the same send code as the nightly
// reminder rather than calling registration.showNotification() locally. A local
// notification would prove only that the browser can draw one — it would come
// up green with the VAPID keys missing, the subscription row absent, or the
// send path broken, which are the failures actually worth catching.
//
// Resolves with the outcome rather than throwing: the caller shows either
// result, and the message is the diagnosis.
export async function sendTestNotification() {
  if (!pushSupported()) return { ok: false, error: 'This browser cannot show notifications.' }
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager?.getSubscription()
    if (!sub) return { ok: false, error: 'This device is not subscribed. Turn the switch on first.' }

    const res = await fetch('/api/cron?job=test-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok && !data.error) return { ok: false, error: `Test failed (${res.status})` }
    return data
  } catch (e) {
    return { ok: false, error: `Could not reach the server: ${e.message}` }
  }
}

// Turn reminders off. The browser subscription is dropped AND the row deleted —
// leaving the row would keep the nightly send trying against a dead endpoint.
export async function disableReminders() {
  // Recorded BEFORE the unsubscribe: if anything below throws, the refusal must
  // still stand, or the next tab open would silently switch it back on.
  setOptOut(true)
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager?.getSubscription()
  if (sub) {
    // Remove the row first: if unsubscribing succeeded but the delete failed,
    // the reminder would keep firing at an endpoint that no longer exists.
    await deleteSubscription(client(), sub.endpoint)
    await sub.unsubscribe().catch(() => {})
  }
  return true
}
