import { describe, it, expect } from 'vitest'
import {
  publishState, PUBLISH_LABEL, PUBLISH_SHORT, PUBLISH_DOT, NO_ENTRY_DOT, driveDocUrl,
} from './journal'

// Saving and publishing are separate actions, so "where is this entry up to"
// became a real question with four answers. These are the rules.

const entry = (o) => ({ entry_date: '2026-08-16', revision: 1, ...o })

describe('publishState', () => {
  it('a saved but never-filed entry is a draft, not a failure', () => {
    expect(publishState(entry({ drive_status: 'pending' }))).toBe('draft')
    expect(publishState(entry({ drive_status: null }))).toBe('draft')
    expect(publishState(entry({}))).toBe('draft')
  })

  it('a filed entry at the same revision is published', () => {
    expect(publishState(entry({ drive_status: 'filed', revision: 3, filed_revision: 3 })))
      .toBe('published')
  })

  it('a filed entry edited since is "edited", not still published', () => {
    // This is the case the whole column exists for: the stored entry has moved
    // on and the filed document is stale, but nothing about drive_status says so.
    expect(publishState(entry({ drive_status: 'filed', revision: 4, filed_revision: 3 })))
      .toBe('edited')
  })

  it('a filing that broke is failed, and outranks everything else', () => {
    expect(publishState(entry({ drive_status: 'failed', revision: 2, filed_revision: 1 })))
      .toBe('failed')
  })

  it('treats a filed entry with no recorded revision as stale rather than current', () => {
    // Safer direction: prompting a needless republish costs one tap; calling a
    // stale document "published" puts the wrong version in the case file.
    expect(publishState(entry({ drive_status: 'filed', revision: 2, filed_revision: null })))
      .toBe('edited')
  })

  it('a filed entry at revision 1 with filed_revision 1 is published', () => {
    expect(publishState(entry({ drive_status: 'filed', revision: 1, filed_revision: 1 })))
      .toBe('published')
  })

  it('is null for a day with no entry', () => {
    expect(publishState(null)).toBeNull()
    expect(publishState(undefined)).toBeNull()
  })

  it('has a label for every state it can return', () => {
    for (const s of ['draft', 'published', 'edited', 'failed']) {
      expect(PUBLISH_LABEL[s]).toBeTruthy()
    }
  })
})

describe('the status dot', () => {
  const STATES = ['draft', 'published', 'edited', 'failed']

  it('gives every state a colour and a short label — a state cannot lose either', () => {
    for (const s of STATES) {
      expect(PUBLISH_DOT[s]).toMatch(/^#[0-9a-f]{6}$/i)
      expect(PUBLISH_SHORT[s]).toBeTruthy()
    }
  })

  it('uses a distinct colour per state, and none matches the empty-day dot', () => {
    const used = STATES.map((s) => PUBLISH_DOT[s])
    expect(new Set(used).size).toBe(STATES.length)
    expect(used).not.toContain(NO_ENTRY_DOT)
  })

  it('keeps status hues clear of the tracker series palette', async () => {
    // A status colour must never be mistakable for a chart category, or a green
    // dot starts reading as "series 4".
    const { CATEGORICAL } = await import('./trackerColor')
    for (const s of STATES) {
      expect(CATEGORICAL.map((c) => c.toLowerCase())).not.toContain(PUBLISH_DOT[s].toLowerCase())
    }
  })

  it('reserves the alarming colours for the states that need action', () => {
    // Draft is progress, not a warning: amber for "you wrote today's entry"
    // would be nagging, and red would be a lie.
    expect(PUBLISH_DOT.draft).not.toBe(PUBLISH_DOT.edited)
    expect(PUBLISH_DOT.draft).not.toBe(PUBLISH_DOT.failed)
    expect(PUBLISH_DOT.failed).toBe('#d03b3b')   // status critical
    expect(PUBLISH_DOT.edited).toBe('#fab219')   // status warning
    expect(PUBLISH_DOT.published).toBe('#0ca30c') // status good
  })

  it('is readable on the journal surface', async () => {
    // The dot is a 10px filled shape, so the bar is visibility, not text
    // contrast — but a dot at 1.5:1 on white is not a signal at all.
    const lum = (hex) => {
      const [r, g, b] = [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const contrast = (a, b) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }
    for (const s of STATES) {
      expect(contrast(PUBLISH_DOT[s], '#FFFBFE')).toBeGreaterThan(1.7)
    }
  })
})

describe('driveDocUrl', () => {
  it('builds the Docs URL from a stored id', () => {
    expect(driveDocUrl('abc123')).toBe('https://docs.google.com/document/d/abc123/edit')
  })

  it('returns null rather than a dead link', () => {
    expect(driveDocUrl(null)).toBeNull()
    expect(driveDocUrl(undefined)).toBeNull()
    expect(driveDocUrl('')).toBeNull()
  })
})
