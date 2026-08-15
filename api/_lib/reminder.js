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

// The notification body.
//
// Deliberately plain and short. This arrives on a bad evening as often as a
// good one, so it does not cheerlead, does not mention streaks, and does not
// imply the day was missed — shame mechanics on a recovery journal work against
// the thing it exists for. It is an offer, not a demand.
export function reminderBody() {
  return 'Two minutes to log today, if you are up to it.'
}
