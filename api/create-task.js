import { buildTask, enrichNewTask } from './lib/taskWrite.js'

// Thin task-construction endpoint. Builds a canonical task through the single
// choke point (buildTask + enrichNewTask) and returns it — it does NOT write
// to the store; the caller persists it (saveToCache). Used by the app for
// notification-accept and subtask-add so those paths get the same shape,
// UUID id, and (future) AI enrichment as MCP/chat-created tasks.
//
// Posture: same-origin app endpoint (like /api/claude, /api/calendar) — it
// performs no persistence and returns no secrets. If server-side persistence
// is added later, this should be moved behind a token like the admin endpoints.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const b = req.body ?? {}
  if (!b.content || typeof b.content !== 'string') {
    return res.status(400).json({ error: 'content is required' })
  }

  try {
    const task = await enrichNewTask(buildTask({
      content: b.content,
      priority: b.priority,
      project_name: b.project_name ?? null,
      category: b.category ?? null,
      parent_id: b.parent_id ?? null,
      description: b.description ?? null,
      due: b.due ?? (b.due_date ? { date: b.due_date } : null),
    }))
    return res.status(200).json({ task })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
}
