import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '../lib/haptic'
import { useProperties } from '../lib/useProperties'
import { fitModel, MODEL_FACTORS, DEFAULT_BUDGET } from '../lib/propertyModel'
import PropertyScatter from '../components/PropertyScatter'
import BackHeader from '../components/PropertyBackHeader'

// Reference line: model prediction across floor area, holding every other enabled
// factor at its dataset mean (a valid single line — the "partial regression" line).
function modelLine(model, props) {
  if (!model.ok) return null
  const cols = model.columns
  const coefs = model.coefficients.map((c) => c.coef)
  const areaVals = props.map(cols[0].value).filter((v) => v != null)
  if (areaVals.length < 2) return null
  const means = cols.map((c) => {
    const vals = props.map(c.value).filter((v) => v != null)
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0
  })
  const constPart = model.intercept + coefs.slice(1).reduce((s, c, i) => s + c * means[i + 1], 0)
  const yAt = (x) => constPart + coefs[0] * x
  const xMin = Math.min(...areaVals), xMax = Math.max(...areaVals)
  return [{ x: xMin, y: yAt(xMin) }, { x: xMax, y: yAt(xMax) }]
}

export default function PropertyExplore() {
  const navigate = useNavigate()
  const { properties } = useProperties()
  const [enabled, setEnabled] = useState({}) // { factorKey: true }

  const enabledKeys = MODEL_FACTORS.map((f) => f.key).filter((k) => enabled[k])
  const model = useMemo(() => fitModel(properties, enabledKeys), [properties, enabledKeys])
  const scored = model.scored ?? []

  // Availability of each factor (how many priced+measured rows carry it).
  const avail = useMemo(() => {
    const base = properties.filter((p) => p.asking_price != null && p.floor_area_sqft != null)
    const m = {}
    for (const f of MODEL_FACTORS) {
      if (f.kind === 'cat') m[f.key] = base.filter((p) => p.house_type != null).length
      else m[f.key] = base.filter((p) => p[f.key] != null).length
    }
    return m
  }, [properties])

  const points = scored.map((p) => ({
    id: p.id, x: p.floor_area_sqft, y: p.asking_price, pctBelow: p.pctBelow,
    ppsf: p.ppsf, status: p.status, label: (p.address ?? '').split(',')[0],
  }))
  const line = modelLine(model, properties)

  return (
    <div className="max-w-lg mx-auto pb-24">
      <BackHeader title="Value explorer" />
      <div className="px-4">
        <p className="text-sm text-[#49454F] mb-3">
          Price vs floor area. Switch factors on to see what actually moves value — each coefficient is that factor's £ impact once size is accounted for.
        </p>

        <div className="bg-white border border-[#CAC4D0] rounded-2xl p-3 shadow-sm">
          <PropertyScatter points={points} budget={DEFAULT_BUDGET} line={line} onSelect={(id) => navigate(`/property/${id}`)} />
        </div>

        {/* Factor toggles */}
        <div className="mt-4">
          <h2 className="text-sm font-semibold text-[#1C1B1F] mb-2">Factors in the model</h2>
          <div className="flex flex-wrap gap-2">
            {MODEL_FACTORS.map((f) => {
              const on = !!enabled[f.key]
              const n = avail[f.key] ?? 0
              const thin = n < 5
              return (
                <button key={f.key} onClick={() => { haptic.light(); setEnabled((e) => ({ ...e, [f.key]: !e[f.key] })) }}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${on ? 'bg-[#6750A4] text-white border-[#6750A4]' : 'bg-white text-[#49454F] border-[#CAC4D0]'}`}>
                  {f.label}
                  <span className={`ml-1.5 ${on ? 'text-white/70' : 'text-[#B3261E]'}`}>{thin ? `(${n})` : ''}</span>
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-[#79747E] mt-1.5">Floor area is always the base predictor. A number in red = few properties carry that factor yet, so its effect is uncertain.</p>
        </div>

        {/* Coefficients readout */}
        <div className="mt-4 bg-[#F3EDF7] rounded-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-[#1C1B1F]">What drives value</h2>
            {model.ok && (
              <span className="text-xs text-[#49454F]">R² {model.r2.toFixed(2)} · n={model.n}</span>
            )}
          </div>
          {!model.ok ? (
            <p className="text-xs text-[#49454F]">
              Not enough measured properties to fit this combination yet (need {model.need}, have {model.have}). Fewer factors, or wait for the dataset to grow.
            </p>
          ) : (
            <div className="space-y-1.5">
              {model.coefficients.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <span className="text-[#49454F]">{c.label}</span>
                  <span className={`font-semibold ${c.display.startsWith('+') ? 'text-[#1B5E43]' : 'text-[#8C1D18]'}`}>
                    {c.display} <span className="text-[#79747E] font-normal">{c.unitLabel}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
