// Small shared formatting + display-token helpers for the property UI.

export function gbp(v, { round = true } = {}) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  const n = Number(v)
  if (round && Math.abs(n) >= 1000) return `£${Math.round(n / 1000)}k`
  return `£${Math.round(n).toLocaleString('en-GB')}`
}

export function gbpFull(v) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return `£${Math.round(Number(v)).toLocaleString('en-GB')}`
}

export function sqft(v) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return `${Math.round(Number(v)).toLocaleString('en-GB')} sq ft`
}

export function metresLabel(v) {
  if (v == null) return '—'
  const n = Number(v)
  return n >= 1000 ? `${(n / 1000).toFixed(1)} km` : `${Math.round(n)} m`
}

export function pct(v) {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`
}

export function prettyType(t) {
  return String(t ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '—'
}

export const STATUS_META = {
  available:   { label: 'Available',   dot: '#2E7D5B', bg: '#DFF2E9', text: '#1B5E43' },
  under_offer: { label: 'Under offer', dot: '#B4690E', bg: '#FCEBD2', text: '#8A4B00' },
  sold_stc:    { label: 'Sold STC',    dot: '#8A8A8A', bg: '#ECECEC', text: '#4A4A4A' },
  withdrawn:   { label: 'Withdrawn',   dot: '#B3261E', bg: '#F9DEDC', text: '#8C1D18' },
}
export function statusMeta(s) { return STATUS_META[s] ?? STATUS_META.available }

export const DECISION_STATES = ['unreviewed', 'watch', 'shortlist', 'viewing', 'offer', 'pass']
export const DECISION_META = {
  unreviewed: { label: 'Unreviewed', bg: '#F3EDF7', text: '#49454F' },
  watch:      { label: 'Watch',      bg: '#E6E0F8', text: '#4A3F8F' },
  shortlist:  { label: 'Shortlist',  bg: '#EADDFF', text: '#4F378B' },
  viewing:    { label: 'Viewing',    bg: '#D7ECF9', text: '#0B4A6F' },
  offer:      { label: 'Offer',      bg: '#DFF2E9', text: '#1B5E43' },
  pass:       { label: 'Pass',       bg: '#F9DEDC', text: '#8C1D18' },
}
export function decisionMeta(d) { return DECISION_META[d] ?? DECISION_META.unreviewed }
