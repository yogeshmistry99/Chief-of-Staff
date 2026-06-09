export default function Home() {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const stats = [
    { label: 'Tasks today', value: '—', color: 'bg-[#EADDFF] text-[#21005D]' },
    { label: 'Events today', value: '—', color: 'bg-[#D3E4FF] text-[#001D36]' },
    { label: 'Priority 1', value: '—', color: 'bg-[#FFD8E4] text-[#31111D]' },
    { label: 'Buckets', value: '—', color: 'bg-[#C8F5E1] text-[#002115]' },
  ]

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm text-[#49454F] mb-1">{today}</p>
        <h1 className="text-2xl font-semibold text-[#1C1B1F]">Good morning</h1>
        <p className="text-sm text-[#49454F] mt-1">Here's your life at a glance.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {stats.map(({ label, value, color }) => (
          <div key={label} className={`rounded-2xl p-4 ${color}`}>
            <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
            <p className="text-3xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      {/* Today's focus placeholder */}
      <div className="bg-white border border-[#CAC4D0] rounded-2xl p-4 mb-4">
        <h2 className="text-sm font-semibold text-[#1C1B1F] mb-3">Today's focus</h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-5 h-5 rounded-full bg-[#E7E0EC] flex-shrink-0" />
              <div className="h-4 bg-[#E7E0EC] rounded-full flex-1" />
            </div>
          ))}
        </div>
        <p className="text-xs text-[#79747E] mt-3">Connect Todoist in Settings to load tasks.</p>
      </div>

      {/* Upcoming events placeholder */}
      <div className="bg-white border border-[#CAC4D0] rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-[#1C1B1F] mb-3">Upcoming events</h2>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-10 h-10 rounded-xl bg-[#D3E4FF] flex-shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-4 bg-[#E7E0EC] rounded-full w-3/4" />
                <div className="h-3 bg-[#E7E0EC] rounded-full w-1/2" />
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#79747E] mt-3">Connect Google Calendar in Settings to load events.</p>
      </div>
    </div>
  )
}
