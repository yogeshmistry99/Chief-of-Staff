import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SleepHypnogram from './SleepHypnogram'

vi.mock('../../lib/haptic', () => ({ haptic: new Proxy({}, { get: () => () => {} }) }))

// Real segments from 19 Aug 2026.
const segments = [
  { type: 'AWAKE', start: '2026-08-18T23:32:00Z', end: '2026-08-18T23:46:00Z', minutes: 14 },
  { type: 'LIGHT', start: '2026-08-18T23:46:00Z', end: '2026-08-19T00:00:00Z', minutes: 14 },
  { type: 'DEEP',  start: '2026-08-19T00:00:00Z', end: '2026-08-19T00:22:00Z', minutes: 22 },
  { type: 'REM',   start: '2026-08-19T01:11:00Z', end: '2026-08-19T01:15:00Z', minutes: 4 },
]
const props = {
  segments,
  start: '2026-08-18T23:32:00Z',
  end: '2026-08-19T05:45:00Z',
  stages: { AWAKE: 41, LIGHT: 214, DEEP: 48, REM: 69 },
  stageBaseline: {
    DEEP: { mean: 60, min: 41, max: 78, nights: 14 },
    REM: { mean: 65, min: 44, max: 91, nights: 14 },
    AWAKE: { mean: 38, min: 20, max: 55, nights: 14 },
  },
  shortAwakenings: 15,
}

const draw = (over = {}) => render(<SleepHypnogram {...props} {...over} />)

describe('SleepHypnogram — the night against the clock', () => {
  it('draws a lane for each stage the night has, and none it does not', () => {
    draw()
    for (const label of ['Awake', 'REM', 'Light', 'Deep']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.queryByText('Restless')).toBeNull()
  })

  it('shows each stage total beside its lane', () => {
    draw()
    expect(screen.getByText('3h 34m')).toBeInTheDocument()   // Light 214m
    expect(screen.getByText('48m')).toBeInTheDocument()      // Deep
  })

  it('anchors the axis at the night\'s own start and end', () => {
    const { container } = draw()
    expect(container.textContent).toMatch(/\d{2}:\d{2}/)
  })

  it('states the night\'s duration', () => {
    draw()
    expect(screen.getByText(/Duration 6h 13m/)).toBeInTheDocument()
  })

  it('reports brief awakenings as a count, not as marks', () => {
    draw()
    expect(screen.getByText(/15 brief awakenings/)).toBeInTheDocument()
  })

  it('KEEPS ALL FOUR LANES when tapped — nothing is replaced', () => {
    const { container } = draw()
    const before = container.querySelectorAll('[title]').length
    fireEvent.click(screen.getByText('Deep'))
    for (const label of ['Awake', 'REM', 'Light', 'Deep']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    // The same blocks, still on screen: compiling moves them, it does not redraw.
    expect(container.querySelectorAll('[title]').length).toBe(before)
  })

  it('slides every lane\'s pieces left to pack from zero', () => {
    const { container } = draw()
    const lefts = () => [...container.querySelectorAll('[title]')].map((el) => el.style.left)
    expect(lefts().every((l) => l === '0%')).toBe(false)

    fireEvent.click(screen.getByText('Deep'))

    // Each lane's first block now starts at the left edge.
    const zeroed = lefts().filter((l) => l === '0%')
    expect(zeroed.length).toBe(4)   // one per lane
  })

  it('compiles ALL lanes together, not just the one tapped', () => {
    draw()
    fireEvent.click(screen.getByText('Light'))
    // Every stage with a baseline shows its typical range, not only Light.
    expect(screen.getAllByText(/over 14 nights$/).length).toBe(3)   // DEEP, REM, AWAKE
  })

  it('shows the typical range in real minutes, over the nights it came from', () => {
    draw()
    fireEvent.click(screen.getByText('Deep'))
    expect(screen.getByText(/Typical 41m–1h 18m over 14 nights/)).toBeInTheDocument()
  })

  it('draws no range for a stage with no baseline', () => {
    draw()
    fireEvent.click(screen.getByText('Deep'))
    // LIGHT has no baseline here, so it gets a compiled bar and no bracket —
    // three captions for four lanes.
    expect(screen.getAllByText(/over 14 nights$/).length).toBe(3)
    expect(screen.getAllByText(/^(Awake|REM|Light|Deep)$/).length).toBe(4)
  })

  it('lays the night back out on a second tap', () => {
    draw()
    fireEvent.click(screen.getByText('Deep'))
    expect(screen.getByText(/lay the night back out/i)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Deep'))
    expect(screen.getByText(/compile each stage/i)).toBeInTheDocument()
  })

  it('shows each stage as a percentage of the night', () => {
    draw()
    expect(screen.getByText('58%')).toBeInTheDocument()   // Light, 214 of 372
    expect(screen.getByText('13%')).toBeInTheDocument()   // Deep
  })

  it('says a night with no stage timings has none, rather than drawing an empty axis', () => {
    draw({ segments: null })
    expect(screen.getByText(/recorded without stage timings/i)).toBeInTheDocument()
  })

  it('renders the stated reason when the reading itself is absent', () => {
    draw({ absent: 'Not recorded — band not worn, or not synced yet.' })
    expect(screen.getByText(/band not worn/i)).toBeInTheDocument()
  })
})
