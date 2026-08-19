// Ring colour by level — Whoop's idea, Life OS's palette.
//
// WHAT THE COLOUR MEANS, and why it is allowed to mean anything at all: it
// encodes exactly what the arc length already encodes — `position`, where today's
// reading sits within the wearer's own trailing 30-day range. It is a second
// reading of one number, not a new judgement, and certainly not a score. The API
// returns no scores and this file does not invent one.
//
// All three ring metrics run the same direction — more sleep, higher HRV and more
// active zone minutes are each the better end of that wearer's own range — so one
// low-to-high scale serves all three. A metric where lower is better (resting
// heart rate) must NOT be given a ring without inverting this first.
//
// NOT Whoop's colours. Whoop grades red → yellow → green, and red is wrong here:
// a short night is not a failure, and this app shares a codebase with a symptom
// diary where shame mechanics are explicitly avoided. The scale runs cool → brand
// → good instead, entirely from colours already in the app:
//
//   low      #00639B   the sleep palette's LIGHT blue — factual, calm, not an alarm
//   typical  #6750A4   the brand purple, so an ordinary day looks exactly as the
//                      rings have always looked
//   strong   #0ca30c   the app's established "status good" green, from the journal
//
// Each band carries a two-stop gradient rather than a flat fill. That is the
// "colour grading" — depth along the arc — and it is drawn per band so the hue
// never crosses between bands mid-arc, which would imply a precision the
// underlying 30-day min/max does not have.
//
// COLOUR IS NEVER THE ONLY SIGNAL, per the app's standing rule. The arc length is
// the redundant encoding — same `position`, same information — and ScoreRing also
// names the band in its accessible label.

export const RING_BANDS = [
  {
    key: 'low',
    label: 'low in your range',
    // Exclusive upper bound.
    max: 1 / 3,
    color: '#00639B',
    from: '#004B75',
    to: '#0E7FB8',
  },
  {
    key: 'typical',
    label: 'typical for you',
    max: 2 / 3,
    color: '#6750A4',
    from: '#4A3AA7',
    to: '#7D6BC4',
  },
  {
    key: 'strong',
    label: 'high in your range',
    max: Infinity,
    color: '#0ca30c',
    from: '#0A7D0A',
    to: '#2FBF2F',
  },
]

// The band for a 0..1 position, or null when there is nothing to place.
//
// Null for a missing position is the point, not an oversight: with no trailing
// range there is no "how am I doing" to colour, and the ring renders as a bare
// track rather than picking a hue that would imply a comparison never made.
export function ringBand(position) {
  if (typeof position !== 'number' || !Number.isFinite(position)) return null
  const p = Math.max(0, Math.min(1, position))
  return RING_BANDS.find((b) => p < b.max) ?? RING_BANDS[RING_BANDS.length - 1]
}
