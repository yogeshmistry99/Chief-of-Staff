// Defensive localStorage writes. A quota error (e.g. an oversized chat history)
// must never throw and crash the app — log and continue instead.
export function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (err) {
    console.warn(`localStorage write failed for "${key}": ${err?.message ?? err}`)
    return false
  }
}

// Keep only the most recent `limit` items. Chat stores are disposable working
// memory with no server backup, so evicting the oldest on write is safe.
export function capRecent(items, limit = 50) {
  return Array.isArray(items) && items.length > limit ? items.slice(-limit) : items
}
