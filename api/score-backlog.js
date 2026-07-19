import { createClient } from '@supabase/supabase-js'
import { aiScoreTask, isScored } from './_lib/taskWrite.js'

// Manually-triggered batch scorer: scores the N oldest unscored ACTIVE
// top-level tasks per call (default 10, max 25), so the backlog gets chipped
// away deliberately — no forced full-store migration. Auth: same pattern as
// the other admin endpoints (MCP_API_KEY or CRON_SECRET via ?token= / bearer).
// GET /api/score-backlog?token=...&n=10

function authorized(req) {
  const bearer = (req.headers['authorization'] ?? '').replace('Bearer ', '')
  const token = req.query.token ?? bearer ?? ''
  const cronSecret = process.env.CRON_SECRET
  const mcpKey = process.env.MCP_API_KEY
  if (cronSecret && (bearer === cronSecret || token === cronSecret)) return true
  if (mcpKey && token === mcpKey) return true
  return false
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' })

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase env vars missing' })
  const sb = createClient(supabaseUrl, supabaseKey)

  const n = Math.min(Math.max(parseInt(req.query.n, 10) || 10, 1), 25)

  const { data, error } = await sb.from('app_data').select('value').eq('key', 'todoist_task_cache').single()
  if (error) return res.status(500).json({ error: `Read failed: ${error.message}` })
  const tasks = Array.isArray(data?.value) ? data.value : []

  const candidates = tasks
    .filter((t) => !t.is_completed && !t.parent_id && !isScored(t))
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
    .slice(0, n)

  const results = { scored: 0, failed: 0, remaining_unscored: 0, tasks: [] }
  const scoreById = new Map()
  for (const t of candidates) {
    const scores = await aiScoreTask(t)
    if (scores) {
      scoreById.set(t.id, scores)
      results.scored++
      results.tasks.push({ id: t.id, content: t.content, ...scores })
    } else {
      results.failed++
      results.tasks.push({ id: t.id, content: t.content, error: 'scoring failed' })
    }
  }

  if (scoreById.size) {
    // Re-read before writing to shrink the clobber window against concurrent
    // writers, then merge scores by id — never a blind overwrite of edits.
    const { data: fresh } = await sb.from('app_data').select('value').eq('key', 'todoist_task_cache').single()
    const current = Array.isArray(fresh?.value) ? fresh.value : tasks
    const merged = current.map((t) => (scoreById.has(t.id) ? { ...t, ...scoreById.get(t.id) } : t))
    await sb.from('app_data').upsert({ key: 'todoist_task_cache', value: merged, updated_at: new Date().toISOString() })
    results.remaining_unscored = merged.filter((t) => !t.is_completed && !t.parent_id && !isScored(t)).length
  } else {
    results.remaining_unscored = tasks.filter((t) => !t.is_completed && !t.parent_id && !isScored(t)).length
  }

  return res.status(200).json(results)
}
