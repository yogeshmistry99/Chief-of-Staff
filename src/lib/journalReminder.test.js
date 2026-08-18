import { describe, it, expect } from 'vitest'
import { publishState, needsReminder } from '../../api/_lib/journalPublish.js'
import {
  londonTime, isDue, isValidTime, reminderBody, DEFAULT_REMINDER_TIME,
} from '../../api/_lib/reminder.js'

// The reminder's two decisions — WHETHER today still needs a nudge, and WHETHER
// it is time yet — are the parts that can be quietly wrong, so they are pure and
// tested here without a Supabase client or a push service.
//
// The bug that prompted this: the job skipped whenever a row existed, so a day
// written in the morning and left unpublished was never mentioned. 17 Aug 2026
// was authored at 06:07 and not filed until 20:59 — an unpublished draft at the
// 20:00 fire, and it stayed silent.

const entry = (o) => ({ entry_date: '2026-08-17', revision: 1, ...o })
const draft     = entry({ drive_status: null })
const published = entry({ drive_status: 'filed', revision: 2, filed_revision: 2 })
const edited    = entry({ drive_status: 'filed', revision: 3, filed_revision: 2 })
const failed    = entry({ drive_status: 'failed' })

describe('needsReminder — publishing is the finish line, not saving', () => {
  it('reminds when nothing has been written', () => {
    expect(needsReminder(null)).toBe(true)
  })

  it('reminds when the day is saved but not published — the case that was silent', () => {
    expect(publishState(draft)).toBe('draft')
    expect(needsReminder(draft)).toBe(true)
  })

  it('reminds when filing broke, because it is still not published', () => {
    expect(needsReminder(failed)).toBe(true)
  })

  it('stays quiet once the day is published', () => {
    expect(needsReminder(published)).toBe(false)
  })

  it('stays quiet for a published-then-edited day — it HAS been published', () => {
    expect(publishState(edited)).toBe('edited')
    expect(needsReminder(edited)).toBe(false)
  })

  it('reproduces 17 Aug: a draft at the fire time now gets a nudge', () => {
    // Row as it stood at 20:00 UTC that day: authored in the morning, not yet filed.
    const asItWas = { entry_date: '2026-08-17', revision: 2, drive_status: null }
    expect(needsReminder(asItWas)).toBe(true)
  })
})

describe('isDue — hold until the time the user set', () => {
  // 19:30 and 21:30 UTC on a BST day = 20:30 and 22:30 in London.
  const at = (iso) => new Date(iso)

  it('reads the clock in London, not UTC', () => {
    expect(londonTime(at('2026-08-17T19:30:00Z'))).toBe('20:30')
    // Same instant in winter is an hour earlier locally.
    expect(londonTime(at('2026-01-17T19:30:00Z'))).toBe('19:30')
  })

  it('is not due before the set time', () => {
    expect(isDue('22:00', at('2026-08-17T19:30:00Z'))).toBe(false)
  })

  it('is due at the set time', () => {
    expect(isDue('20:30', at('2026-08-17T19:30:00Z'))).toBe(true)
  })

  it('is due after the set time', () => {
    expect(isDue('20:00', at('2026-08-17T19:30:00Z'))).toBe(true)
  })

  it('falls back to the default rather than never firing on a bad value', () => {
    for (const bad of [null, undefined, '', 'nine pm', '25:00', '9:00', '21:60']) {
      expect(isValidTime(bad)).toBe(false)
      // 23:00 London is past the 21:00 default, so a bad value still sends.
      expect(isDue(bad, at('2026-08-17T22:00:00Z'))).toBe(true)
    }
  })

  it('accepts the times the picker can produce', () => {
    for (const good of ['00:00', '09:05', '21:00', '23:59', DEFAULT_REMINDER_TIME]) {
      expect(isValidTime(good)).toBe(true)
    }
  })

  it('the default is satisfiable by the single daily fire in BOTH BST and GMT', () => {
    // The cron fires at 20:00 UTC year-round: 21:00 in London during BST, 20:00
    // during GMT. A default the WINTER fire cannot satisfy would pass all summer
    // and then silently stop the reminder the night the clocks go back — no
    // error, no log, just nothing arriving.
    expect(isDue(DEFAULT_REMINDER_TIME, at('2026-08-17T20:00:00Z'))).toBe(true)  // BST
    expect(isDue(DEFAULT_REMINDER_TIME, at('2026-12-17T20:00:00Z'))).toBe(true)  // GMT
  })

  it('never renders midnight as 24:00, which would sort after every real time', () => {
    const midnight = londonTime(at('2026-01-17T00:00:00Z'))
    expect(midnight).toBe('00:00')
    expect(isDue('00:00', at('2026-01-17T00:00:00Z'))).toBe(true)
  })
})

describe('reminderBody — says the right thing for the state it found', () => {
  it('asks for the day when nothing is written', () => {
    expect(reminderBody(null)).toMatch(/log today/i)
  })

  it('does not say "log today" when the day is already written', () => {
    // Telling someone to log a day they already wrote reads as lost work.
    expect(reminderBody('draft')).not.toMatch(/log today/i)
    expect(reminderBody('draft')).toMatch(/not published/i)
  })

  it('says plainly when filing broke', () => {
    expect(reminderBody('failed')).toMatch(/didn’t file|did not file/i)
  })

  it('never cheerleads, shames, or mentions streaks', () => {
    for (const state of [null, 'draft', 'failed']) {
      const body = reminderBody(state)
      expect(body).not.toMatch(/streak|missed|don't forget|dont forget|!|🎉/i)
    }
  })
})
