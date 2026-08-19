// Which tabs a bucket has, and which one it opens on.
//
// Pure and separate from BucketDetail so the ORDER and the DEFAULT are testable
// without mounting the page — the component needs the task store, the calendar,
// the head config and a router before it will render at all.
//
// Health is the only bucket that differs. It opens on Today and lists it first,
// because the day's wearable readings are what that bucket gets opened for; the
// tasks in it are ordinary tasks and stay one tap away. Reading order and tab
// order match deliberately.

export const HEALTH_TAB = { id: 'health', label: 'Today' }

export const COMMON_TABS = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'head', label: 'Head' },
  { id: 'discussions', label: 'Discuss' },
]

export function bucketTabs(bucket) {
  return bucket === 'Health' ? [HEALTH_TAB, ...COMMON_TABS] : [...COMMON_TABS]
}

export function defaultTab(bucket) {
  return bucket === 'Health' ? 'health' : 'tasks'
}
