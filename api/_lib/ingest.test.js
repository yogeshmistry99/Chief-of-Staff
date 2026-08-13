import { describe, it, expect } from 'vitest'
import { patchToRow, propertyToRow, rowToProperty } from './propertiesRepo.js'
import { sameProperty, resolveIdentity, normalizeAddress, houseNumber } from './ingest/identity.js'
import { computeMarketChanges, floorAreaEvent } from './ingest/diff.js'
import { haversineMeters, nearest } from './ingest/geo.js'
import { extensionPotential, nearestStationMeters } from './ingest/factors.js'
import {
  sqftFromText, mapHouseType, mapStatus, extractJsonAssignment, extractNextData, postcodeFromText,
} from './ingest/sources/parse.js'
import * as rightmove from './ingest/sources/rightmove.js'

describe('propertiesRepo mappers', () => {
  it('patchToRow only emits whitelisted keys and never id/pnum/timestamps', () => {
    const row = patchToRow({ notes: 'hi', decision_state: 'watch', id: 'P9', pnum: 9, created_at: 'x', bogus: 1 })
    expect(row).toEqual({ notes: 'hi', decision_state: 'watch' })
  })
  it('propertyToRow always carries id + pnum for insert', () => {
    const row = propertyToRow({ id: 'P1', pnum: 1, asking_price: 400000, ignored: true })
    expect(row.id).toBe('P1'); expect(row.pnum).toBe(1); expect(row.asking_price).toBe(400000)
    expect('ignored' in row).toBe(false)
  })
  it('rowToProperty is a pass-through shape', () => {
    expect(rowToProperty({ id: 'P1', status: 'available' })).toEqual({ id: 'P1', status: 'available' })
    expect(rowToProperty(null)).toBeNull()
  })
})

describe('identity resolution', () => {
  it('normalises addresses and pulls the house number', () => {
    expect(houseNumber('12 Tintern Close, Slough')).toBe('12')
    expect(normalizeAddress('12, Tintern Close.')).toBe('12 tintern close')
  })
  it('matches the same house across portals by postcode + number', () => {
    const a = { address: '12 Tintern Close', postcode: 'SL1 2AB' }
    const b = { address: '12 Tintern Close, Slough', postcode: 'SL1 2AB' }
    expect(sameProperty(a, b)).toBe(true)
  })
  it('does not merge different house numbers on the same street', () => {
    const a = { address: '12 Tintern Close', postcode: 'SL1 2AB' }
    const b = { address: '14 Tintern Close', postcode: 'SL1 2AB' }
    expect(sameProperty(a, b)).toBe(false)
  })
  it('mints the next P### when nothing matches', () => {
    const existing = [{ id: 'P7', pnum: 7, address: '1 A Rd', postcode: 'SL1 1AA' }]
    const r = resolveIdentity({ address: '9 B Rd', postcode: 'SL2 2BB' }, existing, 7)
    expect(r).toEqual({ propertyId: 'P8', isNew: true, pnum: 8 })
  })
})

describe('change detection', () => {
  it('emits new_listing + first_seen_price for a brand-new property', () => {
    const { events, patch } = computeMarketChanges(null, { price: 450000, status: 'available', agent: 'Connells' }, { source: 'rightmove' })
    expect(events[0].type).toBe('new_listing')
    expect(patch.asking_price).toBe(450000)
    expect(patch.first_seen_price).toBe(450000)
  })
  it('emits a reduced event when the price drops', () => {
    const existing = { asking_price: 470000, first_seen_price: 470000, status: 'available' }
    const { events, patch } = computeMarketChanges(existing, { price: 425000, status: 'available' }, { source: 'zoopla' })
    expect(events.find((e) => e.type === 'reduced')).toBeTruthy()
    expect(patch.asking_price).toBe(425000)
  })
  it('emits sold_stc on a status change to sold', () => {
    const existing = { asking_price: 400000, status: 'available' }
    const { events } = computeMarketChanges(existing, { price: 400000, status: 'sold_stc' }, {})
    expect(events.find((e) => e.type === 'sold_stc')).toBeTruthy()
  })
  it('detects floor area appearing for the first time', () => {
    expect(floorAreaEvent({ floor_area_sqft: null }, { floor_area_sqft: 1200 }, {}).type).toBe('floor_area_found')
    expect(floorAreaEvent({ floor_area_sqft: 1200 }, { floor_area_sqft: 1200 }, {})).toBeNull()
  })
})

describe('geo + factors', () => {
  it('haversine is ~0 for identical points and positive otherwise', () => {
    const slough = { lat: 51.5117, lng: -0.5919 }
    expect(haversineMeters(slough, slough)).toBeCloseTo(0, 5)
    expect(haversineMeters(slough, { lat: 51.5075, lng: -0.5430 })).toBeGreaterThan(2000)
  })
  it('nearest picks the closest of several points', () => {
    const t = { lat: 51.5117, lng: -0.5919 }
    const hit = nearest(t, [{ name: 'far', lat: 52, lng: 0 }, { name: 'near', lat: 51.512, lng: -0.592 }])
    expect(hit.item.name).toBe('near')
  })
  it('computes a station distance for a Slough-area point', () => {
    const m = nearestStationMeters({ lat: 51.5075, lng: -0.5430 }) // by Langley
    expect(m).not.toBeNull()
    expect(m).toBeLessThan(1000)
  })
  it('extension heuristic: flats score 0, detached-with-plot scores high', () => {
    expect(extensionPotential({ house_type: 'flat' })).toBe(0)
    expect(extensionPotential({ house_type: 'detached', floor_area_sqft: 1000, plot_sqft: 3000 })).toBe(3)
  })
})

describe('parse helpers', () => {
  it('reads floor area from sq ft and sq m text', () => {
    expect(sqftFromText('approx. 1,248 sq ft of space')).toBe(1248)
    expect(sqftFromText('116 sq m')).toBe(Math.round(116 * 10.7639))
    expect(sqftFromText('no size here')).toBeNull()
  })
  it('maps house types and statuses', () => {
    expect(mapHouseType('Semi-Detached House')).toBe('semi_detached')
    expect(mapHouseType('End of Terrace')).toBe('end_terrace')
    expect(mapStatus('Sold STC')).toBe('sold_stc')
    expect(mapStatus('Under offer')).toBe('under_offer')
  })
  it('extracts a UK postcode from text', () => {
    expect(postcodeFromText('12 Tintern Close, Slough SL1 2AB')).toBe('SL1 2AB')
  })
  it('extracts a balanced window.* JSON assignment', () => {
    const html = 'x<script>window.jsonModel = {"properties":[{"id":42}],"n":1};</script>y'
    expect(extractJsonAssignment(html, 'window.jsonModel').properties[0].id).toBe(42)
  })
  it('extracts __NEXT_DATA__', () => {
    const html = '<script id="__NEXT_DATA__" type="application/json">{"props":{"a":1}}</script>'
    expect(extractNextData(html).props.a).toBe(1)
  })
})

describe('rightmove adapter parsing (fixture)', () => {
  const searchHtml = `<html><body><script>
    window.jsonModel = {"properties":[
      {"id":101,"bedrooms":3,"bathrooms":1,"displayAddress":"12 Tintern Close, Slough",
       "propertySubType":"Semi-Detached","price":{"amount":450000},"propertyUrl":"/properties/101"}
    ]};
  </script></body></html>`
  const detailHtml = `<html><body><script>
    window.PAGE_MODEL = {"propertyData":{
      "id":101,"bedrooms":3,"bathrooms":2,
      "address":{"displayAddress":"12 Tintern Close","outcode":"SL1","incode":"2AB"},
      "location":{"latitude":51.51,"longitude":-0.59},
      "sizings":[{"unit":"sqft","minimumSize":1248}],
      "tenure":{"tenureType":"Freehold"},
      "customer":{"branchDisplayName":"Connells, Slough"},
      "keyFeatures":["Driveway parking","Garage"],
      "text":{"description":"A lovely home with driveway."}
    }};
  </script></body></html>`

  it('parseSearch yields a normalized summary', () => {
    const rows = rightmove.parseSearch(searchHtml)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      source: 'rightmove', source_listing_id: '101', price: 450000,
      bedrooms: 3, house_type: 'semi_detached',
    })
    // Search cards carry no full postcode; it's recovered later during enrich.
    expect(rows[0].postcode).toBeNull()
    expect(rows[0].url).toContain('/properties/101')
  })
  it('parseDetail extracts floor area, tenure, agent, coords, parking', () => {
    const d = rightmove.parseDetail(detailHtml)
    expect(d.floor_area_sqft).toBe(1248)
    expect(d.tenure).toBe('Freehold')
    expect(d.agent).toBe('Connells, Slough')
    expect(d.lat).toBeCloseTo(51.51, 2)
    expect(d.parking).toBe(true)
    expect(d.garage).toBe(true)
    expect(d.postcode).toBe('SL1 2AB')
  })
})
