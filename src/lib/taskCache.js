import { getAllTasks } from './todoist'
import { pushToSupabase } from './sync'

const CACHE_KEY = 'todoist_task_cache'
const LAST_PULL_KEY = 'todoist_last_pull'

export function getCachedTasks() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function getLastPullTime() {
  return localStorage.getItem(LAST_PULL_KEY) ?? null
}

// Merge incoming tasks with existing cache — deduplicate by id, prefer fresher data
function mergeTasks(existing, incoming) {
  const map = new Map(existing.map((t) => [t.id, t]))
  incoming.forEach((t) => map.set(t.id, t))
  return Array.from(map.values())
}

export async function pullAndCacheTasks() {
  const fresh = await getAllTasks()
  const existing = getCachedTasks()
  const merged = mergeTasks(existing, fresh)
  const now = new Date().toISOString()

  localStorage.setItem(CACHE_KEY, JSON.stringify(merged))
  localStorage.setItem(LAST_PULL_KEY, now)

  // Sync to Supabase so other devices get the cache too
  pushToSupabase('todoist_task_cache', merged).catch(() => {})
  pushToSupabase('todoist_last_pull', now).catch(() => {})

  return { tasks: merged, pulledCount: fresh.length }
}
