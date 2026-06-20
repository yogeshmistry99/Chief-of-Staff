import { supabase } from './supabase'

// ─── Event bus ───────────────────────────────────────────────────────────────
// Notifies components when remote data has been written to localStorage.

const _listeners = new Map()

export function onSyncChange(key, fn) {
  if (!_listeners.has(key)) _listeners.set(key, new Set())
  _listeners.get(key).add(fn)
  return () => _listeners.get(key)?.delete(fn)
}

function notifySyncChange(key) {
  _listeners.get(key)?.forEach((fn) => fn())
  _listeners.get('*')?.forEach((fn) => fn())
}

// ─── Key helpers ─────────────────────────────────────────────────────────────

const HEADS = ['chief', 'Finance', 'Health', 'Work', 'Family', 'Home', 'Personal', 'Systems']
const BUCKETS = ['Finance', 'Health', 'Work', 'Family', 'Home', 'Personal', 'Systems']

// Supabase key → localStorage key(s) and vice-versa

function applyToLocalStorage(sbKey, value) {
  try {
    if (sbKey.startsWith('head_config_')) {
      const k = sbKey.replace('head_config_', '')
      if (value && typeof value === 'object') {
        localStorage.setItem(`head_instructions_${k}`, value.instructions ?? '')
        localStorage.setItem(`head_context_${k}`, value.context ?? '')
        localStorage.setItem(`head_files_${k}`, JSON.stringify(value.files ?? []))
        if (value.model) localStorage.setItem(`head_model_${k}`, value.model)
        else localStorage.removeItem(`head_model_${k}`)
      }
    } else if (sbKey.startsWith('discussions_')) {
      const bucket = sbKey.replace('discussions_', '')
      localStorage.setItem(`cos_discussions_${bucket}`, JSON.stringify(Array.isArray(value) ? value : []))
    } else if (sbKey === 'last_weekly_review') {
      if (value) localStorage.setItem('lastWeeklyReview', typeof value === 'string' ? value : JSON.stringify(value))
    } else if (sbKey === 'todoist_task_cache') {
      localStorage.setItem('todoist_task_cache', JSON.stringify(Array.isArray(value) ? value : []))
    } else if (sbKey === 'todoist_last_pull') {
      if (value) localStorage.setItem('todoist_last_pull', typeof value === 'string' ? value : JSON.stringify(value))
    }
  } catch {}
}

// ─── Push ─────────────────────────────────────────────────────────────────────

export async function pushToSupabase(sbKey, value) {
  if (!supabase) return
  try {
    await supabase.from('app_data').upsert({
      key: sbKey,
      value,
      updated_at: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('Supabase push failed', sbKey, e)
  }
}

// ─── Pull + hydrate ───────────────────────────────────────────────────────────

export async function hydrateFromSupabase() {
  if (!supabase) return
  try {
    const { data, error } = await supabase.from('app_data').select('key, value')
    if (error || !data?.length) return
    data.forEach(({ key, value }) => {
      applyToLocalStorage(key, value)
      notifySyncChange(key)
    })
  } catch (e) {
    console.warn('Supabase hydrate failed', e)
  }
}

// ─── Migration ────────────────────────────────────────────────────────────────
// On first load: if Supabase has no data, push everything from localStorage.

export async function migrateLocalStorageToSupabase() {
  if (!supabase) return
  if (localStorage.getItem('supabase_migrated')) return
  try {
    const { data } = await supabase.from('app_data').select('key').limit(1)
    if (data?.length) {
      // Supabase already has data (another device set it up) — just mark done
      localStorage.setItem('supabase_migrated', '1')
      return
    }

    const rows = []

    // Head configs
    HEADS.forEach((k) => {
      const instructions = localStorage.getItem(`head_instructions_${k}`) ?? ''
      const context      = localStorage.getItem(`head_context_${k}`) ?? ''
      const files        = (() => { try { return JSON.parse(localStorage.getItem(`head_files_${k}`) ?? '[]') } catch { return [] } })()
      if (instructions || context || files.length) {
        rows.push({ key: `head_config_${k}`, value: { instructions, context, files }, updated_at: new Date().toISOString() })
      }
    })

    // Discussions
    BUCKETS.forEach((b) => {
      const discussions = (() => { try { return JSON.parse(localStorage.getItem(`cos_discussions_${b}`) ?? '[]') } catch { return [] } })()
      if (discussions.length) {
        rows.push({ key: `discussions_${b}`, value: discussions, updated_at: new Date().toISOString() })
      }
    })

    // Weekly review
    const wr = localStorage.getItem('lastWeeklyReview')
    if (wr) rows.push({ key: 'last_weekly_review', value: wr, updated_at: new Date().toISOString() })

    if (rows.length) await supabase.from('app_data').upsert(rows)
    localStorage.setItem('supabase_migrated', '1')
  } catch (e) {
    console.warn('Supabase migration failed', e)
  }
}

// ─── Realtime subscription ────────────────────────────────────────────────────

let _channel = null

export function subscribeToRemoteChanges() {
  if (!supabase || _channel) return
  _channel = supabase
    .channel('app_data_sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_data' }, ({ new: row }) => {
      if (!row?.key) return
      applyToLocalStorage(row.key, row.value)
      notifySyncChange(row.key)
    })
    .subscribe()
}

export function unsubscribeFromRemoteChanges() {
  if (_channel) { supabase?.removeChannel(_channel); _channel = null }
}
