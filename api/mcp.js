import { createClient } from '@supabase/supabase-js'

// ─── Bucket → Todoist project ID map ─────────────────────────────────────────
const PROJECTS = {
  Finance:  '6gmVXCpMmXX8V5MV',
  Health:   '6gmVXCm3jxXfXVWw',
  Home:     '6gmVXCpQQxw3gFgw',
  Work:     '6gmVXCv7j946mv75',
  Family:   '6gmVXCpr8mc6mjjX',
  Personal: '6gmcXJpGfj6gh4Gc',
  Systems:  '6gmVXCmRw6X6cgpM',
}
const PROJECT_NAMES = Object.fromEntries(Object.entries(PROJECTS).map(([n, id]) => [id, n]))

// ─── Supabase helpers ─────────────────────────────────────────────────────────
function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function getTaskCache(sb) {
  if (!sb) return []
  const { data } = await sb.from('app_data').select('value').eq('key', 'todoist_task_cache').single()
  const tasks = data?.value
  if (!Array.isArray(tasks)) return []
  return tasks.map((t) => ({ ...t, _projectName: t._projectName ?? PROJECT_NAMES[t.project_id] ?? null }))
}

async function saveTaskCache(sb, tasks) {
  if (!sb) return
  await sb.from('app_data').upsert({ key: 'todoist_task_cache', value: tasks, updated_at: new Date().toISOString() })
}

// ─── Todoist API helper ───────────────────────────────────────────────────────
async function todoistFetch(path, method = 'GET', body = null) {
  const apiKey = process.env.TODOIST_API_KEY
  if (!apiKey) throw new Error('TODOIST_API_KEY not configured')
  const res = await fetch(`https://api.todoist.com/api/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) throw new Error(`Todoist ${method} /${path}: ${res.status} ${await res.text()}`)
  if (res.status === 204 || method === 'DELETE') return null
  return res.json()
}

// ─── Priority conversion ──────────────────────────────────────────────────────
// Life OS:  P1 (urgent) → P4 (low)
// Todoist:  priority 4 (urgent) → 1 (low)
function labelToTodoist(label) {
  const n = typeof label === 'string' ? parseInt(label.replace(/^p/i, '')) : label
  return Math.max(1, Math.min(4, 5 - (n || 4)))
}
function todoistToLabel(p) { return `P${5 - (p ?? 1)}` }

// ─── Tool implementations ─────────────────────────────────────────────────────

async function listTasks({ bucket, priority, status } = {}) {
  const sb = getSupabase()
  let tasks = await getTaskCache(sb)

  if (bucket) {
    tasks = tasks.filter((t) => t._projectName?.toLowerCase() === bucket.toLowerCase())
  }
  if (priority) {
    const tp = labelToTodoist(priority)
    tasks = tasks.filter((t) => t.priority === tp)
  }
  if (status === 'completed') {
    tasks = tasks.filter((t) => t.is_completed)
  } else if (!status || status === 'active') {
    tasks = tasks.filter((t) => !t.is_completed)
  }
  // status === 'all' → no filter

  return tasks.map((t) => ({
    id: t.id,
    name: t.content,
    bucket: t._projectName ?? null,
    priority: todoistToLabel(t.priority),
    due_date: t.due?.date ?? null,
    is_completed: t.is_completed ?? false,
    parent_id: t.parent_id ?? null,
    description: t.description ?? null,
  }))
}

async function getTask({ id }) {
  if (!id) throw new Error('id is required')
  const sb = getSupabase()
  const tasks = await getTaskCache(sb)
  const task = tasks.find((t) => t.id === id)
  if (!task) throw new Error(`Task ${id} not found`)
  const subtasks = tasks.filter((t) => t.parent_id === id)
  return {
    id: task.id,
    name: task.content,
    bucket: task._projectName ?? null,
    priority: todoistToLabel(task.priority),
    due_date: task.due?.date ?? null,
    is_completed: task.is_completed ?? false,
    parent_id: task.parent_id ?? null,
    description: task.description ?? null,
    subtasks: subtasks.map((s) => ({ id: s.id, name: s.content, is_completed: s.is_completed ?? false })),
  }
}

async function createTask({ name, bucket, priority, due_date, parent_id, description }) {
  if (!name) throw new Error('name is required')

  let project_id = null
  if (bucket) {
    const entry = Object.entries(PROJECTS).find(([n]) => n.toLowerCase() === bucket.toLowerCase())
    if (!entry) throw new Error(`Unknown bucket "${bucket}". Valid: ${Object.keys(PROJECTS).join(', ')}`)
    project_id = entry[1]
  }

  const body = { content: name, priority: priority ? labelToTodoist(priority) : 1 }
  if (project_id) body.project_id = project_id
  if (due_date)   body.due_string  = due_date
  if (parent_id)  body.parent_id   = parent_id
  if (description) body.description = description

  const newTask = await todoistFetch('tasks', 'POST', body)

  const sb = getSupabase()
  const tasks = await getTaskCache(sb)
  const withName = { ...newTask, _projectName: project_id ? PROJECT_NAMES[project_id] : null }
  await saveTaskCache(sb, [...tasks, withName])

  return {
    id: newTask.id,
    name: newTask.content,
    bucket: withName._projectName ?? null,
    priority: todoistToLabel(newTask.priority),
    due_date: newTask.due?.date ?? null,
    is_completed: false,
  }
}

async function updateTask({ id, name, priority, due_date, description, bucket }) {
  if (!id) throw new Error('id is required')

  const body = {}
  if (name)              body.content     = name
  if (description !== undefined) body.description = description
  if (priority)          body.priority    = labelToTodoist(priority)
  if (due_date === 'remove') body.due_string = 'no date'
  else if (due_date)     body.due_string  = due_date
  if (bucket) {
    const entry = Object.entries(PROJECTS).find(([n]) => n.toLowerCase() === bucket.toLowerCase())
    if (!entry) throw new Error(`Unknown bucket "${bucket}"`)
    body.project_id = entry[1]
  }

  const updated = await todoistFetch(`tasks/${id}`, 'POST', body)

  const sb = getSupabase()
  const tasks = await getTaskCache(sb)
  const newBucketName = body.project_id ? PROJECT_NAMES[body.project_id] : undefined
  await saveTaskCache(sb, tasks.map((t) =>
    t.id === id ? { ...t, ...updated, _projectName: newBucketName ?? t._projectName } : t
  ))

  return {
    id: updated.id,
    name: updated.content,
    bucket: newBucketName ?? (tasks.find((t) => t.id === id)?._projectName ?? null),
    priority: todoistToLabel(updated.priority),
    due_date: updated.due?.date ?? null,
    is_completed: updated.is_completed ?? false,
  }
}

async function completeTask({ id }) {
  if (!id) throw new Error('id is required')
  await todoistFetch(`tasks/${id}/close`, 'POST')

  const sb = getSupabase()
  const tasks = await getTaskCache(sb)
  await saveTaskCache(sb, tasks.map((t) => (t.id === id ? { ...t, is_completed: true } : t)))

  return { id, is_completed: true }
}

async function deleteTask({ id }) {
  if (!id) throw new Error('id is required')
  await todoistFetch(`tasks/${id}`, 'DELETE')

  const sb = getSupabase()
  const tasks = await getTaskCache(sb)
  await saveTaskCache(sb, tasks.filter((t) => t.id !== id))

  return { id, deleted: true }
}

async function listBuckets() {
  const sb = getSupabase()
  const tasks = await getTaskCache(sb)
  const active = tasks.filter((t) => !t.is_completed)
  return Object.keys(PROJECTS).map((name) => ({
    name,
    active_tasks: active.filter((t) => t._projectName === name).length,
    total_tasks:  tasks.filter((t)  => t._projectName === name).length,
  }))
}

// ─── Tool registry ────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'list_tasks',
    description: 'Return tasks from the Life OS task store. Optionally filter by bucket name, priority (P1–P4), or status.',
    inputSchema: {
      type: 'object',
      properties: {
        bucket:   { type: 'string', description: 'Bucket name: Finance, Health, Home, Work, Family, Personal, or Systems' },
        priority: { type: 'string', description: 'Priority label: P1 (highest), P2, P3, or P4 (lowest)' },
        status:   { type: 'string', enum: ['active', 'completed', 'all'], description: 'Default: active' },
      },
    },
  },
  {
    name: 'get_task',
    description: 'Return a single task and its subtasks by ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Task ID' } },
      required: ['id'],
    },
  },
  {
    name: 'create_task',
    description: 'Create a new task in Life OS (written to Todoist and the live task store).',
    inputSchema: {
      type: 'object',
      properties: {
        name:        { type: 'string',  description: 'Task title (required)' },
        bucket:      { type: 'string',  description: 'Bucket: Finance, Health, Home, Work, Family, Personal, or Systems' },
        priority:    { type: 'string',  description: 'Priority: P1, P2, P3, or P4' },
        due_date:    { type: 'string',  description: 'Due date as natural language ("tomorrow", "next Friday") or YYYY-MM-DD' },
        parent_id:   { type: 'string',  description: 'Parent task ID to create a subtask' },
        description: { type: 'string',  description: 'Optional notes/description' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_task',
    description: 'Update any fields of an existing task by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id:          { type: 'string', description: 'Task ID to update (required)' },
        name:        { type: 'string', description: 'New task title' },
        priority:    { type: 'string', description: 'New priority: P1, P2, P3, or P4' },
        due_date:    { type: 'string', description: 'New due date, or "remove" to clear it' },
        description: { type: 'string', description: 'New description' },
        bucket:      { type: 'string', description: 'Move task to a different bucket' },
      },
      required: ['id'],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as complete by ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Task ID to complete' } },
      required: ['id'],
    },
  },
  {
    name: 'delete_task',
    description: 'Permanently delete a task by ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Task ID to delete' } },
      required: ['id'],
    },
  },
  {
    name: 'list_buckets',
    description: 'Return all 7 Life OS buckets (Finance, Health, Home, Work, Family, Personal, Systems) with active and total task counts.',
    inputSchema: { type: 'object', properties: {} },
  },
]

async function callTool(name, args) {
  switch (name) {
    case 'list_tasks':    return listTasks(args)
    case 'get_task':      return getTask(args)
    case 'create_task':   return createTask(args)
    case 'update_task':   return updateTask(args)
    case 'complete_task': return completeTask(args)
    case 'delete_task':   return deleteTask(args)
    case 'list_buckets':  return listBuckets()
    default: throw new Error(`Unknown tool: ${name}`)
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Mcp-Session-Id')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Bearer token auth
  const apiKey = process.env.MCP_API_KEY
  if (apiKey) {
    const auth = req.headers.authorization ?? ''
    if (!auth.startsWith('Bearer ') || auth.slice(7) !== apiKey) {
      return res.status(401).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Unauthorized' } })
    }
  }

  // Minimal GET for SSE transport compatibility (Claude.ai uses POST primarily)
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.write(': Life OS MCP server ready\n\n')
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000)
    req.on('close', () => clearInterval(keepAlive))
    return
  }

  if (req.method !== 'POST') return res.status(405).end()

  const { id, method, params } = req.body ?? {}

  // Notifications (no id) — acknowledge silently
  if (id === undefined || id === null) return res.status(202).end()

  const ok  = (result) => res.json({ jsonrpc: '2.0', id, result })
  const err = (code, message) => res.json({ jsonrpc: '2.0', id, error: { code, message } })

  try {
    switch (method) {
      case 'initialize':
        return ok({
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'life-os-mcp', version: '1.0.0' },
        })

      case 'tools/list':
        return ok({ tools: TOOLS })

      case 'tools/call': {
        const { name, arguments: args = {} } = params ?? {}
        if (!name) return err(-32602, 'Missing tool name')
        try {
          const result = await callTool(name, args)
          return ok({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] })
        } catch (e) {
          return ok({ content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true })
        }
      }

      case 'ping':
        return ok({})

      default:
        return err(-32601, `Method not found: ${method}`)
    }
  } catch (e) {
    return err(-32603, `Internal error: ${e.message}`)
  }
}
