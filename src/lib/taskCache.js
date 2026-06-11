import { getAllTasks, PROJECTS } from './todoist'
import { pushToSupabase } from './sync'

const CACHE_KEY = 'todoist_task_cache'
const LAST_PULL_KEY = 'todoist_last_pull'

const PROJECT_NAMES = Object.fromEntries(Object.entries(PROJECTS).map(([name, id]) => [id, name]))

export function getCachedTasks() {
  try {
    const tasks = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]')
    // Ensure _projectName is always populated
    return tasks.map((t) => ({ ...t, _projectName: t._projectName ?? PROJECT_NAMES[t.project_id] ?? null }))
  } catch {
    return []
  }
}

export function getLastPullTime() {
  return localStorage.getItem(LAST_PULL_KEY) ?? null
}

export function saveToCache(tasks) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(tasks))
  pushToSupabase('todoist_task_cache', tasks).catch(() => {})
}

// Merge incoming tasks with existing cache — deduplicate by id, prefer fresher data
function mergeTasks(existing, incoming) {
  const map = new Map(existing.map((t) => [t.id, t]))
  incoming.forEach((t) => map.set(t.id, t))
  return Array.from(map.values())
}

export async function pullAndCacheTasks() {
  const fresh = await getAllTasks()
  const withNames = fresh.map((t) => ({ ...t, _projectName: PROJECT_NAMES[t.project_id] ?? null }))
  const existing = getCachedTasks()
  const merged = mergeTasks(existing, withNames)
  const now = new Date().toISOString()

  localStorage.setItem(CACHE_KEY, JSON.stringify(merged))
  localStorage.setItem(LAST_PULL_KEY, now)

  pushToSupabase('todoist_task_cache', merged).catch(() => {})
  pushToSupabase('todoist_last_pull', now).catch(() => {})

  return { tasks: merged, pulledCount: fresh.length }
}
