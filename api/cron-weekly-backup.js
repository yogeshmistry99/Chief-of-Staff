import { createClient } from '@supabase/supabase-js'
import { snapshotTasks } from './_lib/tasksRepo.js'

// Server-side weekly task-store backup. Registered as a Vercel cron in
// vercel.json (Sundays 08:00 UTC). Replaces the old client-side backup that
// only ran if the app happened to be opened in a browser on a Sunday.
//
// Auth: accepts EITHER the Vercel-injected `Authorization: Bearer <CRON_SECRET>`
// header (automated cron calls) OR `?token=<MCP_API_KEY>` / bearer MCP_API_KEY
// (manual triggers, same scheme as /api/sync-all-buckets).

const MAX_SNAPSHOTS = 12

function authorized(req) {
  const bearer = (req.headers['authorization'] ?? '').replace('Bearer ', '')
  const token = req.query.token ?? bearer ?? ''
  const cronSecret = process.env.CRON_SECRET
  const mcpKey = process.env.MCP_API_KEY
  // Accept the Vercel-injected CRON_SECRET (bearer, on scheduled runs) or
  // either secret via bearer/?token= for manual triggers. No secret → deny.
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

  const isForced = req.query.force === '1' || req.query.force === 'true'

  // Dedupe: never store two weekly snapshots in the same week. The browser
  // Sunday backup and this cron can both fire on a Sunday; whichever runs first
  // wins, the other skips — so a week never eats two of the 12 snapshot slots.
  // `?force=1` (still auth-gated) bypasses this for manual verification.
  if (!isForced) {
    const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recent } = await sb
      .from('task_backups').select('id, label, created_at')
      .ilike('label', 'Weekly backup%').gte('created_at', weekAgo).limit(1)
    if (recent && recent.length) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'weekly snapshot already exists this week', existing: recent[0] })
    }
  }

  // Read LIVE task rows. This used to read app_data.todoist_task_cache — now a
  // frozen fallback — which would have quietly produced weekly "backups" of a
  // list that never changes again, making every restore point worthless while
  // still reporting success.
  let tasks
  try {
    tasks = await snapshotTasks(sb)
  } catch (e) {
    return res.status(500).json({ error: `Task read failed: ${e.message}` })
  }
  // Never write an empty or absurdly small snapshot over the rotation — that
  // would burn a slot and could push a good backup out of the 12 kept.
  if (!tasks.length) {
    return res.status(500).json({ error: 'Refusing to back up: task read returned 0 rows' })
  }

  const now = new Date().toISOString()
  const label = `Weekly backup ${isForced ? '(manual)' : '(cron)'} — ${now.slice(0, 10)}`
  const { error: insErr } = await sb
    .from('task_backups')
    .insert({ label, tasks, task_count: tasks.length, created_at: now })
  if (insErr) return res.status(500).json({ error: `Insert failed: ${insErr.message}` })

  // Prune to the most recent MAX_SNAPSHOTS
  const { data: all } = await sb
    .from('task_backups').select('id, created_at').order('created_at', { ascending: false })
  let pruned = 0
  if (all && all.length > MAX_SNAPSHOTS) {
    const toDelete = all.slice(MAX_SNAPSHOTS).map((r) => r.id)
    await sb.from('task_backups').delete().in('id', toDelete)
    pruned = toDelete.length
  }

  // Refresh the frozen fallback blob FROM live rows. app_data.todoist_task_cache
  // is kept as the emergency fallback but nothing reads it in normal operation;
  // refreshing it here means the fallback is at most a week stale instead of
  // frozen at cutover. This is a one-directional derived snapshot — it is never
  // read back into the write path, so it cannot resurrect the overwrite bug.
  let fallbackRefreshed = false
  const { error: fbErr } = await sb.from('app_data').upsert({
    key: 'todoist_task_cache', value: tasks, updated_at: now,
  })
  if (fbErr) console.warn('fallback blob refresh failed', fbErr.message)
  else fallbackRefreshed = true

  return res.status(200).json({ ok: true, label, task_count: tasks.length, pruned, kept: MAX_SNAPSHOTS, fallbackRefreshed })
}
