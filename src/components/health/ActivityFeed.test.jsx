import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ActivityFeed from './ActivityFeed'
import { buildFeed } from '../../../api/_lib/health.js'

// RENDER tests. The feed's failure modes are all visual: a walk shown twice, a
// nap missing, a dash where the API returned nothing, an empty card that says
// nothing. None of those are visible from the pure layer.

vi.mock('../../lib/haptic', () => ({ haptic: new Proxy({}, { get: () => () => {} }) }))

const walkBand = {
  name: 'band', exercise: {
    exerciseType: 'WALKING', displayName: 'Walk',
    interval: { startTime: '2026-08-19T09:20:00Z', endTime: '2026-08-19T09:35:20Z' },
    activeDuration: '920.400s',
    metricsSummary: {
      caloriesKcal: 102, averageHeartRateBeatsPerMinute: '112',
      steps: '1727', distanceMillimeters: 1230500, activeZoneMinutes: '4',
    },
  },
}
const walkPhone = {
  name: 'phone', exercise: {
    exerciseType: 'WALKING', displayName: 'Walk',
    interval: { startTime: '2026-08-19T09:21:00Z', endTime: '2026-08-19T09:36:39Z' },
    activeDuration: '939.212s',
    metricsSummary: { steps: '1738', distanceMillimeters: 1243296 },
  },
}
const napPoint = {
  name: 'nap', sleep: {
    type: 'STAGES', metadata: { nap: true },
    interval: { startTime: '2026-08-19T12:13:00Z', endTime: '2026-08-19T13:02:00Z' },
    summary: {
      minutesAsleep: '21', minutesAwake: '7', minutesInSleepPeriod: '28',
      stagesSummary: [{ stage: 'LIGHT', totalMinutes: '21' }, { stage: 'AWAKE', totalMinutes: '7' }],
    },
  },
}

const feed = () => buildFeed({ dataPoints: [napPoint] }, { dataPoints: [walkBand, walkPhone] })

describe('ActivityFeed', () => {
  it('renders one row per real session — the duplicated walk appears once', () => {
    render(<MemoryRouter><ActivityFeed sessions={feed()} /></MemoryRouter>)
    expect(screen.getAllByText('Walk')).toHaveLength(1)
  })

  it('shows a nap as an ordinary row', () => {
    render(<MemoryRouter><ActivityFeed sessions={feed()} /></MemoryRouter>)
    expect(screen.getByText('Nap')).toBeInTheDocument()
  })

  it('puts duration, calories and average HR on the row where they exist', () => {
    render(<MemoryRouter><ActivityFeed sessions={feed()} /></MemoryRouter>)
    expect(screen.getByText(/15m · 102 kcal · 112 bpm avg/)).toBeInTheDocument()
  })

  it('omits calories and HR for sleep rather than showing a dash or a zero', () => {
    render(<MemoryRouter><ActivityFeed sessions={feed()} /></MemoryRouter>)
    const nap = screen.getByText('Nap').closest('div')
    expect(nap.textContent).not.toMatch(/kcal|bpm|—|\b0\b/)
  })

  it('keeps distance, steps and zone minutes behind a tap', () => {
    render(<MemoryRouter><ActivityFeed sessions={feed()} /></MemoryRouter>)
    expect(screen.queryByText('Distance')).toBeNull()

    fireEvent.click(screen.getByText('Walk'))

    expect(screen.getByText('Distance')).toBeInTheDocument()
    expect(screen.getByText('1.23 km')).toBeInTheDocument()
    expect(screen.getByText('Active zone minutes')).toBeInTheDocument()
  })

  it('collapses again on a second tap', () => {
    render(<MemoryRouter><ActivityFeed sessions={feed()} /></MemoryRouter>)
    fireEvent.click(screen.getByText('Walk'))
    expect(screen.getByText('Distance')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Walk'))
    expect(screen.queryByText('Distance')).toBeNull()
  })

  it('offers a way to the full session screen from inside the drop-down', () => {
    // The row tap stays the drop-down. Going deeper is its own control, so one
    // target never has two outcomes.
    render(<MemoryRouter><ActivityFeed sessions={feed()} /></MemoryRouter>)
    expect(screen.queryByText(/full detail/i)).toBeNull()
    fireEvent.click(screen.getByText('Walk'))
    expect(screen.getByText(/full detail/i)).toBeInTheDocument()
  })

  it('summarises the sleep stages in the drop-down, without the full split', () => {
    // The shape of the night, in one line, without leaving the feed. AWAKE is
    // left out — it is the absence of sleep and has its own row.
    render(<MemoryRouter><ActivityFeed sessions={feed()} /></MemoryRouter>)
    fireEvent.click(screen.getByText('Nap'))
    expect(screen.getByText('Stages')).toBeInTheDocument()
    expect(screen.getByText(/Light 21m/)).toBeInTheDocument()
    expect(screen.queryByText(/Awake 7m/)).toBeNull()
  })

  it('says an empty day is empty', () => {
    render(<MemoryRouter><ActivityFeed sessions={[]} /></MemoryRouter>)
    expect(screen.getByText(/no sessions recorded today/i)).toBeInTheDocument()
  })

  it('says so for a missing feed too, rather than rendering nothing', () => {
    render(<MemoryRouter><ActivityFeed sessions={null} /></MemoryRouter>)
    expect(screen.getByText(/no sessions recorded today/i)).toBeInTheDocument()
  })
})
