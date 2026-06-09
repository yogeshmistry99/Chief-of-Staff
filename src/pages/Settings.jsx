const INTEGRATIONS = [
  {
    name: 'Claude (Anthropic)',
    description: 'Powers the AI chat assistant.',
    icon: '🤖',
    envKey: 'VITE_ANTHROPIC_API_KEY',
    status: 'Not connected',
    color: 'bg-[#EADDFF]',
  },
  {
    name: 'Todoist',
    description: 'Syncs your tasks and buckets.',
    icon: '✅',
    envKey: 'VITE_TODOIST_API_KEY',
    status: 'Not connected',
    color: 'bg-[#FFD8E4]',
  },
  {
    name: 'Google Calendar',
    description: 'Shows upcoming events on the Home screen.',
    icon: '📅',
    envKey: 'VITE_GOOGLE_CLIENT_ID',
    status: 'Not connected',
    color: 'bg-[#D3E4FF]',
  },
  {
    name: 'Supabase',
    description: 'Persists your preferences and chat history.',
    icon: '🗄️',
    envKey: 'VITE_SUPABASE_URL',
    status: 'Not connected',
    color: 'bg-[#C8F5E1]',
  },
]

function ConnectionRow({ name, description, icon, status, color }) {
  const connected = import.meta.env[`VITE_${name.toUpperCase().replace(/[^A-Z]/g, '_')}`]

  return (
    <div className="flex items-center gap-4 py-4 border-b border-[#F3EDF7] last:border-0">
      <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center text-xl flex-shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1C1B1F]">{name}</p>
        <p className="text-xs text-[#49454F] truncate">{description}</p>
      </div>
      <span
        className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${
          connected
            ? 'bg-[#C8F5E1] text-[#002115]'
            : 'bg-[#F3EDF7] text-[#49454F]'
        }`}
      >
        {connected ? 'Connected' : status}
      </span>
    </div>
  )
}

export default function Settings() {
  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B1F]">Settings</h1>
        <p className="text-sm text-[#49454F] mt-1">Manage your integrations and preferences.</p>
      </div>

      {/* Integrations card */}
      <div className="bg-white border border-[#CAC4D0] rounded-2xl px-4 mb-4">
        <h2 className="text-xs font-semibold text-[#49454F] uppercase tracking-wide pt-4 pb-2">
          Integrations
        </h2>
        {INTEGRATIONS.map((item) => (
          <ConnectionRow key={item.name} {...item} />
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
      <div className="bg-white border border-[#CAC4D0] rounded-2xl px-4 py-3">
        <h2 className="text-xs font-semibold text-[#49454F] uppercase tracking-wide mb-2">About</h2>
        <div className="flex justify-between text-sm">
          <span className="text-[#49454F]">App name</span>
          <span className="font-medium text-[#1C1B1F]">Life OS</span>
        </div>
        <div className="flex justify-between text-sm mt-1.5">
          <span className="text-[#49454F]">Version</span>
          <span className="font-medium text-[#1C1B1F]">0.1.0</span>
        </div>
        <div className="flex justify-between text-sm mt-1.5">
          <span className="text-[#49454F]">Platform</span>
          <span className="font-medium text-[#1C1B1F]">PWA · Vite · React</span>
        </div>
      </div>
    </div>
  )
}
