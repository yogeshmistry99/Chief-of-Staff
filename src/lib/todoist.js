const BASE = '/api/todoist'

export const PROJECTS = {
  Finance:  '6gmVXCpMmXX8V5MV',
  Health:   '6gmVXCm3jxXfXVWw',
  Home:     '6gmVXCpQQxw3gFgw',
  Work:     '6gmVXCv7j946mv75',
  Family:   '6gmVXCpr8mc6mjjX',
  Personal: '6gmcXJpGfj6gh4Gc',
  Systems:  '6gmVXCmRw6X6cgpM',
}

async function get(path, params = {}) {
  const url = new URL(BASE, window.location.origin)
  url.searchParams.set('path', path)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Todoist API error: ${res.status}`)
  return res.json()
}

// All tasks across all 7 projects
export async function getAllTasks() {
  return get('tasks')
}

// Tasks for a single project
export async function getProjectTasks(projectId) {
  return get('tasks', { project_id: projectId })
}

// Close (complete) a task
export async function closeTask(taskId) {
  const url = new URL(BASE, window.location.origin)
  url.searchParams.set('path', `tasks/${taskId}/close`)
  const res = await fetch(url.toString(), { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to close task: ${res.status}`)
}

// Todoist priority: 4=P1, 3=P2, 2=P3, 1=P4
export function priorityLabel(p) {
  return ['', 'P4', 'P3', 'P2', 'P1'][p] ?? ''
}

export function isToday(task) {
  if (!task.due) return false
  const today = new Date().toISOString().split('T')[0]
  return task.due.date === today
}

export function isOverdue(task) {
  if (!task.due) return false
  const today = new Date().toISOString().split('T')[0]
  return task.due.date < today
}
