// Ingestion configuration — KEYED BY AREA so adding a region later is a config
// entry, not a code change. Only Slough is populated for the first increment;
// dropping in a second area (its search URLs + budget) is all that's needed to
// start accumulating a comparable dataset for overlay.
//
// searchUrl is the FULL portal search-results URL. The most robust way to
// configure a source is to run the search once in a browser (3-bed, your budget,
// the right area + property types) and paste the resulting URL here — that avoids
// hard-coding each portal's internal location codes, which change. Pagination is
// handled per-source in the adapter (Rightmove &index=, Zoopla &pn=, OTM page-N).
//
// A source with a null searchUrl is skipped. Start with Rightmove; add the others
// once you've confirmed their parsing against a live page.

export const DEFAULT_AREA = 'slough'

export const AREAS = {
  slough: {
    label: 'Slough',
    budget: 450000,          // hard acquisition ceiling — the £/budget line on the graph
    minBedrooms: 3,
    // Bounding box (approx) used to keep geocoding/factor datasets local. [S,W,N,E]
    bbox: [51.46, -0.68, 51.56, -0.50],
    sources: {
      // NOTE: replace these with the real search URLs from your browser. The
      // examples below encode "Slough area, 3+ beds, ≤£450k, houses" but the
      // locationIdentifier is a placeholder and MUST be verified before a live run.
      rightmove: {
        searchUrl:
          'https://www.rightmove.co.uk/property-for-sale/find.html?searchType=SALE' +
          '&locationIdentifier=REGION%5E1024&minBedrooms=3&maxPrice=450000' +
          '&propertyTypes=detached%2Csemi-detached%2Cterraced&includeSSTC=true',
        pageSize: 24,
      },
      zoopla: { searchUrl: null },        // add once parsing is confirmed live
      onthemarket: { searchUrl: null },   // add once parsing is confirmed live
    },
  },
}

export function areaConfig(area = DEFAULT_AREA) {
  return AREAS[area] ?? null
}

// A realistic desktop browser UA. Portals 403 obvious bot UAs; this is a
// personal, weekly, low-volume use — keep the request count small and polite.
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

// Politeness / safety limits for one bounded run (stays within the 60s function).
export const RUN_LIMITS = {
  maxDetailFetches: 20,   // enrich at most N properties per run (newest + stalest first)
  perRequestDelayMs: 800, // gap between portal requests
  fetchTimeoutMs: 12000,
}
