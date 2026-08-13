import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { haptic } from '../lib/haptic'
import { useProperties } from '../lib/useProperties'
import { readProperty, readListings, readEvents, updatePropertyRow, setDecision } from '../lib/propertyCache'
import { fitModel, redFlags } from '../lib/propertyModel'
import {
  gbpFull, gbp, sqft, metresLabel, prettyType, statusMeta,
  decisionMeta, DECISION_STATES,
} from '../lib/propertyFormat'
import BackHeader from '../components/PropertyBackHeader'

const EVENT_LABEL = {
  new_listing: 'Listed', reduced: 'Price reduced', increased: 'Price increased',
  price_change: 'Price changed', status_change: 'Status changed', sold_stc: 'Sold STC',
  relisted: 'Relisted', agent_change: 'Agent changed', floor_area_found: 'Floor area found',
  portal_added: 'New portal', withdrawn: 'Withdrawn',
}
const EXTENSION_LABEL = ['None', 'Loft', 'Rear', 'Large']

function Field({ label, value }) {
  return (
    <div>
      <div className="text-[11px] text-[#79747E]">{label}</div>
      <div className="text-sm text-[#1C1B1F]">{value ?? '—'}</div>
    </div>
  )
}

export default function PropertyDetail() {
  const { pid } = useParams()
  const { properties } = useProperties()
  const [prop, setProp] = useState(null)
  const [listings, setListings] = useState([])
  const [events, setEvents] = useState([])
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const [p, l, e] = await Promise.all([readProperty(pid), readListings(pid), readEvents(pid)])
    setProp(p); setListings(l); setEvents(e); setNotes(p?.notes ?? ''); setLoading(false)
  }
  useEffect(() => { setLoading(true); load() /* eslint-disable-next-line */ }, [pid])

  // % below model from the base (floor-area) model over the full dataset.
  const scored = useMemo(() => {
    const m = fitModel(properties, [])
    return (m.scored ?? []).find((x) => x.id === pid) ?? null
  }, [properties, pid])

  if (loading) return (<div className="max-w-lg mx-auto"><BackHeader title={pid} /><p className="px-4 py-8 text-sm text-[#79747E]">Loading…</p></div>)
  if (!prop) return (<div className="max-w-lg mx-auto"><BackHeader title={pid} /><p className="px-4 py-8 text-sm text-[#49454F]">Property {pid} not found.</p></div>)

  const st = statusMeta(prop.status)
  const flags = redFlags(prop)
  const ppsf = prop.asking_price && prop.floor_area_sqft ? Math.round(prop.asking_price / prop.floor_area_sqft) : null

  const onDecision = async (d) => { haptic.light(); const s = await setDecision(pid, d); setProp(s) }
  const onExtension = async (v) => { const s = await updatePropertyRow(pid, { extension_potential: v === '' ? null : Number(v) }); setProp(s) }
  const onSaveNotes = async () => { setSavingNotes(true); try { const s = await updatePropertyRow(pid, { notes }); setProp(s) } finally { setSavingNotes(false) } }

  return (
    <div className="max-w-lg mx-auto pb-24">
      <BackHeader title={prop.id} />
      <div className="px-4 pt-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-[#1C1B1F]">{prop.address ?? 'Unknown address'}</h1>
            <p className="text-sm text-[#49454F]">{prop.postcode ?? ''} · {prettyType(prop.house_type)}</p>
          </div>
          <span className="shrink-0 text-xs font-semibold px-2 py-1 rounded" style={{ background: st.bg, color: st.text }}>{st.label}</span>
        </div>

        <div className="flex items-baseline gap-3 mt-2">
          <span className="text-2xl font-semibold text-[#1C1B1F]">{gbpFull(prop.asking_price)}</span>
          {prop.first_seen_price != null && prop.first_seen_price !== prop.asking_price && (
            <span className="text-sm text-[#79747E] line-through">{gbp(prop.first_seen_price)}</span>
          )}
          {ppsf != null && <span className="text-sm text-[#49454F]">£{ppsf}/sq ft</span>}
        </div>
        {scored?.pctBelow != null && (
          <div className={`inline-block mt-1.5 text-sm font-semibold px-2 py-0.5 rounded ${scored.pctBelow < 0 ? 'bg-[#DFF2E9] text-[#1B5E43]' : 'bg-[#F9DEDC] text-[#8C1D18]'}`}>
            {Math.abs(Math.round(scored.pctBelow * 100))}% {scored.pctBelow < 0 ? 'below' : 'above'} the size model
          </div>
        )}
        {flags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            {flags.map((f) => <span key={f} className="text-[11px] font-medium bg-[#FCEBD2] text-[#8A4B00] px-1.5 py-0.5 rounded">⚠ {f}</span>)}
          </div>
        )}

        {/* Facts grid */}
        <div className="grid grid-cols-3 gap-3 mt-4 bg-white border border-[#CAC4D0] rounded-2xl p-3">
          <Field label="Floor area" value={prop.floor_area_sqft ? sqft(prop.floor_area_sqft) : null} />
          <Field label="Bedrooms" value={prop.bedrooms} />
          <Field label="Bathrooms" value={prop.bathrooms} />
          <Field label="Tenure" value={prop.tenure} />
          <Field label="EPC" value={prop.epc} />
          <Field label="Agent" value={prop.primary_agent} />
          <Field label="Parking" value={prop.parking == null ? null : prop.parking ? 'Yes' : 'No'} />
          <Field label="Garage" value={prop.garage == null ? null : prop.garage ? 'Yes' : 'No'} />
          <Field label="Nearest station" value={metresLabel(prop.nearest_station_m)} />
        </div>

        {/* Decision panel */}
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-[#1C1B1F] mb-2">Your decision</h2>
          <div className="flex gap-2 flex-wrap">
            {DECISION_STATES.map((d) => {
              const dm = decisionMeta(d)
              const on = prop.decision_state === d
              return (
                <button key={d} onClick={() => onDecision(d)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border ${on ? 'border-transparent' : 'border-[#CAC4D0] bg-white text-[#49454F]'}`}
                  style={on ? { background: dm.bg, color: dm.text } : undefined}>
                  {dm.label}
                </button>
              )
            })}
          </div>
        </section>

        {/* Extension potential override */}
        <section className="mt-4">
          <label className="text-sm font-semibold text-[#1C1B1F] block mb-1.5">Extension potential</label>
          <select value={prop.extension_potential ?? ''} onChange={(e) => onExtension(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-[#CAC4D0] text-sm bg-white text-[#1C1B1F]">
            <option value="">Unset</option>
            {EXTENSION_LABEL.map((l, i) => <option key={i} value={i}>{i} · {l}</option>)}
          </select>
        </section>

        {/* Notes */}
        <section className="mt-4">
          <h2 className="text-sm font-semibold text-[#1C1B1F] mb-1.5">Notes</h2>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4}
            placeholder="Viewing notes, Street View, school research, condition, planning…"
            className="w-full px-3 py-2 rounded-xl border border-[#CAC4D0] text-sm bg-white text-[#1C1B1F] focus:outline-none focus:border-[#6750A4]" />
          <button onClick={onSaveNotes} disabled={savingNotes || notes === (prop.notes ?? '')}
            className="mt-2 text-sm font-semibold px-4 py-2 rounded-full bg-[#6750A4] text-white disabled:opacity-40">
            {savingNotes ? 'Saving…' : 'Save notes'}
          </button>
        </section>

        {/* Price / market history */}
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-[#1C1B1F] mb-2">History</h2>
          {events.length === 0 ? (
            <p className="text-xs text-[#79747E]">No recorded events yet.</p>
          ) : (
            <div className="bg-white border border-[#CAC4D0] rounded-2xl overflow-hidden shadow-sm">
              {events.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-3 py-2 border-b border-[#F3EDF7] last:border-0">
                  <span className="text-[11px] text-[#79747E] w-20 shrink-0">{String(e.occurred_at).slice(0, 10)}</span>
                  <span className="text-sm text-[#1C1B1F] flex-1">{EVENT_LABEL[e.type] ?? e.type}</span>
                  {(e.from_val || e.to_val) && (
                    <span className="text-xs text-[#49454F]">{e.from_val ? `${e.from_val} → ` : ''}{e.to_val}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sources */}
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-[#1C1B1F] mb-2">Sources</h2>
          {listings.length === 0 ? (
            <p className="text-xs text-[#79747E]">No source listings recorded.</p>
          ) : (
            <div className="space-y-2">
              {listings.map((l) => (
                <a key={l.id} href={l.url ?? '#'} target="_blank" rel="noreferrer"
                  className="flex items-center justify-between bg-white border border-[#CAC4D0] rounded-xl px-3 py-2">
                  <div>
                    <div className="text-sm text-[#1C1B1F] capitalize">{l.source}</div>
                    <div className="text-xs text-[#79747E]">{gbp(l.price)} · last seen {String(l.last_seen).slice(0, 10)}</div>
                  </div>
                  <span className="text-[#6750A4] text-xs font-semibold">Open ↗</span>
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
