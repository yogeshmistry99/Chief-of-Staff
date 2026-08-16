import { describe, it, expect, beforeEach } from 'vitest'
import { shouldAutoEnable, reminderOptedOut } from './push.js'

// The evening reminder is meant to be ON. What kept turning it off was not a
// preference: notification PERMISSION persists per origin, but the push
// SUBSCRIPTION does not — clearing site data, reinstalling the home-screen app,
// or the server pruning a dead endpoint each leave permission granted and the
// subscription gone. Three subscriptions had been created by 16 Aug 2026, which
// is three times the switch silently went back to off.
//
// These assertions pin the two halves that must both hold: it restores itself
// without ever prompting, and an explicit refusal is still respected.

const OPT_OUT_KEY = 'journal_reminder_optout'

const status = (over = {}) => ({
  supported: true, enabled: false, permission: 'granted', ...over,
})

beforeEach(() => { localStorage.clear() })

describe('restores itself when permission is already granted', () => {
  it('auto-enables when permission is granted but the subscription is gone', () => {
    // The exact state after a reinstall or a data clear.
    expect(shouldAutoEnable(status())).toBe(true)
  })

  it('does nothing when it is already on', () => {
    expect(shouldAutoEnable(status({ enabled: true }))).toBe(false)
  })
})

describe('never prompts', () => {
  it('does NOT auto-enable when permission has never been asked for', () => {
    // requestPermission() needs a user gesture, and a dismissed prompt is
    // sticky and unrecoverable from inside the page — so an unsolicited one
    // would permanently cost the feature. This state waits for a tap.
    expect(shouldAutoEnable(status({ permission: 'default' }))).toBe(false)
  })

  it('does NOT auto-enable when permission is denied', () => {
    expect(shouldAutoEnable(status({ permission: 'denied' }))).toBe(false)
  })

  it('does nothing where push is unsupported', () => {
    expect(shouldAutoEnable(status({ supported: false }))).toBe(false)
    expect(shouldAutoEnable(null)).toBe(false)
    expect(shouldAutoEnable(undefined)).toBe(false)
  })
})

describe('an explicit refusal is respected', () => {
  it('does not switch itself back on after being turned off', () => {
    // Without this the switch would be impossible to refuse: turning it off
    // would last until the next tab open.
    localStorage.setItem(OPT_OUT_KEY, '1')
    expect(reminderOptedOut()).toBe(true)
    expect(shouldAutoEnable(status())).toBe(false)
  })

  it('resumes auto-restore once it is turned back on', () => {
    localStorage.setItem(OPT_OUT_KEY, '1')
    expect(shouldAutoEnable(status())).toBe(false)
    localStorage.removeItem(OPT_OUT_KEY)          // what enableReminders() does
    expect(shouldAutoEnable(status())).toBe(true)
  })

  it('treats an absent flag as "not refused" — the default is ON', () => {
    expect(reminderOptedOut()).toBe(false)
    expect(shouldAutoEnable(status())).toBe(true)
  })
})
