// Turns Google Sheets grid data into rows the tracker components can render.
//
// This is the only place that understands sheet shape, and it is pure so the
// rules can be tested against fixtures without a token — which matters, because
// the Sheets API is unreachable from the build sandbox.
//
// WHY THIS IS NOT TRIVIAL: none of the four trackers is a clean table.
// Real structure, read from the live sheets:
//   • the header is on row 1, 2, 3 or 5 depending on the tab, so it is config
//   • merged banner rows sit INSIDE the data and are how grouping is expressed
//     (Medical's categories, Car's per-model sections)
//   • blank spacer rows appear between sections and must not end the table
//   • a trailing merged row is a footnote, not a group heading
//   • links come as hyperlinked cells AND as plain-text URLs, in the same sheet

const URL_RE = /^https?:\/\/\S+$/i

// A cell is always { text, url }. url is null when there is no link, so a caller
// can render an anchor purely on its presence.
//
// Three sources, in order. The first two are the ones values.get throws away:
//   1. `hyperlink` — a linked cell or an =HYPERLINK() formula
//   2. `textFormatRuns[].format.link.uri` — rich text where part of the cell is
//      linked; the first run carrying a link wins, since these cells are
//      "View document"-style labels rather than mixed prose
//   3. the text itself, when it is a bare URL (House "Source URL", Pub
//      "Listing URL" are stored this way rather than as links)
export function toCell(value) {
  const text = value?.formattedValue ?? ''
  if (value?.hyperlink) return { text, url: value.hyperlink }

  const runLink = (value?.textFormatRuns ?? [])
    .map((r) => r?.format?.link?.uri)
    .find(Boolean)
  if (runLink) return { text, url: runLink }

  const trimmed = String(text).trim()
  if (URL_RE.test(trimmed)) return { text, url: trimmed }

  return { text, url: null }
}

export function isBlankRow(cells) {
  return cells.every((c) => !String(c?.text ?? '').trim())
}

// Row indices (0-based) covered by a merge that starts in column 0 and spans
// more than one column — i.e. a full-width banner.
//
// Merges are used rather than "only the first cell has a value" because a
// genuine data row can legitimately have one populated column, and treating
// that as a section heading would silently swallow it.
export function bannerRows(merges = []) {
  const out = new Set()
  for (const m of merges) {
    const startCol = m?.startColumnIndex ?? 0
    const endCol = m?.endColumnIndex ?? 0
    if (startCol !== 0 || endCol - startCol < 2) continue
    const startRow = m?.startRowIndex ?? 0
    const endRow = m?.endRowIndex ?? startRow + 1
    for (let r = startRow; r < endRow; r++) out.add(r)
  }
  return out
}

// Trailing empties are dropped so a sheet padded to 1000 columns doesn't
// produce 1000 headers; interior blanks are kept, because a blank header in the
// middle still holds a real column position (the House scatter tab has several).
export function trimHeaders(cells) {
  const texts = cells.map((c) => String(c?.text ?? '').trim())
  let last = -1
  texts.forEach((t, i) => { if (t) last = i })
  return texts.slice(0, last + 1)
}

// Parse one tab.
//
// `headerRow` is 1-based to match what a person reads off the sheet, because
// that is how these configs get checked when a tracker looks wrong.
export function parseSheet(sheet, { headerRow = 1 } = {}) {
  const rowData = sheet?.data?.[0]?.rowData ?? []
  const banners = bannerRows(sheet?.merges ?? [])
  const grid = rowData.map((r) => (r?.values ?? []).map(toCell))

  const headerIdx = headerRow - 1
  const headers = trimHeaders(grid[headerIdx] ?? [])

  const rows = []
  const groups = []
  let currentGroup = null

  for (let i = headerIdx + 1; i < grid.length; i++) {
    const cells = grid[i]

    if (banners.has(i)) {
      const label = String(cells[0]?.text ?? '').trim()
      // A banner with no label is decorative; ignore it rather than opening a
      // nameless group.
      if (label) {
        currentGroup = { label, rowIndexes: [] }
        groups.push(currentGroup)
      }
      continue
    }

    if (isBlankRow(cells)) continue   // spacer between sections, not the end

    const row = {
      // The sheet's own row number, so a mis-parsed row can be found by eye.
      sheetRow: i + 1,
      group: currentGroup?.label ?? null,
      cells: headers.map((_, c) => cells[c] ?? { text: '', url: null }),
    }
    currentGroup?.rowIndexes.push(rows.length)
    rows.push(row)
  }

  // A banner with nothing under it is a footnote (Car's "SURFACING RULE…"),
  // not a section. Dropping it here stops an empty group rendering as a heading
  // with no content.
  const realGroups = groups.filter((g) => g.rowIndexes.length > 0)

  return { title: sheet?.properties?.title ?? null, headers, rows, groups: realGroups }
}

// Look a value up by header name. Configs name columns rather than indexing
// them, so inserting a column in the sheet doesn't silently shift every field
// in a tracker to the one next door.
export function cellByHeader(headers, row, header) {
  const i = headers.indexOf(header)
  if (i < 0) return { text: '', url: null }
  return row.cells[i] ?? { text: '', url: null }
}

export function textByHeader(headers, row, header) {
  return cellByHeader(headers, row, header).text
}

// Numbers in these sheets are formatted for people: "£575,000", "1,060",
// "8.5", "20.0%". Strip everything that isn't part of the number so a scatter
// axis or a median can use it. Returns null when there is no number at all,
// which callers must treat as "not plotted" rather than zero.
export function toNumber(text) {
  const s = String(text ?? '').replace(/[^0-9.\-]/g, '')
  if (!s || s === '-' || s === '.') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function median(values) {
  const nums = values.filter((v) => v != null).sort((a, b) => a - b)
  if (!nums.length) return null
  const mid = Math.floor(nums.length / 2)
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2
}
