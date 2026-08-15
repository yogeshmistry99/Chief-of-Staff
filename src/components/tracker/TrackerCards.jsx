import { useNavigate } from 'react-router-dom'
import { haptic } from '../../lib/haptic'
import { TRACKERS } from '../../lib/trackers'

// The tracker dashboard: one card per tracker, opening its full view.
//
// Deliberately does NOT fetch anything. Four sheet reads on every Home render
// would be slow, would burn quota, and would mean the priorities screen waited
// on Google. Each tracker fetches when its own card is opened, which is also
// what "fetch on page/card open" asks for.

export default function TrackerCards() {
  const navigate = useNavigate()

  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-[#1C1B1F] mb-2">Trackers</h2>
      <div className="grid grid-cols-2 gap-2">
        {TRACKERS.map((t) => (
          <button
            key={t.key}
            onClick={() => { haptic.light(); navigate(`/trackers/${t.key}`) }}
            className="text-left bg-white border border-[#CAC4D0] rounded-2xl p-3 shadow-sm active:bg-[#F3EDF7] transition-colors"
          >
            <p className="text-sm font-medium text-[#1C1B1F] leading-tight">{t.title}</p>
            <p className="text-[10px] text-[#79747E] leading-snug mt-0.5 line-clamp-2">{t.subtitle}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
