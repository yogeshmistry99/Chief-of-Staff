import { createPortal } from 'react-dom'

const STYLES = {
  flag:           { label: 'Flag',           bg: 'bg-red-50',    pill: 'bg-red-100 text-red-700',    dot: 'bg-red-500' },
  suggestion:     { label: 'Suggestion',     bg: 'bg-blue-50',   pill: 'bg-blue-100 text-blue-700',  dot: 'bg-blue-500' },
  recommendation: { label: 'Recommendation', bg: 'bg-amber-50',  pill: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
}

export function notifDotClass(type) {
  return STYLES[type]?.dot ?? 'bg-[#6750A4]'
}

export default function NotificationCard({ notification, onAccept, onDecline, onRespond, onClose }) {
  const s = STYLES[notification.type] ?? STYLES.recommendation
  const hasAction = !!notification.suggestedTask

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end bg-black/30" onClick={onClose}>
      <div
        className={`w-full rounded-t-2xl px-5 pt-2 pb-8 shadow-xl ${s.bg}`}
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'slide-up 0.22s cubic-bezier(0.22,1,0.36,1)' }}
      >
        <div className="w-10 h-1 bg-[#CAC4D0] rounded-full mx-auto mb-4" />
        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold mb-3 ${s.pill}`}>
          {s.label}
        </span>
        <p className="text-sm text-[#1C1B1F] leading-relaxed mb-5">{notification.description}</p>
        <div className="flex gap-2">
          {hasAction && (
            <button
              onClick={onAccept}
              className="flex-1 py-2.5 rounded-full bg-[#6750A4] text-white text-sm font-semibold"
            >
              {notification.type === 'suggestion' ? 'Create task' : 'Accept'}
            </button>
          )}
          <button
            onClick={onDecline}
            className={`flex-1 py-2.5 rounded-full text-sm font-semibold bg-white text-[#49454F] border border-[#CAC4D0]`}
          >
            Dismiss
          </button>
          <button
            onClick={onRespond}
            className="flex-1 py-2.5 rounded-full text-sm font-semibold bg-[#F3EDF7] text-[#6750A4]"
          >
            Respond
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
