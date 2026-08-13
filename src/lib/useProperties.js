import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { readPropertiesFromSupabase, peekCachedProperties, onPropertiesChanged } from './propertyCache'

// THE way a component gets properties. Mirrors useTasks() exactly:
//   • paints instantly from the display cache,
//   • immediately reads live rows and replaces it,
//   • re-reads on any local write (change bus), on Postgres realtime (the weekly
//     ingest cron writing rows, or another device), and on tab focus.
//
// One shared realtime channel for the whole app on a DISTINCT name from tasks'
// (`properties_live` vs `tasks_live`). `.on()` is attached exactly once before
// `subscribe()` and fans out to a Set — never call `.on()` per subscriber
// (supabase-js throws after subscribe()); see the same warning in useTasks.js.

let _channel = null
const _rtListeners = new Set()

function subscribeRealtime(onChange) {
  if (!supabase) return () => {}
  _rtListeners.add(onChange)
  if (!_channel) {
    try {
      _channel = supabase
        .channel('properties_live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'properties' },
          () => _rtListeners.forEach((fn) => { try { fn() } catch {} }))
        .subscribe()
    } catch (e) {
      console.warn('property realtime unavailable — falling back to focus/write refresh', e)
      _channel = null
    }
  }
  return () => {
    _rtListeners.delete(onChange)
    if (_rtListeners.size === 0 && _channel) {
      try { supabase.removeChannel(_channel) } catch {}
      _channel = null
    }
  }
}

export function useProperties() {
  const [properties, setProperties] = useState(() => peekCachedProperties())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const live = await readPropertiesFromSupabase()
      if (live) { setProperties(live); setError(null) }
      else setError('Could not reach the property store')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let alive = true
    const run = () => { if (alive) refresh() }
    run()
    const offBus = onPropertiesChanged(run)
    const offRT = subscribeRealtime(run)
    const onFocus = () => { if (document.visibilityState === 'visible') run() }
    window.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      alive = false
      offBus(); offRT()
      window.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  return { properties, loading, error, refresh }
}
