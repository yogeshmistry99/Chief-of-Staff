// The one genuinely new visual pattern in the Health tab.
//
// Life OS has no circular progress indicator anywhere, so this is designed from
// the app's own tokens rather than borrowed: track in #F3EDF7 (the same subtle
// fill used behind rows elsewhere), arc in the app's primary purple, value in
// the standard on-surface colour at the app's largest existing type size.
// Deliberately NOT Whoop's gradient gauge — no gradients, no glow, no branding.
//
// WHAT THE ARC MEANS, and why it is captioned: the API returns no scores (there
// is no readiness, no cardio load, no sleep score — confirmed against the
// discovery document), so there is no natural 0-100 to fill. The arc shows where
// today's measured value sits within the wearer's own recent range. The reading
// itself is always the dominant element; the arc is context, and the caption
// says so. It is not a score and it is not advice.
//
// With no baseline the ring renders as a bare track. That is the honest state —
// better than an arc at an invented fraction.

const SIZE = 116
const STROKE = 9
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R

export default function ScoreRing({
  label,
  value,          // formatted string, or null for "no reading"
  unit = null,
  caption = null,
  position = null, // 0..1, or null when there is no baseline
  hasRange = false,
  onClick = null,
}) {
  const filled = typeof position === 'number' && value != null
  const dash = filled ? C * position : 0

  const Wrap = onClick ? 'button' : 'div'

  return (
    <Wrap
      {...(onClick ? { onClick, type: 'button' } : {})}
      className="flex flex-col items-center gap-1.5 flex-1 min-w-0"
    >
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          {/* Track. Always drawn, so an absent reading still shows the shape. */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none" stroke="#F3EDF7" strokeWidth={STROKE}
          />
          {filled && (
            <circle
              cx={SIZE / 2} cy={SIZE / 2} r={R}
              fill="none" stroke="#6750A4" strokeWidth={STROKE} strokeLinecap="round"
              strokeDasharray={`${dash} ${C - dash}`}
              // Start at 12 o'clock rather than 3, which is what a reader expects.
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center px-2">
          {value == null ? (
            // Never a 0 and never a dash pretending to be a value: an em dash in
            // the outline colour reads as "nothing recorded", and the caption
            // beneath carries the reason.
            <span className="text-[#79747E] text-2xl leading-none">—</span>
          ) : (
            <>
              <span className="text-[#1C1B1F] text-2xl font-semibold leading-none tabular-nums">
                {value}
              </span>
              {unit && <span className="text-[#49454F] text-[10px] mt-0.5">{unit}</span>}
            </>
          )}
        </div>
      </div>

      <span className="text-[#1C1B1F] text-xs font-medium">{label}</span>
      {caption && (
        <span className="text-[#79747E] text-[10px] leading-tight text-center px-1">{caption}</span>
      )}
      {value != null && !hasRange && (
        <span className="text-[#79747E] text-[9px] leading-tight text-center px-1">
          no recent range yet
        </span>
      )}
    </Wrap>
  )
}
