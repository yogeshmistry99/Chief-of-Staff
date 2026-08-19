import { describe, it, expect, beforeEach } from 'vitest'
import { readSessionHealth, writeSessionHealth, clearSessionHealth } from './healthClient'

// The reading is held in memory for the session so that remounting the Health
// tab — which happens constantly: opening a ring, coming back, switching bucket
// tabs — does not re-call Google for data that has not moved.
//
// The same-day guard is the honest part, and the reason this is not the cache
// the no-cache rule forbids.

const reading = (date, extra = {}) => ({ ok: true, date, fetchedAt: `${date}T07:13:00Z`, metrics: {}, ...extra })

beforeEach(() => clearSessionHealth())

describe('the session hold', () => {
  it('is empty until something is written', () => {
    expect(readSessionHealth()).toBeNull()
  })

  it('hands back a reading taken today', () => {
    writeSessionHealth(reading('2026-08-19'))
    const now = new Date('2026-08-19T10:00:00Z')
    expect(readSessionHealth(now)?.date).toBe('2026-08-19')
  })

  it('DROPS a reading once the day has turned', () => {
    // An app left open overnight would otherwise present last night's reading as
    // this morning's — the exact failure the no-cache rule exists to prevent.
    writeSessionHealth(reading('2026-08-18'))
    expect(readSessionHealth(new Date('2026-08-19T07:00:00Z'))).toBeNull()
    // And stays dropped, so the next open fetches.
    expect(readSessionHealth(new Date('2026-08-19T07:00:00Z'))).toBeNull()
  })

  it('uses the London civil day, not UTC', () => {
    // 23:30 UTC on the 18th is already the 19th in London during BST.
    writeSessionHealth(reading('2026-08-19'))
    expect(readSessionHealth(new Date('2026-08-18T23:30:00Z'))?.date).toBe('2026-08-19')
  })

  it('never holds a failed read, so a retry is not suppressed', () => {
    writeSessionHealth(reading('2026-08-19'))
    writeSessionHealth({ ok: false, error: 'Google is down' })
    // The good reading survives; the error does not replace it.
    expect(readSessionHealth(new Date('2026-08-19T10:00:00Z'))?.ok).toBe(true)
  })

  it('holds nothing at all when the first read fails', () => {
    writeSessionHealth({ ok: false, error: 'Google is down' })
    expect(readSessionHealth()).toBeNull()
  })

  it('replaces the held reading when a newer one is written', () => {
    writeSessionHealth(reading('2026-08-19', { fetchedAt: '2026-08-19T07:00:00Z' }))
    writeSessionHealth(reading('2026-08-19', { fetchedAt: '2026-08-19T11:00:00Z' }))
    expect(readSessionHealth(new Date('2026-08-19T12:00:00Z')).fetchedAt).toBe('2026-08-19T11:00:00Z')
  })
})
