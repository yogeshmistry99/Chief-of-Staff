import { supabase } from './supabase'
import { MORNING_BRIEF_KEY } from '../../api/_lib/urgency.js'

// The morning brief's on/off preference.
//
// Stored as one app_data row so the cron reads the same value the switch writes —
// the flag has to be server-readable, which rules out localStorage. The key lives
// in api/_lib/urgency.js and is imported here, so the UI and the job can never
// disagree about which row this is.
//
// Default ON (opt-out), mirroring the evening reminder: absent row or missing
// flag reads as enabled, and only an explicit `false` disables. This is safe to
// default on because the brief only reaches a device that already has a push
// subscription, and it sends nothing on a day with nothing overdue or due —
// there is no unsolicited-prompt or empty-nag failure mode to guard against.

export async function readBriefEnabled() {
  if (!supabase) return true
  try {
    const { data, error } = await supabase
      .from('app_data').select('value').eq('key', MORNING_BRIEF_KEY).maybeSingle()
    if (error) return true
    return data?.value?.enabled !== false
  } catch {
    return true
  }
}

// Throws if the write does not land — same posture as the reminder time and the
// journal itself. A setting that silently fails to save is the false-confirmation
// class this app has form for.
export async function saveBriefEnabled(enabled) {
  if (!supabase) throw new Error('Not connected to the database, so the setting was not saved.')

  // Preserve any stored time alongside the flag rather than clobbering it.
  let time
  try {
    const { data } = await supabase
      .from('app_data').select('value').eq('key', MORNING_BRIEF_KEY).maybeSingle()
    time = data?.value?.time
  } catch { /* no stored time to preserve */ }

  const value = time ? { enabled, time } : { enabled }
  const { data, error } = await supabase
    .from('app_data')
    .upsert({ key: MORNING_BRIEF_KEY, value, updated_at: new Date().toISOString() })
    .select('value')

  if (error) throw new Error(`Could not save the setting: ${error.message}`)
  const saved = data?.[0]?.value?.enabled
  if (saved !== enabled) throw new Error('The database did not confirm the change, so it was not saved.')
  return saved
}
