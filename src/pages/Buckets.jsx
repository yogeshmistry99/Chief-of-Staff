const PLACEHOLDER_BUCKETS = [
  { name: 'Health', emoji: '🏃', count: 0, color: 'bg-[#FFD8E4]', text: 'text-[#31111D]' },
  { name: 'Work', emoji: '💼', count: 0, color: 'bg-[#D3E4FF]', text: 'text-[#001D36]' },
  { name: 'Finance', emoji: '💰', count: 0, color: 'bg-[#C8F5E1]', text: 'text-[#002115]' },
  { name: 'Family', emoji: '🏠', count: 0, color: 'bg-[#FFF0C8]', text: 'text-[#261900]' },
  { name: 'Learning', emoji: '📚', count: 0, color: 'bg-[#EADDFF]', text: 'text-[#21005D]' },
  { name: 'Personal', emoji: '✨', count: 0, color: 'bg-[#E8F5E9]', text: 'text-[#1B5E20]' },
]

export default function Buckets() {
  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B1F]">Buckets</h1>
        <p className="text-sm text-[#49454F] mt-1">Your life, organised by area.</p>
      </div>

      {/* Bucket grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {PLACEHOLDER_BUCKETS.map(({ name, emoji, count, color, text }) => (
          <button
            key={name}
            className={`${color} ${text} rounded-2xl p-4 text-left active:scale-95 transition-transform`}
          >
            <span className="text-2xl mb-2 block">{emoji}</span>
            <p className="font-semibold text-sm">{name}</p>
            <p className="text-xs opacity-60 mt-0.5">{count} tasks</p>
          </button>
        ))}
      </div>

      {/* Empty state notice */}
      <div className="bg-white border border-[#CAC4D0] rounded-2xl p-5 text-center">
        <div className="w-12 h-12 bg-[#EADDFF] rounded-full flex items-center justify-center mx-auto mb-3">
          <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="#6750A4">
            <path d="M160-160v-80h640v80H160Zm0-160v-80h640v80H160Zm0-160v-80h640v80H160Zm0-160v-80h640v80H160Zm0-160v-80h640v80H160Z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-[#1C1B1F] mb-1">No tasks yet</p>
        <p className="text-xs text-[#49454F]">
          Connect Todoist in Settings to populate your buckets with real tasks.
        </p>
      </div>
    </div>
  )
}
