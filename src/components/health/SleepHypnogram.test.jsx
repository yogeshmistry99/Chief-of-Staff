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
  stageBaseline: { DEEP: { mean: 60, nights: 14 }, REM: { mean: 65, nights: 14 }, AWAKE: { mean: 38, nights: 14 } },
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

  it('reports brief awakenings as a count, not as marks', () => {
    draw()
    expect(screen.getByText(/15 brief awakenings/)).toBeInTheDocument()
  })

  it('turns into a comparison when a stage is tapped', () => {
    draw()
    expect(screen.queryByText('Usual for you')).toBeNull()

    fireEvent.click(screen.getByText('Deep'))

    expect(screen.getByText('Last night')).toBeInTheDocument()
    expect(screen.getByText('Usual for you')).toBeInTheDocument()
    expect(screen.getByText('1h 0m')).toBeInTheDocument()          // usual 60m
    expect(screen.getByText(/12m less than your usual, across 14 nights/)).toBeInTheDocument()
  })

  it('goes back to the night', () => {
    draw()
    fireEvent.click(screen.getByText('Deep'))
    fireEvent.click(screen.getByText(/back to the night/i))
    expect(screen.getByText(/tap a stage to compare/i)).toBeInTheDocument()
  })

  it('says when there is no usual to compare against, rather than a bar against nothing', () => {
    draw()
    fireEvent.click(screen.getByText('Light'))   // no LIGHT in the baseline
    expect(screen.getByText(/not enough recent nights/i)).toBeInTheDocument()
    expect(screen.queryByText('Usual for you')).toBeNull()
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
