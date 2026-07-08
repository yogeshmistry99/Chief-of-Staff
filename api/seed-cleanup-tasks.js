import { createClient } from '@supabase/supabase-js'

// One-shot endpoint: creates the technical debt cleanup tasks in the Systems
// bucket with category "Life OS". Trigger once from the browser after deployment.
// Idempotent — skips tasks whose content already exists in the cache.

const CLEANUP_TASKS = [
  { name: 'Snapshot task store before migrations',             priority: 2 },
  { name: 'Protect /api/sync-all-buckets with token auth',    priority: 2 },
  { name: 'Remove Todoist from create_task write path',        priority: 2 },
  { name: 'Add category field to MCP task tools',             priority: 3 },
  { name: 'Update CONTEXT.md — remove Todoist references',    priority: 3 },
  { name: 'Backfill six missing buckets from Todoist source', priority: 2 },
]

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const apiKey = process.env.MCP_API_KEY
  if (apiKey) {
    const token = req.query.token ?? req.headers['authorization']?.replace('Bearer ', '') ?? ''
    if (token !== apiKey) return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase env vars missing' })

  const sb = createClient(supabaseUrl, supabaseKey)
  const { data } = await sb.from('app_data').select('value').eq('key', 'todoist_task_cache').single()
  const existing = Array.isArray(data?.value) ? data.value : []
  const existingNames = new Set(existing.map(t => t.content))

  const toAdd = CLEANUP_TASKS
    .filter(t => !existingNames.has(t.name))
    .map(t => ({
      id: crypto.randomUUID(),
      content: t.name,
      priority: t.priority,
      due: null,
      is_completed: false,
      parent_id: null,
      description: 'Technical debt cleanup — Life OS session 2026-07-08',
      project_id: '6gmVXCmRw6X6cgpM',
      section_id: null,
      _projectName: 'Systems',
      _sectionName: null,
      _category: 'Life OS',
      created_at: new Date().toISOString(),
    }))

  if (toAdd.length) {
    await sb.from('app_data').upsert({
      key: 'todoist_task_cache',
      value: [...existing, ...toAdd],
      updated_at: new Date().toISOString(),
    })
  }

  return res.status(200).json({
    added: toAdd.length,
    skipped: CLEANUP_TASKS.length - toAdd.length,
    tasks: toAdd.map(t => ({ id: t.id, name: t.content, bucket: 'Systems', category: 'Life OS' })),
  })
}
