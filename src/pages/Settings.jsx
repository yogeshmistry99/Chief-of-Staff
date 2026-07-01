import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getMonthlyUsage } from '../lib/claude'
import { pullAndCacheTasks, getLastPullTime, getCachedTasks } from '../lib/taskCache'
import { supabase } from '../lib/supabase'
import { listBackups, createBackup, restoreBackup, fmtBackupDate, fmtLabel } from '../lib/backups'

// Sonnet 4.6: $3/MTok input, $15/MTok output
// Haiku 4.5:  $0.80/MTok input, $4.00/MTok output
function calcCost(usage) {
  const si = usage.sonnet_input  ?? 0
  const so = usage.sonnet_output ?? 0
  const hi = usage.haiku_input   ?? (usage.input_tokens  ?? 0) - si
  const ho = usage.haiku_output  ?? (usage.output_tokens ?? 0) - so
  return (si / 1_000_000) * 3.00 + (so / 1_000_000) * 15.00
       + (hi / 1_000_000) * 0.80 + (ho / 1_000_000) *  4.00
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

function CollapsibleSection({ title, subtitle, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen((x) => !x)}
        className="w-full flex items-center justify-between mb-1 group"
      >
        <div className="text-left">
          <p className="text-sm font-semibold text-[#1C1B1F]">{title}</p>
          {subtitle && <p className="text-xs text-[#79747E]">{subtitle}</p>}
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20"
          fill="#79747E"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', flexShrink: 0 }}
        >
          <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z"/>
        </svg>
      </button>
      <div style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.25s ease',
      }}>
        <div style={{ overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

const SPEND_LIMIT_KEY = 'cos_monthly_spend_limit'

export default function Settings() {
  const [usage, setUsage] = useState({})
  const [resetDone, setResetDone] = useState(false)
  const [calendarDisconnecting, setCalendarDisconnecting] = useState(false)
  const [spendLimit, setSpendLimit] = useState(() => {
    const v = parseFloat(localStorage.getItem(SPEND_LIMIT_KEY))
    return isNaN(v) ? 20 : v
  })
  const [editingLimit, setEditingLimit] = useState(false)
  const [limitDraft, setLimitDraft] = useState('')
  const [status, setStatus] = useState({})
  const [supabaseOk, setSupabaseOk] = useState(null)
  const [lastSync, setLastSync] = useState(null)
  const [backups, setBackups] = useState([])
  const [backupState, setBackupState] = useState('idle') // idle | saving | done | error
  const [restoreTarget, setRestoreTarget] = useState(null) // backup obj to confirm
  const [restoreState, setRestoreState] = useState('idle') // idle | restoring | done | error
  const [calendarNotice, setCalendarNotice] = useState(null) // 'connected' | error string

  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => { setUsage(getMonthlyUsage()) }, [])

  // Handle OAuth redirect params
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('calendar_connected')) {
      setCalendarNotice('connected')
      navigate('/settings', { replace: true })
    } else if (params.get('calendar_error')) {
      setCalendarNotice(params.get('calendar_error'))
      navigate('/settings', { replace: true })
    }
  }, [location.search, navigate])

  function fetchStatus() {
    fetch('/api/status').then((r) => r.json()).then(setStatus).catch(() => {})
  }
  useEffect(() => { fetchStatus() }, [])
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

  async function handleCalendarDisconnect() {
    setCalendarDisconnecting(true)
    try {
      await fetch('/api/google-disconnect', { method: 'POST' })
      setCalendarNotice(null)
      fetchStatus()
    } catch {}
    setCalendarDisconnecting(false)
  }

  function saveSpendLimit(val) {
    const n = parseFloat(val)
    if (!isNaN(n) && n > 0) {
      localStorage.setItem(SPEND_LIMIT_KEY, String(n))
      setSpendLimit(n)
    }
    setEditingLimit(false)
  }

  const cost = calcCost(usage)
  const monthLabel = new Date().toLocaleString('default', { month: 'long', year: 'numeric' })
  const pct = spendLimit > 0 ? Math.min(100, (cost / spendLimit) * 100) : 0
  const resetDate = (() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth() + 1, 1).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  })()

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
      detail: status.googleCalendar && status.calendarEmail ? status.calendarEmail : status.googleCalendar ? 'Connected' : null,
      url: null,
      isCalendar: true,
    },
    {
      icon: '✅',
      name: 'Todoist',
      description: 'Task import — bring tasks from Todoist into the app when onboarding or catching up.',
      connected: 'todoist' in status ? status.todoist : null,
      detail: lastPull ? `Last imported ${formatTime(lastPull)} · ${cachedCount} tasks` : null,
      url: 'https://todoist.com',
    },
    {
      icon: '🗄️',
      name: 'Supabase',
      description: 'Source of truth — all tasks, knowledge, settings and backups live here, synced across devices.',
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
    <div className="px-4 pt-6 pb-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-[#1C1B1F]">Settings</h1>
      </div>

      {/* Hard refresh — top utility action */}
      <button
        onClick={handleRefresh}
        className={`w-full py-2.5 rounded-full text-sm font-semibold transition-colors mb-4 ${
          refreshDone ? 'bg-green-500 text-white' : 'bg-[#F3EDF7] text-[#6750A4] hover:bg-[#EADDFF]'
        }`}
      >
        {refreshDone ? '✓ Refreshing…' : 'Hard refresh (clear cache)'}
      </button>

      {/* AI Spend */}
      <CollapsibleSection
        title="AI Spend"
        subtitle={`${monthLabel} · $${cost.toFixed(2)} of $${spendLimit.toFixed(0)}`}
      >
        <div className="bg-white border border-[#CAC4D0] rounded-2xl px-4 py-4 mt-2">
          <div className="flex items-end justify-between mb-3">
            <div>
              <span className="text-3xl font-bold text-[#1C1B1F]">${cost.toFixed(2)}</span>
              <span className="text-sm text-[#79747E] ml-1">/ ${spendLimit.toFixed(0)}</span>
            </div>
            <span className="text-xs text-[#79747E]">{usage.calls ?? 0} {usage.calls === 1 ? 'call' : 'calls'}</span>
          </div>

          <div className="h-2 rounded-full bg-[#F3EDF7] overflow-hidden mb-1">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: pct >= 90 ? '#B3261E' : pct >= 70 ? '#E8A000' : '#6750A4' }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-[#79747E] mb-4">
            <span>{pct.toFixed(0)}% used</span>
            <span>Resets {resetDate}</span>
          </div>

          <div className="flex gap-4 text-xs text-[#49454F] mb-4">
            <span>{(usage.sonnet_input ?? 0).toLocaleString()} Sonnet in</span>
            <span>{(usage.haiku_input ?? 0).toLocaleString()} Haiku in</span>
          </div>

          <div className="flex gap-2 mb-4">
            <a
              href="https://console.anthropic.com/settings/billing"
              target="_blank" rel="noopener noreferrer"
              className="flex-1 py-2 rounded-full text-sm font-semibold text-center bg-[#6750A4] text-white hover:bg-[#5B4397]"
            >
              Buy credits
            </a>
            <a
              href="https://console.anthropic.com/settings/cost"
              target="_blank" rel="noopener noreferrer"
              className="flex-1 py-2 rounded-full text-sm font-semibold text-center bg-[#F3EDF7] text-[#6750A4] hover:bg-[#EADDFF]"
            >
              View usage
            </a>
          </div>

          <div className="border-t border-[#F3EDF7] pt-3">
            <p className="text-xs text-[#79747E] mb-2">Monthly spend limit</p>
            {editingLimit ? (
              <div className="flex gap-2">
                <input
                  autoFocus type="number" min="1" value={limitDraft}
                  onChange={(e) => setLimitDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveSpendLimit(limitDraft); if (e.key === 'Escape') setEditingLimit(false) }}
                  className="flex-1 text-sm border border-[#CAC4D0] rounded-xl px-3 py-1.5 outline-none focus:border-[#6750A4]"
                  placeholder="e.g. 20"
                />
                <button onClick={() => saveSpendLimit(limitDraft)} className="text-sm font-medium text-[#6750A4] px-3">Save</button>
                <button onClick={() => setEditingLimit(false)} className="text-sm text-[#79747E] px-2">Cancel</button>
              </div>
            ) : (
              <button onClick={() => { setLimitDraft(String(spendLimit)); setEditingLimit(true) }} className="text-sm font-medium text-[#6750A4]">
                ${spendLimit.toFixed(0)} / month — tap to change
              </button>
            )}
          </div>
          <p className="text-[10px] text-[#79747E] mt-3 opacity-60">Estimated from local token counts. Check Anthropic console for exact billing.</p>
        </div>
      </CollapsibleSection>

      {/* Integrations */}
      <CollapsibleSection title="How this app is built" subtitle="Tap any card to manage the connection.">
        <div className="space-y-2 pt-2">
          {calendarNotice === 'connected' && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#C8F5E1] text-[#00513A] text-xs font-medium">
              <span>✓</span><span>Google Calendar connected successfully.</span>
              <button onClick={() => setCalendarNotice(null)} className="ml-auto text-[#00513A] opacity-60">✕</button>
            </div>
          )}
          {calendarNotice && calendarNotice !== 'connected' && (
            <div className="px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700">
              <span className="font-semibold block mb-0.5">Calendar connection failed</span>
              {calendarNotice}
            </div>
          )}
          {integrations.map((item) => {
            if (item.isCalendar) {
              const isConnected = item.connected
              const isLoading = item.connected === null
              return (
                <div key={item.name} className={`flex items-start gap-3 p-4 rounded-2xl border ${isConnected ? 'bg-white border-[#CAC4D0]' : 'bg-[#FAFAFA] border-[#E7E0EC]'}`}>
                  <div className="w-10 h-10 rounded-xl bg-[#F3EDF7] flex items-center justify-center text-xl flex-shrink-0">📅</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-[#1C1B1F] leading-tight">{item.name}</p>
                      <StatusPill connected={isLoading ? null : isConnected} />
                    </div>
                    <p className="text-xs text-[#49454F] leading-snug mb-2">{item.description}</p>
                    {isConnected && item.detail && (
                      <p className="text-[11px] text-[#79747E] mb-2">{item.detail}</p>
                    )}
                    {isConnected ? (
                      <button
                        onClick={handleCalendarDisconnect}
                        disabled={calendarDisconnecting}
                        className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                      >
                        {calendarDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                      </button>
                    ) : !isLoading && (
                      <a
                        href="/api/google-auth?return=/settings"
                        className="inline-block text-xs font-semibold px-3 py-1.5 rounded-full bg-[#6750A4] text-white hover:bg-[#5B4397] transition-colors"
                      >
                        Connect Google Calendar
                      </a>
                    )}
                  </div>
                </div>
              )
            }
            return <IntegrationCard key={item.name} {...item} />
          })}
        </div>
        <div className="bg-[#EADDFF] rounded-2xl p-4 mt-2">
          <h2 className="text-sm font-semibold text-[#21005D] mb-2">How to connect</h2>
          <ol className="text-xs text-[#21005D] space-y-1.5 list-decimal list-inside">
            <li>Copy <code className="bg-white/60 px-1 rounded">.env.example</code> to <code className="bg-white/60 px-1 rounded">.env</code></li>
            <li>Fill in each API key from the respective developer consoles</li>
            <li>Redeploy on Vercel — environment variables update automatically</li>
          </ol>
          <p className="text-[11px] text-[#21005D] opacity-70 mt-3">Tasks live in Supabase. Todoist is used for one-off imports only. Google Calendar is read-only.</p>
        </div>
      </CollapsibleSection>

      {/* Todoist import */}
      <CollapsibleSection title="Import from Todoist" subtitle={cachedCount > 0 ? `${cachedCount} tasks in Supabase` : 'One-off import'}>
        <div className="bg-white border border-[#CAC4D0] rounded-2xl px-4 py-3 mt-2">
          <p className="text-xs text-[#79747E] mb-3">
            Imports tasks from Todoist into Supabase. Use this when onboarding or to bring in a fresh batch of tasks.
          </p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[#1C1B1F]">{cachedCount > 0 ? `${cachedCount} tasks` : 'No tasks yet'}</p>
              {lastPull && <p className="text-xs text-[#79747E]">Last imported {formatTime(lastPull)}</p>}
            </div>
            {pullState === 'confirm' ? (
              <div className="flex items-center gap-2">
                <button onClick={() => setPullState('idle')} className="px-3 py-1.5 rounded-full text-sm font-semibold bg-[#F3EDF7] text-[#49454F]">Cancel</button>
                <button onClick={handlePullTasks} className="px-3 py-1.5 rounded-full text-sm font-semibold bg-[#6750A4] text-white">Import</button>
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
                {pullState === 'pulling' ? '⏳ Importing…' : pullState === 'done' ? '✓ Done' : pullState === 'error' ? '✗ Failed' : 'Import tasks'}
              </button>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* Backups */}
      <CollapsibleSection title="Backups" subtitle={`Weekly snapshots · ${backups.length} saved`}>
        <div className="bg-white border border-[#CAC4D0] rounded-2xl px-4 py-3 mt-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-[#79747E]">Weekly snapshots every Sunday. Last 12 kept.</p>
            <button
              onClick={handleBackupNow}
              disabled={backupState === 'saving' || !supabase}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex-shrink-0 ml-2 ${
                backupState === 'done'  ? 'bg-green-500 text-white' :
                backupState === 'error' ? 'bg-red-500 text-white' :
                backupState === 'saving'? 'bg-[#F3EDF7] text-[#79747E]' :
                                          'bg-[#6750A4] text-white hover:bg-[#7965AF]'
              }`}
            >
              {backupState === 'saving' ? 'Saving…' : backupState === 'done' ? '✓ Saved' : backupState === 'error' ? '✗ Failed' : 'Back up now'}
            </button>
          </div>

          {restoreState === 'done' && <p className="text-xs text-green-600 font-medium mt-2">✓ Tasks restored successfully.</p>}
          {restoreState === 'error' && <p className="text-xs text-red-500 mt-2">Restore failed. Try again.</p>}

          {restoreTarget && (
            <div className="bg-[#FFF8E1] border border-[#FFE082] rounded-xl p-3 mt-3">
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

          <div className="mt-3">
            {!supabase ? (
              <p className="text-xs text-[#79747E] py-2">Connect Supabase to enable backups.</p>
            ) : backups.length === 0 ? (
              <p className="text-xs text-[#79747E] py-2">No backups yet. Tap "Back up now" to create one.</p>
            ) : (
              <div className="divide-y divide-[#F3EDF7]">
                {backups.map((b) => (
                  <div key={b.id} className="flex items-center justify-between py-2.5 gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[#1C1B1F] truncate">{b.label}</p>
                      <p className="text-[11px] text-[#79747E]">{fmtBackupDate(b.created_at)} · {b.task_count} tasks</p>
                    </div>
                    <button onClick={() => handleRestore(b)} className="px-3 py-1 rounded-full text-xs font-semibold bg-[#F3EDF7] text-[#6750A4] hover:bg-[#EADDFF] flex-shrink-0">
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* About — bottom of list */}
      <CollapsibleSection title="About" subtitle="Life OS · v0.1.7 · PWA">
        <div className="bg-white border border-[#CAC4D0] rounded-2xl px-4 py-3 mt-2">
          {[
            ['App', 'Life OS'],
            ['Version', '0.1.7'],
            ['Platform', 'PWA · Vite · React'],
            ['AI', 'Claude Sonnet (CoS) · Haiku (Heads)'],
            ['Build', '969b717'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between text-sm mt-1.5 first:mt-0">
              <span className="text-[#49454F]">{label}</span>
              <span className="font-medium text-[#1C1B1F]">{value}</span>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Reset — danger zone at bottom */}
      <button
        onClick={handleReset}
        className={`w-full mt-2 py-2.5 rounded-full text-sm font-semibold transition-colors ${
          resetDone ? 'bg-green-500 text-white' : 'bg-[#F3EDF7] text-[#B3261E] hover:bg-[#FCDAD7]'
        }`}
      >
        {resetDone ? '✓ Data cleared' : 'Reset app data'}
      </button>
    </div>
  )
}

