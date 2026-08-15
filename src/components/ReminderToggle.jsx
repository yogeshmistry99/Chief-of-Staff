import { useCallback, useEffect, useState } from 'react'
import { haptic } from '../lib/haptic'
import {
  reminderStatus, enableReminders, disableReminders, sendTestNotification,
  pushSupported, isConfigured,
} from '../lib/push'

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

  const refresh = useCallback(async () => {
    setStatus(await reminderStatus())
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Nothing to offer if the browser can't do it, or the keys were never set —
  // an inert switch is worse than no switch.
  if (!pushSupported() || !isConfigured()) return null
  if (!status) return null

  const enabled = status.enabled
  const blocked = status.permission === 'denied'

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
            {blocked
              ? 'Blocked in your browser settings for this site.'
              : enabled
                ? 'A nudge each evening, only if the day isn’t logged yet.'
                : 'Get a nudge each evening to log the day.'}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          aria-label="Evening reminder"
          disabled={busy || blocked}
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
