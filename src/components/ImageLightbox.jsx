import { useEffect } from 'react'

export default function ImageLightbox({ src, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 left-4 z-10 flex items-center gap-1.5 text-white text-sm font-medium px-3 py-2 rounded-full bg-white/20 backdrop-blur-sm"
      >
        <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="white">
          <path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/>
        </svg>
        Back
      </button>
      <img
        src={src}
        alt="Attachment"
        className="w-full h-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
