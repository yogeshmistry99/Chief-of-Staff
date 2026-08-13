import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useProperties } from '../lib/useProperties'
import { fitModel } from '../lib/propertyModel'
import { gbp, sqft, statusMeta } from '../lib/propertyFormat'
import BackHeader from '../components/PropertyBackHeader'

const SLOUGH = [51.5105, -0.5950]

export default function PropertyMap() {
  const navigate = useNavigate()
  const { properties } = useProperties()

  const model = useMemo(() => fitModel(properties, []), [properties])
  const scoredById = useMemo(() => new Map((model.scored ?? []).map((p) => [p.id, p])), [model])

  const pins = properties.filter((p) => p.lat != null && p.lng != null)
  const center = pins.length ? [pins[0].lat, pins[0].lng] : SLOUGH

  return (
    <div className="max-w-lg mx-auto flex flex-col h-full">
      <BackHeader title="Market map" />
      {pins.length === 0 ? (
        <div className="px-4 py-8">
          <p className="text-sm text-[#49454F]">No geocoded properties yet. Coordinates are added during the weekly scrape (from each listing or its postcode).</p>
        </div>
      ) : (
        <div className="flex-1 min-h-[70vh]">
          <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {pins.map((p) => {
              const st = statusMeta(p.status)
              const sc = scoredById.get(p.id)
              const below = sc?.pctBelow != null && sc.pctBelow < -0.05
              return (
                <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={8}
                  pathOptions={{ color: '#fff', weight: 2, fillColor: below ? '#1B7A5A' : st.dot, fillOpacity: 0.9 }}>
                  <Popup>
                    <div style={{ minWidth: 150 }}>
                      <div style={{ fontWeight: 600 }}>{p.id} · {p.address ?? 'Unknown'}</div>
                      <div>{gbp(p.asking_price)}{p.floor_area_sqft ? ` · ${sqft(p.floor_area_sqft)}` : ''}</div>
                      {sc?.ppsf != null && <div>£{sc.ppsf}/sq ft{sc.pctBelow != null ? ` · ${Math.abs(Math.round(sc.pctBelow * 100))}% ${sc.pctBelow < 0 ? 'below' : 'above'} model` : ''}</div>}
                      <div style={{ marginTop: 4 }}>
                        <button onClick={() => navigate(`/property/${p.id}`)}
                          style={{ background: '#6750A4', color: '#fff', border: 0, borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600 }}>
                          Open {p.id}
                        </button>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              )
            })}
          </MapContainer>
        </div>
      )}
    </div>
  )
}
