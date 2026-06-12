import { useEffect } from 'react'
import { migrateLocalStorageToSupabase, hydrateFromSupabase, subscribeToRemoteChanges, unsubscribeFromRemoteChanges } from '../lib/sync'
import { isSupabaseConfigured } from '../lib/supabase'
import { maybeRunAutoBackup } from '../lib/backups'

export default function SyncProvider({ children }) {
  useEffect(() => {
    if (!isSupabaseConfigured) return
    migrateLocalStorageToSupabase()
      .then(() => hydrateFromSupabase())
      .then(() => maybeRunAutoBackup())
      .catch(() => {})
    subscribeToRemoteChanges()
    return () => unsubscribeFromRemoteChanges()
  }, [])

  return children
}
