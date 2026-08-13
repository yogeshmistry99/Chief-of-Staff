// Schools around the area bounding box, with real coordinates, used to compute
// nearest_school_m by haversine at ingest time — no runtime API.
//
// DELIBERATELY EMPTY for now. The project principle is "never invent data", and
// exact school coordinates should come from an authoritative source rather than
// being guessed. Populate this from the gov.uk "Get Information about Schools"
// (GIAS) extract — filter to the area bbox and map each school to
//   { name, phase, lat, lng }
// (phase = 'primary' | 'secondary' | 'all-through'). Until then the school factor
// reports as "insufficient data" and its model toggle stays inert, rather than
// showing a fabricated distance.

export const SCHOOLS = []
