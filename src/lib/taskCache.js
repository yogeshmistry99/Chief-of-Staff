import { getAllTasks, PROJECTS } from './todoist'
import { pushToSupabase, readFromSupabase } from './sync'

const CACHE_KEY = 'todoist_task_cache'
const LAST_PULL_KEY = 'todoist_last_pull'

const PROJECT_NAMES = Object.fromEntries(Object.entries(PROJECTS).map(([name, id]) => [id, name]))

export function getCachedTasks() {
  try {
    const tasks = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]')
    return tasks.map((t) => ({ ...t, _projectName: t._projectName ?? PROJECT_NAMES[t.project_id] ?? null }))
  } catch {
    return []
  }
}

export function getLastPullTime() {
  return localStorage.getItem(LAST_PULL_KEY) ?? null
}

// Merge incoming tasks into the existing cache by id — incoming wins per task,
// and any task NOT present in `incoming` is preserved. This makes saveToCache
// non-destructive: a bucket-filtered array (e.g. from a single bucket's head
// chat) can only add/update its own tasks and can never wipe other buckets.
export async function saveToCache(incoming) {
  if (!Array.isArray(incoming)) return getCachedTasks()
  const map = new Map(getCachedTasks().map((t) => [t.id, t]))
  incoming.forEach((t) => { map.set(t.id, t) })
  const merged = Array.from(map.values())
  localStorage.setItem(CACHE_KEY, JSON.stringify(merged))
  await pushToSupabase('todoist_task_cache', merged)
  return merged
}

export async function archiveTask(id) {
  const all = getCachedTasks()
  const updated = all.map((t) =>
    t.id === id ? { ...t, is_completed: true, completed_at: new Date().toISOString() } : t
  )
  await saveToCache(updated)
  return updated
}

export async function restoreTask(id) {
  const all = getCachedTasks()
  const updated = all.map((t) =>
    t.id === id ? { ...t, is_completed: false, completed_at: null } : t
  )
  await saveToCache(updated)
  return updated
}

export async function readTasksFromSupabase() {
  const raw = await readFromSupabase('todoist_task_cache')
  if (!Array.isArray(raw)) return null
  return raw.map((t) => ({ ...t, _projectName: t._projectName ?? PROJECT_NAMES[t.project_id] ?? null }))
}

// Merge incoming tasks with existing cache — deduplicate by id, prefer fresher data.
// If a task is locally marked completed but Todoist still shows it active, keep the
// completed state so a sync never un-archives a task the user just completed.
function mergeTasks(existing, incoming) {
  const map = new Map(existing.map((t) => [t.id, t]))
  incoming.forEach((t) => {
    const ex = map.get(t.id)
    if (ex?.is_completed && !t.is_completed) {
      map.set(t.id, { ...t, is_completed: true, completed_at: ex.completed_at })
    } else {
      map.set(t.id, t)
    }
  })
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

  await pushToSupabase('todoist_task_cache', merged)
  await pushToSupabase('todoist_last_pull', now)

  return { tasks: merged, pulledCount: fresh.length }
}
