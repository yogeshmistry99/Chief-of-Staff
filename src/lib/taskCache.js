import { supabase } from './supabase'
import { PROJECTS } from './todoist'
import {
  listTasks, getTask, createTask, updateTask, completeTask, softDeleteTask,
} from '../../api/_lib/tasksRepo.js'

// Task persistence for the browser.
//
// Tasks live one-row-per-task in public.tasks. Every write here goes through
// api/_lib/tasksRepo.js and touches a single row.
//
// localStorage is a READ-ONLY DISPLAY CACHE. It exists so a screen can paint
// before the network answers. It is never a source of truth and never the base
// for a write. The old `saveToCache(wholeArray)` — which merged onto this cache
// and then overwrote the authoritative row — is deliberately GONE, not
// reimplemented: while a "write the whole list" function exists, someone will
// call it, and one stale caller silently destroys everyone else's data.
//
// Offline behaviour is deliberate: writes go straight to Supabase and FAIL
// VISIBLY when offline. Nothing is queued. A replayed queue can apply stale
// edits over newer ones, which is a quieter version of the bug this replaces.

const CACHE_KEY = 'todoist_task_cache'
const LAST_PULL_KEY = 'todoist_last_pull'

const PROJECT_NAMES = Object.fromEntries(Object.entries(PROJECTS).map(([name, id]) => [id, name]))

function withProjectName(t) {
  return { ...t, _projectName: t._projectName ?? PROJECT_NAMES[t.project_id] ?? null }
}

// ─── Display cache (read-only) ────────────────────────────────────────────────

export function getCachedTasks() {
  try {
    const tasks = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]')
    return Array.isArray(tasks) ? tasks.map(withProjectName) : []
  } catch {
    return []
  }
}

export function getLastPullTime() {
  return localStorage.getItem(LAST_PULL_KEY) ?? null
}

// Replace the whole display cache. Only ever called with a full list freshly
// read from the database — never with a locally-assembled one.
function writeCache(tasks) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(tasks)) } catch {}
}

// Patch one task into the display cache after a verified write, so the UI is
// consistent without a full refetch. Cache-only: it cannot affect the database.
function patchCache(task) {
  if (!task?.id) return
  const cur = getCachedTasks()
  const i = cur.findIndex((t) => t.id === task.id)
  if (i === -1) cur.push(task)
  else cur[i] = task
  writeCache(cur)
}

function dropFromCache(id) {
  writeCache(getCachedTasks().filter((t) => t.id !== id))
}

// ─── Reads ────────────────────────────────────────────────────────────────────

// Authoritative read. Refreshes the display cache as a side effect.
export async function readTasksFromSupabase() {
  if (!supabase) return null
  try {
    const tasks = (await listTasks(supabase)).map(withProjectName)
    writeCache(tasks)
    return tasks
  } catch (e) {
    console.warn('task read failed', e)
    return null
  }
}

export async function readTask(id) {
  return getTask(supabase, id)
}

// ─── Writes — one task, one row, loud on failure ──────────────────────────────

export async function createTaskRow(task) {
  const saved = withProjectName(await createTask(supabase, task))
  patchCache(saved)
  return saved
}

export async function updateTaskRow(id, patch) {
  const saved = withProjectName(await updateTask(supabase, id, patch))
  patchCache(saved)
  return saved
}

export async function archiveTask(id) {
  const saved = withProjectName(await completeTask(supabase, id, true))
  patchCache(saved)
  return saved
}

export async function restoreTask(id) {
  const saved = withProjectName(await completeTask(supabase, id, false))
  patchCache(saved)
  return saved
}

export async function deleteTaskRow(id) {
  const res = await softDeleteTask(supabase, id)
  dropFromCache(id)
  return res
}

// Restore from a task_backups snapshot: upsert every task in the snapshot.
//
// Deliberately does NOT delete tasks absent from the snapshot. A restore that
// also deleted would be a mass-delete running through a code path this app has
// twice lost data on; anything created since the backup would disappear with no
// confirmation. Restoring brings back what was saved — it does not roll the
// world back. Returns counts so the caller can report honestly.
export async function restoreTasksFromSnapshot(tasks) {
  if (!Array.isArray(tasks)) throw new Error('restore: snapshot is not a task list')
  let restored = 0
  const failures = []
  for (const t of tasks) {
    try {
      const existing = await getTask(supabase, t.id)
      if (existing) await updateTask(supabase, t.id, t)
      else await createTask(supabase, t)
      restored++
    } catch (e) {
      failures.push({ id: t.id, error: e.message })
    }
  }
  await readTasksFromSupabase()
  return { restored, failed: failures.length, failures }
}
