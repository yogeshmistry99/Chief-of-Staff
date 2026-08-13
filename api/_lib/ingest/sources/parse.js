// Shared, PURE parsing helpers for the portal adapters. No network here — the
// adapters fetch, these functions turn HTML/JSON into normalized fields. Kept
// pure so tests can run them against saved HTML fixtures with zero I/O.

// ─── Embedded-JSON extraction ───────────────────────────────────────────────────
// Portals ship most of their data as JSON inside the initial HTML. We read that
// rather than executing JS — deterministic, cheap, no headless browser.

// `window.<name> = { ... };`  →  parsed object (or null).
export function extractJsonAssignment(html, name) {
  if (!html) return null
  // Match `name = ` then balance braces from the first `{`.
  const re = new RegExp(`${name}\\s*=\\s*`)
  const m = re.exec(html)
  if (!m) return null
  const start = html.indexOf('{', m.index)
  if (start === -1) return null
  const json = sliceBalanced(html, start)
  return safeParse(json)
}

// `<script id="__NEXT_DATA__" type="application/json">{...}</script>` → object.
export function extractNextData(html) {
  if (!html) return null
  const m = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html)
  return m ? safeParse(m[1]) : null
}

// First `<script type="application/ld+json">…</script>` (or all, as an array).
export function extractLdJson(html) {
  if (!html) return []
  const out = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html))) {
    const v = safeParse(m[1])
    if (v) out.push(v)
  }
  return out
}

// Balance `{…}` starting at `open`, respecting strings/escapes. Returns the JSON
// substring or '' if unbalanced.
export function sliceBalanced(s, open) {
  let depth = 0, inStr = false, esc = false
  for (let i = open; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) return s.slice(open, i + 1) }
  }
  return ''
}

export function safeParse(s) {
  try { return JSON.parse(s) } catch { return null }
}

// ─── Field normalisers ──────────────────────────────────────────────────────────
export function toNumber(v) {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : null
}

const SQM_TO_SQFT = 10.7639

// Pull a floor area (in sq ft) from free text like "1,248 sq ft" or "116 sq m"
// or "116 m²". Returns null when no size is stated — never a guess.
export function sqftFromText(text) {
  if (!text) return null
  const s = String(text)
  const ft = /([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*ft|square\s*feet|ft2|ft²)/i.exec(s)
  if (ft) return Math.round(toNumber(ft[1]))
  const m2 = /([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*m|square\s*met|m2|m²)/i.exec(s)
  if (m2) return Math.round(toNumber(m2[1]) * SQM_TO_SQFT)
  return null
}

export function sqftFromSizing(sizings) {
  if (!Array.isArray(sizings)) return null
  for (const z of sizings) {
    const unit = String(z?.unit ?? '').toLowerCase()
    const min = toNumber(z?.minimumSize ?? z?.min ?? z?.value)
    if (min == null) continue
    if (unit.includes('sqft') || unit.includes('sq_ft') || unit === 'ft') return Math.round(min)
    if (unit.includes('sqm') || unit.includes('sq_m') || unit === 'm') return Math.round(min * SQM_TO_SQFT)
  }
  return null
}

// UK postcode (outcode + incode) from any text. Returns uppercased "SL1 2AB".
export function postcodeFromText(text) {
  if (!text) return null
  const m = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i.exec(String(text))
  return m ? `${m[1].toUpperCase()} ${m[2].toUpperCase()}` : null
}

// Map a portal's free-form type string to our house_type enum.
export function mapHouseType(raw) {
  const s = String(raw ?? '').toLowerCase()
  if (!s) return null
  if (s.includes('end of terrace') || s.includes('end terrace')) return 'end_terrace'
  if (s.includes('terrace')) return 'terraced'
  if (s.includes('semi')) return 'semi_detached'
  if (s.includes('detached')) return 'detached'
  if (s.includes('bungalow')) return 'bungalow'
  if (s.includes('flat') || s.includes('apartment') || s.includes('maisonette')) return 'flat'
  return 'other'
}

// Map a portal status to our status enum.
export function mapStatus(raw) {
  const s = String(raw ?? '').toLowerCase()
  if (s.includes('sold stc') || s.includes('sold subject') || s.includes('sstc')) return 'sold_stc'
  if (s.includes('under offer')) return 'under_offer'
  if (s.includes('withdrawn') || s.includes('removed')) return 'withdrawn'
  return 'available'
}

export function parkingFromText(text) {
  const s = String(text ?? '').toLowerCase()
  if (!s) return null
  return /\b(driveway|off[- ]?street|parking|garage|allocated|car port|carport)\b/.test(s) || null
}

export function garageFromText(text) {
  const s = String(text ?? '').toLowerCase()
  if (!s) return null
  return /\bgarage\b/.test(s) || null
}
