import { describe, it, expect } from 'vitest'
import { publishState, PUBLISH_LABEL, driveDocUrl } from './journal'

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
