import { useNavigate } from 'react-router-dom'
import TrackerCards from '../components/tracker/TrackerCards'

// The trackers index, reached from its card on the Buckets screen.
//
// It sits alongside the seven buckets rather than inside one, because the
// trackers do not belong to a single area of life — the house search is Home,
// the medical log is Health, the car is Finance — and filing them under any one
// of those would hide the other three.
//
// It is NOT a task bucket, and deliberately not in PROJECTS, ALL_BUCKETS or
// BUCKET_META. Those drive `project_name` on every task, the Chief of Staff's
// weighted list and the priority framework; a bucket holding no tasks would
// appear in all of them as a permanently empty area of life.

export default function Trackers() {
  const navigate = useNavigate()

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-[#1C1B1F]">Trackers</h1>
          <p className="text-sm text-[#49454F] mt-1">
            Live from Google Sheets. Each opens its own view and refreshes when you open it.
          </p>
        </div>
        <button onClick={() => navigate('/buckets')} className="text-sm text-[#6750A4] flex-shrink-0 pt-1">
          Close
        </button>
      </div>

      <TrackerCards showHeading={false} />
    </div>
  )
}
