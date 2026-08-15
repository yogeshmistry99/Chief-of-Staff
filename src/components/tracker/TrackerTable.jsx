import { cellByHeader } from '../../lib/sheets'

// A tracker table. Rows are tappable and open the detail card; link cells render
// as live anchors.
//
// Wide sheets scroll INSIDE their own container (overflow-x-auto) so the page
// body never scrolls sideways — the House register is 28 columns and the Pub
// pipeline is 35.

const TONE = {
  good: 'bg-[#E8F5E9] text-[#1B5E20]',
  warn: 'bg-[#FFF8E1] text-[#5D4037]',
}

function LinkCell({ cell }) {
  return (
    <a
      href={cell.url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}   // don't also open the detail card
      className="text-[#6750A4] underline whitespace-nowrap"
    >
      {cell.text || 'Open'}
    </a>
  )
}

export default function TrackerTable({ headers, rows, columns, highlight, selected, onSelect }) {
  const cols = (columns ?? headers).filter((c) => headers.includes(c))

  if (!rows.length) {
    return <p className="py-6 text-center text-xs text-[#79747E]">No rows.</p>
  }

  return (
    <div className="overflow-x-auto -mx-3 px-3">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="text-left text-[#49454F]">
            {cols.map((c) => (
              <th key={c} className="font-medium py-1.5 pr-3 whitespace-nowrap border-b border-[#CAC4D0]">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const on = selected && row.sheetRow === selected.sheetRow && row.tabIndex === selected.tabIndex
            return (
              <tr
                key={`${row.tabIndex}-${row.sheetRow}`}
                onClick={() => onSelect(row)}
                className={`cursor-pointer border-b border-[#F3EDF7] ${on ? 'bg-[#EADDFF]' : ''}`}
              >
                {cols.map((c) => {
                  const cell = cellByHeader(row.headers ?? headers, row, c)
                  const tone = highlight?.column === c
                    ? TONE[highlight.values?.[cell.text.trim().toUpperCase()]]
                    : null
                  return (
                    <td key={c} className="py-1.5 pr-3 align-top text-[#1C1B1F]">
                      {cell.url ? (
                        <LinkCell cell={cell} />
                      ) : tone ? (
                        <span className={`px-1.5 py-0.5 rounded-full font-medium ${tone}`}>{cell.text}</span>
                      ) : (
                        <span className="line-clamp-2">{cell.text}</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
