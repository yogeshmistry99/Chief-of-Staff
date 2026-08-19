import { describe, it, expect } from 'vitest'
import { bucketTabs, defaultTab, COMMON_TABS } from './bucketTabs'

describe('bucketTabs', () => {
  it('puts Today FIRST in the Health bucket', () => {
    expect(bucketTabs('Health').map((t) => t.id)).toEqual(['health', 'tasks', 'head', 'discussions'])
  })

  it('gives every other bucket the ordinary tabs, with no Today', () => {
    for (const b of ['Work', 'Finance', 'Home', 'Family', 'Personal', 'Systems']) {
      expect(bucketTabs(b).map((t) => t.id)).toEqual(['tasks', 'head', 'discussions'])
    }
  })

  it('does not leak its array into the shared list', () => {
    bucketTabs('Health').push({ id: 'oops' })
    expect(COMMON_TABS.map((t) => t.id)).toEqual(['tasks', 'head', 'discussions'])
  })
})

describe('defaultTab', () => {
  it('opens Health on Today — the readings are what it is opened for', () => {
    expect(defaultTab('Health')).toBe('health')
  })

  it('opens every other bucket on Tasks, unchanged', () => {
    for (const b of ['Work', 'Finance', 'Home']) expect(defaultTab(b)).toBe('tasks')
  })

  it('never returns a tab the bucket does not have', () => {
    for (const b of ['Health', 'Work', 'Finance']) {
      expect(bucketTabs(b).map((t) => t.id)).toContain(defaultTab(b))
    }
  })
})
