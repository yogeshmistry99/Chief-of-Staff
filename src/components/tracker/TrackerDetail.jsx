import { cellByHeader } from '../../lib/sheets'

// Expanded card for one selected row.
//
// Built entirely from THAT ROW'S OWN COLUMNS. For the pub tracker this is the
// deliberate alternative to driving the spreadsheet's Dashboard!B4 project
// selector, which would require writing back into the sheet — something this
// whole feature does not do.
//
// Empty fields are dropped rather than rendered blank: these sheets are wide and
// sparsely filled, so showing every configured field would bury the few that are
// actually populated.
export default function TrackerDetail({ row, headers, config, onClose }) {
  if (!row) return null
  const h = row.headers ?? headers

  const title = config.title ? cellByHeader(h, row, config.title).text : ''
  const fields = (config.fields ?? [])
    .map((f) => ({ label: f, cell: cellByHeader(h, row, f) }))
    .filter((f) => String(f.cell.text).trim())

  const links = (config.links ?? [])
    .map((l) => ({ label: l.label, cell: cellByHeader(h, row, l.column) }))
    .filter((l) => l.cell.url)

  return (
    <div className="mt-3 rounded-2xl bg-white border-2 border-[#6750A4] p-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#1C1B1F] leading-snug">{title || 'Selected row'}</h3>
          {row.group && <p className="text-[11px] text-[#79747E]">{row.group}</p>}
        </div>
        <button onClick={onClose} className="text-[11px] text-[#6750A4] flex-shrink-0">Close</button>
      </div>

      {links.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.cell.url}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-medium px-3 py-1.5 rounded-full bg-[#EADDFF] text-[#6750A4]"
            >
              {l.label} ↗
            </a>
          ))}
        </div>
      )}

      <dl className="space-y-1.5">
        {fields.map((f) => (
          <div key={f.label} className="flex gap-3 items-baseline">
            <dt className="text-[11px] text-[#79747E] w-32 flex-shrink-0">{f.label}</dt>
            <dd className="text-[11px] text-[#1C1B1F] flex-1 min-w-0 break-words">
              {f.cell.url
                ? <a href={f.cell.url} target="_blank" rel="noreferrer" className="text-[#6750A4] underline">{f.cell.text}</a>
                : f.cell.text}
            </dd>
          </div>
        ))}
      </dl>

      {fields.length === 0 && (
        <p className="text-[11px] text-[#79747E]">This row has no populated fields.</p>
      )}

      <p className="mt-3 pt-2 border-t border-[#F3EDF7] text-[10px] text-[#CAC4D0]">
        Sheet row {row.sheetRow}
      </p>
    </div>
  )
}
