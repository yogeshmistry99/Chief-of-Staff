// Configuration for the Google Sheets trackers.
//
// ONE component, four configs. Adding a fifth tracker should mean adding an
// object here and nothing else — if it needs a code change in the components,
// the config shape is wrong.
//
// Columns are named, never indexed. These sheets are edited by hand and gain
// columns; indexing would silently shift every field in a tracker one to the
// left the first time a column was inserted. A renamed column shows as an empty
// field, which is visible; a shifted one shows as plausible wrong data, which is
// not.
//
// Ranges are deliberately bounded. Grid data is heavy, and the House register is
// already ~184 rows × 28 columns.

export const TRACKERS = [
  {
    key: 'house',
    title: 'House search',
    subtitle: '3-bed houses with parking, Slough & surrounds',
    spreadsheetId: '1DnplY2DJOHBeTbr-RYo1R5xVLFGvcEfun6Y9hRHugGU',
    view: 'scatter',
    // Header is row 4: a title row, a description row, then a blank spacer.
    // Verified against the live sheet 2026-08-15 — the whole tracker parses to
    // zero headers if this is off by one, with no other symptom.
    tabs: [{ title: 'Property Register', headerRow: 4, range: 'A1:AB400' }],

    // Scatter and table are the SAME rows from the SAME tab. The sheet also has
    // a separate "Price vs Floor Area" tab, but driving both off one row set
    // means the chart, the table, the detail card and the summary strip cannot
    // disagree with each other.
    scatter: {
      x: 'Floor area (sq ft)',
      y: 'Asking price',
      label: 'ID',
      xLabel: 'Floor area (sq ft)',
      yLabel: 'Asking price',
      // The sheet grades its own data quality; only clean comparables are
      // plotted, matching how the sheet's own scatter is built.
      filter: { column: 'Clean chart?', equals: 'Yes' },
    },

    summary: [
      { label: 'Median price', column: 'Asking price', stat: 'median', format: 'gbp' },
      { label: 'Median £/sq ft', column: '£/sq ft', stat: 'median', format: 'gbp' },
      { label: 'Plotted', stat: 'plotted' },
      { label: 'Records', stat: 'count' },
    ],

    // Filters narrow ONE row set, so the scatter, the table and the summary
    // strip always describe the same properties.
    //
    // Chosen against the live register rather than guessed: every column here is
    // well populated and has values worth separating. Deliberately excluded —
    // `Decision status` (all 184 rows read "Unreviewed", so it can only ever
    // filter to everything or nothing), and `Tenure` / `Bathrooms` / `EPC`
    // (under 40% filled, so a bound would hide most of the register).
    filters: [
      { column: 'Area group', label: 'Area', type: 'select' },
      { column: 'Listing status', label: 'Status', type: 'select' },
      { column: 'Property type', label: 'Property type', type: 'select' },
      { column: 'Quality grade', label: 'Data quality grade', type: 'select' },
      { column: 'Asking price', label: 'Asking price', type: 'range', format: 'gbp', step: 25_000 },
      { column: 'Floor area (sq ft)', label: 'Floor area (sq ft)', type: 'range', step: 100 },
      { column: '£/sq ft', label: '£ per sq ft', type: 'range', format: 'gbp', step: 50 },
    ],

    // 184 rows is a lot to scroll past to reach anything else, and the chart is
    // the point of this tracker. The table opens on demand.
    tableCollapsed: true,

    columns: ['ID', 'Address / listing location', 'Asking price', 'Floor area (sq ft)', '£/sq ft', 'Listing status'],

    detail: {
      title: 'Address / listing location',
      fields: [
        'Asking price', 'Floor area (sq ft)', '£/sq ft', 'Property type',
        'Listing status', 'Quality grade', 'Area group', 'Postcode',
        'Parking evidence', 'Decision status', 'Decision notes', 'Notes',
      ],
      links: [{ label: 'Open listing', column: 'Source URL' }],
    },
  },

  {
    key: 'medical',
    title: 'Medical tracker',
    subtitle: 'Head injury — appointments, documents and claims',
    spreadsheetId: '1ypR5q6XRLQDsiaaYU87cNDzbz0Oi7WXzsDzcRTzTIaU',
    view: 'grouped',
    // Header is row 2 here, not 3. The categories (Hospital & Acute Care, GP,
    // ENT, Neurology, Talking Therapies, Onebright CBT, Medication…) are merged
    // banner rows inside the data, which is what `grouped` reads.
    tabs: [{ title: 'Medical Tracker', headerRow: 2, range: 'A1:H200' }],

    columns: ['Date', 'What', 'Notes / Outcome', 'Medication', 'Cost / Amount Due (£)'],

    detail: {
      title: 'What',
      fields: ['Date', 'Notes / Outcome', 'Medication', 'Cost / Amount Due (£)', 'Action / To confirm'],
      links: [
        { label: 'View document', column: 'View document' },
        { label: 'View AXA claim', column: 'View AXA claim' },
      ],
    },
  },

  {
    key: 'car',
    title: 'Car value tracker',
    subtitle: '24-month depreciation strategy',
    spreadsheetId: '1ufvQ-chk-oYHecd808NnIa6_fVxZ0tGEFrzQNWvQx_o',
    view: 'grouped',
    // Multi-tab: a ranked summary, then one listings tab per model. The summary
    // supplies rank and strategy score; the listing tabs supply the cars. They
    // are joined on model name.
    // Tab titles are the sheet's ACTUAL tab names, read from the live
    // spreadsheet 2026-08-15 — not the model names shown in each tab's banner.
    // They differ enough ("Corolla 2.0" for Toyota Corolla, "ProCeed GT" for Kia
    // ProCeed) that no safe fuzzy match reaches them, and deliberately so:
    // loosening the matcher far enough to bind these would also let it bind the
    // wrong tab elsewhere, which is worse than an error.
    tabs: [
      { title: 'Dashboard', headerRow: 4, range: 'A1:H20', role: 'index' },
      { title: 'Corolla 2.0', headerRow: 4, range: 'A1:J60' },
      { title: 'ProCeed GT', headerRow: 4, range: 'A1:J60' },
      { title: 'CUPRA Leon', headerRow: 4, range: 'A1:J60' },
      { title: 'Kia EV6', headerRow: 4, range: 'A1:J60' },
      { title: 'Passat GTE', headerRow: 4, range: 'A1:J60' },
    ],
    index: { key: 'Model', order: 'Rank', badge: 'Strategy Score' },

    columns: ['Year', 'Variant / Trim', 'Mileage', 'Price', 'Verdict', 'Location'],
    highlight: { column: 'Verdict', values: { BARGAIN: 'good', WATCH: 'warn' } },

    detail: {
      title: 'Variant / Trim',
      fields: ['Year', 'Mileage', 'Price', 'Location', 'Verdict', 'Why', 'Miles / year', 'Source check'],
      links: [{ label: 'Open listing', column: 'Listing' }],
    },
  },

  {
    key: 'pub',
    title: 'Pub-to-home',
    subtitle: 'Conversion opportunities and feasibility',
    spreadsheetId: '1XQtU3ynWEYgBVumB5YIRgVJ46notmCNnjKD7y3YDxgw',
    view: 'table',
    // Header is row 4, same shape as the House register (title, description,
    // blank spacer). Verified against the live sheet 2026-08-15.
    tabs: [{ title: 'Projects', headerRow: 4, range: 'A1:AI80' }],

    columns: [
      'Project ID', 'Property / Opportunity', 'Town / Area', 'Asking Price (£)',
      'Overall Opportunity Score /10',
    ],

    // Finished value against an equivalent conventional house — the comparison
    // the model exists to make.
    compare: {
      label: 'Finished value vs conventional',
      a: 'Finished Value (£)',
      b: 'Equivalent Conventional House (£)',
    },

    // Built ENTIRELY from the selected row's own 35 columns. The sheet's own
    // Dashboard tab has a Project ID selector at B4, but driving it would need a
    // write back into the spreadsheet, which this build does not do at all.
    detail: {
      title: 'Property / Opportunity',
      fields: [
        'Status', 'Town / Area', 'Asking Price (£)', 'Model Purchase Price (£)',
        'Tenure', 'GIA (sqm)', 'Plot (acres)', 'Existing Bedrooms',
        'Listed Status', 'Conservation Area?', 'Green Belt?', 'ACV / Community Asset?',
        'Trading Status', 'C3 / Residential Position',
        'Nearest Useful Station', 'Central London (mins)',
        'School Score /10', 'London Score /10', 'Planning Confidence /10',
        'Character Score /10', 'Condition Score /10', 'Space / Plot Score /10',
        'Overall Opportunity Score /10',
        'Finished Value (£)', 'Equivalent Conventional House (£)',
        'Notes', 'Date Added', 'Last Checked',
      ],
      links: [{ label: 'Open listing', column: 'Listing URL' }],
    },
  },
]

export function getTracker(key) {
  return TRACKERS.find((t) => t.key === key) ?? null
}

// The query string for one tracker's fetch. Ranges carry the tab title so the
// server can report a mismatch by name instead of returning an empty table.
export function trackerQuery(tracker) {
  const params = new URLSearchParams({ action: 'sheet', id: tracker.spreadsheetId })
  for (const tab of tracker.tabs) {
    params.append('range', `'${String(tab.title).replace(/'/g, "''")}'!${tab.range}`)
    params.append('headerRow', String(tab.headerRow))
  }
  return params.toString()
}
