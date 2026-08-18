import { useCallback, useEffect, useState } from 'react'
import { haptic } from '../lib/haptic'
import {
  reminderStatus, enableReminders, disableReminders, sendTestNotification,
  pushSupported, isConfigured, shouldAutoEnable,
} from '../lib/push'
import {
  readReminderTime, saveReminderTime, listenForReminderTone,
  isValidTime, DEFAULT_REMINDER_TIME,
} from '../lib/reminderSettings'

// The evening reminder switch.
//
// It lives here rather than in Settings because this is where its purpose is —
// someone looking at the journal is the person who wants reminding about it.
//
// NOTHING PROMPTS ON LOAD. Notification.requestPermission() needs a user
// gesture, and a denied permission is sticky and can only be undone in browser
// settings, so an unsolicited prompt that gets dismissed would permanently cost
// the feature. It asks only when the switch is actually tapped.

export default function ReminderToggle() {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState(null)   // outcome of the last test send
  const [time, setTime] = useState(DEFAULT_REMINDER_TIME)
  const [savingTime, setSavingTime] = useState(false)
  const [timeError, setTimeError] = useState(null)

  const refresh = useCallback(async () => {
    setStatus(await reminderStatus())
  }, [])

  // ON BY DEFAULT — restore the subscription silently when permission is
  // already granted.
  //
  // Permission persists per origin but the push subscription does not: clearing
  // site data, reinstalling the home-screen app, or the server pruning a dead
  // endpoint each leave permission intact and the subscription gone. The switch
  // then read "off" and stayed off until spotted, which had happened three times
  // by 16 Aug 2026. This makes it self-healing.
  //
  // No prompt is possible here and none is attempted: requestPermission()
  // returns 'granted' immediately when it already is, and shouldAutoEnable()
  // requires exactly that. A refusal via the switch is remembered and respected.
  //
  // Failure is deliberately silent — this is unattended repair, not a user
  // action, and a red error for something they never asked for would be noise.
  // The switch simply stays off and the manual path still reports properly.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await reminderStatus()
      if (cancelled) return
      setStatus(s)
      if (!shouldAutoEnable(s)) return
      try {
        await enableReminders()
        if (!cancelled) setStatus(await reminderStatus())
      } catch { /* leave the switch off; tapping it will surface the reason */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Load the stored reminder time. Declared below the state it sets, because a
  // hook's dependency array is evaluated during render and a hook placed above
  // its values takes the whole app to the error boundary while building clean.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const stored = await readReminderTime()
      if (!cancelled) setTime(stored)
    })()
    return () => { cancelled = true }
  }, [])

  // The tone belongs to the app, not the notification: a service worker cannot
  // play audio, so it messages the page and the page rings.
  useEffect(() => listenForReminderTone(), [])

  async function saveTime(next) {
    if (savingTime) return
    // Show the new time immediately, but keep the old one to fall back to — an
    // input that snaps back on failure is how the user learns it did not save.
    const previous = time
    setTime(next)
    setTimeError(null)
    if (!isValidTime(next)) { setTime(previous); return }   // cleared or half-typed
    setSavingTime(true)
    try {
      await saveReminderTime(next)
      haptic.light()
    } catch (e) {
      haptic.error()
      setTime(previous)
      setTimeError(e.message)
    } finally {
      setSavingTime(false)
    }
  }

  // This control ALWAYS renders, even when it cannot work.
  //
  // It used to return null when the browser lacked push support or the VAPID
  // keys were unset, on the reasoning that an inert switch is worse than no
  // switch. That was wrong: an invisible switch is worse than both, because
  // nothing on screen distinguishes "not set up yet" from "shipped broken", and
  // the first thing it did in real use was leave the user hunting for a control
  // that had silently removed itself. Unavailable states now say what they need.
  const supported = pushSupported()
  const configured = isConfigured()
  const unavailable = !supported
    ? 'This browser cannot show reminders. On Android, add the app to your home screen and open it from there.'
    : !configured
      ? 'Not set up yet — the VAPID keys are missing from Vercel. Add VAPID_PUBLIC_KEY, VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT, then redeploy.'
      : null

  const enabled = !unavailable && status?.enabled
  const blocked = status?.permission === 'denied'

  async function toggle() {
    if (busy) return
    setBusy(true)
    setError(null)
    setTest(null)
    try {
      if (enabled) {
        await disableReminders()
        haptic.light()
      } else {
        await enableReminders()
        haptic.success()
      }
      // Re-read from the database rather than assuming. The switch must reflect
      // what is actually stored, not what we just tried to do.
      await refresh()
    } catch (e) {
      haptic.error()
      setError(e.message)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function runTest() {
    if (testing) return
    setTesting(true)
    setTest(null)
    const result = await sendTestNotification()
    if (result.ok) haptic.success()
    else haptic.error()
    setTest(result)
    // A test can discover the subscription is dead and remove it, so the switch
    // must re-read rather than keep claiming to be on.
    if (result.removed) await refresh()
    setTesting(false)
  }

  return (
    <div className="mt-3 rounded-2xl bg-white border border-[#CAC4D0] px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[#1C1B1F]">Evening reminder</p>
          <p className="text-[11px] text-[#79747E] leading-relaxed">
            {unavailable
              ? unavailable
              : blocked
                ? 'Blocked in your browser settings for this site.'
                : enabled
                  ? 'A nudge each evening, only if the day isn’t logged yet.'
                  // The only state that still needs a tap: permission has never
                  // been granted, and the browser will not let the page ask
                  // without one. Say what the tap is for rather than presenting
                  // it as an optional extra.
                  : 'On by default — tap to allow notifications and it stays on.'}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          aria-label="Evening reminder"
          disabled={busy || blocked || !!unavailable}
          onClick={toggle}
          className={`flex-shrink-0 w-12 h-7 rounded-full transition-colors relative disabled:opacity-40 ${
            enabled ? 'bg-[#6750A4]' : 'bg-[#E7E0EC]'
          }`}
        >
          <span
            className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${
              enabled ? 'left-6' : 'left-1'
            }`}
          />
        </button>
      </div>

      {error && (
        <p className="mt-2 text-[11px] text-[#8C1D18] leading-relaxed break-words">{error}</p>
      )}

      {enabled && (
        <div className="mt-2 pt-2 border-t border-[#F3EDF7] flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <label htmlFor="reminder-time" className="text-[11px] text-[#49454F]">
              Remind me at
            </label>
            <p className="text-[11px] text-[#79747E] leading-relaxed">
              Only if the day isn’t published by then. The evening send runs
              around 9pm — a later time here waits for the next one.
            </p>
          </div>
          <input
            id="reminder-time"
            type="time"
            value={time}
            disabled={savingTime}
            onChange={(e) => saveTime(e.target.value)}
            className="flex-shrink-0 text-sm text-[#1C1B1F] bg-[#F3EDF7] rounded-lg px-2 py-1 outline-none border border-transparent focus:border-[#6750A4] disabled:opacity-40"
          />
        </div>
      )}

      {enabled && timeError && (
        <p className="mt-1.5 text-[11px] text-[#8C1D18] leading-relaxed break-words">{timeError}</p>
      )}

      {enabled && (
        <div className="mt-2 pt-2 border-t border-[#F3EDF7]">
          <button
            onClick={runTest}
            disabled={testing}
            className="text-[11px] text-[#6750A4] underline disabled:opacity-40"
          >
            {testing ? 'Sending…' : 'Send a test notification'}
          </button>

          {test && (
            <p
              className={`mt-1.5 text-[11px] leading-relaxed break-words ${
                test.ok ? 'text-[#1B5E20]' : 'text-[#8C1D18]'
              }`}
            >
              {test.ok
                ? 'Sent. It should appear in a moment — if nothing arrives, notifications are being suppressed by the phone rather than the app.'
                : test.error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
