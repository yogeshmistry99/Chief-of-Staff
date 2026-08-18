import { supabase } from './supabase'
import { haptic } from './haptic'
import {
  DEFAULT_REMINDER_TIME, REMINDER_SETTINGS_KEY, isValidTime,
} from '../../api/_lib/reminder.js'

// The evening reminder's time setting.
//
// Stored as one app_data row so the cron can read the same value the switch
// writes — the time has to be readable from the server, which rules out
// localStorage. The validator and the default live in api/_lib/reminder.js and
// are re-exported here, so the UI and the job can never disagree about what a
// valid time is.
export { DEFAULT_REMINDER_TIME, isValidTime }

export async function readReminderTime() {
  if (!supabase) return DEFAULT_REMINDER_TIME
  try {
    const { data, error } = await supabase
      .from('app_data').select('value').eq('key', REMINDER_SETTINGS_KEY).maybeSingle()
    if (error) return DEFAULT_REMINDER_TIME
    const stored = data?.value?.time
    return isValidTime(stored) ? stored : DEFAULT_REMINDER_TIME
  } catch {
    return DEFAULT_REMINDER_TIME
  }
}

// Throws if the write does not land.
//
// Deliberately NOT the fire-and-forget app_data helper in sync.js, which
// swallows its errors: a time that silently fails to save leaves the user
// believing they moved their reminder when they did not, and they would only
// find out by the nudge arriving at the old time — or not at all. Same posture
// as the journal itself, which refuses to have an invisible failure.
export async function saveReminderTime(time) {
  if (!isValidTime(time)) throw new Error(`Not a valid time: ${time}`)
  if (!supabase) throw new Error('Not connected to the database, so the time was not saved.')

  const { data, error } = await supabase
    .from('app_data')
    .upsert({
      key: REMINDER_SETTINGS_KEY,
      value: { time },
      updated_at: new Date().toISOString(),
    })
    .select('value')

  if (error) throw new Error(`Could not save the reminder time: ${error.message}`)
  const saved = data?.[0]?.value?.time
  if (saved !== time) throw new Error('The database did not confirm the new time, so it was not saved.')
  return saved
}

// Play the app's own tone when a reminder arrives while the app is open.
//
// A service worker has no AudioContext, so it posts a message instead and the
// page makes the sound. With the app closed — the usual case — the notification
// carries the vibration signature set in sw.js and the phone's own tone, which
// a web push cannot override.
export function listenForReminderTone() {
  if (!('serviceWorker' in navigator)) return () => {}
  const onMessage = (event) => {
    if (event.data?.type === 'journal-reminder') haptic.journal()
  }
  navigator.serviceWorker.addEventListener('message', onMessage)
  return () => navigator.serviceWorker.removeEventListener('message', onMessage)
}
