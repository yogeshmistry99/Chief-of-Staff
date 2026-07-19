// Canonical task construction — THE single choke point for creating a task.
//
// Every create path must build its task object here so all tasks share one
// shape and one id scheme (crypto.randomUUID; the legacy `local_` minting is
// retired). This is also the single place where future AI category
// auto-assignment and priority scoring will hook, via enrichNewTask.
//
// Callers: api/mcp.js createTask, api/claude.js executeTool create_task, and
// api/create-task.js (used by the app: notifications accept + subtask add).

export const PROJECTS = {
  Finance:  '6gmVXCpMmXX8V5MV',
  Health:   '6gmVXCm3jxXfXVWw',
  Home:     '6gmVXCpQQxw3gFgw',
  Work:     '6gmVXCv7j946mv75',
  Family:   '6gmVXCpr8mc6mjjX',
  Personal: '6gmcXJpGfj6gh4Gc',
  Systems:  '6gmVXCmRw6X6cgpM',
}
export const PROJECT_NAMES = Object.fromEntries(Object.entries(PROJECTS).map(([n, id]) => [id, n]))

function resolveProject(project_name) {
  if (!project_name) return { bucketName: null, project_id: null }
  const entry = Object.entries(PROJECTS).find(
    ([n]) => n.toLowerCase() === String(project_name).toLowerCase()
  )
  if (!entry) throw new Error(`Unknown bucket "${project_name}". Valid: ${Object.keys(PROJECTS).join(', ')}`)
  return { bucketName: entry[0], project_id: entry[1] }
}

// Build a canonical task object from a normalized input:
//   content     (required) — task title
//   priority    (int 1–4, 4=urgent; defaults to 1)
//   project_name(bucket name) or null
//   category    or null
//   parent_id   or null
//   description or null
//   due         ({ date: 'YYYY-MM-DD' } object) or null
export function buildTask(input = {}) {
  if (!input.content) throw new Error('content is required')
  const { bucketName, project_id } = resolveProject(input.project_name)
  const p = Number.isInteger(input.priority) ? input.priority : 1
  return {
    id: crypto.randomUUID(),
    content: input.content,
    priority: p >= 1 && p <= 4 ? p : 1,
    due: input.due ?? null,
    is_completed: false,
    completed_at: null,
    parent_id: input.parent_id ?? null,
    description: input.description ?? null,
    project_id,
    section_id: null,
    _projectName: bucketName,
    _sectionName: null,
    _category: input.category ?? null,
    created_at: new Date().toISOString(),
  }
}

// Future hook for AI category auto-assignment and priority scoring.
// Currently a no-op pass-through — scoring/categorisation is NOT implemented
// yet. When it is, this is the one place it lands.
export async function enrichNewTask(task) {
  return task
}
