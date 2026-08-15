import { createClient } from '@supabase/supabase-js'
import { snapshotTasks } from './_lib/tasksRepo.js'
import { getEntryByDate } from './_lib/journalRepo.js'
import {
  listSubscriptions, getSubscription, toSubscription, recordSendResult,
} from './_lib/pushRepo.js'
import { londonDate, reminderBody } from './_lib/reminder.js'

// Both scheduled jobs, in one function.
//
// This merges the former api/cron-weekly-backup.js and adds the journal
// reminder. Vercel's Hobby plan caps the project at 12 serverless functions and
// api/*.js was at exactly 12, so the reminder had no slot of its own — Vercel
// cron paths accept query strings, so one function serves both schedules.
//
// Hobby also allows only 2 cron jobs, each firing at most once per day. After
// this, both are used.
//
// Auth is unchanged from the weekly-backup original: EITHER the Vercel-injected
// `Authorization: Bearer <CRON_SECRET>` (automated runs) OR
// `?token=<MCP_API_KEY>` / bearer MCP_API_KEY (manual triggers).

const MAX_SNAPSHOTS = 12

function authorized(req) {
  const bearer = (req.headers['authorization'] ?? '').replace('Bearer ', '')
  const token = req.query.token ?? bearer ?? ''
  const cronSecret = process.env.CRON_SECRET
  const mcpKey = process.env.MCP_API_KEY
  if (cronSecret && (bearer === cronSecret || token === cronSecret)) return true
  if (mcpKey && token === mcpKey) return true
  return false
}

function supabase() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const job = req.query.job ?? 'weekly-backup'

  const sb = supabase()
  if (!sb) return res.status(500).json({ error: 'Supabase env vars missing' })

  // The test send is called FROM THE BROWSER, so it cannot present CRON_SECRET
  // or MCP_API_KEY — shipping either to the client would leak a credential that
  // can run the real jobs. It is guarded instead by requiring the caller to name
  // an endpoint that is already stored in push_subscriptions: those are long
  // unguessable push-service URLs, and the worst a caller who somehow had one
  // could do is send that single device one fixed test notification. It cannot
  // reach the backup or reminder jobs, and it adds no read or write access
  // beyond what the app's existing allow-all RLS already exposes.
  if (job === 'test-notification') return testNotification(req, res, sb)

  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' })

  if (job === 'journal-reminder') return journalReminder(req, res, sb)
  if (job === 'weekly-backup') return weeklyBackup(req, res, sb)
  return res.status(400).json({ error: `Unknown job: ${job}` })
}

// ─── Test send ────────────────────────────────────────────────────────────────
//
// Exists so the whole path can be proved end to end without waiting for 20:00
// UTC. It deliberately uses the SAME send code as the nightly reminder — a test
// that took a shortcut could pass while the real thing was broken, which is
// worse than having no test button at all.
//
// Failure messages are specific on purpose: the point of pressing this is to
// find out WHICH part is wrong, so "no reply from Google's push service" and
// "VAPID keys are not set" must not both come back as "failed".
async function testNotification(req, res, sb) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const endpoint = req.body?.endpoint
  if (!endpoint) return res.status(400).json({ ok: false, error: 'No subscription endpoint supplied.' })

  let row
  try {
    row = await getSubscription(sb, endpoint)
  } catch (e) {
    return res.status(500).json({ ok: false, error: `Could not read the subscription: ${e.message}` })
  }
  if (!row) {
    return res.status(404).json({
      ok: false,
      error: 'This device has a push subscription, but no matching row is stored — reminders would not arrive. Turn the switch off and on again.',
    })
  }

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(200).json({
      ok: false,
      error: 'The VAPID keys are not set in Vercel yet, so nothing can be sent. Add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT, then redeploy.',
    })
  }

  const webpush = (await import('web-push')).default
  webpush.setVapidDetails(
    VAPID_SUBJECT || 'mailto:yogeshmistry99@gmail.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  )

  const payload = JSON.stringify({
    title: 'Journal',
    body: 'Test notification — reminders are working.',
    url: '/journal',
    // Its own tag, so a test never replaces or is replaced by a real reminder.
    tag: 'journal-test',
  })

  try {
    await webpush.sendNotification(toSubscription(row), payload, { TTL: 60 })
    await recordSendResult(sb, endpoint, { ok: true })
    return res.status(200).json({ ok: true })
  } catch (err) {
    const statusCode = err?.statusCode
    console.warn('[cron] test push failed', statusCode, err?.message)
    // A dead endpoint is removed here exactly as the nightly job would remove
    // it, so the switch stops claiming to be on when it cannot deliver.
    const outcome = await recordSendResult(sb, endpoint, { ok: false, error: err?.message, statusCode })
    return res.status(200).json({
      ok: false,
      removed: outcome === 'removed',
      error: outcome === 'removed'
        ? 'This subscription has expired and has been removed. Turn the switch off and on again to re-subscribe.'
        : `The push service rejected it${statusCode ? ` (${statusCode})` : ''}: ${err?.message ?? 'unknown error'}`,
    })
  }
}

// ─── Journal evening reminder ─────────────────────────────────────────────────
//
// Timing: Vercel Hobby crons are fixed-UTC and once-daily, so the schedule is
// `0 20 * * *` — roughly 21:00 during BST and 20:00 during GMT, and accurate to
// about an hour either way. For an evening nudge that is fine; precision the
// platform cannot deliver isn't worth the second cron slot.
async function journalReminder(req, res, sb) {
  // Today in London, NOT UTC. A 20:00 UTC fire on a BST evening is already the
  // 21st hour locally but still the same calendar day — using a UTC date here
  // would ask about the wrong day for part of the year.
  const today = londonDate()

  // Never nag. A reminder to do something already done is friction, and
  // removing friction is the entire point of this feature.
  let entry = null
  try {
    entry = await getEntryByDate(sb, today)
  } catch (e) {
    // If we cannot tell whether it is written, send anyway: a redundant nudge
    // costs a moment, a skipped one can cost the day's entry.
    console.warn('[cron] journal lookup failed, sending anyway:', e.message)
  }
  if (entry) {
    return res.status(200).json({ ok: true, date: today, skipped: 'already logged' })
  }

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set' })
  }

  const subs = await listSubscriptions(sb)
  if (!subs.length) {
    return res.status(200).json({ ok: true, date: today, sent: 0, note: 'no devices subscribed' })
  }

  // Imported here rather than at module scope so the weekly backup does not pay
  // to load it on its own schedule.
  const webpush = (await import('web-push')).default
  webpush.setVapidDetails(
    VAPID_SUBJECT || 'mailto:yogeshmistry99@gmail.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  )

  const payload = JSON.stringify({
    title: 'Journal',
    body: reminderBody(),
    url: '/journal',
    tag: 'journal-reminder',
  })

  const outcomes = { sent: 0, removed: 0, failed: 0 }
  // Sequential rather than Promise.all: this is a handful of devices, and one
  // push service rejecting must not abort the others.
  for (const row of subs) {
    let result
    try {
      await webpush.sendNotification(toSubscription(row), payload, { TTL: 6 * 60 * 60 })
      result = await recordSendResult(sb, row.endpoint, { ok: true })
    } catch (err) {
      const statusCode = err?.statusCode
      console.warn('[cron] push send failed', row.endpoint, statusCode, err?.message)
      result = await recordSendResult(sb, row.endpoint, {
        ok: false, error: err?.message, statusCode,
      })
    }
    outcomes[result] = (outcomes[result] ?? 0) + 1
  }

  return res.status(200).json({ ok: true, date: today, devices: subs.length, ...outcomes })
}

// ─── Weekly task-store backup ─────────────────────────────────────────────────
// Moved verbatim from api/cron-weekly-backup.js. Behaviour must not change.
async function weeklyBackup(req, res, sb) {
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
