// The interactive factor model — the app's centrepiece. Pure, deterministic,
// dependency-free, runs in the browser on the loaded dataset. NO LLM, no tokens.
//
// price ~ intercept + β·floor_area + Σ (enabled factor terms)
//
// DEFAULT_BUDGET is the hard acquisition ceiling drawn on the graph and used to
// bucket opportunities. Kept here so the client shares one number.

export const DEFAULT_BUDGET = 450000
//
// Floor area is the always-on base predictor (the graph's X axis). Every other
// factor is switchable; toggling one refits and the coefficients — each a direct
// £-impact on value — are the answer to "what actually drives this house's price".

// ─── Switchable factors ─────────────────────────────────────────────────────────
// kind: 'bool' | 'num' | 'ordinal' | 'cat'. `unitLabel` describes the coefficient.
export const MODEL_FACTORS = [
  { key: 'parking',           label: 'Parking',            kind: 'bool',    unitLabel: '£ vs none' },
  { key: 'garage',            label: 'Garage',             kind: 'bool',    unitLabel: '£ vs none' },
  { key: 'nearest_station_m', label: 'Station distance',   kind: 'num',     scale: 100, unitLabel: '£ / 100m' },
  { key: 'nearest_school_m',  label: 'School distance',    kind: 'num',     scale: 100, unitLabel: '£ / 100m' },
  { key: 'extension_potential', label: 'Extension potential', kind: 'ordinal', unitLabel: '£ / level' },
  { key: 'house_type',        label: 'House type',         kind: 'cat',     unitLabel: '£ vs base' },
]
const FACTOR_BY_KEY = Object.fromEntries(MODEL_FACTORS.map((f) => [f.key, f]))

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const prettyType = (t) => String(t ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

// ─── Linear algebra (small, exact enough) ───────────────────────────────────────
function transpose(M) { return M[0].map((_, j) => M.map((r) => r[j])) }
function matVec(M, v) { return M.map((r) => r.reduce((s, x, j) => s + x * v[j], 0)) }
function matMul(A, B) {
  const Bt = transpose(B)
  return A.map((row) => Bt.map((col) => row.reduce((s, x, k) => s + x * col[k], 0)))
}
// Solve A x = b (A square) by Gauss-Jordan with partial pivoting. null if singular.
function solve(A, b) {
  const n = A.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r
    if (Math.abs(M[piv][col]) < 1e-9) return null
    ;[M[col], M[piv]] = [M[piv], M[col]]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r][col] / M[col][col]
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  return M.map((row, i) => row[n] / M[i][i])
}

// ─── Design columns ──────────────────────────────────────────────────────────────
// Each column exposes value(p) → number | null. A property missing any enabled
// column's value is excluded from the fit and cannot be scored (expected = null),
// never guessed.
function buildColumns(props, enabledKeys) {
  const cols = [{ id: 'floor_area', label: 'Floor area', unitLabel: '£ / sq ft', value: (p) => num(p.floor_area_sqft) }]
  for (const key of enabledKeys) {
    const f = FACTOR_BY_KEY[key]
    if (!f) continue
    if (f.kind === 'bool') {
      cols.push({ id: key, label: f.label, unitLabel: f.unitLabel, factor: f,
        value: (p) => (p[key] === true ? 1 : p[key] === false ? 0 : null) })
    } else if (f.kind === 'cat') {
      const types = props.map((p) => p.house_type).filter(Boolean)
      const base = mode(types)
      for (const t of uniq(types)) {
        if (t === base) continue
        cols.push({ id: `type_${t}`, label: `${prettyType(t)} vs ${prettyType(base)}`, unitLabel: f.unitLabel, factor: f,
          value: (p) => (p.house_type == null ? null : p.house_type === t ? 1 : 0) })
      }
    } else { // num / ordinal
      cols.push({ id: key, label: f.label, unitLabel: f.unitLabel, factor: f,
        value: (p) => num(p[key]) })
    }
  }
  return cols
}

function uniq(a) { return [...new Set(a)] }
function mode(a) {
  const c = {}; let best = null, bc = -1
  for (const x of a) { c[x] = (c[x] ?? 0) + 1; if (c[x] > bc) { bc = c[x]; best = x } }
  return best
}

// ─── Fit ─────────────────────────────────────────────────────────────────────────
// Returns { ok, columns, coefficients, intercept, r2, n, predict, scored, insufficient }.
export function fitModel(properties, enabledKeys = [], { minRows = 0 } = {}) {
  const props = (properties ?? []).filter((p) => num(p.asking_price) != null)
  const cols = buildColumns(props, enabledKeys)

  // Rows usable = price present AND every enabled column value present.
  const usable = props.filter((p) => cols.every((c) => c.value(p) != null))
  const need = Math.max(cols.length + 2, minRows) // never fit with fewer than params+2
  if (usable.length < need) {
    return { ok: false, insufficient: true, need, have: usable.length, columns: cols, scored: scoreWith(props, null, cols) }
  }

  const X = usable.map((p) => [1, ...cols.map((c) => c.value(p))])
  const y = usable.map((p) => num(p.asking_price))
  const Xt = transpose(X)
  const beta = solve(matMul(Xt, X), matVec(Xt, y))
  if (!beta) return { ok: false, insufficient: true, need, have: usable.length, columns: cols, scored: scoreWith(props, null, cols) }

  const intercept = beta[0]
  const coefficients = cols.map((c, i) => ({ id: c.id, label: c.label, unitLabel: c.unitLabel, coef: beta[i + 1],
    display: displayCoef(beta[i + 1], c) }))

  // R²
  const yhat = matVec(X, beta)
  const ybar = y.reduce((s, v) => s + v, 0) / y.length
  const ssRes = y.reduce((s, v, i) => s + (v - yhat[i]) ** 2, 0)
  const ssTot = y.reduce((s, v) => s + (v - ybar) ** 2, 0)
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0

  const predict = (p) => {
    let acc = intercept
    for (let i = 0; i < cols.length; i++) {
      const v = cols[i].value(p)
      if (v == null) return null
      acc += beta[i + 1] * v
    }
    return acc
  }

  return { ok: true, insufficient: false, columns: cols, coefficients, intercept, r2, n: usable.length,
    predict, scored: scoreWith(props, predict, cols) }
}

function displayCoef(coef, col) {
  const f = col.factor
  const scaled = f?.scale ? coef * f.scale * (f.kind === 'num' ? -1 : 1) : coef // "closer" = positive for distances
  const sign = scaled >= 0 ? '+' : '−'
  return `${sign}£${Math.abs(Math.round(scaled)).toLocaleString('en-GB')}`
}

// Attach ppsf / expected / residual / pctBelow to every priced property.
function scoreWith(props, predict, cols) {
  return props.map((p) => {
    const price = num(p.asking_price)
    const area = num(p.floor_area_sqft)
    const expected = predict ? predict(p) : null
    const residual = expected != null && price != null ? price - expected : null
    return {
      ...p,
      ppsf: price != null && area ? Math.round(price / area) : null,
      expected: expected != null ? Math.round(expected) : null,
      residual: residual != null ? Math.round(residual) : null,
      pctBelow: residual != null && expected ? residual / expected : null, // negative = below model = good
    }
  })
}

// ─── Opportunities ───────────────────────────────────────────────────────────────
export function redFlags(p) {
  const flags = []
  if (String(p.tenure ?? '').toLowerCase().includes('lease')) flags.push('Leasehold')
  if (p.floor_area_sqft == null) flags.push('No floor area')
  const q = p.data_quality
  if (q && Array.isArray(q.flags)) flags.push(...q.flags)
  return flags
}

// Bucket scored properties by opportunity type against the CURRENT model.
export function opportunities(scored, { budget = 450000, threshold = 0.05 } = {}) {
  const high = [], investigate = [], evidence = []
  for (const p of scored) {
    if (p.pctBelow == null) continue
    const below = p.pctBelow <= -threshold
    if (!below) continue
    const flags = redFlags(p)
    const available = p.status === 'available'
    const withinBudget = num(p.asking_price) != null && num(p.asking_price) <= budget
    if ((p.status === 'sold_stc' || p.status === 'under_offer')) {
      evidence.push({ ...p, flags })
    } else if (available && withinBudget && flags.length === 0) {
      high.push({ ...p, flags })
    } else if (available && withinBudget) {
      investigate.push({ ...p, flags })
    }
  }
  const byValue = (a, b) => a.pctBelow - b.pctBelow // most below model first
  return { high: high.sort(byValue), investigate: investigate.sort(byValue), evidence: evidence.sort(byValue) }
}

// ─── Dashboard stats ─────────────────────────────────────────────────────────────
export function marketStats(properties, scored, recentEvents = [], { budget = 450000, sinceDays = 7 } = {}) {
  const tracked = properties.length
  const measured = properties.filter((p) => p.floor_area_sqft != null).length
  const withinBudget = properties.filter((p) => p.status === 'available' && num(p.asking_price) != null && num(p.asking_price) <= budget).length
  const opps = opportunities(scored ?? [], { budget })
  const valueSignals = opps.high.length + opps.investigate.length
  const reducedThisWeek = recentEvents.filter((e) => e.type === 'reduced').length
  const newThisWeek = recentEvents.filter((e) => e.type === 'new_listing').length
  return { tracked, measured, withinBudget, valueSignals, newThisWeek, reducedThisWeek }
}

export const _internal = { solve, buildColumns, mode, displayCoef }
