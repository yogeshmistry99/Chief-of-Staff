import { useState, useEffect } from 'react'
import { getMonthlyUsage } from '../lib/claude'
import { pullAndCacheTasks, getLastPullTime, getCachedTasks } from '../lib/taskCache'
import { supabase } from '../lib/supabase'
import { listBackups, createBackup, restoreBackup, fmtBackupDate, fmtLabel } from '../lib/backups'

// Haiku 4.5 pricing: $0.80/MTok input, $4.00/MTok output
function calcCost({ input_tokens = 0, output_tokens = 0 }) {
  return (input_tokens / 1_000_000) * 0.80 + (output_tokens / 1_000_000) * 4.00
}

function StatusPill({ connected }) {
  if (connected === null) return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F3EDF7] text-[#79747E]">…</span>
  return connected
    ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#C8F5E1] text-[#00513A]">Connected</span>
    : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F3EDF7] text-[#79747E]">Not connected</span>
}

function IntegrationCard({ icon, name, description, connected, detail, url }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className={`flex items-start gap-3 p-4 rounded-2xl border transition-colors active:scale-[0.98] ${
        connected ? 'bg-white border-[#CAC4D0]' : 'bg-[#FAFAFA] border-[#E7E0EC] opacity-75'
      }`}
    >
      <div className="w-10 h-10 rounded-xl bg-[#F3EDF7] flex items-center justify-center text-xl flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className="text-sm font-semibold text-[#1C1B1F] leading-tight">{name}</p>
          <StatusPill connected={connected} />
        </div>
        <p className="text-xs text-[#49454F] leading-snug mb-1">{description}</p>
        {detail && <p className="text-[11px] text-[#79747E]">{detail}</p>}
      </div>
    </a>
  )
}

export default function Settings() {
  const [usage, setUsage] = useState({})
  const [resetDone, setResetDone] = useState(false)
  const [status, setStatus] = useState({})
  const [supabaseOk, setSupabaseOk] = useState(null)
  const [lastSync, setLastSync] = useState(null)
  const [backups, setBackups] = useState([])
  const [backupState, setBackupState] = useState('idle') // idle | saving | done | error
  const [restoreTarget, setRestoreTarget] = useState(null) // backup obj to confirm
  const [restoreState, setRestoreState] = useState('idle') // idle | restoring | done | error

  useEffect(() => { setUsage(getMonthlyUsage()) }, [])
  useEffect(() => {
    fetch('/api/status').then((r) => r.json()).then(setStatus).catch(() => {})
  }, [])
  useEffect(() => {
    if (!supabase) { setSupabaseOk(false); return }
    supabase.from('app_data').select('updated_at').limit(1)
      .then(({ error, data }) => {
        setSupabaseOk(!error)
        if (!error && data?.[0]?.updated_at) setLastSync(data[0].updated_at)
      })
      .catch(() => setSupabaseOk(false))
    listBackups().then(setBackups).catch(() => {})
  }, [])

  const [refreshDone, setRefreshDone] = useState(false)
  const [pullState, setPullState] = useState('idle')
  const [lastPull, setLastPull] = useState(() => getLastPullTime())
  const [cachedCount, setCachedCount] = useState(() => getCachedTasks().length)

  async function handlePullTasks() {
    if (pullState === 'idle') { setPullState('confirm'); return }
    if (pullState !== 'confirm') return
    setPullState('pulling')
    try {
      const { tasks } = await pullAndCacheTasks()
      setCachedCount(tasks.length)
      setLastPull(new Date().toISOString())
      setPullState('done')
      setTimeout(() => setPullState('idle'), 3000)
    } catch (e) {
      setPullState('error')
      setTimeout(() => setPullState('idle'), 3000)
    }
  }

  function formatTime(iso) {
    if (!iso) return null
    const d = new Date(iso)
    const now = new Date()
    const diffMins = Math.floor((now - d) / 60000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  function handleRefresh() {
    setRefreshDone(true)
    const doReload = () => { window.location.href = '/?v=' + Date.now() }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .then(() => caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))))
        .then(doReload).catch(doReload)
    } else {
      doReload()
    }
  }

  async function handleBackupNow() {
    setBackupState('saving')
    try {
      await createBackup(`Manual backup — ${fmtLabel(new Date())}`)
      const updated = await listBackups()
      setBackups(updated)
      setBackupState('done')
      setTimeout(() => setBackupState('idle'), 3000)
    } catch {
      setBackupState('error')
      setTimeout(() => setBackupState('idle'), 3000)
    }
  }

  async function handleRestore(backup) {
    setRestoreTarget(backup)
  }

  async function confirmRestore() {
    if (!restoreTarget) return
    setRestoreState('restoring')
    try {
      await restoreBackup(restoreTarget.id)
      const updated = await listBackups()
      setBackups(updated)
      setCachedCount(getCachedTasks().length)
      setRestoreState('done')
      setRestoreTarget(null)
      setTimeout(() => setRestoreState('idle'), 3000)
    } catch {
      setRestoreState('error')
      setRestoreTarget(null)
      setTimeout(() => setRestoreState('idle'), 3000)
    }
  }

  function handleReset() {
    localStorage.clear()
    setUsage({})
    setResetDone(true)
    setTimeout(() => setResetDone(false), 2000)
  }

  const cost = calcCost(usage)
  const monthLabel = new Date().toLocaleString('default', { month: 'long', year: 'numeric' })

  const integrations = [
    {
      icon: '🤖',
      name: 'Claude (Anthropic)',
      description: 'Powers all AI intelligence — Chief of Staff, all 7 heads, priority reasoning and chat.',
      connected: 'anthropic' in status ? status.anthropic : null,
      detail: `CoS: claude-sonnet-4-6 · Heads: claude-haiku-4-5 · Spend this month: $${cost.toFixed(4)}`,
      url: 'https://console.anthropic.com',
    },
    {
      icon: '📅',
      name: 'Google Calendar',
      description: 'Pulls upcoming events to the home screen and calendar view.',
      connected: 'googleCalendar' in status ? status.googleCalendar : null,
      detail: status.googleCalendar ? 'Calendar connected' : null,
      url: 'https://calendar.google.com',
    },
    {
      icon: '✅',
      name: 'Todoist',
      description: 'Task sync — all 7 buckets mirror your Todoist projects.',
      connected: 'todoist' in status ? status.todoist : null,
      detail: lastPull ? `Last synced ${formatTime(lastPull)} · ${cachedCount} tasks cached` : null,
      url: 'https://todoist.com',
    },
    {
      icon: '🗄️',
      name: 'Supabase',
      description: 'Persistent database — stores tasks, knowledge and settings across all devices.',
      connected: supabaseOk,
      detail: lastSync ? `Last sync ${formatTime(lastSync)}` : null,
      url: 'https://supabase.com',
    },
    {
      icon: '🔺',
      name: 'Vercel',
      description: 'Hosts and deploys the app — every GitHub commit triggers a new deployment.',
      connected: true,
      detail: window.location.hostname,
      url: 'https://vercel.com',
    },
    {
      icon: '🐙',
      name: 'GitHub',
      description: 'Version control — every build session commits and pushes here.',
      connected: true,
      detail: 'yogeshmistry99/Chief-of-Staff',
      url: 'https://github.com/yogeshmistry99/Chief-of-Staff',
    },
  ]

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B1F]">Settings</h1>
        <p className="text-sm text-[#49454F] mt-1">Manage your integrations and preferences.</p>
      </div>

      {/* Monthly cost card */}
      <div className="bg-white border border-[#CAC4D0] rounded-2xl px-4 py-3 mb-4">
        <h2 className="text-xs font-semibold text-[#49454F] uppercase tracking-wide mb-3">AI Usage · {monthLabel}</h2>
        <div className="flex items-end justify-between mb-2">
          <span className="text-3xl font-semibold text-[#1C1B1F]">${cost.toFixed(4)}</span>
          <span className="text-xs text-[#79747E] mb-1">{usage.calls ?? 0} {usage.calls === 1 ? 'conversation' : 'conversations'}</span>
        </div>
        <div className="flex gap-4 text-xs text-[#49454F]">
          <span>{(usage.input_tokens ?? 0).toLocaleString()} input tokens</span>
          <span>{(usage.output_tokens ?? 0).toLocaleString()} output tokens</span>
        </div>
      </div>

      {/* Integrations */}
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-[#1C1B1F] mb-0.5">How this app is built</h2>
        <p className="text-xs text-[#79747E] mb-3">Life OS connects these services to work. Tap any card to manage that integration.</p>
        <div className="space-y-2">
          {integrations.map((item) => <IntegrationCard key={item.name} {...item} />)}
        </div>
      </div>

      {/* Setup instructions */}
      <div className="bg-[#EADDFF] rounded-2xl p-4 mb-4">
        <h2 className="text-sm font-semibold text-[#21005D] mb-2">How to connect</h2>
        <ol className="text-xs text-[#21005D] space-y-1.5 list-decimal list-inside">
          <li>Copy <code className="bg-white/60 px-1 rounded">.env.example</code> to <code className="bg-white/60 px-1 rounded">.env</code></li>
          <li>Fill in each API key from the respective developer consoles</li>
          <li>Redeploy on Vercel — environment variables update automatically</li>
        </ol>
      </div>

      {/* App info */}
      <div className="bg-white border border-[#CAC4D0] rounded-2xl px-4 py-3 mb-4">
        <h2 className="text-xs font-semibold text-[#49454F] uppercase tracking-wide mb-2">About</h2>
        <div className="flex justify-between text-sm">
          <span className="text-[#49454F]">App name</span>
          <span className="font-medium text-[#1C1B1F]">Life OS</span>
        </div>
        <div className="flex justify-between text-sm mt-1.5">
          <span className="text-[#49454F]">Version</span>
          <span className="font-medium text-[#1C1B1F]">0.1.7</span>
        </div>
        <div className="flex justify-between text-sm mt-1.5">
          <span className="text-[#49454F]">Platform</span>
          <span className="font-medium text-[#1C1B1F]">PWA · Vite · React</span>
        </div>
      </div>

      {/* Todoist task cache */}
      <div className="bg-white border border-[#CAC4D0] rounded-2xl px-4 py-3 mb-4">
        <h2 className="text-xs font-semibold text-[#49454F] uppercase tracking-wide mb-3">Todoist Task Cache</h2>
        <p className="text-xs text-[#79747E] mb-3">
          Pulls all tasks from Todoist into local storage so they're available offline and to the AI heads. Merges without duplicates.
        </p>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm text-[#1C1B1F]">{cachedCount > 0 ? `${cachedCount} tasks cached` : 'No cache yet'}</p>
            {lastPull && <p className="text-xs text-[#79747E]">Last pulled {formatTime(lastPull)}</p>}
          </div>
          {pullState === 'confirm' ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#49454F]">Overwrite cache?</span>
              <button onClick={() => setPullState('idle')} className="px-3 py-1.5 rounded-full text-sm font-semibold bg-[#F3EDF7] text-[#49454F]">
                Cancel
              </button>
              <button onClick={handlePullTasks} className="px-3 py-1.5 rounded-full text-sm font-semibold bg-[#6750A4] text-white hover:bg-[#7965AF]">
                Yes, pull
              </button>
            </div>
          ) : (
            <button
              onClick={handlePullTasks}
              disabled={pullState === 'pulling'}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors flex-shrink-0 ${
                pullState === 'done'    ? 'bg-green-500 text-white' :
                pullState === 'error'  ? 'bg-red-500 text-white' :
                pullState === 'pulling'? 'bg-[#F3EDF7] text-[#79747E]' :
                                         'bg-[#6750A4] text-white hover:bg-[#7965AF]'
              }`}
            >
              {pullState === 'pulling' ? '⏳ Pulling…' :
               pullState === 'done'    ? '✓ Done' :
               pullState === 'error'   ? '✗ Failed' :
                                         'Pull tasks'}
            </button>
          )}
        </div>
      </div>

      {/* Backups */}
      <div className="bg-white border border-[#CAC4D0] rounded-2xl px-4 py-3 mb-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xs font-semibold text-[#49454F] uppercase tracking-wide">Backups</h2>
          <button
            onClick={handleBackupNow}
            disabled={backupState === 'saving' || !supabase}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              backupState === 'done'  ? 'bg-green-500 text-white' :
              backupState === 'error' ? 'bg-red-500 text-white' :
              backupState === 'saving'? 'bg-[#F3EDF7] text-[#79747E]' :
                                        'bg-[#6750A4] text-white hover:bg-[#7965AF]'
            }`}
          >
            {backupState === 'saving' ? 'Saving…' : backupState === 'done' ? '✓ Saved' : backupState === 'error' ? '✗ Failed' : 'Back up now'}
          </button>
        </div>
        <p className="text-xs text-[#79747E] mb-3">Weekly snapshots every Sunday at 8am. Last 12 kept.</p>

        {restoreState === 'done' && (
          <p className="text-xs text-green-600 font-medium mb-2">✓ Tasks restored successfully.</p>
        )}
        {restoreState === 'error' && (
          <p className="text-xs text-red-500 mb-2">Restore failed. Try again.</p>
        )}

        {/* Restore confirmation dialog */}
        {restoreTarget && (
          <div className="bg-[#FFF8E1] border border-[#FFE082] rounded-xl p-3 mb-3">
            <p className="text-xs font-semibold text-[#5D4037] mb-1">Restore from this snapshot?</p>
            <p className="text-xs text-[#795548] mb-2">
              This will replace your current tasks with the snapshot from <strong>{fmtBackupDate(restoreTarget.created_at)}</strong> ({restoreTarget.task_count} tasks).
              Your current tasks will be saved as a recovery point first.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setRestoreTarget(null)} className="flex-1 py-1.5 rounded-full text-xs font-semibold bg-white border border-[#CAC4D0] text-[#49454F]">Cancel</button>
              <button onClick={confirmRestore} disabled={restoreState === 'restoring'} className="flex-1 py-1.5 rounded-full text-xs font-semibold bg-[#6750A4] text-white">
                {restoreState === 'restoring' ? 'Restoring…' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {!supabase ? (
          <p className="text-xs text-[#79747E] py-2">Connect Supabase to enable backups.</p>
        ) : backups.length === 0 ? (
          <p className="text-xs text-[#79747E] py-2">No backups yet. Tap "Back up now" to create one.</p>
        ) : (
          <div className="space-y-0 divide-y divide-[#F3EDF7]">
            {backups.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2.5 gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#1C1B1F] truncate">{b.label}</p>
                  <p className="text-[11px] text-[#79747E]">{fmtBackupDate(b.created_at)} · {b.task_count} tasks</p>
                </div>
                <button
                  onClick={() => handleRestore(b)}
                  className="px-3 py-1 rounded-full text-xs font-semibold bg-[#F3EDF7] text-[#6750A4] hover:bg-[#EADDFF] flex-shrink-0"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hard refresh */}
      <button
        onClick={handleRefresh}
        className={`w-full py-3 rounded-full text-sm font-semibold transition-colors mb-3 ${
          refreshDone ? 'bg-green-500 text-white' : 'bg-[#F3EDF7] text-[#6750A4] hover:bg-[#EADDFF]'
        }`}
      >
        {refreshDone ? '✓ Refreshing…' : 'Hard refresh (clear cache)'}
      </button>
      <p className="text-center text-[10px] text-[#CAC4D0] mb-3">build d877411-new</p>

      {/* Reset */}
      <button
        onClick={handleReset}
        className={`w-full py-3 rounded-full text-sm font-semibold transition-colors ${
          resetDone ? 'bg-green-500 text-white' : 'bg-[#F3EDF7] text-[#B3261E] hover:bg-[#FCDAD7]'
        }`}
      >
        {resetDone ? '✓ Data cleared' : 'Reset app data'}
      </button>
    </div>
  )
}

