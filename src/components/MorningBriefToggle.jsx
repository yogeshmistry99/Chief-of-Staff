import { useCallback, useEffect, useState } from 'react'
import { haptic } from '../lib/haptic'
import {
  reminderStatus, enableReminders, sendTestNotification,
  pushSupported, isConfigured,
} from '../lib/push'
import { readBriefEnabled, saveBriefEnabled } from '../lib/morningBrief'

// The morning-brief switch.
//
// The brief shares the journal reminder's push transport (one subscription per
// device) but has its own preference flag, so a device can want the evening
// journal nudge and not the morning task brief, or the reverse.
//
// Turning it ON both ensures a push subscription exists (via enableReminders,
// the same proven permission-and-subscribe path the journal switch uses) and
// writes the enabled flag. Turning it OFF only clears the flag — it deliberately
// does NOT unsubscribe, because the journal reminder may still be using the same
// subscription. Killing the shared transport from here would silently switch the
// journal reminder off too.
//
// NOTHING PROMPTS ON LOAD, same rule as the journal switch: a denied permission
// is sticky, so the browser is only asked when the switch is actually tapped.

export default function MorningBriefToggle() {
  const [status, setStatus] = useState(null)   // push subscription status
  const [briefOn, setBriefOn] = useState(true)  // the app_data flag (default on)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState(null)

  const refresh = useCallback(async () => {
    const [s, on] = await Promise.all([reminderStatus(), readBriefEnabled()])
    setStatus(s)
    setBriefOn(on)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [s, on] = await Promise.all([reminderStatus(), readBriefEnabled()])
      if (cancelled) return
      setStatus(s)
      setBriefOn(on)
    })()
    return () => { cancelled = true }
  }, [])

  const supported = pushSupported()
  const configured = isConfigured()
  const unavailable = !supported
    ? 'This browser cannot show notifications. On Android, add the app to your home screen and open it from there.'
    : !configured
      ? 'Not set up yet — the VAPID keys are missing from Vercel.'
      : null

  const blocked = status?.permission === 'denied'
  // "On" needs BOTH the flag and a live subscription to send through — showing on
  // without a subscription would be the false confirmation this app avoids.
  const enabled = !unavailable && briefOn && !!status?.enabled

  async function toggle() {
    if (busy) return
    setBusy(true)
    setError(null)
    setTest(null)
    try {
      if (enabled) {
        // Off = clear the flag only; leave the shared subscription in place.
        await saveBriefEnabled(false)
        haptic.light()
      } else {
        // On = make sure a subscription exists, then set the flag.
        await enableReminders()
        await saveBriefEnabled(true)
        haptic.success()
      }
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
    if (result.removed) await refresh()
    setTesting(false)
  }

  return (
    <div className="mt-3 rounded-2xl bg-white border border-[#CAC4D0] px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[#1C1B1F]">Morning brief</p>
          <p className="text-[11px] text-[#79747E] leading-relaxed">
            {unavailable
              ? unavailable
              : blocked
                ? 'Blocked in your browser settings for this site.'
                : enabled
                  ? 'A morning nudge, only when something is overdue or due today. Quiet on clear days.'
                  : 'On by default — tap to allow notifications and it stays on.'}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          aria-label="Morning brief"
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
