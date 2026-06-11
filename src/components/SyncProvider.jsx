import { useEffect, useState } from 'react'
import { migrateLocalStorageToSupabase, hydrateFromSupabase, subscribeToRemoteChanges, unsubscribeFromRemoteChanges } from '../lib/sync'
import { isSupabaseConfigured } from '../lib/supabase'

export default function SyncProvider({ children }) {
  const [syncStatus, setSyncStatus] = useState(null)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSyncStatus('❌ Supabase not configured')
      return
    }
    setSyncStatus('⏳ Connecting…')
    migrateLocalStorageToSupabase()
      .then(() => hydrateFromSupabase())
      .then(() => setSyncStatus('✅ Synced'))
      .catch((e) => setSyncStatus('❌ ' + (e?.message ?? 'Sync failed')))
    subscribeToRemoteChanges()
    return () => unsubscribeFromRemoteChanges()
  }, [])

  return (
    <>
      {syncStatus && (
        <div style={{ position: 'fixed', bottom: 72, left: 0, right: 0, textAlign: 'center', zIndex: 9999, pointerEvents: 'none' }}>
          <span style={{ background: '#1C1B1F', color: '#fff', fontSize: 11, padding: '4px 10px', borderRadius: 20, opacity: 0.85 }}>
            Sync: {syncStatus}
          </span>
        </div>
      )}
      {children}
    </>
  )
}
