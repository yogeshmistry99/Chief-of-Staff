// The morning brief's urgency logic — "AI-spotted urgency" for the Notifications
// roadmap item, done deterministically rather than with an LLM call.
//
// Deliberately NOT a Claude call. The existing priority framework
// (src/lib/priority.js) already encodes what is urgent — date proximity, the P1
// triage signal, and the bucket weighting (Finance 35 → Health 30 → …). A daily
// model call would cost tokens, could hallucinate a "priority" that isn't one,
// and could not explain itself; the score can. This mirrors scoreTask's bands so
// the brief and the Home list agree about what matters.
//
// It only ever surfaces what needs acting on TODAY: overdue and due-today tasks.
// A standing P1 with no date is real work but not a thing to be pushed about
// every single morning — that is the "annoying" failure the roadmap item warns
// of. The self-limiting consequence is the point: on a day where nothing is
// overdue or due, the brief sends nothing at all.
//
// Pure selection + payload here; the settings/dedup helpers below take an
// injected Supabase client so the browser and the cron share identical
// semantics, exactly as api/_lib/reminder.js does.

import { isValidTime } from './reminder.js'

// Mirrors src/lib/priority.js BUCKET_WEIGHTS. Kept as a copy rather than an
// import because api/*.js cannot import from src/ (the journalPublish.js lesson),
// and these are the same seven weights the whole app already ranks by.
export const BUCKET_WEIGHTS = {
  Finance:  35,
  Health:   30,
  Work:     25,
  Family:   20,
  Home:     10,
  Personal:  8,
  Systems:   8,
}

// Whole-day difference between a due date and today, both YYYY-MM-DD.
//
// Compared at UTC midnight on both sides so the arithmetic never depends on the
// runtime's own timezone — the day-boundary bug this repo has hit repeatedly.
// `today` is expected to already be the LONDON date (via londonDate()).
export function daysUntilDue(dueDate, today) {
  if (!dueDate || !today) return null
  const due = Date.parse(`${String(dueDate).slice(0, 10)}T00:00:00Z`)
  const now = Date.parse(`${String(today).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(due) || Number.isNaN(now)) return null
  return Math.round((due - now) / 86_400_000)
}

// Classify one task (app shape: { due:{date}, priority, _projectName, ... }).
// Returns null for anything that is not overdue or due today — completed tasks,
// undated tasks, and future-dated tasks all fall out here.
export function classifyUrgency(task, today) {
  if (!task || task.is_completed) return null
  const days = daysUntilDue(task.due?.date, today)
  if (days === null) return null
  let kind = null
  if (days < 0) kind = 'overdue'
  else if (days === 0) kind = 'today'
  else return null
  const bucket = task._projectName ?? null
  return {
    task,
    kind,
    days,
    bucket,
    weight: BUCKET_WEIGHTS[bucket] ?? 5,
    priority: task.priority ?? 1,
  }
}

// Ordering score. Mirrors scoreTask's additive bands (due-today 100 above
// overdue 90, plus bucket weight, plus the P1/P2/P3 triage bump) so the brief
// orders things the same way the Home priority list does.
function rankScore(u) {
  const base = u.kind === 'today' ? 100 : 90
  const pri = u.priority === 4 ? 50 : u.priority === 3 ? 20 : u.priority === 2 ? 8 : 0
  return base + u.weight + pri
}

// The urgent set, most pressing first. `tasks` are already deleted_at-filtered
// live rows in app shape.
export function selectUrgent(tasks, today) {
  return (tasks ?? [])
    .map((t) => classifyUrgency(t, today))
    .filter(Boolean)
    .sort((a, b) => rankScore(b) - rankScore(a))
}

function truncate(s, n = 56) {
  const str = String(s ?? '').trim()
  return str.length > n ? `${str.slice(0, n - 1).trimEnd()}…` : str
}

// Plain wording for one item's state. Factual, never shaming — same tone as the
// journal reminder, which shares this device.
export function kindPhrase(u) {
  if (u.kind === 'today') return 'due today'
  const late = -u.days
  return late === 1 ? '1 day overdue' : `${late} days overdue`
}

// The push payload, or null when there is nothing to say — the caller treats
// null as "send nothing today". `url: '/'` opens the Home priority list.
export function urgencyPayload(urgent, { url = '/' } = {}) {
  if (!urgent || urgent.length === 0) return null
  const count = urgent.length
  const top = urgent[0]
  const title = count === 1 ? 'One thing needs you today' : `${count} things need you today`

  let body
  if (count === 1) {
    body = `“${truncate(top.task.content)}” — ${kindPhrase(top)}.`
  } else {
    const overdue = urgent.filter((u) => u.kind === 'overdue').length
    const lead = `“${truncate(top.task.content)}” — ${kindPhrase(top)}`
    body = overdue > 0 && overdue < count
      ? `${lead}, and ${count - 1} more (${overdue} overdue).`
      : `${lead}, and ${count - 1} more.`
  }

  return { title, body, url, tag: 'morning-brief', vibrate: [12, 70, 12] }
}

// ─── Settings + dedup (Supabase-backed) ────────────────────────────────────────

// One app_data row, `{ enabled: bool, time?: 'HH:MM' }`.
export const MORNING_BRIEF_KEY = 'morning_brief'
// Which day the brief last went out, so a repeated call cannot send twice.
export const MORNING_BRIEF_SENT_KEY = 'morning_brief_last_sent'

// 07:00 and NOT 08:00, for the same DST reason as the journal reminder's 20:00.
// The morning cron fires at 07:00 UTC, which is 07:00 in London during GMT and
// 08:00 during BST. The default must be a time the year-round fire can always
// satisfy, or the brief would pass the gate all summer and then silently stop
// the night the clocks go back. 07:00 is >= by the fire time in both seasons.
export const DEFAULT_BRIEF_TIME = '07:00'

// Default ON (opt-out). Absent row or missing flag means enabled; only an
// explicit `false` disables. Reading the setting must never be what stops the
// brief — an unreachable row falls back to enabled rather than throwing.
export async function readBriefEnabled(sb) {
  try {
    const { data } = await sb
      .from('app_data').select('value').eq('key', MORNING_BRIEF_KEY).maybeSingle()
    return data?.value?.enabled !== false
  } catch {
    return true
  }
}

export async function readBriefTime(sb) {
  try {
    const { data } = await sb
      .from('app_data').select('value').eq('key', MORNING_BRIEF_KEY).maybeSingle()
    const stored = data?.value?.time
    return isValidTime(stored) ? stored : DEFAULT_BRIEF_TIME
  } catch {
    return DEFAULT_BRIEF_TIME
  }
}

export async function readBriefSentDate(sb) {
  try {
    const { data } = await sb
      .from('app_data').select('value').eq('key', MORNING_BRIEF_SENT_KEY).maybeSingle()
    return data?.value?.date ?? null
  } catch {
    return null
  }
}

export async function recordBriefSentDate(sb, date) {
  try {
    await sb.from('app_data').upsert({
      key: MORNING_BRIEF_SENT_KEY, value: { date }, updated_at: new Date().toISOString(),
    })
  } catch { /* a lost marker costs at most one duplicate nudge, never a thrown job */ }
}
