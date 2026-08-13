import { useMemo, useState } from 'react'
import { gbp, sqft } from '../lib/propertyFormat'

// Bespoke inline-SVG scatter: price (Y) vs floor area (X). Hand-built to match the
// app's SVG-only style, to draw the £budget line + the model reference line, and
// to colour each dot by how far it sits below/above the CURRENTLY SELECTED model
// (the value signal). No charting dependency.
//
// Colour = position vs model (diverging), NOT identity — so it reads the same for
// colour-vision-deficient users alongside the shape/label. Below model = the
// opportunity; a legend + hover carry the meaning, never colour alone.

const VB_W = 360, VB_H = 300
const PAD = { l: 44, r: 12, t: 14, b: 30 }

// Diverging classes vs model. Teal = below model (good), grey ≈ on model, rose = above.
function tierOf(pctBelow) {
  if (pctBelow == null) return { key: 'na', fill: '#C9C5D0', label: 'No model' }
  if (pctBelow <= -0.10) return { key: 'far', fill: '#1B7A5A', label: '≥10% below' }
  if (pctBelow <= -0.05) return { key: 'below', fill: '#5FB89A', label: '5–10% below' }
  if (pctBelow < 0.05) return { key: 'on', fill: '#9E9AA6', label: 'Near model' }
  return { key: 'above', fill: '#C77',  label: 'Above model' }
}

export default function PropertyScatter({ points = [], budget = 450000, line = null, highlightId = null, onSelect }) {
  const [hover, setHover] = useState(null) // { p, cx, cy }

  const { xs, ys, plot } = useMemo(() => {
    const withXY = points.filter((p) => p.x != null && p.y != null)
    const xVals = withXY.map((p) => p.x)
    const yVals = withXY.map((p) => p.y).concat(budget)
    const xMin = Math.min(...(xVals.length ? xVals : [500])) * 0.95
    const xMax = Math.max(...(xVals.length ? xVals : [1500])) * 1.05
    const yMin = Math.min(...(yVals.length ? yVals : [200000])) * 0.95
    const yMax = Math.max(...(yVals.length ? yVals : [500000])) * 1.05
    const sx = (x) => PAD.l + ((x - xMin) / (xMax - xMin || 1)) * (VB_W - PAD.l - PAD.r)
    const sy = (y) => (VB_H - PAD.b) - ((y - yMin) / (yMax - yMin || 1)) * (VB_H - PAD.t - PAD.b)
    return {
      xs: { min: xMin, max: xMax, scale: sx },
      ys: { min: yMin, max: yMax, scale: sy },
      plot: withXY.map((p) => ({ ...p, cx: sx(p.x), cy: sy(p.y), tier: tierOf(p.pctBelow) })),
    }
  }, [points, budget])

  const budgetY = ys.scale(budget)
  const lineSeg = line && line.length === 2
    ? { x1: xs.scale(line[0].x), y1: ys.scale(line[0].y), x2: xs.scale(line[1].x), y2: ys.scale(line[1].y) }
    : null

  // Y ticks (4)
  const yTicks = [0, 0.33, 0.66, 1].map((f) => ys.min + f * (ys.max - ys.min))
  const xTicks = [0, 0.5, 1].map((f) => xs.min + f * (xs.max - xs.min))

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full h-auto select-none" role="img" aria-label="Price versus floor area">
        {/* grid + y labels */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={ys.scale(t)} x2={VB_W - PAD.r} y2={ys.scale(t)} stroke="#EEECF1" strokeWidth="1" />
            <text x={PAD.l - 6} y={ys.scale(t) + 3} textAnchor="end" fontSize="8" fill="#79747E">{gbp(t)}</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={i} x={xs.scale(t)} y={VB_H - PAD.b + 12} textAnchor="middle" fontSize="8" fill="#79747E">{Math.round(t)}</text>
        ))}
        <text x={(VB_W) / 2} y={VB_H - 2} textAnchor="middle" fontSize="8" fill="#49454F">Floor area (sq ft)</text>

        {/* budget line */}
        <line x1={PAD.l} y1={budgetY} x2={VB_W - PAD.r} y2={budgetY} stroke="#B3261E" strokeWidth="1.25" strokeDasharray="4 3" />
        <text x={VB_W - PAD.r} y={budgetY - 3} textAnchor="end" fontSize="8" fill="#B3261E">Budget {gbp(budget)}</text>

        {/* model reference line */}
        {lineSeg && (
          <line x1={lineSeg.x1} y1={lineSeg.y1} x2={lineSeg.x2} y2={lineSeg.y2}
            stroke="#6750A4" strokeWidth="1.5" opacity="0.8" />
        )}

        {/* points */}
        {plot.map((p) => {
          const active = p.id === highlightId || (hover && hover.p.id === p.id)
          return (
            <circle key={p.id} cx={p.cx} cy={p.cy} r={active ? 6 : 4}
              fill={p.tier.fill} stroke="#fff" strokeWidth={active ? 2 : 1}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHover({ p, cx: p.cx, cy: p.cy })}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(p.id)} />
          )
        })}
      </svg>

      {/* hover card */}
      {hover && (
        <div className="absolute pointer-events-none z-10 bg-white border border-[#CAC4D0] rounded-lg shadow-md px-2.5 py-1.5 text-[11px] leading-tight"
          style={{ left: `${(hover.cx / VB_W) * 100}%`, top: `${(hover.cy / VB_H) * 100}%`, transform: 'translate(-50%, -115%)', maxWidth: 180 }}>
          <div className="font-semibold text-[#1C1B1F]">{hover.p.id}{hover.p.label ? ` · ${hover.p.label}` : ''}</div>
          <div className="text-[#49454F]">{gbp(hover.p.y)} · {sqft(hover.p.x)}</div>
          {hover.p.ppsf != null && <div className="text-[#49454F]">£{hover.p.ppsf}/sq ft</div>}
          {hover.p.pctBelow != null && (
            <div className={hover.p.pctBelow < 0 ? 'text-[#1B7A5A] font-semibold' : 'text-[#8C1D18]'}>
              {Math.abs(Math.round(hover.p.pctBelow * 100))}% {hover.p.pctBelow < 0 ? 'below' : 'above'} model
            </div>
          )}
        </div>
      )}

      {/* legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 px-1">
        {['far', 'below', 'on', 'above'].map((k) => {
          const t = tierOf(k === 'far' ? -0.2 : k === 'below' ? -0.07 : k === 'on' ? 0 : 0.1)
          return (
            <span key={k} className="flex items-center gap-1 text-[10px] text-[#49454F]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.fill }} />{t.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}
