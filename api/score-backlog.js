import { createClient } from '@supabase/supabase-js'
import { aiScoreTask, isScored } from './_lib/taskWrite.js'
import { listTasks, updateTask } from './_lib/tasksRepo.js'

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
  // rescore=1 re-scores tasks that are ALREADY scored (e.g. after a rubric
  // change) instead of only filling in unscored ones. bucket=<name> narrows
  // to a single bucket. Default (no rescore) is the original backlog-fill mode.
  const rescore = req.query.rescore === '1' || req.query.rescore === 'true'
  const bucket = typeof req.query.bucket === 'string' ? req.query.bucket : null

  let tasks
  try {
    tasks = await listTasks(sb)
  } catch (e) {
    return res.status(500).json({ error: `Task read failed: ${e.message}` })
  }

  const matches = (t) => !t.is_completed && !t.parent_id
    && (rescore ? isScored(t) : !isScored(t))
    && (!bucket || (t._projectName ?? '').toLowerCase() === bucket.toLowerCase())
  const pool = tasks.filter(matches)
  const candidates = pool
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
    .slice(0, n)

  const results = { mode: rescore ? 'rescore' : 'backfill', bucket: bucket ?? 'all', pool: pool.length, scored: 0, failed: 0, remaining: Math.max(0, pool.length - candidates.length), tasks: [] }
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

  // Write each task's scores to its own row, touching only the four score
  // columns. No re-read-and-merge window to lose against any more.
  for (const [id, scores] of scoreById) {
    try {
      await updateTask(sb, id, scores)
    } catch (e) {
      results.scored--
      results.failed++
      const entry = results.tasks.find((r) => r.id === id)
      if (entry) entry.error = `score computed but NOT saved: ${e.message}`
    }
  }

  return res.status(200).json(results)
}
