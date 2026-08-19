// The Health surface's two shared primitives.
//
// Lifted out of Health.jsx unchanged when the ring and session detail screens
// arrived, so all three surfaces render a card and a row identically rather than
// drifting apart. Tokens are the app's own: card `rounded-2xl bg-white
// border-[#CAC4D0]`, heading the uppercase section label used across Home and the
// journal, rows divided by `border-[#F3EDF7]`.

export function Card({ title, children }) {
  return (
    <div className="mb-2 rounded-2xl bg-white border border-[#CAC4D0] overflow-hidden">
      {title && (
        <div className="px-3.5 pt-3 pb-1">
          <h2 className="text-xs font-semibold text-[#49454F] uppercase tracking-wide">{title}</h2>
        </div>
      )}
      <div className="px-3.5 pb-2.5">{children}</div>
    </div>
  )
}

// One row: a value or a stated gap, never a zero standing in for an absence.
export function DetailRow({ label, value, absent }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5 border-b border-[#F3EDF7] last:border-0">
      <span className="text-sm text-[#49454F] min-w-0">{label}</span>
      {value != null ? (
        <span className="text-sm font-medium text-[#1C1B1F] tabular-nums flex-shrink-0">{value}</span>
      ) : (
        <span className="text-[11px] text-[#79747E] text-right flex-shrink-0 max-w-[60%] leading-tight">
          {absent ?? 'Not recorded'}
        </span>
      )}
    </div>
  )
}
