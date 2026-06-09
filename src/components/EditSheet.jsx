import { createPortal } from 'react-dom'

export default function EditSheet({ open, onClose, title, onSave, saving, children }) {
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end" style={{ touchAction: 'none' }}>
      <div className="absolute inset-0 bg-black/40" onPointerDown={onClose} />
      <div className="relative w-full bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#CAC4D0]" />
        </div>
        <div className="flex items-center justify-between px-4 pb-2 flex-shrink-0">
          <h2 className="text-base font-semibold text-[#1C1B1F]">{title}</h2>
          <button onClick={onClose} className="p-1 text-[#79747E]">
            <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
              <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
          {children}
        </div>
        <div className="px-4 pt-3 pb-4 border-t border-[#E7E0EC] flex-shrink-0 safe-bottom">
          <button
            onClick={onSave}
            disabled={saving}
            className="w-full py-3 rounded-full bg-[#6750A4] text-white font-medium text-sm disabled:opacity-50 active:bg-[#5B4397] transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
