import { useEffect } from 'react'
import { migrateLocalStorageToSupabase, hydrateFromSupabase, subscribeToRemoteChanges, unsubscribeFromRemoteChanges } from '../lib/sync'
import { isSupabaseConfigured } from '../lib/supabase'

export default function SyncProvider({ children }) {
  useEffect(() => {
    if (!isSupabaseConfigured) return
    migrateLocalStorageToSupabase()
      .then(() => hydrateFromSupabase())
      .catch(() => {})
    subscribeToRemoteChanges()
    return () => unsubscribeFromRemoteChanges()
  }, [])

  return children
}
