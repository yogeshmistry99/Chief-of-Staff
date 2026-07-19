import { pushToSupabase } from './sync'
import { getCachedTasks, saveToCache } from './taskCache'

const KEY = 'task_notifications'

export function getNotifications() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function saveNotifications(notifs) {
  localStorage.setItem(KEY, JSON.stringify(notifs))
  pushToSupabase('task_notifications', notifs).catch(() => {})
}

export function getNotificationsForTask(taskId) {
  return getNotifications().filter((n) => n.taskId === taskId && n.status === 'pending')
}

export function clearNotificationsForSource(source) {
  saveNotifications(getNotifications().filter((n) => n.source !== source))
}

export function dismissNotification(id) {
  saveNotifications(getNotifications().map((n) => n.id === id ? { ...n, status: 'declined' } : n))
}

export async function acceptNotification(id) {
  const notifs = getNotifications()
  const notif = notifs.find((n) => n.id === id)
  if (notif?.suggestedTask) {
    // Construct through the single choke point (/api/create-task → buildTask),
    // then persist. Retires the old inline `local_` minting.
    try {
      const res = await fetch('/api/create-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: notif.suggestedTask.content,
          priority: notif.suggestedTask.priority ?? 1,
          project_name: notif.suggestedTask._projectName ?? notif.source,
          parent_id: notif.suggestedTask.parent_id ?? null,
          due: notif.suggestedTask.due_date ? { date: notif.suggestedTask.due_date } : null,
        }),
      })
      if (res.ok) {
        const { task } = await res.json()
        await saveToCache([...getCachedTasks(), task])
      }
    } catch { /* leave notification accepted even if task creation fails */ }
  }
  saveNotifications(notifs.map((n) => n.id === id ? { ...n, status: 'accepted' } : n))
}
