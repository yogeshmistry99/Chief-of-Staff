import { createClient } from '@supabase/supabase-js'

// Fetches all tasks from all 7 Todoist projects and merges them into the
// Supabase task cache. Safe to run multiple times — deduplicates by task ID
// and never overwrites tasks that already exist in the cache.
// Trigger by visiting /api/sync-all-buckets (GET) from the deployed app.

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

async function todoistGet(path, apiKey) {
  const res = await fetch(`https://api.todoist.com/api/v1/${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`Todoist GET /${path}: ${res.status} ${await res.text()}`)
  const data = await res.json()
  if (Array.isArray(data)) return data
  return data.tasks ?? data.results ?? data
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const todoistKey = process.env.TODOIST_API_KEY
  if (!todoistKey) return res.status(500).json({ error: 'TODOIST_API_KEY not configured' })

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase env vars missing' })

  const sb = createClient(supabaseUrl, supabaseKey)

  // Read existing cache from Supabase
  const { data: existing } = await sb.from('app_data').select('value').eq('key', 'todoist_task_cache').single()
  const existingTasks = Array.isArray(existing?.value) ? existing.value : []
  const existingIds = new Set(existingTasks.map(t => t.id))

  const report = {
    existing_count: existingTasks.length,
    existing_by_bucket: {},
    fetched_by_bucket: {},
    added_by_bucket: {},
    errors: [],
  }

  // Count existing by bucket
  existingTasks.forEach(t => {
    const b = t._projectName || '(unlabelled)'
    report.existing_by_bucket[b] = (report.existing_by_bucket[b] || 0) + 1
  })

  // Fetch all 7 buckets from Todoist
  const newTasks = []
  for (const [bucket, projectId] of Object.entries(PROJECTS)) {
    try {
      const [tasks, sections] = await Promise.all([
        todoistGet(`tasks?project_id=${projectId}`, todoistKey),
        todoistGet(`sections?project_id=${projectId}`, todoistKey),
      ])
      const sectionMap = Object.fromEntries((sections || []).map(s => [s.id, s.name]))
      const labelled = (tasks || []).map(t => ({
        ...t,
        _projectName: bucket,
        _sectionName: sectionMap[t.section_id] ?? null,
      }))
      report.fetched_by_bucket[bucket] = labelled.length
      const fresh = labelled.filter(t => !existingIds.has(t.id))
      report.added_by_bucket[bucket] = fresh.length
      newTasks.push(...fresh)
    } catch (err) {
      report.errors.push(`${bucket}: ${err.message}`)
    }
  }

  // Merge and save
  const merged = [...existingTasks, ...newTasks]
  await sb.from('app_data').upsert({
    key: 'todoist_task_cache',
    value: merged,
    updated_at: new Date().toISOString(),
  })

  // Final counts
  const final_by_bucket = {}
  merged.forEach(t => {
    const b = t._projectName || '(unlabelled)'
    final_by_bucket[b] = (final_by_bucket[b] || 0) + 1
  })

  return res.status(200).json({
    ...report,
    total_added: newTasks.length,
    final_total: merged.length,
    final_by_bucket,
  })
}
