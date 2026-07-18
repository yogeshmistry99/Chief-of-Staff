import { supabase } from './supabase'
import { getCachedTasks, saveToCache } from './taskCache'

const MAX_SNAPSHOTS = 12
const LAST_AUTO_BACKUP_KEY = 'cos_last_auto_backup'

// ─── Core helpers ─────────────────────────────────────────────────────────────

export async function listBackups() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('task_backups')
    .select('id, label, task_count, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createBackup(label) {
  if (!supabase) throw new Error('Supabase not configured')
  const tasks = getCachedTasks()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('task_backups')
    .insert({ label: label ?? autoLabel(), tasks, task_count: tasks.length, created_at: now })
    .select('id, label, task_count, created_at')
    .single()
  if (error) throw error

  // Prune to MAX_SNAPSHOTS
  await pruneOldBackups()
  return data
}

export async function restoreBackup(id) {
  if (!supabase) throw new Error('Supabase not configured')

  // Save current state as pre-restore safety backup
  const safetyLabel = `Pre-restore backup — ${fmtLabel(new Date())}`
  await createBackup(safetyLabel)

  // Fetch the target snapshot
  const { data, error } = await supabase
    .from('task_backups')
    .select('tasks, label')
    .eq('id', id)
    .single()
  if (error) throw error

  // Replace cache
  saveToCache(data.tasks ?? [])
  return { taskCount: (data.tasks ?? []).length, label: data.label }
}

export async function deleteBackup(id) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.from('task_backups').delete().eq('id', id)
  if (error) throw error
}

// ─── Scheduled auto-backup ────────────────────────────────────────────────────
// Runs once per Sunday. If the app wasn't open at 8am, fires on next open that day.

export async function maybeRunAutoBackup() {
  if (!supabase) return
  const now = new Date()
  if (now.getDay() !== 0) return  // 0 = Sunday

  const todayStr = toDateStr(now)
  const lastRun = localStorage.getItem(LAST_AUTO_BACKUP_KEY)
  if (lastRun === todayStr) return  // already ran today

  // Dedupe against the server-side weekly cron (or a prior run this week):
  // if a weekly snapshot already exists in the last 6 days, skip so a single
  // week never stores two snapshots eating the 12-snapshot cap.
  try {
    const existing = await listBackups()
    const weekAgo = Date.now() - 6 * 24 * 60 * 60 * 1000
    const hasWeekly = existing.some(
      (b) => /^Weekly backup/.test(b.label || '') && new Date(b.created_at).getTime() >= weekAgo
    )
    if (hasWeekly) { localStorage.setItem(LAST_AUTO_BACKUP_KEY, todayStr); return }
  } catch {
    // If the check fails, fall through and let createBackup proceed.
  }

  localStorage.setItem(LAST_AUTO_BACKUP_KEY, todayStr)
  try {
    await createBackup(`Weekly backup — ${fmtLabel(now)}`)
  } catch {
    // Silently fail — will retry next open
    localStorage.removeItem(LAST_AUTO_BACKUP_KEY)
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function pruneOldBackups() {
  const { data } = await supabase
    .from('task_backups')
    .select('id, created_at')
    .order('created_at', { ascending: false })
  if (!data || data.length <= MAX_SNAPSHOTS) return
  const toDelete = data.slice(MAX_SNAPSHOTS).map((r) => r.id)
  await supabase.from('task_backups').delete().in('id', toDelete)
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function autoLabel() {
  return `Weekly backup — ${fmtLabel(new Date())}`
}

export function fmtLabel(d) {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function fmtBackupDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
