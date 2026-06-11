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
  const data = await res.json()
  // v1 API wraps results in { results: [...] }
  return Array.isArray(data) ? data : (data.results ?? data)
}

// All tasks across all 7 projects — fetch per-project to avoid pagination gaps
export async function getAllTasks() {
  const projectIds = Object.values(PROJECTS)
  const [taskResults, sectionResults] = await Promise.all([
    Promise.all(projectIds.map((id) => getProjectTasks(id))),
    Promise.all(projectIds.map((id) => getProjectSections(id))),
  ])
  const sectionMap = {}
  sectionResults.flat().forEach((s) => { sectionMap[s.id] = s.name })
  return taskResults.flat().map((t) => ({ ...t, _sectionName: sectionMap[t.section_id] ?? null }))
}

// Tasks for a single project
export async function getProjectTasks(projectId) {
  return get('tasks', { project_id: projectId })
}

// Sections for a single project
export async function getProjectSections(projectId) {
  return get('sections', { project_id: projectId })
}


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
  const _d = new Date(); const today = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`
  return task.due.date.slice(0, 10) === today
}

export function isOverdue(task) {
  if (!task.due) return false
  const _d = new Date(); const today = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`
  return task.due.date.slice(0, 10) < today
}
