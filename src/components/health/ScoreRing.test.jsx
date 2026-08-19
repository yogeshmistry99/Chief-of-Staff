import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScoreRing from './ScoreRing'

// RENDER tests for the graded arc. Two properties matter and neither is visible
// from the pure layer: the gradient must actually be referenced by the arc (a
// wrong id renders an INVISIBLE stroke, which looks exactly like "no data"), and
// two rings side by side must not share a gradient id.

const arc = (c) => c.querySelector('circle[stroke^="url("]')

describe('ScoreRing — colour by level', () => {
  it('draws the arc with a gradient, not a flat stroke', () => {
    const { container } = render(<ScoreRing label="Sleep" value="5h 32m" position={0.6} hasRange />)
    const stroke = arc(container).getAttribute('stroke')
    expect(stroke).toMatch(/^url\(#ring-Sleep-typical\)$/)
    // The referenced gradient must exist, or the arc silently renders invisible.
    expect(container.querySelector(`#${stroke.slice(5, -1)}`)).toBeTruthy()
  })

  it('changes hue with the level', () => {
    const low = render(<ScoreRing label="Sleep" value="3h" position={0.1} hasRange />)
    expect(arc(low.container).getAttribute('stroke')).toContain('low')

    const strong = render(<ScoreRing label="HRV" value="45" position={0.95} hasRange />)
    expect(arc(strong.container).getAttribute('stroke')).toContain('strong')
  })

  it('gives each ring its own gradient id, so neighbours do not share one', () => {
    const { container } = render(
      <>
        <ScoreRing label="Sleep" value="5h" position={0.1} hasRange />
        <ScoreRing label="HRV" value="45" position={0.9} hasRange />
      </>,
    )
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('draws NO arc when there is no baseline to place the reading in', () => {
    const { container } = render(<ScoreRing label="Cardio" value="3" position={null} />)
    expect(arc(container)).toBeNull()
    expect(container.querySelector('linearGradient')).toBeNull()
  })

  it('draws no arc for an absent reading, and says so', () => {
    const { container } = render(
      <ScoreRing label="Cardio" value={null} caption="No active zone minutes yet today." position={null} />,
    )
    expect(arc(container)).toBeNull()
    expect(screen.getByText(/no active zone minutes yet today/i)).toBeInTheDocument()
  })

  it('names the band for anyone who cannot read the hue', () => {
    render(<ScoreRing label="Sleep" value="5h 32m" position={0.95} hasRange />)
    expect(screen.getByText(/Sleep is high in your range/i)).toBeInTheDocument()
  })
})
