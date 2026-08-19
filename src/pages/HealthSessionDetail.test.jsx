import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import HealthSessionDetail from './HealthSessionDetail'

// RENDER tests. Same rule as the ring screen: arriving from the feed costs no
// Google call, because the session travels with the navigation. Arriving cold it
// fetches once and finds itself by id — and says so plainly when it cannot.

const mockFetchHealth = vi.fn()
vi.mock('../lib/healthClient', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchHealth: (...a) => mockFetchHealth(...a),
}))
vi.mock('../lib/haptic', () => ({ haptic: new Proxy({}, { get: () => () => {} }) }))

const walk = {
  id: 'walk-1', kind: 'exercise', activityType: 'WALKING', name: 'Walk', nap: false,
  start: '2026-08-14T21:20:00Z', end: '2026-08-14T21:35:20Z', durationMinutes: 15,
  calories: 102, averageHeartRate: 112, steps: 1727, distanceKm: 1.2305,
  activeZoneMinutes: 4, paceSecondsPerMeter: 0.75, elevationGainMm: 12000,
  zoneMinutes: { Light: 9, Moderate: 4 },
}
const nap = {
  id: 'nap-1', kind: 'sleep', activityType: 'NAP', name: 'Nap', nap: true,
  start: '2026-08-17T12:13:00Z', end: '2026-08-17T13:02:00Z', durationMinutes: 21,
  calories: null, averageHeartRate: null,
  minutesAsleep: 21, minutesAwake: 28, minutesInSleepPeriod: 49,
  minutesToFallAsleep: 0, efficiency: 21 / 49, sleepType: 'STAGES',
  stages: { LIGHT: 21, AWAKE: 27 },
}

const draw = (session, id = session?.id) => render(
  <MemoryRouter initialEntries={[{ pathname: '/health/session', search: `?id=${id ?? ''}`, state: session ? { session } : null }]}>
    <Routes><Route path="/health/session" element={<HealthSessionDetail />} /></Routes>
  </MemoryRouter>,
)

beforeEach(() => { vi.clearAllMocks(); mockFetchHealth.mockResolvedValue({ sessions: [walk, nap] }) })

describe('HealthSessionDetail', () => {
  it('does NOT fetch when the session arrives in router state', async () => {
    draw(walk)
    await screen.findByText('Walk')
    expect(mockFetchHealth).not.toHaveBeenCalled()
  })

  it('fetches once and finds itself by id when opened cold', async () => {
    draw(null, 'walk-1')
    await waitFor(() => expect(mockFetchHealth).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Walk')).toBeInTheDocument()
  })

  it('says so when the session is not in today\'s readings', async () => {
    draw(null, 'gone')
    expect(await screen.findByText(/isn’t in today’s readings/i)).toBeInTheDocument()
  })

  it('shows everything the API returned for a walk', async () => {
    draw(walk)
    await screen.findByText('Walk')
    expect(screen.getByText('102 kcal')).toBeInTheDocument()
    expect(screen.getByText('112 bpm')).toBeInTheDocument()
    expect(screen.getByText('1.23 km')).toBeInTheDocument()
    expect(screen.getByText('1,727')).toBeInTheDocument()
    expect(screen.getByText('12:30 /km')).toBeInTheDocument()
  })

  it('shows time in heart-rate zones — real data, not a derived peak', async () => {
    draw(walk)
    const card = (await screen.findByText('Time in heart-rate zones')).closest('div').parentElement
    expect(within(card).getByText('Light')).toBeInTheDocument()
    expect(within(card).getByText('9m')).toBeInTheDocument()
    // The API has no peak-bpm field, so nothing claims one.
    expect(screen.queryByText(/peak heart rate/i)).toBeNull()
  })

  it('breaks a nap down like any other sleep, and names it a nap', async () => {
    draw(nap)
    // "Nap" is both the page title and the value of "Counted as".
    await waitFor(() => expect(screen.getAllByText('Nap').length).toBeGreaterThan(1))
    const card = screen.getByText('Counted as').closest('div').parentElement
    expect(within(card).getByText('Nap')).toBeInTheDocument()
    expect(screen.getByText('43%')).toBeInTheDocument()
  })

  it('does not offer calories or heart rate for sleep, which has neither', async () => {
    draw(nap)
    await waitFor(() => expect(screen.getAllByText('Nap').length).toBeGreaterThan(0))
    expect(screen.queryByText('Calories')).toBeNull()
    expect(screen.queryByText('Average heart rate')).toBeNull()
  })
})
