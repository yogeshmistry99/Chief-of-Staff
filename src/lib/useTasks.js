import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { readTasksFromSupabase, peekCachedTasks, onTasksChanged } from './taskCache'

// THE way a component gets tasks. There is deliberately no other one.
//
// Before this, screens called getCachedTasks() once at mount and never looked
// again. Buckets, Calendar, DiscussionThread and Settings therefore showed
// whatever localStorage happened to hold — so a task created in the chat, in
// QuickAdd, or on another device was invisible to search until the user
// happened to reload the right screen. The database had moved on; the screen
// hadn't. Whether a screen refreshed was an accident of how it was written.
//
// useTasks() removes the choice:
//   • paints instantly from the display cache (no blank flash),
//   • immediately reads live rows and replaces it,
//   • re-reads whenever ANY write happens in this tab (local change bus),
//   • re-reads on Postgres realtime events (another device, or the MCP tools),
//   • re-reads when the tab regains focus, which covers a missed realtime event.
//
// A screen using this cannot show a list the database has moved past.

let _channel = null
let _channelRefs = 0

// One shared realtime channel for the whole app, ref-counted across mounts.
function subscribeRealtime(onChange) {
  if (!supabase) return () => {}
  _channelRefs++
  if (!_channel) {
    _channel = supabase
      .channel('tasks_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, onChange)
      .subscribe()
  } else {
    _channel.on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, onChange)
  }
  return () => {
    _channelRefs--
    if (_channelRefs <= 0 && _channel) {
      supabase.removeChannel(_channel)
      _channel = null
      _channelRefs = 0
    }
  }
}

export function useTasks() {
  // Instant paint from the cache; treated as display only, never written back.
  const [tasks, setTasks] = useState(() => peekCachedTasks())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const live = await readTasksFromSupabase()
      if (live) { setTasks(live); setError(null) }
      else setError('Could not reach the task store')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let alive = true
    const run = () => { if (alive) refresh() }

    run()                                   // live read on mount
    const offBus = onTasksChanged(run)      // any write in this tab
    const offRT = subscribeRealtime(run)    // another device / MCP
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

  return { tasks, loading, error, refresh }
}
