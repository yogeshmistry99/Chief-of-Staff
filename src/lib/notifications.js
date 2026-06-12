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

export function acceptNotification(id) {
  const notifs = getNotifications()
  const notif = notifs.find((n) => n.id === id)
  if (notif?.suggestedTask) {
    const tasks = getCachedTasks()
    const newTask = {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      content: notif.suggestedTask.content,
      priority: notif.suggestedTask.priority ?? 1,
      _projectName: notif.suggestedTask._projectName ?? notif.source,
      parent_id: notif.suggestedTask.parent_id ?? null,
      due: notif.suggestedTask.due_date ? { date: notif.suggestedTask.due_date } : null,
      created_at: new Date().toISOString(),
      _local: true,
    }
    saveToCache([...tasks, newTask])
  }
  saveNotifications(notifs.map((n) => n.id === id ? { ...n, status: 'accepted' } : n))
}
