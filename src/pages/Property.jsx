import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/haptic'
import { useProperties } from '../lib/useProperties'
import { readRecentEvents } from '../lib/propertyCache'
import { fitModel, opportunities, marketStats, DEFAULT_BUDGET } from '../lib/propertyModel'
import { gbp, sqft, statusMeta, decisionMeta, prettyType } from '../lib/propertyFormat'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function StatBar({ s }) {
  const items = [
    { n: s.tracked, l: 'tracked' },
    { n: s.measured, l: 'measured' },
    { n: s.withinBudget, l: '≤ budget' },
    { n: s.valueSignals, l: 'value signals', hot: s.valueSignals > 0 },
    { n: s.newThisWeek, l: 'new' },
    { n: s.reducedThisWeek, l: 'reduced' },
  ]
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
      {items.map((it, i) => (
        <div key={i} className={`shrink-0 rounded-xl px-3 py-2 text-center min-w-[64px] ${it.hot ? 'bg-[#EADDFF]' : 'bg-[#F3EDF7]'}`}>
          <div className={`text-lg font-semibold ${it.hot ? 'text-[#4F378B]' : 'text-[#1C1B1F]'}`}>{it.n}</div>
          <div className="text-[10px] text-[#49454F] leading-tight">{it.l}</div>
        </div>
      ))}
    </div>
  )
}

function OppRow({ p, onClick }) {
  const st = statusMeta(p.status)
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-3 py-2.5 border-b border-[#F3EDF7] last:border-0 active:bg-[#F3EDF7] text-left">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#1C1B1F] truncate">{p.id} · {p.address ?? 'Unknown address'}</p>
        <p className="text-xs text-[#79747E] truncate">{gbp(p.asking_price)} · {p.floor_area_sqft ? sqft(p.floor_area_sqft) : 'no area'}{p.ppsf ? ` · £${p.ppsf}/sq ft` : ''}</p>
      </div>
      {p.pctBelow != null && (
        <span className="shrink-0 text-xs font-bold text-[#1B7A5A] bg-[#DFF2E9] px-2 py-1 rounded-lg">
          {Math.abs(Math.round(p.pctBelow * 100))}% below
        </span>
      )}
    </button>
  )
}

const FILTERS = [
  { key: 'budget', label: '≤ Budget' },
  { key: 'available', label: 'Available' },
  { key: 'parking', label: 'Parking' },
  { key: 'below', label: 'Below model' },
]

export default function Property() {
  const navigate = useNavigate()
  const { properties, loading } = useProperties()
  const [recent, setRecent] = useState([])
  const [search, setSearch] = useState('')
  const [active, setActive] = useState({})

  useEffect(() => {
    readRecentEvents(new Date(Date.now() - WEEK_MS).toISOString()).then(setRecent)
  }, [properties.length])

  // Base model = floor area only (no factors) for the dashboard signals.
  const model = useMemo(() => fitModel(properties, []), [properties])
  const scored = model.scored ?? []
  const stats = useMemo(() => marketStats(properties, scored, recent, { budget: DEFAULT_BUDGET }), [properties, scored, recent])
  const opps = useMemo(() => opportunities(scored, { budget: DEFAULT_BUDGET }), [scored])

  const scoredById = useMemo(() => new Map(scored.map((p) => [p.id, p])), [scored])
  const q = search.trim().toLowerCase()
  const list = useMemo(() => {
    let rows = scored
    if (active.budget) rows = rows.filter((p) => p.asking_price != null && p.asking_price <= DEFAULT_BUDGET)
    if (active.available) rows = rows.filter((p) => p.status === 'available')
    if (active.parking) rows = rows.filter((p) => p.parking === true)
    if (active.below) rows = rows.filter((p) => p.pctBelow != null && p.pctBelow < 0)
    if (q.length > 1) rows = rows.filter((p) => (p.address ?? '').toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || (p.postcode ?? '').toLowerCase().includes(q))
    return [...rows].sort((a, b) => {
      if (a.pctBelow != null && b.pctBelow != null) return a.pctBelow - b.pctBelow
      if (a.pctBelow != null) return -1
      if (b.pctBelow != null) return 1
      return (a.asking_price ?? 1e12) - (b.asking_price ?? 1e12)
    })
  }, [scored, active, q])

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#1C1B1F]">Property</h1>
          <p className="text-sm text-[#49454F] mt-0.5">Local market intelligence · Slough</p>
        </div>
      </div>

      <StatBar s={stats} />

      {/* Primary actions */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <button onClick={() => { haptic.light(); navigate('/property/explore') }}
          className="rounded-2xl p-4 text-left bg-[#EADDFF] text-[#4F378B] active:scale-95 transition-transform shadow-sm">
          <span className="text-2xl mb-2 block">📈</span>
          <p className="font-semibold text-sm">Value explorer</p>
          <p className="text-xs opacity-70 mt-0.5">Price vs area · factor toggles</p>
        </button>
        <button onClick={() => { haptic.light(); navigate('/property/map') }}
          className="rounded-2xl p-4 text-left bg-[#D7ECF9] text-[#0B4A6F] active:scale-95 transition-transform shadow-sm">
          <span className="text-2xl mb-2 block">🗺️</span>
          <p className="font-semibold text-sm">Market map</p>
          <p className="text-xs opacity-70 mt-0.5">Every property, by location</p>
        </button>
      </div>

      {/* Opportunities */}
      {opps.high.length > 0 && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-[#1C1B1F] mb-2">🎯 High-priority opportunities</h2>
          <div className="bg-white border border-[#CAC4D0] rounded-2xl overflow-hidden shadow-sm">
            {opps.high.slice(0, 6).map((p) => <OppRow key={p.id} p={p} onClick={() => navigate(`/property/${p.id}`)} />)}
          </div>
        </section>
      )}
      {opps.investigate.length > 0 && (
        <section className="mt-4">
          <h2 className="text-sm font-semibold text-[#1C1B1F] mb-2">🔍 Worth investigating</h2>
          <div className="bg-white border border-[#CAC4D0] rounded-2xl overflow-hidden shadow-sm">
            {opps.investigate.slice(0, 4).map((p) => <OppRow key={p.id} p={p} onClick={() => navigate(`/property/${p.id}`)} />)}
          </div>
        </section>
      )}

      {/* Search + filters + list */}
      <section className="mt-6">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search P-number, address, postcode…"
          className="w-full px-4 py-2.5 rounded-xl border border-[#CAC4D0] text-sm text-[#1C1B1F] focus:outline-none focus:border-[#6750A4] bg-white" />
        <div className="flex gap-2 overflow-x-auto py-2 -mx-4 px-4">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setActive((a) => ({ ...a, [f.key]: !a[f.key] }))}
              className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border ${active[f.key] ? 'bg-[#6750A4] text-white border-[#6750A4]' : 'bg-white text-[#49454F] border-[#CAC4D0]'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {loading && properties.length === 0 ? (
          <p className="text-sm text-[#79747E] text-center py-8">Loading market…</p>
        ) : list.length === 0 ? (
          <div className="bg-[#FFF0C8] border border-[#F3EDF7] rounded-xl p-3 mt-2">
            <p className="text-xs text-[#49454F]">
              {properties.length === 0
                ? 'No properties tracked yet. The weekly scrape populates this, or trigger /api/ingest-properties manually.'
                : 'No properties match these filters.'}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-[#CAC4D0] rounded-2xl overflow-hidden shadow-sm mt-1">
            {list.map((p) => {
              const st = statusMeta(p.status)
              const dm = decisionMeta(p.decision_state)
              return (
                <button key={p.id} onClick={() => navigate(`/property/${p.id}`)}
                  className="w-full flex items-center gap-3 px-3 py-3 border-b border-[#F3EDF7] last:border-0 active:bg-[#F3EDF7] text-left">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#1C1B1F] truncate">{p.id} · {p.address ?? 'Unknown address'}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-xs text-[#79747E]">{gbp(p.asking_price)}</span>
                      {p.floor_area_sqft && <span className="text-xs text-[#79747E]">· {sqft(p.floor_area_sqft)}</span>}
                      {p.ppsf != null && <span className="text-xs text-[#79747E]">· £{p.ppsf}/sq ft</span>}
                      {p.house_type && <span className="text-xs text-[#79747E]">· {prettyType(p.house_type)}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: st.bg, color: st.text }}>{st.label}</span>
                    {p.decision_state !== 'unreviewed' && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: dm.bg, color: dm.text }}>{dm.label}</span>
                    )}
                    {p.pctBelow != null && p.pctBelow < -0.03 && (
                      <span className="text-[10px] font-bold text-[#1B7A5A]">{Math.abs(Math.round(p.pctBelow * 100))}% below</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
