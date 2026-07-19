import { createClient } from '@supabase/supabase-js'
import { buildTask, enrichNewTask, aiScoreTask, isScored, validScore, validEffort, PROJECTS, PROJECT_NAMES } from './lib/taskWrite.js'

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

// Keep only the most recent 12 knowledge_backups rows (matches task_backups).
// Call after every insert so the table can never grow unbounded.
const MAX_KNOWLEDGE_BACKUPS = 12
async function pruneKnowledgeBackups(sb) {
  if (!sb) return
  const { data } = await sb
    .from('knowledge_backups').select('id').order('backed_up_at', { ascending: false })
  if (!data || data.length <= MAX_KNOWLEDGE_BACKUPS) return
  const toDelete = data.slice(MAX_KNOWLEDGE_BACKUPS).map((r) => r.id)
  await sb.from('knowledge_backups').delete().in('id', toDelete)
}

// ─── Todoist API helper (used for update/complete/delete of legacy tasks only) ─
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

// Tasks created locally (post-Todoist) have UUID ids; legacy Todoist tasks are all-numeric.
const isTodoistId = (id) => /^\d+$/.test(id)

// ─── Priority conversion ──────────────────────────────────────────────────────
// Life OS:  P1 (urgent) → P4 (low)
// Todoist:  priority 4 (urgent) → 1 (low)
function labelToTodoist(label) {
  const n = typeof label === 'string' ? parseInt(label.replace(/^p/i, '')) : label
  return Math.max(1, Math.min(4, 5 - (n || 4)))
}
function todoistToLabel(p) { return `P${5 - (p ?? 1)}` }

// ─── Head config helpers ──────────────────────────────────────────────────────
const HEADS = [
  { label: 'Chief of Staff', key: 'chief' },
  { label: 'Finance',  key: 'Finance'  },
  { label: 'Health',   key: 'Health'   },
  { label: 'Work',     key: 'Work'     },
  { label: 'Family',   key: 'Family'   },
  { label: 'Home',     key: 'Home'     },
  { label: 'Personal', key: 'Personal' },
  { label: 'Systems',  key: 'Systems'  },
]

function resolveHeadKey(head) {
  if (!head) throw new Error('head is required')
  const match = HEADS.find(
    (h) => h.label.toLowerCase() === head.toLowerCase() || h.key.toLowerCase() === head.toLowerCase()
  )
  if (!match) throw new Error(`Unknown head "${head}". Valid: ${HEADS.map((h) => h.label).join(', ')}`)
  return match.key
}

async function getHeadConfig(sb, key) {
  if (!sb) return null
  const { data } = await sb.from('app_data').select('value, updated_at').eq('key', `head_config_${key}`).single()
  return data ?? null
}

// ─── Tool implementations ─────────────────────────────────────────────────────

async function listTasks({ bucket, priority, status, category } = {}) {
  const sb = getSupabase()
  let tasks = await getTaskCache(sb)

  if (bucket) {
    tasks = tasks.filter((t) => t._projectName?.toLowerCase() === bucket.toLowerCase())
  }
  if (priority) {
    const tp = labelToTodoist(priority)
    tasks = tasks.filter((t) => t.priority === tp)
  }
  if (category) {
    tasks = tasks.filter((t) => t._category?.toLowerCase() === category.toLowerCase())
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
    category: t._category ?? null,
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
    category: task._category ?? null,
    priority: todoistToLabel(task.priority),
    due_date: task.due?.date ?? null,
    is_completed: task.is_completed ?? false,
    parent_id: task.parent_id ?? null,
    description: task.description ?? null,
    subtasks: subtasks.map((s) => ({ id: s.id, name: s.content, is_completed: s.is_completed ?? false })),
  }
}

async function createTask({ name, bucket, priority, due_date, parent_id, description, category }) {
  if (!name) throw new Error('name is required')

  // Construct through the single choke point (api/lib/taskWrite.js).
  const newTask = await enrichNewTask(buildTask({
    content: name,
    priority: priority ? labelToTodoist(priority) : 1,
    project_name: bucket ?? null,
    category: category ?? null,
    parent_id: parent_id ?? null,
    description: description ?? null,
    due: due_date ? { date: due_date } : null,
  }))

  const sb = getSupabase()
  const tasks = await getTaskCache(sb)
  await saveTaskCache(sb, [...tasks, newTask])

  return {
    id: newTask.id,
    name: newTask.content,
    bucket: newTask._projectName ?? null,
    category: newTask._category ?? null,
    priority: todoistToLabel(newTask.priority),
    due_date: due_date ?? null,
    is_completed: false,
    consequence: newTask.consequence,
    reversibility: newTask.reversibility,
    compounding: newTask.compounding,
    effort: newTask.effort,
    pinned: newTask.pinned === true,
  }
}

async function updateTask({ id, name, priority, due_date, description, bucket, category, parent_id, is_completed, consequence, reversibility, compounding, effort, pinned }) {
  if (!id) throw new Error('id is required')

  const sb = getSupabase()
  const tasks = await getTaskCache(sb)
  const existing = tasks.find((t) => t.id === id)
  if (!existing) throw new Error(`Task ${id} not found`)

  const body = {}
  if (name !== undefined)        body.content     = name
  if (description !== undefined) body.description = description
  if (priority)                  body.priority    = labelToTodoist(priority)
  if (due_date === 'remove')     body.due_string  = 'no date'
  else if (due_date)             body.due_string  = due_date
  let newBucketName
  if (bucket) {
    const entry = Object.entries(PROJECTS).find(([n]) => n.toLowerCase() === bucket.toLowerCase())
    if (!entry) throw new Error(`Unknown bucket "${bucket}"`)
    body.project_id = entry[1]
    newBucketName = entry[0]
  }

  let updated = { ...existing }
  if (isTodoistId(id)) {
    const result = await todoistFetch(`tasks/${id}`, 'POST', body)
    updated = { ...existing, ...result }
  } else {
    if (body.content !== undefined)     updated.content     = body.content
    if (body.description !== undefined) updated.description = body.description
    if (body.priority !== undefined)    updated.priority    = body.priority
    if (due_date === 'remove')          updated.due         = null
    else if (due_date)                  updated.due         = { date: due_date }
    if (body.project_id)               updated.project_id  = body.project_id
  }

  const newCategory = category !== undefined ? (category || null) : (existing._category ?? null)
  const newParentId = parent_id !== undefined ? (parent_id || null) : (existing.parent_id ?? null)
  const newCompleted = is_completed !== undefined ? !!is_completed : (updated.is_completed ?? existing.is_completed ?? false)
  // Keep completed_at consistent with the app's own restore/complete behaviour.
  const newCompletedAt = is_completed !== undefined
    ? (newCompleted ? (existing.completed_at ?? new Date().toISOString()) : null)
    : (existing.completed_at ?? null)

  // Scoring fields — explicit inputs win (correctable from Claude.ai);
  // otherwise keep existing values.
  const scoring = {
    consequence: consequence !== undefined ? validScore(consequence) : (existing.consequence ?? null),
    reversibility: reversibility !== undefined ? validScore(reversibility) : (existing.reversibility ?? null),
    compounding: compounding !== undefined ? validScore(compounding) : (existing.compounding ?? null),
    effort: effort !== undefined ? validEffort(effort) : (existing.effort ?? null),
  }
  const newPinned = pinned !== undefined ? pinned === true : (existing.pinned === true)

  // Lazy backfill: score on touch. If the task is still unscored after
  // applying explicit inputs, try one AI scoring pass — fail open.
  if (!isScored(scoring) && !newCompleted) {
    const ai = await aiScoreTask({ ...existing, ...updated, _projectName: newBucketName ?? existing._projectName })
    if (ai) {
      scoring.consequence = scoring.consequence ?? ai.consequence
      scoring.reversibility = scoring.reversibility ?? ai.reversibility
      scoring.compounding = scoring.compounding ?? ai.compounding
      scoring.effort = scoring.effort ?? ai.effort
    }
  }

  await saveTaskCache(sb, tasks.map((t) =>
    t.id === id ? { ...t, ...updated, _projectName: newBucketName ?? t._projectName, _category: newCategory, parent_id: newParentId, is_completed: newCompleted, completed_at: newCompletedAt, ...scoring, pinned: newPinned } : t
  ))

  return {
    id: updated.id ?? id,
    name: updated.content,
    bucket: newBucketName ?? existing._projectName ?? null,
    category: newCategory,
    parent_id: newParentId,
    priority: todoistToLabel(updated.priority),
    due_date: updated.due?.date ?? null,
    is_completed: newCompleted,
    consequence: scoring.consequence,
    reversibility: scoring.reversibility,
    compounding: scoring.compounding,
    effort: scoring.effort,
    pinned: newPinned,
  }
}

async function completeTask({ id }) {
  if (!id) throw new Error('id is required')
  if (isTodoistId(id)) await todoistFetch(`tasks/${id}/close`, 'POST')

  const sb = getSupabase()
  const tasks = await getTaskCache(sb)
  await saveTaskCache(sb, tasks.map((t) => (t.id === id ? { ...t, is_completed: true } : t)))

  return { id, is_completed: true }
}

async function deleteTask({ id }) {
  if (!id) throw new Error('id is required')
  if (isTodoistId(id)) await todoistFetch(`tasks/${id}`, 'DELETE')

  const sb = getSupabase()
  const tasks = await getTaskCache(sb)
  await saveTaskCache(sb, tasks.filter((t) => t.id !== id))

  return { id, deleted: true }
}

async function getRoadmap() {
  const sb = getSupabase()
  if (!sb) return { content: null }
  const { data } = await sb.from('app_data').select('value, updated_at').eq('key', 'app_roadmap').single()
  return { content: data?.value ?? null, updated_at: data?.updated_at ?? null }
}

async function updateRoadmap({ content }) {
  if (content === undefined || content === null) throw new Error('content is required')
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase not configured')

  // Back up current value
  const { data: current } = await sb.from('app_data').select('value, updated_at').eq('key', 'app_roadmap').single()
  if (current?.value !== undefined) {
    await sb.from('knowledge_backups').insert({
      head_key: 'app_roadmap',
      backed_up_at: new Date().toISOString(),
      value: { content: current.value, updated_at: current.updated_at },
    })
    await pruneKnowledgeBackups(sb)
  }

  const updatedAt = new Date().toISOString()
  await sb.from('app_data').upsert({ key: 'app_roadmap', value: content, updated_at: updatedAt })
  return { content, updated_at: updatedAt }
}

async function listHeads() {
  return HEADS.map((h) => ({ name: h.label, key: h.key }))
}

async function getKnowledge({ head }) {
  const key = resolveHeadKey(head)
  const sb = getSupabase()
  const row = await getHeadConfig(sb, key)
  return {
    head,
    instructions:  row?.value?.instructions ?? null,
    context:       row?.value?.context ?? null,
    model:         row?.value?.model ?? null,
    updated_at:    row?.updated_at ?? null,
  }
}

async function updateKnowledge({ head, instructions, context }) {
  if (instructions === undefined && context === undefined) {
    throw new Error('At least one of instructions or context must be provided')
  }
  const key = resolveHeadKey(head)
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase not configured')

  // Load current record
  const current = await getHeadConfig(sb, key)
  const currentValue = current?.value ?? {}

  // Back up current values before overwriting
  const backup = {
    head_key:     key,
    backed_up_at: new Date().toISOString(),
    value:        currentValue,
  }
  await sb.from('knowledge_backups').insert(backup)
  await pruneKnowledgeBackups(sb)

  // Merge only the fields provided
  const newValue = {
    ...currentValue,
    ...(instructions !== undefined ? { instructions } : {}),
    ...(context      !== undefined ? { context }      : {}),
  }
  const updatedAt = new Date().toISOString()
  await sb.from('app_data').upsert({ key: `head_config_${key}`, value: newValue, updated_at: updatedAt })

  return {
    head,
    instructions:  newValue.instructions ?? null,
    context:       newValue.context ?? null,
    model:         newValue.model ?? null,
    updated_at:    updatedAt,
  }
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
    description: 'Return tasks from the Life OS task store. Optionally filter by bucket name, priority (P1–P4), status, or category.',
    inputSchema: {
      type: 'object',
      properties: {
        bucket:   { type: 'string', description: 'Bucket name: Finance, Health, Home, Work, Family, Personal, or Systems' },
        priority: { type: 'string', description: 'Priority label: P1 (highest), P2, P3, or P4 (lowest)' },
        status:   { type: 'string', enum: ['active', 'completed', 'all'], description: 'Default: active' },
        category: { type: 'string', description: 'Filter by category label (e.g. "Life OS", "Work", "Admin")' },
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
    description: 'Create a new task in the Life OS task store.',
    inputSchema: {
      type: 'object',
      properties: {
        name:        { type: 'string',  description: 'Task title (required)' },
        bucket:      { type: 'string',  description: 'Bucket: Finance, Health, Home, Work, Family, Personal, or Systems' },
        priority:    { type: 'string',  description: 'Priority: P1, P2, P3, or P4' },
        due_date:    { type: 'string',  description: 'Due date YYYY-MM-DD' },
        parent_id:   { type: 'string',  description: 'Parent task ID to create a subtask' },
        description: { type: 'string',  description: 'Optional notes/description' },
        category:    { type: 'string',  description: 'Optional category label (e.g. "Life OS", "Admin", "Work")' },
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
        category:    { type: 'string', description: 'Set or update the category label' },
        parent_id:   { type: 'string', description: 'Re-parent under another task ID, or "" to clear the parent' },
        is_completed:{ type: 'boolean', description: 'Set completion state — true to complete, false to reopen' },
        consequence: { type: 'integer', description: 'Priority scoring: consequence 1–5 (5 = life-altering impact)' },
        reversibility:{ type: 'integer', description: 'Priority scoring: reversibility 1–5 (5 = window closes forever)' },
        compounding: { type: 'integer', description: 'Priority scoring: compounding leverage 1–5 (5 = foundational)' },
        effort:      { type: 'string', enum: ['S', 'M', 'L'], description: 'Priority scoring: effort size — S <30min, M half-day, L multi-day' },
        pinned:      { type: 'boolean', description: 'Pin the task to the top of its ranking tier (manual override)' },
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
  {
    name: 'get_roadmap',
    description: 'Return the current Development Roadmap content from Supabase (key: app_roadmap). Returns the stored value (JSON array of phases) and its last-updated timestamp, or null content if not yet set.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'update_roadmap',
    description: 'Write new roadmap content to Supabase (key: app_roadmap). Backs up the current value to knowledge_backups before writing. The content should be a JSON array of phase objects matching the roadmap schema used by the Settings UI.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { description: 'New roadmap content — JSON array of phase objects, or any value the Settings UI understands' },
      },
      required: ['content'],
    },
  },
  {
    name: 'list_heads',
    description: 'Return all available Life OS heads (Chief of Staff, Finance, Health, Work, Family, Home, Personal, Systems).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_knowledge',
    description: 'Return the instructions and context currently saved for a Life OS head, including last updated timestamp. Returns null fields if nothing has been saved yet.',
    inputSchema: {
      type: 'object',
      properties: {
        head: { type: 'string', description: 'Head name: Chief of Staff, Finance, Health, Work, Family, Home, Personal, or Systems' },
      },
      required: ['head'],
    },
  },
  {
    name: 'update_knowledge',
    description: 'Update the instructions and/or context for a Life OS head. Saves the current values to a knowledge_backups table before writing, so changes can be reverted. Only provided fields are updated.',
    inputSchema: {
      type: 'object',
      properties: {
        head:         { type: 'string', description: 'Head name: Chief of Staff, Finance, Health, Work, Family, Home, Personal, or Systems' },
        instructions: { type: 'string', description: 'New instructions text (omit to leave unchanged)' },
        context:      { type: 'string', description: 'New context text (omit to leave unchanged)' },
      },
      required: ['head'],
    },
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
    case 'list_buckets':    return listBuckets()
    case 'get_roadmap':      return getRoadmap()
    case 'update_roadmap':   return updateRoadmap(args)
    case 'list_heads':       return listHeads()
    case 'get_knowledge':   return getKnowledge(args)
    case 'update_knowledge': return updateKnowledge(args)
    default: throw new Error(`Unknown tool: ${name}`)
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Mcp-Session-Id')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Token auth via query param (?token=xxx) — compatible with Claude.ai custom connectors
  const apiKey = process.env.MCP_API_KEY
  if (apiKey) {
    const token = req.query.token ?? ''
    if (token !== apiKey) {
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
