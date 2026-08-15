import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TrackerScatter from './TrackerScatter'

// The empty-and-sparse states, tested directly. Reaching them through the page
// depends on which values happen to be in the fixture; here they are exact.

const cfg = { x: 'Floor area (sq ft)', y: 'Asking price', label: 'ID' }
const pt = (id, x, y) => ({ x, y, label: id, row: { sheetRow: x, tabIndex: 0 } })
const all = [pt('P001', 800, 400_000), pt('P002', 1200, 600_000), pt('P003', 1600, 900_000)]

describe('TrackerScatter', () => {
  it('keeps the axes and says so when the filters exclude every point', () => {
    const { container } = render(
      <TrackerScatter points={[]} domainPoints={all} config={cfg} selected={null} onSelect={vi.fn()} />,
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(container.querySelectorAll('circle').length).toBe(0)
    expect(screen.getByText(/No records match these filters/i)).toBeInTheDocument()
    // Axis labels still drawn, so the frame is intact.
    expect(screen.getByText('Asking price')).toBeInTheDocument()
  })

  it('scales to domainPoints, so a filtered point keeps its position', () => {
    const posOf = (c) =>
      [...c.querySelectorAll('circle')].map((el) => `${el.getAttribute('cx')},${el.getAttribute('cy')}`)

    const full = render(
      <TrackerScatter points={all} domainPoints={all} config={cfg} selected={null} onSelect={vi.fn()} />,
    )
    const middleWhenFull = posOf(full.container)[1]

    const oneLeft = render(
      <TrackerScatter points={[all[1]]} domainPoints={all} config={cfg} selected={null} onSelect={vi.fn()} />,
    )
    expect(posOf(oneLeft.container)[0]).toBe(middleWhenFull)
  })

  it('falls back to its own points when no domain is given', () => {
    const { container } = render(
      <TrackerScatter points={all} config={cfg} selected={null} onSelect={vi.fn()} />,
    )
    expect(container.querySelectorAll('circle').length).toBe(3)
  })

  it('shows the original empty message when there is genuinely nothing to plot', () => {
    render(<TrackerScatter points={[]} domainPoints={[]} config={cfg} selected={null} onSelect={vi.fn()} />)
    expect(screen.getByText(/Nothing to plot/i)).toBeInTheDocument()
  })
})
