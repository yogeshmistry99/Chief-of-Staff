import { describe, it, expect } from 'vitest'
import { isSubRoute } from '../App'

// This predicate gates the whole full-screen <Routes> block. A path missing from
// it does not 404 — it silently falls through to the tab view, so the screen just
// does not appear, with a clean build and passing render tests.
//
// That is not hypothetical: /health/ring/:key shipped unreachable because the
// check was `pathname === '/health'`.

describe('isSubRoute', () => {
  it('covers every full screen that has a route', () => {
    for (const p of [
      '/buckets/Health', '/buckets/Work/discussions/abc', '/buckets/Health/config',
      '/calendar/event/123', '/weekly-review', '/chief', '/chief/config',
      '/health', '/trackers', '/trackers/corolla',
    ]) {
      expect(isSubRoute(p), p).toBe(true)
    }
  })

  it('covers the health detail screens — the ones that shipped unreachable', () => {
    expect(isSubRoute('/health/ring/sleep')).toBe(true)
    expect(isSubRoute('/health/ring/hrv')).toBe(true)
    expect(isSubRoute('/health/ring/cardio')).toBe(true)
    expect(isSubRoute('/health/session')).toBe(true)
  })

  it('leaves the tab routes alone', () => {
    for (const p of ['/', '/buckets', '/calendar', '/journal']) {
      expect(isSubRoute(p), p).toBe(false)
    }
  })
})
