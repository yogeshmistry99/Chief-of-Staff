import { createClient } from '@supabase/supabase-js'
import { snapshotTasks, listTasks } from './_lib/tasksRepo.js'
import { getEntryByDate } from './_lib/journalRepo.js'
import {
  listSubscriptions, getSubscription, toSubscription, recordSendResult,
} from './_lib/pushRepo.js'
import {
  londonDate, londonWeekday, reminderBody, isDue,
  readReminderTime, readLastSentDate, recordSentDate,
} from './_lib/reminder.js'
import { publishState, needsReminder } from './_lib/journalPublish.js'
import {
  selectUrgent, urgencyPayload,
  readBriefEnabled, readBriefTime, readBriefSentDate, recordBriefSentDate,
} from './_lib/urgency.js'

// All scheduled jobs, in one function.
//
// This merges the former api/cron-weekly-backup.js, the journal reminder, and
// the morning brief. Vercel's Hobby plan caps the project at 12 serverless
// functions and api/*.js is at that cap, so none of these can have a file of its
// own — Vercel cron paths accept query strings, so one function serves them all.
//
// Hobby also allows only 2 cron jobs, each firing at most once per day, and both
// are used. To add the morning brief WITHOUT a third slot, the weekly backup no
// longer owns a cron: the two scheduled paths are now
//   ?job=morning          daily  07:00 UTC  — the urgency brief, plus the weekly
//                                              backup on Sundays only
//   ?job=journal-reminder  daily 20:00 UTC  — the evening journal nudge
// The backup's own weekly dedupe makes riding a daily fire safe (a second run in
// the same week is a no-op), so folding it in changed its trigger, not its
// behaviour.
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
  if (job === 'morning') return morning(req, res, sb)
  if (job === 'urgency') return urgencyJob(req, res, sb)
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

  // `?force=1` sends regardless of state or time, for verifying the path.
  const force = req.query.force === '1' || req.query.force === 'true'

  // Never nag about a day that is FINISHED — and finished means published, not
  // merely saved. Skipping on mere existence meant a day started in the morning
  // and left as a draft was never mentioned, which is the day most worth a nudge.
  let entry = null
  try {
    entry = await getEntryByDate(sb, today)
  } catch (e) {
    // If we cannot tell whether it is written, send anyway: a redundant nudge
    // costs a moment, a skipped one can cost the day's entry.
    console.warn('[cron] journal lookup failed, sending anyway:', e.message)
  }
  const state = publishState(entry)
  if (!force && !needsReminder(entry)) {
    return res.status(200).json({ ok: true, date: today, skipped: 'already published', state })
  }

  // Hold until the time the user set. Harmless under the single daily cron —
  // which fires once, after the default — and what makes the job correct if it
  // is ever polled more often than that.
  const setTime = await readReminderTime(sb)
  if (!force && !isDue(setTime)) {
    return res.status(200).json({ ok: true, date: today, skipped: 'before reminder time', time: setTime })
  }

  // One nudge a day, however many times this is called. Checked before sending
  // rather than relying on the caller's schedule.
  if (!force && (await readLastSentDate(sb)) === today) {
    return res.status(200).json({ ok: true, date: today, skipped: 'already sent today' })
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
    body: reminderBody(state),
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

  // Only a nudge that actually reached a device counts as "sent today"; if every
  // push failed, the next call should try again rather than treat it as done.
  if (outcomes.sent > 0) await recordSentDate(sb, today)

  return res.status(200).json({ ok: true, date: today, state, time: setTime, devices: subs.length, ...outcomes })
}

// ─── Morning urgency brief ────────────────────────────────────────────────────
//
// A single push each morning naming what is overdue or due today, ordered the
// same way the Home priority list is. Sends nothing on a day with nothing urgent
// — that quiet is deliberate, not a failure. Shares the journal reminder's push
// transport (push_subscriptions) but has its own on/off flag and its own
// once-a-day marker, so a device can want one and not the other.
//
// Returns { statusCode, payload } rather than writing the response, so the
// `morning` handler can run this and the weekly backup and answer once.
async function runUrgencyBrief(sb, { force = false } = {}) {
  const today = londonDate()

  if (!force && !(await readBriefEnabled(sb))) {
    return { statusCode: 200, payload: { ok: true, date: today, skipped: 'morning brief disabled' } }
  }

  // Hold until the set time. Harmless under the single daily fire (which is at
  // the default) and what keeps the job correct if it is ever polled more often.
  const briefTime = await readBriefTime(sb)
  if (!force && !isDue(briefTime)) {
    return { statusCode: 200, payload: { ok: true, date: today, skipped: 'before brief time', time: briefTime } }
  }

  // One brief a day, however many times this is called.
  if (!force && (await readBriefSentDate(sb)) === today) {
    return { statusCode: 200, payload: { ok: true, date: today, skipped: 'already sent today' } }
  }

  let tasks
  try {
    tasks = await listTasks(sb, { includeCompleted: false })
  } catch (e) {
    return { statusCode: 500, payload: { error: `Task read failed: ${e.message}` } }
  }

  const urgent = selectUrgent(tasks, today)
  const payload = urgencyPayload(urgent)
  // Nothing urgent → send nothing, and do NOT record a send, so the day stays
  // open in case something becomes due later and a manual/forced run is wanted.
  if (!payload) {
    return { statusCode: 200, payload: { ok: true, date: today, urgent: 0, note: 'nothing urgent today' } }
  }

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return { statusCode: 500, payload: { error: 'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set' } }
  }

  const subs = await listSubscriptions(sb)
  if (!subs.length) {
    return { statusCode: 200, payload: { ok: true, date: today, urgent: urgent.length, sent: 0, note: 'no devices subscribed' } }
  }

  const webpush = (await import('web-push')).default
  webpush.setVapidDetails(
    VAPID_SUBJECT || 'mailto:yogeshmistry99@gmail.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  )

  const body = JSON.stringify(payload)
  const outcomes = { sent: 0, removed: 0, failed: 0 }
  // Sequential, same as the journal reminder: a handful of devices, and one push
  // service rejecting must not abort the others.
  for (const row of subs) {
    let result
    try {
      await webpush.sendNotification(toSubscription(row), body, { TTL: 6 * 60 * 60 })
      result = await recordSendResult(sb, row.endpoint, { ok: true })
    } catch (err) {
      const statusCode = err?.statusCode
      console.warn('[cron] morning-brief push failed', row.endpoint, statusCode, err?.message)
      result = await recordSendResult(sb, row.endpoint, { ok: false, error: err?.message, statusCode })
    }
    outcomes[result] = (outcomes[result] ?? 0) + 1
  }

  // Only a brief that actually reached a device counts as sent today.
  if (outcomes.sent > 0) await recordBriefSentDate(sb, today)

  return {
    statusCode: 200,
    payload: { ok: true, date: today, urgent: urgent.length, title: payload.title, devices: subs.length, ...outcomes },
  }
}

// The daily morning cron. Always runs the urgency brief; also runs the weekly
// backup, but only on Sundays (London) — the backup's own dedupe makes that gate
// belt-and-braces rather than load-bearing. `?backup=1` forces the backup arm
// for manual verification without waiting for Sunday.
async function morning(req, res, sb) {
  const force = req.query.force === '1' || req.query.force === 'true'
  const today = londonDate()

  const brief = await runUrgencyBrief(sb, { force })

  let backup = null
  if (force || londonWeekday() === 0 || req.query.backup === '1') {
    backup = await runWeeklyBackup(sb, { force })
  }

  return res.status(200).json({ ok: true, date: today, brief: brief.payload, backup: backup?.payload ?? null })
}

// Manual trigger for the brief alone (auth-gated), so the whole path can be
// proved without waiting for 07:00 or for a task to be due. `?force=1` bypasses
// the enabled/time/already-sent gates.
async function urgencyJob(req, res, sb) {
  const force = req.query.force === '1' || req.query.force === 'true'
  const r = await runUrgencyBrief(sb, { force })
  return res.status(r.statusCode).json(r.payload)
}

// ─── Weekly task-store backup ─────────────────────────────────────────────────
// Behaviour moved verbatim from api/cron-weekly-backup.js; only the shape
// changed — the core returns { statusCode, payload } so `morning` can run it and
// still answer once, and the thin `weeklyBackup` wrapper below serves the manual
// ?job=weekly-backup path.
async function weeklyBackup(req, res, sb) {
  const force = req.query.force === '1' || req.query.force === 'true'
  const r = await runWeeklyBackup(sb, { force })
  return res.status(r.statusCode).json(r.payload)
}

async function runWeeklyBackup(sb, { force = false } = {}) {
  const isForced = force

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
      return { statusCode: 200, payload: { ok: true, skipped: true, reason: 'weekly snapshot already exists this week', existing: recent[0] } }
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
    return { statusCode: 500, payload: { error: `Task read failed: ${e.message}` } }
  }
  // Never write an empty or absurdly small snapshot over the rotation — that
  // would burn a slot and could push a good backup out of the 12 kept.
  if (!tasks.length) {
    return { statusCode: 500, payload: { error: 'Refusing to back up: task read returned 0 rows' } }
  }

  const now = new Date().toISOString()
  const label = `Weekly backup ${isForced ? '(manual)' : '(cron)'} — ${now.slice(0, 10)}`
  const { error: insErr } = await sb
    .from('task_backups')
    .insert({ label, tasks, task_count: tasks.length, created_at: now })
  if (insErr) return { statusCode: 500, payload: { error: `Insert failed: ${insErr.message}` } }

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

  return { statusCode: 200, payload: { ok: true, label, task_count: tasks.length, pruned, kept: MAX_SNAPSHOTS, fallbackRefreshed } }
}
