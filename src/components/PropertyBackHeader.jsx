import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/haptic'

// Sub-route header with a back chevron, matching the app's MD3 look.
export default function PropertyBackHeader({ title, onBack }) {
  const navigate = useNavigate()
  return (
    <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-[#F3EDF7] px-2 py-2 flex items-center gap-1">
      <button onClick={() => { haptic.light(); onBack ? onBack() : navigate('/property') }}
        className="p-2 rounded-full active:bg-[#F3EDF7] text-[#49454F]" aria-label="Back">
        <svg xmlns="http://www.w3.org/2000/svg" height="22" viewBox="0 -960 960 960" width="22" fill="currentColor">
          <path d="M400-80 0-480l400-400 71 71-329 329 329 329-71 71Z" />
        </svg>
      </button>
      <h1 className="text-lg font-semibold text-[#1C1B1F] truncate">{title}</h1>
    </div>
  )
}
