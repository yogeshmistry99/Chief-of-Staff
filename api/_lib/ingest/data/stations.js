// UK rail/tube stations around the Slough bounding box, with real coordinates.
// Used to compute nearest_station_m by haversine at ingest time — no runtime API.
//
// This is a small local seed of REAL, publicly-known station locations (not
// invented). To cover more areas, extend from an open stations dataset (e.g.
// the National Rail / doogal.co.uk station list) filtered to each area's bbox.

export const STATIONS = [
  { name: 'Slough',                    lat: 51.5117, lng: -0.5919 },
  { name: 'Langley',                   lat: 51.5075, lng: -0.5430 },
  { name: 'Burnham',                   lat: 51.5253, lng: -0.6459 },
  { name: 'Taplow',                    lat: 51.5341, lng: -0.6889 },
  { name: 'Iver',                      lat: 51.5029, lng: -0.5083 },
  { name: 'Datchet',                   lat: 51.4857, lng: -0.5807 },
  { name: 'Windsor & Eton Central',    lat: 51.4838, lng: -0.6094 },
  { name: 'Windsor & Eton Riverside',  lat: 51.4859, lng: -0.6060 },
  { name: 'West Drayton',              lat: 51.5100, lng: -0.4720 },
  { name: 'Maidenhead',                lat: 51.5188, lng: -0.7220 },
  { name: 'Gerrards Cross',            lat: 51.5877, lng: -0.5560 },
  { name: 'Uxbridge',                  lat: 51.5463, lng: -0.4786 },
]
