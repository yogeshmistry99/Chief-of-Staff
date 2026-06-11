import { useState, useEffect } from 'react'
import { getMonthlyUsage } from '../lib/claude'
import { pullAndCacheTasks, getLastPullTime, getCachedTasks } from '../lib/taskCache'

const INTEGRATIONS = [
  { name: 'Claude (Anthropic)', description: 'Powers the AI chat assistant.',           icon: '🤖', statusKey: 'anthropic',      color: 'bg-[#EADDFF]' },
  { name: 'Todoist',            description: 'Syncs your tasks and buckets.',            icon: '✅', statusKey: 'todoist',        color: 'bg-[#FFD8E4]' },
  { name: 'Google Calendar',    description: 'Shows upcoming events on the Home screen.', icon: '📅', statusKey: 'googleCalendar', color: 'bg-[#D3E4FF]' },
]

function ConnectionRow({ name, description, icon, color, connected }) {
  return (
    <div className="flex items-center gap-4 py-4 border-b border-[#F3EDF7] last:border-0">
      <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center text-xl flex-shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1C1B1F]">{name}</p>
        <p className="text-xs text-[#49454F] truncate">{description}</p>
      </div>
      <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${
        connected === null ? 'bg-[#F3EDF7] text-[#49454F]' :
        connected ? 'bg-[#C8F5E1] text-[#002115]' : 'bg-[#F3EDF7] text-[#49454F]'
      }`}>
        {connected === null ? '…' : connected ? 'Connected' : 'Not connected'}
      </span>
    </div>
  )
}

// Haiku 4.5 pricing: $0.80/MTok input, $4.00/MTok output
function calcCost({ input_tokens = 0, output_tokens = 0 }) {
  return (input_tokens / 1_000_000) * 0.80 + (output_tokens / 1_000_000) * 4.00
}

export default function Settings() {
  const [usage, setUsage] = useState({})
  const [resetDone, setResetDone] = useState(false)
  const [status, setStatus] = useState({})
  useEffect(() => { setUsage(getMonthlyUsage()) }, [])
  useEffect(() => {
    fetch('/api/status').then((r) => r.json()).then(setStatus).catch(() => {})
  }, [])

  const [refreshDone, setRefreshDone] = useState(false)
  const [pullState, setPullState] = useState('idle') // idle | pulling | done | error
  const [lastPull, setLastPull] = useState(() => getLastPullTime())
  const [cachedCount, setCachedCount] = useState(() => getCachedTasks().length)

  async function handlePullTasks() {
    setPullState('pulling')
    try {
      const { tasks, pulledCount } = await pullAndCacheTasks()
      setCachedCount(tasks.length)
      setLastPull(new Date().toISOString())
      setPullState('done')
      setTimeout(() => setPullState('idle'), 3000)
    } catch (e) {
      setPullState('error')
      setTimeout(() => setPullState('idle'), 3000)
    }
  }

  function formatPullTime(iso) {
    if (!iso) return null
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now - d
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  function handleRefresh() {
    setRefreshDone(true)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        Promise.all(regs.map((r) => r.unregister())).then(() => {
          caches.keys().then((keys) => {
            Promise.all(keys.map((k) => caches.delete(k))).then(() => {
              window.location.reload(true)
            })
          })
        })
      })
    } else {
      window.location.reload(true)
    }
  }

  function handleReset() {
    localStorage.clear()
    setUsage({})
    setResetDone(true)
    setTimeout(() => setResetDone(false), 2000)
  }

  const cost = calcCost(usage)
  const monthLabel = (() => {
    const d = new Date()
    return d.toLocaleString('default', { month: 'long', year: 'numeric' })
  })()

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
        <p className="text-[10px] text-[#79747E] mt-2">CoS: Sonnet 4.5 · Heads: Haiku 4.5</p>
      </div>

      {/* Integrations card */}
      <div className="bg-white border border-[#CAC4D0] rounded-2xl px-4 mb-4">
        <h2 className="text-xs font-semibold text-[#49454F] uppercase tracking-wide pt-4 pb-2">
          Integrations
        </h2>
        {INTEGRATIONS.map((item) => (
          <ConnectionRow key={item.name} {...item} connected={item.statusKey in status ? status[item.statusKey] : null} />
        ))}
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
            {lastPull && <p className="text-xs text-[#79747E]">Last pulled {formatPullTime(lastPull)}</p>}
          </div>
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
        </div>
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
