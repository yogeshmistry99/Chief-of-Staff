// Small pure helpers for the journal evening reminder.
//
// Separated from api/cron.js so the two things that could quietly be WRONG —
// which calendar day the reminder is about, and what it says — are testable
// without a Supabase client or a push service.

// Today's date in Europe/London, as YYYY-MM-DD.
//
// NOT a UTC slice. The cron fires at a fixed UTC time, and during BST that
// instant is already an hour later locally — using the UTC date would ask about
// the wrong day for half the year. This is the same class of bug already fixed
// in the calendar, in completed-task handling, and in the journal itself.
export function londonDate(now = new Date()) {
  // en-CA formats as YYYY-MM-DD, which is the shape stored in entry_date.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

// Now in Europe/London as HH:MM, 24-hour and zero-padded.
//
// `hourCycle: 'h23'` rather than `hour12: false` — the latter renders midnight
// as "24:00" under some ICU builds, which would sort after every real time and
// silently park the reminder permanently in the future.
export function londonTime(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(now)
}

// The reminder time, if the setting has never been touched.
//
// 20:00 and NOT 21:00, deliberately. The single daily cron fires at 20:00 UTC,
// which is 21:00 in London during BST but 20:00 during GMT — so a 21:00 default
// would pass the gate all summer and then, the night the clocks go back, start
// failing it every single evening with nothing on screen to say why. The default
// has to be one the year-round fire time can always satisfy.
//
// The same trap applies to any time the user picks: with ONE fire a day, a time
// later than the fire cannot be delivered that evening. The setting is honoured
// exactly — it is the delivery cadence that is capped by the platform, not this.
export const DEFAULT_REMINDER_TIME = '20:00'

// Where the setting is stored — a single app_data row, `{ time: 'HH:MM' }`.
export const REMINDER_SETTINGS_KEY = 'journal_reminder'

// Which day the reminder last went out, so a repeated call cannot send twice.
export const REMINDER_SENT_KEY = 'journal_reminder_last_sent'

export function isValidTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

// Zero-padded HH:MM sorts lexically in clock order, so a string compare is a
// time compare — no parsing, no arithmetic, no timezone to get wrong twice.
export function isDue(setTime, now = new Date()) {
  const target = isValidTime(setTime) ? setTime : DEFAULT_REMINDER_TIME
  return londonTime(now) >= target
}

// Reading the setting must never be what stops a reminder going out: an
// unreachable or malformed row falls back to the default rather than throwing.
export async function readReminderTime(sb) {
  try {
    const { data } = await sb
      .from('app_data').select('value').eq('key', REMINDER_SETTINGS_KEY).maybeSingle()
    const stored = data?.value?.time
    return isValidTime(stored) ? stored : DEFAULT_REMINDER_TIME
  } catch {
    return DEFAULT_REMINDER_TIME
  }
}

export async function readLastSentDate(sb) {
  try {
    const { data } = await sb
      .from('app_data').select('value').eq('key', REMINDER_SENT_KEY).maybeSingle()
    return data?.value?.date ?? null
  } catch {
    return null
  }
}

export async function recordSentDate(sb, date) {
  try {
    await sb.from('app_data').upsert({
      key: REMINDER_SENT_KEY, value: { date }, updated_at: new Date().toISOString(),
    })
  } catch { /* a lost marker costs at most one duplicate nudge; never a thrown job */ }
}

// The notification body.
//
// Deliberately plain and short. This arrives on a bad evening as often as a
// good one, so it does not cheerlead, does not mention streaks, and does not
// imply the day was missed — shame mechanics on a recovery journal work against
// the thing it exists for. It is an offer, not a demand.
//
// A day already written but not filed gets its own wording: telling someone to
// "log today" when they already did reads as though the app lost their work.
// A broken filing says so plainly, because that one does need a second action.
export function reminderBody(state = null) {
  if (state === 'draft')  return 'Today is written but not published yet.'
  if (state === 'failed') return 'Today’s entry didn’t file. It can be published again.'
  return 'Two minutes to log today, if you are up to it.'
}
